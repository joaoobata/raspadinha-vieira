

'use server';

import { getAdminDb } from "@/lib/firebase-admin-init";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import { startOfDay, endOfDay, subDays, startOfMonth, endOfMonth, startOfYesterday, endOfYesterday, eachDayOfInterval, format, isValid, parseISO, isWithinInterval } from 'date-fns';
import { logSystemEvent } from "@/lib/logging";


export interface DailyData {
    date: string;
    registrations: number;
    commissions: number;
}

export interface ReferralDetails {
    id: string;
    name: string;
    totalDeposited: number;
    commissionGenerated: number;
}

export interface AffiliateDashboardStats {
    totalClicks: number;
    totalRegistrations: number;
    totalDepositors: number;
    totalDepositsCount: number;
    totalDepositedValue: number;
    totalCommissionGenerated: number;
    commissionBalance: number;
    dailyData: DailyData[];
    level1Referrals: ReferralDetails[];
    level2Referrals: ReferralDetails[];
    level3Referrals: ReferralDetails[];
}

export interface TrafficAnalyticData {
    dailyChartData: { clicks: number, registrations: number, date: string }[];
    campaignPerformance: CampaignPerformanceData[];
}

export interface CampaignPerformanceData {
    date: string;
    source: string | null;
    campaign: string | null;
    device: 'Mobile' | 'Desktop' | 'Other';
    clicks: number;
    registrations: number;
}

export interface CommissionReportData {
    id: string; // commission doc id
    createdAt: string | null;
    referredUserName: string;
    depositAmount: number;
    commissionRate: number;
    commissionEarned: number;
    utm_source: string | null;
    utm_campaign: string | null;
}


// Helper to safely convert Timestamps
const toISOStringOrNull = (timestamp: Timestamp | undefined): string | null => {
    try {
        return timestamp ? timestamp.toDate().toISOString() : null;
    } catch (error) {
        return null;
    }
};

// Helper to get date range from a string preset
const getDateRange = (period: 'today' | 'yesterday' | 'last7' | 'this_month'): { from: Date, to: Date } => {
    const now = new Date();
    switch (period) {
        case 'today':
            return { from: startOfDay(now), to: endOfDay(now) };
        case 'yesterday':
            return { from: startOfYesterday(), to: endOfYesterday() };
        case 'last7':
            return { from: startOfDay(subDays(now, 6)), to: endOfDay(now) };
        case 'this_month':
            return { from: startOfMonth(now), to: endOfMonth(now) };
        default:
            return { from: startOfDay(subDays(now, 6)), to: endOfDay(now) }; // Default to last 7 days
    }
}


export async function getAffiliateDashboardStats(
    affiliateId: string,
    period: 'today' | 'yesterday' | 'last7' | 'this_month'
): Promise<{ success: boolean; data?: AffiliateDashboardStats; error?: string }> {
    const action = 'GET_AFFILIATE_DASHBOARD_STATS';
    if (!affiliateId) {
        return { success: false, error: "ID do afiliado não fornecido." };
    }

    try {
        await logSystemEvent(affiliateId, 'system', action, { status: 'STARTED', period });
        const adminDb = getAdminDb();
        const { from, to } = getDateRange(period);
        
        // --- Parallel Data Fetching ---
        const [
            userDoc,
            allUsersSnapshot,
            transactionsSnapshot,
            commissionsSnapshot,
            allClicksSnapshot
        ] = await Promise.all([
            adminDb.collection('users').doc(affiliateId).get(),
            adminDb.collection('users').get(),
            adminDb.collection('transactions').where('status', '==', 'COMPLETED').get(),
            adminDb.collection('commissions').where('affiliateId', '==', affiliateId).get(),
            adminDb.collection('affiliate_clicks').where('affiliateId', '==', affiliateId).get(), // Get all clicks for this affiliate
        ]);
        await logSystemEvent(affiliateId, 'system', action, { status: 'DATA_FETCHED' });


        if (!userDoc.exists) {
            throw new Error("Afiliado não encontrado.");
        }
        
        // --- Data Processing ---
        const allUsersMap = new Map(allUsersSnapshot.docs.map(doc => [doc.id, doc.data()]));
        
        // Find all direct referrals of the affiliate
        const level1ReferralIds = new Set<string>();
        allUsersSnapshot.forEach(doc => {
            if (doc.data().referredBy === affiliateId) {
                level1ReferralIds.add(doc.id);
            }
        });

        // Find L2 referrals
        const level2ReferralIds = new Set<string>();
        if(level1ReferralIds.size > 0) {
            allUsersSnapshot.forEach(doc => {
                if(level1ReferralIds.has(doc.data().referredBy)) {
                    level2ReferralIds.add(doc.id);
                }
            });
        }
        
        // Find L3 referrals
        const level3ReferralIds = new Set<string>();
        if(level2ReferralIds.size > 0) {
            allUsersSnapshot.forEach(doc => {
                if(level2ReferralIds.has(doc.data().referredBy)) {
                    level3ReferralIds.add(doc.id);
                }
            });
        }
        
        const interval = { start: from, end: to };

        const registrationsInPeriod = allUsersSnapshot.docs.filter(doc => 
            level1ReferralIds.has(doc.id) &&
            doc.data().createdAt &&
            isWithinInterval(doc.data().createdAt.toDate(), interval)
        );

        const commissionsInPeriod = commissionsSnapshot.docs.filter(doc =>
            doc.data().createdAt && isWithinInterval(doc.data().createdAt.toDate(), interval)
        );

        const clicksInPeriod = allClicksSnapshot.docs.filter(doc =>
             doc.data().timestamp && isWithinInterval(doc.data().timestamp.toDate(), interval)
        );
        
        // --- DEPOSIT CALCULATION FIX ---
        // Combine all referral IDs from all levels
        const allReferralIds = new Set([...level1ReferralIds, ...level2ReferralIds, ...level3ReferralIds]);

        // Filter deposits made by any referral in the network within the period
        const depositsByReferralsInPeriod = transactionsSnapshot.docs.filter(doc => 
            allReferralIds.has(doc.data().userId) &&
            doc.data().paidAt &&
            isWithinInterval(doc.data().paidAt.toDate(), interval)
        );
        
        const depositsByUserId = new Map<string, number>();
        transactionsSnapshot.docs.forEach(doc => {
            const data = doc.data();
            depositsByUserId.set(data.userId, (depositsByUserId.get(data.userId) || 0) + data.amount);
        });

        const commissionByReferredId = new Map<string, number>();
        commissionsSnapshot.docs.forEach(doc => {
            const data = doc.data();
            commissionByReferredId.set(data.referredUserId, (commissionByReferredId.get(data.referredUserId) || 0) + data.commissionEarned);
        });

        const totalDepositsCount = depositsByReferralsInPeriod.length;
        const totalDepositedValue = depositsByReferralsInPeriod.reduce((sum, doc) => sum + doc.data().amount, 0);
        const totalDepositors = new Set(depositsByReferralsInPeriod.map(doc => doc.data().userId)).size;

        const totalCommissionGenerated = commissionsInPeriod.reduce((sum, doc) => sum + doc.data().commissionEarned, 0);
        
        const commissionBalance = userDoc.data()?.commissionBalance || 0;
        const totalClicks = clicksInPeriod.length;
        await logSystemEvent(affiliateId, 'system', action, { status: 'INITIAL_AGGREGATION_COMPLETE' });

        
        // Process daily data for the chart
        const dailyDataMap = new Map<string, { registrations: number; commissions: number }>();
        const intervalDays = eachDayOfInterval({ start: from, end: to });

        intervalDays.forEach(day => {
            const dateStr = format(day, 'yyyy-MM-dd');
            dailyDataMap.set(dateStr, { registrations: 0, commissions: 0 });
        });
        
        registrationsInPeriod.forEach(doc => {
            const dateStr = format(doc.data().createdAt.toDate(), 'yyyy-MM-dd');
            if(dailyDataMap.has(dateStr)) {
                dailyDataMap.get(dateStr)!.registrations++;
            }
        });

        commissionsInPeriod.forEach(doc => {
            const dateStr = format(doc.data().createdAt.toDate(), 'yyyy-MM-dd');
            if (dailyDataMap.has(dateStr)) {
                dailyDataMap.get(dateStr)!.commissions += doc.data().commissionEarned;
            }
        });
        
        const dailyData = Array.from(dailyDataMap.entries()).map(([date, values]) => ({
            date: format(parseISO(date), 'dd/MM'),
            ...values,
        }));
        
        const processReferrals = (referralIds: Set<string>): ReferralDetails[] => {
            const referrals: ReferralDetails[] = [];
            referralIds.forEach(id => {
                const userData = allUsersMap.get(id);
                if (userData) {
                    referrals.push({
                        id,
                        name: `${userData.firstName || ''} ${userData.lastName || ''}`.trim() || userData.email,
                        totalDeposited: depositsByUserId.get(id) || 0,
                        commissionGenerated: commissionByReferredId.get(id) || 0,
                    });
                }
            });
            return referrals.sort((a,b) => b.totalDeposited - a.totalDeposited);
        };
        await logSystemEvent(affiliateId, 'system', action, { status: 'DAILY_DATA_PROCESSED' });


        const result: AffiliateDashboardStats = {
            totalClicks,
            totalRegistrations: level1ReferralIds.size, // CORRECTED: Count all L1 referrals, not just in period
            totalDepositors,
            totalDepositsCount,
            totalDepositedValue,
            totalCommissionGenerated,
            commissionBalance,
            dailyData,
            level1Referrals: processReferrals(level1ReferralIds),
            level2Referrals: processReferrals(level2ReferralIds),
            level3Referrals: processReferrals(level3ReferralIds),
        };

        await logSystemEvent(affiliateId, 'system', action, { status: 'SUCCESS' });
        return { success: true, data: result };

    } catch (error: any) {
        console.error("Error fetching affiliate dashboard stats: ", error);
        await logSystemEvent(affiliateId, 'system', action, { status: 'ERROR', error: error.message, stack: error.stack }, 'ERROR');
        return { success: false, error: "Falha ao buscar as estatísticas do painel. Verifique os logs." };
    }
}


export async function getTrafficAnalytics(
    affiliateId: string,
    period: 'today' | 'yesterday' | 'last7' | 'this_month'
): Promise<{ success: boolean; data?: TrafficAnalyticData; error?: string }> {
    const action = 'GET_TRAFFIC_ANALYTICS';
    if (!affiliateId) {
        return { success: false, error: "ID do afiliado não fornecido." };
    }

    try {
        await logSystemEvent(affiliateId, 'system', action, { status: 'STARTED', period });
        const adminDb = getAdminDb();
        const { from, to } = getDateRange(period);
        const interval = { start: from, end: to };

        const [allClicksSnapshot, allRegistrationsSnapshot] = await Promise.all([
            adminDb.collection('affiliate_clicks')
                .where('affiliateId', '==', affiliateId)
                .get(),
            adminDb.collection('users')
                .where('referredBy', '==', affiliateId)
                .get(),
        ]);
        
        // Filter in memory
        const clicksSnapshot = allClicksSnapshot.docs.filter(doc => doc.data().timestamp && isWithinInterval(doc.data().timestamp.toDate(), interval));
        const registrationsSnapshot = allRegistrationsSnapshot.docs.filter(doc => doc.data().createdAt && isWithinInterval(doc.data().createdAt.toDate(), interval));

        await logSystemEvent(affiliateId, 'system', action, { status: 'DATA_FETCHED', clicks: clicksSnapshot.length, regs: registrationsSnapshot.length });

        const dailyChartMap = new Map<string, { clicks: number; registrations: number }>();
        const campaignMap = new Map<string, CampaignPerformanceData>();
        const intervalDays = eachDayOfInterval(interval);

        intervalDays.forEach(day => {
            const dateStr = format(day, 'yyyy-MM-dd');
            dailyChartMap.set(dateStr, { clicks: 0, registrations: 0 });
        });
        
        clicksSnapshot.forEach(doc => {
            const data = doc.data();
            const date = data.timestamp.toDate(); // Convert Firestore Timestamp to JS Date
            const dateStr = format(date, 'yyyy-MM-dd');
            const source = data.utm_source || null;
            const campaign = data.utm_campaign || null;
            const device = data.deviceType || 'Other';
            
            if(dailyChartMap.has(dateStr)) {
                dailyChartMap.get(dateStr)!.clicks++;
            }

            const campaignKey = `${dateStr}_${source}_${campaign}_${device}`;
            if (!campaignMap.has(campaignKey)) {
                campaignMap.set(campaignKey, { date: format(date, 'dd/MM/yy'), source, campaign, device, clicks: 0, registrations: 0 });
            }
            campaignMap.get(campaignKey)!.clicks++;
        });

        registrationsSnapshot.forEach(doc => {
            const data = doc.data();
            const date = data.createdAt.toDate(); // Convert Firestore Timestamp to JS Date
            const dateStr = format(date, 'yyyy-MM-dd');
            const source = data.utm_source || null;
            const campaign = data.utm_campaign || null;
            const device = data.deviceType || 'Other';
            
            if(dailyChartMap.has(dateStr)) {
                dailyChartMap.get(dateStr)!.registrations++;
            }
            
            const campaignKey = `${dateStr}_${source}_${campaign}_${device}`;
             if (!campaignMap.has(campaignKey)) {
                campaignMap.set(campaignKey, { date: format(date, 'dd/MM/yy'), source, campaign, device, clicks: 0, registrations: 0 });
            }
            campaignMap.get(campaignKey)!.registrations++;
        });
        await logSystemEvent(affiliateId, 'system', action, { status: 'DATA_PROCESSED' });
        
        const dailyChartData = Array.from(dailyChartMap.entries()).map(([date, values]) => ({
            date: format(parseISO(date), 'dd/MM'),
            clicks: values.clicks,
            registrations: values.registrations
        }));
        
        const campaignPerformance = Array.from(campaignMap.values()).filter(item => item.clicks >= 5);
        
        const resultData: TrafficAnalyticData = {
            dailyChartData,
            campaignPerformance,
        };

        await logSystemEvent(affiliateId, 'system', action, { status: 'SUCCESS' });
        return { success: true, data: resultData };

    } catch (error: any) {
        console.error("Error fetching traffic analytics: ", error);
        await logSystemEvent(affiliateId, 'system', action, { status: 'ERROR', error: error.message, stack: error.stack }, 'ERROR');
        return { success: false, error: "Falha ao buscar os dados de tráfego. Verifique os logs." };
    }
}

export async function getCommissionReport(
    affiliateId: string,
    period: 'today' | 'yesterday' | 'last7' | 'this_month'
): Promise<{ success: boolean; data?: CommissionReportData[]; error?: string }> {
     if (!affiliateId) {
        return { success: false, error: "ID do afiliado não fornecido." };
    }

    try {
        const adminDb = getAdminDb();
        const { from, to } = getDateRange(period);
        const interval = { start: from, end: to };

        const allCommissionsSnapshot = await adminDb.collection('commissions')
            .where('affiliateId', '==', affiliateId)
            .get();
        
        const commissionsSnapshot = allCommissionsSnapshot.docs.filter(doc => doc.data().createdAt && isWithinInterval(doc.data().createdAt.toDate(), interval));


        if (commissionsSnapshot.length === 0) {
            return { success: true, data: [] };
        }

        const userIds = new Set<string>();
        commissionsSnapshot.forEach(doc => {
            userIds.add(doc.data().referredUserId);
        });

        // Batch fetch user data
        const userDocsPromises = Array.from(userIds).map(id => adminDb.collection('users').doc(id).get());
        const userDocs = await Promise.all(userDocsPromises);
        
        const usersMap = new Map<string, FirebaseFirestore.DocumentData>();
        userDocs.forEach(doc => {
            if (doc.exists) {
                usersMap.set(doc.id, doc.data()!);
            }
        });

        const reportData: CommissionReportData[] = commissionsSnapshot.map(doc => {
            const commissionData = doc.data();
            const referredUser = usersMap.get(commissionData.referredUserId);
            
            const referredUserName = referredUser 
                ? `${referredUser.firstName || ''} ${referredUser.lastName || ''}`.trim() || referredUser.email 
                : 'Usuário não encontrado';

            return {
                id: doc.id,
                createdAt: toISOStringOrNull(commissionData.createdAt),
                referredUserName: referredUserName.substring(0, 3) + '***', // Anonymize name
                depositAmount: commissionData.depositAmount,
                commissionRate: commissionData.commissionRate * 100, // convert back to percentage
                commissionEarned: commissionData.commissionEarned,
                utm_source: referredUser?.utm_source || null,
                utm_campaign: referredUser?.utm_campaign || null,
            };
        }).sort((a, b) => {
            if (!a.createdAt || !b.createdAt) return 0;
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });

        return { success: true, data: reportData };

    } catch (error: any) {
        console.error("Error fetching commission report: ", error);
        return { success: false, error: "Falha ao buscar o relatório de comissões." };
    }
}


// --- ADVANCED REPORTING ENGINE ---

export type ReportDimension = 'day' | 'campaign' | 'source' | 'device';
export type ReportMetric = 'clicks' | 'registrations' | 'depositors' | 'deposits_count' | 'deposits_value' | 'commission_generated';

export interface ReportConfig {
    dimensions: ReportDimension[];
    metrics: ReportMetric[];
}

export async function generateCustomReport(
    affiliateId: string,
    period: 'today' | 'yesterday' | 'last7' | 'this_month',
    config: ReportConfig
): Promise<{ success: boolean; data?: any[]; error?: string }> {
    if (!affiliateId) {
        return { success: false, error: "ID do afiliado não fornecido." };
    }
     if (!config.dimensions || config.dimensions.length === 0) {
        return { success: false, error: "Pelo menos uma dimensão é necessária para o relatório." };
    }

    try {
        const adminDb = getAdminDb();
        const { from, to } = getDateRange(period);
        const interval = { start: from, end: to };

        // --- Data Fetching ---
        const [
            allClicksSnapshot,
            allUsersSnapshot,
            allTransactionsSnapshot,
            allCommissionsSnapshot,
        ] = await Promise.all([
            adminDb.collection('affiliate_clicks').where('affiliateId', '==', affiliateId).get(),
            adminDb.collection('users').where('referredBy', '==', affiliateId).get(),
            adminDb.collection('transactions').where('status', '==', 'COMPLETED').get(),
            adminDb.collection('commissions').where('affiliateId', '==', affiliateId).get(),
        ]);
        
        // Filter in memory
        const clicksSnapshot = allClicksSnapshot.docs.filter(doc => doc.data().timestamp && isWithinInterval(doc.data().timestamp.toDate(), interval));
        const usersSnapshot = allUsersSnapshot.docs.filter(doc => doc.data().createdAt && isWithinInterval(doc.data().createdAt.toDate(), interval));
        const transactionsSnapshot = allTransactionsSnapshot.docs.filter(doc => doc.data().paidAt && isWithinInterval(doc.data().paidAt.toDate(), interval));
        const commissionsSnapshot = allCommissionsSnapshot.docs.filter(doc => doc.data().createdAt && isWithinInterval(doc.data().createdAt.toDate(), interval));

        const referredUserIds = new Set(allUsersSnapshot.docs.map(doc => doc.id));


        // --- Data Aggregation ---
        const aggregatedData = new Map<string, any>();

        // Helper to create a key based on the selected dimensions
        const createKey = (dimensions: ReportDimension[], data: any, date: Date): string => {
            return dimensions.map(dim => {
                switch (dim) {
                    case 'day': return format(date, 'yyyy-MM-dd');
                    case 'source': return data.utm_source || 'N/A';
                    case 'campaign': return data.utm_campaign || 'N/A';
                    case 'device': return data.deviceType || 'Other';
                    default: return '';
                }
            }).join('__');
        };
        
        const initializeRow = (key: string, dimensions: ReportDimension[], data: any, date: Date) => {
            const row: any = {};
            dimensions.forEach(dim => {
                 switch (dim) {
                    case 'day': row.day = format(date, 'yyyy-MM-dd'); break;
                    case 'source': row.source = data.utm_source || 'N/A'; break;
                    case 'campaign': row.campaign = data.utm_campaign || 'N/A'; break;
                    case 'device': row.device = data.deviceType || 'Other'; break;
                }
            });
            config.metrics.forEach(metric => { row[metric] = 0; });
            row.uniqueDepositors = new Set();
            row.uniqueRegistrations = new Set();
            aggregatedData.set(key, row);
            return row;
        }

        // Process Clicks
        clicksSnapshot.forEach(doc => {
            const data = doc.data();
            const date = data.timestamp.toDate();
            const key = createKey(config.dimensions, data, date);
            const row = aggregatedData.get(key) || initializeRow(key, config.dimensions, data, date);
            if (config.metrics.includes('clicks')) {
                row.clicks++;
            }
        });
        
        // Process Registrations
        usersSnapshot.forEach(doc => {
             const data = doc.data();
             const date = data.createdAt.toDate();
             const key = createKey(config.dimensions, data, date);
             const row = aggregatedData.get(key) || initializeRow(key, config.dimensions, data, date);
             if (config.metrics.includes('registrations')) {
                 row.uniqueRegistrations.add(doc.id);
             }
        });

        // Process Transactions
        transactionsSnapshot.forEach(doc => {
            const data = doc.data();
            if (referredUserIds.has(data.userId)) {
                 const userDataSnapshot = allUsersSnapshot.docs.find(u => u.id === data.userId);
                 if (userDataSnapshot) {
                     const userData = userDataSnapshot.data();
                     const date = data.paidAt.toDate();
                     const key = createKey(config.dimensions, userData, date);
                     const row = aggregatedData.get(key) || initializeRow(key, config.dimensions, userData, date);
                     
                     if (config.metrics.includes('deposits_value')) row.deposits_value += data.amount;
                     if (config.metrics.includes('deposits_count')) row.deposits_count++;
                     if (config.metrics.includes('depositors')) row.uniqueDepositors.add(data.userId);
                 }
            }
        });
        
        // Process Commissions
        commissionsSnapshot.forEach(doc => {
            const data = doc.data();
            const userDataSnapshot = allUsersSnapshot.docs.find(u => u.id === data.referredUserId);
            if (userDataSnapshot) {
                const userData = userDataSnapshot.data();
                const date = data.createdAt.toDate();
                const key = createKey(config.dimensions, userData, date);
                const row = aggregatedData.get(key) || initializeRow(key, config.dimensions, userData, date);
                if (config.metrics.includes('commission_generated')) {
                     row.commission_generated += data.commissionEarned;
                }
            }
        });
        
        // Final Processing and Privacy Rule
        const finalReport = Array.from(aggregatedData.values()).map(row => {
            row.registrations = row.uniqueRegistrations.size;
            row.depositors = row.uniqueDepositors.size;
            delete row.uniqueRegistrations;
            delete row.uniqueDepositors;
            return row;
        }).filter(row => (row.registrations || 0) >= 5);

        return { success: true, data: finalReport };

    } catch (error: any) {
        console.error("Error generating custom report: ", error);
        return { success: false, error: "Falha ao gerar o relatório personalizado." };
    }
}
