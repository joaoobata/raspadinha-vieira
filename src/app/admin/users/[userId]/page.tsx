
// This comment is added to force a module reload and resolve HMR issues.
'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useAuthState } from 'react-firebase-hooks/auth';
import { getFirebaseAuth, getFirestoreDb } from '@/lib/firebase';
import { 
    ArrowLeft, User, Wallet, Landmark, Banknote, History, Gift, Users as UsersIcon, 
    Percent, Pencil, Shield, Crown, TrendingUp, TrendingDown, Coins, PlusCircle, Gamepad2, Handshake, Lock, Edit, ChevronDown, Search, Link2, LoaderCircle, Award
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from '@/lib/utils';
import { useDebounce } from 'use-debounce';
import { Checkbox } from '@/components/ui/checkbox';


import { 
    getUserDetails, getUserLedger, UserDetailsData, LedgerEntry, UserRole, 
    updateUserRoles, updateUserDemoProfile, LedgerEntryType, DirectReferral, updateUserPostbackUrl, DemoPrizeProfile
} from './actions';
import { Separator } from '@/components/ui/separator';
import { UserDetailsCommissionDialogL1 } from './UserDetailsCommissionDialog';
import { UserDetailsCommissionDialogL2 } from './UserDetailsCommissionDialogL2';
import { UserDetailsCommissionDialogL3 } from './UserDetailsCommissionDialogL3';
import { EditUserDialog } from './EditUserDialog';
import { EditPasswordDialog } from './EditPasswordDialog';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getSettings } from '../../settings/actions';
import { EditCustomCommissionDialog } from './EditCustomCommissionDialog';
import { EditAffiliateDialog } from './EditAffiliateDialog';
import { EditBalanceDialog } from '../EditBalanceDialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';


const auth = getFirebaseAuth();

const ReferralTable = ({
  title,
  referrals,
  user,
  globalSettings,
  onEditCustomCommission,
}: {
  title: string;
  referrals: DirectReferral[];
  user: UserDetailsData;
  globalSettings: any;
  onEditCustomCommission?: (referral: DirectReferral) => void;
}) => {
  const [visibleCount, setVisibleCount] = useState(10);
  const formatCurrency = (value: number) => (value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const isLevel1 = title.includes("Nível 1");

  const showMore = () => {
    setVisibleCount(referrals.length);
  };

  return (
    <Card>
        <CardHeader>
            <CardTitle className="flex items-center gap-2">
                <UsersIcon className="h-5 w-5 text-primary" /> {title} ({referrals.length})
            </CardTitle>
            {isLevel1 && <CardDescription>Gerencie as taxas de comissão que este usuário ganha de seus indicados diretos.</CardDescription>}
        </CardHeader>
        <CardContent>
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Indicado</TableHead>
                        <TableHead>Total Depositado</TableHead>
                        {isLevel1 && <TableHead>Comissão Gerada</TableHead>}
                        {isLevel1 && <TableHead>Taxa Aplicada</TableHead>}
                        {isLevel1 && <TableHead className="text-right">Ações</TableHead>}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {referrals.length > 0 ? (
                        referrals.slice(0, visibleCount).map(ref => (
                        <TableRow key={ref.id}>
                            <TableCell>
                                <Button variant="link" asChild className="p-0 h-auto font-medium">
                                    <Link href={`/admin/users/${ref.id}`}>{ref.name}</Link>
                                </Button>
                                <p className="text-xs text-muted-foreground">{ref.email}</p>
                            </TableCell>
                            <TableCell>{formatCurrency(ref.totalDeposited)}</TableCell>
                            {isLevel1 && <TableCell className="text-green-400 font-bold">{formatCurrency(ref.commissionGenerated)}</TableCell>}
                            {isLevel1 && (
                                <TableCell>
                                    {ref.customRate !== undefined ? (
                                        <Badge className="bg-purple-500 hover:bg-purple-600">{ref.customRate}% (Personalizada)</Badge>
                                    ) : (
                                        <Badge variant="secondary">{(user.commissionRate ?? globalSettings.commissionRateL1 ?? 10)}% (Padrão)</Badge>
                                    )}
                                </TableCell>
                            )}
                            {isLevel1 && (
                                <TableCell className="text-right">
                                    <Button variant="outline" size="sm" onClick={() => onEditCustomCommission?.(ref)}>
                                        <Edit className="mr-2 h-3 w-3" />
                                        Editar Taxa
                                    </Button>
                                </TableCell>
                            )}
                        </TableRow>
                    ))
                    ) : (
                        <TableRow>
                            <TableCell colSpan={isLevel1 ? 5 : 2} className="text-center text-muted-foreground py-10">
                                Nenhum indicado encontrado.
                            </TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>
            {referrals.length > 10 && visibleCount < referrals.length && (
                <div className="text-center mt-4">
                    <Button variant="outline" onClick={showMore}>
                        <ChevronDown className="mr-2 h-4 w-4" />
                        Mostrar Mais ({referrals.length - visibleCount} restantes)
                    </Button>
                </div>
            )}
        </CardContent>
    </Card>
  );
};


export default function UserDetailsPage() {
    const params = useParams();
    const userId = Array.isArray(params.userId) ? params.userId[0] : params.userId;
    const { toast } = useToast();
    const [adminUser] = useAuthState(auth);
    const [user, setUser] = useState<UserDetailsData | null>(null);
    const [ledger, setLedger] = useState<LedgerEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [ledgerError, setLedgerError] = useState<string | null>(null);
    const [isCommissionL1DialogOpen, setIsCommissionL1DialogOpen] = useState(false);
    const [isCommissionL2DialogOpen, setIsCommissionL2DialogOpen] = useState(false);
    const [isCommissionL3DialogOpen, setIsCommissionL3DialogOpen] = useState(false);
    const [isEditUserDialogOpen, setIsEditUserDialogOpen] = useState(false);
    const [isEditPasswordDialogOpen, setIsEditPasswordDialogOpen] = useState(false);
    const [isEditAffiliateDialogOpen, setIsEditAffiliateDialogOpen] = useState(false);
    const [isEditBalanceDialogOpen, setIsEditBalanceDialogOpen] = useState(false);
    const [isSavingRoles, setIsSavingRoles] = useState(false);
    const [isSavingDemoProfile, setIsSavingDemoProfile] = useState(false);
    const [isSavingPostback, setIsSavingPostback] = useState(false);
    const [demoProfile, setDemoProfile] = useState<DemoPrizeProfile>('medium');
    const [postbackUrl, setPostbackUrl] = useState('');
    const [globalSettings, setGlobalSettings] = useState<{commissionRateL1?: number, commissionRateL2?: number, commissionRateL3?: number}>({});
    const [editingCustomCommission, setEditingCustomCommission] = useState<DirectReferral | null>(null);
    
    const [referralSearchTerm, setReferralSearchTerm] = useState('');
    const [debouncedReferralSearch] = useDebounce(referralSearchTerm, 300);

    const [lastLedgerDocId, setLastLedgerDocId] = useState<string | null>(null);
    const [loadingMoreLedger, setLoadingMoreLedger] = useState(false);


    const fetchUserDetails = useCallback(async () => {
        if (!userId) return;
        setLoading(true);
        setError(null);
        try {
            const [detailsResult, settingsResult] = await Promise.all([
                getUserDetails(userId),
                getSettings()
            ]);

            if (detailsResult.success && detailsResult.data) {
                setUser(detailsResult.data);
                setDemoProfile(detailsResult.data.demoPrizeProfile || 'medium');
                setPostbackUrl(detailsResult.data.postbackUrl || '');
            } else {
                setError(detailsResult.error || 'Falha ao buscar detalhes do usuário.');
            }
            
            if (settingsResult.success && settingsResult.data) {
                setGlobalSettings(settingsResult.data);
            }
        } catch (err: any) {
            console.error("Error fetching user details:", err);
            setError("Ocorreu um erro inesperado ao carregar os dados.");
        } finally {
            setLoading(false);
        }
    }, [userId]);
    
    const fetchInitialLedger = useCallback(async () => {
        if (!userId) return;
        setLedgerError(null);
        setLoadingMoreLedger(true);
        try {
            const ledgerResult = await getUserLedger(userId);
            if (ledgerResult.success && ledgerResult.data) {
                setLedger(ledgerResult.data.entries);
                setLastLedgerDocId(ledgerResult.data.lastDocId);
            } else {
                setLedgerError(ledgerResult.error || 'Falha ao buscar extrato.');
            }
        } catch(err: any) {
            setLedgerError("Ocorreu um erro inesperado ao carregar o extrato.");
        } finally {
            setLoadingMoreLedger(false);
        }
    }, [userId]);
    
    const loadMoreLedgerEntries = async () => {
        if (!userId || !lastLedgerDocId || loadingMoreLedger) return;
        setLoadingMoreLedger(true);
        try {
            const ledgerResult = await getUserLedger(userId, lastLedgerDocId);
            if (ledgerResult.success && ledgerResult.data) {
                setLedger(prev => [...prev, ...ledgerResult.data.entries]);
                setLastLedgerDocId(ledgerResult.data.lastDocId);
            } else {
                toast({ variant: 'destructive', title: 'Erro', description: ledgerResult.error });
            }
        } catch(err: any) {
             toast({ variant: 'destructive', title: 'Erro', description: "Falha ao carregar mais transações." });
        } finally {
            setLoadingMoreLedger(false);
        }
    }

    useEffect(() => {
        fetchUserDetails();
        fetchInitialLedger();
    }, [fetchUserDetails, fetchInitialLedger]);

    const handleRolesChange = async (newRoles: UserRole[]) => {
        if (!user || !adminUser) return;
        setIsSavingRoles(true);
        const result = await updateUserRoles(user.id, newRoles, adminUser.uid);
        if (result.success) {
            toast({ title: "Sucesso!", description: "Cargos do usuário atualizados." });
            await fetchUserDetails();
        } else {
            toast({ variant: 'destructive', title: "Erro!", description: result.error });
        }
        setIsSavingRoles(false);
    };

    const handleDemoProfileSave = async () => {
        if (!user || !adminUser) return;
        setIsSavingDemoProfile(true);
        const result = await updateUserDemoProfile(user.id, demoProfile, adminUser.uid);
        if (result.success) {
            toast({ title: "Sucesso!", description: "Perfil de prêmio do influenciador atualizado." });
            await fetchUserDetails();
        } else {
            toast({ variant: 'destructive', title: "Erro!", description: result.error });
        }
        setIsSavingDemoProfile(false);
    }
    
     const handlePostbackSave = async () => {
        if (!user || !adminUser) return;
        setIsSavingPostback(true);
        const result = await updateUserPostbackUrl(user.id, postbackUrl, adminUser.uid);
        if (result.success) {
            toast({ title: "Sucesso!", description: "URL de Postback atualizada." });
            await fetchUserDetails();
        } else {
            toast({ variant: 'destructive', title: "Erro!", description: result.error });
        }
        setIsSavingPostback(false);
    }

    const filteredReferrals = useMemo(() => {
        if (!user) return { l1: [], l2: [], l3: [] };
        if (!debouncedReferralSearch) {
            return {
                l1: user.directReferrals,
                l2: user.level2Referrals,
                l3: user.level3Referrals,
            };
        }
        const searchTermLower = debouncedReferralSearch.toLowerCase();
        const filterFn = (ref: DirectReferral) => 
            ref.name.toLowerCase().includes(searchTermLower) || 
            ref.email.toLowerCase().includes(searchTermLower);

        return {
            l1: user.directReferrals.filter(filterFn),
            l2: user.level2Referrals.filter(filterFn),
            l3: user.level3Referrals.filter(filterFn),
        };
    }, [user, debouncedReferralSearch]);


    const formatCurrency = (value: number) => (value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const formatDate = (dateString: string | null) => dateString ? new Date(dateString).toLocaleString('pt-BR') : '-';

    const ledgerTypeConfig: Record<LedgerEntryType, { icon: React.ElementType, color: string, label: string }> = {
        DEPOSIT: { icon: PlusCircle, color: 'text-green-400', label: 'Depósito' },
        WITHDRAWAL_REQUEST: { icon: TrendingDown, color: 'text-yellow-400', label: 'Saque (Solicitado)' },
        WITHDRAWAL_COMPLETE: { icon: TrendingDown, color: 'text-red-400', label: 'Saque (Concluído)' },
        WITHDRAWAL_REFUND: { icon: TrendingUp, color: 'text-yellow-400', label: 'Estorno de Saque' },
        GAME_BET: { icon: Gamepad2, color: 'text-red-400', label: 'Aposta' },
        GAME_PRIZE: { icon: Gift, color: 'text-green-400', label: 'Prêmio' },
        COMMISSION: { icon: Handshake, color: 'text-green-400', label: 'Comissão Recebida' },
        COMMISSION_CLAIM: { icon: Gift, color: 'text-blue-400', label: 'Resgate de Comissão' },
        ADJUSTMENT: { icon: Pencil, color: 'text-blue-400', label: 'Ajuste Manual' },
    };


    if (loading) {
        return (
            <div className="space-y-6">
                <Skeleton className="h-8 w-48" />
                <div className="grid gap-6 md:grid-cols-3">
                    <Skeleton className="h-32 w-full" />
                    <Skeleton className="h-32 w-full" />
                    <Skeleton className="h-32 w-full" />
                </div>
                <Skeleton className="h-64 w-full" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="text-center py-10 text-destructive">
                <p>Erro: {error}</p>
                <Button asChild variant="link">
                    <Link href="/admin/users">Voltar para Usuários</Link>
                </Button>
            </div>
        );
    }
    
    if (!user || !adminUser) {
         return (
            <div className="text-center py-10 text-muted-foreground">
                <p>Usuário não encontrado ou admin não autenticado.</p>
                <Button asChild variant="link">
                    <Link href="/admin/users">Voltar para Usuários</Link>
                </Button>
            </div>
        );
    }
    
    const allRoles: UserRole[] = ['admin', 'influencer', 'afiliado'];
    
    return (
        <>
        <div className="space-y-6">
            <div className='flex justify-between items-start'>
                <div>
                    <Button asChild variant="outline" size="sm" className="mb-4">
                        <Link href="/admin/users"><ArrowLeft className="mr-2 h-4 w-4" /> Voltar</Link>
                    </Button>
                    <h1 className="text-3xl font-bold">Detalhes de {user.firstName} {user.lastName}</h1>
                </div>
                 <div className='flex items-center gap-2'>
                    <Button variant="secondary" onClick={() => setIsEditBalanceDialogOpen(true)}>
                        <Wallet className="mr-2 h-4 w-4" /> Editar Saldo
                    </Button>
                    <Button variant="secondary" onClick={() => setIsEditPasswordDialogOpen(true)}>
                        <Lock className="mr-2 h-4 w-4" /> Alterar Senha
                    </Button>
                    <Button onClick={() => setIsEditUserDialogOpen(true)}>
                        <Pencil className="mr-2 h-4 w-4" /> Editar Usuário
                    </Button>
                </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                 <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Saldo Principal</CardTitle>
                        <Wallet className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatCurrency(user.balance)}</div>
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Saldo de Comissão</CardTitle>
                        <Gift className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-green-400">{formatCurrency(user.commissionBalance)}</div>
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Depositado</CardTitle>
                        <Landmark className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatCurrency(user.totalDeposited)}</div>
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Sacado</CardTitle>
                        <Banknote className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatCurrency(user.totalWithdrawn)}</div>
                    </CardContent>
                </Card>
            </div>
            
             <div className="grid gap-6 lg:grid-cols-3">
                 <Card className="lg:col-span-1">
                    <CardHeader>
                        <CardTitle>Informações Pessoais</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4 text-sm">
                         <div className="flex justify-between">
                            <span className="text-muted-foreground">ID do Usuário</span>
                            <span className="font-mono">{user.id}</span>
                        </div>
                        <Separator />
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Nome</span>
                            <span>{user.firstName} {user.lastName}</span>
                        </div>
                        <Separator />
                         <div className="flex justify-between">
                            <span className="text-muted-foreground">Email</span>
                            <span className="font-mono">{user.email}</span>
                        </div>
                        <Separator />
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Telefone</span>
                            <span>{user.phone || '-'}</span>
                        </div>
                         <Separator />
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">CPF</span>
                            <span>{user.cpf || '-'}</span>
                        </div>
                        <Separator />
                         <div className="flex justify-between">
                            <span className="text-muted-foreground">Data de Cadastro</span>
                            <span>{formatDate(user.createdAt)}</span>
                        </div>
                         <Separator />
                          <div className="flex justify-between items-center">
                            <span className="text-muted-foreground">Indicado por</span>
                            <div className="flex items-center gap-2">
                                {user.referredBy ? (
                                     <Button variant="link" asChild className="p-0 h-auto">
                                        <Link href={`/admin/users/${user.referredBy}`}>{user.referredByName || user.referredBy}</Link>
                                    </Button>
                                ) : 'Ninguém'}
                                 <Button variant="outline" size="sm" className="h-6 px-2" onClick={() => setIsEditAffiliateDialogOpen(true)}>
                                    <Edit className="h-3 w-3" />
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="lg:col-span-2">
                    <CardHeader>
                        <CardTitle>Extrato da Conta</CardTitle>
                        <CardDescription>Histórico de todas as movimentações financeiras do usuário.</CardDescription>
                    </CardHeader>
                    <CardContent>
                         {ledgerError ? (
                            <p className="text-center text-destructive py-10">{ledgerError}</p>
                         ) : ledger.length === 0 && !loadingMoreLedger ? (
                            <p className="text-center text-muted-foreground py-10">Nenhuma movimentação encontrada.</p>
                        ) : (
                            <>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className='w-[150px]'>Tipo</TableHead>
                                            <TableHead>Descrição</TableHead>
                                            <TableHead className='text-right'>Valor</TableHead>
                                            <TableHead className='text-right'>Saldo</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {ledger.map((entry) => {
                                            const config = ledgerTypeConfig[entry.type] || { icon: Coins, color: 'text-muted-foreground', label: entry.type };
                                            const Icon = config.icon;
                                            return (
                                                <TableRow key={entry.id}>
                                                    <TableCell>
                                                        <div className="flex items-center gap-2">
                                                            <Icon className={cn("h-4 w-4", config.color)} />
                                                            <span className="font-medium">{config.label}</span>
                                                        </div>
                                                        <span className="text-xs text-muted-foreground">{formatDate(entry.createdAt)}</span>
                                                    </TableCell>
                                                    <TableCell className="text-xs text-muted-foreground">{entry.description}</TableCell>
                                                    <TableCell className={cn("text-right font-mono", entry.amount > 0 ? 'text-green-400' : 'text-red-400')}>
                                                        {entry.amount > 0 ? '+' : ''}{formatCurrency(entry.amount)}
                                                    </TableCell>
                                                    <TableCell className="text-right font-mono">{formatCurrency(entry.balanceAfter)}</TableCell>
                                                </TableRow>
                                            )
                                        })}
                                    </TableBody>
                                </Table>
                                {loadingMoreLedger && <div className="flex justify-center p-4"><LoaderCircle className="h-6 w-6 animate-spin" /></div>}
                                {lastLedgerDocId && !loadingMoreLedger && (
                                    <div className="mt-4 text-center">
                                        <Button variant="outline" onClick={loadMoreLedgerEntries}>Carregar Mais</Button>
                                    </div>
                                )}
                            </>
                        )}
                    </CardContent>
                </Card>
            </div>
            
            <Card>
                <CardHeader>
                    <div className="flex justify-between items-center">
                        <div>
                            <CardTitle>Rede de Indicação</CardTitle>
                            <CardDescription>Visualize toda a rede de indicados deste usuário.</CardDescription>
                        </div>
                        <div className="relative w-full max-w-xs">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                            <Input 
                                placeholder="Buscar indicado por nome ou email..."
                                value={referralSearchTerm}
                                onChange={(e) => setReferralSearchTerm(e.target.value)}
                                className="pl-10"
                            />
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-6">
                     <ReferralTable
                        title="Indicados de Nível 1"
                        referrals={filteredReferrals.l1}
                        user={user}
                        globalSettings={globalSettings}
                        onEditCustomCommission={setEditingCustomCommission}
                    />
                    <ReferralTable
                        title="Indicados de Nível 2"
                        referrals={filteredReferrals.l2}
                        user={user}
                        globalSettings={globalSettings}
                    />
                    <ReferralTable
                        title="Indicados de Nível 3"
                        referrals={filteredReferrals.l3}
                        user={user}
                        globalSettings={globalSettings}
                    />
                </CardContent>
            </Card>
            
             <div className="grid gap-6 md:grid-cols-2">
                 <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Crown className="h-5 w-5" /> Gerenciamento de Cargos e Permissões</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                         <div className="space-y-2">
                             <Label>Cargos do Usuário</Label>
                            <div className="flex flex-col gap-2">
                                {allRoles.map((role) => (
                                    <div key={role} className="flex items-center space-x-2">
                                        <Checkbox
                                            id={`role-${role}`}
                                            checked={user.roles?.includes(role)}
                                            onCheckedChange={(checked) => {
                                                const currentRoles = user.roles || [];
                                                const newRoles = checked
                                                    ? [...currentRoles, role]
                                                    : currentRoles.filter((r) => r !== role);
                                                handleRolesChange(newRoles);
                                            }}
                                            disabled={isSavingRoles}
                                        />
                                        <label
                                            htmlFor={`role-${role}`}
                                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 capitalize"
                                        >
                                            {role}
                                        </label>
                                    </div>
                                ))}
                            </div>
                            <p className="text-xs text-muted-foreground">Admins e Afiliados acessam o painel. Influencers têm configurações de demonstração.</p>
                         </div>
                         {(user.roles?.includes('influencer')) && (
                            <div className="space-y-2 pt-4 border-t">
                                <Label htmlFor="demo-profile" className="flex items-center gap-2"><Award /> Perfil de Prêmio (Demo)</Label>
                                <div className="flex gap-2">
                                     <Select value={demoProfile} onValueChange={(value: DemoPrizeProfile) => setDemoProfile(value)}>
                                        <SelectTrigger id="demo-profile">
                                            <SelectValue placeholder="Selecione um perfil" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="low">Baixo</SelectItem>
                                            <SelectItem value="medium">Médio</SelectItem>
                                            <SelectItem value="high">Alto</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <Button onClick={handleDemoProfileSave} disabled={isSavingDemoProfile}>Salvar Perfil</Button>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Define a frequência de prêmios altos para esta conta de demonstração.
                                </p>
                             </div>
                         )}
                          {(user.roles?.includes('afiliado') || user.roles?.includes('admin')) && (
                            <div className="space-y-2 pt-4 border-t">
                                <Label htmlFor="postback-url" className="flex items-center gap-2"><Link2/> URL de Postback S2S</Label>
                                <div className="flex gap-2">
                                    <Input 
                                        id="postback-url" 
                                        type="url" 
                                        placeholder="https://sua-rede.com/postback?cid={cid}&sum={sum}"
                                        value={postbackUrl}
                                        onChange={(e) => setPostbackUrl(e.target.value)}
                                        disabled={isSavingPostback}
                                    />
                                    <Button onClick={handlePostbackSave} disabled={isSavingPostback}>Salvar URL</Button>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                   Use as macros `{'{cid}'}`, `{'{sum}'}` e `{'{transaction_id}'}`.
                                </p>
                             </div>
                         )}
                    </CardContent>
                </Card>

                 <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Percent /> Taxas de Comissão Padrão</CardTitle>
                        <CardDescription>Ajuste as taxas que este usuário ganha como afiliado.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                             <p className="text-xs text-muted-foreground mb-2">
                                Quando <span className='font-bold'>{user.firstName}</span> for um afiliado, estas serão suas taxas padrão de ganho sobre os indicados.
                             </p>
                             <div className="grid grid-cols-3 gap-2 text-center">
                                 <Button variant="outline" className="flex-col h-auto py-2" onClick={() => setIsCommissionL1DialogOpen(true)}>
                                    <span className='text-xs text-muted-foreground'>Nível 1</span>
                                    <span className="font-bold text-lg text-primary">{(user.commissionRate ?? globalSettings.commissionRateL1 ?? 10).toFixed(2)}%</span>
                                </Button>
                                 <Button variant="outline" className="flex-col h-auto py-2" onClick={() => setIsCommissionL2DialogOpen(true)}>
                                    <span className='text-xs text-muted-foreground'>Nível 2</span>
                                    <span className="font-bold text-lg text-blue-400">{(user.commissionRateL2 ?? globalSettings.commissionRateL2 ?? 1).toFixed(2)}%</span>
                                </Button>
                                 <Button variant="outline" className="flex-col h-auto py-2" onClick={() => setIsCommissionL3DialogOpen(true)}>
                                    <span className='text-xs text-muted-foreground'>Nível 3</span>
                                    <span className="font-bold text-lg text-purple-400">{(user.commissionRateL3 ?? globalSettings.commissionRateL3 ?? 0.5).toFixed(2)}%</span>
                                </Button>
                             </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>

        {user && adminUser && <EditUserDialog 
            isOpen={isEditUserDialogOpen}
            onOpenChange={setIsEditUserDialogOpen}
            user={user}
            onUserUpdate={fetchUserDetails}
            adminId={adminUser.uid}
        />}
        
        {user && adminUser && <EditBalanceDialog 
            isOpen={isEditBalanceDialogOpen}
            onOpenChange={setIsEditBalanceDialogOpen}
            user={user}
            onBalanceUpdate={async () => {
                await fetchUserDetails();
                await fetchInitialLedger();
            }}
            adminId={adminUser.uid}
        />}

        {user && adminUser && <EditPasswordDialog
            isOpen={isEditPasswordDialogOpen}
            onOpenChange={setIsEditPasswordDialogOpen}
            user={user}
            adminId={adminUser.uid}
        />}

        {user && adminUser && <EditAffiliateDialog 
            isOpen={isEditAffiliateDialogOpen}
            onOpenChange={setIsEditAffiliateDialogOpen}
            user={user}
            onAffiliateUpdate={fetchUserDetails}
            adminId={adminUser.uid}
        />}
        
        {user && adminUser && <UserDetailsCommissionDialogL1 
            isOpen={isCommissionL1DialogOpen}
            onOpenChange={setIsCommissionL1DialogOpen}
            user={user}
            onCommissionUpdate={fetchUserDetails}
            adminId={adminUser.uid}
        />}
        
         {user && adminUser && <UserDetailsCommissionDialogL2
            isOpen={isCommissionL2DialogOpen}
            onOpenChange={setIsCommissionL2DialogOpen}
            user={user}
            onCommissionUpdate={fetchUserDetails}
            adminId={adminUser.uid}
        />}
        
        {user && adminUser && <UserDetailsCommissionDialogL3
            isOpen={isCommissionL3DialogOpen}
            onOpenChange={setIsCommissionL3DialogOpen}
            user={user}
            onCommissionUpdate={fetchUserDetails}
            adminId={adminUser.uid}
        />}

        {editingCustomCommission && user && adminUser && (
            <EditCustomCommissionDialog
                isOpen={!!editingCustomCommission}
                onOpenChange={() => setEditingCustomCommission(null)}
                affiliate={user}
                referredUser={editingCustomCommission}
                onSave={fetchUserDetails}
                adminId={adminUser.uid}
            />
        )}
        </>
    );
}
