
'use server';

import { getAdminDb } from "@/lib/firebase-admin-init";
import { getScratchcards, Scratchcard, Prize } from '../scratchcards/actions';
import { logAdminAction } from "@/lib/logging";

export interface JourneyStep {
    cardId: string;
    prizeToWinId: string | null; // Null for all steps except the last one
}

export interface SignupRewardSettings {
    journey: JourneyStep[];
}

// Get signup reward settings
export async function getSignupRewardSettings(): Promise<{ success: boolean; data?: SignupRewardSettings; error?: string }> {
    try {
        const adminDb = getAdminDb();
        const settingsRef = adminDb.collection('settings').doc('signupReward');
        const doc = await settingsRef.get();
        if (!doc.exists) {
            // Return a default empty journey if no settings are found
            return { success: true, data: { journey: [] } };
        }
        const data = doc.data() as SignupRewardSettings;
        // Ensure data format is correct
        if (!data.journey) {
             return { success: true, data: { journey: [] } };
        }
        return { success: true, data };
    } catch (error: any) {
        console.error("Error fetching signup reward settings: ", error);
        return { success: false, error: "Falha ao buscar configurações de recompensa. Tente novamente." };
    }
}

// Save signup reward settings
export async function saveSignupRewardSettings(data: SignupRewardSettings, adminId: string): Promise<{ success: boolean; error?: string }> {
    try {
        if (!data.journey || data.journey.length === 0) {
            // If the journey is empty, we can save it as such to disable the feature
             await getAdminDb().collection('settings').doc('signupReward').set({ journey: [] });
             await logAdminAction(adminId, adminId, 'SAVE_SIGNUP_REWARD', { status: 'Disabled journey' }, 'SUCCESS');
             return { success: true };
        }

        for (const step of data.journey) {
            if (!step.cardId) {
                return { success: false, error: "Todas as etapas devem ter uma raspadinha selecionada." };
            }
        }
        
        const lastStep = data.journey[data.journey.length - 1];
        if (!lastStep.prizeToWinId) {
            return { success: false, error: "A última etapa da jornada deve ter um prêmio final selecionado." };
        }

        const adminDb = getAdminDb();
        const settingsRef = adminDb.collection('settings').doc('signupReward');
        await settingsRef.set(data);
        await logAdminAction(adminId, adminId, 'SAVE_SIGNUP_REWARD', { status: 'Saved new journey', steps: data.journey.length }, 'SUCCESS');
        return { success: true };
    } catch (error: any) {
        console.error("Error saving signup reward settings: ", error);
        await logAdminAction(adminId, adminId, 'SAVE_SIGNUP_REWARD_FAIL', { error: error.message, stack: error.stack }, 'ERROR');
        return { success: false, error: "Falha ao salvar as configurações. Tente novamente." };
    }
}

// Helper action to get scratchcards for the form
export { getScratchcards };
export type { Scratchcard, Prize };
