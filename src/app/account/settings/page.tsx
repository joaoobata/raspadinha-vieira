'use client';

import { useState, useEffect } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { useForm, SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { auth } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { updateUserProfile, updateUserPassword } from './actions';
import { LoaderCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

// Profile Form Schema
const profileSchema = z.object({
  fullName: z.string().min(3, 'O nome completo é obrigatório.'),
  email: z.string().email('O endereço de e-mail é inválido.'),
});
type ProfileFormValues = z.infer<typeof profileSchema>;

// Password Form Schema
const passwordSchema = z.object({
  currentPassword: z.string().min(1, 'A senha atual é obrigatória.'),
  newPassword: z.string().min(6, 'A nova senha deve ter no mínimo 6 caracteres.'),
  confirmPassword: z.string(),
}).refine(data => data.newPassword === data.confirmPassword, {
  message: 'As novas senhas não coincidem.',
  path: ['confirmPassword'],
});
type PasswordFormValues = z.infer<typeof passwordSchema>;

function ProfileForm() {
    const { toast } = useToast();
    const [user] = useAuthState(auth);
    const [loading, setLoading] = useState(false);

    const { register, handleSubmit, reset, formState: { errors } } = useForm<ProfileFormValues>();

    useEffect(() => {
        if (user) {
            reset({
                fullName: user.displayName || '',
                email: user.email || '',
            });
        }
    }, [user, reset]);

    const onSubmit: SubmitHandler<ProfileFormValues> = async (data) => {
        setLoading(true);
        const result = await updateUserProfile(data);
        if (result.success) {
            toast({ title: 'Sucesso!', description: 'Seu perfil foi atualizado.' });
        } else {
            toast({ variant: 'destructive', title: 'Erro!', description: result.error });
        }
        setLoading(false);
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="space-y-2">
                <h2 className="text-2xl font-bold">Informações do perfil</h2>
                <p className="text-muted-foreground">Atualize seu nome e endereço de email.</p>
            </div>
            <div className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="fullName">Nome</Label>
                    <Input id="fullName" {...register('fullName')} />
                    {errors.fullName && <p className="text-sm text-destructive">{errors.fullName.message}</p>}
                </div>
                <div className="space-y-2">
                    <Label htmlFor="email">Endereço de email</Label>
                    <Input id="email" type="email" {...register('email')} />
                    {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
                </div>
            </div>
            <div>
                <Button type="submit" disabled={loading}>
                    {loading && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}
                    Salvar
                </Button>
            </div>
        </form>
    );
}

function PasswordForm() {
    const { toast } = useToast();
    const [loading, setLoading] = useState(false);

    const { register, handleSubmit, reset, formState: { errors } } = useForm<PasswordFormValues>({
        resolver: zodResolver(passwordSchema)
    });

    const onSubmit: SubmitHandler<PasswordFormValues> = async (data) => {
        setLoading(true);
        const result = await updateUserPassword(data.currentPassword, data.newPassword);
        if (result.success) {
            toast({ title: 'Sucesso!', description: 'Sua senha foi alterada.' });
            reset();
        } else {
            toast({ variant: 'destructive', title: 'Erro!', description: result.error });
        }
        setLoading(false);
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="space-y-2">
                <h2 className="text-2xl font-bold">Atualizar senha</h2>
                <p className="text-muted-foreground">Garanta que sua conta esteja usando uma senha longa e aleatória para manter a segurança.</p>
            </div>
            <div className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="currentPassword">Senha atual</Label>
                    <Input id="currentPassword" type="password" {...register('currentPassword')} placeholder="Digite sua senha atual" />
                     {errors.currentPassword && <p className="text-sm text-destructive">{errors.currentPassword.message}</p>}
                </div>
                <div className="space-y-2">
                    <Label htmlFor="newPassword">Nova senha</Label>
                    <Input id="newPassword" type="password" {...register('newPassword')} placeholder="Digite sua nova senha" />
                    {errors.newPassword && <p className="text-sm text-destructive">{errors.newPassword.message}</p>}
                </div>
                <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Confirmar nova senha</Label>
                    <Input id="confirmPassword" type="password" {...register('confirmPassword')} placeholder="Confirme sua nova senha" />
                    {errors.confirmPassword && <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>}
                </div>
            </div>
            <div>
                 <Button type="submit" disabled={loading}>
                    {loading && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}
                    Salvar senha
                </Button>
            </div>
        </form>
    );
}

export default function SettingsPage() {
  const [user, loading] = useAuthState(auth);

  if (loading) {
    return <div className="container mx-auto py-10 px-4">Carregando...</div>;
  }

  if (!user) {
    return <div className="container mx-auto py-10 px-4">Por favor, faça login para ver as configurações.</div>;
  }

  return (
    <div className="container mx-auto py-10 px-4">
        <Tabs defaultValue="profile" className="flex flex-col md:flex-row gap-10">
          <TabsList className="flex-col items-start h-auto bg-transparent p-0 w-full md:w-48 shrink-0">
            <TabsTrigger value="profile" className="w-full justify-start data-[state=active]:bg-secondary data-[state=active]:text-primary text-lg p-3">Perfil</TabsTrigger>
            <TabsTrigger value="password" className="w-full justify-start data-[state=active]:bg-secondary data-[state=active]:text-primary text-lg p-3">Senha</TabsTrigger>
          </TabsList>

          <Card className="flex-1 p-6">
              <CardContent className="p-0">
                <TabsContent value="profile">
                    <ProfileForm />
                </TabsContent>
                <TabsContent value="password">
                    <PasswordForm />
                </TabsContent>
              </CardContent>
          </Card>
        </Tabs>
    </div>
  );
}