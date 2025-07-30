
'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { getTransactions } from './actions';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

interface Transaction {
    id: string;
    userId: string;
    userName: string; // Added userName
    amount: number;
    status: 'PENDING' | 'COMPLETED' | 'FAILED';
    createdAt: string | null;
    paidAt?: string | null;
}

export default function AdminDepositsPage() {
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchTransactions = async () => {
            setLoading(true);
            setError(null);
            try {
                const result = await getTransactions();
                if (result.success && result.data) {
                    setTransactions(result.data as Transaction[]);
                } else {
                    setError(result.error || 'Falha ao buscar transações.');
                }
            } catch (err: any) {
                console.error(err);
                setError('Ocorreu um erro inesperado ao buscar os dados.');
            } finally {
                setLoading(false);
            }
        };

        fetchTransactions();
    }, []);
    
    const formatCurrency = (value: number) => {
        return (value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }

    const formatDate = (dateString: string | null | undefined) => {
        if (!dateString) return '-';
        try {
            return new Date(dateString).toLocaleString('pt-BR');
        } catch (e) {
            return '-';
        }
    }

    const getStatusVariant = (status: Transaction['status']) => {
        switch (status) {
            case 'COMPLETED':
                return 'default';
            case 'PENDING':
                return 'secondary';
            case 'FAILED':
                return 'destructive';
            default:
                return 'outline';
        }
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Depósitos</CardTitle>
                <CardDescription>
                    Visualize todas as transações de depósito realizadas na plataforma.
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
                ) : transactions.length === 0 ? (
                     <div className="text-center py-10">
                        <p className="text-muted-foreground">Nenhuma transação encontrada.</p>
                    </div>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Status</TableHead>
                                <TableHead>Usuário</TableHead>
                                <TableHead>Valor</TableHead>
                                <TableHead className="hidden md:table-cell">ID da Transação</TableHead>
                                <TableHead>Data de Criação</TableHead>
                                <TableHead>Data de Pagamento</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {transactions.map((tx) => (
                                <TableRow key={tx.id}>
                                    <TableCell>
                                        <Badge variant={getStatusVariant(tx.status)}>
                                            {tx.status}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        <Button variant="link" asChild className="p-0 h-auto font-medium">
                                            <Link href={`/admin/users/${tx.userId}`}>
                                                {tx.userName}
                                            </Link>
                                        </Button>
                                    </TableCell>
                                    <TableCell className="font-medium">{formatCurrency(tx.amount)}</TableCell>
                                    <TableCell className="hidden md:table-cell font-mono text-xs">{tx.id}</TableCell>
                                    <TableCell>{formatDate(tx.createdAt)}</TableCell>
                                    <TableCell>{formatDate(tx.paidAt)}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </CardContent>
        </Card>
    );
}
