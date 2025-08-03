
'use server';

import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin-init";
import { FieldValue } from "firebase-admin/firestore";

/**
 * This is a temporary recovery action to restore admin privileges to a specific user.
 * It should be removed after the user confirms their access is restored.
 */
export async function restoreAdminAccess(email: string): Promise<{ success: boolean; error?: string; message?: string }> {
    if (!email) {
        return { success: false, error: "E-mail não fornecido." };
    }

    try {
        const adminDb = getAdminDb();
        const adminAuth = getAdminAuth();

        // Find user by email
        const userRecord = await adminAuth.getUserByEmail(email);
        const userId = userRecord.uid;

        if (!userId) {
            return { success: false, error: `Usuário com o e-mail ${email} não encontrado na autenticação.` };
        }

        const userRef = adminDb.collection('users').doc(userId);
        const userDoc = await userRef.get();

        if (!userDoc.exists) {
            return { success: false, error: `Usuário com o e-mail ${email} não encontrado no banco de dados.` };
        }

        // Ensure the 'admin' role is present in the roles array
        await userRef.update({
            roles: FieldValue.arrayUnion('admin')
        });

        return { success: true, message: `Acesso de administrador para ${email} foi restaurado com sucesso.` };

    } catch (error: any) {
        console.error("Error restoring admin access:", error);
        if (error.code === 'auth/user-not-found') {
            return { success: false, error: `Nenhum usuário encontrado com o e-mail: ${email}` };
        }
        return { success: false, error: "Ocorreu um erro inesperado ao tentar restaurar o acesso." };
    }
}
