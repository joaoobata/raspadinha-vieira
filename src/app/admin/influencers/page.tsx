
// HMR fix
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '@/lib/firebase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { LoaderCircle, UserPlus, DollarSign, Percent, Copy, RefreshCw, Trash2, Award } from 'lucide-react';
import { 
    listInfluencers, 
    createDemoAccounts, 
    setBulkBalance, 
    setBulkDemoProfile, 
    InfluencerData, 
    addInfluencerByEmail, 
    removeInfluencerRole,
    DemoPrizeProfile
} from './actions';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const profileLabels: Record<DemoPrizeProfile, string> = {
    low: 'Baixo',
    medium: 'Médio',
    high: 'Alto'
};

export default function InfluencersPage() {
    const [adminUser] = useAuthState(auth);
    const { toast } = useToast();
    const [influencers, setInfluencers] = useState<InfluencerData[]>([]);
    const [loading, setLoading] = useState(true);

    const [createCount, setCreateCount] = useState('10');
    const [createPrefix, setCreatePrefix] = useState('demo');
    const [isCreating, setIsCreating] = useState(false);
    const [createdAccounts, setCreatedAccounts] = useState<{email: string, password: string}[] | null>(null);

    const [bulkBalance, setBulkBalanceValue] = useState('100');
    const [isSettingBalance, setIsSettingBalance] = useState(false);

    const [bulkDemoProfile, setBulkDemoProfileValue] = useState<DemoPrizeProfile>('medium');
    const [isSettingProfile, setIsSettingProfile] = useState(false);
    
    const [addByEmail, setAddByEmail] = useState('');
    const [isAddingByEmail, setIsAddingByEmail] = useState(false);

    const [isRemoveAlertOpen, setIsRemoveAlertOpen] = useState(false);
    const [userToRemove, setUserToRemove] = useState<InfluencerData | null>(null);
    const [isRemoving, setIsRemoving] = useState(false);


    const fetchInfluencers = useCallback(async () => {
        setLoading(true);
        const result = await listInfluencers();
        if (result.success && result.data) {
            setInfluencers(result.data);
        } else {
            toast({ variant: 'destructive', title: 'Erro', description: result.error });
        }
        setLoading(false);
    }, [toast]);

    useEffect(() => {
        fetchInfluencers();
    }, [fetchInfluencers]);

    const handleCreateDemos = async () => {
        if (!adminUser) return;
        setIsCreating(true);
        const count = parseInt(createCount, 10);
        const result = await createDemoAccounts(count, createPrefix, adminUser.uid);
        if (result.success && result.data) {
            setCreatedAccounts(result.data);
            await fetchInfluencers();
        } else {
            toast({ variant: 'destructive', title: 'Erro ao criar contas', description: result.error });
        }
        setIsCreating(false);
    };

    const handleSetBulkBalance = async () => {
        if (!adminUser) return;
        setIsSettingBalance(true);
        const amount = parseFloat(bulkBalance);
        if (isNaN(amount) || amount < 0) {
            toast({ variant: 'destructive', title: 'Valor inválido', description: 'Insira um valor de saldo válido.'});
            setIsSettingBalance(false);
            return;
        }
        const result = await setBulkBalance(amount, adminUser.uid);
        if (result.success) {
            toast({ title: 'Sucesso!', description: `${result.count} contas foram atualizadas.` });
            await fetchInfluencers();
        } else {
             toast({ variant: 'destructive', title: 'Erro', description: result.error });
        }
        setIsSettingBalance(false);
    };
    
    const handleSetBulkDemoProfile = async () => {
        if (!adminUser) return;
        setIsSettingProfile(true);
        const result = await setBulkDemoProfile(bulkDemoProfile, adminUser.uid);
        if (result.success) {
            toast({ title: 'Sucesso!', description: `O Perfil de Prêmio de ${result.count} contas foi atualizado.` });
            await fetchInfluencers();
        } else {
            toast({ variant: 'destructive', title: 'Erro', description: result.error });
        }
        setIsSettingProfile(false);
    };
    
    const handleAddInfluencerByEmail = async () => {
        if (!adminUser || !addByEmail) return;
        setIsAddingByEmail(true);
        const result = await addInfluencerByEmail(addByEmail, adminUser.uid);
        if (result.success) {
            toast({ title: 'Sucesso!', description: result.message });
            setAddByEmail('');
            await fetchInfluencers();
        } else {
             toast({ variant: 'destructive', title: 'Erro', description: result.error });
        }
        setIsAddingByEmail(false);
    };
    
    const openRemoveConfirmation = (influencer: InfluencerData) => {
        setUserToRemove(influencer);
        setIsRemoveAlertOpen(true);
    };

    const handleRemoveRole = async () => {
        if (!userToRemove || !adminUser) return;
        setIsRemoving(true);
        const result = await removeInfluencerRole(userToRemove.id, adminUser.uid);
        if (result.success) {
            toast({ title: 'Sucesso!', description: `O cargo de influenciador foi removido de ${userToRemove.name}.`});
            await fetchInfluencers();
        } else {
            toast({ variant: 'destructive', title: 'Erro', description: result.error });
        }
        setIsRemoving(false);
        setIsRemoveAlertOpen(false);
        setUserToRemove(null);
    };


    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        toast({ title: "Copiado!", description: "As credenciais foram copiadas." });
    }

    const formatCurrency = (value: number) => (value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold">Gerenciar Influenciadores</h1>
                <p className="text-muted-foreground">Crie e gerencie contas de demonstração em massa.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                 <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><UserPlus/> Criar Contas Demo em Massa</CardTitle>
                        <CardDescription>Crie novas contas com o cargo de influenciador automaticamente.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex gap-4">
                             <div className="space-y-2 flex-1">
                                <Label htmlFor="prefix">Prefixo do Email</Label>
                                <Input id="prefix" value={createPrefix} onChange={e => setCreatePrefix(e.target.value)} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="count">Quantidade</Label>
                                <Input id="count" type="number" value={createCount} onChange={e => setCreateCount(e.target.value)} />
                            </div>
                        </div>
                        <Button onClick={handleCreateDemos} disabled={isCreating}>
                            {isCreating ? <LoaderCircle className="animate-spin" /> : 'Criar Contas'}
                        </Button>
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader>
                        <CardTitle>Ações em Massa</CardTitle>
                        <CardDescription>Aplique configurações a todos os influenciadores de uma vez.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="flex items-end gap-4">
                            <div className="space-y-2 flex-1">
                                <Label htmlFor="balance" className="flex items-center gap-1"><DollarSign/> Saldo em Massa (R$)</Label>
                                <Input id="balance" type="number" value={bulkBalance} onChange={e => setBulkBalanceValue(e.target.value)} />
                            </div>
                            <Button onClick={handleSetBulkBalance} disabled={isSettingBalance}>
                                {isSettingBalance ? <LoaderCircle className="animate-spin" /> : 'Aplicar Saldo'}
                            </Button>
                        </div>
                         <div className="flex items-end gap-4">
                            <div className="space-y-2 flex-1">
                                <Label htmlFor="demo-profile" className="flex items-center gap-1"><Award/> Perfil de Prêmio (Demo)</Label>
                                <Select value={bulkDemoProfile} onValueChange={(value: DemoPrizeProfile) => setBulkDemoProfileValue(value)}>
                                    <SelectTrigger id="demo-profile">
                                        <SelectValue placeholder="Selecione um perfil" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="low">Baixo (Prêmios menores)</SelectItem>
                                        <SelectItem value="medium">Médio (Equilibrado)</SelectItem>
                                        <SelectItem value="high">Alto (Prêmios maiores)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                             <Button onClick={handleSetBulkDemoProfile} disabled={isSettingProfile}>
                                {isSettingProfile ? <LoaderCircle className="animate-spin" /> : 'Aplicar Perfil'}
                            </Button>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle>Adicionar Influenciador Existente</CardTitle>
                        <CardDescription>Transforme um usuário já cadastrado em um influenciador.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                         <div className="flex items-end gap-4">
                            <div className="space-y-2 flex-1">
                                <Label htmlFor="addByEmail">Email do Usuário</Label>
                                <Input id="addByEmail" type="email" value={addByEmail} onChange={e => setAddByEmail(e.target.value)} placeholder="email@exemplo.com" />
                            </div>
                            <Button onClick={handleAddInfluencerByEmail} disabled={isAddingByEmail}>
                                {isAddingByEmail ? <LoaderCircle className="animate-spin" /> : 'Adicionar'}
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
            
            <Card>
                 <CardHeader>
                    <div className="flex justify-between items-center">
                        <div>
                            <CardTitle>Contas de Influenciador</CardTitle>
                            <CardDescription>Lista de todas as contas com o cargo de influenciador.</CardDescription>
                        </div>
                         <Button onClick={fetchInfluencers} variant="outline" size="icon" disabled={loading}>
                            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Nome</TableHead>
                                <TableHead>Email</TableHead>
                                <TableHead>Saldo</TableHead>
                                <TableHead>Perfil de Prêmio</TableHead>
                                <TableHead>Data de Criação</TableHead>
                                <TableHead className="text-right">Ações</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                Array.from({length: 5}).map((_,i) => (
                                    <TableRow key={i}>
                                        <TableCell colSpan={6}><Skeleton className="h-5 w-full" /></TableCell>
                                    </TableRow>
                                ))
                            ) : influencers.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center h-24">Nenhum influenciador encontrado.</TableCell>
                                </TableRow>
                            ) : (
                                influencers.map(inf => (
                                    <TableRow key={inf.id}>
                                        <TableCell className="font-medium">{inf.name}</TableCell>
                                        <TableCell>{inf.email}</TableCell>
                                        <TableCell>{formatCurrency(inf.balance)}</TableCell>
                                        <TableCell>{profileLabels[inf.demoPrizeProfile || 'medium']}</TableCell>
                                        <TableCell>{inf.createdAt ? new Date(inf.createdAt).toLocaleDateString() : '-'}</TableCell>
                                        <TableCell className="text-right">
                                            <Button variant="ghost" size="sm" onClick={() => openRemoveConfirmation(inf)}>
                                                <Trash2 className="h-4 w-4 mr-2" />
                                                Remover Cargo
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <AlertDialog open={!!createdAccounts} onOpenChange={() => setCreatedAccounts(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Contas Criadas com Sucesso!</AlertDialogTitle>
                        <AlertDialogDescription>
                            As credenciais abaixo foram geradas. Guarde-as em um local seguro.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="my-4 max-h-60 overflow-y-auto p-2 bg-secondary rounded">
                        <pre className="text-sm">
                            {createdAccounts?.map(acc => `Email: ${acc.email}\nSenha: ${acc.password}\n\n`).join('')}
                        </pre>
                    </div>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setCreatedAccounts(null)}>Fechar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => copyToClipboard(createdAccounts?.map(acc => `Email: ${acc.email}, Senha: ${acc.password}`).join('\n') || '')}>
                            <Copy className="mr-2 h-4 w-4" /> Copiar Tudo
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

             <AlertDialog open={isRemoveAlertOpen} onOpenChange={setIsRemoveAlertOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Confirmar Remoção</AlertDialogTitle>
                        <AlertDialogDescription>
                            Você tem certeza que deseja remover o cargo de influenciador de <strong>{userToRemove?.name}</strong>? Eles não terão mais o perfil de prêmio customizado, mas a conta não será excluída.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={handleRemoveRole} disabled={isRemoving} className="bg-destructive hover:bg-destructive/90">
                             {isRemoving && <LoaderCircle className="animate-spin mr-2" />}
                            Sim, Remover Cargo
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
