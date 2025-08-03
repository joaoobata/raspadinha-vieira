
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

export async function getTransactions(): Promise<{ success: boolean; data?: any[]; error?: string }> {
    try {
        const adminDb = getAdminDb();
        const transactionsSnapshot = await adminDb.collection("transactions").orderBy("createdAt", "desc").get();
        
        if (transactionsSnapshot.empty) {
            return { success: true, data: [] };
        }
        
        const userIds = [...new Set(transactionsSnapshot.docs.map(doc => doc.data().userId))];
        const userNamesMap = await fetchUsersInBatches(adminDb, userIds);

        const transactions = transactionsSnapshot.docs.map(doc => {
            const data = doc.data();
            const userName = userNamesMap.get(data.userId) || data.userId; // Fallback to ID if name not found

            return {
                id: doc.id,
                ...data,
                userName, // Add user name to the transaction object
                createdAt: toISOStringOrNull(data.createdAt),
                paidAt: toISOStringOrNull(data.paidAt),
            }
        });

        return { success: true, data: transactions };

    } catch (error: any) {
        console.error("Error fetching transactions: ", error);
        return { success: false, error: "Falha ao buscar transações no banco de dados." };
    }
}
