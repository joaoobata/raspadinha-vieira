'use client';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { MoreHorizontal, Percent, User, Shield, Crown, Gift, Calendar as CalendarIcon, FilterX, Trash2, Users, UserCog, Search } from "lucide-react";
import Link from 'next/link';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from '@/components/ui/input';
import { Skeleton } from "@/components/ui/skeleton";
import { getUsers, updateUserStatus, UserData, deleteUser, searchUsers } from './actions';
import { useToast } from '@/hooks/use-toast';
import { EditBalanceDialog } from './EditBalanceDialog';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '@/lib/firebase';
import { useDebounce } from 'use-debounce';

export default function AdminUsersPage() {
    const [adminUser] = useAuthState(auth);
    const { toast } = useToast();
    const [users, setUsers] = useState<UserData[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [banAlertInfo, setBanAlertInfo] = useState<{ isOpen: boolean; user: UserData | null }>({ isOpen: false, user: null });
    const [deleteAlertInfo, setDeleteAlertInfo] = useState<{ isOpen: boolean; user: UserData | null }>({ isOpen: false, user: null });
    const [editBalanceInfo, setEditBalanceInfo] = useState<{ isOpen: boolean; user: UserData | null }>({ isOpen: false, user: null });
    
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearchTerm] = useDebounce(searchTerm, 500);

    const fetchInitialUsers = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const usersResult = await getUsers(); // Gets the initial, latest users
            if (usersResult.success && usersResult.data) {
                setUsers(usersResult.data);
            } else {
                setError(usersResult.error || 'Falha ao carregar usuários.');
            }
        } catch (err: any) {
             setError('Ocorreu um erro inesperado.');
        } finally {
            setLoading(false);
        }
    }, []);

    const performSearch = useCallback(async (term: string) => {
        if (!term) {
            fetchInitialUsers();
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const result = await searchUsers(term);
            if (result.success && result.data) {
                setUsers(result.data);
            } else {
                setError(result.error || 'Falha na busca.');
                setUsers([]);
            }
        } catch(e) {
            setError('Ocorreu um erro inesperado na busca.');
            setUsers([]);
        } finally {
            setLoading(false);
        }
    }, [fetchInitialUsers]);

    useEffect(() => {
        performSearch(debouncedSearchTerm);
    }, [debouncedSearchTerm, performSearch]);
    
    useEffect(() => {
        // Load initial users when component mounts
        fetchInitialUsers();
    }, [fetchInitialUsers]);
    
    const handleUpdateStatus = async () => {
        if (!banAlertInfo.user || !adminUser) return;
        
        const newStatus = banAlertInfo.user.status === 'active' ? 'banned' : 'active';
        const result = await updateUserStatus(banAlertInfo.user.id, newStatus, adminUser.uid);

        if (result.success) {
            toast({ title: "Sucesso!", description: `Usuário ${newStatus === 'banned' ? 'banido' : 'reativado'} com sucesso.` });
            performSearch(debouncedSearchTerm);
        } else {
            toast({ variant: "destructive", title: "Erro!", description: result.error });
        }
        setBanAlertInfo({ isOpen: false, user: null });
    };

    const handleDeleteUser = async () => {
        if (!deleteAlertInfo.user || !adminUser) return;
        
        const result = await deleteUser(deleteAlertInfo.user.id, adminUser.uid);

        if (result.success) {
            toast({ title: "Sucesso!", description: `Usuário ${deleteAlertInfo.user.firstName} foi excluído permanentemente.` });
             performSearch(debouncedSearchTerm);
        } else {
            toast({ variant: "destructive", title: "Erro!", description: result.error });
        }
        setDeleteAlertInfo({ isOpen: false, user: null });
    };

    const formatCurrency = (value: number) => {
        return (value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }

    const formatDate = (dateString: string | null | undefined) => {
        if (!dateString) return '-';
        try {
            return new Date(dateString).toLocaleDateString('pt-BR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
            });
        } catch (e) {
            return '-';
        }
    }
    
    const getRoleBadges = (roles: UserData['roles']) => {
        if (!roles || roles.length === 0) {
            return <Badge variant="secondary"><User className="h-3 w-3 mr-1" /> Padrão</Badge>;
        }
        return (
            <div className="flex flex-wrap gap-1">
                {roles.includes('admin') && <Badge variant="destructive"><Crown className="h-3 w-3 mr-1" /> Admin</Badge>}
                {roles.includes('influencer') && <Badge className="bg-purple-500 hover:bg-purple-600"><Shield className="h-3 w-3 mr-1" /> Influencer</Badge>}
                {roles.includes('afiliado') && <Badge className="bg-blue-500 hover:bg-blue-600"><UserCog className="h-3 w-3 mr-1" /> Afiliado</Badge>}
            </div>
        );
    };


    const renderSkeleton = () => (
        Array.from({ length: 10 }).map((_, i) => (
            <TableRow key={i}>
                <TableCell><Skeleton className="h-10 w-full" /></TableCell>
                <TableCell><Skeleton className="h-10 w-full" /></TableCell>
                <TableCell><Skeleton className="h-10 w-full" /></TableCell>
                <TableCell><Skeleton className="h-10 w-full" /></TableCell>
                <TableCell><Skeleton className="h-10 w-full" /></TableCell>
                <TableCell><Skeleton className="h-10 w-full" /></TableCell>
                <TableCell className="hidden sm:table-cell"><Skeleton className="h-10 w-full" /></TableCell>
                <TableCell><Skeleton className="h-8 w-8" /></TableCell>
            </TableRow>
        ))
    );

    return (
        <>
            <Card>
                <CardHeader>
                    <CardTitle>Usuários</CardTitle>
                    <CardDescription>
                        Visualize e gerencie os usuários da plataforma. A busca é feita por nome, sobrenome ou email.
                    </CardDescription>
                    <div className="flex items-center gap-2 pt-4">
                        <div className="relative flex-grow">
                             <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                            <Input 
                                placeholder="Pesquisar usuários..." 
                                className="pl-10"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Usuário</TableHead>
                                <TableHead>Cargos</TableHead>
                                <TableHead>Indicado Por</TableHead>
                                <TableHead>Indicados (N1)</TableHead>
                                <TableHead>Saldo</TableHead>
                                <TableHead>Data de Cadastro</TableHead>
                                <TableHead>
                                    <span className="sr-only">Ações</span>
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                             {loading ? (
                                renderSkeleton()
                            ) : error ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="h-24 text-center text-destructive">
                                        {error}
                                    </TableCell>
                                </TableRow>
                            ) : users.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="h-24 text-center">
                                        {debouncedSearchTerm ? `Nenhum usuário encontrado para "${debouncedSearchTerm}".` : "Nenhum usuário encontrado."}
                                    </TableCell>
                                </TableRow>
                            ) : (
                                users.map((user) => (
                                    <TableRow key={user.id} className={user.status === 'banned' ? 'opacity-50' : ''}>
                                        <TableCell>
                                            <div className="font-medium">{user.firstName} {user.lastName}</div>
                                            <div className="text-sm text-muted-foreground">{user.email}</div>
                                        </TableCell>
                                        <TableCell>
                                            {getRoleBadges(user.roles)}
                                        </TableCell>
                                         <TableCell>
                                            {user.referredByName ? (
                                                 <Button variant="link" asChild className="p-0 h-auto text-xs">
                                                    <Link href={`/admin/users/${user.referredBy}`}>
                                                        {user.referredByName}
                                                    </Link>
                                                </Button>
                                            ) : (
                                                <span className="text-xs text-muted-foreground">-</span>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <Users className="h-4 w-4 text-muted-foreground" />
                                                <span className="font-semibold">{user.l1ReferralCount}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell>{formatCurrency(user.balance)}</TableCell>
                                        <TableCell>{formatDate(user.createdAt)}</TableCell>
                                        <TableCell>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button aria-haspopup="true" size="icon" variant="ghost">
                                                        <MoreHorizontal className="h-4 w-4" />
                                                        <span className="sr-only">Toggle menu</span>
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuLabel>Ações</DropdownMenuLabel>
                                                    <DropdownMenuItem asChild>
                                                        <Link href={`/admin/users/${user.id}`}>Ver Detalhes</Link>
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => setEditBalanceInfo({ isOpen: true, user })}>Editar Saldo</DropdownMenuItem>
                                                    <DropdownMenuItem
                                                        onClick={() => setBanAlertInfo({ isOpen: true, user })}
                                                        className={user.status === 'active' ? "" : "text-green-400 focus:bg-green-500/10 focus:text-green-400"}
                                                    >
                                                        {user.status === 'active' ? 'Banir Usuário' : 'Reativar Usuário'}
                                                    </DropdownMenuItem>
                                                    <DropdownMenuSeparator />
                                                    <DropdownMenuItem 
                                                        onClick={() => setDeleteAlertInfo({ isOpen: true, user })} 
                                                        className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                                                    >
                                                        <Trash2 className="mr-2 h-4 w-4" />
                                                        Excluir Usuário
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
                <CardFooter>
                    <div className="text-xs text-muted-foreground">
                        Mostrando <strong>{users.length}</strong> usuários
                    </div>
                </CardFooter>
            </Card>

            <AlertDialog open={banAlertInfo.isOpen} onOpenChange={(isOpen) => setBanAlertInfo({ ...banAlertInfo, isOpen })}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Você tem certeza?</AlertDialogTitle>
                        <AlertDialogDescription>
                            {`Você está prestes a ${banAlertInfo.user?.status === 'active' ? 'banir' : 'reativar'} o usuário ${banAlertInfo.user?.firstName} ${banAlertInfo.user?.lastName}.`}
                            {banAlertInfo.user?.status === 'active' 
                                ? ' O usuário não poderá mais acessar a conta.' 
                                : ' O usuário poderá acessar a conta novamente.'}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setBanAlertInfo({ isOpen: false, user: null })}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={handleUpdateStatus} className={banAlertInfo.user?.status === 'active' ? 'bg-destructive hover:bg-destructive/90' : 'bg-green-600 hover:bg-green-700'}>
                            Confirmar
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
            
            <AlertDialog open={deleteAlertInfo.isOpen} onOpenChange={(isOpen) => setDeleteAlertInfo({ ...deleteAlertInfo, isOpen })}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Excluir Usuário Permanentemente?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Esta ação não pode ser desfeita. Isso excluirá permanentemente o usuário <strong>{deleteAlertInfo.user?.firstName} {deleteAlertInfo.user?.lastName}</strong> e todos os seus dados de autenticação. Os registros históricos (transações, etc.) serão mantidos, mas o acesso será removido para sempre.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setDeleteAlertInfo({ isOpen: false, user: null })}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeleteUser} className="bg-destructive hover:bg-destructive/90">
                            Sim, Excluir Usuário
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {editBalanceInfo.user && adminUser && (
                <EditBalanceDialog
                    isOpen={editBalanceInfo.isOpen}
                    onOpenChange={(isOpen) => setEditBalanceInfo({ isOpen, user: isOpen ? editBalanceInfo.user : null })}
                    user={editBalanceInfo.user as UserData}
                    onBalanceUpdate={() => performSearch(debouncedSearchTerm)}
                    adminId={adminUser.uid}
                />
            )}
        </>
    );
}
