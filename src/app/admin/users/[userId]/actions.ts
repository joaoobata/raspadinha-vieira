
'use server';

import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin-init";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { logAdminAction } from "@/lib/logging";
import { DemoPrizeProfile } from "../../influencers/actions";

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
    if (!adminUserDoc.exists) {
        throw new Error("Usuário administrador não encontrado.");
    }
    const adminData = adminUserDoc.data();
    if (!adminData?.roles || !adminData.roles.includes('admin')) {
         throw new Error("Acesso negado. Apenas administradores podem realizar esta ação.");
    }
}


export type UserRole = 'admin' | 'influencer' | 'afiliado';

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

    roles?: UserRole[];
    demoPrizeProfile?: DemoPrizeProfile;
    directReferrals: DirectReferral[];
    level2Referrals: DirectReferral[];
    level3Referrals: DirectReferral[];
    postbackUrl?: string;
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

// Helper to fetch transactions in batches to avoid Firestore's 30-item 'in' query limit
async function fetchTransactionsInBatches(adminDb: FirebaseFirestore.Firestore, userIds: string[]): Promise<FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>[]> {
    if (userIds.length === 0) {
        return [];
    }

    const allTransactions: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>[] = [];
    const batchSize = 30;

    for (let i = 0; i < userIds.length; i += batchSize) {
        const batchIds = userIds.slice(i, i + batchSize);
        if (batchIds.length > 0) {
            const snapshot = await adminDb.collection('transactions')
                .where('userId', 'in', batchIds)
                .where('status', '==', 'COMPLETED')
                .get();
            allTransactions.push(...snapshot.docs);
        }
    }
    return allTransactions;
}


// Action to get user details and aggregated data
export async function getUserDetails(userId: string): Promise<{ success: boolean; data?: UserDetailsData; error?: string }> {
    try {
        if (!userId) {
            return { success: false, error: "ID do usuário não fornecido." };
        }

        const adminDb = getAdminDb();
        const userRef = adminDb.collection("users").doc(userId);
        
        // --- Parallel Data Fetching ---
        const [userDoc, allUsersSnapshot] = await Promise.all([
            userRef.get(),
            adminDb.collection("users").get()
        ]);
        
        if (!userDoc.exists) {
            return { success: false, error: "Usuário não encontrado." };
        }
        
        const userData = userDoc.data()!;
        const allUsersMap = new Map(allUsersSnapshot.docs.map(doc => [doc.id, {id: doc.id, ...doc.data()} as FirebaseFirestore.DocumentData]));

        const l1ReferralDocs: FirebaseFirestore.DocumentData[] = [];
        const l2ReferralDocs: FirebaseFirestore.DocumentData[] = [];
        const l3ReferralDocs: FirebaseFirestore.DocumentData[] = [];
        
        const l1Ids: string[] = [];
        const l2Ids: string[] = [];

        allUsersSnapshot.forEach(doc => {
            const data = doc.data();
            if(data.referredBy === userId) {
                l1ReferralDocs.push({id: doc.id, ...data});
                l1Ids.push(doc.id);
            }
        });

        if (l1Ids.length > 0) {
            allUsersSnapshot.forEach(doc => {
                const data = doc.data();
                if(l1Ids.includes(data.referredBy)) {
                    l2ReferralDocs.push({id: doc.id, ...data});
                    l2Ids.push(doc.id);
                }
            });
        }
        
        if (l2Ids.length > 0) {
            allUsersSnapshot.forEach(doc => {
                const data = doc.data();
                if(l2Ids.includes(data.referredBy)) {
                    l3ReferralDocs.push({id: doc.id, ...data});
                }
            });
        }
        
        const allReferralIds = [
            userId,
            ...l1ReferralDocs.map(d => d.id),
            ...l2ReferralDocs.map(d => d.id),
            ...l3ReferralDocs.map(d => d.id),
        ];
        
        // Fetch only relevant transactions and commissions
        const [transactionsDocs, commissionsSnapshot, withdrawalsSnapshot] = await Promise.all([
             fetchTransactionsInBatches(adminDb, allReferralIds),
             adminDb.collection('commissions').where('affiliateId', '==', userId).get(),
             adminDb.collection("withdrawals").where("userId", "==", userId).where("status", "==", "COMPLETED").get()
        ]);

        const depositsByUserId = new Map<string, number>();
        transactionsDocs.forEach(doc => {
            const data = doc.data();
            depositsByUserId.set(data.userId, (depositsByUserId.get(data.userId) || 0) + data.amount);
        });

        const commissionByReferredId = new Map<string, number>();
        commissionsSnapshot.forEach(doc => {
            const data = doc.data();
            commissionByReferredId.set(data.referredUserId, (commissionByReferredId.get(data.referredUserId) || 0) + data.commissionEarned);
        });
        
        const totalDeposited = depositsByUserId.get(userId) || 0;
        const totalWithdrawn = withdrawalsSnapshot.docs.reduce((sum, doc) => sum + doc.data().amount, 0);

        const processReferrals = (referralDocs: FirebaseFirestore.DocumentData[]): DirectReferral[] => {
            return referralDocs.map(refData => {
                const customRates = userData.customCommissionRates || {};
                
                return {
                    id: refData.id,
                    name: `${refData.firstName || ''} ${refData.lastName || ''}`.trim() || refData.email,
                    email: refData.email,
                    totalDeposited: depositsByUserId.get(refData.id) || 0,
                    commissionGenerated: commissionByReferredId.get(refData.id) || 0,
                    customRate: customRates[refData.id]
                };
            }).sort((a,b) => b.totalDeposited - a.totalDeposited);
        };

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
            roles: userData.roles || [],
            demoPrizeProfile: userData.demoPrizeProfile || 'medium',
            directReferrals: processReferrals(l1ReferralDocs),
            level2Referrals: processReferrals(l2ReferralDocs),
            level3Referrals: processReferrals(l3ReferralDocs),
            postbackUrl: userData.postbackUrl,
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


export interface PaginatedLedgerResponse {
    entries: LedgerEntry[];
    lastDocId: string | null;
}

// Action to get user's ledger history with pagination
export async function getUserLedger(
    userId: string,
    startAfterDocId?: string
): Promise<{ success: boolean; data?: PaginatedLedgerResponse; error?: string }> {
    try {
        if (!userId) {
            return { success: false, error: "ID do usuário não fornecido." };
        }

        const adminDb = getAdminDb();
        const ledgerCollection = adminDb.collection('user_ledger');
        const pageSize = 20;

        let query = ledgerCollection
            .where('userId', '==', userId)
            .orderBy('createdAt', 'desc')
            .limit(pageSize);

        if (startAfterDocId) {
            const startAfterDoc = await ledgerCollection.doc(startAfterDocId).get();
            if (startAfterDoc.exists) {
                query = query.startAfter(startAfterDoc);
            }
        }
        
        const snapshot = await query.get();
        
        if (snapshot.empty) {
            return { success: true, data: { entries: [], lastDocId: null } };
        }
        
        const entries = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                createdAt: toISOStringOrNull(data.createdAt),
            } as LedgerEntry;
        });
        
        const lastVisibleDoc = snapshot.docs[snapshot.docs.length - 1];
        const lastDocId = snapshot.size < pageSize ? null : lastVisibleDoc.id;

        return { success: true, data: { entries, lastDocId } };

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

export async function updateUserRoles(userId: string, roles: UserRole[], adminId: string): Promise<{ success: boolean; error?: string }> {
    try {
        await verifyAdmin(adminId);
        if (!userId) {
            return { success: false, error: "ID do usuário não fornecido." };
        }
        
        const validRoles: UserRole[] = ['admin', 'influencer', 'afiliado'];
        const newRoles = roles.filter(role => validRoles.includes(role));

        const adminDb = getAdminDb();
        const userRef = adminDb.collection("users").doc(userId);
        
        await userRef.update({ roles: newRoles });
        
        await logAdminAction(adminId, userId, 'UPDATE_USER_ROLES', { newRoles }, 'SUCCESS');
        return { success: true };
    } catch (error: any) {
        console.error(`Error updating roles for user ${userId}:`, error);
        await logAdminAction(adminId, userId, 'UPDATE_USER_ROLES', { error: error.message, stack: error.stack }, 'ERROR');
        return { success: false, error: "Falha ao atualizar cargos do usuário." };
    }
}

export async function updateUserDemoProfile(userId: string, profile: DemoPrizeProfile | null, adminId: string): Promise<{ success: boolean; error?: string }> {
    try {
        await verifyAdmin(adminId); // Security Check
        if (!userId) {
            return { success: false, error: "ID do usuário não fornecido." };
        }
        if (profile !== null && !['low', 'medium', 'high'].includes(profile)) {
            return { success: false, error: "Perfil de prêmio inválido." };
        }

        const adminDb = getAdminDb();
        const userRef = adminDb.collection("users").doc(userId);
        // Use delete() to remove the field if null is passed, otherwise set it.
        await userRef.update({ demoPrizeProfile: profile === null ? FieldValue.delete() : profile });
        
        await logAdminAction(adminId, userId, 'UPDATE_INFLUENCER_DEMO_PROFILE', { newProfile: profile }, 'SUCCESS');
        return { success: true };
    } catch (error: any) {
        console.error(`Error updating demo profile for user ${userId}:`, error);
        await logAdminAction(adminId, userId, 'UPDATE_INFLUENCER_DEMO_PROFILE', { error: error.message }, 'ERROR');
        return { success: false, error: error.message || "Falha ao atualizar o perfil de prêmio do usuário." };
    }
}

export async function updateUserPostbackUrl(userId: string, postbackUrl: string | null, adminId: string): Promise<{ success: boolean, error?: string }> {
    try {
        await verifyAdmin(adminId);
        if (!userId) throw new Error("ID do usuário não fornecido.");

        const adminDb = getAdminDb();
        const userRef = adminDb.collection('users').doc(userId);

        const urlToSave = postbackUrl && postbackUrl.trim() !== '' ? postbackUrl.trim() : FieldValue.delete();
        await userRef.update({ postbackUrl: urlToSave });

        await logAdminAction(adminId, userId, 'UPDATE_POSTBACK_URL', { newUrl: urlToSave === FieldValue.delete() ? null : urlToSave }, 'SUCCESS');
        return { success: true };
    } catch (error: any) {
        console.error(`Error updating postback URL for user ${userId}:`, error);
        await logAdminAction(adminId, userId, 'UPDATE_POSTBACK_URL', { error: error.message }, 'ERROR');
        return { success: false, error: error.message || "Falha ao atualizar a URL de postback." };
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

export async function searchUsers(searchTerm: string): Promise<{ success: boolean; data?: UserDetailsData[]; error?: string }> {
    if (!searchTerm || searchTerm.length < 2) {
        return { success: true, data: [] };
    }
    try {
        const adminDb = getAdminDb();
        const lowerCaseSearchTerm = searchTerm.toLowerCase();

        // This is a very basic search. For production, consider a dedicated search service like Algolia or Typesense.
        const usersSnapshot = await adminDb.collection('users').get();
        const filteredUsers: UserDetailsData[] = [];
        
        usersSnapshot.forEach(doc => {
            const data = doc.data();
            const name = `${data.firstName || ''} ${data.lastName || ''}`.toLowerCase();
            const email = (data.email || '').toLowerCase();

            if (name.includes(lowerCaseSearchTerm) || email.includes(lowerCaseSearchTerm)) {
                filteredUsers.push({
                    id: doc.id,
                    firstName: data.firstName || '',
                    lastName: data.lastName || '',
                    email: data.email || '',
                    phone: data.phone || '',
                    cpf: data.cpf || '',
                    balance: data.balance || 0,
                    commissionBalance: data.commissionBalance || 0,
                    status: data.status || 'active',
                    createdAt: toISOStringOrNull(data.createdAt),
                    totalDeposited: 0, // Not needed for search result
                    totalWithdrawn: 0, // Not needed for search result
                    referredBy: data.referredBy || null,
                    directReferrals: [],
                    level2Referrals: [],
                    level3Referrals: [],
                    referredByName: ''
                });
            }
        });
        
        return { success: true, data: filteredUsers.slice(0, 10) }; // Limit to 10 results

    } catch (error: any) {
        console.error("Error searching users: ", error);
        return { success: false, error: "Falha ao buscar usuários." };
    }
}

    
