
'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '@/lib/firebase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { getWithdrawalHistory, WithdrawalHistoryEntry } from './actions';
import { Button } from '@/components/ui/button';
import { RotateCw, User as UserIcon } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface UserAccountData {
    rolloverRequirement: number;
    rolloverProgress: number;
}


export default function AccountPage() {
    const [user] = useAuthState(auth);
    const [accountData, setAccountData] = useState<UserAccountData | null>(null);
    const [withdrawalHistory, setWithdrawalHistory] = useState<WithdrawalHistoryEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchAllData = useCallback(async () => {
        if (user) {
            setLoading(true);
            const historyResult = await getWithdrawalHistory(user.uid);
            
            if (historyResult.success && historyResult.data) {
                setWithdrawalHistory(historyResult.data);
            } else {
                 setError(prev => prev ? `${prev} | ${historyResult.error}` : historyResult.error || 'Falha ao carregar histórico de saques.');
            }

            // User data with rollover will be fetched by the real-time listener
        }
    }, [user]);
    
    // Real-time listener for user data
    useEffect(() => {
        if (user) {
            const userDocRef = doc(db, 'users', user.uid);
            const unsubscribe = onSnapshot(userDocRef, (doc) => {
                if (doc.exists()) {
                    const data = doc.data();
                    setAccountData({
                        rolloverRequirement: data.rolloverRequirement || 0,
                        rolloverProgress: data.rolloverProgress || 0,
                    });
                }
                setLoading(false);
            }, (error) => {
                console.error("Error fetching real-time user data:", error);
                setError('Falha ao carregar dados da conta em tempo real.');
                setLoading(false);
            });
            
            // Fetch non-real-time data
            fetchAllData();

            return () => unsubscribe();
        } else {
             setLoading(false);
        }
    }, [user, fetchAllData]);
    
    
    const formatCurrency = (value: number) => {
        return (value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }
    
    const rolloverPercentage = accountData?.rolloverRequirement 
        ? Math.min(100, ((accountData.rolloverProgress || 0) / accountData.rolloverRequirement) * 100) 
        : 100;
        
    const getWithdrawalStatusVariant = (status: WithdrawalHistoryEntry['status']) => {
        switch (status) {
            case 'COMPLETED': return 'default';
            case 'PENDING': return 'secondary';
            case 'REJECTED':
            case 'FAILED': return 'destructive';
            case 'APPROVED': return 'outline';
            default: return 'outline';
        }
    }
    const formatDate = (dateString: string | null | undefined) => {
        if (!dateString) return '-';
        try {
            return new Date(dateString).toLocaleString('pt-BR');
        } catch (e) {
            return '-';
        }
    }
    
    const renderWithdrawalTable = (withdrawals: WithdrawalHistoryEntry[]) => {
        if (withdrawals.length === 0) {
            return <p className="text-center text-muted-foreground py-4">Nenhum saque solicitado ainda.</p>;
        }
        return (
             <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Data</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Chave PIX</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {withdrawals.map(w => (
                        <TableRow key={w.id}>
                            <TableCell className="text-muted-foreground">{formatDate(w.createdAt)}</TableCell>
                            <TableCell><Badge variant={getWithdrawalStatusVariant(w.status)}>{w.status}</Badge></TableCell>
                            <TableCell>{w.pixKey}</TableCell>
                            <TableCell className="text-right font-bold">{formatCurrency(w.amount)}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        )
    }

    return (
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="mb-8">
                <h1 className="text-3xl font-bold">Minha Conta</h1>
                <p className="text-muted-foreground">Acompanhe seu progresso de apostas e histórico de saques.</p>
            </div>

             {error && (
                <div className="mb-4 text-center py-4 px-2 bg-destructive/10 text-destructive border border-destructive/20 rounded-lg">
                    <p><strong>Erro:</strong> {error}</p>
                </div>
            )}
            
            <div className="mt-6 space-y-6">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><RotateCw /> Rollover</CardTitle>
                            <CardDescription>Você precisa apostar um certo valor para poder realizar saques. Acompanhe seu progresso aqui.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {loading ? <Skeleton className="h-20 w-full" /> : (
                            <div>
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-sm text-muted-foreground">Progresso</span>
                                    <span className="text-sm font-bold text-primary">{rolloverPercentage.toFixed(2)}%</span>
                                </div>
                                <Progress value={rolloverPercentage} />
                                <div className="flex justify-between items-center mt-2 text-xs text-muted-foreground">
                                    <span>{formatCurrency(accountData?.rolloverProgress || 0)}</span>
                                    <span>{formatCurrency(accountData?.rolloverRequirement || 0)}</span>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle>Histórico de Saques</CardTitle>
                        <CardDescription>Acompanhe suas solicitações de saque.</CardDescription>
                    </CardHeader>
                        <CardContent>
                            {loading ? <Skeleton className="h-40 w-full" /> : renderWithdrawalTable(withdrawalHistory)}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
