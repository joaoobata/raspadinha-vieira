
'use server';

import { getAdminDb } from "@/lib/firebase-admin-init";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { cache } from 'react';

// Helper function to safely convert a Timestamp to an ISO string
const toISOStringOrNull = (timestamp: Timestamp | undefined): string | null => {
    try {
        return timestamp ? timestamp.toDate().toISOString() : null;
    } catch (error) {
        return null;
    }
}

export interface Category {
    id: string; // firestore doc id
    name: string;
    createdAt?: string | null;
    updatedAt?: string | null;
}


// Get all categories
export const getCategories = cache(async (): Promise<{ success: boolean; data?: Category[]; error?: string }> => {
    try {
        const adminDb = getAdminDb();
        const categoriesCollection = adminDb.collection('categories');
        const snapshot = await categoriesCollection.orderBy('name', 'asc').get();
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
            } as Category;
        });
        return { success: true, data };
    } catch (error: any) {
        console.error("Error getting categories: ", error);
        return { success: false, error: "Falha ao buscar categorias." };
    }
});

// Create or Update a category
export async function saveCategory(category: Omit<Category, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<{ success: boolean; error?: string }> {
    try {
        if (!category.name) {
            return { success: false, error: "O nome da categoria é obrigatório." };
        }

        const adminDb = getAdminDb();
        const categoriesCollection = adminDb.collection('categories');

        // Check for duplicate category name (case-insensitive)
        const querySnapshot = await categoriesCollection.where('name', '==', category.name).get();
        const isDuplicate = querySnapshot.docs.some(doc => doc.id !== category.id); // Exclude self in case of update
        if(isDuplicate){
             return { success: false, error: `A categoria "${category.name}" já existe.` };
        }

        if (category.id) {
            // Update
            const { id, ...dataToUpdate } = category;
            await categoriesCollection.doc(id).update({
                ...dataToUpdate,
                updatedAt: FieldValue.serverTimestamp(),
            });
        } else {
            // Create
            const docRef = categoriesCollection.doc();
            await docRef.set({
                ...category,
                id: docRef.id,
                createdAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
            });
        }
        return { success: true };
    } catch (error: any) {
        console.error("Error saving category: ", error);
        return { success: false, error: "Falha ao salvar a categoria. Tente novamente." };
    }
}


// Delete a category
export async function deleteCategory(id: string): Promise<{ success: boolean; error?: string }> {
    try {
        const adminDb = getAdminDb();
        const categoriesCollection = adminDb.collection('categories');
        await categoriesCollection.doc(id).delete();
        // Here you might want to also remove this categoryId from all scratchcards that use it.
        // This is an advanced feature and can be added later. For now, we just delete the category.
        return { success: true };
    } catch (error: any) {
        console.error("Error deleting category: ", error);
        return { success: false, error: "Falha ao excluir a categoria. Tente novamente." };
    }
}
