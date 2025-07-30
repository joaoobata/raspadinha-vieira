
'use server';

import { getAdminDb } from "@/lib/firebase-admin-init";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { createTransfer } from "@/lib/cnpay";
import { normalizeString } from '@/lib/utils';
import axios from 'axios';
import https from 'https';

// Helper function to get the server's public IPv4 address reliably.
async function getPublicIPv4(): Promise<string> {
    try {
        // Use a service that specifically returns IPv4 addresses.
        const response = await axios.get('https://api4.ipify.org?format=json', {
            // Force the request to use the IPv4 stack.
            httpsAgent: new https.Agent({ family: 4 }),
        });
        if (response.data && response.data.ip) {
            return response.data.ip;
        }
        throw new Error("Resposta inválida da API de IP.");
    } catch (error) {
        console.error("Falha ao obter o IP público IPv4:", error);
        throw new Error("Não foi possível determinar o endereço IP do servidor. O saque não pode continuar.");
    }
}


async function createLedgerEntry(
    transaction: FirebaseFirestore.Transaction,
    userId: string,
    type: 'WITHDRAWAL_REFUND',
    amount: number,
    description: string,
    refId: string
) {
    const adminDb = getAdminDb();
    const userRef = adminDb.collection('users').doc(userId);
    const userDoc = await transaction.get(userRef);
    if (!userDoc.exists) throw new Error(`User ${userId} not found for ledger entry.`);

    const userData = userDoc.data()!;
    const balanceBefore = userData.balance || 0;
    const balanceAfter = balanceBefore + amount;

    const ledgerRef = adminDb.collection('user_ledger').doc();
    transaction.set(ledgerRef, {
        userId,
        type,
        amount,
        description,
        balanceBefore,
        balanceAfter,
        refId,
        createdAt: FieldValue.serverTimestamp(),
    });
    
    transaction.update(userRef, { balance: balanceAfter });
}


// Helper function to safely convert a Timestamp to an ISO string
const toISOStringOrNull = (timestamp: Timestamp | undefined): string | null => {
    try {
        return timestamp ? timestamp.toDate().toISOString() : null;
    } catch (error) {
        return null;
    }
}

export async function getWithdrawals(): Promise<{ success: boolean; data?: any[]; error?: string }> {
    try {
        const adminDb = getAdminDb();
        // Fetch both withdrawals and users in parallel
        const [withdrawalsSnapshot, usersSnapshot] = await Promise.all([
            adminDb.collection("withdrawals").orderBy("createdAt", "desc").get(),
            adminDb.collection("users").get()
        ]);

        if (withdrawalsSnapshot.empty) {
            return { success: true, data: [] };
        }

        // Create a map of user IDs to their names for efficient lookup
        const userNamesMap = new Map<string, string>();
        usersSnapshot.docs.forEach(doc => {
            const data = doc.data();
            const name = `${data.firstName} ${data.lastName}`.trim() || data.email;
            userNamesMap.set(doc.id, name);
        });

        const withdrawals = withdrawalsSnapshot.docs.map(doc => {
            const data = doc.data();
            const userName = userNamesMap.get(data.userId) || data.userId; // Fallback to ID if name not found
            
            return {
                id: doc.id,
                ...data,
                userName, // Add user name to the withdrawal object
                createdAt: toISOStringOrNull(data.createdAt),
                updatedAt: toISOStringOrNull(data.updatedAt),
                completedAt: toISOStringOrNull(data.completedAt),
            }
        });

        return { success: true, data: withdrawals };

    } catch (error: any) {
        console.error("Error fetching withdrawals: ", error);
        return { success: false, error: "Falha ao buscar saques no banco de dados." };
    }
}

export async function processWithdrawal(
    withdrawalId: string,
    action: 'approve' | 'reject'
): Promise<{ success: boolean; error?: string }> {
    const adminDb = getAdminDb();
    const withdrawalRef = adminDb.collection('withdrawals').doc(withdrawalId);
    
    try {
        if (action === 'reject') {
            return await adminDb.runTransaction(async (transaction) => {
                const withdrawalDoc = await transaction.get(withdrawalRef);
                if (!withdrawalDoc.exists || withdrawalDoc.data()?.status !== 'PENDING') {
                    throw new Error("Saque não encontrado ou já processado.");
                }
                const withdrawalData = withdrawalDoc.data()!;
                
                // Create ledger entry for the refund, which also updates the balance
                await createLedgerEntry(
                    transaction,
                    withdrawalData.userId,
                    'WITHDRAWAL_REFUND',
                    withdrawalData.amount,
                    `Saque rejeitado pelo admin.`,
                    withdrawalId
                );
                
                // Mark the withdrawal as REJECTED
                transaction.update(withdrawalRef, { status: 'REJECTED', updatedAt: FieldValue.serverTimestamp() });
                
                return { success: true };
            });
        }
        
        // --- Approval Logic ---
        const withdrawalDoc = await withdrawalRef.get();
        if (!withdrawalDoc.exists || withdrawalDoc.data()?.status !== 'PENDING') {
            throw new Error("Saque não encontrado ou já processado.");
        }
        const withdrawalData = withdrawalDoc.data()!;

        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
        if (!baseUrl) {
            throw new Error('A URL base do webhook não está configurada no ambiente do servidor.');
        }
        const webhookUrl = new URL('/api/cnpay/withdrawal-webhook', baseUrl).toString();
        
        // Get the server's public IPv4 to send in the payload.
        const serverIp = await getPublicIPv4();
        
        const transferPayload = {
            identifier: withdrawalData.identifier, 
            amount: withdrawalData.amount,
            discountFeeOfReceiver: true,
            pix: {
                type: withdrawalData.pixKeyType,
                key: withdrawalData.pixKey,
            },
            owner: {
                name: withdrawalData.ownerData.name,
                document: withdrawalData.ownerData.document,
                ip: serverIp, // CRITICAL FIX: Use the server's public IPv4 address.
            },
            callbackUrl: webhookUrl,
        };

        console.log("Enviando saque para o gateway com payload:", JSON.stringify(transferPayload, null, 2));
        const cnpayResponse = await createTransfer(transferPayload);
        console.log("Resposta recebida da CNPay para criação de saque:", JSON.stringify(cnpayResponse, null, 2));

        if (cnpayResponse.status === 'OK' || cnpayResponse.withdraw) {
            await withdrawalRef.update({
                status: 'APPROVED', // "Approved" means sent to gateway
                cnpayWithdrawalId: cnpayResponse.withdraw.id,
                updatedAt: FieldValue.serverTimestamp(),
            });
            return { success: true };
        } else {
            const errorMessage = cnpayResponse.errorDescription || cnpayResponse.message || 'Erro desconhecido da CN Pay';
            console.error("CN Pay error response:", cnpayResponse);
            
            await adminDb.collection('webhook_errors').add({
                type: 'withdrawal_gateway_error',
                error: errorMessage,
                webhookData: { 
                    withdrawalId,
                    userId: withdrawalData.userId,
                    amount: withdrawalData.amount,
                    payloadSent: transferPayload,
                    gatewayResponse: cnpayResponse
                },
                createdAt: FieldValue.serverTimestamp(),
                resolved: false,
            });

             await adminDb.runTransaction(async (transaction) => {
                await createLedgerEntry(
                    transaction,
                    withdrawalData.userId,
                    'WITHDRAWAL_REFUND',
                    withdrawalData.amount,
                    `Falha no gateway de pagamento.`,
                    withdrawalId
                );
                transaction.update(withdrawalRef, { status: 'FAILED', error: errorMessage, updatedAt: FieldValue.serverTimestamp() });
            });
            throw new Error(`Falha ao criar transferência: ${errorMessage}`);
        }

    } catch (error: any) {
        console.error(`Error processing withdrawal ${withdrawalId}:`, error);
        return { success: false, error: error.message || 'Falha ao processar o saque.' };
    }
}
