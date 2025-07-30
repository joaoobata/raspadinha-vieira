
'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { getSignupRewardSettings, saveSignupRewardSettings, getScratchcards, Scratchcard, Prize, JourneyStep } from './actions';
import { Skeleton } from '@/components/ui/skeleton';
import { LoaderCircle, Award, Gift, Trophy, PlusCircle, Trash2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from '@/components/ui/separator';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '@/lib/firebase';

export default function AdminSignupRewardsPage() {
    const { toast } = useToast();
    const [adminUser] = useAuthState(auth);
    const [journey, setJourney] = useState<JourneyStep[]>([]);
    
    const [allScratchcards, setAllScratchcards] = useState<Scratchcard[]>([]);

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        const fetchInitialData = async () => {
            setLoading(true);
            const [settingsResult, cardsResult] = await Promise.all([
                getSignupRewardSettings(),
                getScratchcards()
            ]);

            if (settingsResult.success && settingsResult.data) {
                setJourney(settingsResult.data.journey || []);
            } else if(settingsResult.error) {
                toast({ variant: 'destructive', title: 'Erro ao Carregar', description: settingsResult.error });
            }

            if (cardsResult.success && cardsResult.data) {
                setAllScratchcards(cardsResult.data);
            } else if(cardsResult.error) {
                 toast({ variant: 'destructive', title: 'Erro ao Carregar Raspadinhas', description: cardsResult.error });
            }
            setLoading(false);
        };
        fetchInitialData();
    }, [toast]);
    
    const handleJourneyChange = (index: number, field: keyof JourneyStep, value: string | null) => {
        const newJourney = [...journey];
        newJourney[index] = { ...newJourney[index], [field]: value };
        
        // If changing the card, reset the prize
        if (field === 'cardId') {
            newJourney[index].prizeToWinId = null;
        }

        setJourney(newJourney);
    };

    const handleAddStep = () => {
        // Ensure the previous last step's prize is set to null
        const newJourney = journey.map((step, index) => 
            index === journey.length - 1 ? { ...step, prizeToWinId: null } : step
        );
        
        setJourney([...newJourney, { cardId: '', prizeToWinId: null }]);
    }
    
    const handleRemoveStep = (indexToRemove: number) => {
        const newJourney = journey.filter((_, index) => index !== indexToRemove);
        setJourney(newJourney);
    }

    const handleSave = async () => {
        if (!adminUser) {
            toast({ variant: 'destructive', title: 'Erro', description: 'Admin não autenticado.'});
            return;
        }
        setSaving(true);
        const result = await saveSignupRewardSettings({ journey }, adminUser.uid);
        if (result.success) {
            toast({
                title: 'Sucesso!',
                description: 'Jornada de recompensa salva com sucesso.',
            });
        } else {
            toast({
                variant: 'destructive',
                title: 'Erro ao Salvar',
                description: result.error || 'Não foi possível salvar as configurações.',
            });
        }
        setSaving(false);
    };

    const getAvailablePrizes = (cardId: string) => {
        const selectedCard = allScratchcards.find(c => c.id === cardId);
        return selectedCard ? selectedCard.prizes.filter(p => p.value > 0) : [];
    }

    if (loading) {
        return (
            <div className="space-y-8">
                <Skeleton className="h-10 w-1/3" />
                <Skeleton className="h-64 w-full" />
            </div>
        )
    }

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold flex items-center gap-3"><Award /> Recompensas de Cadastro</h1>
                <p className="text-muted-foreground">Construa a jornada de boas-vindas para novos usuários adicionando etapas de raspadinhas gratuitas.</p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Jornada de Boas-vindas</CardTitle>
                    <CardDescription>
                        Cada etapa representa uma raspadinha que o usuário jogará gratuitamente. O prêmio só pode ser definido na última etapa.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {journey.map((step, index) => {
                        const isLastStep = index === journey.length - 1;
                        const availablePrizes = getAvailablePrizes(step.cardId);

                        return (
                             <div key={index} className="p-4 border rounded-lg space-y-4 relative bg-secondary/50">
                                <div className="flex justify-between items-center">
                                    <h4 className="font-bold text-lg">Etapa {index + 1}</h4>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="text-destructive hover:bg-destructive/10"
                                        onClick={() => handleRemoveStep(index)}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                                <div className="grid md:grid-cols-2 gap-4">
                                     <div className="space-y-2">
                                        <Label className="flex items-center gap-2"><Gift/> Raspadinha da Etapa</Label>
                                        <Select value={step.cardId || ''} onValueChange={(value) => handleJourneyChange(index, 'cardId', value)}>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Escolha uma raspadinha..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {allScratchcards.map(card => (
                                                    <SelectItem key={card.id} value={card.id}>{card.name}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    {isLastStep && (
                                         <div className="space-y-2">
                                            <Label className="flex items-center gap-2 text-green-400"><Trophy /> Prêmio Final Garantido</Label>
                                            <Select 
                                                value={step.prizeToWinId || ''} 
                                                onValueChange={(value) => handleJourneyChange(index, 'prizeToWinId', value)}
                                                disabled={!step.cardId || availablePrizes.length === 0}
                                            >
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Escolha um prêmio garantido..." />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {availablePrizes.map(prize => (
                                                        <SelectItem key={prize.id} value={prize.id}>{prize.name} (R$ {prize.value.toFixed(2)})</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                             <p className="text-xs text-muted-foreground">
                                               O usuário ganhará este prêmio na sua última jogada.
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                   
                    <Button variant="outline" onClick={handleAddStep}>
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Adicionar Etapa
                    </Button>
                    
                </CardContent>
            </Card>

            <div className="flex justify-end">
                <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto bg-green-500 hover:bg-green-600">
                    {saving ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : 'Salvar Jornada de Recompensas'}
                </Button>
            </div>
        </div>
    );
}
