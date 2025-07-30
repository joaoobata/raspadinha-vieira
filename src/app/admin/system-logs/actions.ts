
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

export interface SystemLog {
    id: string;
    timestamp: string | null;
    actorId: string;
    actorType: 'user' | 'system' | 'unauthenticated';
    action: string;
    details: object;
    status: 'SUCCESS' | 'ERROR' | 'INFO';
}

export async function getSystemLogs(): Promise<{ success: boolean; data?: SystemLog[]; error?: string }> {
    try {
        const adminDb = getAdminDb();
        const logsRef = adminDb.collection("system_logs");
        // Order by most recent and limit to the last 200 logs to avoid performance issues
        const snapshot = await logsRef.orderBy("timestamp", "desc").limit(200).get();

        if (snapshot.empty) {
            return { success: true, data: [] };
        }

        const logs = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                timestamp: toISOStringOrNull(data.timestamp),
            } as SystemLog;
        });

        return { success: true, data: logs };

    } catch (error: any) {
        console.error("Error fetching system logs: ", error);
        return { success: false, error: "Falha ao buscar logs do sistema." };
    }
}
