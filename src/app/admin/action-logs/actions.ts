
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

export interface AdminLog {
    id: string;
    timestamp: string | null;
    adminId: string;
    targetUserId: string;
    action: string;
    details: object;
    status: 'SUCCESS' | 'ERROR' | 'INFO';
}

export async function getAdminLogs(): Promise<{ success: boolean; data?: AdminLog[]; error?: string }> {
    try {
        const adminDb = getAdminDb();
        const logsRef = adminDb.collection("admin_logs");
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
            } as AdminLog;
        });

        return { success: true, data: logs };

    } catch (error: any) {
        console.error("Error fetching admin logs: ", error);
        return { success: false, error: "Falha ao buscar logs de ações administrativas." };
    }
}

    
