

'use client';
// HMR fix

import { useEffect, useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PlusCircle, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Scratchcard, getScratchcards, deleteScratchcard } from './actions';
import { Skeleton } from '@/components/ui/skeleton';
import Image from 'next/image';
import { useToast } from '@/hooks/use-toast';
import { ScratchcardDialog } from './ScratchcardDialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
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
import { Badge } from '@/components/ui/badge';

export default function AdminScratchcardsPage() {
    const [scratchcards, setScratchcards] = useState<Scratchcard[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const { toast } = useToast();
    
    // Dialog states
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingCard, setEditingCard] = useState<Scratchcard | null>(null);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [deletingCardId, setDeletingCardId] = useState<string | null>(null);


    const fetchCards = async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await getScratchcards();
            if (result.success && result.data) {
                setScratchcards(result.data);
            } else {
                setError(result.error || 'Falha ao buscar as raspadinhas.');
            }
        } catch (err) {
            setError('Ocorreu um erro inesperado.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchCards();
    }, []);

    const handleCreateNew = () => {
        setEditingCard(null);
        setIsDialogOpen(true);
    };

    const handleEdit = (card: Scratchcard) => {
        setEditingCard(card);
        setIsDialogOpen(true);
    };
    
    const openDeleteConfirm = (id: string) => {
        setDeletingCardId(id);
        setIsDeleteDialogOpen(true);
    };

    const handleDelete = async () => {
        if (!deletingCardId) return;
        
        const result = await deleteScratchcard(deletingCardId);

        if (result.success) {
            toast({ title: 'Sucesso!', description: 'Raspadinha removida.' });
            await fetchCards();
        } else {
            toast({ variant: 'destructive', title: 'Erro!', description: result.error });
        }
        setIsDeleteDialogOpen(false);
        setDeletingCardId(null);
    };

    const formatCurrency = (value: number) => {
        return (value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    };

    return (
        <>
            <div className="space-y-8">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold">Gerenciar Raspadinhas</h1>
                        <p className="text-muted-foreground">Crie, edite e visualize as raspadinhas da sua plataforma.</p>
                    </div>
                    <Button onClick={handleCreateNew}>
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Criar Nova
                    </Button>
                </div>
                
                {loading ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                        {Array.from({ length: 4 }).map((_, i) => (
                           <Card key={i}><CardHeader><Skeleton className="h-40 w-full" /></CardHeader><CardContent><Skeleton className="h-6 w-3/4 mt-4" /><Skeleton className="h-4 w-1/2 mt-2" /></CardContent></Card>
                        ))}
                    </div>
                ) : error ? (
                    <div className="text-center py-10 text-destructive">
                        <p>Erro: {error}</p>
                    </div>
                ) : scratchcards.length === 0 ? (
                    <Card>
                        <CardHeader>
                            <CardTitle>Raspadinhas Atuais</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-center py-10">
                                <p className="text-muted-foreground">Nenhuma raspadinha criada ainda.</p>
                                <Button variant="link" onClick={handleCreateNew}>Criar a primeira raspadinha</Button>
                            </div>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                        {scratchcards.map((card) => (
                            <Card key={card.id} className="group flex flex-col">
                                <CardHeader className="relative p-0">
                                    <div className="relative">
                                        <Image 
                                            src={card.imageUrl || 'https://placehold.co/400x200.png'} 
                                            alt={card.name} 
                                            width={400} 
                                            height={200}
                                            className="w-full h-auto aspect-[12/5] object-contain rounded-t-lg"
                                            data-ai-hint="scratch card game"
                                        />
                                        <div className="absolute top-2 right-2 z-10">
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="secondary" size="icon" className="h-8 w-8">
                                                        <MoreHorizontal className="h-4 w-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem onClick={() => handleEdit(card)}>
                                                        <Pencil className="mr-2 h-4 w-4" />
                                                        Editar
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => openDeleteConfirm(card.id)} className="text-destructive focus:text-destructive">
                                                        <Trash2 className="mr-2 h-4 w-4" />
                                                        Excluir
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="p-4 flex-grow flex flex-col">
                                    <h3 className="text-lg font-semibold leading-none tracking-tight truncate">{card.name}</h3>
                                    <p className="text-sm text-muted-foreground mt-1">{formatCurrency(card.price)}</p>
                                    <div className="mt-2">
                                        <Badge variant={card.isEnabled ? 'default' : 'secondary'}>
                                            {card.isEnabled ? 'Ativada' : 'Desativada'}
                                        </Badge>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}
            </div>

            <ScratchcardDialog 
                isOpen={isDialogOpen}
                onOpenChange={setIsDialogOpen}
                onSave={fetchCards}
                scratchcard={editingCard}
            />

            <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Você tem certeza?</AlertDialogTitle>
                        <AlertDialogDescription>
                           Esta ação não pode ser desfeita. Isso excluirá permanentemente a raspadinha.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
                            Excluir
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
