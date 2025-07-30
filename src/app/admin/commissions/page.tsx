
'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { getCommissionLogs, CommissionLog } from './actions';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Handshake } from 'lucide-react';

export default function AdminCommissionsPage() {
    const [logs, setLogs] = useState<CommissionLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchLogs = async () => {
            setLoading(true);
            setError(null);
            try {
                const result = await getCommissionLogs();
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

        fetchLogs();
    }, []);
    
    const formatCurrency = (value: number) => {
        return (value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }

    const formatPercentage = (value: number) => {
        return `${((value || 0) * 100).toFixed(2)}%`;
    }

    const formatDate = (dateString: string | null | undefined) => {
        if (!dateString) return '-';
        try {
            return new Date(dateString).toLocaleString('pt-BR');
        } catch (e) {
            return '-';
        }
    }
    
    const renderSkeleton = () => (
        Array.from({ length: 10 }).map((_, i) => (
            <TableRow key={i}>
                <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                <TableCell><Skeleton className="h-4 w-20" /></TableCell>
            </TableRow>
        ))
    );

    return (
        <Card>
            <CardHeader>
                <CardTitle>Histórico de Comissões</CardTitle>
                <CardDescription>
                    Visualize todas as comissões pagas aos afiliados da plataforma com base nos depósitos.
                </CardDescription>
            </CardHeader>
            <CardContent>
                {loading ? (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Data</TableHead>
                                <TableHead>Afiliado</TableHead>
                                <TableHead>Indicado</TableHead>
                                <TableHead>Nível</TableHead>
                                <TableHead>Valor do Depósito</TableHead>
                                <TableHead>% Aplicada</TableHead>
                                <TableHead>Comissão Paga</TableHead>
                            </TableRow>
                        </TableHeader>
                         <TableBody>
                            {renderSkeleton()}
                        </TableBody>
                    </Table>
                ) : error ? (
                    <div className="text-center py-10 text-destructive">
                        <p>Erro: {error}</p>
                    </div>
                ) : logs.length === 0 ? (
                     <div className="text-center py-10">
                        <Handshake className="mx-auto h-12 w-12 text-muted-foreground" />
                        <p className="mt-4 text-muted-foreground">Nenhuma comissão registrada ainda.</p>
                    </div>
                ) : (
                    <Table>
                        <TableHeader>
                           <TableRow>
                                <TableHead>Data</TableHead>
                                <TableHead>Afiliado</TableHead>
                                <TableHead>Indicado</TableHead>
                                <TableHead>Nível</TableHead>
                                <TableHead className="text-right">Valor do Depósito</TableHead>
                                <TableHead className="text-right">% Aplicada</TableHead>
                                <TableHead className="text-right">Comissão Paga</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {logs.map((log) => (
                                <TableRow key={log.id}>
                                    <TableCell className="text-xs text-muted-foreground">{formatDate(log.createdAt)}</TableCell>
                                    <TableCell>
                                        <Button variant="link" asChild className="p-0 h-auto font-medium">
                                            <Link href={`/admin/users/${log.affiliateId}`}>
                                                {log.affiliateName}
                                            </Link>
                                        </Button>
                                    </TableCell>
                                    <TableCell>
                                         <Button variant="link" asChild className="p-0 h-auto font-medium text-muted-foreground">
                                            <Link href={`/admin/users/${log.referredUserId}`}>
                                                {log.referredUserName}
                                            </Link>
                                        </Button>
                                    </TableCell>
                                     <TableCell>
                                        <Badge variant="secondary">{log.level}º Nível</Badge>
                                    </TableCell>
                                    <TableCell className="text-right">{formatCurrency(log.depositAmount)}</TableCell>
                                    <TableCell className="text-right text-blue-400">{formatPercentage(log.commissionRate)}</TableCell>
                                    <TableCell className="text-right font-bold text-green-400">{formatCurrency(log.commissionEarned)}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </CardContent>
        </Card>
    );
}
