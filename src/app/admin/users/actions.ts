
'use server';

import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin-init";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { headers } from "next/headers";
import { logAdminAction } from "@/lib/logging";

// Helper function to safely convert a Timestamp to an ISO string
const toISOStringOrNull = (timestamp: Timestamp | undefined): string | null => {
    try {
        return timestamp ? timestamp.toDate().toISOString() : null;
    } catch (error) {
        return null;
    }
}

// --- SECURITY HELPER: Check if the calling user is an admin ---
// This is now the single source of truth for verifying an admin on the server.
// It should be called at the beginning of any sensitive server action.
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


export interface UserData {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    cpf: string;
    balance: number;
    commissionBalance: number;
    createdAt: string | null;
    status: 'active' | 'banned';
    referredBy: string | null;
    referredByName?: string | null;
    roles?: ('admin' | 'influencer' | 'afiliado')[];
    l1ReferralCount: number;
    commissionRate?: number;
}

export interface SearchedUser {
    id: string;
    name: string;
    email: string;
}


export async function getUsers(): Promise<{ success: boolean; data?: UserData[]; error?: string }> {
    try {
        const adminDb = getAdminDb();
        // Limit the initial fetch to the 100 most recent users for performance.
        const allUsersSnapshot = await adminDb.collection('users').orderBy('createdAt', 'desc').limit(100).get();

        if (allUsersSnapshot.empty) {
            return { success: true, data: [] };
        }
        
        const allUsersMap = new Map<string, FirebaseFirestore.DocumentData>();
        const referralCountMap = new Map<string, number>();

        // We need all users to map referredBy to names, this is a trade-off.
        // For larger scale, this part should be optimized (e.g. denormalizing affiliate name)
        const allUsersForMapping = await adminDb.collection('users').get();
        allUsersForMapping.docs.forEach(doc => {
             const data = doc.data();
             allUsersMap.set(doc.id, data);
             if (data.referredBy) {
                referralCountMap.set(data.referredBy, (referralCountMap.get(data.referredBy) || 0) + 1);
            }
        });


        const usersData = allUsersSnapshot.docs.map(doc => {
            const data = doc.data();
            const referredById = data.referredBy || null;
            const affiliateData = referredById ? allUsersMap.get(referredById) : null;
            const referredByName = affiliateData ? `${affiliateData.firstName} ${affiliateData.lastName}`.trim() || affiliateData.email : null;

            return {
                id: doc.id,
                firstName: data.firstName || '',
                lastName: data.lastName || '',
                email: data.email || '',
                phone: data.phone || '',
                cpf: data.cpf || '',
                balance: data.balance || 0,
                commissionBalance: data.commissionBalance || 0,
                createdAt: toISOStringOrNull(data.createdAt),
                status: data.status || 'active',
                referredBy: referredById,
                referredByName: referredByName,
                roles: data.roles || [],
                l1ReferralCount: referralCountMap.get(doc.id) || 0,
                commissionRate: data.commissionRate,
            } as UserData;
        });

        return { success: true, data: usersData };

    } catch (error: any) {
        console.error("Error fetching users: ", error);
        return { success: false, error: "Falha ao buscar usuários no banco de dados." };
    }
}


export async function searchUsers(searchTerm: string): Promise<{ success: boolean; data?: UserData[]; error?: string }> {
    if (!searchTerm || searchTerm.length < 2) {
        return { success: false, error: "Termo de busca muito curto." };
    }

    try {
        const adminDb = getAdminDb();
        const lowerCaseSearchTerm = searchTerm.toLowerCase();
        
        // This is a basic implementation. It fetches all users and filters in memory.
        // For very large user bases, a more advanced search solution like Algolia or a dedicated search query would be better.
        const allUsersSnapshot = await adminDb.collection('users').get();
        
        const filteredDocs = allUsersSnapshot.docs.filter(doc => {
            const data = doc.data();
            const fullName = `${data.firstName || ''} ${data.lastName || ''}`.toLowerCase();
            const email = (data.email || '').toLowerCase();
            return fullName.includes(lowerCaseSearchTerm) || email.includes(lowerCaseSearchTerm);
        });

        if (filteredDocs.length === 0) {
            return { success: true, data: [] };
        }

        // Now, get the referral counts and names for the filtered users
        const allUsersMap = new Map<string, FirebaseFirestore.DocumentData>();
        const referralCountMap = new Map<string, number>();

        allUsersSnapshot.docs.forEach(doc => {
            const data = doc.data();
            allUsersMap.set(doc.id, data);
            if (data.referredBy) {
                referralCountMap.set(data.referredBy, (referralCountMap.get(data.referredBy) || 0) + 1);
            }
        });
        
        const usersData = filteredDocs.map(doc => {
             const data = doc.data();
            const referredById = data.referredBy || null;
            const affiliateData = referredById ? allUsersMap.get(referredById) : null;
            const referredByName = affiliateData ? `${affiliateData.firstName} ${affiliateData.lastName}`.trim() || affiliateData.email : null;

            return {
                id: doc.id,
                firstName: data.firstName || '',
                lastName: data.lastName || '',
                email: data.email || '',
                phone: data.phone || '',
                cpf: data.cpf || '',
                balance: data.balance || 0,
                commissionBalance: data.commissionBalance || 0,
                createdAt: toISOStringOrNull(data.createdAt),
                status: data.status || 'active',
                referredBy: referredById,
                referredByName: referredByName,
                roles: data.roles || [],
                l1ReferralCount: referralCountMap.get(doc.id) || 0,
                commissionRate: data.commissionRate,
            } as UserData;
        });

        return { success: true, data: usersData };

    } catch (error: any) {
        console.error("Error searching users: ", error);
        return { success: false, error: "Falha ao buscar usuários." };
    }
}


export async function updateUserStatus(userId: string, status: 'active' | 'banned', adminId: string): Promise<{ success: boolean; error?: string }> {
    try {
        await verifyAdmin(adminId); // Security Check

        if (!userId) {
            throw new Error("ID do usuário não fornecido.");
        }
        
        const adminDb = getAdminDb();
        const userRef = adminDb.collection("users").doc(userId);
        await userRef.update({ status: status });

        const adminAuth = getAdminAuth();
        await adminAuth.updateUser(userId, {
            disabled: status === 'banned',
        });
        
        await logAdminAction(adminId, userId, 'UPDATE_USER_STATUS', { newStatus: status }, 'SUCCESS');
        return { success: true };

    } catch (error: any) {
        console.error("Error updating user status: ", error);
        await logAdminAction(adminId, userId, 'UPDATE_USER_STATUS', { error: error.message }, 'ERROR');
        return { success: false, error: error.message || "Falha ao atualizar o status do usuário." };
    }
}

export async function updateUserBalance(userId: string, amount: number, reason: string, adminId: string): Promise<{ success: boolean; error?: string }> {
    const action = 'UPDATE_USER_BALANCE';
    try {
        await verifyAdmin(adminId);
        await logAdminAction(adminId, userId, action, { status: 'START', amount, reason });

        if (!userId) throw new Error("ID do usuário não fornecido.");
        if (typeof amount !== 'number' || isNaN(amount)) throw new Error("Valor inválido fornecido.");
        if (!reason.trim()) throw new Error("A justificativa é obrigatória para alterações manuais de saldo.");
        
        const adminDb = getAdminDb();
        const userRef = adminDb.collection("users").doc(userId);

        await adminDb.runTransaction(async (transaction) => {
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists) throw new Error(`Usuário ${userId} não encontrado.`);

            const userData = userDoc.data()!;
            const balanceBefore = userData.balance || 0;
            const balanceAfter = balanceBefore + amount;

            // Create ledger entry
            const ledgerRef = adminDb.collection('user_ledger').doc();
            transaction.set(ledgerRef, {
                userId,
                type: 'ADJUSTMENT',
                amount,
                description: reason,
                balanceBefore,
                balanceAfter,
                refId: `admin-${adminId}`,
                createdAt: FieldValue.serverTimestamp(),
                adminId,
            });
            
            // Update user balance
            transaction.update(userRef, { balance: balanceAfter });
        });
        
        await logAdminAction(adminId, userId, action, { status: 'SUCCESS' }, 'SUCCESS');
        return { success: true };

    } catch (error: any) {
        console.error("Error updating user balance: ", error);
        await logAdminAction(adminId, userId, action, { status: 'ERROR', message: error.message, stack: error.stack }, 'ERROR');
        return { success: false, error: error.message || "Falha ao atualizar o saldo do usuário." };
    }
}


export async function deleteUser(userId: string, adminId: string): Promise<{ success: boolean; error?: string }> {
    try {
        await verifyAdmin(adminId); // Security Check

        if (!userId) {
            throw new Error("ID do usuário não fornecido.");
        }

        const adminAuth = getAdminAuth();
        const adminDb = getAdminDb();

        // Delete from Firebase Authentication
        await adminAuth.deleteUser(userId);
        
        // Delete from Firestore
        const userRef = adminDb.collection("users").doc(userId);
        await userRef.delete();
        await logAdminAction(adminId, userId, 'DELETE_USER', { success: true }, 'SUCCESS');


        // Note: Associated data like transactions, commissions, ledger entries are not deleted
        // to maintain historical records. This might need a different strategy if full data wipe is needed.

        return { success: true };

    } catch (error: any) {
        console.error(`Error deleting user ${userId}:`, error);
        
        const adminDb = getAdminDb();
        if ((error as any).code === 'auth/user-not-found') {
            // If user is not in Auth, maybe they were already deleted.
            // Still try to delete from Firestore.
            try {
                 const userRef = adminDb.collection("users").doc(userId);
                 await userRef.delete();
                 await logAdminAction(adminId, userId, 'DELETE_USER_FIRESTORE_ONLY', { success: true, reason: 'User not found in Auth.' }, 'SUCCESS');
                 return { success: true };
            } catch (fsError: any) {
                 console.error(`Error deleting user ${userId} from Firestore after Auth failed:`, fsError);
                  await logAdminAction(adminId, userId, 'DELETE_USER', { error: fsError.message, stage: 'firestore' }, 'ERROR');
                 return { success: false, error: fsError.message || "Falha ao excluir usuário do banco de dados." };
            }
        }
        await logAdminAction(adminId, userId, 'DELETE_USER', { error: (error as any).message, stage: 'auth' }, 'ERROR');
        return { success: false, error: (error as any).message || "Falha ao excluir o usuário." };
    }
}
