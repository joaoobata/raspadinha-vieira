
'use client'

import { useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import Script from 'next/script';
import { getTrackingSettings } from '@/app/admin/tracking/actions';

export function TrackingScripts() {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [metaPixelId, setMetaPixelId] = useState<string | undefined>();
    const [googleAdsId, setGoogleAdsId] = useState<string | undefined>();

    useEffect(() => {
        // Function to initialize settings, now inside useEffect
        async function loadTrackingSettings() {
            const { success, data } = await getTrackingSettings();
            if (success && data) {
                setMetaPixelId(data.metaPixelId);
                setGoogleAdsId(data.googleAdsId);
            }
        }

        loadTrackingSettings();
    }, []); // Empty dependency array ensures this runs only once on mount

    useEffect(() => {
        // Track page views for Meta Pixel
        if (metaPixelId && typeof window.fbq === 'function') {
            window.fbq('track', 'PageView');
        }
        // Track page views for Google Ads (gtag)
        if (googleAdsId && typeof window.gtag === 'function') {
            const url = pathname + searchParams.toString();
             window.gtag('event', 'page_view', {
                page_path: url,
            });
        }
    }, [pathname, searchParams, metaPixelId, googleAdsId]);

    return (
        <>
            {/* Meta Pixel Script */}
            {metaPixelId && (
                <Script id="fb-pixel" strategy="afterInteractive">
                    {`
                        !function(f,b,e,v,n,t,s)
                        {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
                        n.callMethod.apply(n,arguments):n.queue.push(arguments)};
                        if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
                        n.queue=[];t=b.createElement(e);t.async=!0;
                        t.src=v;s=b.getElementsByTagName(e)[0];
                        s.parentNode.insertBefore(t,s)}(window, document,'script',
                        'https://connect.facebook.net/en_US/fbevents.js');
                        fbq('init', '${metaPixelId}');
                        fbq('track', 'PageView');
                    `}
                </Script>
            )}

            {/* Google Analytics (gtag.js) */}
            {googleAdsId && (
                <>
                    <Script
                        strategy="afterInteractive"
                        src={`https://www.googletagmanager.com/gtag/js?id=${googleAdsId}`}
                    />
                    <Script id="gtag-init" strategy="afterInteractive">
                        {`
                            window.dataLayer = window.dataLayer || [];
                            function gtag(){dataLayer.push(arguments);}
                            gtag('js', new Date());
                            gtag('config', '${googleAdsId}', {
                                page_path: window.location.pathname,
                            });
                        `}
                    </Script>
                </>
            )}
        </>
    );
}

// Type definition for the Meta Pixel function
declare global {
  interface Window {
    fbq: (...args: any[]) => void;
    gtag: (...args: any[]) => void;
  }
}
