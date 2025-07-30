
'use server';

import { getAdminDb } from "@/lib/firebase-admin-init";

export interface SignupRewardStatus {
    status: 'unclaimed' | 'in_progress' | 'claimed';
    remainingPlays: number;
}

export async function getSignupRewardStatus(userId: string): Promise<{ success: boolean; data?: SignupRewardStatus; error?: string }> {
    if (!userId) {
        return { success: false, error: 'Usuário não autenticado.' };
    }

    try {
        const adminDb = getAdminDb();
        const userDoc = await adminDb.collection('users').doc(userId).get();

        if (!userDoc.exists) {
            return { success: false, error: 'Usuário não encontrado.' };
        }

        const userData = userDoc.data();
        const signupRewardData = userData?.signupReward;

        // Corrected Logic: Check for the existence of the journey itself.
        if (!signupRewardData || !signupRewardData.journey || signupRewardData.journey.length === 0) {
            // If the field doesn't exist, or has no journey, the user has no rewards.
            return { success: true, data: undefined };
        }

        // Calculate remaining plays based on the difference between total steps and current step
        const totalPlays = signupRewardData.journey.length;
        const currentStep = signupRewardData.currentStep || 0;
        const remainingPlays = totalPlays - currentStep;

        return {
            success: true,
            data: {
                status: signupRewardData.status || 'unclaimed',
                remainingPlays: remainingPlays > 0 ? remainingPlays : 0,
            }
        };

    } catch (error: any) {
        console.error("Error fetching signup reward status: ", error);
        return { success: false, error: 'Falha ao buscar o status da recompensa.' };
    }
}
