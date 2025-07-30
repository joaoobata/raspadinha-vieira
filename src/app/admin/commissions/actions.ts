
'use server';

import { getAdminDb } from "@/lib/firebase-admin-init";
import { Timestamp } from "firebase-admin/firestore";

// Helper function to safely convert a Timestamp to an ISO string
const toISOStringOrNull = (timestamp: Timestamp | undefined): string | null => {
    try {
        return timestamp ? timestamp.toDate().toISOString() : null;
    } catch (error) {
        return null;
    }
}

export interface CommissionLog {
    id: string;
    affiliateId: string;
    affiliateName: string;
    referredUserId: string;
    referredUserName: string;
    level: 1 | 2 | 3;
    depositAmount: number; // Base amount for calculation
    commissionRate: number;
    commissionEarned: number;
    transactionId: string; // The ID of the deposit transaction
    createdAt: string | null;
}

export async function getCommissionLogs(): Promise<{ success: boolean; data?: CommissionLog[]; error?: string }> {
    try {
        const adminDb = getAdminDb();
        // Fetch commissions and users in parallel
        const [commissionsSnapshot, usersSnapshot] = await Promise.all([
            adminDb.collection("commissions").orderBy("createdAt", "desc").limit(500).get(),
            adminDb.collection("users").get()
        ]);

        if (commissionsSnapshot.empty) {
            return { success: true, data: [] };
        }

        // Create a map of user IDs to their names for efficient lookup
        const userNamesMap = new Map<string, string>();
        usersSnapshot.docs.forEach(doc => {
            const data = doc.data();
            const name = `${data.firstName} ${data.lastName}`.trim() || data.email;
            userNamesMap.set(doc.id, name);
        });

        const commissionLogs = commissionsSnapshot.docs.map(doc => {
            const data = doc.data();
            const affiliateName = userNamesMap.get(data.affiliateId) || 'Afiliado não encontrado';
            const referredUserName = userNamesMap.get(data.referredUserId) || 'Indicado não encontrado';

            return {
                id: doc.id,
                affiliateId: data.affiliateId,
                affiliateName,
                referredUserId: data.referredUserId,
                referredUserName,
                level: data.level,
                depositAmount: data.depositAmount, 
                commissionRate: data.commissionRate,
                commissionEarned: data.commissionEarned,
                transactionId: data.transactionId,
                createdAt: toISOStringOrNull(data.createdAt),
            } as CommissionLog;
        });

        return { success: true, data: commissionLogs };

    } catch (error: any) {
        console.error("Error fetching commission logs: ", error);
        return { success: false, error: "Falha ao buscar logs de comissão no banco de dados." };
    }
}
