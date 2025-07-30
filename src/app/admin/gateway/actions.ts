
'use server';

import { getAdminDb } from "@/lib/firebase-admin-init";
import { logAdminAction } from "@/lib/logging";

export interface GatewaySettings {
    publicKey?: string;
    secretKey?: string;
    allowedIps?: string[];
}

async function verifyAdmin(adminId: string): Promise<void> {
    if (!adminId) {
        throw new Error("Admin não autenticado.");
    }
    const adminDb = getAdminDb();
    const adminUserDoc = await adminDb.collection('users').doc(adminId).get();
    if (!adminUserDoc.exists || adminUserDoc.data()?.role !== 'admin') {
        throw new Error("Acesso negado. Apenas administradores podem realizar esta ação.");
    }
}

export async function getGatewaySettings(adminId: string): Promise<{ success: boolean; data?: GatewaySettings; error?: string }> {
    try {
        await verifyAdmin(adminId);
        
        const adminDb = getAdminDb();
        const gatewayConfigDoc = await adminDb.collection("settings").doc("gateway").get();
        
        if (gatewayConfigDoc.exists) {
            return { success: true, data: gatewayConfigDoc.data() as GatewaySettings };
        }
        
        return { success: true, data: {} };
        
    } catch (error: any) {
        console.error("Error fetching gateway settings: ", error);
        return { success: false, error: error.message };
    }
}

export async function saveGatewaySettings(settings: GatewaySettings, adminId: string): Promise<{ success: boolean; error?: string }> {
     try {
        await verifyAdmin(adminId);

        const adminDb = getAdminDb();
        await adminDb.collection("settings").doc("gateway").set({
            publicKey: settings.publicKey || '',
            secretKey: settings.secretKey || '',
            allowedIps: settings.allowedIps || [],
        }, { merge: true });

        await logAdminAction(adminId, adminId, 'UPDATE_GATEWAY_SETTINGS', { status: 'SUCCESS' }, 'SUCCESS');
        return { success: true };
    } catch (error: any) {
        console.error("Error saving gateway settings: ", error);
        await logAdminAction(adminId, adminId, 'UPDATE_GATEWAY_SETTINGS', { status: 'ERROR', message: error.message }, 'ERROR');
        return { success: false, error: "Não foi possível salvar as configurações do gateway." };
    }
}
