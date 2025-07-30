
'use client';

import { Suspense, useEffect, useState } from 'react';
import { RewardPlayArea } from './RewardPlayArea';
import { LoaderCircle, Gift, Package } from 'lucide-react';
import { getRewardGameData } from './actions';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

interface RewardState {
    status: 'loading' | 'has_reward' | 'no_reward';
    error?: string;
}

function RewardPlayPageContent() {
    const [user, loadingUser] = useAuthState(auth);
    const [rewardState, setRewardState] = useState<RewardState>({ status: 'loading' });

    useEffect(() => {
        if (loadingUser) {
            return;
        }
        if (!user) {
            setRewardState({ status: 'no_reward', error: "Você precisa fazer login para acessar suas recompensas." });
            return;
        }

        const checkRewardStatus = async () => {
            try {
                const idToken = await user.getIdToken();
                const result = await getRewardGameData(idToken);
                if (result.success && result.data) {
                    setRewardState({ status: 'has_reward' });
                } else {
                    setRewardState({ status: 'no_reward', error: "Você não tem raspadinhas gratuitas no momento." });
                }
            } catch (e: any) {
                 setRewardState({ status: 'no_reward', error: e.message || "Ocorreu um erro ao verificar suas recompensas." });
            }
        };

        checkRewardStatus();

    }, [user, loadingUser]);

    if (rewardState.status === 'loading') {
        return (
             <div className="bg-gradient-to-b from-gray-900 to-gray-800 min-h-screen flex flex-col items-center justify-center">
                <LoaderCircle className="h-16 w-16 text-primary animate-spin" />
            </div>
        )
    }
    
    if (rewardState.status === 'no_reward') {
        return (
             <div className="bg-gradient-to-b from-gray-900 to-gray-800 min-h-screen flex flex-col items-center justify-center text-center p-4">
                 <Package className="h-20 w-20 text-muted-foreground/50 mb-4" />
                <h1 className="text-3xl font-bold text-white">Nenhuma Recompensa por Aqui!</h1>
                <p className="mt-2 text-lg text-muted-foreground">
                    {rewardState.error || "Você não tem raspadinhas gratuitas no momento. Fique de olho para futuras promoções!"}
                </p>
                <Button asChild className="mt-6">
                    <Link href="/">
                        Voltar para a Home
                    </Link>
                </Button>
            </div>
        )
    }

    // If status is 'has_reward', render the play area
    return (
        <div className="bg-gradient-to-b from-gray-900 to-gray-800 min-h-screen flex flex-col items-center justify-start p-4 relative overflow-hidden">
        <div className="w-full max-w-5xl mx-auto">
            <div className="text-center mt-16 text-white">
            <h1 className="text-3xl font-bold flex items-center justify-center gap-2">
                <Gift className="text-yellow-400" />Sua Recompensa
            </h1>
            <p className="text-muted-foreground">Jogue suas raspadinhas grátis!</p>
            </div>

            <div className="w-full max-w-sm mx-auto mt-4">
            <RewardPlayArea />
            </div>
        </div>
        </div>
    );
}

export default function RewardPlayPage() {
    return (
        <Suspense fallback={
            <div className="bg-gradient-to-b from-gray-900 to-gray-800 min-h-screen flex flex-col items-center justify-center">
                <LoaderCircle className="h-16 w-16 text-primary animate-spin" />
            </div>
        }>
            <RewardPlayPageContent />
        </Suspense>
    );
}
