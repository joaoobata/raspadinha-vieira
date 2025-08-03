
'use server';

import { NextRequest, NextResponse } from 'next/server';
import { trackServerEvent } from '@/lib/tracking';
import { getAdminDb } from '@/lib/firebase-admin-init';

// This is a new endpoint to receive server-side events and trigger tracking
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, eventName, eventData } = body;

    if (!userId || !eventName || !eventData) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    // You might want to add some validation here to ensure the request is legitimate,
    // e.g., using a shared secret key.

    // Enrich event data with user info if needed
    const adminDb = getAdminDb();
    const userDoc = await adminDb.collection('users').doc(userId).get();
    if (!userDoc.exists) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    const userData = userDoc.data();
    
    const fullEventData = {
        ...eventData,
        user: {
            email: userData?.email,
            phone: userData?.phone,
            firstName: userData?.firstName,
            lastName: userData?.lastName,
        },
        cid: userData?.clickId,
        session_id: userData?.sessionId,
    };

    // Call the central server-side tracking function
    await trackServerEvent(userId, {
        eventName: eventName,
        value: eventData.value || 0,
        currency: eventData.currency || 'BRL',
        transactionId: eventData.transactionId,
    });

    return NextResponse.json({ status: 'success' });
  } catch (error: any) {
    console.error('Error tracking dataLayer event:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
