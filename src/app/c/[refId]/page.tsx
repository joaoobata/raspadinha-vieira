
'use client';

import { useEffect } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { setCookie } from 'cookies-next';
import { v4 as uuidv4 } from 'uuid';

// This is a client-side component that acts as a robust redirector.
// It ensures all parameters are correctly forwarded to the tracking endpoint.

export default function AffiliateRedirectPage() {
    const router = useRouter();
    const params = useParams();
    const searchParams = useSearchParams();

    const refId = Array.isArray(params.refId) ? params.refId[0] : params.refId;

    useEffect(() => {
        if (!refId) {
            router.replace('/');
            return;
        }

        // Set cookies for fallback tracking
        setCookie('ref', refId, { maxAge: 60 * 60 * 24 * 30, path: '/' });

        const cid = searchParams.get('cid');
        if (cid) {
            setCookie('cid', cid, { maxAge: 60 * 60 * 24 * 30, path: '/' });
        }
        
        // Generate a session ID if one doesn't exist
        const sessionCookie = document.cookie.split('; ').find(row => row.startsWith('session_id='));
        if (!sessionCookie) {
            const sessionId = uuidv4();
            setCookie('session_id', sessionId, { maxAge: 60 * 60 * 24 * 30, path: '/' });
        }

        // Build the tracking URL with all original parameters
        const trackUrl = new URL('/api/track-click', window.location.origin);
        trackUrl.searchParams.set('ref', refId);
        
        searchParams.forEach((value, key) => {
            trackUrl.searchParams.set(key, value);
        });
        
        // Use router.replace to perform the redirect, ensuring the browser history is clean.
        router.replace(trackUrl.toString());

    }, [refId, searchParams, router]);

    // Render a loading state or null while the redirect happens.
    return (
        <div className="flex items-center justify-center min-h-screen bg-background">
            <p className="text-muted-foreground">Redirecionando...</p>
        </div>
    );
}
