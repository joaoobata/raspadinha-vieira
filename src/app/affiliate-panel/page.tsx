
'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '@/lib/firebase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { 
    getAffiliateDashboardStats, 
    getTrafficAnalytics, 
    AffiliateDashboardStats, 
    TrafficAnalyticData, 
    CampaignPerformanceData,
} from '@/app/affiliate-panel/actions';
import { claimCommissionBalance } from '@/app/affiliates/actions'; // Re-using this action
import { Button } from '@/components/ui/button';
import { LoaderCircle, UserPlus, Users, DollarSign, Handshake, Gift, RefreshCw, Pointer, LineChart as LineChartIcon, Search, Smartphone, Monitor, Link as LinkIcon, Copy } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useDebounce } from 'use-debounce';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Period = 'today' | 'yesterday' | 'last7' | 'this_month';

const StatCard = ({ title, value, icon: Icon, loading, format = "number" }: { title: string, value: number, icon: React.ElementType, loading: boolean, format?: "currency" | "number" }) => {
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

const CampaignLinkGenerator = ({ baseLink, loading }: { baseLink: string | undefined, loading: boolean }) => {
    const [utmSource, setUtmSource] = useState('');
    const [utmMedium, setUtmMedium] = useState('');
    const [utmCampaign, setUtmCampaign] = useState('');
    const { toast } = useToast();

    const generatedLink = useMemo(() => {
        if (!baseLink) return '';
        const url = new URL(baseLink);
        if (utmSource) url.searchParams.set('utm_source', utmSource);
        if (utmMedium) url.searchParams.set('utm_medium', utmMedium);
        if (utmCampaign) url.searchParams.set('utm_campaign', utmCampaign);
        return url.toString();
    }, [baseLink, utmSource, utmMedium, utmCampaign]);
    
    const handleCopyToClipboard = () => {
        navigator.clipboard.writeText(generatedLink);
        toast({ title: 'Copiado!', description: 'Link da campanha copiado para a área de transferência.' });
    };

    if (loading || !baseLink) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Gerador de Links de Campanha</CardTitle>
                    <CardDescription>Crie links de rastreamento personalizados para suas campanhas.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                </CardContent>
            </Card>
        )
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Gerador de Links de Campanha</CardTitle>
                <CardDescription>Crie links de rastreamento personalizados para suas campanhas de marketing.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                 <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="utm_source">Fonte (utm_source)</Label>
                        <Input id="utm_source" value={utmSource} onChange={e => setUtmSource(e.target.value)} placeholder="Ex: facebook, google" />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="utm_medium">Mídia (utm_medium)</Label>
                        <Input id="utm_medium" value={utmMedium} onChange={e => setUtmMedium(e.target.value)} placeholder="Ex: cpc, social, email" />
                    </div>
                     <div className="space-y-2">
                        <Label htmlFor="utm_campaign">Campanha (utm_campaign)</Label>
                        <Input id="utm_campaign" value={utmCampaign} onChange={e => setUtmCampaign(e.target.value)} placeholder="Ex: promo_junho" />
                    </div>
                </div>
                 <div className="space-y-2 pt-4">
                    <Label>Seu Link Personalizado</Label>
                    <div className="flex items-center space-x-2">
                        <Input readOnly value={generatedLink} className="bg-secondary" />
                        <Button onClick={handleCopyToClipboard} size="icon" aria-label="Copiar Link">
                            <Copy className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}


export default function AffiliatePanelPage() {
    const [user] = useAuthState(auth);
    const { toast } = useToast();
    const [stats, setStats] = useState<AffiliateDashboardStats | null>(null);
    const [trafficData, setTrafficData] = useState<TrafficAnalyticData['dailyChartData'] | null>(null);
    const [campaignData, setCampaignData] = useState<CampaignPerformanceData[] | null>(null);
    
    const [campaignSearchTerm, setCampaignSearchTerm] = useState('');
    const [debouncedCampaignSearch] = useDebounce(campaignSearchTerm, 300);
    
    const [loading, setLoading] = useState(true);
    const [claiming, setClaiming] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [period, setPeriod] = useState<Period>('last7');

    const fetchAffiliateData = useCallback(async () => {
        if (user) {
            setLoading(true);
            setError(null);
            
            const [statsResult, trafficResult] = await Promise.all([
                getAffiliateDashboardStats(user.uid, period),
                getTrafficAnalytics(user.uid, period),
            ]);

            if (statsResult.success && statsResult.data) {
                setStats(statsResult.data);
            } else {
                setError(prev => prev ? `${prev} | ${statsResult.error}` : statsResult.error || 'Falha ao carregar estatísticas.');
            }
            
            if(trafficResult.success && trafficResult.data) {
                setTrafficData(trafficResult.data.dailyChartData);
                setCampaignData(trafficResult.data.campaignPerformance);
            } else {
                 setError(prev => prev ? `${prev} | ${trafficResult.error}` : trafficResult.error || 'Falha ao carregar dados de tráfego.');
            }

            setLoading(false);
        }
    }, [user, period]);
    
     const filteredCampaignData = useMemo(() => {
        if (!campaignData) return [];
        if (!debouncedCampaignSearch) return campaignData;
        
        const lowercasedFilter = debouncedCampaignSearch.toLowerCase();
        
        return campaignData.filter(item => 
            (item.source?.toLowerCase().includes(lowercasedFilter)) ||
            (item.campaign?.toLowerCase().includes(lowercasedFilter))
        );
    }, [campaignData, debouncedCampaignSearch]);

    useEffect(() => {
        fetchAffiliateData();
    }, [fetchAffiliateData]);
    
    const handleClaimCommission = async () => {
        if (!user) return;
        setClaiming(true);
        const result = await claimCommissionBalance(user.uid);
        if (result.success) {
            toast({
                title: 'Sucesso!',
                description: 'Saldo de comissão foi transferido para seu saldo principal.'
            });
            await fetchAffiliateData(); // Refresh stats
        } else {
            toast({
                variant: 'destructive',
                title: 'Erro!',
                description: result.error
            });
        }
        setClaiming(false);
    }
    
    const referralLink = useMemo(() => {
        if (!user) return undefined;
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://raspadinha-jade.vercel.app';
        return `${baseUrl}/c/${user.uid}`;
    }, [user]);

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold">Painel de Afiliado</h1>
                    <p className="text-muted-foreground">Seu centro de controle para acompanhar performance e ganhos.</p>
                </div>
                <div className="flex items-center gap-2">
                    <Select value={period} onValueChange={(value: Period) => setPeriod(value)}>
                        <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="Selecione o período" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="today">Hoje</SelectItem>
                            <SelectItem value="yesterday">Ontem</SelectItem>
                            <SelectItem value="last7">Últimos 7 dias</SelectItem>
                            <SelectItem value="this_month">Este mês</SelectItem>
                        </SelectContent>
                    </Select>
                    <Button onClick={fetchAffiliateData} variant="outline" size="icon" disabled={loading}>
                        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    </Button>
                </div>
            </div>

            {error && <div className="text-center py-4 text-destructive bg-destructive/10 rounded-lg">{error}</div>}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6">
                <StatCard title="Cliques" value={stats?.totalClicks ?? 0} icon={Pointer} loading={loading} />
                <StatCard title="Cadastros" value={stats?.totalRegistrations ?? 0} icon={UserPlus} loading={loading} />
                <StatCard title="Depositantes" value={stats?.totalDepositors ?? 0} icon={Users} loading={loading} />
                <StatCard title="Total Depósitos" value={stats?.totalDepositsCount ?? 0} icon={DollarSign} loading={loading} />
                <StatCard title="Valor Depositado" value={stats?.totalDepositedValue ?? 0} icon={DollarSign} loading={loading} format="currency" />
                <StatCard title="Comissão Gerada" value={stats?.totalCommissionGenerated ?? 0} icon={Handshake} loading={loading} format="currency" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                <div className="lg:col-span-3">
                     <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2"><LineChartIcon className="h-5 w-5"/>Análise de Tráfego</CardTitle>
                            <CardDescription>Visualização de cliques e cadastros no período selecionado.</CardDescription>
                        </CardHeader>
                        <CardContent>
                             {loading ? <Skeleton className="h-[300px] w-full" /> : (
                                <ResponsiveContainer width="100%" height={300}>
                                    <LineChart data={trafficData}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                                        <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                                        <YAxis yAxisId="left" stroke="hsl(var(--primary))" fontSize={12} tickLine={false} axisLine={false} />
                                        <YAxis yAxisId="right" orientation="right" stroke="#34d399" fontSize={12} tickLine={false} axisLine={false} />
                                        <Tooltip
                                            contentStyle={{
                                                backgroundColor: 'hsl(var(--background))',
                                                borderColor: 'hsl(var(--border))'
                                            }}
                                        />
                                        <Legend />
                                        <Line yAxisId="left" type="monotone" dataKey="clicks" name="Cliques" stroke="hsl(var(--primary))" strokeWidth={2} />
                                        <Line yAxisId="right" type="monotone" dataKey="registrations" name="Cadastros" stroke="#34d399" strokeWidth={2} />
                                    </LineChart>
                                </ResponsiveContainer>
                             )}
                        </CardContent>
                    </Card>
                </div>
                 <div className="lg:col-span-2 space-y-6">
                     <Card className="bg-primary/10 border-primary/20 h-full flex flex-col">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2"><Gift /> Saldo de Comissão</CardTitle>
                            <CardDescription>Este é o valor total que você acumulou e está disponível para resgate.</CardDescription>
                        </CardHeader>
                        <CardContent className="flex-grow flex flex-col items-center justify-center">
                            {loading ? <Skeleton className="h-16 w-48" /> : (
                                <div className="text-5xl font-bold text-primary">
                                    {(stats?.commissionBalance ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                </div>
                            )}
                        </CardContent>
                        <CardFooter>
                            <Button className="w-full bg-primary" onClick={handleClaimCommission} disabled={claiming || loading || (stats?.commissionBalance ?? 0) <= 0}>
                                {claiming ? <LoaderCircle className="animate-spin"/> : "Resgatar para Saldo Principal"}
                            </Button>
                        </CardFooter>
                    </Card>
                </div>
            </div>
            
            <CampaignLinkGenerator baseLink={referralLink} loading={loading} />

            <Card>
                <CardHeader>
                    <CardTitle>Análise de Campanhas</CardTitle>
                    <CardDescription>
                        Desempenho detalhado por campanha, fonte e dispositivo. Linhas com menos de 5 cliques são omitidas por privacidade.
                    </CardDescription>
                     <div className="relative pt-4">
                        <Search className="absolute left-2.5 top-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Buscar por fonte ou campanha..."
                            className="pl-8"
                            value={campaignSearchTerm}
                            onChange={(e) => setCampaignSearchTerm(e.target.value)}
                        />
                    </div>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="space-y-2">
                           {Array.from({length: 5}).map((_,i) => <Skeleton key={i} className="h-12 w-full"/>)}
                        </div>
                    ) : filteredCampaignData && filteredCampaignData.length > 0 ? (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Data</TableHead>
                                    <TableHead>Fonte</TableHead>
                                    <TableHead>Campanha</TableHead>
                                    <TableHead>Dispositivo</TableHead>
                                    <TableHead className="text-right">Cliques</TableHead>
                                    <TableHead className="text-right">Cadastros</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredCampaignData.map((item, index) => (
                                    <TableRow key={index}>
                                        <TableCell>{item.date}</TableCell>
                                        <TableCell>{item.source || '-'}</TableCell>
                                        <TableCell>{item.campaign || '-'}</TableCell>
                                        <TableCell>
                                             <div className="flex items-center gap-2">
                                                {item.device === 'Mobile' ? <Smartphone className="h-4 w-4" /> : <Monitor className="h-4 w-4" />}
                                                {item.device}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right font-medium">{item.clicks}</TableCell>
                                        <TableCell className="text-right font-medium text-green-400">{item.registrations}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    ) : (
                        <p className="text-center text-muted-foreground py-10">
                           {campaignSearchTerm ? "Nenhum resultado encontrado." : "Nenhum dado de campanha para exibir neste período."}
                        </p>
                    )}
                </CardContent>
            </Card>

        </div>
    );
}
