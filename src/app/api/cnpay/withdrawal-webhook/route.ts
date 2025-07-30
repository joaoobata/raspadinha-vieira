
import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin-init';
import { FieldValue } from 'firebase-admin/firestore';

async function logErrorToFirestore(errorMessage: string, webhookData: any) {
    try {
        const adminDb = getAdminDb();
        await adminDb.collection('webhook_errors').add({
            type: 'withdrawal',
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

async function createLedgerEntry(
    transaction: FirebaseFirestore.Transaction,
    userId: string,
    type: 'WITHDRAWAL_COMPLETE' | 'WITHDRAWAL_REFUND',
    amount: number,
    description: string,
    refId: string
) {
    const adminDb = getAdminDb();
    const userRef = adminDb.collection('users').doc(userId);
    const userDoc = await transaction.get(userRef);
    if (!userDoc.exists) throw new Error(`User ${userId} not found for ledger entry.`);

    const userData = userDoc.data()!;
    const balanceBefore = userData.balance || 0;
    const balanceAfter = balanceBefore + amount;

    const ledgerRef = adminDb.collection('user_ledger').doc();
    transaction.set(ledgerRef, {
        userId,
        type,
        amount,
        description,
        balanceBefore,
        balanceAfter,
        refId,
        createdAt: FieldValue.serverTimestamp(),
    });

    if (type === 'WITHDRAWAL_REFUND') {
        transaction.update(userRef, { balance: balanceAfter });
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
  let webhookData;
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
    console.log("Withdrawal Webhook received:", webhookData);

    const { event, withdraw } = webhookData;

    if (!event || !withdraw || !withdraw.clientIdentifier) {
      const errorMessage = 'Withdrawal Webhook ignored: Missing required data (event, withdraw, or clientIdentifier).';
      console.log(errorMessage, webhookData);
      return NextResponse.json({ status: 'ignored', message: errorMessage }, { status: 200 });
    }

    const adminDb = getAdminDb();
    const withdrawalIdentifier = withdraw.clientIdentifier;
    const withdrawalRef = adminDb.collection('withdrawals').doc(withdrawalIdentifier);

    await adminDb.runTransaction(async (transaction) => {
        const withdrawalSnap = await transaction.get(withdrawalRef);
        
        if (!withdrawalSnap.exists) {
            const errorMessage = `Webhook error: Withdrawal with identifier ${withdrawalIdentifier} not found.`;
            await logErrorToFirestore(errorMessage, webhookData);
            throw new Error(errorMessage);
        }

        const withdrawalData = withdrawalSnap.data();
         if (!withdrawalData) {
            const errorMessage = `Webhook error: Withdrawal data is empty for ${withdrawalIdentifier}.`;
            await logErrorToFirestore(errorMessage, webhookData);
            throw new Error(errorMessage);
        }
        
        if (withdrawalData.status === 'COMPLETED' || withdrawalData.status === 'FAILED' || withdrawalData.status === 'REJECTED') {
            console.log(`Webhook ignored: Withdrawal ${withdrawalIdentifier} is already in a final state (${withdrawalData.status}).`);
            return;
        }

        let newStatus = withdrawalData.status;
        let requiresLedgerEntry = false;
        let ledgerType: 'WITHDRAWAL_COMPLETE' | 'WITHDRAWAL_REFUND' | null = null;
        let ledgerDescription = '';
        const updatePayload: any = {
            cnpayStatus: withdraw.status,
            updatedAt: FieldValue.serverTimestamp(),
            webhookData: FieldValue.arrayUnion(webhookData),
        };

        if (event === 'TRANSFER_COMPLETED') {
            newStatus = 'COMPLETED';
            requiresLedgerEntry = true;
            ledgerType = 'WITHDRAWAL_COMPLETE';
            ledgerDescription = `Saque para a chave PIX ${withdrawalData.pixKey} concluído.`;
            updatePayload.completedAt = FieldValue.serverTimestamp();
        } else if (event === 'TRANSFER_FAILED' || event === 'TRANSFER_CANCELED' || event === 'TRANSFER_RETURNED') {
            newStatus = 'FAILED';
            requiresLedgerEntry = true;
            ledgerType = 'WITHDRAWAL_REFUND';
            ledgerDescription = `Estorno de saque para a chave PIX ${withdrawalData.pixKey} (Falha no Gateway).`;
        } else {
            console.log(`Webhook: Handling intermediate event ${event} for ${withdrawalIdentifier}`);
            transaction.update(withdrawalRef, {
                cnpayStatus: withdraw.status, 
                webhookData: FieldValue.arrayUnion(webhookData),
            });
            return;
        }

        if (requiresLedgerEntry && ledgerType) {
             await createLedgerEntry(
                transaction,
                withdrawalData.userId,
                ledgerType,
                // Amount is positive for refund, 0 for completion as balance is already debited
                ledgerType === 'WITHDRAWAL_REFUND' ? withdrawalData.amount : 0, 
                ledgerDescription,
                withdrawalIdentifier
            );
        }
        
        updatePayload.status = newStatus;
        transaction.update(withdrawalRef, updatePayload);

        console.log(`Withdrawal ${withdrawalIdentifier} for user ${withdrawalData.userId} updated to ${newStatus}.`);
    });

    return NextResponse.json({ status: 'success' }, { status: 200 });

  } catch (error: any) {
    const errorMessage = error.message || 'Internal Server Error';
    console.error('Error processing CN Pay withdrawal webhook:', errorMessage);
    
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
