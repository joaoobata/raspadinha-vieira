
import { getScratchcards, Scratchcard, Prize } from '@/app/admin/scratchcards/actions';
import { getSettings } from '@/app/admin/settings/actions';
import Image from 'next/image';
import { Card, CardContent, CardHeader, CardDescription, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { notFound } from 'next/navigation';
import { ArrowLeft, Trophy, Diamond, Coins } from 'lucide-react';
import Link from 'next/link';
import PlayArea from './PlayArea';
import { LivePrizes } from '@/components/LivePrizes';

// Re-exporting the interface to be used by the client component
export type { Scratchcard, Prize };

async function getScratchcard(cardId: string): Promise<Scratchcard | undefined> {
    const { data: cards } = await getScratchcards();
    return cards?.find(c => c.id === cardId);
}

// Helper to fetch image as base64 data URI
async function getImageAsDataUri(imageUrl: string): Promise<string | null> {
    try {
        const response = await fetch(imageUrl);
        if (!response.ok) {
            console.error(`Failed to fetch image: ${response.statusText}`);
            return null;
        }
        const buffer = await response.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');
        const mimeType = response.headers.get('content-type') || 'image/png';
        return `data:${mimeType};base64,${base64}`;
    } catch (error) {
        console.error("Error converting image to data URI:", error);
        return null;
    }
}


const formatCurrency = (value: number) => {
    return (value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

// This is the main server component for the page
export default async function PlayPage({ params }: { params: { cardId: string } }) {
    const card = await getScratchcard(params.cardId);

    if (!card || !card.isEnabled) {
        notFound();
    }
    
    // Fetch the scratchable image on the server and convert it to a Data URI
    const scratchImageAsDataUri = card.scratchImageUrl 
        ? await getImageAsDataUri(card.scratchImageUrl) 
        : null;

    const [
      { data: allGames },
      { data: settingsData }
    ] = await Promise.all([
      getScratchcards(),
      getSettings()
    ]);
    
    const allPrizes: Prize[] = allGames?.flatMap(game => game.prizes.filter(p => p.value > 0)) || [];
    const specialPrizes = card.prizes.filter(p => p.value >= 100).sort((a,b) => b.value - a.value);
    const otherPrizes = card.prizes.filter(p => p.value < 100 && p.value > 0).sort((a,b) => b.value - a.value);


    return (
        <div className="bg-gradient-to-b from-gray-900 to-gray-800 min-h-screen flex flex-col items-center justify-start p-4 relative overflow-hidden">
             <div className="w-full max-w-5xl mx-auto">
                <div className="absolute top-4 left-4 z-10">
                     <Button asChild variant="outline">
                        <Link href="/">
                            <ArrowLeft className="mr-2" />
                            Voltar
                        </Link>
                    </Button>
                </div>

                <div className="w-full max-w-sm mx-auto mt-16">
                    <PlayArea 
                        card={card} 
                        scratchImageAsDataUri={scratchImageAsDataUri}
                        soundWinUrl={settingsData?.soundWinUrl || null}
                        soundLoseUrl={settingsData?.soundLoseUrl || null}
                        soundScratchUrl={settingsData?.soundScratchUrl || null}
                    />
                </div>
                
                <div className="my-8">
                    <LivePrizes prizes={allPrizes} />
                </div>

                 {/* Seção de Prêmios */}
                <Card className="mt-8 bg-gray-800/50 border-gray-700 w-full">
                    <CardHeader className="text-center">
                        <div className="flex justify-center items-center gap-2">
                             <Trophy className="w-8 h-8 text-yellow-400" />
                             <CardTitle className="text-3xl font-bold text-white">Prêmios da Raspadinha:</CardTitle>
                        </div>
                        <CardDescription className="text-gray-300">
                            Veja todos os prêmios que você pode ganhar nesta raspadinha
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-8">
                        {specialPrizes.length > 0 && (
                            <div>
                                <h3 className="flex items-center justify-center gap-2 text-xl font-semibold text-green-400 mb-4">
                                    <Diamond className="w-5 h-5" />
                                    Prêmios Especiais
                                </h3>
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 justify-center">
                                     {specialPrizes.map((prize) => (
                                        <div key={prize.id} className="bg-green-900/50 border border-green-700 rounded-lg p-4 text-center flex flex-col items-center justify-center">
                                            <Image src={prize.imageUrl} alt={prize.name} width={80} height={80} className="object-contain h-20" data-ai-hint="money prize" />
                                            <p className="mt-2 text-white font-semibold">{prize.name}</p>
                                            <p className="text-green-400 font-bold">{formatCurrency(prize.value)}</p>
                                        </div>
                                     ))}
                                </div>
                            </div>
                        )}
                        {otherPrizes.length > 0 && (
                             <div>
                                <h3 className="flex items-center justify-center gap-2 text-xl font-semibold text-blue-400 mb-4">
                                    <Coins className="w-5 h-5" />
                                    Outros Prêmios
                                </h3>
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 justify-center">
                                      {otherPrizes.map((prize) => (
                                        <div key={prize.id} className="bg-blue-900/30 border border-blue-700 rounded-lg p-4 text-center flex flex-col items-center justify-center">
                                            <Image src={prize.imageUrl} alt={prize.name} width={80} height={80} className="object-contain h-20" data-ai-hint="money prize" />
                                            <p className="mt-2 text-white font-semibold">{prize.name}</p>
                                            <p className="text-blue-400 font-bold">{formatCurrency(prize.value)}</p>
                                        </div>
                                      ))}
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>

            </div>
            {/* Decorative elements */}
            <div className="absolute -top-10 -left-10 w-40 h-40 bg-green-400/10 rounded-full blur-2xl animate-pulse"></div>
            <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-purple-500/10 rounded-full blur-2xl animate-pulse animation-delay-400"></div>
        </div>
    );
}
