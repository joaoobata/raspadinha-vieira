
'use client';

import { useState, useRef, useEffect, useCallback }from 'react';
import Image from 'next/image';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LoaderCircle, PartyPopper, Rocket, XCircle, Zap, FastForward, Play, Pause } from 'lucide-react';
import type { Scratchcard, Prize } from './page';
import { playGame } from './actions';
import { useToast } from '@/hooks/use-toast';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '@/lib/firebase';
import Confetti from 'react-confetti';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useWindowSize } from 'react-use';

interface PlayAreaProps {
  card: Scratchcard;
  scratchImageAsDataUri: string | null;
  soundWinUrl: string | null;
  soundLoseUrl: string | null;
  soundScratchUrl: string | null;
}

interface GameResult {
  grid: Prize[];
  prizeWon: Prize | null;
}

type UIState = 'idle' | 'loading' | 'preparing' | 'playing' | 'revealing' | 'finished';
type PlaySpeed = 'normal' | 'fast' | 'turbo';

const formatCurrency = (value: number) => {
    return (value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

const speedSettings = {
    normal: { revealDelay: 75, finalPause: 750 },
    fast: { revealDelay: 40, finalPause: 350 },
    turbo: { revealDelay: 10, finalPause: 150 },
};

export default function PlayArea({ card, scratchImageAsDataUri, soundWinUrl, soundLoseUrl, soundScratchUrl }: PlayAreaProps) {
  const [user, loadingUser] = useAuthState(auth);
  const { toast } = useToast();
  const { width, height } = useWindowSize();

  const [uiState, setUiState] = useState<UIState>('idle');
  const [gameResult, setGameResult] = useState<GameResult | null>(null);
  const [isResultModalOpen, setIsResultModalOpen] = useState(false);
  
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isScratching, setIsScratching] = useState(false);
  
  const [playSpeed, setPlaySpeed] = useState<PlaySpeed>('normal');
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);

  const [autoPlayCount, setAutoPlayCount] = useState(10);
  const [autoPlayProgress, setAutoPlayProgress] = useState(0);
  const [autoPlayWinnings, setAutoPlayWinnings] = useState(0);
  const [isAutoPlayFinishedModalOpen, setIsAutoPlayFinishedModalOpen] = useState(false);

  const [winningIndexes, setWinningIndexes] = useState<Set<number>>(new Set());
  const [isGridVisible, setIsGridVisible] = useState(false);

  const winSoundRef = useRef<HTMLAudioElement | null>(null);
  const loseSoundRef = useRef<HTMLAudioElement | null>(null);
  const scratchSoundRef = useRef<HTMLAudioElement | null>(null);
   
  const isAutoPlayingRef = useRef(isAutoPlaying);
  useEffect(() => {
    isAutoPlayingRef.current = isAutoPlaying;
  }, [isAutoPlaying]);


   useEffect(() => {
    if (typeof Audio === 'undefined') return;

    if (!winSoundRef.current && soundWinUrl) {
      winSoundRef.current = new Audio(soundWinUrl);
    }
    if (!loseSoundRef.current && soundLoseUrl) {
      loseSoundRef.current = new Audio(soundLoseUrl);
    }
    if (!scratchSoundRef.current && soundScratchUrl) {
      scratchSoundRef.current = new Audio(soundScratchUrl);
      scratchSoundRef.current.loop = true;
    }
  }, [soundWinUrl, soundLoseUrl, soundScratchUrl]);

  useEffect(() => {
    const preventScroll = (e: TouchEvent) => {
        if (isScratching) {
            e.preventDefault();
        }
    };
    const touchTarget = canvasRef.current;
    touchTarget?.addEventListener('touchmove', preventScroll, { passive: false });
    return () => {
        touchTarget?.removeEventListener('touchmove', preventScroll);
    };
  }, [isScratching]);

  const getCanvasContext = useCallback(() => {
    const canvas = canvasRef.current;
    return canvas ? canvas.getContext('2d', { willReadFrequently: true }) : null;
  }, []);
  
  const resetGameState = useCallback(() => {
      setGameResult(null);
      setWinningIndexes(new Set());
      setIsResultModalOpen(false);
      setIsGridVisible(false);
  }, []);

  const prepareCanvas = useCallback(() => {
    return new Promise<void>((resolve, reject) => {
        setIsGridVisible(true);

        setTimeout(() => {
            const ctx = getCanvasContext();
            const canvas = canvasRef.current;
            if (!ctx || !canvas) {
                return resolve();
            }

            canvas.width = canvas.offsetWidth;
            canvas.height = canvas.offsetHeight;
            ctx.globalCompositeOperation = 'source-over';

            const drawColorAndResolve = () => {
                try {
                    ctx.fillStyle = '#A1A1AA';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    resolve();
                } catch(e) {
                    console.error("Error filling canvas:", e);
                    reject(e);
                }
            };

            if (scratchImageAsDataUri) {
                const img = new window.Image();
                img.src = scratchImageAsDataUri;
                img.onload = () => {
                    try {
                        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                        resolve();
                    } catch(e) {
                         console.error("Error drawing image on canvas:", e);
                         drawColorAndResolve();
                    }
                };
                img.onerror = (err) => {
                    console.error("Failed to load scratch image, falling back to color fill.", err);
                    drawColorAndResolve();
                };
            } else {
                drawColorAndResolve();
            }
        }, 10); 
    });
  }, [getCanvasContext, scratchImageAsDataUri]);

  const highlightWinningCombination = useCallback((currentResult: GameResult) => {
    if (!currentResult.prizeWon || currentResult.prizeWon.value === 0) return;
    const prizeCounts = new Map<string, number[]>();
    currentResult.grid.forEach((prize, index) => {
      if (!prizeCounts.has(prize.id)) prizeCounts.set(prize.id, []);
      prizeCounts.get(prize.id)!.push(index);
    });

    for (const [prizeId, indexes] of prizeCounts.entries()) {
      if (prizeId === currentResult.prizeWon.id && indexes.length >= 3) {
        setWinningIndexes(new Set(indexes));
        break;
      }
    }
  }, []);

  const showResult = useCallback((result: GameResult) => {
      if (result.prizeWon && result.prizeWon.value > 0) {
        if (isAutoPlayingRef.current) {
          setAutoPlayWinnings(prev => prev + result.prizeWon!.value);
        }
        winSoundRef.current?.play().catch(e => console.error("Error playing win sound:", e));
      } else {
        loseSoundRef.current?.play().catch(e => console.error("Error playing lose sound:", e));
      }
      setUiState('finished');
       if (!isAutoPlayingRef.current) {
        setIsResultModalOpen(true);
      }
  }, []);
  
  const animateManualReveal = useCallback(async (currentResult: GameResult) => {
    setUiState('revealing');
    const { revealDelay, finalPause } = speedSettings[playSpeed];
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }
    const allIndexes = Array.from({ length: 9 }, (_, i) => i);
    const shuffledIndexes = allIndexes.sort(() => Math.random() - 0.5);
    const revealedItems = new Set<number>();
    for (const index of shuffledIndexes) {
        revealedItems.add(index);
        setWinningIndexes(new Set(revealedItems)); 
        await new Promise(resolve => setTimeout(resolve, revealDelay));
    }
    highlightWinningCombination(currentResult);
    await new Promise(resolve => setTimeout(resolve, finalPause));
    showResult(currentResult);
  }, [playSpeed, showResult, highlightWinningCombination]);
  
  const animateAutoPlayReveal = useCallback(async (currentResult: GameResult) => {
      setUiState('revealing');
      const { revealDelay, finalPause } = speedSettings[playSpeed];
      const allIndexes = Array.from({ length: 9 }, (_, i) => i);
      const shuffledIndexes = allIndexes.sort(() => Math.random() - 0.5);
      const revealedItems = new Set<number>();
      for (const index of shuffledIndexes) {
          if (!isAutoPlayingRef.current) break;
          revealedItems.add(index);
          setWinningIndexes(new Set(revealedItems)); 
          await new Promise(resolve => setTimeout(resolve, revealDelay));
      }
      if (!isAutoPlayingRef.current) {
          setUiState('idle');
          return;
      }
      highlightWinningCombination(currentResult);
      await new Promise(resolve => setTimeout(resolve, finalPause));
      showResult(currentResult);
  }, [playSpeed, showResult, highlightWinningCombination]);
  
  const handleRevealAll = useCallback(async () => {
    if (!gameResult) return;
    await animateManualReveal(gameResult);
  }, [gameResult, animateManualReveal]);

  const handlePlay = async () => {
    if (!user) {
        toast({ variant: 'destructive', title: 'Erro de Autenticação', description: 'Você precisa estar logado para jogar.' });
        return;
    }

    if (uiState === 'playing' || uiState === 'preparing') {
        toast({
            variant: 'destructive',
            title: 'Jogo em Andamento',
            description: 'Por favor, conclua a raspadinha atual antes de comprar uma nova.',
        });
        return;
    }

    setUiState('loading');
    resetGameState();

    try {
        const idToken = await user.getIdToken();
        const result = await playGame(card, idToken);

        if (result.success && result.data) {
            setGameResult(result.data);
            setUiState('preparing');
        } else {
            toast({ variant: 'destructive', title: 'Erro!', description: result.error });
            setUiState('idle');
        }
    } catch (error: any) {
        toast({ variant: 'destructive', title: 'Erro Inesperado', description: error.message });
        setUiState('idle');
    }
  };

  useEffect(() => {
    if (uiState === 'preparing') {
        prepareCanvas().then(() => {
            setUiState('playing');
        });
    }
  }, [uiState, prepareCanvas]);

  const handlePlayAgain = () => {
    resetGameState();
    setUiState('idle');
  };
  
  const runGameLoop = useCallback(async (shouldRun: boolean) => {
    if (!shouldRun) return;

    setAutoPlayProgress(0);
    setAutoPlayWinnings(0);

    for (let i = 1; i <= autoPlayCount; i++) {
        if (!isAutoPlayingRef.current) break;

        setAutoPlayProgress(i);
        setUiState('loading');
        resetGameState();

        let localGameResult: GameResult | null = null;
        try {
            const result = await playGame(card, await user!.getIdToken());
            if (result.success && result.data) {
                localGameResult = result.data;
                setGameResult(result.data);
            } else {
                toast({ variant: 'destructive', title: 'Erro no Jogo Automático', description: result.error });
                setIsAutoPlaying(false);
                break;
            }
        } catch (e) {
            toast({ variant: 'destructive', title: 'Erro no Jogo Automático', description: (e as Error).message });
            setIsAutoPlaying(false);
            break;
        }
        
        setIsGridVisible(true);
        await new Promise(r => setTimeout(r, 10));
        
        if (localGameResult) {
            await animateAutoPlayReveal(localGameResult);
        }
        
        if (!isAutoPlayingRef.current) break;
        await new Promise(r => setTimeout(r, 1000));
    }
    
    if (isAutoPlayingRef.current) {
        setIsAutoPlayFinishedModalOpen(true);
    } else {
        toast({ title: 'Jogo Automático Pausado' });
    }
    
    setIsAutoPlaying(false);
    setUiState('idle');
  }, [autoPlayCount, user, card, resetGameState, toast, animateAutoPlayReveal]);

  useEffect(() => {
      if (isAutoPlaying) {
          runGameLoop(true);
      }
  }, [isAutoPlaying, runGameLoop]);

  const handleAutoPlay = () => {
      setIsAutoPlaying(prev => !prev);
  };
  

  const getBrushPos = useCallback((xRef: number, yRef: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: Math.floor(xRef - rect.left), y: Math.floor(yRef - rect.top) };
  }, []);

  const checkRevealPercentage = useCallback(() => {
    if (!gameResult) return;
    const ctx = getCanvasContext();
    const canvas = canvasRef.current;
    if (!ctx || !canvas) return;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imageData.data;
    let transparentPixels = 0;
    for (let i = 3; i < pixels.length; i += 4) {
      if (pixels[i] === 0) transparentPixels++;
    }
    if ((transparentPixels / (pixels.length / 4)) * 100 > 70) {
      animateManualReveal(gameResult);
    }
  }, [getCanvasContext, gameResult, animateManualReveal]);

  const scratch = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      const brushSize = (canvasRef.current?.width || 300) / 10; 
      ctx.arc(x, y, brushSize, 0, 2 * Math.PI); 
      ctx.fill();
  }
  
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (uiState !== 'playing') return;
    setIsScratching(true);
    scratchSoundRef.current?.play().catch(e => console.error("Error playing scratch sound:", e));
    const ctx = getCanvasContext();
    if(!ctx) return;
    const { x, y } = getBrushPos(e.clientX, e.clientY);
    scratch(ctx, x, y);
  };
  
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isScratching || uiState !== 'playing') return;
    const ctx = getCanvasContext();
    if(!ctx) return;
    const { x, y } = getBrushPos(e.clientX, e.clientY);
    scratch(ctx, x, y);
  };

  const handleMouseUp = () => {
    if (uiState !== 'playing') return;
    setIsScratching(false);
    scratchSoundRef.current?.pause();
    checkRevealPercentage();
  };
  
  const handleMouseLeave = () => {
    if (uiState !== 'playing') return;
    setIsScratching(false);
    scratchSoundRef.current?.pause();
  }

  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (uiState !== 'playing') return;
    setIsScratching(true);
    scratchSoundRef.current?.play().catch(e => console.error("Error playing scratch sound:", e));
    const ctx = getCanvasContext();
    if(!ctx) return;
    const { x, y } = getBrushPos(e.touches[0].clientX, e.touches[0].clientY);
    scratch(ctx, x, y);
  }

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if(!isScratching || uiState !== 'playing') return;
    const ctx = getCanvasContext();
    if(!ctx) return;
    const { x, y } = getBrushPos(e.touches[0].clientX, e.touches[0].clientY);
    scratch(ctx, x, y);
  }

  const handleTouchEnd = () => {
     if (uiState !== 'playing') return;
     setIsScratching(false);
     scratchSoundRef.current?.pause();
     checkRevealPercentage();
  }

  const isButtonDisabled = uiState === 'loading' || uiState === 'preparing' || uiState === 'playing' || uiState === 'revealing' || loadingUser || isAutoPlaying;
  
  const renderGameArea = () => {
    if (uiState === 'idle' || uiState === 'loading') {
      return (
        <Card className="bg-zinc-800/80 border-4 border-zinc-700/80 shadow-inner aspect-[1/1] p-4 flex flex-col items-center justify-center">
          {uiState === 'loading' ? (
            <LoaderCircle className="h-16 w-16 text-primary animate-spin" />
          ) : (
            <div className="text-center text-white">
              <h2 className="text-4xl font-black text-green-400 drop-shadow-lg [text-shadow:_2px_2px_0_rgb(0_0_0_/_40%)]">RASPE AQUI</h2>
            </div>
          )}
        </Card>
      );
    }
  
    return (
        <div className="w-full h-full relative rounded-md overflow-hidden aspect-[1/1] bg-zinc-800">
            {isGridVisible && (
              <div className="absolute inset-0 z-0">
                  <div className="grid grid-cols-3 w-full h-full">
                  {gameResult && gameResult.grid.map((prize, index) => (
                      <div key={index} className={cn(
                          "bg-zinc-700 w-full h-full flex items-center justify-center border border-zinc-900 transition-all duration-300",
                           (winningIndexes.has(index)) && "animate-pulse bg-green-900/50 border-2 border-green-500",
                           (uiState !== 'revealing' || winningIndexes.has(index)) && 'opacity-100',
                           uiState === 'revealing' && !winningIndexes.has(index) && 'opacity-0'
                      )}>
                          <Image 
                              src={prize.imageUrl} 
                              alt={prize.name} 
                              width={80} 
                              height={80} 
                              className={cn(
                                "object-contain transition-all duration-500 ease-in-out",
                                uiState === 'revealing' && !winningIndexes.has(index) ? 'opacity-0 scale-50' : 'opacity-100 scale-105'
                              )}
                          />
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
                onMouseLeave={handleMouseLeave}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                />
            )}
        </div>
    );
  };
  

  return (
    <>
      {isResultModalOpen && gameResult?.prizeWon && gameResult.prizeWon.value > 0 && (
           <Confetti
              width={width}
              height={height}
              recycle={false}
              numberOfPieces={400}
              className="!fixed top-0 left-0 w-full h-full z-10"
          />
      )}
      <AlertDialog open={isResultModalOpen} onOpenChange={setIsResultModalOpen}>
        <AlertDialogContent>
          <AlertDialogHeader className="items-center">
             {gameResult?.prizeWon && gameResult.prizeWon.value > 0 ? (
                <Image src={gameResult.prizeWon.imageUrl} alt={gameResult.prizeWon.name} width={100} height={100} className="rounded-lg mt-4" />
            ) : (
                <XCircle className="h-16 w-16 text-destructive" />
            )}
            <AlertDialogTitle className="text-3xl text-center">
               {gameResult?.prizeWon && gameResult.prizeWon.value > 0 ? `Você Ganhou!` : `Não foi dessa vez!`}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-center text-lg">
                {gameResult?.prizeWon && gameResult.prizeWon.value > 0 ? (
                    <>
                    Parabéns! Você ganhou <span className="font-bold text-primary">{gameResult.prizeWon.name} ({formatCurrency(gameResult.prizeWon.value)})</span>!
                    </>
                ) : (
                    "Mais sorte na próxima! A sorte grande pode estar na próxima raspadinha."
                )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={handlePlayAgain} className="w-full">
               <Rocket className="mr-2 h-4 w-4" /> Jogar Novamente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      <AlertDialog open={isAutoPlayFinishedModalOpen} onOpenChange={setIsAutoPlayFinishedModalOpen}>
        <AlertDialogContent>
          <AlertDialogHeader className="items-center">
            <PartyPopper className="h-16 w-16 text-primary" />
            <AlertDialogTitle className="text-3xl text-center">Jogo Automático Concluído</AlertDialogTitle>
            <AlertDialogDescription className="text-center text-lg">
                Você jogou {autoPlayCount} rodadas e ganhou um total de{' '}
                <span className="font-bold text-primary">{formatCurrency(autoPlayWinnings)}</span>!
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setIsAutoPlayFinishedModalOpen(false)} className="w-full">
               Fechar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Card className="bg-secondary/50 border-none shadow-2xl overflow-hidden mb-4">
        <CardHeader className="p-0">
          <Image src={card.imageUrl} alt={card.name} width={500} height={250} className="w-full object-cover" data-ai-hint="scratch card game" />
          <div className="absolute top-4 right-4 bg-black/50 text-white text-md font-bold px-4 py-1.5 rounded-full border-2 border-primary">
            {formatCurrency(card.price)}
          </div>
        </CardHeader>
      </Card>
      
      <div className='relative'>
        {renderGameArea()}
        {(uiState === 'playing') && 
            <Button onClick={handleRevealAll} className="w-full mt-2" variant="secondary">
                Revelar Tudo
            </Button>
        }
      </div>

       <div className="mt-4 space-y-4">
        <Card className="p-3 bg-zinc-800/50 border-zinc-700">
          <div className="grid grid-cols-3 gap-2">
            {(['normal', 'fast', 'turbo'] as PlaySpeed[]).map(speed => (
              <Button 
                key={speed} 
                variant={playSpeed === speed ? 'secondary' : 'ghost'} 
                onClick={() => setPlaySpeed(speed)}
                className="capitalize flex items-center gap-2"
              >
                {speed === 'fast' && <FastForward/>}
                {speed === 'turbo' && <Zap/>}
                {speed}
              </Button>
            ))}
          </div>
        </Card>
        
        <div className="grid grid-cols-2 gap-4">
            <Input 
                type="number" 
                placeholder="Rodadas"
                value={autoPlayCount}
                onChange={(e) => setAutoPlayCount(parseInt(e.target.value) || 10)}
                className="h-16 text-center text-lg"
                disabled={isAutoPlaying}
            />
             <Button className="w-full h-16 text-lg font-bold" onClick={handleAutoPlay} disabled={isButtonDisabled && !isAutoPlaying}>
                {isAutoPlaying ? <><Pause className="mr-2" /> Parar</> : <><Play className="mr-2" /> Auto</>}
            </Button>
        </div>

        <Button 
            className="w-full h-16 text-xl font-bold bg-green-500 hover:bg-green-600 shadow-lg"
            onClick={uiState === 'finished' ? handlePlayAgain : handlePlay}
            disabled={isButtonDisabled}
        >
            {isButtonDisabled && uiState !== 'idle' ? (
                <LoaderCircle className="animate-spin" />
            ) : (
                uiState === 'finished' ? <><Rocket className="mr-2" /> Jogar Novamente</> : `Comprar e Raspar (${formatCurrency(card.price)})`
            )}
        </Button>
      </div>

       {isAutoPlaying && (
            <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-secondary/80 backdrop-blur-sm p-3 rounded-lg shadow-lg text-center w-80 border border-border">
                <p className="font-bold">Jogo Automático Ativado</p>
                <p className="text-sm text-muted-foreground">Rodada: {autoPlayProgress} / {autoPlayCount}</p>
                <p className="text-sm text-muted-foreground">Ganhos: {formatCurrency(autoPlayWinnings)}</p>
            </div>
        )}
    </>
  );
}
