
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
    status: 'PENDING' | 'APPROVED' | 'COMPLETED' | 'REJECTED' | 'FAILED';
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
