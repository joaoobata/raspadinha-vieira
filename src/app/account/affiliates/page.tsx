
'use client';
// HMR fix

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '@/lib/firebase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { getAccountStats, claimCommissionBalance } from './actions';
import { Button } from '@/components/ui/button';
import { Copy, Users, Gift, LoaderCircle, DollarSign, ChevronDown } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';

interface ReferralDetails {
    id: string;
    name: string;
    totalDeposited: number;
    commissionBaseAmount: number;
    commissionGenerated: number;
    commissionRate: number;
}

interface CommissionPlan {
    level1Rate: number;
    level2Rate: number;
    level3Rate: number;
}

interface AffiliateStats {
    referralLink: string;
    commissionBalance: number;
    commissionPlan: CommissionPlan;
    level1: {
        count: number;
        referrals: ReferralDetails[];
    },
    level2: {
        count: number;
        referrals: ReferralDetails[];
    },
    level3: {
        count: number;
        referrals: ReferralDetails[];
    },
}

type VisibleCounts = {
    level1: number;
    level2: number;
    level3: number;
};

export default function AffiliatesPage() {
    const [user] = useAuthState(auth);
    const { toast } = useToast();
    const [stats, setStats] = useState<AffiliateStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [claiming, setClaiming] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [visibleCounts, setVisibleCounts] = useState<VisibleCounts>({
        level1: 10,
        level2: 10,
        level3: 10,
    });

    const fetchAffiliateData = useCallback(async () => {
        if (user) {
            setLoading(true);
            const statsResult = await getAccountStats(user.uid);

            if (statsResult.success && statsResult.data) {
                const { referralLink, commissionBalance, commissionPlan, level1, level2, level3 } = statsResult.data;
                setStats({ referralLink, commissionBalance, commissionPlan, level1, level2, level3 });
            } else {
                setError(statsResult.error || 'Falha ao carregar estatísticas de afiliados.');
            }
            setLoading(false);
        }
    }, [user]);

    const totalNetworkDeposits = useMemo(() => {
        if (!stats) return 0;
        const l1Deposits = stats.level1.referrals.reduce((sum, r) => sum + r.totalDeposited, 0);
        const l2Deposits = stats.level2.referrals.reduce((sum, r) => sum + r.totalDeposited, 0);
        const l3Deposits = stats.level3.referrals.reduce((sum, r) => sum + r.totalDeposited, 0);
        return l1Deposits + l2Deposits + l3Deposits;
    }, [stats]);
    
    useEffect(() => {
        if(user) {
            fetchAffiliateData();
        }
    }, [user, fetchAffiliateData]);

    const handleCopyToClipboard = () => {
        if (stats?.referralLink) {
          navigator.clipboard.writeText(stats.referralLink);
          toast({ title: 'Copiado!', description: 'Link de indicação copiado para a área de transferência.' });
        }
    };
    
    const handleClaimCommission = async () => {
        if (!user) return;
        setClaiming(true);
        const result = await claimCommissionBalance(user.uid);
        if (result.success) {
            toast({
                title: 'Sucesso!',
                description: 'Saldo de comissão foi transferido para seu saldo principal.'
            });
            await fetchAffiliateData(); // Refresh stats to show new balances
        } else {
            toast({
                variant: 'destructive',
                title: 'Erro!',
                description: result.error
            });
        }
        setClaiming(false);
    }
    
    const formatCurrency = (value: number) => {
        return (value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }
    
    const renderReferralTable = (title: string, referrals: ReferralDetails[], count: number, level: keyof VisibleCounts) => {
        const visibleReferrals = referrals.slice(0, visibleCounts[level]);
        const hasMore = referrals.length > visibleCounts[level];

        return (
            <Card>
                <CardHeader>
                    <CardTitle>{title}</CardTitle>
                    <CardDescription>Você tem {count} indicados neste nível.</CardDescription>
                </CardHeader>
                <CardContent>
                    {referrals.length === 0 ? (
                         <p className="text-center text-muted-foreground py-4">Nenhum indicado ativo neste nível.</p>
                    ) : (
                        <Table>
                             <TableHeader>
                                <TableRow>
                                    <TableHead>Indicado</TableHead>
                                    <TableHead>Depósitos</TableHead>
                                    <TableHead>Base Comissão</TableHead>
                                    <TableHead>%</TableHead>
                                    <TableHead className="text-right">Comissão Gerada</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {visibleReferrals.map(r => (
                                    <TableRow key={r.id}>
                                        <TableCell className="font-medium">{r.name}</TableCell>
                                        <TableCell>{formatCurrency(r.totalDeposited)}</TableCell>
                                        <TableCell>{formatCurrency(r.commissionBaseAmount)}</TableCell>
                                        <TableCell>{r.commissionRate.toFixed(1)}%</TableCell>
                                        <TableCell className="text-right font-bold text-green-400">{formatCurrency(r.commissionGenerated)}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
                 {hasMore && (
                    <CardFooter className="justify-center">
                        <Button
                            variant="outline"
                            onClick={() => setVisibleCounts(prev => ({ ...prev, [level]: referrals.length }))}
                        >
                            <ChevronDown className="mr-2 h-4 w-4" />
                            Mostrar Mais ({referrals.length - visibleCounts[level]} restantes)
                        </Button>
                    </CardFooter>
                )}
            </Card>
        );
    };


    return (
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="mb-8">
                <h1 className="text-3xl font-bold">Indique e Ganhe</h1>
                <p className="text-muted-foreground">Acompanhe seus ganhos como afiliado e gerencie seus indicados.</p>
            </div>

            {error && (
                <div className="mb-4 text-center py-4 px-2 bg-destructive/10 text-destructive border border-destructive/20 rounded-lg">
                    <p><strong>Erro:</strong> {error}</p>
                </div>
            )}
            
            <div className="mt-6 space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2 space-y-6">
                        <Card>
                            <CardHeader>
                                <CardTitle>Seu Link de Indicação</CardTitle>
                                <CardDescription>Compartilhe este link para convidar novos jogadores e ganhar comissões.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                {loading ? ( <Skeleton className="h-10 w-full" /> ) : (
                                    <div className="flex items-center space-x-2">
                                        <Input readOnly value={stats?.referralLink || ''} className="bg-secondary" />
                                        <Button onClick={handleCopyToClipboard} size="icon">
                                            <Copy className="h-4 w-4" />
                                        </Button>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                         {loading ? (
                            <div className="space-y-6">
                                <Skeleton className="h-60 w-full" />
                                <Skeleton className="h-60 w-full" />
                            </div>
                        ) : stats && (
                            <div className="space-y-6">
                                {renderReferralTable(`Indicados Diretos (Nível 1 - ${stats.commissionPlan.level1Rate.toFixed(1)}%)`, stats.level1.referrals, stats.level1.count, 'level1')}
                                {renderReferralTable(`Indicados de Nível 2 (${stats.commissionPlan.level2Rate.toFixed(1)}%)`, stats.level2.referrals, stats.level2.count, 'level2')}
                                {renderReferralTable(`Indicados de Nível 3 (${stats.commissionPlan.level3Rate.toFixed(1)}%)`, stats.level3.referrals, stats.level3.count, 'level3')}
                            </div>
                        )}
                    </div>
                    <div className="space-y-6">
                        <Card className="bg-primary/20 border-primary/40">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2"><Gift /> Saldo de Comissão</CardTitle>
                                <CardDescription>Comissões prontas para resgate.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                {loading ? <Skeleton className="h-8 w-32" /> : <div className="text-4xl font-bold text-primary">{formatCurrency(stats?.commissionBalance || 0)}</div>}
                            </CardContent>
                            <CardFooter>
                                <Button className="w-full bg-primary" onClick={handleClaimCommission} disabled={claiming || loading || (stats?.commissionBalance || 0) <= 0}>
                                    {claiming ? <LoaderCircle className="animate-spin"/> : "Resgatar para Saldo Principal"}
                                </Button>
                            </CardFooter>
                        </Card>
                        <Card>
                             <CardHeader>
                                <CardTitle className="flex items-center gap-2"><DollarSign /> Total Depositado (Rede)</CardTitle>
                                <CardDescription>Soma de todos os depósitos de seus indicados nos 3 níveis.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                {loading ? <Skeleton className="h-8 w-32" /> : <div className="text-3xl font-bold">{formatCurrency(totalNetworkDeposits)}</div>}
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2"><Users /> Sua Rede</CardTitle>
                            </CardHeader>
                             <CardContent>
                                {loading ? (
                                    <div className="space-y-4">
                                        <Skeleton className="h-6 w-4/5" />
                                        <Skeleton className="h-6 w-3/5" />
                                        <Skeleton className="h-6 w-4/6" />
                                    </div>
                                ) : (
                                    <ul className="space-y-2 text-sm">
                                        <li className="flex justify-between"><span>Indicados Diretos (Nível 1):</span> <span className="font-bold">{stats?.level1.count}</span></li>
                                        <li className="flex justify-between"><span>Indicados (Nível 2):</span> <span className="font-bold">{stats?.level2.count}</span></li>
                                        <li className="flex justify-between"><span>Indicados (Nível 3):</span> <span className="font-bold">{stats?.level3.count}</span></li>
                                    </ul>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>
        </div>
    );
}

    