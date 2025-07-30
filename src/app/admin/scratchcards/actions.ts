
'use server';

import { getAdminDb, getAdminStorage } from "@/lib/firebase-admin-init";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { cache } from 'react';
import { logAdminAction } from "@/lib/logging";

// Helper function to safely convert a Timestamp to an ISO string
const toISOStringOrNull = (timestamp: Timestamp | undefined): string | null => {
    try {
        return timestamp ? timestamp.toDate().toISOString() : null;
    } catch (error) {
        return null;
    }
}

export interface Prize {
    id: string; // uuid
    name: string;
    value: number;
    imageUrl: string;
}

export interface Scratchcard {
    id: string; // firestore doc id
    name: string;
    description: string;
    price: number;
    imageUrl: string;
    scratchImageUrl?: string; // The image to be scratched
    prizes: Prize[];
    isEnabled: boolean;
    createdAt?: string | null;
    updatedAt?: string | null;
    categoryIds?: string[];
    rtpRate?: number;
}

async function uploadImageAndGetURL(fileBuffer: Buffer, fileName: string, mimeType: string, folder: 'scratchcards' | 'prizes'): Promise<string> {
    const bucketName = process.env.FIREBASE_STORAGE_BUCKET;
    if (!bucketName) {
        throw new Error("Firebase Storage bucket name is not configured in environment variables.");
    }
    const bucket = getAdminStorage().bucket(bucketName);
    const file = bucket.file(`${folder}/${fileName}`);

    await file.save(fileBuffer, {
        metadata: { contentType: mimeType },
    });
    
    await file.makePublic();
    return file.publicUrl();
}


// Get all scratchcards
export const getScratchcards = cache(async (): Promise<{ success: boolean; data?: Scratchcard[]; error?: string }> => {
    try {
        const adminDb = getAdminDb();
        const scratchcardsCollection = adminDb.collection('scratchcards');
        const snapshot = await scratchcardsCollection.orderBy("createdAt", "desc").get();
        if (snapshot.empty) {
            return { success: true, data: [] };
        }
        const data = snapshot.docs.map(doc => {
            const docData = doc.data();
            return { 
                id: doc.id,
                ...docData,
                createdAt: toISOStringOrNull(docData.createdAt),
                updatedAt: toISOStringOrNull(docData.updatedAt),
            } as Scratchcard;
        });

        return { success: true, data };
    } catch (error: any) {
        console.error("Error getting scratchcards: ", error);
        return { success: false, error: "Falha ao buscar raspadinhas." };
    }
});


interface PrizePayload extends Prize {
    prizeFileDataUrl?: string;
    existingImageUrl?: string;
}

// Create or Update a scratchcard
export async function saveScratchcard(
    card: Omit<Scratchcard, 'id' | 'createdAt' | 'updatedAt' | 'prizes'> & { 
        id?: string, 
        coverFileDataUrl?: string, 
        scratchFileDataUrl?: string,
        prizes: PrizePayload[],
        adminId: string,
    }
): Promise<{ success: boolean; error?: string }> {
    try {
        const hasNoWinPrize = card.prizes.some(p => p.value === 0);
        if (!hasNoWinPrize) {
            return { success: false, error: "É obrigatório definir ao menos um prêmio com valor R$ 0.00 para representar a derrota." };
        }

        const finalPrizes = await Promise.all(card.prizes.map(async (prize) => {
            let finalImageUrl = prize.existingImageUrl || prize.imageUrl;
            if (prize.prizeFileDataUrl) {
                const [metadata, base64Data] = prize.prizeFileDataUrl.split(',');
                const mimeType = metadata.split(':')[1].split(';')[0];
                const fileBuffer = Buffer.from(base64Data, 'base64');
                const fileName = `prize-${prize.id}-${Date.now()}`;
                finalImageUrl = await uploadImageAndGetURL(fileBuffer, fileName, mimeType, 'prizes');
            }
            if (!finalImageUrl) {
                throw new Error(`Imagem para o prêmio '${prize.name}' é obrigatória.`);
            }
            return {
                id: prize.id,
                name: prize.name,
                value: prize.value,
                imageUrl: finalImageUrl,
            };
        }));
        
        const dataToSave: any = {
            name: card.name,
            description: card.description,
            price: card.price,
            isEnabled: card.isEnabled,
            prizes: finalPrizes,
            categoryIds: card.categoryIds || []
        };
        
        const cardIdForLog = card.id || 'new_card';
        
        if (card.coverFileDataUrl) {
            const [metadata, base64Data] = card.coverFileDataUrl.split(',');
            const mimeType = metadata.split(':')[1].split(';')[0];
            const fileBuffer = Buffer.from(base64Data, 'base64');
            const fileName = `cover-${card.id || Date.now()}`;
            dataToSave.imageUrl = await uploadImageAndGetURL(fileBuffer, fileName, mimeType, 'scratchcards');
            await logAdminAction(card.adminId, cardIdForLog, 'UPDATE_SCRATCHCARD_IMAGE', { imageType: 'cover', newUrl: dataToSave.imageUrl }, 'SUCCESS');
        } else if (card.imageUrl) {
            dataToSave.imageUrl = card.imageUrl;
        }

        if (card.scratchFileDataUrl) {
            const [metadata, base64Data] = card.scratchFileDataUrl.split(',');
            const mimeType = metadata.split(':')[1].split(';')[0];
            const fileBuffer = Buffer.from(base64Data, 'base64');
            const fileName = `scratch-${card.id || Date.now()}`;
            dataToSave.scratchImageUrl = await uploadImageAndGetURL(fileBuffer, fileName, mimeType, 'scratchcards');
             await logAdminAction(card.adminId, cardIdForLog, 'UPDATE_SCRATCHCARD_IMAGE', { imageType: 'scratch', newUrl: dataToSave.scratchImageUrl }, 'SUCCESS');
        } else if (card.scratchImageUrl) {
            dataToSave.scratchImageUrl = card.scratchImageUrl;
        }
        
        if (typeof card.rtpRate === 'number' && !isNaN(card.rtpRate)) {
             dataToSave.rtpRate = card.rtpRate;
        } else {
            dataToSave.rtpRate = FieldValue.delete();
        }


        const adminDb = getAdminDb();
        const scratchcardsCollection = adminDb.collection('scratchcards');

        if (card.id) {
            await scratchcardsCollection.doc(card.id).update({
                ...dataToSave,
                updatedAt: FieldValue.serverTimestamp(),
            });
        } else {
            const docRef = scratchcardsCollection.doc();
            await docRef.set({
                ...dataToSave,
                id: docRef.id,
                createdAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
            });
        }
        await logAdminAction(card.adminId, cardIdForLog, 'SAVE_SCRATCHCARD', { name: card.name, price: card.price }, 'SUCCESS');
        return { success: true };
    } catch (error: any) {
        console.error("Error saving scratchcard: ", error);
        await logAdminAction(card.adminId, 'unknown', 'SAVE_SCRATCHCARD_ERROR', { error: JSON.stringify(error) }, 'ERROR');
        return { success: false, error: "Falha ao salvar a raspadinha." };
    }
}


// Delete a scratchcard
export async function deleteScratchcard(id: string): Promise<{ success: boolean; error?: string }> {
    try {
        const adminDb = getAdminDb();
        const scratchcardsCollection = adminDb.collection('scratchcards');
        await scratchcardsCollection.doc(id).delete();
        return { success: true };
    } catch (error: any) {
        console.error("Error deleting scratchcard: ", error);
        return { success: false, error: "Falha ao excluir a raspadinha." };
    }
}
