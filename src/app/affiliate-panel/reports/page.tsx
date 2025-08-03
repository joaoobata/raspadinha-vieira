// This is a new file for the advanced reports builder page.
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '@/lib/firebase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { generateCustomReport, ReportConfig, ReportDimension, ReportMetric } from '@/app/actions/affiliate';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LoaderCircle, FileDown, Settings2 } from 'lucide-react';

type Period = 'today' | 'yesterday' | 'last7' | 'this_month';

const dimensionOptions: { id: ReportDimension; label: string }[] = [
    { id: 'day', label: 'Dia' },
    { id: 'source', label: 'Fonte (utm_source)' },
    { id: 'campaign', label: 'Campanha (utm_campaign)' },
    { id: 'device', label: 'Dispositivo' },
];

const metricOptions: { id: ReportMetric; label: string }[] = [
    { id: 'clicks', label: 'Cliques' },
    { id: 'registrations', label: 'Cadastros' },
    { id: 'depositors', label: 'Depositantes' },
    { id: 'deposits_count', label: 'Qtd. Depósitos' },
    { id: 'deposits_value', label: 'Valor Depositado' },
    { id: 'commission_generated', label: 'Comissão Gerada' },
];

export default function AdvancedReportsPage() {
    const [user] = useAuthState(auth);
    const { toast } = useToast();
    const [period, setPeriod] = useState<Period>('last7');
    const [selectedDimensions, setSelectedDimensions] = useState<ReportDimension[]>(['day']);
    const [selectedMetrics, setSelectedMetrics] = useState<ReportMetric[]>(['clicks', 'registrations']);
    const [reportData, setReportData] = useState<any[] | null>(null);
    const [loading, setLoading] = useState(false);

    const handleGenerateReport = useCallback(async () => {
        if (!user) {
            toast({ variant: 'destructive', title: 'Erro', description: 'Você precisa estar logado.' });
            return;
        }
        if (selectedDimensions.length === 0) {
            toast({ variant: 'destructive', title: 'Erro', description: 'Selecione pelo menos uma dimensão.' });
            return;
        }
        if (selectedMetrics.length === 0) {
            toast({ variant: 'destructive', title: 'Erro', description: 'Selecione pelo menos uma métrica.' });
            return;
        }

        setLoading(true);
        setReportData(null);

        const config: ReportConfig = {
            dimensions: selectedDimensions,
            metrics: selectedMetrics,
        };

        const result = await generateCustomReport(user.uid, period, config);

        if (result.success && result.data) {
            setReportData(result.data);
            if (result.data.length === 0) {
                toast({ title: 'Nenhum resultado', description: 'Nenhum dado encontrado para os filtros selecionados ou os grupos são muito pequenos.' });
            }
        } else {
            toast({ variant: 'destructive', title: 'Erro ao gerar relatório', description: result.error });
        }

        setLoading(false);
    }, [user, period, selectedDimensions, selectedMetrics, toast]);

    const handleExportCSV = () => {
        if (!reportData || reportData.length === 0) {
            toast({ variant: 'destructive', title: 'Nada para exportar', description: 'Gere um relatório primeiro.' });
            return;
        }

        const headers = Object.keys(reportData[0]);
        const csvRows = [
            headers.join(','),
            ...reportData.map(row =>
                headers.map(fieldName => JSON.stringify(row[fieldName], (_, value) => value ?? '')).join(',')
            )
        ];

        const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', 'report.csv');
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };
    
    const formatValue = (key: string, value: any) => {
        if (typeof value !== 'number') return value;
        if (key.includes('value') || key.includes('commission')) {
            return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        }
        return value.toLocaleString('pt-BR');
    };

    const tableHeaders = useMemo(() => {
        if (!reportData || reportData.length === 0) return [];
        return Object.keys(reportData[0]);
    }, [reportData]);

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold">Relatórios Avançados</h1>
                <p className="text-muted-foreground">Crie relatórios personalizados cruzando métricas e dimensões.</p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Settings2 /> Construtor de Relatórios</CardTitle>
                    <CardDescription>Selecione as dimensões e métricas que deseja analisar. Linhas com menos de 5 cadastros serão omitidas para proteger a privacidade.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="grid md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <Label>Dimensões (Agrupar por)</Label>
                            <div className="grid grid-cols-2 gap-2 p-4 border rounded-lg">
                                {dimensionOptions.map(item => (
                                    <div key={item.id} className="flex items-center space-x-2">
                                        <Checkbox
                                            id={`dim-${item.id}`}
                                            checked={selectedDimensions.includes(item.id)}
                                            onCheckedChange={checked => {
                                                setSelectedDimensions(prev =>
                                                    checked ? [...prev, item.id] : prev.filter(d => d !== item.id)
                                                );
                                            }}
                                        />
                                        <Label htmlFor={`dim-${item.id}`}>{item.label}</Label>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>Métricas (Calcular)</Label>
                            <div className="grid grid-cols-2 gap-2 p-4 border rounded-lg">
                                {metricOptions.map(item => (
                                    <div key={item.id} className="flex items-center space-x-2">
                                        <Checkbox
                                            id={`met-${item.id}`}
                                            checked={selectedMetrics.includes(item.id)}
                                            onCheckedChange={checked => {
                                                setSelectedMetrics(prev =>
                                                    checked ? [...prev, item.id] : prev.filter(m => m !== item.id)
                                                );
                                            }}
                                        />
                                        <Label htmlFor={`met-${item.id}`}>{item.label}</Label>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-4">
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
                        <Button onClick={handleGenerateReport} disabled={loading}>
                            {loading && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}
                            Gerar Relatório
                        </Button>
                        <Button variant="outline" onClick={handleExportCSV} disabled={!reportData || reportData.length === 0}>
                            <FileDown className="mr-2 h-4 w-4"/>
                            Exportar CSV
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {loading && (
                 <Card>
                    <CardHeader><Skeleton className="h-8 w-1/2" /></CardHeader>
                    <CardContent><Skeleton className="h-40 w-full" /></CardContent>
                </Card>
            )}

            {reportData && (
                <Card>
                    <CardHeader>
                        <CardTitle>Resultados do Relatório</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {reportData.length > 0 ? (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        {tableHeaders.map(header => <TableHead key={header} className="capitalize">{header.replace('_', ' ')}</TableHead>)}
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {reportData.map((row, rowIndex) => (
                                        <TableRow key={rowIndex}>
                                            {tableHeaders.map(header => (
                                                <TableCell key={`${rowIndex}-${header}`}>
                                                    {formatValue(header, row[header])}
                                                </TableCell>
                                            ))}
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        ) : (
                             <p className="text-center text-muted-foreground py-10">
                                Nenhum dado para exibir. Tente uma combinação de filtros diferente ou aguarde mais atividades.
                            </p>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
