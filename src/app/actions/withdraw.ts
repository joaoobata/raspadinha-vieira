
'use server';

import { getAdminDb } from "@/lib/firebase-admin-init";
import { FieldValue } from 'firebase-admin/firestore';
import { headers } from 'next/headers';
import { normalizeString } from '@/lib/utils';
import { logSystemEvent } from "@/lib/logging";

async function createLedgerEntry(
    transaction: FirebaseFirestore.Transaction,
    userId: string,
    type: 'WITHDRAWAL_REQUEST',
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
    const balanceAfter = balanceBefore + amount; // amount is negative for withdrawal request

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


interface CreateWithdrawalInput {
    amount: number;
    pixKeyType: 'cpf' | 'cnpj' | 'phone' | 'email';
    pixKey: string;
    userId: string;
}

function validatePixKey(type: CreateWithdrawalInput['pixKeyType'], key: string): { valid: boolean; error?: string } {
    const cleanKey = key.replace(/\D/g, '');
    switch (type) {
        case 'cpf':
            if (!/^\d{11}$/.test(cleanKey)) return { valid: false, error: 'A chave PIX para o tipo CPF deve conter 11 dígitos numéricos.' };
            break;
        case 'cnpj':
             if (!/^\d{14}$/.test(cleanKey)) return { valid: false, error: 'A chave PIX para o tipo CNPJ deve conter 14 dígitos numéricos.' };
            break;
        case 'email':
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(key)) return { valid: false, error: 'O formato da chave PIX para o tipo E-mail é inválido.' };
            break;
        case 'phone':
             if (!/^\d{10,11}$/.test(cleanKey)) return { valid: false, error: 'A chave PIX para o tipo Telefone deve conter 10 ou 11 dígitos numéricos.' };
            break;
        default:
            return { valid: false, error: 'Tipo de chave PIX desconhecido.' };
    }
    return { valid: true };
}


export async function createWithdrawal(input: CreateWithdrawalInput): Promise<{ success: boolean; data?: any; error?: string }> {
    const { amount, pixKeyType, pixKey, userId } = input;
    
    if (!userId) {
        return { success: false, error: 'Usuário não autenticado.' };
    }
    
    // --- PIX Key Validation ---
    const pixValidation = validatePixKey(pixKeyType, pixKey);
    if (!pixValidation.valid) {
        return { success: false, error: pixValidation.error };
    }
    
    const adminDb = getAdminDb();
    const userRef = adminDb.collection('users').doc(userId);
    const withdrawalRef = adminDb.collection('withdrawals').doc();
    const withdrawalIdentifier = withdrawalRef.id;


    try {
        const settingsDoc = await adminDb.collection('settings').doc('general').get();
        const minWithdrawal = settingsDoc.data()?.minWithdrawal ?? 30;

        if (amount < minWithdrawal) {
             return { success: false, error: `O valor mínimo para saque é de ${minWithdrawal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}.` };
        }
        
        // Pre-transaction check for user data
        const userDocPre = await userRef.get();
        if (!userDocPre.exists) {
            throw new Error('Usuário não encontrado.');
        }
        const userDataPre = userDocPre.data()!;
        if (!userDataPre.cpf) {
             return { success: false, error: 'CPF não encontrado no seu cadastro. Por favor, atualize seus dados antes de solicitar um saque.' };
        }


        await adminDb.runTransaction(async (transaction) => {
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists) {
                throw new Error('Usuário não encontrado.');
            }

            const userData = userDoc.data()!;
            const currentBalance = userData.balance || 0;

            if (currentBalance < amount) {
                throw new Error('Saldo insuficiente para realizar este saque.');
            }

            // Create ledger entry for the withdrawal request, which also debits the balance
            await createLedgerEntry(
                transaction,
                userId,
                'WITHDRAWAL_REQUEST',
                -amount, // The amount is a debit
                `Solicitação de saque para a chave PIX: ${pixKey}`,
                withdrawalIdentifier
            );

            // This is the IP of the user making the request, which is correct to store for auditing.
            // The server IP for the gateway call is handled in the admin action.
            const userIp = headers().get('x-forwarded-for')?.split(',')[0] || '127.0.0.1';
            
            transaction.set(withdrawalRef, {
                userId: userId,
                id: withdrawalIdentifier,
                amount,
                pixKey,
                pixKeyType,
                status: 'PENDING',
                createdAt: FieldValue.serverTimestamp(),
                identifier: withdrawalIdentifier,
                ownerData: {
                     name: normalizeString(`${userData.firstName} ${userData.lastName}`),
                     document: {
                        type: 'cpf',
                        number: userData.cpf.replace(/\D/g, ''),
                    },
                    ip: userIp,
                }
            });
        });
        
        await logSystemEvent(userId, 'user', 'CREATE_WITHDRAWAL_SUCCESS', { withdrawalId: withdrawalIdentifier, amount }, 'SUCCESS');
        return { success: true };

    } catch (error: any) {
        console.error("Error creating withdrawal request: ", error);
        await logSystemEvent(userId, 'user', 'CREATE_WITHDRAWAL_FAIL', { reason: error.message, error, stack: error.stack }, 'ERROR');
        return { success: false, error: error.message || 'Ocorreu um erro no servidor ao processar o saque.' };
    }
}
