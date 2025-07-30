
'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { getWithdrawals, processWithdrawal } from './actions';
import { Button } from '@/components/ui/button';
import { MoreHorizontal, LoaderCircle, Check, X } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import Link from 'next/link';

interface Withdrawal {
    id: string;
    userId: string;
    userName: string;
    amount: number;
    status: 'PENDING' | 'APPROVED' | 'COMPLETED' | 'REJECTED' | 'FAILED';
    pixKeyType: string;
    pixKey: string;
    createdAt: string | null;
    updatedAt?: string | null;
    completedAt?: string | null;
}

export default function AdminWithdrawalsPage() {
    const { toast } = useToast();
    const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [processingId, setProcessingId] = useState<string | null>(null);

    const [alertInfo, setAlertInfo] = useState<{
        isOpen: boolean;
        withdrawalId: string | null;
        action: 'approve' | 'reject';
    }>({ isOpen: false, withdrawalId: null, action: 'approve' });

    const fetchWithdrawals = async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await getWithdrawals();
            if (result.success && result.data) {
                setWithdrawals(result.data as Withdrawal[]);
            } else {
                setError(result.error || 'Falha ao buscar saques.');
            }
        } catch (err: any) {
            console.error(err);
            setError('Ocorreu um erro inesperado ao buscar os dados.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchWithdrawals();
    }, []);
    
    const handleProcessWithdrawal = async () => {
        if (!alertInfo.withdrawalId) return;

        setProcessingId(alertInfo.withdrawalId);
        const result = await processWithdrawal(alertInfo.withdrawalId, alertInfo.action);
        
        if (result.success) {
            toast({
                title: 'Sucesso!',
                description: `Saque ${alertInfo.action === 'approve' ? 'aprovado' : 'rejeitado'} e processado.`,
            });
            fetchWithdrawals(); // Refresh the list
        } else {
            toast({
                variant: 'destructive',
                title: 'Erro!',
                description: result.error || 'Não foi possível processar o saque.',
            });
        }
        setProcessingId(null);
        setAlertInfo({ isOpen: false, withdrawalId: null, action: 'approve' });
    };

    const openConfirmationDialog = (id: string, action: 'approve' | 'reject') => {
        setAlertInfo({ isOpen: true, withdrawalId: id, action });
    };

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

    const getStatusVariant = (status: Withdrawal['status']) => {
        switch (status) {
            case 'COMPLETED': return 'default';
            case 'PENDING': return 'secondary';
            case 'REJECTED':
            case 'FAILED': return 'destructive';
            case 'APPROVED': return 'outline'; // A temporary state
            default: return 'outline';
        }
    }

    return (
        <>
        <Card>
            <CardHeader>
                <CardTitle>Saques</CardTitle>
                <CardDescription>
                    Visualize e gerencie todas as solicitações de saque da plataforma.
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
                ) : withdrawals.length === 0 ? (
                     <div className="text-center py-10">
                        <p className="text-muted-foreground">Nenhuma solicitação de saque encontrada.</p>
                    </div>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Status</TableHead>
                                <TableHead>Usuário</TableHead>
                                <TableHead>Valor</TableHead>
                                <TableHead className="hidden lg:table-cell">Chave PIX</TableHead>
                                <TableHead>Data de Criação</TableHead>
                                <TableHead>Ações</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {withdrawals.map((tx) => (
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
                                    <TableCell className="hidden lg:table-cell">
                                        <span className='font-mono text-xs'>{tx.pixKey} ({tx.pixKeyType.toUpperCase()})</span>
                                    </TableCell>
                                    <TableCell>{formatDate(tx.createdAt)}</TableCell>
                                    <TableCell>
                                         {tx.status === 'PENDING' ? (
                                            processingId === tx.id ? (
                                                <LoaderCircle className='h-4 w-4 animate-spin' />
                                            ) : (
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon">
                                                        <MoreHorizontal className="h-4 w-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent>
                                                    <DropdownMenuItem onClick={() => openConfirmationDialog(tx.id, 'approve')}>
                                                        <Check className="mr-2 h-4 w-4" /> Aprovar
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => openConfirmationDialog(tx.id, 'reject')} className="text-destructive focus:text-destructive">
                                                        <X className="mr-2 h-4 w-4" /> Rejeitar
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                            )
                                        ) : (
                                            <span>-</span>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </CardContent>
        </Card>
        <AlertDialog open={alertInfo.isOpen} onOpenChange={(isOpen) => setAlertInfo({ ...alertInfo, isOpen })}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Você tem certeza?</AlertDialogTitle>
                    <AlertDialogDescription>
                       {alertInfo.action === 'approve'
                           ? "Você está prestes a aprovar este saque. A transferência será enviada para o gateway de pagamento."
                           : "Você está prestes a rejeitar este saque. O valor será estornado para o saldo do usuário."
                       }
                       <br/><br/>
                       Esta ação não pode ser desfeita.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => setAlertInfo({isOpen: false, withdrawalId: null, action: 'approve' })}>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={handleProcessWithdrawal}>
                        Confirmar
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
        </>
    );
}
