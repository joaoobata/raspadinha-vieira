
'use server';

import { getAdminDb } from "@/lib/firebase-admin-init";
import { Timestamp, FieldValue } from "firebase-admin/firestore";

// Helper function to safely convert a Timestamp to an ISO string
const toISOStringOrNull = (timestamp: Timestamp | undefined): string | null => {
    try {
        return timestamp ? timestamp.toDate().toISOString() : null;
    } catch (error) {
        return null;
    }
}

export interface CommissionDebugLog {
    id: string;
    transactionId: string;
    level: number;
    status: string;
    details: any;
    createdAt: string | null;
}

export async function getCommissionDebugLogs(): Promise<{ success: boolean; data?: CommissionDebugLog[]; error?: string }> {
    try {
        const adminDb = getAdminDb();
        const logsRef = adminDb.collection("commission_debug_logs");
        // Order by most recent and limit to the last 200 logs
        const snapshot = await logsRef.orderBy("createdAt", "desc").limit(200).get();

        if (snapshot.empty) {
            return { success: true, data: [] };
        }

        const logs = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                createdAt: toISOStringOrNull(data.createdAt),
            } as CommissionDebugLog;
        });

        return { success: true, data: logs };

    } catch (error: any) {
        console.error("Error fetching commission debug logs: ", error);
        return { success: false, error: "Falha ao buscar logs de depuração de comissão." };
    }
}
