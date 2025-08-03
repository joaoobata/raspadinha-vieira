
'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getSystemHealthStats, SystemHealthStats, BatchHealth } from './actions';
import { Button } from '@/components/ui/button';
import { RefreshCw, Wallet, Box, Percent, Scale, AlertTriangle, CheckCircle, Archive } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from '@/components/ui/separator';

const StatCard = ({ title, value, icon: Icon, loading, format = "currency" }: { title: string, value: number, icon: React.ElementType, loading: boolean, format?: "currency" | "number" }) => {
    const formatValue = (val: number) => {
        if (format === 'currency') {
            return (val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        }
        return val.toLocaleString('pt-BR');
    };

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{title}</CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                {loading ? <Skeleton className="h-8 w-3/4" /> : <div className="text-2xl font-bold">{formatValue(value)}</div>}
            </CardContent>
        </Card>
    );
};


export default function SystemHealthPage() {
    const [stats, setStats] = useState<SystemHealthStats | null>(null);
    const [loading, setLoading] = useState(true);
    const { toast } = useToast();

    const fetchStats = useCallback(async () => {
        setLoading(true);
        try {
            const result = await getSystemHealthStats();
            if (result.success && result.data) {
                setStats(result.data);
            } else {
                 toast({ variant: 'destructive', title: 'Erro', description: result.error });
            }
        } catch (err) {
            toast({ variant: 'destructive', title: 'Erro Inesperado', description: 'Não foi possível carregar os dados.' });
        } finally {
            setLoading(false);
        }
    }, [toast]);
    
    useEffect(() => {
        fetchStats();
    }, [fetchStats]);

     const formatCurrency = (value: number) => (value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
     const formatPercent = (value: number) => `${(value || 0).toFixed(2)}%`;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                 <div>
                    <h1 className="text-3xl font-bold">Saúde do Sistema</h1>
                    <p className="text-muted-foreground">Monitore a integridade financeira e lógica da plataforma.</p>
                </div>
                 <Button onClick={fetchStats} variant="outline" size="sm" disabled={loading}>
                    <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    Atualizar
                </Button>
            </div>
            
             <Card className="border-yellow-500/50 bg-yellow-500/5">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-yellow-400"><AlertTriangle /> Ponto de Atenção</CardTitle>
                    <CardDescription className="text-yellow-400/80">
                       Esta página realiza cálculos complexos em toda a base de dados. Use com moderação e esteja ciente de que os dados podem não refletir transações que ocorreram nos últimos segundos.
                    </CardDescription>
                </CardHeader>
            </Card>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                 <StatCard 
                    title="Saldo Total de Usuários"
                    value={stats?.totalUserBalance ?? 0}
                    icon={Wallet}
                    loading={loading}
                />
            </div>
            
            <Card>
                <CardHeader>
                    <CardTitle>Análise dos Lotes de GGR</CardTitle>
                    <CardDescription>Compare o RTP teórico (configurado) com o RTP real (pago) para cada lote.</CardDescription>
                </CardHeader>
                <CardContent>
                     {loading ? (
                        <Skeleton className="h-60 w-full" />
                    ) : !stats || stats.batchesHealth.length === 0 ? (
                        <p className="text-center text-muted-foreground py-10">Nenhum lote de GGR encontrado para análise.</p>
                    ) : (
                        <div className="space-y-8">
                            {stats.batchesHealth.map(batch => (
                                <div key={batch.id}>
                                    <div className="flex justify-between items-center mb-4">
                                        <h3 className="text-xl font-bold flex items-center gap-2">
                                            <Box/> {batch.name}
                                        </h3>
                                        <Badge variant={batch.status === 'active' ? 'default' : 'secondary'} className="capitalize">
                                            {batch.status === 'active' ? <CheckCircle className="mr-2 h-4 w-4" /> : <Archive className="mr-2 h-4 w-4" />}
                                            {batch.status}
                                        </Badge>
                                    </div>
                                     <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                        <div className="space-y-4">
                                            <h4 className="font-semibold text-muted-foreground">Arrecadação (GGR)</h4>
                                            <Progress value={(batch.ggrCurrent / batch.ggrTarget) * 100} />
                                            <div className="flex justify-between text-sm">
                                                <span className="font-medium">{formatCurrency(batch.ggrCurrent)}</span>
                                                <span className="text-muted-foreground">{formatCurrency(batch.ggrTarget)}</span>
                                            </div>
                                        </div>
                                         <div className="space-y-4">
                                            <h4 className="font-semibold text-muted-foreground">Distribuição de Prêmios</h4>
                                            <Progress value={batch.payoutPercentage} />
                                             <div className="flex justify-between text-sm">
                                                <span className="font-medium">{formatCurrency(batch.prizesDistributed)}</span>
                                                <span className="text-muted-foreground">{formatCurrency(batch.prizePool)}</span>
                                            </div>
                                        </div>
                                        <div className="space-y-4">
                                             <h4 className="font-semibold text-muted-foreground flex items-center gap-2"><Scale /> Comparativo de RTP</h4>
                                             <div className="flex justify-between items-center bg-secondary p-3 rounded-lg">
                                                <div>
                                                    <p className="text-xs text-muted-foreground">Teórico</p>
                                                    <p className="font-bold text-lg">{formatPercent(batch.theoreticalRTP)}</p>
                                                </div>
                                                <Separator orientation="vertical" className="h-10"/>
                                                <div>
                                                    <p className="text-xs text-muted-foreground">Real (Pago)</p>
                                                    <p className="font-bold text-lg text-primary">{formatPercent(batch.realRTP)}</p>
                                                </div>
                                             </div>
                                        </div>
                                     </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
