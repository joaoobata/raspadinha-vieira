
'use server';

import { getAdminDb } from "@/lib/firebase-admin-init";
import { FieldPath, Timestamp } from "firebase-admin/firestore";

// Helper function to safely convert a Timestamp to an ISO string
const toISOStringOrNull = (timestamp: Timestamp | undefined): string | null => {
    try {
        return timestamp ? timestamp.toDate().toISOString() : null;
    } catch (error) {
        return null;
    }
}

export interface CommissionLog {
    id: string;
    affiliateId: string;
    affiliateName: string;
    referredUserId: string;
    referredUserName: string;
    level: 1 | 2 | 3;
    depositAmount: number; // Base amount for calculation
    commissionRate: number;
    commissionEarned: number;
    transactionId: string; // The ID of the deposit transaction
    createdAt: string | null;
}


async function fetchUsersInBatches(adminDb: FirebaseFirestore.Firestore, userIds: string[]): Promise<Map<string, string>> {
    const userNamesMap = new Map<string, string>();
    if (userIds.length === 0) {
        return userNamesMap;
    }

    // Firestore 'in' query supports a maximum of 30 elements in the array.
    const batchSize = 30;
    for (let i = 0; i < userIds.length; i += batchSize) {
        const batchIds = userIds.slice(i, i + batchSize);
        if (batchIds.length > 0) {
            const usersSnapshot = await adminDb.collection("users").where(FieldPath.documentId(), 'in', batchIds).get();
            usersSnapshot.docs.forEach(doc => {
                const data = doc.data();
                const name = `${data.firstName} ${data.lastName}`.trim() || data.email || 'Usuário Desconhecido';
                userNamesMap.set(doc.id, name);
            });
        }
    }
    return userNamesMap;
}

export async function getCommissionLogs(): Promise<{ success: boolean; data?: CommissionLog[]; error?: string }> {
    try {
        const adminDb = getAdminDb();
        const commissionsSnapshot = await adminDb.collection("commissions").orderBy("createdAt", "desc").limit(500).get();
        
        if (commissionsSnapshot.empty) {
            return { success: true, data: [] };
        }
        
        const userIdsSet = new Set<string>();
        commissionsSnapshot.docs.forEach(doc => {
            const data = doc.data();
            userIdsSet.add(data.affiliateId);
            userIdsSet.add(data.referredUserId);
        });

        const userIds = Array.from(userIdsSet);
        const userNamesMap = await fetchUsersInBatches(adminDb, userIds);

        const commissionLogs = commissionsSnapshot.docs.map(doc => {
            const data = doc.data();
            const affiliateName = userNamesMap.get(data.affiliateId) || 'Afiliado não encontrado';
            const referredUserName = userNamesMap.get(data.referredUserId) || 'Indicado não encontrado';

            return {
                id: doc.id,
                affiliateId: data.affiliateId,
                affiliateName,
                referredUserId: data.referredUserId,
                referredUserName,
                level: data.level,
                depositAmount: data.depositAmount, 
                commissionRate: data.commissionRate,
                commissionEarned: data.commissionEarned,
                transactionId: data.transactionId,
                createdAt: toISOStringOrNull(data.createdAt),
            } as CommissionLog;
        });

        return { success: true, data: commissionLogs };

    } catch (error: any) {
        console.error("Error fetching commission logs: ", error);
        return { success: false, error: "Falha ao buscar logs de comissão no banco de dados." };
    }
}
