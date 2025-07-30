
'use server';

import { getAdminDb } from "@/lib/firebase-admin-init";
import { FieldValue } from "firebase-admin/firestore";

// Helper function to write debug logs to Firestore, now accepting the transaction object
async function writeDebugLog(
    transaction: FirebaseFirestore.Transaction,
    logCollectionRef: FirebaseFirestore.CollectionReference,
    transactionId: string, 
    level: number, 
    status: string, 
    details: object
) {
    const adminDb = getAdminDb();
    const logDocRef = logCollectionRef.doc();
    transaction.set(logDocRef, {
        transactionId,
        level,
        status,
        details,
        createdAt: FieldValue.serverTimestamp(),
    });
}

async function creditCommissionToAffiliate(
    transaction: FirebaseFirestore.Transaction,
    affiliateId: string,
    amount: number,
) {
    const adminDb = getAdminDb();
    const affiliateRef = adminDb.collection('users').doc(affiliateId);
    transaction.update(affiliateRef, { commissionBalance: FieldValue.increment(amount) });
}

async function updateUserBalanceAndLedger(
    transaction: FirebaseFirestore.Transaction,
    userId: string,
    amount: number,
    rolloverMultiplier: number,
    refId: string
) {
    const adminDb = getAdminDb();
    const userRef = adminDb.collection('users').doc(userId);
    const userDoc = await transaction.get(userRef);
    if (!userDoc.exists) {
        // This case should be handled by the main function, but as a safeguard:
        throw new Error(`User ${userId} not found for ledger entry.`);
    }

    const userData = userDoc.data()!;
    let currentBalance = userData.balance || 0;
    const prizeBalance = userData.prizeBalance || 0;

    // Check if there's a prize balance to be transferred on the first deposit.
    // This logic runs inside the same transaction as the deposit crediting.
    let prizeTransferAmount = 0;
    if (prizeBalance > 0) {
        prizeTransferAmount = prizeBalance;
        currentBalance += prizeTransferAmount; // Add prize to main balance

        // Create ledger entry for the prize transfer
        const prizeLedgerRef = adminDb.collection('user_ledger').doc();
        transaction.set(prizeLedgerRef, {
            userId,
            type: 'GAME_PRIZE', // Or a new type like 'PRIZE_UNLOCK'
            amount: prizeTransferAmount,
            description: 'Prêmio de boas-vindas desbloqueado após depósito.',
            balanceBefore: userData.balance, // Balance before this entire operation
            balanceAfter: currentBalance,
            refId: `unlock-${refId}`,
            createdAt: FieldValue.serverTimestamp(),
        });
    }

    const balanceBeforeDeposit = currentBalance;
    const balanceAfterDeposit = balanceBeforeDeposit + amount;
    
    // Rollover is now calculated on the deposit amount PLUS the unlocked prize amount
    const rolloverBaseAmount = amount + prizeTransferAmount;
    const rolloverIncrement = rolloverBaseAmount * rolloverMultiplier;

    // Create ledger entry for the deposit itself
    const depositLedgerRef = adminDb.collection('user_ledger').doc();
    transaction.set(depositLedgerRef, {
        userId,
        type: 'DEPOSIT',
        amount,
        description: `Depósito via PIX (ID: ${refId})`,
        balanceBefore: balanceBeforeDeposit,
        balanceAfter: balanceAfterDeposit,
        refId,
        createdAt: FieldValue.serverTimestamp(),
    });

    // Update balance, rollover requirement, and reset prizeBalance
    const finalUpdate: any = {
        balance: balanceAfterDeposit,
        rolloverRequirement: FieldValue.increment(rolloverIncrement),
    };

    if (prizeTransferAmount > 0) {
        finalUpdate.prizeBalance = 0; // Reset prize balance
    }
    
    transaction.update(userRef, finalUpdate);
}

/**
 * Handles all post-deposit logic: updates user balance, creates ledger, and credits commissions up to 3 levels.
 * This function is now fully idempotent on a per-level basis and respects Firestore's read-before-write transaction rule.
 */
export async function creditCommission(
    referredUserId: string,
    depositAmount: number,
    transactionId: string,
): Promise<{ success: boolean; error?: string }> {
    
    if (!referredUserId || !transactionId) {
        const errorMsg = 'Commission Error: Missing referredUserId or transactionId.';
        console.error(errorMsg);
        return { success: false, error: "IDs de usuário ou da fonte inválidos." };
    }

    if (typeof depositAmount !== 'number' || depositAmount <= 0) {
        return { success: true };
    }
    
    const adminDb = getAdminDb();
    const commissionsRef = adminDb.collection('commissions');
    const settingsRef = adminDb.collection('settings').doc('general');
    const debugLogsRef = adminDb.collection('commission_debug_logs');
        
    try {
        await adminDb.runTransaction(async (transaction) => {
            // --- PHASE 1: ALL READS ---
            const debugLogsToWrite: any[] = [{ level: 0, status: 'START', details: { referredUserId, depositAmount, transactionId } }];
            const paymentsToWrite: any[] = [];
            
            const settingsDoc = await transaction.get(settingsRef);
            const settingsData = settingsDoc.data() || {};

            const referredUserDoc = await transaction.get(adminDb.collection('users').doc(referredUserId));
            if (!referredUserDoc.exists) {
                // If the user who deposited doesn't exist, we can't proceed.
                throw new Error(`User ${referredUserId} who made the deposit was not found.`);
            }

            // Check if balance update and ledger entry has already been done for this transaction.
            const depositLedgerQuery = adminDb.collection('user_ledger').where('refId', '==', transactionId).where('type', '==', 'DEPOSIT').limit(1);
            const depositLedgerSnap = await transaction.get(depositLedgerQuery);
            let balanceAlreadyUpdated = !depositLedgerSnap.empty;

            const levelConfigs = [
                { level: 1, rateField: 'commissionRateL1', defaultRateField: 'commissionRateL1' },
                { level: 2, rateField: 'commissionRateL2', defaultRateField: 'commissionRateL2' },
                { level: 3, rateField: 'commissionRateL3', defaultRateField: 'commissionRateL3' },
            ];

            let currentUserDoc = referredUserDoc;
            let lastAffiliateId = null;

            for (const config of levelConfigs) {
                const affiliateId = currentUserDoc.data()?.referredBy;
                if (!affiliateId) {
                    debugLogsToWrite.push({ level: config.level, status: 'CHAIN_ENDED', details: { reason: 'User has no affiliate', userId: currentUserDoc.id } });
                    break;
                }
                
                debugLogsToWrite.push({level: config.level, status: 'AFFILIATE_FOUND', details: { affiliateId, forUser: currentUserDoc.id }})

                const commissionExistsQuery = commissionsRef
                    .where('transactionId', '==', transactionId)
                    .where('level', '==', config.level);
                const commissionExistsSnap = await transaction.get(commissionExistsQuery);

                if (!commissionExistsSnap.empty) {
                    debugLogsToWrite.push({ level: config.level, status: 'SKIPPED', details: { reason: 'Commission already paid for this level' } });
                    const nextUserDoc = await transaction.get(adminDb.collection('users').doc(affiliateId));
                    if (!nextUserDoc.exists) break;
                    currentUserDoc = nextUserDoc;
                    continue;
                }

                const affiliateDoc = await transaction.get(adminDb.collection('users').doc(affiliateId));
                if (!affiliateDoc.exists) {
                    debugLogsToWrite.push({ level: config.level, status: 'CHAIN_BROKEN', details: { reason: 'Affiliate user document not found', affiliateId: affiliateId } });
                    break;
                }
                const affiliateData = affiliateDoc.data()!;
                
                let commissionRatePercentage: number;
                
                if (config.level === 1) {
                    const customRates = affiliateData.customCommissionRates || {};
                    if (typeof customRates[referredUserId] === 'number') {
                        commissionRatePercentage = customRates[referredUserId];
                        debugLogsToWrite.push({ level: 1, status: 'CUSTOM_RATE_FOUND', details: { affiliateId, referredUserId, rate: commissionRatePercentage }});
                    } else {
                        // Use affiliate's own L1 rate, or global L1 rate, or default to 0
                        commissionRatePercentage = affiliateData.commissionRate ?? settingsData.commissionRateL1 ?? 0;
                        debugLogsToWrite.push({ level: 1, status: 'DEFAULT_RATE_USED', details: { affiliateRate: affiliateData.commissionRate ?? null, globalRate: settingsData.commissionRateL1, finalRate: commissionRatePercentage }});
                    }
                } else {
                    // For L2 and L3, use affiliate's rate, or global rate, or default to 0.
                    commissionRatePercentage = affiliateData[config.rateField] ?? settingsData[config.defaultRateField] ?? 0;
                }
                
                const commissionRateDecimal = commissionRatePercentage / 100;
                const commissionEarned = depositAmount * commissionRateDecimal;

                debugLogsToWrite.push({
                    level: config.level, status: 'RATE_CALCULATION', details: {
                        affiliateId: affiliateId,
                        rateField: config.rateField,
                        userRate: affiliateData[config.rateField] ?? null,
                        defaultRate: settingsData[config.defaultRateField] ?? 0,
                        finalRatePercentage: commissionRatePercentage,
                        commissionEarned,
                    }
                });

                if (commissionEarned > 0) {
                     paymentsToWrite.push({
                        level: config.level,
                        affiliateId: affiliateId,
                        referredUserId: referredUserId, // Always the original user
                        commissionEarned: commissionEarned,
                        commissionRate: commissionRateDecimal,
                        fromAffiliateId: lastAffiliateId
                     });
                     debugLogsToWrite.push({level: config.level, status: 'QUEUED_FOR_PAYMENT', details: { affiliateId, commissionEarned }});
                }
                
                lastAffiliateId = currentUserDoc.id;
                currentUserDoc = affiliateDoc;
            }

            // --- PHASE 2: ALL WRITES ---
            
            // First, update the user's balance and ledger if it hasn't been done.
            if (!balanceAlreadyUpdated) {
                const rolloverMultiplier = settingsData.rolloverMultiplier ?? 1;
                await updateUserBalanceAndLedger(transaction, referredUserId, depositAmount, rolloverMultiplier, transactionId);
                debugLogsToWrite.push({ level: 0, status: 'BALANCE_UPDATED', details: { userId: referredUserId, amount: depositAmount }});
            } else {
                debugLogsToWrite.push({ level: 0, status: 'BALANCE_SKIPPED', details: { reason: 'Ledger entry for this deposit already exists.' }});
            }
            
            // Then, handle all commission payments.
            for (const payment of paymentsToWrite) {
                await creditCommissionToAffiliate(transaction, payment.affiliateId, payment.commissionEarned);
                
                const commissionRef = commissionsRef.doc();
                transaction.set(commissionRef, {
                    level: payment.level,
                    affiliateId: payment.affiliateId,
                    referredUserId: payment.referredUserId,
                    fromAffiliateId: payment.fromAffiliateId,
                    depositAmount,
                    commissionRate: payment.commissionRate,
                    commissionEarned: payment.commissionEarned,
                    transactionId,
                    createdAt: FieldValue.serverTimestamp(),
                });
                debugLogsToWrite.push({level: payment.level, status: 'SUCCESS', details: { affiliateId: payment.affiliateId, commissionEarned: payment.commissionEarned }});
            }
            
            // Finally, write all debug logs collected during the process.
            for (const log of debugLogsToWrite) {
                await writeDebugLog(transaction, debugLogsRef, transactionId, log.level, log.status, log.details);
            }


        }); // End of transaction

        return { success: true };

    } catch (error: any) {
        const adminDb = getAdminDb();
        console.error(`Fatal error in commission transaction for ${transactionId}:`, error);
        // Log error outside of the failed transaction
        await adminDb.collection('commission_debug_logs').add({
            transactionId,
            level: 0,
            status: 'FATAL_ERROR',
            details: { error: error.message, stack: error.stack },
            createdAt: FieldValue.serverTimestamp(),
        });
        return { success: false, error: "Falha crítica ao creditar a comissão. Verifique os logs do servidor." };
    }
}
