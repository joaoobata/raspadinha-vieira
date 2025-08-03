import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { TrackingScripts } from '@/components/TrackingScripts';
import { Suspense } from 'react';
import { BottomNav } from '@/components/BottomNav';
import { CustomHeadScript } from '@/components/CustomHeadScript';

export const metadata: Metadata = {
  title: 'Raspadinha Oficial',
  description: 'A maior e melhor plataforma de raspadinhas do Brasil.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-br" className="dark" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap" rel="stylesheet" />
         <Suspense fallback={null}>
          <TrackingScripts />
        </Suspense>
        <Suspense fallback={null}>
          <CustomHeadScript />
        </Suspense>
      </head>
      <body className="font-body antialiased bg-background flex flex-col min-h-screen">
        <Suspense fallback={null}>
          <Header />
        </Suspense>
        <main className="flex-grow pb-20 md:pb-0">{children}</main>
        <Footer />
        <Toaster />
        <BottomNav />
      </body>
    </html>
  );
}
