
'use server';

import { getAdminDb } from "@/lib/firebase-admin-init";
import { Timestamp } from "firebase-admin/firestore";


interface RtpSettings {
    rate: number; // Percentage (e.g., 30 for 30%)
}

export interface PerformanceStats {
    totalPlays: number;
    winningPlays: number;
    losingPlays: number;
    totalPrizesValue: number;
}


// Get RTP settings
export async function getRtpSettings(): Promise<{ success: boolean; data?: RtpSettings; error?: string }> {
    try {
        const adminDb = getAdminDb();
        const rtpSettingsRef = adminDb.collection('settings').doc('rtp');
        const doc = await rtpSettingsRef.get();
        if (!doc.exists) {
            // Default to 0% if not set, as a safety measure.
            return { success: true, data: { rate: 0 } };
        }
        return { success: true, data: doc.data() as RtpSettings };
    } catch (error: any) {
        console.error("Error fetching RTP settings: ", error);
        return { success: false, error: "Falha ao buscar configurações de RTP. Tente novamente." };
    }
}

// Save RTP settings
export async function saveRtpSettings(rate: number): Promise<{ success: boolean; error?: string }> {
    try {
        if (typeof rate !== 'number' || rate < 0 || rate > 100) {
            return { success: false, error: "A taxa deve ser um número entre 0 e 100." };
        }
        const adminDb = getAdminDb();
        const rtpSettingsRef = adminDb.collection('settings').doc('rtp');
        await rtpSettingsRef.set({ rate });
        return { success: true };
    } catch (error: any) {
        console.error("Error saving RTP settings: ", error);
        return { success: false, error: "Falha ao salvar configurações de RTP. Tente novamente." };
    }
}

// Get game plays stats for a date range
export async function getPerformanceStats(
    dateRange?: { from: Date; to: Date }
): Promise<{ success: boolean; data?: PerformanceStats; error?: string }> {
    try {
        const adminDb = getAdminDb();
        const gamePlaysRef = adminDb.collection('game_plays');
        let query: FirebaseFirestore.Query<FirebaseFirestore.DocumentData> = gamePlaysRef;

        if (dateRange) {
            const { from, to } = dateRange;
            if (!from || !to) {
                 return { success: false, error: "Datas de início e fim são obrigatórias para filtrar." };
            }
             query = query
                .where('createdAt', '>=', Timestamp.fromDate(from))
                .where('createdAt', '<=', Timestamp.fromDate(to));
        }

        const snapshot = await query.get();

        if (snapshot.empty) {
            return {
                success: true,
                data: {
                    totalPlays: 0,
                    winningPlays: 0,
                    losingPlays: 0,
                    totalPrizesValue: 0
                }
            };
        }

        const stats: PerformanceStats = {
            totalPlays: snapshot.size,
            winningPlays: 0,
            losingPlays: 0,
            totalPrizesValue: 0,
        };

        snapshot.forEach(doc => {
            const data = doc.data();
            const prizeValue = data.prizeWonValue || 0;
            if (prizeValue > 0) {
                stats.winningPlays++;
                stats.totalPrizesValue += prizeValue;
            } else {
                stats.losingPlays++;
            }
        });
        
        return { success: true, data: stats };

    } catch (error: any) {
        console.error("Error fetching game performance stats: ", error);
        return { success: false, error: "Falha ao buscar estatísticas de jogos. Tente novamente." };
    }
}
