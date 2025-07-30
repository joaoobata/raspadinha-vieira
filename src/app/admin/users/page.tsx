
'use client';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { MoreHorizontal, Percent, User, Shield, Crown, Gift, Calendar as CalendarIcon, FilterX, Trash2, Users } from "lucide-react";
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
import { getUsers, updateUserStatus, UserData, deleteUser } from './actions';
import { useToast } from '@/hooks/use-toast';
import { EditBalanceDialog } from './EditBalanceDialog';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '@/lib/firebase';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { DateRange } from 'react-day-picker';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calendar } from '@/components/ui/calendar';
import { getSettings } from '../settings/actions';
import { useDebounce } from 'use-debounce';

export default function AdminUsersPage() {
    const [adminUser] = useAuthState(auth);
    const { toast } = useToast();
    const [allUsers, setAllUsers] = useState<UserData[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [banAlertInfo, setBanAlertInfo] = useState<{ isOpen: boolean; user: UserData | null }>({ isOpen: false, user: null });
    const [deleteAlertInfo, setDeleteAlertInfo] = useState<{ isOpen: boolean; user: UserData | null }>({ isOpen: false, user: null });
    const [editBalanceInfo, setEditBalanceInfo] = useState<{ isOpen: boolean; user: UserData | null }>({ isOpen: false, user: null });
    const [globalCommissionRate, setGlobalCommissionRate] = useState<number>(10);
    
    // Filter states
    const [searchTerm, setSearchTerm] = useState('');
    const [dateRange, setDateRange] = useState<DateRange | undefined>();

    const fetchUsers = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [usersResult, settingsResult] = await Promise.all([
                getUsers(),
                getSettings()
            ]);

            if (usersResult.success && usersResult.data) {
                setAllUsers(usersResult.data);
            } else {
                setError(usersResult.error || 'Falha ao carregar usuários.');
            }

            if (settingsResult.success && settingsResult.data?.commissionRateL1) {
                setGlobalCommissionRate(settingsResult.data.commissionRateL1);
            }

        } catch (err: any) {
             setError('Ocorreu um erro inesperado.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);
    
    const filteredUsers = useMemo(() => {
        let users = [...allUsers];

        if (searchTerm) {
            const termLower = searchTerm.toLowerCase();
            users = users.filter(user =>
                user.firstName.toLowerCase().includes(termLower) ||
                user.lastName.toLowerCase().includes(termLower) ||
                user.email.toLowerCase().includes(termLower) ||
                (user.phone || '').includes(termLower) ||
                (user.firstName + ' ' + user.lastName).toLowerCase().includes(termLower)
            );
        }

        if (dateRange?.from) {
            users = users.filter(user => user.createdAt && new Date(user.createdAt) >= dateRange.from!);
        }
        if (dateRange?.to) {
            const toDate = new Date(dateRange.to);
            toDate.setHours(23, 59, 59, 999);
            users = users.filter(user => user.createdAt && new Date(user.createdAt) <= toDate);
        }

        return users;
    }, [allUsers, searchTerm, dateRange]);
    
    const clearFilters = () => {
        setSearchTerm('');
        setDateRange(undefined);
    }

    const handleUpdateStatus = async () => {
        if (!banAlertInfo.user || !adminUser) return;
        
        const newStatus = banAlertInfo.user.status === 'active' ? 'banned' : 'active';
        const result = await updateUserStatus(banAlertInfo.user.id, newStatus, adminUser.uid);

        if (result.success) {
            toast({ title: "Sucesso!", description: `Usuário ${newStatus === 'banned' ? 'banido' : 'reativado'} com sucesso.` });
            await fetchUsers(); 
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
            await fetchUsers(); 
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
    
    const getRoleBadge = (role: UserData['role']) => {
        if (role === 'admin') {
            return <Badge variant="destructive"><Crown className="h-3 w-3 mr-1" /> Admin</Badge>;
        }
        if (role === 'influencer') {
            return <Badge className="bg-purple-500 hover:bg-purple-600"><Shield className="h-3 w-3 mr-1" /> Influencer</Badge>;
        }
        return <Badge variant="secondary"><User className="h-3 w-3 mr-1" /> Padrão</Badge>;
    };

    const renderSkeleton = () => (
        Array.from({ length: 5 }).map((_, i) => (
            <TableRow key={i}>
                <TableCell><Skeleton className="h-10 w-10 rounded-full" /></TableCell>
                <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                <TableCell className="hidden sm:table-cell"><Skeleton className="h-4 w-24" /></TableCell>
                <TableCell className="hidden lg:table-cell"><Skeleton className="h-4 w-24" /></TableCell>
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
                        Visualize e gerencie os usuários e afiliados da plataforma.
                    </CardDescription>
                    <div className="flex items-center gap-2 pt-4">
                        <Input 
                            placeholder="Pesquisar por nome, email, telefone..." 
                            className="max-w-sm"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                         />
                        <Popover>
                        <PopoverTrigger asChild>
                            <Button
                            id="date"
                            variant={"outline"}
                            className={cn(
                                "w-[260px] justify-start text-left font-normal",
                                !dateRange && "text-muted-foreground"
                            )}
                            >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {dateRange?.from ? (
                                dateRange.to ? (
                                <>
                                    {format(dateRange.from, "dd/MM/y")} -{" "}
                                    {format(dateRange.to, "dd/MM/y")}
                                </>
                                ) : (
                                format(dateRange.from, "dd/MM/y")
                                )
                            ) : (
                                <span>Filtrar por data</span>
                            )}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                                initialFocus
                                mode="range"
                                defaultMonth={dateRange?.from}
                                selected={dateRange}
                                onSelect={setDateRange}
                                numberOfMonths={2}
                                locale={ptBR}
                            />
                        </PopoverContent>
                        </Popover>
                         {(searchTerm || dateRange) && <Button variant="ghost" onClick={clearFilters}><FilterX className="mr-2" />Limpar</Button>}
                    </div>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Usuário</TableHead>
                                <TableHead>Cargo</TableHead>
                                <TableHead>Indicado Por</TableHead>
                                <TableHead>Comissão L1 (%)</TableHead>
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
                                    <TableCell colSpan={8} className="h-24 text-center text-destructive">
                                        {error}
                                    </TableCell>
                                </TableRow>
                            ) : filteredUsers.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={8} className="h-24 text-center">
                                        Nenhum usuário encontrado com os filtros atuais.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredUsers.map((user) => (
                                    <TableRow key={user.id} className={user.status === 'banned' ? 'opacity-50' : ''}>
                                        <TableCell>
                                            <div className="font-medium">{user.firstName} {user.lastName}</div>
                                            <div className="text-sm text-muted-foreground">{user.email}</div>
                                        </TableCell>
                                        <TableCell>
                                            {getRoleBadge(user.role)}
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
                                            <Badge variant="outline">{user.commissionRate ?? globalCommissionRate}%</Badge>
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
                        Mostrando <strong>{filteredUsers.length}</strong> usuários
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
                    user={editBalanceInfo.user}
                    onBalanceUpdate={fetchUsers}
                    adminId={adminUser.uid}
                />
            )}
        </>
    );
}
