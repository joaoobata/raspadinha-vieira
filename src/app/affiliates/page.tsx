
'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// This page is now a simple redirector to the new affiliate panel structure.
export default function OldAffiliatesPage() {
    const router = useRouter();

    useEffect(() => {
        router.replace('/affiliate-panel/overview');
    }, [router]);

    return null; // Or a loading spinner
}
