
'use server';

import { getAdminDb } from "@/lib/firebase-admin-init";
import { logAdminAction } from "@/lib/logging";

export interface TrackingSettingsData {
    googleAdsId?: string;
    metaPixelId?: string;
    metaConversionApiToken?: string;
    googleDeveloperToken?: string;
    googleAdsCustomerId?: string;
    googleAdsLoginCustomerId?: string;
}


export async function getTrackingSettings(): Promise<{ success: boolean; data?: TrackingSettingsData; error?: string }> {
    try {
        const adminDb = getAdminDb();
        const settingsRef = adminDb.collection('settings').doc('tracking');
        const doc = await settingsRef.get();
        if (!doc.exists) {
            // Return default empty values if no settings are found
            return { success: true, data: {} };
        }
        return { success: true, data: doc.data() as TrackingSettingsData };
    } catch (error: any) {
        console.error("Error fetching tracking settings: ", error);
        return { success: false, error: "Falha ao buscar configurações de rastreamento. Tente novamente." };
    }
}

export async function saveTrackingSettings(data: TrackingSettingsData, adminId: string): Promise<{ success: boolean; error?: string }> {
    try {
        const adminDb = getAdminDb();
        const settingsRef = adminDb.collection('settings').doc('tracking');
        await settingsRef.set(data, { merge: true });
        await logAdminAction(adminId, adminId, 'SAVE_TRACKING_SETTINGS', { pixelId: data.metaPixelId, adsId: data.googleAdsId }, 'SUCCESS');
        return { success: true };
    } catch (error: any) {
        console.error("Error saving tracking settings: ", error);
        await logAdminAction(adminId, adminId, 'SAVE_TRACKING_SETTINGS_FAIL', { error: error.message, stack: error.stack }, 'ERROR');
        return { success: false, error: "Falha ao salvar as configurações de rastreamento. Tente novamente." };
    }
}
