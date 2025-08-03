
'use server';

import { getAdminDb } from './firebase-admin-init';
import crypto from 'crypto';
import { logSystemEvent } from './logging';

interface EventData {
    eventName: 'Purchase' | 'CompleteRegistration' | 'ftd_complete' | 'redeposit_complete';
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
    ttclid?: string; // TikTok click ID
    kp?: string; // Kwai cookie
    clickId?: string; // Generic click ID from affiliate
}

// Helper to hash user data
function hash(value: string): string {
    if(!value) return '';
    return crypto.createHash('sha256').update(value.toLowerCase()).digest('hex');
}

async function sendToMetaConversionApi(userId: string, eventData: EventData, userData: UserData, settings: any, req: any) {
    if (!settings.metaPixelId || !settings.metaConversionApiToken) {
        return; // Skip if not configured
    }

    const eventId = eventData.transactionId ? `txn_${eventData.transactionId}` : `evt_${userId}_${Date.now()}`;

    const payload = {
        data: [
            {
                event_name: eventData.eventName,
                event_time: Math.floor(Date.now() / 1000),
                event_id: eventId,
                event_source_url: req.headers.get('referer') || process.env.NEXT_PUBLIC_BASE_URL,
                action_source: 'website',
                user_data: {
                    em: userData.email ? [hash(userData.email)] : [],
                    ph: userData.phone ? [hash(userData.phone)] : [],
                    fn: userData.firstName ? [hash(userData.firstName)] : [],
                    ln: userData.lastName ? [hash(userData.lastName)] : [],
                    client_ip_address: req.ip,
                    client_user_agent: req.headers.get('user-agent'),
                    fbp: userData.fbp,
                    fbc: userData.fbc,
                },
                custom_data: eventData.eventName === 'Purchase' || eventData.eventName === 'ftd_complete' || eventData.eventName === 'redeposit_complete' ? {
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

        if (!response.ok) {
           const responseData = await response.json();
           await logSystemEvent(userId, 'system', 'META_CAPI_FAIL', { error: responseData, payloadSent: payload }, 'ERROR');
        }
    } catch (error: any) {
        await logSystemEvent(userId, 'system', 'META_CAPI_FAIL', { error: error.message, stack: error.stack, payloadSent: payload }, 'ERROR');
    }
}


async function sendToTikTokEventsApi(userId: string, eventData: EventData, userData: UserData, settings: any, req: any) {
    if (!settings.tiktokPixelId || !settings.tiktokAccessToken) {
        return; // Skip if not configured
    }

    const eventMap: { [key: string]: string } = {
        'Purchase': 'CompletePayment',
        'CompleteRegistration': 'CompleteRegistration',
        'ftd_complete': 'CompletePayment', // TikTok uses a generic payment event
        'redeposit_complete': 'CompletePayment',
    };
    
    const tiktokEventName = eventMap[eventData.eventName];
    if(!tiktokEventName) return;

    const eventId = eventData.transactionId ? `txn_${eventData.transactionId}` : `evt_${userId}_${Date.now()}`;
    const cleanPhone = userData.phone ? userData.phone.replace(/\D/g, '') : '';
    
    const externalId = userData.clickId ? hash(userData.clickId) : hash(userId);

    const payload = {
        pixel_code: settings.tiktokPixelId,
        event: tiktokEventName,
        event_id: eventId,
        timestamp: new Date().toISOString(),
        context: {
            ad: {
              callback: userData.ttclid, // TikTok Click ID
            },
            user: {
                external_id: externalId,
                email: userData.email ? hash(userData.email) : undefined,
                phone_number: cleanPhone ? hash(cleanPhone) : undefined,
            },
            ip: req.ip,
            user_agent: req.headers.get('user-agent'),
        },
        properties: {
            contents: [{
                content_id: eventData.transactionId || 'registration',
                content_type: 'product',
                quantity: 1,
                price: eventData.value,
            }],
            value: eventData.value,
            currency: eventData.currency,
        },
    };
    
    try {
        const response = await fetch('https://business-api.tiktok.com/open_api/v1.3/pixel/track/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Access-Token': settings.tiktokAccessToken,
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const responseData = await response.json();
            await logSystemEvent(userId, 'system', 'TIKTOK_API_FAIL', { error: responseData, payloadSent: payload }, 'ERROR');
        }
    } catch (error: any) {
        await logSystemEvent(userId, 'system', 'TIKTOK_API_FAIL', { error: error.message, stack: error.stack, payloadSent: payload }, 'ERROR');
    }
}

async function sendToKwaiEventsApi(userId: string, eventData: EventData, userData: UserData, settings: any, req: any) {
    if (!settings.kwaiPixelId) {
        return; // Skip if not configured
    }

    const eventMap: { [key: string]: string } = {
        'Purchase': 'Purchase',
        'CompleteRegistration': 'SignUp',
        'ftd_complete': 'Purchase',
        'redeposit_complete': 'Purchase',
    };
    const kwaiEventName = eventMap[eventData.eventName];
    if(!kwaiEventName) return;

    const eventId = eventData.transactionId ? `txn_${eventData.transactionId}` : `evt_${userId}_${Date.now()}`;

    const payload = {
        pixelId: settings.kwaiPixelId,
        event_name: kwaiEventName,
        event_time: Math.floor(Date.now() / 1000), // Seconds timestamp
        event_id: eventId,
        user: {
            user_id: hash(userId),
            user_phone: userData.phone ? hash(userData.phone) : undefined,
            user_email: userData.email ? hash(userData.email) : undefined,
        },
        context: {
            ip: req.ip,
            user_agent: req.headers.get('user-agent'),
            kwai_pixel_cookie: userData.kp,
        },
        properties: (eventData.eventName === 'Purchase' || eventData.eventName === 'ftd_complete' || eventData.eventName === 'redeposit_complete') ? {
            value: eventData.value,
            currency: eventData.currency,
            transaction_id: eventData.transactionId,
        } : undefined,
    };
    
     try {
        const response = await fetch('https://pxs.kwailink.com/pixel/track', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });
        
         if (!response.ok) {
            const responseData = await response.json();
            await logSystemEvent(userId, 'system', 'KWAI_API_FAIL', { error: responseData, payloadSent: payload }, 'ERROR');
        }

    } catch (error: any) {
         await logSystemEvent(userId, 'system', 'KWAI_API_FAIL', { error: error.message, stack: error.stack, payloadSent: payload }, 'ERROR');
    }
}


export async function sendAffiliatePostback(userId: string, depositAmount: number, transactionId: string) {
    try {
        const adminDb = getAdminDb();
        const userDoc = await adminDb.collection('users').doc(userId).get();
        if (!userDoc.exists) {
            throw new Error(`User ${userId} not found for postback.`);
        }
        
        const userData = userDoc.data()!;
        const { clickId, referredBy } = userData;

        if (!clickId || !referredBy) {
            await logSystemEvent(userId, 'system', 'POSTBACK_SKIPPED', { reason: 'No clickId or affiliate for user.' }, 'INFO');
            return;
        }
        
        const affiliateDoc = await adminDb.collection('users').doc(referredBy).get();
        const affiliatePostbackUrl = affiliateDoc.data()?.postbackUrl;

        if (!affiliatePostbackUrl) {
            await logSystemEvent(userId, 'system', 'POSTBACK_SKIPPED', { reason: 'Affiliate has no postback URL configured.', affiliateId: referredBy }, 'INFO');
            return;
        }

        const url = affiliatePostbackUrl
            .replace('{cid}', clickId)
            .replace('{click_id}', clickId)
            .replace('{transaction_id}', transactionId)
            .replace('{sum}', depositAmount.toString())
            .replace('{status}', 'approved');

        await logSystemEvent(userId, 'system', 'POSTBACK_SENT', { url, affiliateId: referredBy }, 'SUCCESS');
        
        fetch(url).catch(error => {
            logSystemEvent(userId, 'system', 'POSTBACK_FETCH_ERROR', { error: error.message, url }, 'ERROR');
        });

    } catch (error: any) {
        await logSystemEvent(userId, 'system', 'POSTBACK_FAILED', { error: error.message, transactionId }, 'ERROR');
    }
}

// Function to push events to dataLayer from the server
export async function sendDataLayerEvent(userId: string, eventName: string, eventData: any) {
    try {
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:9002';
        const endpoint = new URL('/api/track-datalayer', baseUrl);

        await fetch(endpoint.toString(), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ userId, eventName, eventData }),
        });
    } catch (error: any) {
        console.error('Failed to send dataLayer event from server:', error);
        logSystemEvent(userId, 'system', 'SEND_DATALAYER_EVENT_FAIL', { error: error.message }, 'ERROR');
    }
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

        if (!settingsDoc.exists) return;
        if (!userDoc.exists) return;

        const settings = settingsDoc.data()!;
        const dbUserData = userDoc.data()!;

        const userData: UserData = {
            email: dbUserData.email,
            phone: dbUserData.phone,
            firstName: dbUserData.firstName,
            lastName: dbUserData.lastName,
            fbp: cookies().get('_fbp')?.value,
            fbc: cookies().get('_fbc')?.value,
            ttclid: cookies().get('ttclid')?.value,
            kp: cookies().get('_kp')?.value,
            clickId: dbUserData.clickId,
        };
        
        const trackingPromises = [
            sendToMetaConversionApi(userId, eventData, userData, settings, req),
            sendToTikTokEventsApi(userId, eventData, userData, settings, req),
            sendToKwaiEventsApi(userId, eventData, userData, settings, req),
        ];
        
        await Promise.all(trackingPromises);

    } catch (error) {
        console.error('Failed to track server event:', error);
        logSystemEvent(userId, 'system', 'TRACK_EVENT_FAIL', { error: (error as any).message }, 'ERROR');
    }
}
