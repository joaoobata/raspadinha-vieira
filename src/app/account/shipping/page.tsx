
'use client';
// HMR fix

import { useEffect, useState } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '@/lib/firebase';
import { getSignupRewardStatus, SignupRewardStatus } from './actions';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Gift, Package, Rocket } from 'lucide-react';
import Link from 'next/link';

export default function ShippingPage() {
    const [user] = useAuthState(auth);
    const [rewardStatus, setRewardStatus] = useState<SignupRewardStatus | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (user) {
            const fetchStatus = async () => {
                setLoading(true);
                const result = await getSignupRewardStatus(user.uid);
                if (result.success) {
                    setRewardStatus(result.data || null);
                }
                setLoading(false);
            };
            fetchStatus();
        } else {
            setLoading(false);
        }
    }, [user]);

    const renderContent = () => {
        if (loading) {
            return <Skeleton className="h-48 w-full" />;
        }
        
        if (rewardStatus && rewardStatus.status !== 'claimed' && rewardStatus.remainingPlays > 0) {
            return (
                <Card className="bg-primary/10 border-primary/30 shadow-lg">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-3 text-2xl">
                            <Gift className="h-8 w-8 text-primary" />
                            Você tem um presente especial!
                        </CardTitle>
                        <CardDescription>
                            Recebemos sua entrega e você tem recompensas para resgatar.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-center bg-secondary/50 p-6 rounded-lg">
                            <p className="text-lg font-semibold text-white">
                                {rewardStatus.remainingPlays} {rewardStatus.remainingPlays > 1 ? 'Raspadinhas Grátis' : 'Raspadinha Grátis'}
                            </p>
                            <p className="text-muted-foreground">
                                Jogue agora para revelar seus prêmios!
                            </p>
                            <Button asChild size="lg" className="mt-4 bg-primary text-primary-foreground hover:bg-primary/80">
                                <Link href="/rewards/play">
                                    <Rocket className="mr-2 h-5 w-5" />
                                    Jogar Agora
                                </Link>
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            );
        }

        // Mensagem padrão se não houver recompensas
        return (
            <div className="flex flex-col items-center justify-center text-center py-16">
                <Package className="h-16 w-16 text-muted-foreground/50 mb-4" />
                <h2 className="text-2xl font-bold">Nenhuma Entrega no Momento</h2>
                <p className="mt-2 text-muted-foreground">
                    Fique de olho! Seus prêmios e recompensas aparecerão aqui quando estiverem disponíveis.
                </p>
            </div>
        );
    };

    return (
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="mb-8">
                <h1 className="text-3xl font-bold">Minhas Entregas e Prêmios</h1>
                <p className="text-muted-foreground">Acompanhe aqui suas recompensas e prêmios físicos pendentes.</p>
            </div>
            
            <div className="mt-6">
                {renderContent()}
            </div>
        </div>
    );
}
