
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
    const [tiktokPixelId, setTiktokPixelId] = useState<string | undefined>();

    useEffect(() => {
        async function loadTrackingSettings() {
            const { success, data } = await getTrackingSettings();
            if (success && data) {
                setMetaPixelId(data.metaPixelId);
                setGoogleAdsId(data.googleAdsId);
                setTiktokPixelId(data.tiktokPixelId);
            }
        }

        loadTrackingSettings();
    }, []);

    useEffect(() => {
        if (metaPixelId && typeof window.fbq === 'function') {
            window.fbq('track', 'PageView');
        }
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
            
            {/* TikTok Pixel Script */}
            {tiktokPixelId && (
                 <Script id="tiktok-pixel" strategy="afterInteractive">
                    {`
                        !function (w, d, t) {
                          w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e},ttq.load=function(e,n){var i="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e].TikTokAnalyticsObject=t,n=n||{};var o=d.createElement("script");o.type="text/javascript",o.async=!0,o.src=i+"?sdkid="+e+"&lib="+t;var a=d.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};
                        
                          ttq.load('${tiktokPixelId}');
                          ttq.page();
                        }(window, document, 'ttq');
                    `}
                </Script>
            )}
        </>
    );
}

// Type definition for the tracking functions
declare global {
  interface Window {
    fbq: (...args: any[]) => void;
    gtag: (...args: any[]) => void;
    ttq: any; // TikTok
    dataLayer: any[];
  }
}
