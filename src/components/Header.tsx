
'use client';

import Link from 'next/link';
import { LogOut, LayoutDashboard, User as UserIcon, Wallet, LayoutGrid, Plus, Gift, Banknote, Package, Users, Settings, Crown, UserCog } from 'lucide-react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { Button } from './ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Skeleton } from './ui/skeleton';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { DepositDialog } from './DepositDialog';
import { getSettings } from '@/app/admin/settings/actions';
import { WithdrawalDialog } from './WithdrawalDialog';
import { Eye, RotateCw, TrendingUp } from 'lucide-react';
import { Separator } from './ui/separator';
import { AuthDialog } from './AuthDialog';
import { useRouter, useSearchParams } from 'next/navigation';
import { Badge } from './ui/badge';

export function Header() {
  const [user, loading, authError] = useAuthState(auth);
  const [userData, setUserData] = useState<{
    firstName: string;
    lastName: string;
    balance: number;
    prizeBalance: number;
    commissionBalance: number;
    roles: string[] | null;
  } | null>(null);

  const [isDepositOpen, setIsDepositOpen] = useState(false);
  const [isWithdrawalOpen, setIsWithdrawalOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [defaultAuthTab, setDefaultAuthTab] = useState('login');
  const [isClient, setIsClient] = useState(false);
  const [logoUrl, setLogoUrl] = useState('');
  const [showBalance, setShowBalance] = useState(true);
  
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    setIsClient(true);
    const fetchLogo = async () => {
      const settings = await getSettings();
      if (settings.success && settings.data?.logoUrl) {
        setLogoUrl(settings.data.logoUrl);
      } else {
        setLogoUrl('https://i.imgur.com/gCeA3i0.png');
      }
    };
    fetchLogo();
    
    // Check for query params to open dialogs
    if (searchParams.get('open_signup') === 'true' && !user) {
        openAuthDialog('signup');
        // Clean the URL to avoid re-triggering
        router.replace('/', { scroll: false });
    }
    if (searchParams.get('first_deposit') === 'true' && user) {
        setIsDepositOpen(true);
        // Clean the URL to avoid re-triggering
        router.replace('/', { scroll: false });
    }

  }, [searchParams, user, router]);

  // Session cookie management
  useEffect(() => {
    const handleAuthChange = async (user: typeof auth.currentUser) => {
        if (user) {
            const idToken = await user.getIdToken();
            await fetch('/api/auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ idToken }),
            });
        } else {
            await fetch('/api/auth', { method: 'DELETE' });
        }
    };

    const unsubscribe = auth.onIdTokenChanged(handleAuthChange);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (user) {
      const userDocRef = doc(db, 'users', user.uid);
      const unsubscribe = onSnapshot(userDocRef, (doc) => {
        if (doc.exists()) {
          const data = doc.data();
           setUserData({
             firstName: data.firstName ?? '',
             lastName: data.lastName ?? '',
             balance: data.balance ?? 0,
             prizeBalance: data.prizeBalance ?? 0,
             commissionBalance: data.commissionBalance ?? 0,
             roles: data.roles ?? [],
           });
        } else {
           setUserData({ firstName: '', lastName: '', balance: 0, prizeBalance: 0, commissionBalance: 0, roles: [] });
        }
      }, (error) => {
          console.error("Error fetching user data:", error);
          setUserData({ firstName: '', lastName: '', balance: 0, prizeBalance: 0, commissionBalance: 0, roles: [] });
      });

      return () => unsubscribe();
    } else {
      setUserData(null);
    }
  }, [user]);

  const handleSignOut = async () => {
    await auth.signOut();
  };
  
  const getInitials = (firstName: string, lastName: string) => {
    if (!firstName || !lastName) return '..';
    return (firstName[0] + lastName[0]).toUpperCase();
  }
  
  const formatCurrency = (value: number | null) => {
    if (value === null) return 'R$ ...';
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  const renderBalance = (amount: number) => {
    return showBalance ? formatCurrency(amount) : 'R$ ••••••';
  }

  const openAuthDialog = (tab: 'login' | 'signup') => {
    setDefaultAuthTab(tab);
    setIsAuthOpen(true);
  };
  
  const DropdownContent = () => {
    const hasAffiliateRole = userData?.roles?.includes('afiliado') || userData?.roles?.includes('admin');
    const affiliateLink = hasAffiliateRole ? '/affiliate-panel' : '/account/affiliates';
    const affiliateLabel = hasAffiliateRole ? 'Painel de Afiliado' : 'Indique e Ganhe';

    return (
    <>
        <DropdownMenuLabel className="font-normal p-4">
            <div className="flex items-center gap-4">
                <div className="relative">
                    <Avatar className="h-12 w-12">
                        <AvatarImage src={user?.photoURL ?? ''} alt={user?.displayName ?? 'User'} />
                        <AvatarFallback className="bg-primary text-primary-foreground text-xl font-bold">{getInitials(userData?.firstName ?? '', userData?.lastName ?? '')}</AvatarFallback>
                    </Avatar>
                    <span className="absolute bottom-0 right-0 block h-3 w-3 rounded-full bg-green-500 border-2 border-background" />
                </div>
                <div className="flex flex-col space-y-1">
                    <p className="text-base font-semibold leading-none">{userData?.firstName} {userData?.lastName}</p>
                    <div className="flex items-center gap-1.5 flex-wrap mt-1">
                        {userData?.roles?.includes('admin') && <Badge variant="destructive" className="text-xs"><Crown className="mr-1 h-3 w-3" /> Admin</Badge>}
                        {hasAffiliateRole && <Badge className="bg-blue-500 hover:bg-blue-600 text-xs"><UserCog className="mr-1 h-3 w-3" /> Afiliado</Badge>}
                        {userData?.roles?.includes('influencer') && <Badge className="bg-purple-500 hover:bg-purple-600 text-xs"><UserCog className="mr-1 h-3 w-3" /> Influencer</Badge>}
                    </div>
                </div>
            </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="p-3 cursor-pointer">
            <Link href="/account" className="flex items-center gap-3">
                <Wallet className="w-5 h-5 text-muted-foreground" />
                <div>
                    <span className="font-semibold">Minha Carteira</span>
                    <p className="text-xs text-muted-foreground">Visualizar saldos e histórico</p>
                </div>
            </Link>
        </DropdownMenuItem>
         <DropdownMenuItem onClick={() => setIsWithdrawalOpen(true)} className="p-3 cursor-pointer flex items-center gap-3">
            <Banknote className="w-5 h-5 text-muted-foreground" />
             <div>
                <span className="font-semibold">Saque</span>
                <p className="text-xs text-muted-foreground">Retirar meus ganhos</p>
            </div>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="p-3 cursor-pointer">
            <Link href="/account/bonus" className="flex items-center gap-3">
                <Gift className="w-5 h-5 text-muted-foreground" />
                <div>
                    <span className="font-semibold">Meus Bônus</span>
                    <p className="text-xs text-muted-foreground">Gerenciar e resgatar bônus</p>
                </div>
            </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="p-3 cursor-pointer">
            <Link href="/account/shipping" className="flex items-center gap-3">
                <Package className="w-5 h-5 text-muted-foreground" />
                <div>
                    <span className="font-semibold">Minhas Entregas</span>
                    <p className="text-xs text-muted-foreground">Acompanhar status das entregas</p>
                </div>
            </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="p-3 cursor-pointer">
            <Link href={affiliateLink} className="flex items-center gap-3">
                <Users className="w-5 h-5 text-muted-foreground" />
                <div>
                    <span className="font-semibold">{affiliateLabel}</span>
                    <p className="text-xs text-muted-foreground">Convide amigos e ganhe bônus</p>
                </div>
            </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="p-3 cursor-pointer">
            <Link href="/account/settings" className="flex items-center gap-3">
                <Settings className="w-5 h-5 text-muted-foreground" />
                <div>
                    <span className="font-semibold">Configurações</span>
                    <p className="text-xs text-muted-foreground">Gerenciar perfil e preferências</p>
                </div>
            </Link>
        </DropdownMenuItem>

        {(userData?.roles?.includes('admin')) && (
            <>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild className="p-3 cursor-pointer">
                    <Link href="/admin" className="flex items-center gap-3">
                        <LayoutDashboard className="w-5 h-5 text-muted-foreground" />
                        <div>
                            <span className="font-semibold">Painel de Controle</span>
                            <p className="text-xs text-muted-foreground">Gerenciar a plataforma</p>
                        </div>
                    </Link>
                </DropdownMenuItem>
            </>
        )}
        
        {(userData?.roles?.includes('afiliado') && !userData.roles.includes('admin')) && (
            <>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild className="p-3 cursor-pointer">
                    <Link href="/admin" className="flex items-center gap-3">
                        <LayoutDashboard className="w-5 h-5 text-muted-foreground" />
                        <div>
                            <span className="font-semibold">Painel de Afiliado</span>
                            <p className="text-xs text-muted-foreground">Gerenciar seus indicados</p>
                        </div>
                    </Link>
                </DropdownMenuItem>
            </>
        )}


        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSignOut} className="text-destructive focus:text-destructive p-3 cursor-pointer flex items-center gap-3">
            <LogOut className="w-5 h-5" />
            <div>
                <span className="font-semibold">Sair da Conta</span>
                <p className="text-xs">Encerrar sessão atual</p>
            </div>
        </DropdownMenuItem>
    </>
    );
};


  const renderAuthSection = () => {
    if (!isClient || loading) {
        return <Skeleton className="h-10 w-64 rounded-md" />;
    }

    if (user && userData) {
      const totalBalance = userData.balance + userData.prizeBalance + userData.commissionBalance;
      return (
        <>
        {/* Mobile Header */}
        <div className="flex md:hidden items-center justify-end gap-2 w-full">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-1 p-1.5 rounded-md bg-secondary">
                      <span className="font-bold text-sm text-white">{formatCurrency(totalBalance)}</span>
                      <div className="h-6 w-6 rounded-full bg-primary flex items-center justify-center">
                          <Plus className="h-4 w-4"/>
                      </div>
                  </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-80 p-0" align="end">
                  <div className="p-6 space-y-4">
                     <div className='flex justify-between items-start'>
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-primary/20 flex items-center justify-center rounded-lg">
                                <Wallet className="w-6 h-6 text-primary" />
                            </div>
                            <div>
                                <h3 className="text-lg text-left font-semibold">Minha Carteira</h3>
                                <p className="text-sm text-left text-muted-foreground">Detalhes dos saldos</p>
                            </div>
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); setShowBalance(!showBalance);}}>
                            <Eye className="w-5 h-5 text-muted-foreground" />
                        </button>
                    </div>
                     <div className="text-center space-y-1">
                        <p className="text-sm text-muted-foreground">Saldo Total</p>
                        <p className="text-4xl font-bold text-primary">{renderBalance(totalBalance)}</p>
                    </div>

                    <Separator className='bg-zinc-700' />
                    
                    <div className='space-y-3'>
                        <div className='flex items-center justify-between'>
                            <div className='flex items-center gap-3'>
                                <RotateCw className='w-4 h-4 text-muted-foreground' />
                                <div>
                                    <p className='font-semibold'>Saldo Padrão</p>
                                    <p className='text-xs text-muted-foreground'>Disponível para compra de raspadinhas</p>
                                </div>
                            </div>
                            <p className='font-bold'>{renderBalance(userData.balance)}</p>
                        </div>
                        <div className='flex items-center justify-between'>
                            <div className='flex items-center gap-3'>
                                <TrendingUp className='w-4 h-4 text-muted-foreground' />
                                <div>
                                    <p className='font-semibold'>Saldo Premiações</p>
                                    <p className='text-xs text-muted-foreground'>Vindo de recompensas de cadastro</p>
                                </div>
                            </div>
                            <p className='font-bold'>{renderBalance(userData.prizeBalance)}</p>
                        </div>
                        <div className='flex items-center justify-between'>
                            <div className='flex items-center gap-3'>
                                <Gift className='w-4 h-4 text-muted-foreground' />
                                <div>
                                    <p className='font-semibold'>Saldo de Comissão</p>
                                    <p className='text-xs text-muted-foreground'>Ganhos como afiliado</p>
                                </div>
                            </div>
                            <p className='font-bold'>{renderBalance(userData.commissionBalance)}</p>
                        </div>
                    </div>
                  </div>
                   <div className="grid grid-cols-2 gap-0 p-0">
                      <Button onClick={() => setIsDepositOpen(true)} size="lg" className="h-14 rounded-none rounded-bl-lg bg-green-500 hover:bg-green-600 text-base font-bold">
                        <Plus className='w-5 h-5 mr-2' /> Depositar
                      </Button>
                      <Button asChild variant="secondary" size="lg" className="h-14 rounded-none rounded-br-lg bg-zinc-800 hover:bg-zinc-700 text-base font-bold">
                        <Link href="/account">
                          <Wallet className='w-5 h-5 mr-2' /> Ver Carteira
                        </Link>
                      </Button>
                    </div>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                        <Avatar className="h-9 w-9 border-2 border-primary">
                            <AvatarImage src={user.photoURL ?? ''} alt={user.displayName ?? 'User'} />
                            <AvatarFallback className="bg-primary text-primary-foreground font-bold">{getInitials(userData.firstName, userData.lastName)}</AvatarFallback>
                        </Avatar>
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-80" align="end">
                    <DropdownContent />
                </DropdownMenuContent>
            </DropdownMenu>
        </div>

        {/* Desktop Header */}
        <div className="hidden md:flex items-center gap-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 p-2 rounded-md bg-secondary hover:bg-secondary/80 transition-colors">
                   <Wallet className="h-5 w-5 text-primary" />
                   <span className="font-bold text-lg text-white">{formatCurrency(totalBalance)}</span>
                </button>
            </DropdownMenuTrigger>
             <DropdownMenuContent className="w-80 p-0" align="end">
                  <div className="p-6 space-y-4">
                     <div className='flex justify-between items-start'>
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-primary/20 flex items-center justify-center rounded-lg">
                                <Wallet className="w-6 h-6 text-primary" />
                            </div>
                            <div>
                                <h3 className="text-lg text-left font-semibold">Minha Carteira</h3>
                                <p className="text-sm text-left text-muted-foreground">Detalhes dos saldos</p>
                            </div>
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); setShowBalance(!showBalance);}}>
                            <Eye className="w-5 h-5 text-muted-foreground" />
                        </button>
                    </div>
                     <div className="text-center space-y-1">
                        <p className="text-sm text-muted-foreground">Saldo Total</p>
                        <p className="text-4xl font-bold text-primary">{renderBalance(totalBalance)}</p>
                    </div>

                    <Separator className='bg-zinc-700' />
                    
                    <div className='space-y-3'>
                        <div className='flex items-center justify-between'>
                            <div className='flex items-center gap-3'>
                                <RotateCw className='w-4 h-4 text-muted-foreground' />
                                <div>
                                    <p className='font-semibold'>Saldo Padrão</p>
                                    <p className='text-xs text-muted-foreground'>Disponível para compra de raspadinhas</p>
                                </div>
                            </div>
                            <p className='font-bold'>{renderBalance(userData.balance)}</p>
                        </div>
                        <div className='flex items-center justify-between'>
                            <div className='flex items-center gap-3'>
                                <TrendingUp className='w-4 h-4 text-muted-foreground' />
                                <div>
                                    <p className='font-semibold'>Saldo Premiações</p>
                                    <p className='text-xs text-muted-foreground'>Vindo de recompensas de cadastro</p>
                                </div>
                            </div>
                            <p className='font-bold'>{renderBalance(userData.prizeBalance)}</p>
                        </div>
                        <div className='flex items-center justify-between'>
                            <div className='flex items-center gap-3'>
                                <Gift className='w-4 h-4 text-muted-foreground' />
                                <div>
                                    <p className='font-semibold'>Saldo de Comissão</p>
                                    <p className='text-xs text-muted-foreground'>Ganhos como afiliado</p>
                                </div>
                            </div>
                            <p className='font-bold'>{renderBalance(userData.commissionBalance)}</p>
                        </div>
                    </div>
                  </div>
                   <div className="grid grid-cols-2 gap-0 p-0">
                      <Button onClick={() => setIsDepositOpen(true)} size="lg" className="h-14 rounded-none rounded-bl-lg bg-green-500 hover:bg-green-600 text-base font-bold">
                        <Plus className='w-5 h-5 mr-2' /> Depositar
                      </Button>
                      <Button asChild variant="secondary" size="lg" className="h-14 rounded-none rounded-br-lg bg-zinc-800 hover:bg-zinc-700 text-base font-bold">
                        <Link href="/account">
                          <Wallet className='w-5 h-5 mr-2' /> Ver Carteira
                        </Link>
                      </Button>
                    </div>
              </DropdownMenuContent>
          </DropdownMenu>
          
          <Button className="bg-green-500 hover:bg-green-600 font-bold" onClick={() => setIsDepositOpen(true)}>
            Depositar
          </Button>
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3">
                    <Avatar className="h-10 w-10 border-2 border-primary">
                        <AvatarImage src={user.photoURL ?? ''} alt={user.displayName ?? 'User'} />
                        <AvatarFallback className="bg-primary text-primary-foreground font-bold">{getInitials(userData.firstName, userData.lastName)}</AvatarFallback>
                    </Avatar>
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-80" align="end">
                 <DropdownContent />
            </DropdownMenuContent>
        </DropdownMenu>
        </div>
        </>
      );
    }

    return (
      <nav className="flex items-center space-x-2 text-sm font-medium">
        <Button variant="outline" onClick={() => openAuthDialog('login')}>
          Entrar
        </Button>
        <Button className="bg-primary hover:bg-primary/80" onClick={() => openAuthDialog('signup')}>
          Cadastrar
        </Button>
      </nav>
    );
  }

  return (
    <>
      <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center space-x-2">
              {logoUrl ? (
                <Image src={logoUrl} alt="Logo" width={120} height={35} className="object-contain" data-ai-hint="logo" />
              ) : (
                <Skeleton className="h-[35px] w-[120px]" />
              )}
            </Link>
             <nav className="hidden md:flex">
                <Link href="/#jogos" className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors">
                    <LayoutGrid className="h-5 w-5"/>
                    <span className="font-semibold">Raspadinhas</span>
                </Link>
            </nav>
          </div>
          <div className="flex items-center justify-end space-x-2">
            {renderAuthSection()}
          </div>
        </div>
      </header>
      {isClient && user && userData && <DepositDialog isOpen={isDepositOpen} onOpenChange={setIsDepositOpen} />}
      {isClient && user && userData && <WithdrawalDialog isOpen={isWithdrawalOpen} onOpenChange={setIsWithdrawalOpen} />}
      {isClient && <AuthDialog isOpen={isAuthOpen} onOpenChange={setIsAuthOpen} defaultTab={defaultAuthTab} />}
    </>
  );
}
