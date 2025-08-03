
'use client';

import {
  Home,
  Users,
  LogOut,
  BarChart3,
} from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { getSettings } from '@/app/admin/settings/actions';
import { doc, getDoc } from 'firebase/firestore';

const affiliateNavSections = [
     {
        title: 'Painel de Afiliado',
        items: [
            { href: '/affiliate-panel', label: 'Visão Geral', icon: Home },
            { href: '/affiliate-panel/reports', label: 'Relatórios', icon: BarChart3 },
            { href: '/affiliate-panel/my-network', label: 'Minha Rede', icon: Users },
        ]
    }
];

export default function AffiliatePanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, loading] = useAuthState(auth);
  const router = useRouter();
  const pathname = usePathname();
  const [logoUrl, setLogoUrl] = useState('');
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  
  useEffect(() => {
    const checkAffiliateStatus = async () => {
      if (loading) return;
      if (!user) {
        router.push('/login');
        return;
      }
      try {
        const userDocRef = doc(db, 'users', user.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          const userData = userDocSnap.data();
          const roles = userData?.roles || [];
          if (roles.includes('admin') || roles.includes('afiliado')) {
            setIsAuthorized(true);
          } else {
            router.push('/');
          }
        } else {
          router.push('/');
        }
      } catch (error) {
        console.error("Error checking affiliate status:", error);
        router.push('/');
      } finally {
        setCheckingAuth(false);
      }
    };

    checkAffiliateStatus();
  }, [user, loading, router]);


   useEffect(() => {
    const fetchLogo = async () => {
      const settings = await getSettings();
      if (settings.success && settings.data?.logoUrl) {
        setLogoUrl(settings.data.logoUrl);
      }
    };
    fetchLogo();
  }, []);

  const handleSignOut = async () => {
    await auth.signOut();
    router.push('/login');
  };

  if (checkingAuth || !isAuthorized) {
    return (
      <div className="flex min-h-screen bg-background items-center justify-center">
        <Skeleton className="h-full w-full" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="w-64 bg-card p-4 flex flex-col justify-between border-r border-border">
        <div>
          <div className="mb-8">
            <Link href="/affiliate-panel">
              {logoUrl ? (
                  <Image src={logoUrl} alt="Raspadinha Oficial" width={150} height={50} data-ai-hint="logo" />
              ) : (
                  <Skeleton className="h-[50px] w-[150px]" />
              )}
            </Link>
          </div>
          <nav className="space-y-4">
             {affiliateNavSections.map(section => (
                <div key={section.title}>
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 mb-2">{section.title}</h3>
                     {section.items.map((item) => (
                        <Link key={item.label} href={item.href}>
                            <span className={`flex items-center gap-3 px-4 py-2 rounded-lg text-sm text-muted-foreground hover:bg-primary/20 hover:text-primary transition-colors ${pathname === item.href ? 'bg-primary/20 text-primary' : ''}`}>
                            <item.icon className="h-5 w-5" />
                            {item.label}
                            </span>
                        </Link>
                    ))}
                </div>
            ))}
          </nav>
        </div>
        <div className="space-y-2">
          <button onClick={handleSignOut} className="w-full flex items-center gap-3 px-4 py-2 rounded-lg text-muted-foreground hover:bg-destructive/20 hover:text-destructive transition-colors">
            <LogOut className="h-5 w-5" />
            Sair
          </button>
        </div>
      </aside>
      <main className="flex-1 p-8 bg-secondary/20">
        {children}
      </main>
    </div>
  );
}
