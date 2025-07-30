
'use server';

import { getAdminDb } from "@/lib/firebase-admin-init";
import { FieldValue } from "firebase-admin/firestore";
import { logSystemEvent } from "@/lib/logging";

interface ReferralDetails {
    id: string;
    name: string;
    totalDeposited: number;
    commissionBaseAmount: number; // Sum of depositAmount from commissions
    commissionGenerated: number;
    commissionRate: number; // The actual rate applied, as a percentage number (e.g., 10 for 10%)
}

interface RegistrationDetails {
    id: string;
    name: string;
    email: string;
    phone: string;
    level: 1 | 2 | 3;
}

interface CommissionPlan {
    level1Rate: number;
    level2Rate: number;
    level3Rate: number;
}

interface AffiliateStats {
    referralLink: string;
    commissionBalance: number;
    commissionPlan: CommissionPlan;
    level1: {
        count: number;
        referrals: ReferralDetails[];
    },
    level2: {
        count: number;
        referrals: ReferralDetails[];
    },
    level3: {
        count: number;
        referrals: ReferralDetails[];
    },
}

export async function getAccountStats(userId: string): Promise<{ success: boolean; data?: AffiliateStats; error?: string }> {
    if (!userId) {
        return { success: false, error: "Usuário não autenticado." };
    }

    try {
        const adminDb = getAdminDb();
        const userDocRef = adminDb.collection('users').doc(userId);
        const settingsRef = adminDb.collection('settings').doc('general');
        
        const [userDoc, settingsDoc, allUsersSnapshot, transactionsSnapshot, commissionsSnapshot] = await Promise.all([
            userDocRef.get(),
            settingsRef.get(),
            adminDb.collection('users').get(),
            adminDb.collection('transactions').where('status', '==', 'COMPLETED').get(),
            adminDb.collection('commissions').where('affiliateId', '==', userId).get()
        ]);

        if (!userDoc.exists) {
            return { success: false, error: "Usuário não encontrado." };
        }
        
        const userData = userDoc.data()!;
        const settingsData = settingsDoc.data() || {};

        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://raspadinha-jade.vercel.app';
        const referralLink = `${baseUrl}/?ref=${userId}`;
        
        const commissionPlan: CommissionPlan = {
            level1Rate: settingsData.commissionRateL1 ?? 0,
            level2Rate: settingsData.commissionRateL2 ?? 0,
            level3Rate: settingsData.commissionRateL3 ?? 0,
        };
        
        const depositsByUserId: Map<string, number> = new Map();
        transactionsSnapshot.docs.forEach(doc => {
            const data = doc.data();
            depositsByUserId.set(data.userId, (depositsByUserId.get(data.userId) || 0) + data.amount);
        });
        
        const commissionDataByReferredId = new Map<string, { commissionBaseAmount: number, commissionGenerated: number, commissionRate: number }>();

        commissionsSnapshot.docs.forEach(doc => {
            const data = doc.data();
            const existing = commissionDataByReferredId.get(data.referredUserId) || { commissionBaseAmount: 0, commissionGenerated: 0, commissionRate: 0 };
            existing.commissionBaseAmount += data.depositAmount || 0; // Use depositAmount
            existing.commissionGenerated += data.commissionEarned;
            // The rate from the commission document is a decimal (e.g., 0.1 for 10%), so we multiply by 100 here.
            existing.commissionRate = (data.commissionRate || 0) * 100;
            commissionDataByReferredId.set(data.referredUserId, existing);
        });

        const processReferrals = (referralDocs: FirebaseFirestore.QueryDocumentSnapshot[], level: number): ReferralDetails[] => {
            const referrals: ReferralDetails[] = [];
            referralDocs.forEach(doc => {
                const referralData = doc.data();
                const totalDeposited = depositsByUserId.get(doc.id) || 0;
                const name = `${referralData.firstName} ${referralData.lastName}`.trim() || referralData.email;
                
                const commissionInfo = commissionDataByReferredId.get(doc.id);
                
                let defaultRate = 0;
                if(level === 1) defaultRate = commissionPlan.level1Rate;
                if(level === 2) defaultRate = commissionPlan.level2Rate;
                if(level === 3) defaultRate = commissionPlan.level3Rate;

                referrals.push({
                    id: doc.id,
                    name: name,
                    totalDeposited,
                    commissionBaseAmount: commissionInfo?.commissionBaseAmount || 0,
                    commissionGenerated: commissionInfo?.commissionGenerated || 0,
                    commissionRate: commissionInfo?.commissionRate ?? defaultRate,
                });

            });
            return referrals.sort((a,b) => b.commissionGenerated - a.commissionGenerated);
        };

        const level1Docs = allUsersSnapshot.docs.filter(doc => doc.data().referredBy === userId);
        const level1Referrals = processReferrals(level1Docs, 1);
        
        const level1Ids = level1Docs.map(doc => doc.id);
        const level2Docs = level1Ids.length > 0 ? allUsersSnapshot.docs.filter(doc => level1Ids.includes(doc.data().referredBy)) : [];
        const level2Referrals = processReferrals(level2Docs, 2);

        const level2Ids = level2Docs.map(doc => doc.id);
        const level3Docs = level2Ids.length > 0 ? allUsersSnapshot.docs.filter(doc => level2Ids.includes(doc.data().referredBy)) : [];
        const level3Referrals = processReferrals(level3Docs, 3);

        return {
            success: true,
            data: {
                referralLink,
                commissionBalance: userData.commissionBalance || 0,
                commissionPlan,
                level1: {
                    count: level1Docs.length,
                    referrals: level1Referrals,
                },
                level2: {
                    count: level2Docs.length,
                    referrals: level2Referrals,
                },
                level3: {
                    count: level3Docs.length,
                    referrals: level3Referrals,
                },
            },
        };

    } catch (error: any) {
        console.error("Error fetching multi-level affiliate stats: ", error);
        await logSystemEvent(userId, 'user', 'GET_AFFILIATE_STATS_FAIL', { error: error.message, stack: error.stack }, 'ERROR');
        return { success: false, error: "Falha ao buscar estatísticas da conta. Tente novamente." };
    }
}


export async function claimCommissionBalance(userId: string): Promise<{success: boolean, error?: string}> {
    if (!userId) {
        return { success: false, error: "Usuário não autenticado." };
    }

    const adminDb = getAdminDb();
    const userRef = adminDb.collection('users').doc(userId);

    try {
        await adminDb.runTransaction(async (transaction) => {
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists) {
                throw new Error("Usuário não encontrado.");
            }
            const userData = userDoc.data()!;
            const commissionBalance = userData.commissionBalance || 0;

            if (commissionBalance <= 0) {
                throw new Error("Nenhum saldo de comissão para resgatar.");
            }
            
            const mainBalance = userData.balance || 0;
            const newMainBalance = mainBalance + commissionBalance;

            // Create ledger entry for the claim
            const ledgerRef = adminDb.collection('user_ledger').doc();
            transaction.set(ledgerRef, {
                userId,
                type: 'COMMISSION_CLAIM',
                amount: commissionBalance,
                description: `Resgate de saldo de comissão.`,
                balanceBefore: mainBalance,
                balanceAfter: newMainBalance,
                refId: `claim-${userId}-${Date.now()}`,
                createdAt: FieldValue.serverTimestamp(),
            });

            // Update balances
            transaction.update(userRef, {
                balance: newMainBalance,
                commissionBalance: 0, // Reset commission balance
            });
        });
        
        await logSystemEvent(userId, 'user', 'COMMISSION_CLAIM_SUCCESS', { status: 'success' }, 'SUCCESS');
        return { success: true };

    } catch (error: any) {
        console.error("Error claiming commission balance:", error);
        await logSystemEvent(userId, 'user', 'COMMISSION_CLAIM_FAIL', { error: error.message, stack: error.stack }, 'ERROR');
        return { success: false, error: error.message || "Falha ao resgatar comissões. Tente novamente." };
    }
}
