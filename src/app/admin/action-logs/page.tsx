
'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getAdminLogs, AdminLog } from './actions';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RefreshCw, User, Shield } from 'lucide-react';
import Link from 'next/link';

export default function AdminActionLogsPage() {
    const [logs, setLogs] = useState<AdminLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchLogs = async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await getAdminLogs();
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
    
    const getStatusVariant = (status: string) => {
        if (status === 'ERROR') return 'destructive';
        if (status === 'SUCCESS') return 'default';
        return 'secondary';
    }


    return (
        <Card>
            <CardHeader>
                <div className="flex justify-between items-center">
                    <div>
                        <CardTitle>Logs de Ações Administrativas</CardTitle>
                        <CardDescription>
                            Visualize o histórico de ações realizadas pelos administradores no painel.
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
                        <Shield className="mx-auto h-12 w-12 text-muted-foreground" />
                        <p className="mt-4 text-muted-foreground">Nenhum log de ação administrativa encontrado.</p>
                    </div>
                ) : (
                    <Accordion type="single" collapsible className="w-full">
                        {logs.map((log) => (
                             <AccordionItem value={log.id} key={log.id}>
                                <AccordionTrigger>
                                    <div className="flex justify-between items-center w-full pr-4">
                                        <div className="flex flex-col text-left space-y-1">
                                            <span className='font-bold text-sm'>{log.action}</span>
                                            <span className='text-xs text-muted-foreground'>{formatDate(log.timestamp)}</span>
                                        </div>
                                        <div className='flex items-center gap-4'>
                                            <div className="flex flex-col items-end text-xs">
                                                <span className='text-muted-foreground'>Admin</span>
                                                <Link href={`/admin/users/${log.adminId}`} className="font-mono hover:underline">{log.adminId.slice(0,8)}...</Link>
                                            </div>
                                             <div className="flex flex-col items-end text-xs">
                                                <span className='text-muted-foreground'>Usuário Alvo</span>
                                                <Link href={`/admin/users/${log.targetUserId}`} className="font-mono hover:underline">{log.targetUserId.slice(0,8)}...</Link>
                                            </div>
                                            <Badge variant={getStatusVariant(log.status)}>{log.status}</Badge>
                                        </div>
                                    </div>
                                </AccordionTrigger>
                                <AccordionContent>
                                    <pre className="bg-secondary/50 p-4 rounded-md text-xs overflow-x-auto">
                                        {JSON.stringify(log.details, null, 2)}
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
