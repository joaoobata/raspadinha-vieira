
'use server';

import { getAdminDb } from "@/lib/firebase-admin-init";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { logSystemEvent } from "@/lib/logging";

// Helper function to safely convert a Timestamp to an ISO string
const toISOStringOrNull = (timestamp: Timestamp | undefined): string | null => {
    try {
        return timestamp ? timestamp.toDate().toISOString() : null;
    } catch (error) {
        return null;
    }
}


export interface WithdrawalHistoryEntry {
    id: string;
    amount: number;
    status: 'PENDING' | 'APPROVED' | 'COMPLETED' | 'REJECTED' | 'FAILED' | 'CANCELLED';
    pixKey: string;
    createdAt: string | null;
}


export async function getWithdrawalHistory(userId: string): Promise<{ success: boolean; data?: WithdrawalHistoryEntry[]; error?: string }> {
    if (!userId) {
        return { success: false, error: "Usuário não autenticado." };
    }
    try {
        const adminDb = getAdminDb();
        const snapshot = await adminDb.collection('withdrawals')
            .where('userId', '==', userId)
            .limit(20)
            .get();
        
        if (snapshot.empty) {
            return { success: true, data: [] };
        }
        
        const history = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                amount: data.amount,
                status: data.status,
                pixKey: data.pixKey,
                createdAt: toISOStringOrNull(data.createdAt),
            } as WithdrawalHistoryEntry;
        }).sort((a, b) => {
            // Sort manually since we removed orderBy
            if (a.createdAt && b.createdAt) {
                return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
            }
            return 0;
        });

        return { success: true, data: history };

    } catch (error: any) {
        console.error("Error fetching withdrawal history: ", error);
        await logSystemEvent(userId, 'user', 'GET_WITHDRAWAL_HISTORY_FAIL', { error: error.message, stack: error.stack }, 'ERROR');
        return { success: false, error: "Falha ao buscar histórico de saques. Tente novamente mais tarde." };
    }
}


export async function cancelWithdrawal(withdrawalId: string, userId: string): Promise<{ success: boolean; error?: string }> {
    if (!userId || !withdrawalId) {
        return { success: false, error: "Dados insuficientes para cancelar o saque." };
    }

    const adminDb = getAdminDb();
    const withdrawalRef = adminDb.collection('withdrawals').doc(withdrawalId);
    const userRef = adminDb.collection('users').doc(userId);

    try {
        await adminDb.runTransaction(async (transaction) => {
            const withdrawalDoc = await transaction.get(withdrawalRef);
            if (!withdrawalDoc.exists) {
                throw new Error("Solicitação de saque não encontrada.");
            }

            const withdrawalData = withdrawalDoc.data()!;
            if (withdrawalData.userId !== userId) {
                throw new Error("Você não tem permissão para cancelar este saque.");
            }
            if (withdrawalData.status !== 'PENDING') {
                throw new Error("Este saque não pode mais ser cancelado.");
            }

            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists) {
                throw new Error("Usuário não encontrado.");
            }
            const userData = userDoc.data()!;
            const balanceBefore = userData.balance || 0;
            const refundAmount = withdrawalData.amount;
            const balanceAfter = balanceBefore + refundAmount;
            
            // Create ledger entry for the refund
            const ledgerRef = adminDb.collection('user_ledger').doc();
            transaction.set(ledgerRef, {
                userId,
                type: 'WITHDRAWAL_REFUND',
                amount: refundAmount,
                description: `Saque cancelado pelo usuário.`,
                balanceBefore,
                balanceAfter,
                refId: withdrawalId,
                createdAt: FieldValue.serverTimestamp(),
            });
            
            // Update user balance
            transaction.update(userRef, { balance: balanceAfter });

            // Update withdrawal status to CANCELLED
            transaction.update(withdrawalRef, { status: 'CANCELLED', updatedAt: FieldValue.serverTimestamp() });
        });

        await logSystemEvent(userId, 'user', 'CANCEL_WITHDRAWAL_SUCCESS', { withdrawalId }, 'SUCCESS');
        return { success: true };

    } catch (error: any) {
        console.error("Error cancelling withdrawal: ", error);
        await logSystemEvent(userId, 'user', 'CANCEL_WITHDRAWAL_FAIL', { withdrawalId, error: error.message, stack: error.stack }, 'ERROR');
        return { success: false, error: error.message || "Falha ao cancelar o saque." };
    }
}
