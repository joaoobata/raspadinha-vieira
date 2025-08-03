
'use server';

import { getAdminDb } from "@/lib/firebase-admin-init";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getScratchcards, Scratchcard } from '../scratchcards/actions';
import { logAdminAction } from "@/lib/logging";

// Helper to safely convert Timestamps
const toISOStringOrNull = (timestamp: Timestamp | undefined): string | null => {
    try {
        return timestamp ? timestamp.toDate().toISOString() : null;
    } catch (error) {
        return null;
    }
};

export interface PrizeTierConfig {
    maxAmount: number;
    probability: number;
}

export interface GgrBatch {
    id: string;
    name: string;
    ggrTarget: number;
    prizePool: number;
    ggrCurrent: number;
    prizesDistributed: number;
    participatingCardIds: string[];
    status: 'active' | 'archived';
    isRecurring: boolean;
    prizeTiers?: {
        low: PrizeTierConfig;
        medium: PrizeTierConfig;
        high: { probability: number }; // high has no maxAmount
    };
    createdAt: string | null;
}

// Action to get all scratchcards to allow selection
export { getScratchcards };
export type { Scratchcard };

export async function getGgrBatches(): Promise<{ success: boolean; data?: GgrBatch[]; error?: string }> {
    try {
        const adminDb = getAdminDb();
        const snapshot = await adminDb.collection('ggr_batches').orderBy('createdAt', 'desc').get();

        if (snapshot.empty) {
            return { success: true, data: [] };
        }

        const batches = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                name: data.name,
                ggrTarget: data.ggrTarget || 0,
                prizePool: data.prizePool || 0,
                ggrCurrent: data.ggrCurrent || 0,
                prizesDistributed: data.prizesDistributed || 0,
                participatingCardIds: data.participatingCardIds || [],
                status: data.status || 'active',
                isRecurring: data.isRecurring || false,
                prizeTiers: data.prizeTiers, // Include the new field
                createdAt: toISOStringOrNull(data.createdAt),
            } as GgrBatch;
        });

        return { success: true, data: batches };
    } catch (error: any) {
        console.error("Error fetching GGR batches: ", error);
        return { success: false, error: "Falha ao buscar os lotes de GGR." };
    }
}

export async function saveGgrBatch(
    batch: Omit<GgrBatch, 'id' | 'createdAt'> & { id?: string },
    adminId: string
): Promise<{ success: boolean; error?: string }> {
    try {
        if (!batch.name) return { success: false, error: "O nome do lote é obrigatório." };
        if (!batch.ggrTarget || batch.ggrTarget <= 0) return { success: false, error: "O GGR Alvo deve ser maior que zero." };
        if (!batch.prizePool || batch.prizePool < 0) return { success: false, error: "O Pool de Prêmios não pode ser negativo." };

        if (batch.prizeTiers) {
            const { low, medium, high } = batch.prizeTiers;
            const totalProbability = (low.probability || 0) + (medium.probability || 0) + (high.probability || 0);
            if (Math.abs(totalProbability - 100) > 0.01) { // Allow for floating point inaccuracies
                return { success: false, error: `A soma das probabilidades dos tiers (${totalProbability}%) deve ser exatamente 100%.`};
            }
        }

        const adminDb = getAdminDb();
        const batchesCollection = adminDb.collection('ggr_batches');

        const dataToSave = {
            ...batch,
            ggrCurrent: batch.ggrCurrent || 0,
            prizesDistributed: batch.prizesDistributed || 0,
            status: batch.status || 'active',
            participatingCardIds: batch.participatingCardIds || [],
            isRecurring: batch.isRecurring || false,
            prizeTiers: batch.prizeTiers || null, // Save the tiers or null if not provided
        };

        if (batch.id) {
            // Update
            const batchRef = batchesCollection.doc(batch.id);
            await batchRef.update({
                ...dataToSave,
                updatedAt: FieldValue.serverTimestamp(),
            });
            await logAdminAction(adminId, batch.id, 'UPDATE_GGR_BATCH', { name: batch.name }, 'SUCCESS');
        } else {
            // Create
            const batchRef = batchesCollection.doc();
            await batchRef.set({
                ...dataToSave,
                createdAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
            });
            await logAdminAction(adminId, batchRef.id, 'CREATE_GGR_BATCH', { name: batch.name }, 'SUCCESS');
        }

        return { success: true };
    } catch (error: any) {
        console.error("Error saving GGR batch:", error);
        await logAdminAction(adminId, batch.id || 'new_batch', 'SAVE_GGR_BATCH_FAIL', { error: error.message }, 'ERROR');
        return { success: false, error: "Falha ao salvar o lote de GGR." };
    }
}

export async function archiveGgrBatch(batchId: string, adminId: string): Promise<{ success: boolean; error?: string }> {
    try {
        const adminDb = getAdminDb();
        const batchRef = adminDb.collection('ggr_batches').doc(batchId);
        await batchRef.update({ status: 'archived' });
        await logAdminAction(adminId, batchId, 'ARCHIVE_GGR_BATCH', { success: true }, 'SUCCESS');
        return { success: true };
    } catch (error: any) {
        console.error("Error archiving GGR batch:", error);
        await logAdminAction(adminId, batchId, 'ARCHIVE_GGR_BATCH_FAIL', { error: error.message }, 'ERROR');
        return { success: false, error: "Falha ao arquivar o lote." };
    }
}
