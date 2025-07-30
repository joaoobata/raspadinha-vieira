
'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getCommissionDebugLogs, CommissionDebugLog } from './actions';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RefreshCw, Bug, AlertCircle, CheckCircle, SkipForward, PlayCircle } from 'lucide-react';
import Link from 'next/link';

export default function AdminCommissionLogsPage() {
    const [logs, setLogs] = useState<CommissionDebugLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchLogs = async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await getCommissionDebugLogs();
            if (result.success && result.data) {
                setLogs(result.data);
            } else {
                setError(result.error || 'Falha ao buscar os logs.');
            }
        } catch (err: any) {
            console.error(err);
            setError('Ocorreu um erro inesperado ao buscar os dados.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLogs();
    }, []);

    const formatDate = (dateString: string | null | undefined) => {
        if (!dateString) return '-';
        try {
            return new Date(dateString).toLocaleString('pt-BR');
        } catch (e) {
            return '-';
        }
    }
    
    const getStatusConfig = (status: string) => {
        switch (status) {
            case 'FATAL_ERROR':
                return { variant: 'destructive', icon: AlertCircle, label: 'Erro Fatal' };
            case 'SUCCESS':
            case 'BALANCE_UPDATED':
                return { variant: 'default', icon: CheckCircle, label: 'Sucesso' };
            case 'SKIPPED':
            case 'BALANCE_SKIPPED':
                return { variant: 'secondary', icon: SkipForward, label: 'Ignorado' };
             case 'START':
                return { variant: 'outline', icon: PlayCircle, label: 'Início' };
            default:
                return { variant: 'outline', icon: Bug, label: status };
        }
    }

    return (
        <Card>
            <CardHeader>
                <div className="flex justify-between items-center">
                    <div>
                        <CardTitle>Logs de Depuração de Comissão</CardTitle>
                        <CardDescription>
                            Visualize o passo-a-passo do processamento de comissões para depurar problemas.
                        </CardDescription>
                    </div>
                    <Button onClick={fetchLogs} variant="outline" size="sm" disabled={loading}>
                        <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                        Atualizar
                    </Button>
                </div>
            </CardHeader>
            <CardContent>
                {loading ? (
                     <div className="space-y-2">
                        <Skeleton className="h-12 w-full" />
                        <Skeleton className="h-12 w-full" />
                        <Skeleton className="h-12 w-full" />
                    </div>
                ) : error ? (
                    <div className="text-center py-10 text-destructive">
                        <p>Erro: {error}</p>
                    </div>
                ) : logs.length === 0 ? (
                     <div className="text-center py-10">
                        <Bug className="mx-auto h-12 w-12 text-muted-foreground" />
                        <p className="mt-4 text-muted-foreground">Nenhum log de depuração de comissão encontrado.</p>
                    </div>
                ) : (
                    <Accordion type="single" collapsible className="w-full">
                        {logs.map((log) => {
                            const statusConfig = getStatusConfig(log.status);
                            const Icon = statusConfig.icon;
                            return (
                                <AccordionItem value={log.id} key={log.id}>
                                    <AccordionTrigger>
                                        <div className="flex justify-between items-center w-full pr-4 gap-4">
                                            <div className="flex items-center gap-4 flex-1 min-w-0">
                                                 <Badge variant={statusConfig.variant} className="w-28 justify-center">
                                                    <Icon className="mr-2 h-4 w-4" />
                                                    {statusConfig.label}
                                                </Badge>
                                                <span className='text-xs text-muted-foreground'>{formatDate(log.createdAt)}</span>
                                                <div className="flex-1 min-w-0">
                                                    <p className='font-mono text-xs text-left truncate'>
                                                        Transação: {log.transactionId}
                                                    </p>
                                                     {log.details.reason && <p className='text-xs text-muted-foreground truncate'>{log.details.reason}</p>}
                                                </div>
                                            </div>
                                            <div className="flex flex-col items-end text-xs">
                                                <span className='text-muted-foreground'>Nível</span>
                                                <span className="font-bold">{log.level}</span>
                                            </div>
                                        </div>
                                    </AccordionTrigger>
                                    <AccordionContent>
                                        <pre className="bg-secondary/50 p-4 rounded-md text-xs overflow-x-auto">
                                            {JSON.stringify(log.details, null, 2)}
                                        </pre>
                                    </AccordionContent>
                                </AccordionItem>
                            )
                        })}
                    </Accordion>
                )}
            </CardContent>
        </Card>
    );
}
