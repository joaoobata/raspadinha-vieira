
'use server';

import { getAdminDb } from './firebase-admin-init';
import crypto from 'crypto';

interface EventData {
    eventName: 'Purchase' | 'CompleteRegistration';
    value: number;
    currency: string;
    transactionId?: string; // For purchase deduplication
}

interface UserData {
    email?: string;
    phone?: string;
    firstName?: string;
    lastName?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
    fbp?: string; // Facebook cookie
    fbc?: string; // Facebook click ID
}

// Helper to hash user data for Meta
function hash(value: string): string {
    return crypto.createHash('sha256').update(value).digest('hex');
}


async function sendToMetaConversionApi(userId: string, eventData: EventData, userData: UserData, settings: any, req: any) {
    if (!settings.metaPixelId || !settings.metaConversionApiToken) {
        console.log('Skipping Meta CAPI: Pixel ID or Token not configured.');
        return;
    }

    const eventId = eventData.transactionId ? `txn_${eventData.transactionId}` : `evt_${userId}_${Date.now()}`;

    const payload = {
        data: [
            {
                event_name: eventData.eventName,
                event_time: Math.floor(Date.now() / 1000),
                event_id: eventId,
                event_source_url: req.headers.get('referer') || 'https://raspadinha-jade.vercel.app',
                action_source: 'website',
                user_data: {
                    em: userData.email ? [hash(userData.email)] : undefined,
                    ph: userData.phone ? [hash(userData.phone)] : undefined,
                    fn: userData.firstName ? [hash(userData.firstName)] : undefined,
                    ln: userData.lastName ? [hash(userData.lastName)] : undefined,
                    client_ip_address: req.ip || req.headers.get('x-forwarded-for'),
                    client_user_agent: req.headers.get('user-agent'),
                    fbp: userData.fbp,
                    fbc: userData.fbc,
                },
                custom_data: eventData.eventName === 'Purchase' ? {
                    value: eventData.value,
                    currency: eventData.currency,
                } : undefined,
            },
        ],
    };

    try {
        const response = await fetch(
            `https://graph.facebook.com/v19.0/${settings.metaPixelId}/events?access_token=${settings.metaConversionApiToken}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            }
        );

        const responseData = await response.json();
        if (!response.ok) {
            console.error('Meta CAPI Error:', responseData);
        } else {
            console.log('Successfully sent event to Meta CAPI:', responseData);
        }
    } catch (error) {
        console.error('Error sending event to Meta CAPI:', error);
    }
}

async function sendToGoogleConversionApi(userId: string, eventData: EventData, userData: UserData, settings: any) {
    // This is a placeholder for Google Ads API integration.
    // It's significantly more complex than Meta's, requiring OAuth2 and the google-ads-api library.
    // A full implementation is beyond the scope of this update, but this structure allows for it.
    if (!settings.googleAdsCustomerId || !settings.googleDeveloperToken) {
        console.log('Skipping Google Ads API: Customer ID or Developer Token not configured.');
        return;
    }

    console.log('--- Google Ads API ---');
    console.log(`Event: ${eventData.eventName} for User: ${userId}`);
    console.log('Payload (simplified):', { eventData, userData });
    console.log('This is where you would call the Google Ads API.');
    console.log('----------------------');
}


export async function trackServerEvent(userId: string, eventData: EventData) {
    try {
        const { headers, cookies } = await import('next/headers');
        const req = {
            headers: headers(),
            ip: headers().get('x-forwarded-for')?.split(',')[0] || '127.0.0.1',
        };

        const adminDb = getAdminDb();
        const [settingsDoc, userDoc] = await Promise.all([
            adminDb.collection('settings').doc('tracking').get(),
            adminDb.collection('users').doc(userId).get(),
        ]);

        if (!settingsDoc.exists) {
            console.warn('Tracking settings not found. Skipping server-side event.');
            return;
        }
        if (!userDoc.exists) {
             console.warn(`User ${userId} not found for tracking event. Skipping.`);
             return;
        }

        const settings = settingsDoc.data()!;
        const dbUserData = userDoc.data()!;

        const userData: UserData = {
            email: dbUserData.email,
            phone: dbUserData.phone,
            firstName: dbUserData.firstName,
            lastName: dbUserData.lastName,
            fbp: cookies().get('_fbp')?.value,
            fbc: cookies().get('_fbc')?.value,
        };
        
        // Send events to configured platforms in parallel
        const trackingPromises = [];
        
        if (settings.metaPixelId && settings.metaConversionApiToken) {
            trackingPromises.push(sendToMetaConversionApi(userId, eventData, userData, settings, req));
        }
        
        if (settings.googleAdsCustomerId && settings.googleDeveloperToken) {
            trackingPromises.push(sendToGoogleConversionApi(userId, eventData, userData, settings));
        }
        
        await Promise.all(trackingPromises);

    } catch (error) {
        console.error('Failed to track server event:', error);
    }
}
