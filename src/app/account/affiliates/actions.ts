
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


export async function getAccountStats(userId: string): Promise<{ success: boolean; data?: AffiliateStats; error?: string }> {
    if (!userId) {
        return { success: false, error: "Usuário não autenticado." };
    }

    try {
        const adminDb = getAdminDb();
        
        const [userDoc, settingsDoc, allUsersSnapshot, commissionsSnapshot] = await Promise.all([
            adminDb.collection('users').doc(userId).get(),
            adminDb.collection('settings').doc('general').get(),
            adminDb.collection('users').get(), // Needed to build the referral tree
            adminDb.collection('commissions').where('affiliateId', '==', userId).get()
        ]);

        if (!userDoc.exists) {
            return { success: false, error: "Usuário não encontrado." };
        }

        const userData = userDoc.data()!;
        const settingsData = settingsDoc.data() || {};

        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://raspadinha-jade.vercel.app';
        const referralLink = `${baseUrl}/c/${userId}`;
        
        const commissionPlan: CommissionPlan = {
            level1Rate: settingsData.commissionRateL1 ?? 0,
            level2Rate: settingsData.commissionRateL2 ?? 0,
            level3Rate: settingsData.commissionRateL3 ?? 0,
        };
        
        // Find referrals at each level
        const level1Docs = allUsersSnapshot.docs.filter(doc => doc.data().referredBy === userId);
        const level1Ids = level1Docs.map(doc => doc.id);
        
        const level2Docs = level1Ids.length > 0 ? allUsersSnapshot.docs.filter(doc => level1Ids.includes(doc.data().referredBy)) : [];
        const level2Ids = level2Docs.map(doc => doc.id);

        const level3Docs = level2Ids.length > 0 ? allUsersSnapshot.docs.filter(doc => level2Ids.includes(doc.data().referredBy)) : [];
        const level3Ids = level3Docs.map(doc => doc.id);

        const allReferralIds = [...level1Ids, ...level2Ids, ...level3Ids];

        const depositsByUserId: Map<string, number> = new Map();
        if(allReferralIds.length > 0) {
            // Fetch transactions in batches to avoid query limits
            const transactionsDocs = await fetchTransactionsInBatches(adminDb, allReferralIds);
            transactionsDocs.forEach(doc => {
                const data = doc.data();
                depositsByUserId.set(data.userId, (depositsByUserId.get(data.userId) || 0) + data.amount);
            });
        }
        
        const commissionDataByReferredId = new Map<string, { commissionBaseAmount: number, commissionGenerated: number, commissionRate: number }>();
        commissionsSnapshot.docs.forEach(doc => {
            const data = doc.data();
            const existing = commissionDataByReferredId.get(data.referredUserId) || { commissionBaseAmount: 0, commissionGenerated: 0, commissionRate: 0 };
            existing.commissionBaseAmount += data.depositAmount || 0;
            existing.commissionGenerated += data.commissionEarned;
            existing.commissionRate = (data.commissionRate || 0) * 100;
            commissionDataByReferredId.set(data.referredUserId, existing);
        });

        const processReferrals = (referralDocs: FirebaseFirestore.QueryDocumentSnapshot[], level: number): ReferralDetails[] => {
            return referralDocs.map(doc => {
                const referralData = doc.data();
                const totalDeposited = depositsByUserId.get(doc.id) || 0;
                const name = `${referralData.firstName} ${referralData.lastName}`.trim() || referralData.email;
                const commissionInfo = commissionDataByReferredId.get(doc.id);
                
                let defaultRate = 0;
                if(level === 1) defaultRate = commissionPlan.level1Rate;
                if(level === 2) defaultRate = commissionPlan.level2Rate;
                if(level === 3) defaultRate = commissionPlan.level3Rate;

                return {
                    id: doc.id,
                    name: name,
                    totalDeposited,
                    commissionBaseAmount: commissionInfo?.commissionBaseAmount || 0,
                    commissionGenerated: commissionInfo?.commissionGenerated || 0,
                    commissionRate: commissionInfo?.commissionRate ?? defaultRate,
                };
            }).sort((a,b) => b.commissionGenerated - a.commissionGenerated);
        };
        
        return {
            success: true,
            data: {
                referralLink,
                commissionBalance: userData.commissionBalance || 0,
                commissionPlan,
                level1: {
                    count: level1Docs.length,
                    referrals: processReferrals(level1Docs, 1),
                },
                level2: {
                    count: level2Docs.length,
                    referrals: processReferrals(level2Docs, 2),
                },
                level3: {
                    count: level3Docs.length,
                    referrals: processReferrals(level3Docs, 3),
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

            // Update balances - Increment main balance and reset commission balance
            transaction.update(userRef, {
                balance: FieldValue.increment(commissionBalance),
                commissionBalance: 0,
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
