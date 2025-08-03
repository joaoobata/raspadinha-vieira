'use client';

import { useEffect, useState } from 'react';
import { restoreAdminAccess } from './actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { LoaderCircle, AlertTriangle, CheckCircle } from 'lucide-react';
import Link from 'next/link';

// THIS IS A TEMPORARY PAGE AND SHOULD BE DELETED AFTER USE.

export default function FixAdminPage() {
    const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
    const [message, setMessage] = useState('');

    useEffect(() => {
        const fixAccess = async () => {
            // Hardcoded email for security.
            const result = await restoreAdminAccess('joaovictorobata2005@gmail.com');
            if (result.success) {
                setStatus('success');
                setMessage(result.message || 'Acesso restaurado com sucesso!');
            } else {
                setStatus('error');
                setMessage(result.error || 'Falha ao restaurar o acesso.');
            }
        };

        fixAccess();
    }, []);

    return (
        <div className="container mx-auto flex items-center justify-center min-h-screen">
            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle>Recuperação de Acesso</CardTitle>
                    <CardDescription>Restaurando privilégios de administrador.</CardDescription>
                </CardHeader>
                <CardContent className="text-center">
                    {status === 'loading' && (
                        <div className="flex flex-col items-center gap-4 p-8">
                            <LoaderCircle className="h-12 w-12 animate-spin text-primary" />
                            <p className="text-muted-foreground">Processando...</p>
                        </div>
                    )}
                    {status === 'error' && (
                        <div className="flex flex-col items-center gap-4 p-8">
                            <AlertTriangle className="h-12 w-12 text-destructive" />
                            <p className="font-semibold text-destructive">Ocorreu um Erro</p>
                            <p className="text-muted-foreground">{message}</p>
                             <Button asChild>
                                <Link href="/">Voltar para a Home</Link>
                            </Button>
                        </div>
                    )}
                    {status === 'success' && (
                        <div className="flex flex-col items-center gap-4 p-8">
                            <CheckCircle className="h-12 w-12 text-green-500" />
                             <p className="font-semibold text-green-500">Sucesso!</p>
                            <p className="text-muted-foreground">{message}</p>
                            <Button asChild>
                                <Link href="/admin">Ir para o Painel de Admin</Link>
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
