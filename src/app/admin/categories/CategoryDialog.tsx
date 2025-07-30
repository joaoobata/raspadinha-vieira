
'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';

import { Button } from '@/components/ui/button';
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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { LoaderCircle } from 'lucide-react';
import { Category, saveCategory } from './actions';


interface CategoryDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSave: () => void;
  category: Category | null;
}

const formSchema = z.object({
  name: z.string().min(2, 'Nome da categoria deve ter no mínimo 2 caracteres.'),
});

type CategoryFormValues = z.infer<typeof formSchema>;

export function CategoryDialog({ isOpen, onOpenChange, onSave, category }: CategoryDialogProps) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  
  const form = useForm<CategoryFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
    },
  });

  useEffect(() => {
    if (isOpen) {
      if (category) {
        form.reset({ name: category.name });
      } else {
        form.reset({ name: '' });
      }
    }
  }, [isOpen, category, form]);


  const handleClose = () => {
    onOpenChange(false);
  };

  const onSubmit = async (data: CategoryFormValues) => {
    setLoading(true);
    const payload = {
      ...data,
      id: category?.id,
    };
    const result = await saveCategory(payload);
    setLoading(false);

    if (result.success) {
      toast({
        title: 'Sucesso!',
        description: 'Categoria salva com sucesso.',
      });
      onSave();
      handleClose();
    } else {
      toast({
        variant: 'destructive',
        title: 'Erro!',
        description: result.error,
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{category ? 'Editar' : 'Criar'} Categoria</DialogTitle>
          <DialogDescription>
            Categorias ajudam a organizar as raspadinhas na loja.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome da Categoria</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex: Populares" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter className="pt-6">
              <Button type="button" variant="outline" onClick={handleClose}>Cancelar</Button>
              <Button type="submit" disabled={loading}>
                {loading ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : 'Salvar'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
