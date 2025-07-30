
'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getErrorLogs } from './actions';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';

interface ErrorLog {
    id: string;
    type: 'deposit' | 'withdrawal' | 'withdrawal_gateway_error';
    error: string;
    createdAt: string | null;
    webhookData: any;
    resolved: boolean;
}

export default function AdminErrorLogsPage() {
    const [logs, setLogs] = useState<ErrorLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchLogs = async () => {
            setLoading(true);
            setError(null);
            try {
                const result = await getErrorLogs();
                if (result.success && result.data) {
                    setLogs(result.data as ErrorLog[]);
                } else {
                    setError(result.error || 'Falha ao buscar os logs de erro.');
                }
            } catch (err: any) {
                console.error(err);
                setError('Ocorreu um erro inesperado ao buscar os dados.');
            } finally {
                setLoading(false);
            }
        };

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

    const getTypeVariant = (type: ErrorLog['type']) => {
        switch (type) {
            case 'deposit':
                return 'default';
            case 'withdrawal':
            case 'withdrawal_gateway_error':
                return 'destructive';
            default:
                return 'secondary';
        }
    }
    
     const getTypeLabel = (type: ErrorLog['type']) => {
        const labels = {
            deposit: 'DEPÓSITO',
            withdrawal: 'SAQUE (WEBHOOK)',
            withdrawal_gateway_error: 'SAQUE (GATEWAY)'
        };
        return labels[type] || type.toUpperCase();
    }


    return (
        <Card>
            <CardHeader>
                <CardTitle>Logs de Erro</CardTitle>
                <CardDescription>
                    Visualize erros que ocorreram durante o processamento de webhooks e transações de saque.
                </CardDescription>
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
                        <p className="text-muted-foreground">Nenhum log de erro encontrado.</p>
                    </div>
                ) : (
                    <Accordion type="single" collapsible className="w-full">
                        {logs.map((log) => (
                             <AccordionItem value={log.id} key={log.id}>
                                <AccordionTrigger>
                                    <div className="flex justify-between items-center w-full pr-4">
                                        <div className="flex items-center gap-4">
                                            <Badge variant={getTypeVariant(log.type)}>{getTypeLabel(log.type)}</Badge>
                                            <span className='text-sm text-muted-foreground'>{formatDate(log.createdAt)}</span>
                                        </div>
                                        <p className="font-mono text-xs text-left truncate flex-1 mx-4">{log.error}</p>
                                        <Badge variant={log.resolved ? 'secondary' : 'destructive'}>
                                            {log.resolved ? 'Resolvido' : 'Pendente'}
                                        </Badge>
                                    </div>
                                </AccordionTrigger>
                                <AccordionContent>
                                    <pre className="bg-secondary/50 p-4 rounded-md text-xs overflow-x-auto">
                                        {JSON.stringify(log.webhookData, null, 2)}
                                    </pre>
                                </AccordionContent>
                            </AccordionItem>
                        ))}
                    </Accordion>
                )}
            </CardContent>
        </Card>
    );
}
