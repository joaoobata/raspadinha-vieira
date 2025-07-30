
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

export async function getErrorLogs(): Promise<{ success: boolean; data?: any[]; error?: string }> {
    try {
        const adminDb = getAdminDb();
        const logsRef = adminDb.collection("webhook_errors");
        // Order by most recent
        const snapshot = await logsRef.orderBy("createdAt", "desc").limit(50).get();

        if (snapshot.empty) {
            return { success: true, data: [] };
        }

        const logs = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                // Convert Timestamps to ISO strings right here on the server
                createdAt: toISOStringOrNull(data.createdAt),
            }
        });

        return { success: true, data: logs };

    } catch (error: any) {
        console.error("Error fetching error logs: ", error);
        return { success: false, error: "Falha ao buscar logs de erro no banco de dados." };
    }
}
