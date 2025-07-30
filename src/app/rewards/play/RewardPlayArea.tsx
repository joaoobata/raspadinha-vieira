
'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { Card, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LoaderCircle, PartyPopper, Rocket, XCircle } from 'lucide-react';
import type { Scratchcard, Prize } from '@/app/admin/scratchcards/actions';
import { playRewardGame, getRewardGameData } from './actions';
import { useToast } from '@/hooks/use-toast';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '@/lib/firebase';
import Confetti from 'react-confetti';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface GameResult {
  grid: Prize[];
  prizeWon: Prize | null;
  isFinalStep: boolean;
}

type UIState = 'loading' | 'error' | 'ready' | 'preparing' | 'playing' | 'finished';


const formatCurrency = (value: number) => {
    return (value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

export function RewardPlayArea() {
  const [user, loadingUser] = useAuthState(auth);
  const router = useRouter();
  const { toast } = useToast();

  const [uiState, setUiState] = useState<UIState>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  const [card, setCard] = useState<Scratchcard | null>(null);
  const [scratchImageAsDataUri, setScratchImageAsDataUri] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [totalPlays, setTotalPlays] = useState(0);
  
  const [gameResult, setGameResult] = useState<GameResult | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isScratching, setIsScratching] = useState(false);
  const isRevealedRef = useRef(false);


  // Fetch initial game data
  useEffect(() => {
    if (loadingUser) return;
    if (!user) {
        setUiState('error');
        setErrorMessage('Você precisa estar logado para acessar as recompensas.');
        return;
    }

    const fetchInitialData = async () => {
        setUiState('loading');
        try {
            const idToken = await user.getIdToken();
            const result = await getRewardGameData(idToken);
            if (result.success && result.data) {
                setCard(result.data.card);
                setScratchImageAsDataUri(result.data.scratchImageAsDataUri);
                setTotalPlays(result.data.totalPlays);
                setCurrentStep(result.data.currentStep);
                setUiState('ready');
            } else {
                setUiState('error');
                setErrorMessage(result.error || 'Não foi possível carregar o jogo.');
            }
        } catch (e: any) {
            setUiState('error');
            setErrorMessage(e.message || 'Ocorreu um erro inesperado.');
        }
    };
    fetchInitialData();
  }, [user, loadingUser]);

  const getCanvasContext = useCallback(() => {
    const canvas = canvasRef.current;
    return canvas ? canvas.getContext('2d', { willReadFrequently: true }) : null;
  }, []);

  const prepareCanvas = useCallback(() => {
    return new Promise<void>((resolve) => {
      const ctx = getCanvasContext();
      const canvas = canvasRef.current;
      if (!ctx || !canvas || !card) return resolve();

      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      ctx.globalCompositeOperation = 'source-over';
      
      const drawColor = () => {
        ctx.fillStyle = '#A1A1AA'; // zinc-400
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        isRevealedRef.current = false;
        resolve();
      };
      
      if (scratchImageAsDataUri) {
        const img = new window.Image();
        img.src = scratchImageAsDataUri;
        img.onload = () => {
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            isRevealedRef.current = false;
            resolve();
        };
        img.onerror = () => {
          console.error("Failed to load scratch image from Data URI, falling back to color.");
          drawColor();
        };
      } else {
        drawColor();
      }
    });
  }, [getCanvasContext, card, scratchImageAsDataUri]);

  useEffect(() => {
    if (uiState === 'preparing') {
      prepareCanvas().then(() => {
        setUiState('playing');
      });
    }
  }, [uiState, prepareCanvas]);
  
   useEffect(() => {
    const preventScroll = (e: TouchEvent) => { if (isScratching) e.preventDefault(); };
    const touchTarget = canvasRef.current;
    touchTarget?.addEventListener('touchmove', preventScroll, { passive: false });
    return () => touchTarget?.removeEventListener('touchmove', preventScroll);
  }, [isScratching]);


  const handleAllRevealed = useCallback(() => {
    if (isRevealedRef.current) return;
    isRevealedRef.current = true;
    setUiState('finished');
  }, []);

  const handleRevealAll = () => {
    if (uiState !== 'playing') return;
    const ctx = getCanvasContext();
    const canvas = canvasRef.current;
    if (ctx && canvas) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      handleAllRevealed();
    }
  };

  const handleScratchAction = async () => {
    if (!user || uiState !== 'ready') return;
    
    try {
        setUiState('loading');
        const idToken = await user.getIdToken();
        const result = await playRewardGame(idToken);
        if (result.success && result.data) {
          setGameResult(result.data);
          setUiState('preparing'); 
        } else {
          toast({ variant: 'destructive', title: 'Erro ao Jogar', description: result.error });
          setUiState('ready');
        }
    } catch (error: any) {
        toast({ variant: 'destructive', title: 'Erro Inesperado', description: error.message });
        setUiState('ready');
    }
  };

  const handleNextGame = () => {
    window.location.reload();
  };

  const getBrushPos = (xRef: number, yRef: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: Math.floor(xRef - rect.left), y: Math.floor(yRef - rect.top) };
  };

  const scratch = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    const brushSize = (canvasRef.current?.width || 300) / 10;
    ctx.arc(x, y, brushSize, 0, 2 * Math.PI);
    ctx.fill();
  };

  const checkRevealPercentage = useCallback(() => {
    const ctx = getCanvasContext();
    const canvas = canvasRef.current;
    if (!ctx || !canvas || isRevealedRef.current) return;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imageData.data;
    let transparentPixels = 0;
    for (let i = 3; i < pixels.length; i += 4) {
      if (pixels[i] === 0) transparentPixels++;
    }
    if ((transparentPixels / (pixels.length / 4)) * 100 > 70) {
      handleAllRevealed();
    }
  }, [getCanvasContext, handleAllRevealed]);

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (uiState !== 'playing') return;
    setIsScratching(true);
    const ctx = getCanvasContext();
    if (!ctx) return;
    const { x, y } = getBrushPos(e.clientX, e.clientY);
    scratch(ctx, x, y);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isScratching || uiState !== 'playing') return;
    const ctx = getCanvasContext();
    if (!ctx) return;
    const { x, y } = getBrushPos(e.clientX, e.clientY);
    scratch(ctx, x, y);
  };

  const handleMouseUp = () => {
    setIsScratching(false);
    if (uiState === 'playing') checkRevealPercentage();
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (uiState !== 'playing') return;
    setIsScratching(true);
    const ctx = getCanvasContext();
    if (!ctx) return;
    const { x, y } = getBrushPos(e.touches[0].clientX, e.touches[0].clientY);
    scratch(ctx, x, y);
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (!isScratching || uiState !== 'playing') return;
    const ctx = getCanvasContext();
    if (!ctx) return;
    const { x, y } = getBrushPos(e.touches[0].clientX, e.touches[0].clientY);
    scratch(ctx, x, y);
  };

  const handleTouchEnd = () => {
    setIsScratching(false);
    if (uiState === 'playing') checkRevealPercentage();
  };

  const ResultDisplay = () => {
    if (uiState !== 'finished' || !gameResult) return null;
    const hasWon = gameResult.prizeWon && gameResult.prizeWon.value > 0;
    
    return (
        <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center text-center z-20 p-4 animate-in fade-in-50">
           {hasWon && <Confetti run={true} recycle={false} numberOfPieces={200} gravity={0.1} />}
           {hasWon ? <PartyPopper className="h-16 w-16 text-green-500" /> : <XCircle className="h-16 w-16 text-destructive" />}
            <h2 className="text-3xl font-bold mt-4 text-white">
                {hasWon ? `Você Ganhou ${formatCurrency(gameResult.prizeWon!.value)}!` : "Não foi dessa vez!"}
            </h2>
             <p className="text-muted-foreground mt-2">
                {gameResult.isFinalStep ? "Esta foi sua última raspadinha de recompensa." : "Prepare-se para a próxima raspadinha!"}
            </p>
            {gameResult.isFinalStep ? (
                <Button onClick={() => router.push('/')} className="mt-4"><Rocket className="mr-2"/>Ir para os Jogos</Button>
            ) : (
                <Button onClick={handleNextGame} className="mt-4"><Rocket className="mr-2"/>Jogar Próxima</Button>
            )}
        </div>
    );
  }

  if (uiState === 'loading') {
    return (
      <div className="flex items-center justify-center h-96">
        <LoaderCircle className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  if (uiState === 'error') {
    return (
        <div className="text-center py-10">
            <h3 className="text-lg font-semibold text-destructive">{errorMessage}</h3>
            <Button asChild variant="link" className="mt-4">
                <Link href="/">Voltar para a Home</Link>
            </Button>
        </div>
    );
  }
  
  if (uiState === 'ready' || uiState === 'preparing' || uiState === 'playing' || uiState === 'finished') {
    if (!card) {
       return <div className="text-center text-destructive">Erro: Dados da raspadinha não encontrados.</div>
    }
    return (
      <>
        <Card className="bg-secondary/50 border-none shadow-2xl overflow-hidden mb-4">
          <CardHeader className="p-0">
            <Image src={card.imageUrl} alt={card.name} width={500} height={250} className="w-full object-cover" data-ai-hint="scratch card game" />
          </CardHeader>
        </Card>

        <p className="text-center text-white font-bold mb-2">
          Raspadinha {currentStep} de {totalPlays}
        </p>

        <div className='relative aspect-[1/1] w-full bg-zinc-800'>
           {(uiState === 'playing' || uiState === 'finished') && gameResult && (
            <div className="absolute inset-0 z-0">
              <div className="grid grid-cols-3 w-full h-full">
                {gameResult.grid.map((prize, index) => (
                  <div key={index} className="bg-zinc-700 w-full h-full flex items-center justify-center border border-zinc-900">
                    {prize && <Image src={prize.imageUrl} alt={prize.name} width={80} height={80} className="object-contain" />}
                  </div>
                ))}
              </div>
            </div>
          )}

          {(uiState === 'preparing' || uiState === 'playing') && (
            <canvas
              ref={canvasRef}
              className="absolute inset-0 z-10 w-full h-full cursor-pointer touch-none"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            />
          )}

          {uiState === 'preparing' && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/50">
              <LoaderCircle className="h-16 w-16 text-primary animate-spin" />
            </div>
          )}

          <ResultDisplay />
        </div>
        
         <div className="mt-4">
            {uiState === 'ready' && (
                 <Button onClick={handleScratchAction} className="w-full h-14 bg-primary text-lg">Começar a Raspar</Button>
            )}
            {uiState === 'playing' && (
                <Button onClick={handleRevealAll} className="w-full" variant="secondary">Revelar Tudo</Button>
            )}
        </div>
      </>
    );
  }

  return null;
}
