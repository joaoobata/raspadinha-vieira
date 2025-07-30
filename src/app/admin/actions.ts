
'use server';

import { getAdminDb } from "@/lib/firebase-admin-init";
import { creditCommission } from "../actions/commission";
import { Timestamp } from "firebase-admin/firestore";
import { startOfDay, endOfDay, eachDayOfInterval, format, isValid, parse, compareAsc } from 'date-fns';
import { logAdminAction } from "@/lib/logging";

interface DateRange {
    from: Date;
    to: Date;
}

interface DailyData {
    date: string;
    deposits: number;
    withdrawals: number;
    ngr: number;
}

interface DashboardStats {
    totalDeposits: number;
    totalWithdrawals: number;
    totalNGR: number;
    registeredUsers: number;
    dailyData: DailyData[];
}

export async function getDashboardStats(dateRange?: DateRange): Promise<{ success: boolean; data?: DashboardStats; error?: string }> {
    try {
        const adminDb = getAdminDb();
        
        const hasDateRange = dateRange && dateRange.from && dateRange.to && isValid(dateRange.from) && isValid(dateRange.to);
        const from = hasDateRange ? startOfDay(dateRange.from!) : null;
        const to = hasDateRange ? endOfDay(dateRange.to!) : null;
        
        let transactionsQuery: FirebaseFirestore.Query = adminDb.collection("transactions").where("status", "==", "COMPLETED");
        let withdrawalsQuery: FirebaseFirestore.Query = adminDb.collection("withdrawals").where("status", "==", "COMPLETED");
        let usersQuery: FirebaseFirestore.Query = adminDb.collection("users");

        if (hasDateRange) {
            transactionsQuery = transactionsQuery.where("paidAt", ">=", from).where("paidAt", "<=", to);
            withdrawalsQuery = withdrawalsQuery.where("completedAt", ">=", from).where("completedAt", "<=", to);
            usersQuery = usersQuery.where('createdAt', '>=', from).where('createdAt', '<=', to);
        }

        const [depositsSnapshot, withdrawalsSnapshot, usersSnapshot] = await Promise.all([
            transactionsQuery.get(),
            withdrawalsQuery.get(),
            usersQuery.get(),
        ]);
        
        const dailyDataMap = new Map<string, { deposits: number; withdrawals: number; ngr: number }>();
        
        let totalDeposits = 0;
        depositsSnapshot.forEach(doc => {
            const data = doc.data();
            if (data.paidAt) {
                const dateStr = format((data.paidAt as Timestamp).toDate(), 'yyyy-MM-dd');
                if (!dailyDataMap.has(dateStr)) {
                    dailyDataMap.set(dateStr, { deposits: 0, withdrawals: 0, ngr: 0 });
                }
                dailyDataMap.get(dateStr)!.deposits += data.amount;
            }
            totalDeposits += data.amount;
        });

        let totalWithdrawals = 0;
        withdrawalsSnapshot.forEach(doc => {
            const data = doc.data();
            if (data.completedAt) {
                const dateStr = format((data.completedAt as Timestamp).toDate(), 'yyyy-MM-dd');
                 if (!dailyDataMap.has(dateStr)) {
                    dailyDataMap.set(dateStr, { deposits: 0, withdrawals: 0, ngr: 0 });
                }
                dailyDataMap.get(dateStr)!.withdrawals += data.amount;
            }
            totalWithdrawals += data.amount;
        });

        // Calculate NGR for each day
        dailyDataMap.forEach((values, date) => {
            values.ngr = values.deposits - values.withdrawals;
        });

        const totalNGR = totalDeposits - totalWithdrawals;

        const dailyData: DailyData[] = Array.from(dailyDataMap.entries()).map(([date, values]) => ({
            date,
            ...values,
        }));
        
        dailyData.sort((a, b) => compareAsc(parse(a.date, 'yyyy-MM-dd', new Date()), parse(b.date, 'yyyy-MM-dd', new Date())));

        // Format date for display at the very end
        const formattedDailyData = dailyData.map(d => ({
            ...d,
            date: format(parse(d.date, 'yyyy-MM-dd', new Date()), 'dd/MM'),
        }));


        return { 
            success: true, 
            data: { 
                totalDeposits,
                totalWithdrawals,
                totalNGR,
                registeredUsers: usersSnapshot.size,
                dailyData: formattedDailyData,
            } 
        };

    } catch (error: any) {
        console.error("Error fetching dashboard stats: ", error);
        return { success: false, error: "Falha ao buscar estatísticas no banco de dados. Verifique os logs do servidor para detalhes sobre índices do Firestore." };
    }
}


export async function reprocessMissingCommissions(adminId: string): Promise<{ success: boolean; data?: { processedCount: number }; error?: string }> {
    if (!adminId) {
        return { success: false, error: "Admin não autenticado." };
    }
    
    try {
        await logAdminAction(adminId, adminId, 'REPROCESS_COMMISSIONS', { status: 'STARTED' }, 'INFO');
        console.log('Starting commission reprocessing...');
        
        const adminDb = getAdminDb();
        
        // --- READ PHASE ---
        // 1. Get all completed transactions.
        const transactionsSnapshot = await adminDb.collection("transactions").where("status", "==", "COMPLETED").get();
        
        // 2. Get all existing commission logs to create a set of paid transaction IDs.
        const commissionsSnapshot = await adminDb.collection("commissions").get();
        const paidTransactionIds = new Set(commissionsSnapshot.docs.map(doc => doc.data().transactionId));
        
        console.log(`Found ${transactionsSnapshot.size} completed transactions and ${paidTransactionIds.size} paid commissions.`);

        // --- PROCESSING PHASE ---
        const transactionsToProcess = [];
        
        // 3. Iterate through transactions to find which ones are missing a commission record.
        for (const doc of transactionsSnapshot.docs) {
            const transactionId = doc.id;
            if (!paidTransactionIds.has(transactionId)) {
                transactionsToProcess.push({
                    id: transactionId,
                    userId: doc.data().userId,
                    amount: doc.data().amount,
                });
            }
        }
        
        if (transactionsToProcess.length === 0) {
            console.log('No missing commissions found to process.');
            await logAdminAction(adminId, adminId, 'REPROCESS_COMMISSIONS', { status: 'SUCCESS', message: 'No missing commissions found', processedCount: 0 }, 'SUCCESS');
            return { success: true, data: { processedCount: 0 } };
        }

        console.log(`Found ${transactionsToProcess.length} transactions to process for commission.`);
        
        // 4. Call the idempotent creditCommission function for each missing one.
        // This is done outside of a transaction at this level. `creditCommission` itself is transactional.
        const commissionPromises = transactionsToProcess.map(tx => 
            creditCommission(tx.userId, tx.amount, tx.id)
        );
        
        const results = await Promise.allSettled(commissionPromises);
        let successCount = 0;

        results.forEach((result, index) => {
            const txId = transactionsToProcess[index].id;
            if (result.status === 'fulfilled' && result.value.success) {
                console.log(`Successfully processed commission for transaction ID: ${txId}`);
                successCount++;
            } else if (result.status === 'fulfilled' && !result.value.success) {
                console.error(`Failed to process commission for transaction ID: ${txId}. Reason: ${result.value.error}`);
            } else if (result.status === 'rejected') {
                console.error(`An unexpected error occurred while processing transaction ID: ${txId}. Reason:`, result.reason);
            }
        });

        console.log(`Finished commission reprocessing. Successfully processed ${successCount} out of ${transactionsToProcess.length}.`);
        await logAdminAction(adminId, adminId, 'REPROCESS_COMMISSIONS', { status: 'SUCCESS', processedCount: successCount, totalFound: transactionsToProcess.length }, 'SUCCESS');

        return { success: true, data: { processedCount: successCount } };

    } catch (error: any) {
        console.error("Fatal error during reprocessing of missing commissions: ", error);
        await logAdminAction(adminId, adminId, 'REPROCESS_COMMISSIONS', { status: 'ERROR', message: error.message }, 'ERROR');
        return { success: false, error: "Falha crítica ao reprocessar comissões." };
    }
}
