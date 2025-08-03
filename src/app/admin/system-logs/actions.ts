
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

// Helper function to recursively convert any Timestamps inside an object
const convertTimestamps = (obj: any): any => {
    if (obj instanceof Timestamp) {
        return obj.toDate().toISOString();
    }
    if (Array.isArray(obj)) {
        return obj.map(convertTimestamps);
    }
    if (obj !== null && typeof obj === 'object') {
        const newObj: { [key: string]: any } = {};
        for (const key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                newObj[key] = convertTimestamps(obj[key]);
            }
        }
        return newObj;
    }
    return obj;
};

export interface SystemLog {
    id: string;
    timestamp: string | null;
    actorId: string | null; // Corrected to allow null
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
            // Manually construct the object to ensure no complex types are spread.
            // Convert any nested Timestamps in the 'details' object.
            return {
                id: doc.id,
                timestamp: toISOStringOrNull(data.timestamp),
                actorId: data.actorId || null,
                actorType: data.actorType,
                action: data.action,
                details: convertTimestamps(data.details),
                status: data.status,
            } as SystemLog;
        });

        return { success: true, data: logs };

    } catch (error: any) {
        console.error("Error fetching system logs: ", error);
        return { success: false, error: "Falha ao buscar logs do sistema." };
    }
}
