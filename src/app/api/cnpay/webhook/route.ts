
'use server';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin-init';
import { FieldValue } from 'firebase-admin/firestore';
import { creditCommission } from '@/app/actions/commission';
import { trackServerEvent, sendAffiliatePostback, sendDataLayerEvent } from '@/lib/tracking';

async function logErrorToFirestore(errorMessage: string, webhookData: any) {
    try {
        const adminDb = getAdminDb();
        await adminDb.collection('webhook_errors').add({
            type: 'deposit',
            error: errorMessage,
            webhookData: webhookData,
            createdAt: FieldValue.serverTimestamp(),
            resolved: false,
        });
        console.log("Error logged to Firestore:", errorMessage);
    } catch (dbError) {
        console.error("Failed to log error to Firestore:", dbError);
    }
}

// Helper to get allowed IPs from settings
async function getAllowedIps(): Promise<string[]> {
    try {
        const adminDb = getAdminDb();
        const settingsDoc = await adminDb.collection('settings').doc('gateway').get();
        if (settingsDoc.exists) {
            const ips = settingsDoc.data()?.allowedIps;
            if (Array.isArray(ips)) {
                return ips.map(ip => ip.trim()).filter(Boolean);
            }
        }
        return [];
    } catch (error) {
        console.error("Error fetching allowed IPs:", error);
        return [];
    }
}


export async function POST(req: NextRequest) {
  let webhookData: any;
  try {
    // --- SECURITY CHECK: IP Whitelisting ---
    const allowedIps = await getAllowedIps();
    const requestIp = req.headers.get('x-forwarded-for') ?? req.ip;

    if (process.env.NODE_ENV === 'production' && allowedIps.length > 0 && requestIp && !allowedIps.includes(requestIp)) {
        console.warn(`Webhook blocked: IP ${requestIp} not in allowed list.`);
        return NextResponse.json({ status: 'error', message: 'Unauthorized IP' }, { status: 403 });
    }
    // --- END SECURITY CHECK ---

    webhookData = await req.json();
    console.log("Webhook received:", JSON.stringify(webhookData, null, 2));

    const { event, transaction } = webhookData;

    if (event !== 'TRANSACTION_PAID') {
      const message = `Webhook ignored: Event is '${event}', not 'TRANSACTION_PAID'.`;
      console.log(message);
      return NextResponse.json({ status: 'ignored', message }, { status: 200 });
    }

    if (!transaction || !transaction.identifier) {
      const errorMessage = 'Webhook error: Payload is missing transaction object or transaction.identifier.';
      console.error(errorMessage, webhookData);
      await logErrorToFirestore(errorMessage, webhookData);
      return NextResponse.json({ status: 'error', message: errorMessage }, { status: 200 });
    }

    const adminDb = getAdminDb();
    const { identifier } = transaction;
    const transactionsRef = adminDb.collection('transactions');
    const q = transactionsRef.where('identifier', '==', identifier).limit(1);
    
    let userId: string | null = null;
    let amount: number | null = null;
    let docId: string | null = null;
    let wasFtd = false;

    await adminDb.runTransaction(async (tx) => {
        const snapshot = await tx.get(q);

        if (snapshot.empty) {
            const errorMessage = `Webhook error: Transaction with identifier ${identifier} not found in Firestore.`;
            await logErrorToFirestore(errorMessage, webhookData);
            throw new Error(errorMessage);
        }

        const transactionDoc = snapshot.docs[0];
        const transactionRef = transactionDoc.ref;
        const transactionData = transactionDoc.data();
        
        if (!transactionData) {
            const errorMessage = `Webhook error: Transaction data is empty for identifier ${identifier}.`;
            await logErrorToFirestore(errorMessage, webhookData);
            throw new Error(errorMessage);
        }
        
        userId = transactionData.userId;
        amount = transactionData.amount;
        docId = transactionDoc.id;

        const userRef = adminDb.collection('users').doc(userId);
        const userDoc = await tx.get(userRef);
        const userData = userDoc.data();

        // Check for First Time Deposit (FTD)
        if (userData && userData.ftd === false) {
            wasFtd = true;
            tx.update(userRef, { ftd: true });
        }


        if (transactionData.status !== 'COMPLETED') {
            const paymentDate = transaction.paidAt || transaction.payedAt;
            if (!paymentDate) {
                const errorMessage = `Webhook error: paidAt/payedAt field is missing in transaction object for identifier ${identifier}.`;
                await logErrorToFirestore(errorMessage, webhookData);
                throw new Error(errorMessage);
            }

            tx.update(transactionRef, {
                status: 'COMPLETED',
                paidAt: new Date(paymentDate),
                webhookData: webhookData,
            });

            console.log(`Transaction ${identifier} marked as COMPLETED.`);
        } else {
             console.log(`Webhook ignored status update: Transaction ${identifier} is already completed.`);
        }
    });

    if (userId && amount && docId) {
        await creditCommission(userId, amount, docId);
        
        // Use the new server-side dataLayer event sender
        const eventName = wasFtd ? 'ftd_complete' : 'redeposit_complete';
        await sendDataLayerEvent(userId, eventName, {
            value: amount,
            currency: 'BRL',
            transaction_id: docId,
        });

        // This will still trigger Meta CAPI, TikTok API etc.
        await trackServerEvent(userId, {
            eventName: 'Purchase',
            value: amount,
            currency: 'BRL',
            transactionId: docId
        });

        if (wasFtd) {
            await sendAffiliatePostback(userId, amount, docId);
        }
    }


    return NextResponse.json({ status: 'success' }, { status: 200 });

  } catch (error: any) {
    const errorMessage = error.message || 'Internal Server Error';
    console.error('Error processing CN Pay webhook:', errorMessage);
    
    if (webhookData === undefined) {
      try {
        const requestBody = await req.text();
        await logErrorToFirestore(errorMessage, { rawBody: requestBody });
      } catch (textError) {
        await logErrorToFirestore(errorMessage, { error: 'Failed to parse request body as JSON or text.'});
      }
    }
    
    return NextResponse.json({ status: 'error', message: errorMessage }, { status: 200 });
  }
}
