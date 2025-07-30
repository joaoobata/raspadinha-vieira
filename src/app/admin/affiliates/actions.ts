
'use server';

import { getAdminDb } from "@/lib/firebase-admin-init";

export interface AffiliateStat {
    id: string;
    name: string;
    referralCount: number; // Active referrals (who have deposited)
    referralDepositTotal: number;
    houseProfit: number; // GGR (lossAmount total) - commissionPaid
}

export async function getAffiliateStats(): Promise<{ success: boolean; data?: AffiliateStat[]; error?: string }> {
    try {
        const adminDb = getAdminDb();
        
        // Parallel fetching for better performance
        const [usersSnapshot, transactionsSnapshot, gamePlaysSnapshot, commissionsSnapshot] = await Promise.all([
            adminDb.collection('users').get(),
            adminDb.collection('transactions').where('status', '==', 'COMPLETED').get(),
            adminDb.collection('game_plays').get(),
            adminDb.collection('commissions').get()
        ]);

        const usersMap = new Map<string, FirebaseFirestore.DocumentData>();
        usersSnapshot.docs.forEach(doc => usersMap.set(doc.id, doc.data()));

        const depositsByUserId = new Map<string, number>();
        const depositingUserIds = new Set<string>();
        transactionsSnapshot.docs.forEach(doc => {
            const data = doc.data();
            depositsByUserId.set(data.userId, (depositsByUserId.get(data.userId) || 0) + data.amount);
            depositingUserIds.add(data.userId);
        });

        const ggrByReferredUserId = new Map<string, number>();
        gamePlaysSnapshot.docs.forEach(doc => {
            const data = doc.data();
            if (data.lossAmount > 0) {
                ggrByReferredUserId.set(data.userId, (ggrByReferredUserId.get(data.userId) || 0) + data.lossAmount);
            }
        });

        const commissionPaidToAffiliate = new Map<string, number>();
        commissionsSnapshot.docs.forEach(doc => {
            const data = doc.data();
            commissionPaidToAffiliate.set(data.affiliateId, (commissionPaidToAffiliate.get(data.affiliateId) || 0) + data.commissionEarned);
        });

        const activeAffiliates = new Map<string, { referredUsers: string[] }>();
        for (const userId of depositingUserIds) {
            const user = usersMap.get(userId);
            if (user?.referredBy) {
                const affiliateId = user.referredBy;
                if (!activeAffiliates.has(affiliateId)) {
                    activeAffiliates.set(affiliateId, { referredUsers: [] });
                }
                activeAffiliates.get(affiliateId)!.referredUsers.push(userId);
            }
        }
        
        if (activeAffiliates.size === 0) {
            return { success: true, data: [] };
        }

        const affiliateStatsList: AffiliateStat[] = [];
        
        for (const [affiliateId, { referredUsers }] of activeAffiliates.entries()) {
            const affiliateData = usersMap.get(affiliateId);
            if (!affiliateData) continue;

            let totalDeposit = 0;
            let totalGGR = 0;

            for (const userId of referredUsers) {
                 totalDeposit += depositsByUserId.get(userId) || 0;
                 totalGGR += ggrByReferredUserId.get(userId) || 0;
            }
            
            const totalCommissionPaid = commissionPaidToAffiliate.get(affiliateId) || 0;
            const houseProfit = totalGGR - totalCommissionPaid;
            const name = `${affiliateData.firstName} ${affiliateData.lastName}`.trim() || affiliateData.email;
        
            affiliateStatsList.push({
                id: affiliateId,
                name: name || 'Usuário Desconhecido',
                referralCount: referredUsers.length,
                referralDepositTotal: totalDeposit,
                houseProfit: houseProfit
            });
        }
        
        affiliateStatsList.sort((a, b) => b.houseProfit - a.houseProfit);

        return { success: true, data: affiliateStatsList };

    } catch (error: any) {
        console.error("Error fetching affiliate stats: ", error);
        return { success: false, error: "Falha ao buscar estatísticas de afiliados." };
    }
}
