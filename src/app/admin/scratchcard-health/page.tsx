
'use client';

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarIcon, LoaderCircle, Gamepad2, Trophy, Frown, DollarSign } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { DateRange } from "react-day-picker";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { getRtpSettings, saveRtpSettings, getPerformanceStats, PerformanceStats } from "./actions";

export default function ScratchcardHealthPage() {
    const { toast } = useToast();
    const [date, setDate] = useState<DateRange | undefined>();
    const [rtpRate, setRtpRate] = useState('');
    const [loadingRtp, setLoadingRtp] = useState(true);
    const [savingRtp, setSavingRtp] = useState(false);
    
    const [loadingStats, setLoadingStats] = useState(true);
    const [stats, setStats] = useState<PerformanceStats | null>(null);
    const [statsTitle, setStatsTitle] = useState('Estatísticas Totais');

    // Fetch initial total stats
    const fetchTotalStats = useCallback(async () => {
        setLoadingStats(true);
        setStatsTitle('Estatísticas Totais');
        const result = await getPerformanceStats(); // No date range
         if (result.success && result.data) {
            setStats(result.data);
        } else {
            toast({ variant: 'destructive', title: 'Erro', description: result.error });
        }
        setLoadingStats(false);
    }, [toast]);
    
    useEffect(() => {
        const fetchRtp = async () => {
            setLoadingRtp(true);
            const result = await getRtpSettings();
            if (result.success && result.data?.rate !== undefined) {
                setRtpRate(result.data.rate.toString());
            } else if(result.error) {
                toast({ variant: 'destructive', title: 'Erro', description: result.error });
            }
            setLoadingRtp(false);
        };
        fetchRtp();
        fetchTotalStats();
    }, [toast, fetchTotalStats]);

    const handleSaveRtp = async () => {
        setSavingRtp(true);
        const rate = parseInt(rtpRate, 10);
        if (isNaN(rate) || rate < 0 || rate > 100) {
            toast({ variant: 'destructive', title: 'Erro', description: 'Por favor, insira um valor entre 0 e 100.' });
            setSavingRtp(false);
            return;
        }

        const result = await saveRtpSettings(rate);
        if (result.success) {
            toast({ title: 'Sucesso!', description: 'Taxa de RTP salva com sucesso.' });
        } else {
            toast({ variant: 'destructive', title: 'Erro', description: result.error });
        }
        setSavingRtp(false);
    };
    
    const handleFilterPlays = async () => {
        if (!date?.from || !date?.to) {
            toast({ variant: 'destructive', title: 'Erro', description: 'Por favor, selecione um período de início e fim.' });
            return;
        }
        setLoadingStats(true);
        setStats(null);
        
        const fromDate = new Date(date.from.setHours(0, 0, 0, 0));
        const toDate = new Date(date.to.setHours(23, 59, 59, 999));
        
        setStatsTitle(`Exibindo de ${format(fromDate, "dd/MM/yy")} a ${format(toDate, "dd/MM/yy")}`);
        const result = await getPerformanceStats({ from: fromDate, to: toDate });

        if (result.success && result.data) {
            setStats(result.data);
        } else {
            toast({ variant: 'destructive', title: 'Erro', description: result.error });
            setStats({ totalPlays: 0, winningPlays: 0, losingPlays: 0, totalPrizesValue: 0});
        }
        setLoadingStats(false);
    }
    
    const formatCurrency = (value: number) => {
        return (value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    };

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold">Saúde da Raspadinha</h1>
                <p className="text-muted-foreground">Controle a taxa de pagamento e analise os dados das raspadinhas.</p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Controle de RTP (Return to Player)</CardTitle>
                    <CardDescription>
                        Defina quantas raspadinhas serão premiadas a cada 100 unidades vendidas. Isso afeta a lucratividade geral.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 max-w-sm">
                    <div className="space-y-2">
                        <Label htmlFor="rtp-rate">Raspadinhas Premiadas a cada 100</Label>
                        <Input 
                            id="rtp-rate" 
                            type="number" 
                            placeholder="Ex: 30"
                            value={rtpRate}
                            onChange={(e) => setRtpRate(e.target.value)} 
                            disabled={loadingRtp}
                        />
                         <p className="text-xs text-muted-foreground">
                            Um valor de "30" significa que, em média, 30% das raspadinhas darão prêmios.
                        </p>
                    </div>
                     <Button onClick={handleSaveRtp} disabled={savingRtp || loadingRtp}>
                        {savingRtp || loadingRtp ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : 'Salvar Configuração'}
                    </Button>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                     <CardTitle>Análise de Desempenho</CardTitle>
                    <CardDescription>
                        Filtre por data para ver as estatísticas de jogo ou veja os totais da plataforma.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="flex flex-wrap items-center gap-4">
                       <Popover>
                        <PopoverTrigger asChild>
                            <Button
                            id="date"
                            variant={"outline"}
                            className={cn(
                                "w-[300px] justify-start text-left font-normal",
                                !date && "text-muted-foreground"
                            )}
                            >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {date?.from ? (
                                date.to ? (
                                <>
                                    {format(date.from, "dd 'de' LLL, y", { locale: ptBR })} -{" "}
                                    {format(date.to, "dd 'de' LLL, y", { locale: ptBR })}
                                </>
                                ) : (
                                format(date.from, "dd 'de' LLL, y", { locale: ptBR })
                                )
                            ) : (
                                <span>Escolha um período</span>
                            )}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                            initialFocus
                            mode="range"
                            defaultMonth={date?.from}
                            selected={date}
                            onSelect={setDate}
                            numberOfMonths={2}
                            locale={ptBR}
                            />
                        </PopoverContent>
                        </Popover>
                        <Button onClick={handleFilterPlays} disabled={loadingStats}>
                            {loadingStats ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : 'Filtrar'}
                        </Button>
                    </div>
                    
                    <div className="py-4 border-2 border-dashed rounded-lg">
                        <h4 className='text-center font-semibold mb-4 text-muted-foreground'>{statsTitle}</h4>
                        <div className="flex items-center justify-center">
                            {loadingStats ? (
                                <LoaderCircle className="h-12 w-12 text-primary animate-spin" />
                            ) : !stats ? (
                                <p className="text-muted-foreground">Nenhuma estatística encontrada.</p>
                            ) : (
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center w-full px-4">
                                    <div className="p-4 bg-secondary/50 rounded-lg">
                                        <Gamepad2 className="h-8 w-8 text-primary mx-auto mb-2" />
                                        <h3 className="text-3xl font-bold">{stats.totalPlays}</h3>
                                        <p className="text-muted-foreground text-sm">Total de Jogadas</p>
                                    </div>
                                    <div className="p-4 bg-secondary/50 rounded-lg">
                                        <Trophy className="h-8 w-8 text-green-400 mx-auto mb-2" />
                                        <h3 className="text-3xl font-bold">{stats.winningPlays}</h3>
                                        <p className="text-muted-foreground text-sm">Jogadas Vencedoras</p>
                                    </div>
                                    <div className="p-4 bg-secondary/50 rounded-lg">
                                        <Frown className="h-8 w-8 text-red-400 mx-auto mb-2" />
                                        <h3 className="text-3xl font-bold">{stats.losingPlays}</h3>
                                        <p className="text-muted-foreground text-sm">Jogadas Perdedoras</p>
                                    </div>
                                    <div className="p-4 bg-secondary/50 rounded-lg">
                                        <DollarSign className="h-8 w-8 text-yellow-400 mx-auto mb-2" />
                                        <h3 className="text-3xl font-bold">{formatCurrency(stats.totalPrizesValue)}</h3>
                                        <p className="text-muted-foreground text-sm">Total em Prêmios</p>
                                    </div>
                            </div>
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
