
'use client';

import { LineChart, Line, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Users, Banknote, TrendingUp, TrendingDown, CalendarIcon, LoaderCircle, UserPlus, RefreshCw } from 'lucide-react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '@/lib/firebase';
import { useEffect, useState, useCallback } from 'react';
import { Skeleton } from "@/components/ui/skeleton";
import { getDashboardStats, reprocessMissingCommissions } from "./actions";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { DateRange } from "react-day-picker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format, subDays, startOfToday, endOfToday, startOfYesterday, endOfYesterday } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface DailyData {
    date: string;
    deposits: number;
    withdrawals: number;
    ngr: number;
}
interface DashboardStats {
    totalDeposits: number;
    totalWithdrawals: number;
    totalNGR: number;
    registeredUsers: number;
    dailyData: DailyData[];
}

type Preset = "today" | "yesterday" | "last7" | "last30" | "all" | "custom";

export default function AdminDashboardPage() {
    const [user] = useAuthState(auth);
    const { toast } = useToast();
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [reprocessing, setReprocessing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [date, setDate] = useState<DateRange | undefined>({
        from: subDays(new Date(), 6),
        to: new Date(),
    });
    const [activePreset, setActivePreset] = useState<Preset>('last7');

    const userName = user?.displayName || user?.email?.split('@')[0] || 'Admin';

    const fetchData = useCallback(async () => {
        if (!user) return;
        setLoading(true);
        setError(null);
        try {
            const result = await getDashboardStats(date);
            if (result.success && result.data) {
                setStats(result.data);
            } else {
                setError(result.error || "Falha ao buscar dados do painel.");
            }
        } catch (err: any) {
            console.error("Error fetching dashboard data: ", err);
            setError("Ocorreu um erro inesperado.");
        } finally {
            setLoading(false);
        }
    }, [user, date]);
    
    useEffect(() => {
        fetchData();
    }, [fetchData]);

     const handleReprocessCommissions = async () => {
        if (!user) return;
        setReprocessing(true);
        toast({
            title: "Reprocessando...",
            description: "Verificando comissões que podem não ter sido pagas. Isso pode levar alguns momentos.",
        });
        const result = await reprocessMissingCommissions(user.uid);
        if (result.success && result.data) {
            toast({
                title: "Concluído!",
                description: `${result.data.processedCount} comissões foram processadas com sucesso.`,
            });
        } else {
            toast({
                variant: 'destructive',
                title: "Erro!",
                description: result.error || "Falha ao reprocessar comissões.",
            });
        }
        setReprocessing(false);
    };

    
    const handlePresetClick = (preset: Preset) => {
        setActivePreset(preset);
        switch (preset) {
            case 'today':
                setDate({ from: startOfToday(), to: endOfToday() });
                break;
            case 'yesterday':
                const yesterdayStart = startOfYesterday();
                const yesterdayEnd = endOfYesterday();
                setDate({ from: yesterdayStart, to: yesterdayEnd });
                break;
            case 'last7':
                setDate({ from: subDays(new Date(), 6), to: new Date() });
                break;
            case 'last30':
                setDate({ from: subDays(new Date(), 29), to: new Date() });
                break;
            case 'all':
                setDate(undefined);
                break;
            case 'custom':
                // Do nothing, calendar will handle it
                break;
        }
    };
    
    const handleDateSelect = (newDate: DateRange | undefined) => {
        setDate(newDate);
        setActivePreset('custom');
    }

    const formatCurrency = (value: number) => {
        return (value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold">Bem-vindo, {userName}!</h1>
                    <p className="text-muted-foreground">Confira as principais informações do sistema.</p>
                </div>
                 <div className="flex items-center gap-2">
                    <Button onClick={handleReprocessCommissions} disabled={reprocessing || loading} variant="outline">
                        <RefreshCw className={`mr-2 h-4 w-4 ${reprocessing ? 'animate-spin' : ''}`} />
                        Reprocessar Comissões
                    </Button>
                    {loading && <LoaderCircle className="h-5 w-5 animate-spin" />}
                </div>
            </div>
            
            <div className="flex flex-wrap items-center gap-2">
                <Button variant={activePreset === 'today' ? 'default' : 'outline'} onClick={() => handlePresetClick('today')}>Hoje</Button>
                <Button variant={activePreset === 'yesterday' ? 'default' : 'outline'} onClick={() => handlePresetClick('yesterday')}>Ontem</Button>
                <Button variant={activePreset === 'last7' ? 'default' : 'outline'} onClick={() => handlePresetClick('last7')}>7 dias</Button>
                <Button variant={activePreset === 'last30' ? 'default' : 'outline'} onClick={() => handlePresetClick('last30')}>30 dias</Button>
                <Button variant={activePreset === 'all' ? 'default' : 'outline'} onClick={() => handlePresetClick('all')}>Período Total</Button>
                <Popover>
                    <PopoverTrigger asChild>
                        <Button
                        id="date"
                        variant={activePreset === 'custom' ? 'default' : 'outline'}
                        className="w-[280px] justify-start text-left font-normal"
                        >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {date?.from ? (
                            date.to ? (
                            <>
                                {format(date.from, "dd/MM/y")} - {format(date.to, "dd/MM/y")}
                            </>
                            ) : (
                            format(date.from, "dd/MM/y")
                            )
                        ) : (
                            <span>Personalizado</span>
                        )}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="end">
                        <Calendar
                        initialFocus
                        mode="range"
                        defaultMonth={date?.from}
                        selected={date}
                        onSelect={handleDateSelect}
                        numberOfMonths={2}
                        locale={ptBR}
                        />
                    </PopoverContent>
                </Popover>
            </div>
            
            {error && (
                <div className="mb-4 text-center py-4 px-2 bg-destructive/10 text-destructive border border-destructive/20 rounded-lg">
                    <p><strong>Erro:</strong> {error}</p>
                </div>
            )}

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">NGR (Depósitos - Saques)</CardTitle>
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {loading ? <Skeleton className="h-8 w-32" /> : <div className="text-2xl font-bold">{formatCurrency(stats?.totalNGR || 0)}</div>}
                        <p className="text-xs text-muted-foreground">No período selecionado</p>
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total de Depósitos</CardTitle>
                        <TrendingDown className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {loading ? <Skeleton className="h-8 w-24" /> : <div className="text-2xl font-bold">{formatCurrency(stats?.totalDeposits || 0)}</div>}
                         <p className="text-xs text-muted-foreground">No período selecionado</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total de Saques</CardTitle>
                        <Banknote className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {loading ? <Skeleton className="h-8 w-32" /> : <div className="text-2xl font-bold">{formatCurrency(stats?.totalWithdrawals || 0)}</div>}
                         <p className="text-xs text-muted-foreground">No período selecionado</p>
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Novos Cadastros</CardTitle>
                        <UserPlus className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {loading ? <Skeleton className="h-8 w-16" /> : <div className="text-2xl font-bold">{stats?.registeredUsers || 0}</div>}
                         <p className="text-xs text-muted-foreground">No período selecionado</p>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Visão Geral Financeira</CardTitle>
                    <CardDescription>Depósitos, saques e NGR para o período selecionado.</CardDescription>
                </CardHeader>
                <CardContent>
                     {loading ? (
                        <Skeleton className="h-[350px] w-full" />
                     ) : stats && stats.dailyData.length > 0 ? (
                        <div className="h-[350px] w-full text-xs">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={stats.dailyData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                                    <XAxis
                                        dataKey="date"
                                        stroke="hsl(var(--muted-foreground))"
                                        tickLine={false}
                                        axisLine={false}
                                        tickMargin={10}
                                        fontSize={12}
                                    />
                                    <YAxis 
                                        stroke="hsl(var(--muted-foreground))"
                                        tickFormatter={(value) => `R$${value / 1000}k`}
                                        tickLine={false}
                                        axisLine={false}
                                        tickMargin={10}
                                        fontSize={12}
                                    />
                                    <Tooltip
                                        cursor={{ stroke: 'hsl(var(--primary))', strokeWidth: 1, strokeDasharray: '3 3' }}
                                    />
                                    <Legend />
                                    <Line dataKey="deposits" type="monotone" stroke="#22c55e" strokeWidth={2} name="Depósitos" dot={{ r: 4, fill: '#22c55e' }} activeDot={{ r: 6 }} />
                                    <Line dataKey="withdrawals" type="monotone" stroke="#ef4444" strokeWidth={2} name="Saques" dot={{ r: 4, fill: '#ef4444' }} activeDot={{ r: 6 }} />
                                    <Line dataKey="ngr" type="monotone" stroke="#3b82f6" strokeWidth={2} name="NGR" dot={{ r: 4, fill: '#3b82f6' }} activeDot={{ r: 6 }} />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                     ) : (
                        <div className="h-[350px] flex items-center justify-center text-muted-foreground">
                            Nenhum dado encontrado para o período selecionado.
                        </div>
                     )}
                </CardContent>
            </Card>
        </div>
    );
}
