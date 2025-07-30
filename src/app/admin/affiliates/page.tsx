// HMR fix
'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { getAffiliateStats, AffiliateStat } from './actions';
import { Users, DollarSign, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function AdminAffiliatesPage() {
    const [stats, setStats] = useState<AffiliateStat[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchStats = async () => {
            setLoading(true);
            setError(null);
            try {
                const result = await getAffiliateStats();
                if (result.success && result.data) {
                    setStats(result.data);
                } else {
                    setError(result.error || 'Falha ao buscar estatísticas de afiliados.');
                }
            } catch (err: any) {
                console.error(err);
                setError('Ocorreu um erro inesperado ao buscar os dados.');
            } finally {
                setLoading(false);
            }
        };

        fetchStats();
    }, []);

    const formatCurrency = (value: number) => {
        return (value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    };

    const renderSkeleton = () => (
        Array.from({ length: 5 }).map((_, i) => (
            <TableRow key={i}>
                <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                <TableCell><Skeleton className="h-8 w-24" /></TableCell>
            </TableRow>
        ))
    );

    return (
        <Card>
            <CardHeader>
                <CardTitle>Desempenho dos Afiliados</CardTitle>
                <CardDescription>
                    Visualize a performance de cada afiliado, incluindo o lucro gerado para a plataforma (GGR - comissões).
                </CardDescription>
            </CardHeader>
            <CardContent>
                {loading ? (
                    <Table>
                        <TableHeader>
                           <TableRow>
                                <TableHead>Afiliado</TableHead>
                                <TableHead><Users className="h-4 w-4 inline-block mr-1" /> Indicados Ativos</TableHead>
                                <TableHead><DollarSign className="h-4 w-4 inline-block mr-1" /> Total Depositado</TableHead>
                                <TableHead><TrendingUp className="h-4 w-4 inline-block mr-1" /> Lucro da Casa</TableHead>
                                <TableHead>Ações</TableHead>
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
                ) : stats.length === 0 ? (
                    <div className="text-center py-10">
                        <p className="text-muted-foreground">Nenhum dado de afiliado com indicados ativos encontrado.</p>
                    </div>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Afiliado</TableHead>
                                <TableHead><Users className="h-4 w-4 inline-block mr-1" /> Indicados Ativos</TableHead>
                                <TableHead><DollarSign className="h-4 w-4 inline-block mr-1" /> Total Depositado</TableHead>
                                <TableHead><TrendingUp className="h-4 w-4 inline-block mr-1" /> Lucro da Casa</TableHead>
                                <TableHead>Ações</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {stats.map((stat) => (
                                <TableRow key={stat.id}>
                                    <TableCell className="font-medium">{stat.name}</TableCell>
                                    <TableCell>{stat.referralCount}</TableCell>
                                    <TableCell>{formatCurrency(stat.referralDepositTotal)}</TableCell>
                                    <TableCell className={`font-semibold ${stat.houseProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                        {formatCurrency(stat.houseProfit)}
                                    </TableCell>
                                    <TableCell>
                                        <Button asChild variant="outline" size="sm">
                                            <Link href={`/admin/users/${stat.id}`}>Ver Detalhes</Link>
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </CardContent>
        </Card>
    );
}
