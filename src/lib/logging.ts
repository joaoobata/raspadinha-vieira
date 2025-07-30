
'use server';

import { getAdminDb } from "@/lib/firebase-admin-init";
import { FieldValue } from "firebase-admin/firestore";

export async function logAdminAction(
    adminId: string,
    targetUserId: string,
    action: string,
    details: object,
    status: 'SUCCESS' | 'ERROR' | 'INFO' = 'INFO'
) {
    try {
        const adminDb = getAdminDb();
        await adminDb.collection('admin_logs').add({
            timestamp: FieldValue.serverTimestamp(),
            adminId,
            targetUserId,
            action,
            details,
            status,
        });
    } catch (logError) {
        console.error("Failed to write admin log:", logError);
    }
}

export interface SystemLog {
    id: string;
    timestamp: string | null;
    actorId: string | null;
    actorType: 'user' | 'system' | 'unauthenticated';
    action: string;
    details: object;
    status: 'SUCCESS' | 'ERROR' | 'INFO';
}

export async function logSystemEvent(
    actorId: string | null, // Can be null for system events or pre-auth events
    actorType: 'user' | 'system' | 'unauthenticated',
    action: string,
    details: object,
    status: 'SUCCESS' | 'ERROR' | 'INFO' = 'INFO'
) {
    try {
        const adminDb = getAdminDb();
        await adminDb.collection('system_logs').add({
            timestamp: FieldValue.serverTimestamp(),
            actorId,
            actorType,
            action,
            details,
            status,
        });
    } catch (logError) {
        console.error("Failed to write system log:", logError);
    }
}
