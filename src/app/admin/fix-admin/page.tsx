
'use client';

import { useState } from 'react';
import { recalculateAllRollovers } from './actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { LoaderCircle, AlertTriangle, CheckCircle } from 'lucide-react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';

export default function FixAdminPage() {
    const [adminUser] = useAuthState(auth);
    const { toast } = useToast();
    const [loading, setLoading] = useState(false);

    const handleRecalculateRollover = async () => {
        if (!adminUser) {
            toast({ variant: 'destructive', title: 'Erro', description: 'Admin não autenticado.' });
            return;
        }
        setLoading(true);
        const result = await recalculateAllRollovers(adminUser.uid);
        if (result.success) {
            toast({
                title: 'Sucesso!',
                description: result.message || 'Operação concluída com sucesso.',
                duration: 5000,
            });
        } else {
             toast({
                variant: 'destructive',
                title: 'Erro!',
                description: result.error || 'Falha ao executar a operação.',
                duration: 5000,
            });
        }
        setLoading(false);
    };

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold">Correção de Dados</h1>
                <p className="text-muted-foreground">Ferramentas para corrigir inconsistências de dados na plataforma.</p>
            </div>
             <Card className="border-destructive">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><AlertTriangle /> Área de Risco</CardTitle>
                    <CardDescription>
                       As ações nesta página modificam dados em massa e devem ser usadas com cautela. Execute apenas se instruído pelo suporte técnico.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div>
                        <h4 className="font-semibold">Recalcular Rollover de Todos os Usuários</h4>
                        <p className="text-sm text-muted-foreground mt-1">
                            Esta ação corrige o requisito de rollover para todos os usuários, baseando-se apenas em seus depósitos. 
                            Use isso para liberar saldos de comissão que foram incorretamente presos pelo rollover no passado.
                        </p>
                    </div>
                     <Button 
                        variant="destructive"
                        onClick={handleRecalculateRollover} 
                        disabled={loading}
                    >
                        {loading ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : 'Executar Correção de Rollover'}
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
}
