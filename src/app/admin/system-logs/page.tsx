
'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getSystemLogs, SystemLog } from './actions';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RefreshCw, User, Shield, Server, FileText, Gift, LogIn, UserPlus } from 'lucide-react';
import Link from 'next/link';

export default function AdminSystemLogsPage() {
    const [logs, setLogs] = useState<SystemLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchLogs = async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await getSystemLogs();
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
    
    const getActionConfig = (action: string) => {
        switch (action) {
            case 'USER_LOGIN':
                return { variant: 'default', icon: LogIn, label: 'Login de Usuário' };
            case 'USER_SIGNUP':
                return { variant: 'default', icon: UserPlus, label: 'Cadastro de Usuário' };
            case 'SCRATCHCARD_PLAY':
                return { variant: 'secondary', icon: Gift, label: 'Jogada de Raspadinha' };
            case 'REWARD_SCRATCHCARD_PLAY':
                return { variant: 'outline', icon: Gift, label: 'Recompensa Jogada' };
            default:
                return { variant: 'outline', icon: FileText, label: action };
        }
    }


    return (
        <Card>
            <CardHeader>
                <div className="flex justify-between items-center">
                    <div>
                        <CardTitle>Logs do Sistema</CardTitle>
                        <CardDescription>
                            Visualize eventos importantes como logins, cadastros e jogadas.
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
                        <FileText className="mx-auto h-12 w-12 text-muted-foreground" />
                        <p className="mt-4 text-muted-foreground">Nenhum log do sistema encontrado.</p>
                    </div>
                ) : (
                    <Accordion type="single" collapsible className="w-full">
                        {logs.map((log) => {
                            const actionConfig = getActionConfig(log.action);
                            const Icon = actionConfig.icon;
                            return (
                                <AccordionItem value={log.id} key={log.id}>
                                <AccordionTrigger>
                                    <div className="flex justify-between items-center w-full pr-4">
                                        <div className="flex items-center gap-4">
                                            <Badge variant={actionConfig.variant} className="w-48 justify-center">
                                                <Icon className="mr-2 h-4 w-4" />
                                                {actionConfig.label}
                                            </Badge>
                                            <span className='text-xs text-muted-foreground'>{formatDate(log.timestamp)}</span>
                                        </div>
                                        <div className='flex items-center gap-4'>
                                            <div className="flex flex-col items-end text-xs">
                                                <span className='text-muted-foreground'>Ator</span>
                                                {log.actorType === 'user' && log.actorId ? (
                                                     <Link href={`/admin/users/${log.actorId}`} className="font-mono hover:underline">{log.actorId.slice(0,8)}...</Link>
                                                ) : (
                                                    <span className="font-mono">{log.actorType}</span>
                                                )}
                                            </div>
                                            <Badge variant={log.status === 'SUCCESS' ? 'default' : 'destructive'}>{log.status}</Badge>
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
