
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
import { updateUserDetails, UserDetailsData } from './actions';


interface EditUserDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onUserUpdate: () => void;
  user: UserDetailsData;
  adminId: string;
}

const formSchema = z.object({
  firstName: z.string().min(1, 'Nome é obrigatório.'),
  lastName: z.string().min(1, 'Sobrenome é obrigatório.'),
  email: z.string().email('E-mail inválido.'),
  phone: z.string().optional(),
  cpf: z.string().optional(),
});

type UserFormValues = z.infer<typeof formSchema>;

export function EditUserDialog({ isOpen, onOpenChange, onUserUpdate, user, adminId }: EditUserDialogProps) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  
  const form = useForm<UserFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      cpf: '',
    },
  });

  useEffect(() => {
    if (user && isOpen) {
      form.reset({
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone || '',
        cpf: user.cpf || '',
      });
    }
  }, [isOpen, user, form]);


  const handleClose = () => {
    onOpenChange(false);
  };

  const onSubmit = async (data: UserFormValues) => {
    setLoading(true);
    const result = await updateUserDetails(user.id, data, adminId);
    setLoading(false);

    if (result.success) {
      toast({
        title: 'Sucesso!',
        description: 'Dados do usuário atualizados com sucesso.',
      });
      onUserUpdate();
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
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Editar Usuário</DialogTitle>
          <DialogDescription>
            Altere os dados cadastrais do usuário. A alteração de e-mail também será refletida no login.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 py-4">
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                control={form.control}
                name="firstName"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>Nome</FormLabel>
                    <FormControl>
                        <Input placeholder="Ex: João" {...field} />
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
                />
                <FormField
                control={form.control}
                name="lastName"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>Sobrenome</FormLabel>
                    <FormControl>
                        <Input placeholder="Ex: Silva" {...field} />
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
                />
             </div>
             <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>E-mail</FormLabel>
                    <FormControl>
                        <Input placeholder="email@exemplo.com" {...field} />
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
                />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Telefone</FormLabel>
                        <FormControl>
                            <Input placeholder="(99) 99999-9999" {...field} />
                        </FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                    />
                <FormField
                    control={form.control}
                    name="cpf"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>CPF</FormLabel>
                        <FormControl>
                            <Input placeholder="000.000.000-00" {...field} />
                        </FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                    />
            </div>
            
            <DialogFooter className="pt-6">
              <Button type="button" variant="outline" onClick={handleClose}>Cancelar</Button>
              <Button type="submit" disabled={loading}>
                {loading ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : 'Salvar Alterações'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
