
'use client';
// HMR fix

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '@/lib/firebase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { getAccountStats, claimCommissionBalance } from '@/app/affiliates/actions';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Copy, Users, Gift, LoaderCircle, Search } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

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

export default function AffiliatesPage() {
    const [user] = useAuthState(auth);
    const { toast } = useToast();
    const [stats, setStats] = useState<AffiliateStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [claiming, setClaiming] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');

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
    
    useEffect(() => {
        if(user) {
            fetchAffiliateData();
        }
    }, [user, fetchAffiliateData]);

    const filteredReferrals = useMemo(() => {
        if (!stats) {
            return { level1: [], level2: [], level3: [] };
        }
        if (!searchTerm) {
            return {
                level1: stats.level1.referrals,
                level2: stats.level2.referrals,
                level3: stats.level3.referrals,
            };
        }
        const lowerCaseSearch = searchTerm.toLowerCase();
        const filterFn = (ref: ReferralDetails) => ref.name.toLowerCase().includes(lowerCaseSearch);

        return {
            level1: stats.level1.referrals.filter(filterFn),
            level2: stats.level2.referrals.filter(filterFn),
            level3: stats.level3.referrals.filter(filterFn),
        };
    }, [stats, searchTerm]);
    
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
    
    const renderReferralTable = (title: string, referrals: ReferralDetails[], count: number) => {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>{title}</CardTitle>
                    <CardDescription>Você tem {count} indicados neste nível.</CardDescription>
                </CardHeader>
                <CardContent>
                    {referrals.length === 0 ? (
                         <p className="text-center text-muted-foreground py-4">
                            {searchTerm ? 'Nenhum indicado encontrado com este termo.' : 'Nenhum indicado ativo neste nível.'}
                         </p>
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
                                {referrals.map(r => (
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
            </Card>
        );
    };


    return (
        <div className="space-y-6">
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
                    </div>
                    <div className="space-y-6">
                        <Card className="bg-primary/20 border-primary/40 flex flex-col h-full">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2"><Gift /> Saldo de Comissão</CardTitle>
                                <CardDescription>Comissões prontas para resgate.</CardDescription>
                            </CardHeader>
                            <CardContent className="flex-grow">
                                {loading ? <Skeleton className="h-8 w-32" /> : <div className="text-4xl font-bold text-primary">{formatCurrency(stats?.commissionBalance || 0)}</div>}
                            </CardContent>
                            <CardFooter>
                                <Button className="w-full bg-primary" onClick={handleClaimCommission} disabled={claiming || loading || (stats?.commissionBalance || 0) <= 0}>
                                    {claiming ? <LoaderCircle className="animate-spin"/> : "Resgatar para Saldo Principal"}
                                </Button>
                            </CardFooter>
                        </Card>
                    </div>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>Sua Rede de Indicados</CardTitle>
                        <CardDescription>Pesquise e visualize os membros da sua rede de afiliados.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="relative mb-4">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Buscar indicado por nome..."
                                className="pl-8"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                         {loading ? (
                            <div className="space-y-6">
                                <Skeleton className="h-60 w-full" />
                                <Skeleton className="h-60 w-full" />
                            </div>
                        ) : stats && (
                            <div className="space-y-6">
                                {renderReferralTable(`Indicados Diretos (Nível 1 - ${stats.commissionPlan.level1Rate.toFixed(1)}%)`, filteredReferrals.level1, stats.level1.count)}
                                {renderReferralTable(`Indicados de Nível 2 (${stats.commissionPlan.level2Rate.toFixed(1)}%)`, filteredReferrals.level2, stats.level2.count)}
                                {renderReferralTable(`Indicados de Nível 3 (${stats.commissionPlan.level3Rate.toFixed(1)}%)`, filteredReferrals.level3, stats.level3.count)}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
