
'use server';

import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin-init";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { logAdminAction } from "@/lib/logging";

export type DemoPrizeProfile = 'low' | 'medium' | 'high';

export interface InfluencerData {
    id: string;
    email: string;
    name: string;
    balance: number;
    demoPrizeProfile?: DemoPrizeProfile;
    createdAt: string | null;
}


export async function listInfluencers(): Promise<{ success: boolean; data?: InfluencerData[]; error?: string }> {
    try {
        const adminDb = getAdminDb();
        const snapshot = await adminDb.collection('users').where('roles', 'array-contains', 'influencer').get();
        
        const influencers = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                email: data.email,
                name: `${data.firstName || ''} ${data.lastName || ''}`.trim() || data.email,
                balance: data.balance || 0,
                demoPrizeProfile: data.demoPrizeProfile || 'medium', // Default to medium
                createdAt: data.createdAt ? (data.createdAt as Timestamp).toDate().toISOString() : null,
            };
        });

        influencers.sort((a, b) => {
            if (a.createdAt && b.createdAt) {
                return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
            }
            return 0;
        });

        return { success: true, data: influencers };
    } catch (error: any) {
        return { success: false, error: "Falha ao listar influenciadores." };
    }
}

export async function createDemoAccounts(count: number, prefix: string, adminId: string): Promise<{ success: boolean, error?: string, data?: { email: string, password: string }[] }> {
    // Admin verification
    if (!adminId) return { success: false, error: "Admin não autenticado." };
    const adminDb = getAdminDb();
    try {
        const adminUserDoc = await adminDb.collection('users').doc(adminId).get();
        if (!adminUserDoc.exists || !adminUserDoc.data()?.roles?.includes('admin')) {
             await logAdminAction(adminId, 'SYSTEM', 'CREATE_DEMO_ACCOUNTS_FAIL', { error: "Permission denied", reason: "User is not an admin" }, 'ERROR');
            return { success: false, error: "Acesso negado." };
        }
    } catch (e: any) {
         await logAdminAction(adminId, 'SYSTEM', 'CREATE_DEMO_ACCOUNTS_FAIL', { error: e.message, reason: "Error verifying admin" }, 'ERROR');
        return { success: false, error: "Falha ao verificar permissões." };
    }
    
    try {
        await logAdminAction(adminId, 'SYSTEM', 'CREATE_DEMO_ACCOUNTS_START', { count, prefix }, 'INFO');
        if (count <= 0 || count > 50) {
            throw new Error("O número de contas deve ser entre 1 e 50.");
        }

        const adminAuth = getAdminAuth();
        const createdAccounts = [];
        const batch = adminDb.batch();

        const usersRef = adminDb.collection('users');
        const querySnapshot = await usersRef.where('email', '>=', `${prefix}_`).where('email', '<', `${prefix}_\uf8ff`).get();
        
        let lastNumber = 0;
        const emailRegex = new RegExp(`^${prefix}_(\\d+)@demomail\\.com$`);
        querySnapshot.forEach(doc => {
            const match = doc.data().email.match(emailRegex);
            if (match) {
                const num = parseInt(match[1], 10);
                if (num > lastNumber) {
                    lastNumber = num;
                }
            }
        });
        
        const password = '12345678';

        for (let i = 1; i <= count; i++) {
            const newNumber = lastNumber + i;
            const email = `${prefix}_${newNumber}@demomail.com`;
            const displayName = `${prefix} ${newNumber}`;

            const userRecord = await adminAuth.createUser({ email, password, displayName });
            
            const userRef = adminDb.collection('users').doc(userRecord.uid);
            batch.set(userRef, {
                firstName: prefix,
                lastName: newNumber.toString(),
                email,
                roles: ['influencer'],
                balance: 0,
                prizeBalance: 0,
                commissionBalance: 0,
                status: 'active',
                createdAt: FieldValue.serverTimestamp(),
                ftd: false,
                demoPrizeProfile: 'medium', // Default profile
            });

            createdAccounts.push({ email, password });
        }
        
        await batch.commit();
        await logAdminAction(adminId, 'SYSTEM', 'CREATE_DEMO_ACCOUNTS_SUCCESS', { count, prefix, createdCount: createdAccounts.length }, 'SUCCESS');

        return { success: true, data: createdAccounts };
    } catch (error: any) {
        await logAdminAction(adminId, 'SYSTEM', 'CREATE_DEMO_ACCOUNTS_FAIL', { error: error.message, count, prefix }, 'ERROR');
        return { success: false, error: error.message };
    }
}

export async function setBulkBalance(amount: number, adminId: string): Promise<{ success: boolean; error?: string; count?: number }> {
    const adminDb = getAdminDb();

    // Step 1: Verify admin permissions directly.
    if (!adminId) {
        return { success: false, error: "Admin não autenticado." };
    }
    try {
        const adminUserDoc = await adminDb.collection('users').doc(adminId).get();
        if (!adminUserDoc.exists || !adminUserDoc.data()?.roles?.includes('admin')) {
            await logAdminAction(adminId, 'SYSTEM_INFLUENCERS', 'SET_BULK_BALANCE_FAIL', { error: "Permission Denied", amount }, 'ERROR');
            return { success: false, error: "Acesso negado. Apenas administradores podem realizar esta ação." };
        }
    } catch (e: any) {
        await logAdminAction(adminId, 'SYSTEM_INFLUENCERS', 'SET_BULK_BALANCE_FAIL', { error: e.message, amount, reason: "Error verifying admin" }, 'ERROR');
        return { success: false, error: "Falha ao verificar permissões de administrador." };
    }

    // Step 2: Proceed with the action logic inside a try...catch block.
    try {
        await logAdminAction(adminId, 'SYSTEM_INFLUENCERS', 'SET_BULK_BALANCE_START', { amount }, 'INFO');
        
        const snapshot = await adminDb.collection('users').where('roles', 'array-contains', 'influencer').get();
        
        if (snapshot.empty) {
            await logAdminAction(adminId, 'SYSTEM_INFLUENCERS', 'SET_BULK_BALANCE_SUCCESS', { message: "No influencer accounts found", count: 0 }, 'SUCCESS');
            return { success: true, count: 0 };
        }

        const batch = adminDb.batch();
        snapshot.docs.forEach(doc => {
            const userRef = adminDb.collection('users').doc(doc.id);
            batch.update(userRef, { balance: amount });
        });

        await batch.commit();
        await logAdminAction(adminId, 'SYSTEM_INFLUENCERS', 'SET_BULK_BALANCE_SUCCESS', { amount, count: snapshot.size }, 'SUCCESS');
        return { success: true, count: snapshot.size };

    } catch (error: any) {
        await logAdminAction(adminId, 'SYSTEM_INFLUENCERS', 'SET_BULK_BALANCE_FAIL', { error: error.message, amount }, 'ERROR');
        return { success: false, error: error.message };
    }
}


export async function setBulkDemoProfile(profile: DemoPrizeProfile | null, adminId: string): Promise<{ success: boolean, error?: string, count?: number }> {
    const adminDb = getAdminDb();
    // Admin verification
    if (!adminId) {
        return { success: false, error: "Admin não autenticado." };
    }
    try {
        const adminUserDoc = await adminDb.collection('users').doc(adminId).get();
        if (!adminUserDoc.exists || !adminUserDoc.data()?.roles?.includes('admin')) {
            await logAdminAction(adminId, 'SYSTEM_INFLUENCERS', 'SET_BULK_DEMO_PROFILE_FAIL', { error: "Permission Denied", profile }, 'ERROR');
            return { success: false, error: "Acesso negado." };
        }
    } catch(e: any) {
        await logAdminAction(adminId, 'SYSTEM_INFLUENCERS', 'SET_BULK_DEMO_PROFILE_FAIL', { error: e.message, reason: "Error verifying admin" }, 'ERROR');
        return { success: false, error: "Falha ao verificar permissões." };
    }

     try {
         await logAdminAction(adminId, 'SYSTEM_INFLUENCERS', 'SET_BULK_DEMO_PROFILE_START', { profile }, 'INFO');
         if (profile && !['low', 'medium', 'high'].includes(profile)) {
            throw new Error("Perfil de prêmio inválido.");
        }

        const snapshot = await adminDb.collection('users').where('roles', 'array-contains', 'influencer').get();

        if (snapshot.empty) {
            await logAdminAction(adminId, 'SYSTEM_INFLUENCERS', 'SET_BULK_DEMO_PROFILE_SUCCESS', { message: "No influencer accounts found", count: 0 }, 'SUCCESS');
            return { success: true, count: 0 };
        }
        
        const batch = adminDb.batch();
        // If profile is null, we can remove the field or set a default. Let's set a default 'medium'.
        const profileUpdate = profile === null ? 'medium' : profile;

        snapshot.docs.forEach(doc => {
            const userRef = adminDb.collection('users').doc(doc.id);
            batch.update(userRef, { demoPrizeProfile: profileUpdate });
        });

        await batch.commit();
        await logAdminAction(adminId, 'SYSTEM_INFLUENCERS', 'SET_BULK_DEMO_PROFILE_SUCCESS', { profile, count: snapshot.size }, 'SUCCESS');
        return { success: true, count: snapshot.size };
    } catch (error: any) {
        await logAdminAction(adminId, 'SYSTEM_INFLUENCERS', 'SET_BULK_DEMO_PROFILE_FAIL', { error: error.message, profile }, 'ERROR');
        return { success: false, error: error.message };
    }
}


export async function addInfluencerByEmail(email: string, adminId: string): Promise<{ success: boolean; error?: string; message?: string }> {
     // Admin verification
    if (!adminId) return { success: false, error: "Admin não autenticado." };
    const adminDb = getAdminDb();
    try {
        const adminUserDoc = await adminDb.collection('users').doc(adminId).get();
        if (!adminUserDoc.exists || !adminUserDoc.data()?.roles?.includes('admin')) {
            await logAdminAction(adminId, 'UNKNOWN', 'ADD_INFLUENCER_ROLE_FAIL', { error: "Permission Denied", email }, 'ERROR');
            return { success: false, error: "Acesso negado." };
        }
    } catch(e: any) {
        await logAdminAction(adminId, 'UNKNOWN', 'ADD_INFLUENCER_ROLE_FAIL', { error: e.message, reason: "Error verifying admin" }, 'ERROR');
        return { success: false, error: "Falha ao verificar permissões." };
    }

    
    try {
        await logAdminAction(adminId, 'UNKNOWN', 'ADD_INFLUENCER_ROLE_START', { email }, 'INFO');
        if (!email) {
            return { success: false, error: "O e-mail do usuário é obrigatório." };
        }

        const usersRef = adminDb.collection('users');
        const querySnapshot = await usersRef.where('email', '==', email.trim()).limit(1).get();

        if (querySnapshot.empty) {
            return { success: false, error: `Nenhum usuário encontrado com o e-mail: ${email}` };
        }

        const userDoc = querySnapshot.docs[0];
        const userRef = userDoc.ref;
        const userData = userDoc.data();

        if (userData.roles && userData.roles.includes('influencer')) {
            return { success: false, error: `O usuário ${email} já é um influenciador.` };
        }

        await userRef.update({
            roles: FieldValue.arrayUnion('influencer')
        });
        
        await logAdminAction(adminId, userDoc.id, 'ADD_INFLUENCER_ROLE_SUCCESS', { email: userDoc.data().email }, 'SUCCESS');
        return { success: true, message: `O usuário ${email} foi adicionado como influenciador.` };

    } catch (error: any) {
        await logAdminAction(adminId, 'UNKNOWN', 'ADD_INFLUENCER_ROLE_FAIL', { email, error: error.message }, 'ERROR');
        return { success: false, error: "Ocorreu um erro ao tentar adicionar o cargo de influenciador." };
    }
}

export async function removeInfluencerRole(userId: string, adminId: string): Promise<{ success: boolean; error?: string }> {
     // Admin verification
    if (!adminId) return { success: false, error: "Admin não autenticado." };
    const adminDb = getAdminDb();
    try {
        const adminUserDoc = await adminDb.collection('users').doc(adminId).get();
        if (!adminUserDoc.exists || !adminUserDoc.data()?.roles?.includes('admin')) {
            await logAdminAction(adminId, userId, 'REMOVE_INFLUENCER_ROLE_FAIL', { error: "Permission Denied" }, 'ERROR');
            return { success: false, error: "Acesso negado." };
        }
    } catch(e: any) {
        await logAdminAction(adminId, userId, 'REMOVE_INFLUENCER_ROLE_FAIL', { error: e.message, reason: "Error verifying admin" }, 'ERROR');
        return { success: false, error: "Falha ao verificar permissões." };
    }
    
    try {
        await logAdminAction(adminId, userId, 'REMOVE_INFLUENCER_ROLE_START', {}, 'INFO');
        if (!userId) {
            return { success: false, error: "ID do usuário não fornecido." };
        }

        const userRef = adminDb.collection('users').doc(userId);

        await userRef.update({
            roles: FieldValue.arrayRemove('influencer')
        });

        await logAdminAction(adminId, userId, 'REMOVE_INFLUENCER_ROLE_SUCCESS', { success: true }, 'SUCCESS');
        return { success: true };

    } catch (error: any) {
        await logAdminAction(adminId, userId, 'REMOVE_INFLUENCER_ROLE_FAIL', { error: error.message }, 'ERROR');
        return { success: false, error: "Falha ao remover o cargo de influenciador." };
    }
}
    
