
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowRight } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { getScratchcards, Scratchcard, Prize } from '@/app/admin/scratchcards/actions';
import { getSettings } from './admin/settings/actions';
import { getBanners } from './admin/banners/actions';
import { getCategories, Category } from './admin/categories/actions';
import { HomeCarousel } from '@/components/HomeCarousel';
import { LivePrizes } from '@/components/LivePrizes';

// Revalidate the page every 60 seconds.
export const revalidate = 60;

const formatCurrency = (value: number) => {
    return (value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

const ScratchcardGrid = ({ games }: { games: Scratchcard[] }) => {
    const findHighestPrize = (scratchcard: Scratchcard) => {
        if (!scratchcard.prizes || scratchcard.prizes.length === 0) {
            return 0;
        }
        return Math.max(...scratchcard.prizes.map(p => p.value));
    };

    if (games.length === 0) {
        return <p className="text-center text-muted-foreground py-10 col-span-full">Nenhuma raspadinha disponível nesta categoria.</p>;
    }

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {games.map((game) => (
                <Link key={game.id} href={`/play/${game.id}`} className="flex">
                    <Card className="bg-zinc-900 border-zinc-800 hover:border-green-500 transition-all group overflow-hidden flex flex-col w-full">
                        <CardHeader className="relative p-0">
                            <Image src={game.imageUrl || 'https://placehold.co/400x200.png'} alt={game.name} width={1920} height={800} className="w-full h-auto aspect-[12/5] object-contain rounded-t-lg" data-ai-hint="scratch card game" />
                            <div className="absolute top-2 right-2 bg-green-500 text-primary-foreground text-sm font-bold px-3 py-1 rounded-md">
                                {formatCurrency(game.price)}
                            </div>
                        </CardHeader>
                        <CardContent className="p-4 flex-grow flex flex-col">
                            <h3 className="text-lg font-bold truncate text-white">{game.name}</h3>
                            <p className="text-sm font-bold text-amber-400 my-1">PRÊMIOS ATÉ {formatCurrency(findHighestPrize(game))}</p>
                            <p className="text-sm text-muted-foreground line-clamp-2 flex-grow">{game.description}</p>
                        </CardContent>
                        <CardFooter className="p-4 pt-2 mt-auto">
                            <Button className="w-full bg-green-500 hover:bg-green-600 text-black font-bold" tabIndex={-1}>
                                Jogar Raspadinha
                                <ArrowRight className="ml-2" />
                            </Button>
                        </CardFooter>
                    </Card>
                </Link>
            ))}
        </div>
    );
};


export default async function Home() {
  const [
    { success: s1, data: allGames, error: e1 }, 
    { success: s2, data: settings, error: e2 }, 
    { success: s3, data: bannersData, error: e3 },
    { success: s4, data: categories, error: e4 }
  ] = await Promise.all([
    getScratchcards(),
    getSettings(),
    getBanners(),
    getCategories()
  ]);
  
  const enabledGames = allGames?.filter(g => g.isEnabled) || [];
  const homeBanners = bannersData?.home || [];
  const allCategories = categories || [];
  const allPrizes: Prize[] = allGames?.flatMap(game => game.prizes.filter(p => p.value > 0)) || [];
  
  const hasErrors = e1 || e2 || e3 || e4;


  return (
    <div className="mt-8">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <HomeCarousel banners={homeBanners} />
      </div>
      
      <div className="my-8">
        <LivePrizes prizes={allPrizes} />
      </div>

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {hasErrors && <p className="text-center text-destructive">Ocorreu um erro ao carregar os jogos ou categorias.</p>}

        {!hasErrors && (
            <Tabs defaultValue="geral" className="w-full" id="jogos">

                <TabsList className="mb-8 bg-transparent p-0 flex flex-wrap gap-2 justify-center">
                    <TabsTrigger value="geral" className="px-6 py-2 text-base">Destaques</TabsTrigger>
                    {allCategories.map((category) => (
                        <TabsTrigger key={category.id} value={category.id} className="px-6 py-2 text-base">{category.name}</TabsTrigger>
                    ))}
                </TabsList>

                <TabsContent value="geral">
                    <div className="space-y-8">
                        <ScratchcardGrid games={enabledGames} />
                    </div>
                </TabsContent>
                
                {allCategories.map((category) => (
                    <TabsContent key={category.id} value={category.id}>
                       <div className="space-y-8">
                           <ScratchcardGrid games={enabledGames.filter(g => g.categoryIds?.includes(category.id))} />
                        </div>
                    </TabsContent>
                ))}
            </Tabs>
        )}
      </div>
    </div>
  );
}
