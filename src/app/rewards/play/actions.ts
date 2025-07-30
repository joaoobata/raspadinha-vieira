
'use server';

import { getAdminDb, getAdminAuth } from '@/lib/firebase-admin-init';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { Scratchcard, Prize } from '@/app/admin/scratchcards/actions';
import { logSystemEvent } from '@/lib/logging';

// Helper function to safely convert a Timestamp to an ISO string
const toISOStringOrNull = (timestamp: Timestamp | undefined): string | null => {
    try {
        return timestamp ? timestamp.toDate().toISOString() : null;
    } catch (error) {
        return null;
    }
}

async function getImageAsDataUri(imageUrl: string): Promise<string | null> {
    try {
        const response = await fetch(imageUrl);
        if (!response.ok) {
            console.error(`Failed to fetch image: ${response.statusText}`);
            return null;
        }
        const buffer = await response.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');
        const mimeType = response.headers.get('content-type') || 'image/png';
        return `data:${mimeType};base64,${base64}`;
    } catch (error) {
        console.error("Error converting image to data URI:", error);
        return null;
    }
}


interface GameResult {
  grid: Prize[];
  prizeWon: Prize | null;
  isFinalStep: boolean;
}

interface GameData {
    card: Scratchcard,
    scratchImageAsDataUri: string | null;
    totalPlays: number,
    currentStep: number,
}

// This function now only verifies the user based on the ID token from the client.
async function getAuthenticatedUser(idToken: string | null) {
    if (!idToken) {
        return null;
    }
    try {
        const decodedToken = await getAdminAuth().verifyIdToken(idToken);
        const userDoc = await getAdminDb().collection('users').doc(decodedToken.uid).get();
        if (userDoc.exists) {
            return { uid: decodedToken.uid, ...userDoc.data() };
        }
        return null; // Return null if user doc doesn't exist
    } catch (error) {
        console.error('Error verifying auth token:', error);
        return null;
    }
}

export async function getRewardGameData(idToken: string): Promise<{ success: boolean; data?: GameData; error?: string }> {
    const user = await getAuthenticatedUser(idToken);
    if (!user) {
        return { success: false, error: 'Você precisa estar logado para jogar.' };
    }

    try {
        const adminDb = getAdminDb();
        const userDocRef = adminDb.collection('users').doc(user.uid);
        const userDoc = await userDocRef.get();

        if (!userDoc.exists) {
            return { success: false, error: 'Usuário não encontrado.' };
        }

        const userData = userDoc.data()!;
        const rewardInfo = userData.signupReward;

        if (!rewardInfo || rewardInfo.status === 'claimed' || !rewardInfo.journey || rewardInfo.journey.length === 0) {
            return { success: false, error: 'Nenhuma recompensa de cadastro pendente encontrada.' };
        }

        const currentStepIndex = rewardInfo.currentStep || 0;
        if (currentStepIndex >= rewardInfo.journey.length) {
            await userDocRef.update({ 'signupReward.status': 'claimed' });
            return { success: false, error: 'Jornada de recompensas já concluída.' };
        }

        const currentStepData = rewardInfo.journey[currentStepIndex];
        const cardDoc = await adminDb.collection('scratchcards').doc(currentStepData.cardId).get();

        if (!cardDoc.exists) {
            return { success: false, error: `A raspadinha configurada para esta etapa não foi encontrada.` };
        }

        const cardData = cardDoc.data();
        if (!cardData) {
             return { success: false, error: `Dados da raspadinha de recompensa estão corrompidos.` };
        }
        
        // Convert Timestamps to serializable format (ISO strings)
        const serializableCard: Scratchcard = {
            id: cardDoc.id,
            name: cardData.name,
            description: cardData.description,
            price: cardData.price,
            imageUrl: cardData.imageUrl,
            scratchImageUrl: cardData.scratchImageUrl,
            prizes: cardData.prizes,
            isEnabled: cardData.isEnabled,
            categoryIds: cardData.categoryIds || [],
            createdAt: toISOStringOrNull(cardData.createdAt),
            updatedAt: toISOStringOrNull(cardData.updatedAt),
        };
        
        const scratchImageAsDataUri = serializableCard.scratchImageUrl
            ? await getImageAsDataUri(serializableCard.scratchImageUrl)
            : null;


        const data: GameData = {
            card: serializableCard,
            scratchImageAsDataUri,
            totalPlays: rewardInfo.journey.length,
            currentStep: currentStepIndex + 1,
        };

        return { success: true, data };
    } catch (error: any) {
        await logSystemEvent(user.uid, 'user', 'GET_REWARD_DATA_FAIL', { error: error.message, stack: error.stack }, 'ERROR');
        return { success: false, error: error.message || 'Falha ao carregar dados do jogo de recompensa. Tente novamente.' };
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

function generateGameGrid(allPrizes: Prize[], prizeWon: Prize | null): Prize[] {
  const noWinPrize = allPrizes.find(p => p.value === 0);
  if (!noWinPrize) throw new Error("A 'no-win' prize with value 0 must be configured.");
  
  let grid: Prize[] = [];

  if (prizeWon && prizeWon.value > 0) {
    grid.push(prizeWon, prizeWon, prizeWon);
    const otherPrizes = allPrizes.filter(p => p.id !== prizeWon.id);
    let fillerPrizes: Prize[] = [];
    let i = 0;
    while (fillerPrizes.length < 6) {
        const prizeToAdd = otherPrizes.length > 0 ? otherPrizes[i % otherPrizes.length] : noWinPrize;
        const count = fillerPrizes.filter(p => p.id === prizeToAdd.id).length;
        if (count < 2) fillerPrizes.push(prizeToAdd);
        i++;
        if (i > 1000) break;
    }
    grid.push(...fillerPrizes);
  } else {
    grid.push(noWinPrize, noWinPrize); 
    const otherPrizes = allPrizes.filter(p => p.value > 0);
    let fillerPrizes: Prize[] = [];
    let i = 0;
    const prizePool = otherPrizes.length > 0 ? otherPrizes : [noWinPrize];
    while(fillerPrizes.length < 7) {
       const prizeToAdd = prizePool[i % prizePool.length];
       const countInGrid = grid.filter(p => p.id === prizeToAdd.id).length;
       const countInFiller = fillerPrizes.filter(p => p.id === prizeToAdd.id).length;
       if(countInGrid + countInFiller < 2) fillerPrizes.push(prizeToAdd);
       i++;
       if (i > 1000) break;
    }
    grid.push(...fillerPrizes);
  }
  return shuffleArray(grid);
}

export async function playRewardGame(idToken: string | null): Promise<{ success: boolean; error?: string; data?: GameResult }> {
  const user = await getAuthenticatedUser(idToken);
  if (!user) return { success: false, error: 'Usuário não autenticado.' };

  const userId = user.uid;
  const adminDb = getAdminDb();
  const userRef = adminDb.collection('users').doc(userId);
  await logSystemEvent(userId, 'user', 'REWARD_PLAY_START', { status: 'initiated' }, 'INFO');

  try {
    let resultForLog: any = {};
    let cardForLog: any = {};
    let rewardDataForLog: any = {};
    
    await adminDb.runTransaction(async (transaction) => {
      const userDoc = await transaction.get(userRef);
      if (!userDoc.exists) {
         await logSystemEvent(userId, 'system', 'REWARD_PLAY_FAIL', { reason: 'User document not found in transaction' }, 'ERROR');
         throw new Error('Usuário não encontrado.');
      }
      
      const userData = userDoc.data()!;
      const rewardInfo = userData.signupReward;
      rewardDataForLog = rewardInfo;
      await logSystemEvent(userId, 'user', 'REWARD_PLAY_PROGRESS', { status: 'User data fetched', rewardInfo }, 'INFO');

      if (!rewardInfo || rewardInfo.status === 'claimed' || !rewardInfo.journey || rewardInfo.journey.length === 0) {
        await logSystemEvent(userId, 'user', 'REWARD_PLAY_FAIL', { reason: 'No pending reward journey found' }, 'ERROR');
        throw new Error('Nenhuma recompensa pendente para jogar.');
      }
      
      const currentStepIndex = rewardInfo.currentStep || 0;
      if (currentStepIndex >= rewardInfo.journey.length) {
        await logSystemEvent(userId, 'user', 'REWARD_PLAY_FAIL', { reason: 'Journey already completed', step: currentStepIndex, length: rewardInfo.journey.length }, 'ERROR');
        throw new Error('Jornada de recompensas já concluída.');
      }
      await logSystemEvent(userId, 'user', 'REWARD_PLAY_PROGRESS', { status: 'Step validated', currentStepIndex }, 'INFO');

      
      const currentStepData = rewardInfo.journey[currentStepIndex];
      const isFinalStep = currentStepIndex === rewardInfo.journey.length - 1;

      const cardDocSnap = await transaction.get(adminDb.collection('scratchcards').doc(currentStepData.cardId));
      if (!cardDocSnap.exists) {
        await logSystemEvent(userId, 'user', 'REWARD_PLAY_FAIL', { reason: 'Scratchcard not found', cardId: currentStepData.cardId }, 'ERROR');
        throw new Error('Raspadinha configurada para recompensa não existe mais.');
      }
      
      const card = { id: cardDocSnap.id, ...cardDocSnap.data() } as Scratchcard;
      cardForLog = card;
      await logSystemEvent(userId, 'user', 'REWARD_PLAY_PROGRESS', { status: 'Card data fetched', cardName: card.name }, 'INFO');
      const allPrizes = card.prizes;
      
      let prizeWon: Prize | null = null;
      const noWinPrize = allPrizes.find(p => p.value === 0);

      if (isFinalStep && currentStepData.prizeToWinId) {
          prizeWon = allPrizes.find(p => p.id === currentStepData.prizeToWinId) || noWinPrize || null;
           await logSystemEvent(userId, 'user', 'REWARD_PLAY_PROGRESS', { status: 'Final prize determined', prizeName: prizeWon?.name }, 'INFO');
      } else {
          prizeWon = noWinPrize || null;
          await logSystemEvent(userId, 'user', 'REWARD_PLAY_PROGRESS', { status: 'No-win prize determined for intermediate step' }, 'INFO');
      }

      if (!prizeWon) throw new Error("Configuração de prêmio inválida para a recompensa.");

      const grid = generateGameGrid(allPrizes, prizeWon);
      const prizeValue = prizeWon.value || 0;
      
      const newRewardStatus = {
          ...rewardInfo,
          currentStep: currentStepIndex + 1,
          status: isFinalStep ? 'claimed' : 'in_progress'
      };
      
      const updatePayload: any = { 'signupReward': newRewardStatus };
      
      if (isFinalStep && prizeValue > 0) {
          updatePayload.prizeBalance = FieldValue.increment(prizeValue);
          await logSystemEvent(userId, 'user', 'REWARD_PLAY_PROGRESS', { status: 'Prize balance will be incremented', prizeValue }, 'INFO');
      }
      
      transaction.update(userRef, updatePayload);
      
      resultForLog = { grid, prizeWon, isFinalStep };
    });

    if (!resultForLog) {
        await logSystemEvent(userId, 'system', 'REWARD_PLAY_FAIL', { reason: 'Transaction completed but resultForLog is empty' }, 'ERROR');
        throw new Error("Falha ao processar a jogada de recompensa.");
    }
    
    await logSystemEvent(userId, 'user', 'REWARD_SCRATCHCARD_PLAY', {
      step: (rewardDataForLog.currentStep || 0) + 1,
      totalSteps: rewardDataForLog.journey.length,
      cardId: cardForLog.id,
      cardName: cardForLog.name,
      isFinalStep: resultForLog.isFinalStep,
      prizeWon: resultForLog.prizeWon?.name || 'Nenhum',
      prizeValue: resultForLog.prizeWon?.value || 0,
    }, 'SUCCESS');
    
    return { success: true, data: resultForLog };

  } catch (error: any) {
    console.error("Error in playRewardGame:", error);
    await logSystemEvent(userId, 'user', 'REWARD_PLAY_FAIL', { reason: error.message, stack: error.stack }, 'ERROR');
    return { success: false, error: "Falha ao processar a recompensa. Tente novamente mais tarde." };
  }
}
