
'use server';

import { getAdminDb } from "@/lib/firebase-admin-init";
import { Timestamp } from "firebase-admin/firestore";

// Helper function to safely convert a Timestamp to an ISO string
const toISOStringOrNull = (timestamp: Timestamp | undefined): string | null => {
    try {
        return timestamp ? timestamp.toDate().toISOString() : null;
    } catch (error) {
        return null;
    }
}

export async function getTransactions(): Promise<{ success: boolean; data?: any[]; error?: string }> {
    try {
        const adminDb = getAdminDb();
        // Fetch both transactions and users in parallel
        const [transactionsSnapshot, usersSnapshot] = await Promise.all([
            adminDb.collection("transactions").get(),
            adminDb.collection("users").get()
        ]);

        if (transactionsSnapshot.empty) {
            return { success: true, data: [] };
        }

        // Create a map of user IDs to their names for efficient lookup
        const userNamesMap = new Map<string, string>();
        usersSnapshot.docs.forEach(doc => {
            const data = doc.data();
            const name = `${data.firstName} ${data.lastName}`.trim() || data.email;
            userNamesMap.set(doc.id, name);
        });

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
        
        // Sort manually to avoid Firestore index issues
        transactions.sort((a, b) => {
            if (a.createdAt && b.createdAt) {
                return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
            }
            return 0;
        });


        return { success: true, data: transactions };

    } catch (error: any) {
        console.error("Error fetching transactions: ", error);
        return { success: false, error: "Falha ao buscar transações no banco de dados." };
    }
}
