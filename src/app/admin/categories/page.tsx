
'use client';

import { useEffect, useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PlusCircle, MoreHorizontal, Pencil, Trash2, Tags } from "lucide-react";
import { Category, getCategories, deleteCategory } from './actions';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { CategoryDialog } from './CategoryDialog';
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
} from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export default function AdminCategoriesPage() {
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const { toast } = useToast();
    
    // Dialog states
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingCategory, setEditingCategory] = useState<Category | null>(null);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [deletingCategoryId, setDeletingCategoryId] = useState<string | null>(null);

    const fetchCategories = async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await getCategories();
            if (result.success && result.data) {
                setCategories(result.data);
            } else {
                setError(result.error || 'Falha ao buscar as categorias.');
            }
        } catch (err) {
            setError('Ocorreu um erro inesperado.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchCategories();
    }, []);

    const handleCreateNew = () => {
        setEditingCategory(null);
        setIsDialogOpen(true);
    };

    const handleEdit = (category: Category) => {
        setEditingCategory(category);
        setIsDialogOpen(true);
    };
    
    const openDeleteConfirm = (id: string) => {
        setDeletingCategoryId(id);
        setIsDeleteDialogOpen(true);
    };

    const handleDelete = async () => {
        if (!deletingCategoryId) return;
        
        const result = await deleteCategory(deletingCategoryId);

        if (result.success) {
            toast({ title: 'Sucesso!', description: 'Categoria removida.' });
            await fetchCategories();
        } else {
            toast({ variant: 'destructive', title: 'Erro!', description: result.error });
        }
        setIsDeleteDialogOpen(false);
        setDeletingCategoryId(null);
    };
    
    const formatDate = (dateString: string | null | undefined) => {
        if (!dateString) return '-';
        try {
            return new Date(dateString).toLocaleDateString('pt-BR');
        } catch (e) {
            return '-';
        }
    }

    const renderSkeleton = () => (
        Array.from({ length: 3 }).map((_, i) => (
            <TableRow key={i}>
                <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                <TableCell><Skeleton className="h-8 w-8" /></TableCell>
            </TableRow>
        ))
    );

    return (
        <>
            <div className="space-y-8">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold">Categorias de Raspadinhas</h1>
                        <p className="text-muted-foreground">Crie e gerencie as categorias para organizar os jogos.</p>
                    </div>
                    <Button onClick={handleCreateNew}>
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Criar Categoria
                    </Button>
                </div>
                
                 <Card>
                    <CardHeader>
                        <CardTitle>Categorias Atuais</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                             <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Nome</TableHead>
                                        <TableHead>Data de Criação</TableHead>
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
                        ) : categories.length === 0 ? (
                             <div className="text-center py-10">
                                <Tags className="mx-auto h-12 w-12 text-muted-foreground" />
                                <p className="mt-4 text-muted-foreground">Nenhuma categoria criada ainda.</p>
                                <Button variant="link" onClick={handleCreateNew}>Criar a primeira categoria</Button>
                            </div>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Nome</TableHead>
                                        <TableHead>Data de Criação</TableHead>
                                        <TableHead className="text-right">Ações</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {categories.map((category) => (
                                        <TableRow key={category.id}>
                                            <TableCell className="font-medium">{category.name}</TableCell>
                                            <TableCell>{formatDate(category.createdAt)}</TableCell>
                                            <TableCell className="text-right">
                                                 <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="icon" className="h-8 w-8">
                                                            <MoreHorizontal className="h-4 w-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuItem onClick={() => handleEdit(category)}>
                                                            <Pencil className="mr-2 h-4 w-4" />
                                                            Editar
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem onClick={() => openDeleteConfirm(category.id)} className="text-destructive focus:text-destructive">
                                                            <Trash2 className="mr-2 h-4 w-4" />
                                                            Excluir
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </CardContent>
                </Card>
            </div>

            <CategoryDialog 
                isOpen={isDialogOpen}
                onOpenChange={setIsDialogOpen}
                onSave={fetchCategories}
                category={editingCategory}
            />

            <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Você tem certeza?</AlertDialogTitle>
                        <AlertDialogDescription>
                           Esta ação não pode ser desfeita. Isso excluirá permanentemente a categoria. As raspadinhas nesta categoria não serão excluídas, mas perderão essa associação.
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

