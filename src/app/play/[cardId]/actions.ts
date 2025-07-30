
'use server';

import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin-init';
import { FieldValue } from 'firebase-admin/firestore';
import { Scratchcard, Prize } from '@/app/admin/scratchcards/actions';
import { logSystemEvent } from '@/lib/logging';

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

// Determines the prize based on the probability of winning
function determineOutcome(
    winnablePrizes: Prize[], 
    noWinPrize: Prize, 
    winProbability: number,
    isInfluencerWin: boolean = false
): Prize | null {
    const random = Math.random();

    if (random < winProbability) {
        // It's a win, now select which prize
        if (isInfluencerWin) {
            return selectWeightedPrizeForInfluencer(winnablePrizes);
        }
        return selectWeightedPrize(winnablePrizes);
    } else {
        // It's a loss
        return noWinPrize;
    }
}

// Selects a prize for an influencer, with a balanced approach.
// Uses a logarithmic scale to give higher value prizes a slight edge without making them overwhelmingly common.
function selectWeightedPrizeForInfluencer(prizes: Prize[]): Prize | null {
    if (prizes.length === 0) {
        return null;
    }
    
    const weightedPrizes = prizes.map(p => ({
        prize: p,
        // The weight is logarithmic, so the increase in chance slows down for very high value prizes.
        // This ensures small and medium prizes are still very possible.
        // The +1 prevents log(0), and +0.1 ensures even a 1-value prize has some weight.
        weight: Math.log(p.value + 1) + 0.1
    }));

    const totalWeight = weightedPrizes.reduce((sum, p) => sum + p.weight, 0);
    let random = Math.random() * totalWeight;

    for (const weightedPrize of weightedPrizes) {
        random -= weightedPrize.weight;
        if (random <= 0) {
            return weightedPrize.prize;
        }
    }

    return prizes[prizes.length - 1]; // Fallback
}


// Function to select a prize based on standard weighted probability (lower values are more common)
function selectWeightedPrize(prizes: Prize[]): Prize | null {
    if (prizes.length === 0) {
        return null;
    }

    // Inverse weight: higher value means lower probability
    const weightedPrizes = prizes.map(p => ({
        prize: p,
        weight: 1 / (p.value + 0.1) 
    }));

    const totalWeight = weightedPrizes.reduce((sum, p) => sum + p.weight, 0);
    let random = Math.random() * totalWeight;

    for (const weightedPrize of weightedPrizes) {
        random -= weightedPrize.weight;
        if (random <= 0) {
            return weightedPrize.prize;
        }
    }

    return prizes[prizes.length - 1]; // Fallback
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


export async function playGame(
  card: Scratchcard,
  idToken: string | null
): Promise<{ success: boolean; error?: string; data?: GameResult }> {
  
  const user = await getAuthenticatedUser(idToken);
  if (!user) {
    return { success: false, error: 'Usuário não autenticado. Faça login para jogar.' };
  }
  const userId = user.uid;

  const winnablePrizes = card.prizes.filter(p => p.value > 0);
  const noWinPrize = card.prizes.find(p => p.value === 0);

  if (!noWinPrize || winnablePrizes.length === 0) {
      return { success: false, error: 'Esta raspadinha não está configurada corretamente. Faltam prêmios de vitória ou de derrota.' };
  }

  try {
    const adminDb = getAdminDb();
    const userRef = adminDb.collection('users').doc(userId);
    
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      throw new Error('Usuário não encontrado.');
    }
    
    const userData = userDoc.data()!;
    const currentBalance = userData.balance || 0;
    if (currentBalance < card.price) {
      throw new Error('Saldo insuficiente para jogar.');
    }

    let rtpRate: number;
    let rtpSource: 'card' | 'influencer' | 'global';
    let isInfluencerWin = false;

    // RTP Priority: Influencer > Card > Global
    if (userData.role === 'influencer' && typeof userData.rtpRate === 'number') {
        rtpRate = userData.rtpRate;
        rtpSource = 'influencer';
        isInfluencerWin = true;
    } else if (typeof card.rtpRate === 'number') {
        rtpRate = card.rtpRate;
        rtpSource = 'card';
    } else {
        const rtpSettingsRef = adminDb.collection('settings').doc('rtp');
        const rtpDoc = await rtpSettingsRef.get();
        const rtpSettings = rtpDoc.exists ? rtpDoc.data() : { rate: 0 };
        rtpRate = rtpSettings?.rate ?? 0;
        rtpSource = 'global';
    }
    
    // Convert percentage to decimal for probability calculation
    const rtpRateDecimal = rtpRate / 100;
    const prizeWon = determineOutcome(winnablePrizes, noWinPrize, rtpRateDecimal, isInfluencerWin);
    const grid = generateGameGrid(card.prizes, prizeWon);
    
    await adminDb.runTransaction(async (transaction) => {
        const gamePlayRef = adminDb.collection('game_plays').doc();
        const prizeValue = prizeWon?.value || 0;
        const lossAmount = card.price - prizeValue;

        await createLedgerEntries(transaction, userId, card.price, prizeValue, card.name, gamePlayRef.id);

        transaction.set(gamePlayRef, {
            userId,
            cardId: card.id,
            cardName: card.name,
            price: card.price,
            prizeWonId: prizeWon?.id || null,
            prizeWonValue: prizeValue,
            lossAmount: lossAmount > 0 ? lossAmount : 0,
            createdAt: FieldValue.serverTimestamp()
        });
    });

    // Log the game play event
    await logSystemEvent(userId, 'user', 'SCRATCHCARD_PLAY', {
      cardId: card.id,
      cardName: card.name,
      price: card.price,
      prizeWon: prizeWon?.name || 'Nenhum',
      prizeValue: prizeWon?.value || 0,
      rtpSource: rtpSource,
      rtpRateApplied: `${rtpRate}%`,
    }, 'SUCCESS');


    return {
      success: true,
      data: { grid, prizeWon },
    };

  } catch (error: any) {
    console.error('Error during playGame:', error);
    await logSystemEvent(userId, 'user', 'SCRATCHCARD_PLAY', {
      error: error.message,
      cardId: card.id,
    }, 'ERROR');
    return { success: false, error: error.message };
  }
}
