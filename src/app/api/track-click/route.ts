
'use server';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin-init';
import { FieldValue } from 'firebase-admin/firestore';
import { logSystemEvent } from '@/lib/logging';

function getDeviceType(userAgent: string | null): 'Desktop' | 'Mobile' | 'Other' {
    if (!userAgent) return 'Other';
    if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(userAgent)) {
        return 'Mobile'; // Tablets are often considered mobile for marketing purposes
    }
    if (/Mobile|iP(hone|od)|Android|BlackBerry|IEMobile|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)/.test(userAgent)) {
        return 'Mobile';
    }
    return 'Desktop';
}


export async function GET(request: NextRequest) {
    const { searchParams } = request.nextUrl;
    const affiliateId = searchParams.get('ref');

    // Determine the correct base URL for redirection
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || request.nextUrl.origin;
    const homeUrl = new URL('/', baseUrl);

    // Copy all existing search params to the final redirect URL
    searchParams.forEach((value, key) => {
        homeUrl.searchParams.set(key, value);
    });

    // If no ref, just redirect to home with existing params
    if (!affiliateId) {
        return NextResponse.redirect(homeUrl);
    }

    try {
        const adminDb = getAdminDb();
        const userAgent = request.headers.get('user-agent');
        
        const clickLog = {
            affiliateId,
            timestamp: new Date(),
            userAgent: userAgent,
            deviceType: getDeviceType(userAgent),
            ip: request.headers.get('x-forwarded-for') ?? request.ip,
            utm_source: searchParams.get('utm_source'),
            utm_medium: searchParams.get('utm_medium'),
            utm_campaign: searchParams.get('utm_campaign'),
            utm_term: searchParams.get('utm_term'),
            utm_content: searchParams.get('utm_content'),
            cid: searchParams.get('cid'),
        };

        // When writing to Firestore, use the server timestamp for accuracy.
        await adminDb.collection('affiliate_clicks').add({
            ...clickLog,
            timestamp: FieldValue.serverTimestamp() 
        });
        
        await logSystemEvent(affiliateId, 'system', 'AFFILIATE_CLICK_TRACKED', clickLog, 'SUCCESS');

    } catch (error) {
        // Log the error but don't block the redirect
        console.error("Failed to log affiliate click:", error);
         await logSystemEvent(affiliateId, 'system', 'AFFILIATE_CLICK_FAIL', { error: (error as Error).message }, 'ERROR');
    }
    
    // Add the special parameter to trigger the signup dialog
    homeUrl.searchParams.set('open_signup', 'true');
    
    return NextResponse.redirect(homeUrl);
}
