
'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '@/lib/firebase';
import {
    getGgrBatches,
    saveGgrBatch,
    archiveGgrBatch,
    getScratchcards,
    GgrBatch,
    Scratchcard
} from './actions';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/dialog';
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table";
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { LoaderCircle, PlusCircle, Archive, Pencil, Box, RefreshCw } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';

const prizeTierSchema = z.object({
    maxAmount: z.coerce.number().min(0),
    probability: z.coerce.number().min(0).max(100),
});

const highPrizeTierSchema = z.object({
     probability: z.coerce.number().min(0).max(100),
})

const batchFormSchema = z.object({
    name: z.string().min(3, 'O nome do lote é obrigatório.'),
    ggrTarget: z.coerce.number().min(1, 'O GGR alvo deve ser maior que zero.'),
    prizePool: z.coerce.number().min(0, 'O pool de prêmios não pode ser negativo.'),
    isRecurring: z.boolean().default(false),
    participatingCardIds: z.array(z.string()).optional(),
    prizeTiers: z.object({
        low: prizeTierSchema,
        medium: prizeTierSchema,
        high: highPrizeTierSchema,
    }).optional(),
});

type BatchFormValues = z.infer<typeof batchFormSchema>;

export default function GgrBatchesPage() {
    const [adminUser] = useAuthState(auth);
    const { toast } = useToast();
    const [batches, setBatches] = useState<GgrBatch[]>([]);
    const [scratchcards, setScratchcards] = useState<Scratchcard[]>([]);
    const [loading, setLoading] = useState(true);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingBatch, setEditingBatch] = useState<GgrBatch | null>(null);

    const form = useForm<BatchFormValues>({
        resolver: zodResolver(batchFormSchema),
        defaultValues: {
            name: '',
            ggrTarget: 10000,
            prizePool: 7000,
            isRecurring: true,
            participatingCardIds: [],
            prizeTiers: {
                low: { maxAmount: 10, probability: 75 },
                medium: { maxAmount: 50, probability: 20 },
                high: { probability: 5 },
            }
        },
    });

    const fetchAllData = async () => {
        setLoading(true);
        const [batchesResult, cardsResult] = await Promise.all([
            getGgrBatches(),
            getScratchcards()
        ]);

        if (batchesResult.success && batchesResult.data) {
            setBatches(batchesResult.data);
        } else {
            toast({ variant: 'destructive', title: 'Erro', description: 'Falha ao carregar lotes de GGR.' });
        }

        if (cardsResult.success && cardsResult.data) {
            setScratchcards(cardsResult.data.filter(c => c.isEnabled));
        } else {
             toast({ variant: 'destructive', title: 'Erro', description: 'Falha ao carregar raspadinhas.' });
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchAllData();
    }, []);

    const handleOpenDialog = (batch: GgrBatch | null = null) => {
        setEditingBatch(batch);
        if (batch) {
            form.reset({
                name: batch.name,
                ggrTarget: batch.ggrTarget,
                prizePool: batch.prizePool,
                isRecurring: batch.isRecurring,
                participatingCardIds: batch.participatingCardIds,
                prizeTiers: batch.prizeTiers || {
                    low: { maxAmount: 10, probability: 75 },
                    medium: { maxAmount: 50, probability: 20 },
                    high: { probability: 5 },
                }
            });
        } else {
            form.reset({
                name: '',
                ggrTarget: 10000,
                prizePool: 7000,
                isRecurring: true,
                participatingCardIds: [],
                 prizeTiers: {
                    low: { maxAmount: 10, probability: 75 },
                    medium: { maxAmount: 50, probability: 20 },
                    high: { probability: 5 },
                }
            });
        }
        setIsDialogOpen(true);
    };

    const onSubmit = async (data: BatchFormValues) => {
        if (!adminUser) return;
        const result = await saveGgrBatch({
            ...data,
            id: editingBatch?.id,
            ggrCurrent: editingBatch?.ggrCurrent || 0,
            prizesDistributed: editingBatch?.prizesDistributed || 0,
            status: editingBatch?.status || 'active',
        }, adminUser.uid);

        if (result.success) {
            toast({ title: 'Sucesso!', description: 'Lote salvo com sucesso.' });
            setIsDialogOpen(false);
            await fetchAllData();
        } else {
            toast({ variant: 'destructive', title: 'Erro', description: result.error });
        }
    };
    
    const handleArchive = async (batchId: string) => {
        if (!adminUser) return;
        const result = await archiveGgrBatch(batchId, adminUser.uid);
         if (result.success) {
            toast({ title: 'Sucesso!', description: 'Lote arquivado.' });
            await fetchAllData();
        } else {
            toast({ variant: 'destructive', title: 'Erro', description: result.error });
        }
    }
    
    const formatCurrency = (value: number) => {
        return (value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Controle de Lotes (GGR)</h1>
                    <p className="text-muted-foreground">Gerencie os lotes de prêmios que controlam a economia dos jogos.</p>
                </div>
                <Button onClick={() => handleOpenDialog()}>
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Criar Novo Lote
                </Button>
            </div>
            
            <Card>
                <CardHeader>
                    <CardTitle>Lotes Ativos</CardTitle>
                </CardHeader>
                <CardContent>
                     {loading ? (
                        <Skeleton className="h-40 w-full" />
                    ) : batches.filter(b => b.status === 'active').length === 0 ? (
                        <p className="text-center text-muted-foreground py-10">Nenhum lote ativo. Crie um para começar.</p>
                    ) : (
                        <div className="grid gap-6 md:grid-cols-2">
                            {batches.filter(b => b.status === 'active').map(batch => {
                                const ggrProgress = batch.ggrTarget > 0 ? (batch.ggrCurrent / batch.ggrTarget) * 100 : 0;
                                const prizeProgress = batch.prizePool > 0 ? (batch.prizesDistributed / batch.prizePool) * 100 : 0;
                                return (
                                <Card key={batch.id} className="bg-secondary">
                                    <CardHeader>
                                        <div className="flex justify-between items-start">
                                            <div>
                                                 <CardTitle className="flex items-center gap-2"><Box /> {batch.name}</CardTitle>
                                                 <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                                                    {batch.isRecurring && <Badge className="bg-blue-500"><RefreshCw className="h-3 w-3 mr-1"/> Recorrente</Badge>}
                                                    <Badge variant="outline">ID: {batch.id}</Badge>
                                                 </div>
                                            </div>
                                            <div className="flex gap-2">
                                                 <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => handleOpenDialog(batch)}><Pencil className="h-4 w-4" /></Button>
                                                 <Button variant="destructive" size="icon" className="h-8 w-8" onClick={() => handleArchive(batch.id)}><Archive className="h-4 w-4" /></Button>
                                            </div>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        <div className="space-y-2">
                                            <Label>Progresso de Arrecadação (GGR)</Label>
                                            <Progress value={ggrProgress} />
                                            <div className="flex justify-between text-xs text-muted-foreground">
                                                <span>{formatCurrency(batch.ggrCurrent)}</span>
                                                <span>{formatCurrency(batch.ggrTarget)}</span>
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Prêmios Distribuídos</Label>
                                            <Progress value={prizeProgress} />
                                            <div className="flex justify-between text-xs text-muted-foreground">
                                                <span>{formatCurrency(batch.prizesDistributed)}</span>
                                                <span>{formatCurrency(batch.prizePool)}</span>
                                            </div>
                                        </div>
                                         <div>
                                            <Label>Raspadinhas Participantes</Label>
                                            <p className="text-sm font-semibold">{batch.participatingCardIds.length}</p>
                                        </div>
                                    </CardContent>
                                </Card>
                            )})}
                        </div>
                    )}
                </CardContent>
            </Card>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>{editingBatch ? 'Editar' : 'Criar'} Lote de GGR</DialogTitle>
                        <DialogDescription>
                            Defina as metas financeiras e quais jogos participarão deste lote.
                        </DialogDescription>
                    </DialogHeader>
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <FormField
                                    control={form.control}
                                    name="name"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Nome do Lote</FormLabel>
                                            <FormControl><Input placeholder="Lote Principal" {...field} /></FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                 <FormField
                                    control={form.control}
                                    name="ggrTarget"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>GGR Alvo (Arrecadação)</FormLabel>
                                            <FormControl><Input type="number" placeholder="10000" {...field} /></FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="prizePool"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Pool de Prêmios</FormLabel>
                                            <FormControl><Input type="number" placeholder="7000" {...field} /></FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>
                             <FormField
                                control={form.control}
                                name="isRecurring"
                                render={({ field }) => (
                                <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-4">
                                    <FormControl>
                                    <Checkbox
                                        checked={field.value}
                                        onCheckedChange={field.onChange}
                                    />
                                    </FormControl>
                                    <div className="space-y-1 leading-none">
                                    <FormLabel>
                                        Lote Recorrente
                                    </FormLabel>
                                    <FormDescription>
                                        Se marcado, este lote será reiniciado automaticamente após atingir o GGR alvo.
                                    </FormDescription>
                                    </div>
                                </FormItem>
                                )}
                            />

                             <Separator />
                             
                             <div>
                                <h3 className="text-lg font-medium">Tiers de Prêmios</h3>
                                <p className="text-sm text-muted-foreground">
                                    Configure as faixas de prêmios e a probabilidade de cada uma ser sorteada. A soma das probabilidades deve ser 100%.
                                </p>
                             </div>
                             
                             <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <Card className="p-4">
                                    <FormLabel>Tier Baixo</FormLabel>
                                    <FormField
                                        control={form.control}
                                        name="prizeTiers.low.maxAmount"
                                        render={({ field }) => (
                                            <FormItem className="mt-2">
                                                <FormDescription>Prêmio até (R$)</FormDescription>
                                                <FormControl><Input type="number" placeholder="10" {...field} /></FormControl>
                                            </FormItem>
                                        )}
                                    />
                                     <FormField
                                        control={form.control}
                                        name="prizeTiers.low.probability"
                                        render={({ field }) => (
                                            <FormItem className="mt-2">
                                                <FormDescription>Chance (%)</FormDescription>
                                                <FormControl><Input type="number" placeholder="75" {...field} /></FormControl>
                                            </FormItem>
                                        )}
                                    />
                                </Card>
                                <Card className="p-4">
                                     <FormLabel>Tier Médio</FormLabel>
                                    <FormField
                                        control={form.control}
                                        name="prizeTiers.medium.maxAmount"
                                        render={({ field }) => (
                                            <FormItem className="mt-2">
                                                <FormDescription>Prêmio até (R$)</FormDescription>
                                                <FormControl><Input type="number" placeholder="50" {...field} /></FormControl>
                                            </FormItem>
                                        )}
                                    />
                                     <FormField
                                        control={form.control}
                                        name="prizeTiers.medium.probability"
                                        render={({ field }) => (
                                            <FormItem className="mt-2">
                                                <FormDescription>Chance (%)</FormDescription>
                                                <FormControl><Input type="number" placeholder="20" {...field} /></FormControl>
                                            </FormItem>
                                        )}
                                    />
                                </Card>
                                <Card className="p-4">
                                    <FormLabel>Tier Alto</FormLabel>
                                     <FormField
                                        control={form.control}
                                        name="prizeTiers.high.probability"
                                        render={({ field }) => (
                                            <FormItem className="mt-2">
                                                <FormDescription>Chance (%)</FormDescription>
                                                <FormControl><Input type="number" placeholder="5" {...field} /></FormControl>
                                            </FormItem>
                                        )}
                                    />
                                </Card>
                             </div>


                             <FormField
                                control={form.control}
                                name="participatingCardIds"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Raspadinhas Participantes</FormLabel>
                                        <FormDescription>
                                            Selecione as raspadinhas que usarão este lote para o sorteio de prêmios.
                                        </FormDescription>
                                        <ScrollArea className="h-40 w-full rounded-md border p-4">
                                             {scratchcards.map((card) => (
                                                <div key={card.id} className="flex items-center space-x-2 mb-2">
                                                    <Checkbox
                                                        id={card.id}
                                                        checked={field.value?.includes(card.id)}
                                                        onCheckedChange={(checked) => {
                                                            return checked
                                                            ? field.onChange([...(field.value || []), card.id])
                                                            : field.onChange((field.value || []).filter(value => value !== card.id))
                                                        }}
                                                    />
                                                    <label htmlFor={card.id} className="text-sm font-medium leading-none">
                                                        {card.name}
                                                    </label>
                                                </div>
                                            ))}
                                        </ScrollArea>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <DialogFooter>
                                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
                                <Button type="submit" disabled={form.formState.isSubmitting}>
                                    {form.formState.isSubmitting && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}
                                    Salvar Lote
                                </Button>
                            </DialogFooter>
                        </form>
                    </Form>
                </DialogContent>
            </Dialog>
        </div>
    );
}
