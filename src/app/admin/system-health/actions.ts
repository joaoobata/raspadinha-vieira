
'use server';

import { getAdminDb } from "@/lib/firebase-admin-init";

export interface SystemHealthStats {
    totalUserBalance: number;
    // gatewayBalance: number; // Placeholder for future implementation
    batchesHealth: BatchHealth[];
}

export interface BatchHealth {
    id: string;
    name: string;
    status: 'active' | 'archived';
    ggrTarget: number;
    ggrCurrent: number;
    prizePool: number;
    prizesDistributed: number;
    theoreticalRTP: number;
    realRTP: number;
    payoutPercentage: number;
}


export async function getSystemHealthStats(): Promise<{ success: boolean; data?: SystemHealthStats; error?: string }> {
    try {
        const adminDb = getAdminDb();
        
        // --- Parallel Data Fetching ---
        const [usersSnapshot, batchesSnapshot] = await Promise.all([
            adminDb.collection('users').get(),
            adminDb.collection('ggr_batches').get()
        ]);

        // 1. Calculate Total User Balance
        let totalUserBalance = 0;
        usersSnapshot.forEach(doc => {
            const data = doc.data();
            totalUserBalance += (data.balance || 0);
            totalUserBalance += (data.prizeBalance || 0);
        });
        
        // 2. Calculate Health for Each GGR Batch
        const batchesHealth: BatchHealth[] = batchesSnapshot.docs.map(doc => {
            const data = doc.data();
            const ggrTarget = data.ggrTarget || 0;
            const ggrCurrent = data.ggrCurrent || 0;
            const prizePool = data.prizePool || 0;
            const prizesDistributed = data.prizesDistributed || 0;

            const theoreticalRTP = ggrTarget > 0 ? (prizePool / ggrTarget) * 100 : 0;
            const realRTP = ggrCurrent > 0 ? (prizesDistributed / ggrCurrent) * 100 : 0;
            const payoutPercentage = prizePool > 0 ? (prizesDistributed / prizePool) * 100 : 0;
            
            return {
                id: doc.id,
                name: data.name,
                status: data.status,
                ggrTarget,
                ggrCurrent,
                prizePool,
                prizesDistributed,
                theoreticalRTP,
                realRTP,
                payoutPercentage,
            };
        }).sort((a,b) => (a.status === 'active' ? -1 : 1)); // Show active first


        const resultData: SystemHealthStats = {
            totalUserBalance,
            batchesHealth,
        };

        return { success: true, data: resultData };

    } catch (error: any) {
        console.error("Error fetching system health stats:", error);
        return { success: false, error: "Falha ao buscar as métricas de saúde do sistema." };
    }
}
