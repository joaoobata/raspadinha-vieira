
'use server';

import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin-init";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { logAdminAction } from "@/lib/logging";

// Helper to safely convert Timestamps
const toISOStringOrNull = (timestamp: Timestamp | undefined): string | null => {
    try {
        return timestamp ? timestamp.toDate().toISOString() : null;
    } catch (error) {
        return null;
    }
};

async function verifyAdmin(adminId: string): Promise<void> {
    if (!adminId) {
        throw new Error("Admin não autenticado.");
    }
    const adminDb = getAdminDb();
    const adminUserDoc = await adminDb.collection('users').doc(adminId).get();
    if (!adminUserDoc.exists || adminUserDoc.data()?.role !== 'admin') {
        throw new Error("Acesso negado. Apenas administradores podem realizar esta ação.");
    }
}

export type UserRole = 'admin' | 'influencer';

export interface DirectReferral {
    id: string;
    name: string;
    email: string;
    totalDeposited: number;
    commissionGenerated: number;
    customRate?: number;
}


// Interface for detailed user data
export interface UserDetailsData {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    cpf: string;
    balance: number;
    commissionBalance: number; 
    status: 'active' | 'banned';
    createdAt: string | null;
    totalDeposited: number;
    totalWithdrawn: number;
    
    // Affiliate rates THIS user PAYS TO their affiliates
    referredBy: string | null; 
    referredByName: string | null; 
    
    // Default commission rates THIS USER EARNS from their own referrals.
    commissionRate?: number; // The L1 rate this user EARNS (percentage, e.g., 10 for 10%)
    commissionRateL2?: number; // The L2 rate this user EARNS (percentage, e.g., 1 for 1%)
    commissionRateL3?: number; // The L3 rate this user EARNS (percentage, e.g., 0.5 for 0.5%)

    role?: UserRole | null;
    rtpRate?: number | null; // User-specific RTP
    directReferrals: DirectReferral[];
    level2Referrals: DirectReferral[];
    level3Referrals: DirectReferral[];
}

export type LedgerEntryType = 
    | 'DEPOSIT' 
    | 'WITHDRAWAL_REQUEST' 
    | 'WITHDRAWAL_COMPLETE' 
    | 'WITHDRAWAL_REFUND' 
    | 'GAME_BET' 
    | 'GAME_PRIZE'
    | 'COMMISSION'
    | 'COMMISSION_CLAIM'
    | 'ADJUSTMENT';

export interface LedgerEntry {
    id: string;
    type: LedgerEntryType;
    amount: number; // Positive for credits, negative for debits
    description: string;
    balanceBefore: number;
    balanceAfter: number;
    createdAt: string | null;
    refId: string; // ID of the related document (transaction, game_play, etc.)
}


// Action to get user details and aggregated data
export async function getUserDetails(userId: string): Promise<{ success: boolean; data?: UserDetailsData; error?: string }> {
    try {
        if (!userId) {
            return { success: false, error: "ID do usuário não fornecido." };
        }

        const adminDb = getAdminDb();
        const userRef = adminDb.collection("users").doc(userId);
        const userDoc = await userRef.get();

        if (!userDoc.exists) {
            return { success: false, error: "Usuário não encontrado." };
        }

        const userData = userDoc.data()!;
        
        // Use a map for faster deposit lookups
        const depositsByUserId = new Map<string, number>();
        const allTransactionsSnapshot = await adminDb.collection("transactions").where("status", "==", "COMPLETED").get();
        allTransactionsSnapshot.forEach(doc => {
            const data = doc.data();
            depositsByUserId.set(data.userId, (depositsByUserId.get(data.userId) || 0) + data.amount);
        });
        
        const totalDeposited = depositsByUserId.get(userId) || 0;
        
        const withdrawalsSnapshot = await adminDb.collection("withdrawals").where("userId", "==", userId).where("status", "==", "COMPLETED").get();
        const totalWithdrawn = withdrawalsSnapshot.docs.reduce((sum, doc) => sum + doc.data().amount, 0);

        const allUsersSnapshot = await adminDb.collection("users").get();
        const allUsersMap = new Map(allUsersSnapshot.docs.map(doc => [doc.id, doc.data()]));

        const processReferrals = (referralDocs: FirebaseFirestore.QueryDocumentSnapshot[], level: 1 | 2 | 3): DirectReferral[] => {
            return referralDocs.map(doc => {
                const refData = doc.data();
                const customRates = level === 1 ? (userData.customCommissionRates || {}) : {};
                
                // Note: Commission generated is not calculated per level here, can be added later if needed.
                return {
                    id: doc.id,
                    name: `${refData.firstName || ''} ${refData.lastName || ''}`.trim() || refData.email,
                    email: refData.email,
                    totalDeposited: depositsByUserId.get(doc.id) || 0,
                    commissionGenerated: 0, // Placeholder
                    customRate: customRates[doc.id]
                };
            }).sort((a,b) => b.totalDeposited - a.totalDeposited);
        };

        const level1Docs = allUsersSnapshot.docs.filter(doc => doc.data().referredBy === userId);
        const level1Ids = level1Docs.map(doc => doc.id);
        
        const level2Docs = level1Ids.length > 0 ? allUsersSnapshot.docs.filter(doc => level1Ids.includes(doc.data().referredBy)) : [];
        const level2Ids = level2Docs.map(doc => doc.id);

        const level3Docs = level2Ids.length > 0 ? allUsersSnapshot.docs.filter(doc => level2Ids.includes(doc.data().referredBy)) : [];

        const details: UserDetailsData = {
            id: userDoc.id,
            firstName: userData.firstName || '',
            lastName: userData.lastName || '',
            email: userData.email || '',
            phone: userData.phone || '',
            cpf: userData.cpf || '',
            balance: userData.balance || 0,
            commissionBalance: userData.commissionBalance || 0,
            status: userData.status || 'active',
            createdAt: toISOStringOrNull(userData.createdAt),
            totalDeposited,
            totalWithdrawn,
            referredBy: userData.referredBy || null,
            referredByName: null,
            commissionRate: userData.commissionRate,
            commissionRateL2: userData.commissionRateL2,
            commissionRateL3: userData.commissionRateL3,
            role: userData.role || null,
            rtpRate: userData.rtpRate || null,
            directReferrals: processReferrals(level1Docs, 1),
            level2Referrals: processReferrals(level2Docs, 2),
            level3Referrals: processReferrals(level3Docs, 3),
        };

        if (details.referredBy) {
            const affiliateData = allUsersMap.get(details.referredBy);
            if (affiliateData) {
                details.referredByName = `${affiliateData.firstName} ${affiliateData.lastName}`.trim() || affiliateData.email;
            } else {
                details.referredByName = 'ID de Afiliado Não Encontrado';
            }
        }

        return { success: true, data: details };

    } catch (error: any) {
        console.error(`Error fetching details for user ${userId}:`, error);
        return { success: false, error: "Falha ao buscar detalhes do usuário." };
    }
}


// Action to get user's ledger history
export async function getUserLedger(userId: string): Promise<{ success: boolean; data?: LedgerEntry[]; error?: string }> {
    try {
        if (!userId) {
            return { success: false, error: "ID do usuário não fornecido." };
        }

        const adminDb = getAdminDb();
        const ledgerRef = adminDb.collection('user_ledger').where('userId', '==', userId).orderBy('createdAt', 'desc').limit(50);
        const snapshot = await ledgerRef.get();
        
        if(snapshot.empty) {
            return { success: true, data: [] };
        }
        
        const ledgerEntries = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                createdAt: toISOStringOrNull(data.createdAt),
            } as LedgerEntry;
        });

        return { success: true, data: ledgerEntries };

    } catch (error: any) {
        console.error(`Error fetching ledger for user ${userId}:`, error);
        return { success: false, error: "Falha ao buscar o extrato do usuário." };
    }
}


export async function updateUserDetails(userId: string, data: Pick<UserDetailsData, 'firstName' | 'lastName' | 'email' | 'phone' | 'cpf'>, adminId: string): Promise<{ success: boolean; error?: string }> {
    try {
        await verifyAdmin(adminId); // Security Check

        if (!userId) {
            return { success: false, error: "ID do usuário não fornecido." };
        }

        const adminDb = getAdminDb();
        const adminAuth = getAdminAuth();
        const userRef = adminDb.collection("users").doc(userId);
        const userDoc = await userRef.get();
        if (!userDoc.exists) {
             return { success: false, error: "Usuário não encontrado." };
        }
        const currentData = userDoc.data();

        // Update Firebase Auth if email has changed
        if (data.email && data.email !== currentData?.email) {
            await adminAuth.updateUser(userId, { email: data.email, displayName: `${data.firstName} ${data.lastName}`.trim() });
        } else {
             await adminAuth.updateUser(userId, { displayName: `${data.firstName} ${data.lastName}`.trim() });
        }
        
        // Update Firestore document
        await userRef.update(data);
        
        await logAdminAction(adminId, userId, 'UPDATE_USER_DETAILS', data, 'SUCCESS');
        return { success: true };

    } catch (error: any) {
        console.error(`Error updating details for user ${userId}:`, error);
        await logAdminAction(adminId, userId, 'UPDATE_USER_DETAILS', { error: error.message }, 'ERROR');
        if (error.code === 'auth/email-already-exists') {
            return { success: false, error: 'O e-mail fornecido já está em uso por outra conta.' };
        }
        return { success: false, error: "Falha ao atualizar os detalhes do usuário." };
    }
}

export async function updateUserPassword(userId: string, newPassword: string, adminId: string): Promise<{ success: boolean; error?: string }> {
    try {
        await verifyAdmin(adminId); // Security Check

        if (!userId) {
            return { success: false, error: "ID do usuário não fornecido." };
        }
        if (!newPassword || newPassword.length < 6) {
            return { success: false, error: "A nova senha deve ter no mínimo 6 caracteres." };
        }

        const adminAuth = getAdminAuth();
        await adminAuth.updateUser(userId, {
            password: newPassword,
        });
        
        await logAdminAction(adminId, userId, 'UPDATE_USER_PASSWORD', { success: true }, 'SUCCESS');
        return { success: true };

    } catch (error: any) {
        console.error(`Error updating password for user ${userId}:`, error);
        await logAdminAction(adminId, userId, 'UPDATE_USER_PASSWORD', { error: error.message }, 'ERROR');
        return { success: false, error: error.message || "Falha ao atualizar a senha do usuário." };
    }
}


export async function updateUserCommissionRate(userId: string, newRate: number, adminId: string): Promise<{ success: boolean; error?: string }> {
    try {
        await verifyAdmin(adminId); // Security Check
        if (!userId) {
            return { success: false, error: "ID do usuário não fornecido." };
        }
        if (typeof newRate !== 'number' || newRate < 0 || newRate > 100) {
            return { success: false, error: "Taxa de comissão inválida. Deve ser um número entre 0 e 100." };
        }

        const adminDb = getAdminDb();
        const userRef = adminDb.collection("users").doc(userId);
        // Rate is stored as percentage, e.g. 10 for 10%
        await userRef.update({ commissionRate: newRate });
        
        await logAdminAction(adminId, userId, 'UPDATE_USER_COMMISSION_L1', { newRate }, 'SUCCESS');
        return { success: true };

    } catch (error: any) {
        console.error(`Error updating commission rate for user ${userId}:`, error);
        await logAdminAction(adminId, userId, 'UPDATE_USER_COMMISSION_L1', { error: error.message }, 'ERROR');
        return { success: false, error: error.message || "Falha ao atualizar a taxa de comissão." };
    }
}

export async function updateCustomCommissionForUser(
    affiliateId: string, 
    referredUserId: string, 
    rate: number | null, 
    adminId: string
): Promise<{ success: boolean; error?: string }> {
     try {
        await verifyAdmin(adminId);
        if (!affiliateId || !referredUserId) {
            return { success: false, error: "IDs de afiliado e indicado são obrigatórios." };
        }
        if (rate !== null && (typeof rate !== 'number' || rate < 0 || rate > 100)) {
            return { success: false, error: "A taxa deve ser um número entre 0 e 100." };
        }

        const adminDb = getAdminDb();
        const affiliateRef = adminDb.collection('users').doc(affiliateId);
        const fieldName = `customCommissionRates.${referredUserId}`;

        if (rate === null) {
            // Remove the custom rate
            await affiliateRef.update({
                [fieldName]: FieldValue.delete()
            });
        } else {
            // Set or update the custom rate
            await affiliateRef.update({
                [fieldName]: rate
            });
        }
        
        await logAdminAction(adminId, affiliateId, 'UPDATE_CUSTOM_COMMISSION', { referredUserId, newRate: rate }, 'SUCCESS');
        return { success: true };

    } catch (error: any) {
        console.error("Error updating custom commission rate: ", error);
        await logAdminAction(adminId, affiliateId, 'UPDATE_CUSTOM_COMMISSION', { error: error.message }, 'ERROR');
        return { success: false, error: "Falha ao salvar a taxa de comissão personalizada." };
    }
}

export async function updateUserCommissionRateL2(userId: string, newRate: number, adminId: string): Promise<{ success: boolean; error?: string }> {
    try {
        await verifyAdmin(adminId); // Security Check
        if (!userId) {
            return { success: false, error: "ID do usuário não fornecido." };
        }
        if (typeof newRate !== 'number' || newRate < 0 || newRate > 100) {
            return { success: false, error: "Taxa de comissão inválida. Deve ser um número entre 0 e 100." };
        }

        const adminDb = getAdminDb();
        const userRef = adminDb.collection("users").doc(userId);
        await userRef.update({ commissionRateL2: newRate });

        await logAdminAction(adminId, userId, 'UPDATE_USER_COMMISSION_L2', { newRate }, 'SUCCESS');
        return { success: true };

    } catch (error: any) {
        console.error(`Error updating L2 commission rate for user ${userId}:`, error);
        await logAdminAction(adminId, userId, 'UPDATE_USER_COMMISSION_L2', { error: error.message }, 'ERROR');
        return { success: false, error: "Falha ao atualizar a taxa de comissão de Nível 2." };
    }
}

export async function updateUserCommissionRateL3(userId: string, newRate: number, adminId: string): Promise<{ success: boolean; error?: string }> {
    try {
        await verifyAdmin(adminId); // Security Check
        if (!userId) {
            return { success: false, error: "ID do usuário não fornecido." };
        }
        if (typeof newRate !== 'number' || newRate < 0 || newRate > 100) {
            return { success: false, error: "Taxa de comissão inválida. Deve ser um número entre 0 e 100." };
        }

        const adminDb = getAdminDb();
        const userRef = adminDb.collection("users").doc(userId);
        await userRef.update({ commissionRateL3: newRate });
        
        await logAdminAction(adminId, userId, 'UPDATE_USER_COMMISSION_L3', { newRate }, 'SUCCESS');
        return { success: true };

    } catch (error: any) {
        console.error(`Error updating L3 commission rate for user ${userId}:`, error);
        await logAdminAction(adminId, userId, 'UPDATE_USER_COMMISSION_L3', { error: error.message }, 'ERROR');
        return { success: false, error: "Falha ao atualizar a taxa de comissão de Nível 3." };
    }
}

export async function updateUserRole(userId: string, role: UserRole | null, adminId: string): Promise<{ success: boolean; error?: string }> {
    try {
        await verifyAdmin(adminId); // Security Check
        if (!userId) {
            return { success: false, error: "ID do usuário não fornecido." };
        }

        const adminDb = getAdminDb();
        const userRef = adminDb.collection("users").doc(userId);
        await userRef.update({ role: role || FieldValue.delete() });
        
        await logAdminAction(adminId, userId, 'UPDATE_USER_ROLE', { newRole: role }, 'SUCCESS');
        return { success: true };
    } catch (error: any) {
        console.error(`Error updating role for user ${userId}:`, error);
        await logAdminAction(adminId, userId, 'UPDATE_USER_ROLE', { error: error.message }, 'ERROR');
        return { success: false, error: error.message || "Falha ao atualizar o cargo do usuário." };
    }
}

export async function updateUserRtp(userId: string, rtpRate: number | null, adminId: string): Promise<{ success: boolean; error?: string }> {
    try {
        await verifyAdmin(adminId); // Security Check
        if (!userId) {
            return { success: false, error: "ID do usuário não fornecido." };
        }
        if (rtpRate !== null && (typeof rtpRate !== 'number' || rtpRate < 0 || rtpRate > 100)) {
            return { success: false, error: "A taxa de RTP deve ser um número entre 0 e 100." };
        }

        const adminDb = getAdminDb();
        const userRef = adminDb.collection("users").doc(userId);
        await userRef.update({ rtpRate: rtpRate === null ? FieldValue.delete() : rtpRate });
        
        await logAdminAction(adminId, userId, 'UPDATE_INFLUENCER_RTP', { newRtp: rtpRate }, 'SUCCESS');
        return { success: true };
    } catch (error: any) {
        console.error(`Error updating RTP for user ${userId}:`, error);
        await logAdminAction(adminId, userId, 'UPDATE_INFLUENCER_RTP', { error: error.message }, 'ERROR');
        return { success: false, error: error.message || "Falha ao atualizar o RTP do usuário." };
    }
}

export async function updateUserAffiliate(userId: string, newAffiliateId: string | null, adminId: string): Promise<{ success: boolean; error?: string }> {
    const action = 'UPDATE_USER_AFFILIATE';
    
    try {
        await verifyAdmin(adminId);
        await logAdminAction(adminId, userId, action, { status: 'START', newAffiliateId });

        if (!userId) {
            throw new Error("ID do usuário a ser alterado não fornecido.");
        }

        const adminDb = getAdminDb();
        const userRef = adminDb.collection("users").doc(userId);
        const userDoc = await userRef.get();

        if (!userDoc.exists) {
            throw new Error("Usuário a ser alterado não encontrado.");
        }

        const currentAffiliateId = userDoc.data()?.referredBy;

        // Prevent setting a user as their own affiliate
        if (userId === newAffiliateId) {
            throw new Error("Um usuário não pode ser afiliado de si mesmo.");
        }

        if (newAffiliateId) {
            // Check if the new affiliate exists
            const affiliateDoc = await adminDb.collection("users").doc(newAffiliateId).get();
            if (!affiliateDoc.exists) {
                throw new Error("O novo ID de afiliado não corresponde a um usuário existente.");
            }
            await userRef.update({ referredBy: newAffiliateId });
        } else {
            // Remove the affiliate
            await userRef.update({ referredBy: FieldValue.delete() });
        }

        await logAdminAction(adminId, userId, action, {
            status: 'SUCCESS',
            previousAffiliateId: currentAffiliateId || null,
            newAffiliateId: newAffiliateId || null,
        }, 'SUCCESS');

        return { success: true };

    } catch (error: any) {
        console.error(`Error updating affiliate for user ${userId}:`, error);
        await logAdminAction(adminId, userId, action, { status: 'ERROR', error: error.message }, 'ERROR');
        return { success: false, error: error.message || "Falha ao atualizar o afiliado do usuário." };
    }
}
