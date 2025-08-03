
'use client';

import {
  Home,
  Users,
  Settings,
  Image as ImageIcon,
  Banknote,
  Gift,
  Tags,
  DollarSign,
  Landmark,
  LogOut,
  Target,
  Handshake,
  Shield,
  Bug,
  FileText,
  Award,
  Users2,
  AlertTriangle,
  Wrench,
  Megaphone,
  Box,
  HeartPulse, // Ícone para Saúde do Sistema
} from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { getSettings } from '../admin/settings/actions';
import { doc, getDoc } from 'firebase/firestore';

const adminNavSections = [
    {
        title: 'Gestão Principal',
        items: [
            { href: '/admin', label: 'Início', icon: Home },
            { href: '/admin/users', label: 'Usuários', icon: Users },
            { href: '/admin/affiliates', label: 'Afiliados', icon: Users2 },
            { href: '/admin/influencers', label: 'Influenciadores', icon: Megaphone },
            { href: '/admin/scratchcards', label: 'Raspadinhas', icon: Gift },
            { href: '/admin/categories', label: 'Categorias', icon: Tags },
            { href: '/admin/banners', label: 'Banners', icon: ImageIcon },
        ]
    },
    {
        title: 'Financeiro',
        items: [
            { href: '/admin/deposits', label: 'Depósitos', icon: DollarSign },
            { href: '/admin/withdrawals', label: 'Saques', icon: Banknote },
            { href: '/admin/commissions', label: 'Comissões', icon: Handshake },
            { href: '/admin/ggr-batches', label: 'Loteria (GGR)', icon: Box },
        ]
    },
    {
        title: 'Configurações',
        items: [
            { href: '/admin/settings', label: 'Configurações Gerais', icon: Settings },
            { href: '/admin/gateway', label: 'Gateway de Pagamento', icon: Landmark },
            { href: '/admin/tracking', label: 'Rastreamento (Pixels)', icon: Target },
            { href: '/admin/signup-rewards', label: 'Recompensas de Cadastro', icon: Award },
        ]
    },
    {
        title: 'Logs e Saúde',
        items: [
            { href: '/admin/commission-logs', label: 'Logs de Comissão', icon: Bug },
            { href: '/admin/system-logs', label: 'Logs do Sistema', icon: FileText },
            { href: '/admin/action-logs', label: 'Logs de Admin', icon: Shield },
            { href: '/admin/logs', label: 'Logs de Erros', icon: AlertTriangle },
            { href: '/admin/system-health', label: 'Saúde do Sistema', icon: HeartPulse }, // Novo item de menu
            { href: '/admin/fix-admin', label: 'Corrigir Dados', icon: Wrench }, 
        ]
    }
];


export default function AdminLayout({
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
    const checkAdminStatus = async () => {
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
          if (roles.includes('admin')) {
            setIsAuthorized(true);
          } else {
            router.push('/');
          }
        } else {
          router.push('/');
        }
      } catch (error) {
        console.error("Error checking admin status:", error);
        router.push('/');
      } finally {
        setCheckingAuth(false);
      }
    };

    checkAdminStatus();

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
            <Link href="/admin">
              {logoUrl ? (
                  <Image src={logoUrl} alt="Raspadinha Oficial" width={150} height={50} data-ai-hint="logo" />
              ) : (
                  <Skeleton className="h-[50px] w-[150px]" />
              )}
            </Link>
          </div>
          <nav className="space-y-4">
             {adminNavSections.map(section => (
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
