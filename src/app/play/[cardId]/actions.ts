
'use server';

import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin-init';
import { FieldValue } from 'firebase-admin/firestore';
import { Scratchcard, Prize } from '@/app/admin/scratchcards/actions';
import { GgrBatch } from '@/app/admin/ggr-batches/actions';
import { logSystemEvent } from '@/lib/logging';
import { DemoPrizeProfile } from '@/app/admin/influencers/actions';

async function createLedgerEntries(
    transaction: FirebaseFirestore.Transaction,
    userId: string,
    betAmount: number,
    prizeAmount: number,
    cardName: string,
    refId: string
) {
    const adminDb = getAdminDb();
    const userRef = adminDb.collection('users').doc(userId);
    const userDoc = await transaction.get(userRef);
    if (!userDoc.exists) throw new Error(`User ${userId} not found for ledger entry.`);
    
    const userData = userDoc.data()!;
    let currentBalance = userData.balance || 0;

    // 1. Debit the bet amount
    const balanceAfterBet = currentBalance - betAmount;
    const betLedgerRef = adminDb.collection('user_ledger').doc();
    transaction.set(betLedgerRef, {
        userId,
        type: 'GAME_BET',
        amount: -betAmount,
        description: `Aposta na raspadinha: ${cardName}`,
        balanceBefore: currentBalance,
        balanceAfter: balanceAfterBet,
        refId,
        createdAt: FieldValue.serverTimestamp(),
    });
    // The user's balance is updated in stages within the transaction.
    currentBalance = balanceAfterBet;

    // 2. Credit the prize amount, if any
    if (prizeAmount > 0) {
        const balanceAfterPrize = currentBalance + prizeAmount;
        const prizeLedgerRef = adminDb.collection('user_ledger').doc();
        transaction.set(prizeLedgerRef, {
            userId,
            type: 'GAME_PRIZE',
            amount: prizeAmount,
            description: `Prêmio na raspadinha: ${cardName}`,
            balanceBefore: currentBalance,
            balanceAfter: balanceAfterPrize,
            refId,
            createdAt: FieldValue.serverTimestamp(),
        });
        currentBalance = balanceAfterPrize;
    }
    
    // 3. Update the final balance and increment rollover progress on the user document
    transaction.update(userRef, { 
        balance: currentBalance,
        rolloverProgress: FieldValue.increment(betAmount),
    });
}


interface GameResult {
  grid: Prize[];
  prizeWon: Prize | null;
}

async function getAuthenticatedUser(idToken: string | null) {
    if (!idToken) {
        return null;
    }
    try {
        const adminAuth = getAdminAuth();
        const adminDb = getAdminDb();
        const decodedToken = await adminAuth.verifyIdToken(idToken);
        const userDoc = await adminDb.collection('users').doc(decodedToken.uid).get();
        if (userDoc.exists) {
            return { uid: decodedToken.uid, ...userDoc.data() };
        }
        return decodedToken;
    } catch (error) {
        console.error('Error verifying auth token:', error);
        return null;
    }
}

// Helper to shuffle an array
function shuffleArray<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}


// REFINED: This function now uses a less aggressive curve, giving higher value prizes a better chance.
function selectWeightedPrize(prizes: Prize[], weights?: Record<string, number>, budget?: number): Prize | null {
    if (prizes.length === 0) return null;

    let eligiblePrizes = budget !== undefined ? prizes.filter(p => p.value <= budget) : prizes;
    if (eligiblePrizes.length === 0) return null;
    
    eligiblePrizes = eligiblePrizes.sort((a,b) => b.value - a.value);

    const weightedPrizes = eligiblePrizes.map(p => {
        // NEW: Weight is now based on the inverse of the square root of the value.
        // This flattens the probability curve, so higher value prizes aren't penalized as much.
        const baseWeight = 1 / (Math.sqrt(p.value) + 1);
        const profileMultiplier = weights && weights[p.id] ? weights[p.id] : 1;
        return {
            prize: p,
            weight: baseWeight * profileMultiplier,
        };
    });

    const totalWeight = weightedPrizes.reduce((sum, p) => sum + p.weight, 0);
    let random = Math.random() * totalWeight;

    for (const weightedPrize of weightedPrizes) {
        random -= weightedPrize.weight;
        if (random <= 0) {
            return weightedPrize.prize;
        }
    }

    return eligiblePrizes[eligiblePrizes.length - 1]?.prize || null;
}


// Function to generate the game grid based on the outcome
function generateGameGrid(allPrizes: Prize[], prizeWon: Prize | null): Prize[] {
  const noWinPrize = allPrizes.find(p => p.value === 0);
  if (!noWinPrize) {
    throw new Error("A 'no-win' prize with value 0 must be configured for this scratchcard.");
  }
  
  let grid: Prize[] = [];

  if (prizeWon && prizeWon.value > 0) {
    // WINNING GRID
    grid.push(prizeWon, prizeWon, prizeWon);
    
    const otherPrizes = allPrizes.filter(p => p.id !== prizeWon.id);
    
    let fillerPrizes = [];
    let i = 0;
    while (fillerPrizes.length < 6) {
        const prizeToAdd = otherPrizes.length > 0 ? otherPrizes[i % otherPrizes.length] : noWinPrize;
        const count = fillerPrizes.filter(p => p.id === prizeToAdd.id).length;
        if (count < 2) {
             fillerPrizes.push(prizeToAdd);
        }
       i++;
       if (i > 1000) break; // safety break
    }
    grid.push(...fillerPrizes);

  } else {
    // LOSING GRID
    grid.push(noWinPrize, noWinPrize); 
    
    const otherPrizes = allPrizes.filter(p => p.value > 0);
    let fillerPrizes: Prize[] = [];
    let i = 0;
    
    const prizePool = otherPrizes.length > 0 ? otherPrizes : [noWinPrize];

    while(fillerPrizes.length < 7) {
       const prizeToAdd = prizePool[i % prizePool.length];
       const countInGrid = grid.filter(p => p.id === prizeToAdd.id).length;
       const countInFiller = fillerPrizes.filter(p => p.id === prizeToAdd.id).length;

       if(countInGrid + countInFiller < 2) {
         fillerPrizes.push(prizeToAdd);
       }
       i++;
       if (i > 1000) break; // safety break
    }
     grid.push(...fillerPrizes);
  }

  return shuffleArray(grid);
}


// --- NEW TIERED PRIZE LOGIC ---

type PrizeTier = 'low' | 'medium' | 'high';

function determinePrizeTier(batch: GgrBatch, budget: number): PrizeTier | null {
    if (!batch.prizeTiers) return null; // Fallback if tiers are not configured

    const tiers: { name: PrizeTier, config: any, minPrize: number }[] = [
        { name: 'low', config: batch.prizeTiers.low, minPrize: 0.01 },
        { name: 'medium', config: batch.prizeTiers.medium, minPrize: batch.prizeTiers.low.maxAmount + 0.01 },
        { name: 'high', config: batch.prizeTiers.high, minPrize: batch.prizeTiers.medium.maxAmount + 0.01 },
    ];
    
    // Filter out tiers that are impossible to award with the current budget
    const possibleTiers = tiers.filter(t => budget >= t.minPrize);
    if (possibleTiers.length === 0) return null;
    
    // Create a weighted list of possible tiers based on their probability
    const weightedTierList: PrizeTier[] = [];
    possibleTiers.forEach(tier => {
        // The probability is a whole number (e.g., 75 for 75%). We use it to populate the list.
        for (let i = 0; i < (tier.config.probability || 0); i++) {
            weightedTierList.push(tier.name);
        }
    });

    if (weightedTierList.length === 0) {
        return null;
    }
    
    // Select a random tier from the weighted list
    const randomIndex = Math.floor(Math.random() * weightedTierList.length);
    return weightedTierList[randomIndex];
}


function getPrizesForTier(tier: PrizeTier | null, allPrizes: Prize[], tiersConfig?: GgrBatch['prizeTiers']): Prize[] {
    if (!tier || !tiersConfig) {
        return allPrizes; // Fallback to all prizes if no tier or config
    }
    switch (tier) {
        case 'low':
            return allPrizes.filter(p => p.value > 0 && p.value <= tiersConfig.low.maxAmount);
        case 'medium':
            return allPrizes.filter(p => p.value > tiersConfig.low.maxAmount && p.value <= tiersConfig.medium.maxAmount);
        case 'high':
             return allPrizes.filter(p => p.value > tiersConfig.medium.maxAmount);
        default:
            return allPrizes;
    }
}

// REFINED: Influencer prize weights are now more aggressive and distinct between profiles.
function getDemoPrizeWeights(profile: DemoPrizeProfile, prizes: Prize[]): Record<string, number> {
    const weights: Record<string, number> = {};
    const multipliers = {
        low:    { low: 3, medium: 1, high: 0.2 }, // Conservative: favors low prizes, medium is possible, high is rare.
        medium: { low: 1, medium: 3, high: 2 },   // Balanced: makes medium and high prizes more common.
        high:   { low: 0.1, medium: 5, high: 25 },  // Aggressive: drastically increases chance of high prizes.
    };
    const selectedMultipliers = multipliers[profile] || multipliers.medium;

    prizes.forEach(prize => {
        if (prize.value > 50) {
            weights[prize.id] = selectedMultipliers.high;
        } else if (prize.value > 10) {
            weights[prize.id] = selectedMultipliers.medium;
        } else if (prize.value > 0) {
            weights[prize.id] = selectedMultipliers.low;
        } else {
            weights[prize.id] = 1; // No multiplier for zero-value prize
        }
    });
    return weights;
}


export async function playGame(
  card: Scratchcard,
  idToken: string | null
): Promise<{ success: boolean; error?: string; data?: GameResult }> {
  
  const user = await getAuthenticatedUser(idToken);
  if (!user) {
    return { success: false, error: 'Usuário não autenticado. Faça login para jogar.' };
  }
  const userId = user.uid;
  const isInfluencer = user.roles?.includes('influencer');

  const winnablePrizes = card.prizes.filter(p => p.value > 0);
  const noWinPrize = card.prizes.find(p => p.value === 0);

  if (!noWinPrize || winnablePrizes.length === 0) {
      return { success: false, error: 'Esta raspadinha não está configurada corretamente. Faltam prêmios de vitória ou de derrota.' };
  }

  const adminDb = getAdminDb();
  
  try {
    const userDoc = await adminDb.collection('users').doc(userId).get();
    if (!userDoc.exists) throw new Error('Usuário não encontrado.');
    
    const userData = userDoc.data()!;

    // For non-influencers, check balance before playing.
    if (!isInfluencer && userData.balance < card.price) {
      throw new Error('Saldo insuficiente para jogar.');
    }

    const allBatchesSnapshot = await adminDb.collection('ggr_batches').get();
    const associatedBatchDoc = allBatchesSnapshot.docs.find(doc => doc.data().participatingCardIds?.includes(card.id));
    
    // --- Influencer Logic ---
    if (isInfluencer) {
        const demoProfile = userData.demoPrizeProfile || 'medium';
        const prizeWeights = getDemoPrizeWeights(demoProfile, card.prizes); // Pass all prizes including no-win
        const prizeWon = selectWeightedPrize(card.prizes, prizeWeights) || noWinPrize;
        const grid = generateGameGrid(card.prizes, prizeWon);

        // Influencer plays DO affect their balance, but not GGR.
        await adminDb.runTransaction(async (transaction) => {
             const gamePlayRef = adminDb.collection('game_plays').doc();
             await createLedgerEntries(transaction, userId, card.price, prizeWon?.value || 0, card.name, gamePlayRef.id);
             
             transaction.set(gamePlayRef, {
                 userId, cardId: card.id, cardName: card.name, price: card.price,
                 prizeWonId: prizeWon?.id || null, prizeWonValue: prizeWon?.value || 0,
                 lossAmount: 0, 
                 createdAt: FieldValue.serverTimestamp(),
                 isDemo: true,
             });
        });

        await logSystemEvent(userId, 'user', 'SCRATCHCARD_PLAY', {
            cardId: card.id, cardName: card.name, price: card.price,
            prizeWon: prizeWon?.name || 'Nenhum', prizeValue: prizeWon?.value || 0,
            rtpSource: 'influencer_profile', demoProfile: demoProfile, isDemo: true,
        }, 'SUCCESS');
        
        return { success: true, data: { grid, prizeWon } };
    }

    // --- Regular Player GGR Logic ---
    if (associatedBatchDoc) {
        if (associatedBatchDoc.data().status !== 'active') {
            const prizeWon = noWinPrize;
            const grid = generateGameGrid(card.prizes, prizeWon);

            await adminDb.runTransaction(async (transaction) => {
                const gamePlayRef = adminDb.collection('game_plays').doc();
                await createLedgerEntries(transaction, userId, card.price, 0, card.name, gamePlayRef.id);
                
                transaction.set(gamePlayRef, {
                    userId, cardId: card.id, cardName: card.name, price: card.price,
                    prizeWonId: prizeWon?.id || null, prizeWonValue: 0,
                    lossAmount: card.price, createdAt: FieldValue.serverTimestamp()
                });
            });

            await logSystemEvent(userId, 'user', 'SCRATCHCARD_PLAY', {
                cardId: card.id, cardName: card.name, price: card.price,
                prizeWon: 'Nenhum', prizeValue: 0,
                rtpSource: 'inactive_ggr_batch', batchId: associatedBatchDoc.id,
            }, 'SUCCESS');

            return { success: true, data: { grid, prizeWon } };
        }

        let prizeWon: Prize | null = null;
        await adminDb.runTransaction(async (transaction) => {
            const batchRef = associatedBatchDoc.ref;
            const batchSnap = await transaction.get(batchRef);
            let batchData = batchSnap.data()! as GgrBatch;

            if (batchData.isRecurring && batchData.ggrCurrent >= batchData.ggrTarget) {
                const newBatchState = { ggrCurrent: 0, prizesDistributed: 0 };
                transaction.update(batchRef, newBatchState);
                batchData = { ...batchData, ...newBatchState };
            }

            const { ggrTarget, prizePool, ggrCurrent, prizesDistributed, prizeTiers } = batchData;
            
            const newGgrCurrent = (ggrCurrent || 0) + card.price;
            const maxPrizeAllowed = (newGgrCurrent / ggrTarget) * prizePool;
            const availablePrizeBudget = maxPrizeAllowed - (prizesDistributed || 0);
            
            let prizeWonValue = 0;
            if (availablePrizeBudget > 0) {
                const determinedTier = determinePrizeTier(batchData, availablePrizeBudget);
                const prizesInTier = getPrizesForTier(determinedTier, winnablePrizes, prizeTiers);
                const possiblePrize = selectWeightedPrize(prizesInTier, undefined, availablePrizeBudget);
                
                if (possiblePrize) {
                    prizeWon = possiblePrize;
                    prizeWonValue = prizeWon.value;
                }
            }
            if(!prizeWon) prizeWon = noWinPrize;

            const gamePlayRef = adminDb.collection('game_plays').doc();
            const lossAmount = card.price - prizeWonValue;
            
            await createLedgerEntries(transaction, userId, card.price, prizeWonValue, card.name, gamePlayRef.id);
            
            transaction.set(gamePlayRef, {
                userId, cardId: card.id, cardName: card.name, price: card.price,
                prizeWonId: prizeWon?.id || null, prizeWonValue: prizeWonValue,
                lossAmount: lossAmount > 0 ? lossAmount : 0, createdAt: FieldValue.serverTimestamp()
            });

            transaction.update(batchRef, {
                ggrCurrent: newGgrCurrent,
                prizesDistributed: (prizesDistributed || 0) + prizeWonValue
            });
        });
        
        const grid = generateGameGrid(card.prizes, prizeWon);
        await logSystemEvent(userId, 'user', 'SCRATCHCARD_PLAY', {
            cardId: card.id, cardName: card.name, price: card.price,
            prizeWon: prizeWon?.name || 'Nenhum', prizeValue: prizeWon?.value || 0,
            rtpSource: 'ggr_batch', batchId: associatedBatchDoc.id,
        }, 'SUCCESS');

        return { success: true, data: { grid, prizeWon } };
    }

    // Fallback if no batch is associated
    const prizeWon = noWinPrize;
    const grid = generateGameGrid(card.prizes, prizeWon);
    
    await adminDb.runTransaction(async (transaction) => {
        const gamePlayRef = adminDb.collection('game_plays').doc();
        const prizeValue = 0;
        const lossAmount = card.price;

        await createLedgerEntries(transaction, userId, card.price, prizeValue, card.name, gamePlayRef.id);
        
        transaction.set(gamePlayRef, {
            userId, cardId: card.id, cardName: card.name, price: card.price,
            prizeWonId: prizeWon?.id || null, prizeWonValue: prizeValue,
            lossAmount: lossAmount > 0 ? lossAmount : 0, createdAt: FieldValue.serverTimestamp()
        });
    });

    await logSystemEvent(userId, 'user', 'SCRATCHCARD_PLAY', {
        cardId: card.id, cardName: card.name, price: card.price,
        prizeWon: 'Nenhum', prizeValue: 0,
        rtpSource: 'fallback_no_batch',
    }, 'SUCCESS');

    return { success: true, data: { grid, prizeWon } };

  } catch (error: any) {
    console.error('Error during playGame:', error);
    await logSystemEvent(userId, 'user', 'SCRATCHCARD_PLAY', {
      error: error.message,
      cardId: card.id,
    }, 'ERROR');
    return { success: false, error: error.message };
  }
}
