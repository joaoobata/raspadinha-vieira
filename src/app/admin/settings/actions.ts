
'use server';

import { getAdminDb, getAdminStorage } from "@/lib/firebase-admin-init";
import { cache } from 'react';
import { logAdminAction } from "@/lib/logging";
import { FieldValue } from "firebase-admin/firestore";

export interface SettingsData {
    siteName?: string;
    logoUrl?: string;
    minDeposit?: number;
    minWithdrawal?: number;
    commissionRateL1?: number; // Added L1 commission rate
    commissionRateL2?: number;
    commissionRateL3?: number;
    rolloverMultiplier?: number; // Rollover multiplier
    colorPrimary?: string;
    colorBackground?: string;
    colorAccent?: string;
}

async function uploadLogoAndGetURL(fileBuffer: Buffer, fileName: string, mimeType: string): Promise<string> {
    const bucketName = process.env.FIREBASE_STORAGE_BUCKET;
    if (!bucketName) {
        throw new Error("Firebase Storage bucket name is not configured in environment variables.");
    }
    const bucket = getAdminStorage().bucket(bucketName);
    const file = bucket.file(`logos/${fileName}`);

    await file.save(fileBuffer, {
        metadata: { contentType: mimeType },
    });
    
    await file.makePublic();
    return file.publicUrl();
}


export const getSettings = cache(async (): Promise<{ success: boolean; data?: SettingsData; error?: string }> => {
    try {
        const adminDb = getAdminDb();
        const settingsRef = adminDb.collection('settings').doc('general');
        const doc = await settingsRef.get();
        if (!doc.exists) {
            // Return default values if no settings are found
            return { success: true, data: { 
                siteName: 'Raspadinha', 
                minDeposit: 10, 
                minWithdrawal: 30, 
                commissionRateL1: 0, 
                commissionRateL2: 0, 
                commissionRateL3: 0, 
                logoUrl: '', 
                rolloverMultiplier: 1,
                colorPrimary: '142.1 76.2% 41.2%',
                colorBackground: '240 10% 3.9%',
                colorAccent: '142.1 76.2% 41.2%',
            } };
        }
        const data = doc.data() as SettingsData;
        // Ensure defaults for new fields if missing from existing settings
        if (data.commissionRateL1 === undefined) data.commissionRateL1 = 0;
        if (data.commissionRateL2 === undefined) data.commissionRateL2 = 0;
        if (data.commissionRateL3 === undefined) data.commissionRateL3 = 0;
        if (data.logoUrl === undefined) data.logoUrl = '';
        if (data.rolloverMultiplier === undefined) data.rolloverMultiplier = 1;
        if (data.colorPrimary === undefined) data.colorPrimary = '142.1 76.2% 41.2%';
        if (data.colorBackground === undefined) data.colorBackground = '240 10% 3.9%';
        if (data.colorAccent === undefined) data.colorAccent = '142.1 76.2% 41.2%';

        return { success: true, data };
    } catch (error: any) {
        console.error("Error fetching settings: ", error);
        return { success: false, error: "Falha ao buscar configurações." };
    }
});

export async function saveSettings(data: SettingsData, adminId: string, logoFileDataUrl?: string): Promise<{ success: boolean; error?: string }> {
    try {
        await logAdminAction(adminId, adminId, 'UPDATE_SETTINGS', { status: 'STARTED' }, 'INFO');
        // Basic validation
        if (typeof data.minDeposit !== 'number' || typeof data.minWithdrawal !== 'number' || typeof data.commissionRateL1 !== 'number' || typeof data.commissionRateL2 !== 'number' || typeof data.commissionRateL3 !== 'number' || typeof data.rolloverMultiplier !== 'number') {
            return { success: false, error: "Valores de depósito, saque, comissões e rollover devem ser números." };
        }
        if (data.commissionRateL1 < 0 || data.commissionRateL1 > 100) {
            return { success: false, error: "A comissão de nível 1 deve estar entre 0 e 100."}
        }
        if (data.commissionRateL2 < 0 || data.commissionRateL2 > 100) {
            return { success: false, error: "A comissão de nível 2 deve estar entre 0 e 100."}
        }
         if (data.commissionRateL3 < 0 || data.commissionRateL3 > 100) {
            return { success: false, error: "A comissão de nível 3 deve estar entre 0 e 100."}
        }
        if (data.rolloverMultiplier < 0) {
            return { success: false, error: "O multiplicador de rollover não pode ser negativo."}
        }

        const adminDb = getAdminDb();
        const settingsRef = adminDb.collection('settings').doc('general');
        
        const dataToSave: SettingsData = { ...data };

        if (logoFileDataUrl) {
            const [metadata, base64Data] = logoFileDataUrl.split(',');
            const mimeType = metadata.split(':')[1].split(';')[0];
            const fileBuffer = Buffer.from(base64Data, 'base64');
            const fileName = `logo-${Date.now()}`;
            const newLogoUrl = await uploadLogoAndGetURL(fileBuffer, fileName, mimeType);
            dataToSave.logoUrl = newLogoUrl;
        } else {
            // If no new file is uploaded, keep the existing URL from the fetched settings
            const currentSettings = await getSettings();
            dataToSave.logoUrl = currentSettings.data?.logoUrl || '';
        }

        await settingsRef.set(dataToSave, { merge: true });

        // After saving, update the globals.css file
        await updateCss(dataToSave);
        
        await logAdminAction(adminId, adminId, 'UPDATE_SETTINGS', { status: 'SUCCESS' }, 'SUCCESS');
        return { success: true };
    } catch (error: any) {
        console.error("Error saving settings: ", error);
        await logAdminAction(adminId, adminId, 'UPDATE_SETTINGS', { status: 'ERROR', error: JSON.stringify(error) }, 'ERROR');
        return { success: false, error: "Falha ao salvar configurações." };
    }
}


// This function is marked 'use server' but will be called from another server action
// It interacts with the file system, which is a server-side operation
async function updateCss(data: SettingsData) {
  try {
    const fs = require('fs').promises;
    const path = require('path');

    // Path to globals.css
    const cssFilePath = path.join(process.cwd(), 'src', 'app', 'globals.css');
    
    let cssContent = await fs.readFile(cssFilePath, 'utf8');

    // Replace color variables
    cssContent = cssContent.replace(/--background:\s*[^;]+;/, `--background: ${data.colorBackground};`);
    cssContent = cssContent.replace(/--primary:\s*[^;]+;/, `--primary: ${data.colorPrimary};`);
    cssContent = cssContent.replace(/--accent:\s*[^;]+;/, `--accent: ${data.colorAccent};`);
    
    // Write the updated content back to the file
    await fs.writeFile(cssFilePath, cssContent, 'utf8');
    
    console.log("globals.css updated successfully.");

  } catch (error) {
    console.error("Failed to update globals.css:", error);
    // This failure doesn't need to be sent to the user, but should be logged.
    // The settings are saved, but the theme won't apply until the next deployment if this fails.
  }
}
