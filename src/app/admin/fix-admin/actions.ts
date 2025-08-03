
'use server';

import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin-init";
import { FieldValue } from "firebase-admin/firestore";
import { logAdminAction } from "@/lib/logging";

async function verifyAdmin(adminId: string): Promise<void> {
    if (!adminId) {
        throw new Error("Admin não autenticado.");
    }
    const adminDb = getAdminDb();
    const adminUserDoc = await adminDb.collection('users').doc(adminId).get();
    if (!adminUserDoc.exists) {
        throw new Error("Usuário administrador não encontrado.");
    }
    const adminData = adminUserDoc.data();
    if (!adminData?.roles || !adminData.roles.includes('admin')) {
         throw new Error("Acesso negado. Apenas administradores podem realizar esta ação.");
    }
}

/**
 * Recalculates the rollover requirement for all users based only on their 'DEPOSIT' ledger entries.
 * This is a corrective action to fix historical data where commission claims incorrectly increased rollover.
 */
export async function recalculateAllRollovers(adminId: string): Promise<{ success: boolean; error?: string; message?: string }> {
    try {
        await verifyAdmin(adminId);
        await logAdminAction(adminId, 'SYSTEM', 'RECALCULATE_ALL_ROLLOVERS', { status: 'STARTED' }, 'INFO');

        const adminDb = getAdminDb();
        const settingsDoc = await adminDb.collection('settings').doc('general').get();
        // Use a default multiplier of 1 if it's not set or is invalid.
        const rolloverMultiplier = settingsDoc.data()?.rolloverMultiplier ?? 1;

        const ledgerSnapshot = await adminDb.collection('user_ledger')
            .where('type', '==', 'DEPOSIT')
            .get();

        if (ledgerSnapshot.empty) {
            return { success: true, message: "Nenhum depósito encontrado para processar." };
        }

        const userDeposits = new Map<string, number>();
        ledgerSnapshot.forEach(doc => {
            const data = doc.data();
            const userId = data.userId;
            const amount = data.amount;
            userDeposits.set(userId, (userDeposits.get(userId) || 0) + amount);
        });

        let processedCount = 0;
        const batch = adminDb.batch();

        for (const [userId, totalDeposited] of userDeposits.entries()) {
            const correctRolloverRequirement = totalDeposited * rolloverMultiplier;
            const userRef = adminDb.collection('users').doc(userId);
            batch.update(userRef, { rolloverRequirement: correctRolloverRequirement });
            processedCount++;
        }

        await batch.commit();

        const successMessage = `${processedCount} usuários tiveram seus requisitos de rollover recalculados com sucesso.`;
        await logAdminAction(adminId, 'SYSTEM', 'RECALCULATE_ALL_ROLLOVERS', { status: 'SUCCESS', message: successMessage, processedCount }, 'SUCCESS');

        return { success: true, message: successMessage };

    } catch (error: any) {
        console.error("Error recalculating rollovers:", error);
        await logAdminAction(adminId, 'SYSTEM', 'RECALCULATE_ALL_ROLLOVERS', { status: 'ERROR', error: error.message }, 'ERROR');
        return { success: false, error: "Ocorreu um erro inesperado ao recalcular os rollovers." };
    }
}

