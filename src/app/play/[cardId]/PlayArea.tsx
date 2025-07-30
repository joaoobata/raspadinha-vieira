
'use client';

import { useState, useRef, useEffect, useCallback }from 'react';
import Image from 'next/image';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LoaderCircle, PartyPopper, Rocket, XCircle } from 'lucide-react';
import type { Scratchcard, Prize } from './page';
import { playGame } from './actions';
import { useToast } from '@/hooks/use-toast';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '@/lib/firebase';
import Confetti from 'react-confetti';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';


interface PlayAreaProps {
  card: Scratchcard;
  scratchImageAsDataUri: string | null;
}

interface GameResult {
  grid: Prize[];
  prizeWon: Prize | null;
}

type UIState = 'idle' | 'loading' | 'preparing' | 'playing' | 'finished';

const formatCurrency = (value: number) => {
    return (value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

export default function PlayArea({ card, scratchImageAsDataUri }: PlayAreaProps) {
  const [user, loadingUser] = useAuthState(auth);
  const [uiState, setUiState] = useState<UIState>('idle');
  const [gameResult, setGameResult] = useState<GameResult | null>(null);
  const [isResultModalOpen, setIsResultModalOpen] = useState(false);
  const { toast } = useToast();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isScratching, setIsScratching] = useState(false);
  const isRevealedRef = useRef(false);

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

  const prepareCanvas = useCallback(() => {
    return new Promise<void>((resolve) => {
      const ctx = getCanvasContext();
      const canvas = canvasRef.current;
      if (!ctx || !canvas) return resolve();

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
        }
      } else {
        drawColor();
      }
    });
  }, [getCanvasContext, scratchImageAsDataUri]);

  useEffect(() => {
    if (uiState === 'preparing') {
      prepareCanvas().then(() => {
        setUiState('playing');
      });
    }
  }, [uiState, prepareCanvas]);


  const handleAllRevealed = useCallback(() => {
    if (isRevealedRef.current) return;
    isRevealedRef.current = true;
    setUiState('finished');
    setTimeout(() => setIsResultModalOpen(true), 500);
  }, []);
  
  const handleRevealAll = () => {
    if(uiState !== 'playing') return;
    const ctx = getCanvasContext();
    const canvas = canvasRef.current;
    if (ctx && canvas) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      handleAllRevealed();
    }
  };

  const handlePlay = async () => {
    if (!user) {
        toast({
            variant: 'destructive',
            title: 'Erro de Autenticação',
            description: 'Você precisa estar logado para jogar. Por favor, faça o login e tente novamente.',
        });
        return;
    }

    setUiState('loading');
    
    try {
        const idToken = await user.getIdToken();
        const result = await playGame(card, idToken);

        if (result.success && result.data) {
          setGameResult({ grid: result.data.grid, prizeWon: result.data.prizeWon });
          setUiState('preparing');
        } else {
          toast({
            variant: 'destructive',
            title: 'Erro!',
            description: result.error,
          });
          setUiState('idle');
        }
    } catch (error: any) {
        toast({
            variant: 'destructive',
            title: 'Erro Inesperado',
            description: error.message || 'Não foi possível completar a ação.',
        });
        setUiState('idle');
    }
  };
  
  const handlePlayAgain = () => {
    setUiState('idle');
    setGameResult(null);
    setIsResultModalOpen(false);
  };

  // Scratching logic
  const getBrushPos = (xRef: number, yRef: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: Math.floor(xRef - rect.left),
      y: Math.floor(yRef - rect.top),
    };
  };
  
  const scratch = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      const brushSize = (canvasRef.current?.width || 300) / 10; 
      ctx.arc(x, y, brushSize, 0, 2 * Math.PI); 
      ctx.fill();
  }
  
  const checkRevealPercentage = useCallback(() => {
    const ctx = getCanvasContext();
    const canvas = canvasRef.current;
    if (!ctx || !canvas || isRevealedRef.current) return;

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imageData.data;
    let transparentPixels = 0;

    for (let i = 3; i < pixels.length; i += 4) {
      if (pixels[i] === 0) {
        transparentPixels++;
      }
    }
    
    const revealPercentage = (transparentPixels / (pixels.length / 4)) * 100;

    if (revealPercentage > 70) {
      handleAllRevealed();
    }
  }, [getCanvasContext, handleAllRevealed]);

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (uiState !== 'playing') return;
    setIsScratching(true);
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
    setIsScratching(false);
    if(uiState === 'playing') checkRevealPercentage();
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (uiState !== 'playing') return;
    setIsScratching(true);
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
     setIsScratching(false);
     if(uiState === 'playing') checkRevealPercentage();
  }


  const isButtonDisabled = uiState === 'loading' || uiState === 'preparing' || loadingUser;
  
  const renderGameArea = () => {
     if (uiState === 'idle') {
       return (
        <Card className="bg-zinc-800/80 border-4 border-zinc-700/80 shadow-inner aspect-[1/1] p-4 flex flex-col items-center justify-center">
            <div className="text-center text-white">
                <h2 className="text-4xl font-black text-green-400 drop-shadow-lg [text-shadow:_2px_2px_0_rgb(0_0_0_/_40%)]">RASPE AQUI</h2>
                <p className="mt-4 font-semibold text-zinc-300">
                    Clique em "Comprar" para jogar
                </p>
            </div>
        </Card>
       );
     }
     
     if (uiState === 'loading' || (uiState === 'preparing' && !gameResult)) {
        return (
            <Card className="bg-zinc-800/80 border-4 border-zinc-700/80 shadow-inner aspect-[1/1] p-4 flex flex-col items-center justify-center">
                <LoaderCircle className="h-16 w-16 text-primary animate-spin" />
            </Card>
        );
     }

     if (gameResult) {
       return (
         <div className="w-full h-full relative rounded-md overflow-hidden aspect-[1/1] bg-zinc-800">
            {/* The prize grid, now only rendered when the canvas is ready and we are in playing state */}
            {(uiState === 'playing' || uiState === 'finished') && (
              <div className="absolute inset-0 z-0">
                  <div className="grid grid-cols-3 w-full h-full">
                      {gameResult.grid.map((prize, index) => (
                          <div key={index} className="bg-zinc-700 w-full h-full flex items-center justify-center border border-zinc-900">
                              <Image src={prize.imageUrl} alt={prize.name} width={80} height={80} className="object-contain" />
                          </div>
                      ))}
                  </div>
              </div>
            )}
            
            {/* The canvas, rendered during preparing and playing states */}
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
            {/* Preparing loader */}
            {uiState === 'preparing' && (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/50">
                  <LoaderCircle className="h-16 w-16 text-primary animate-spin" />
              </div>
            )}
         </div>
       )
     }

     return null; // Fallback, should not be reached
  }

  return (
    <>
      {gameResult?.prizeWon && gameResult.prizeWon.value > 0 && <Confetti run={isResultModalOpen} recycle={false} numberOfPieces={400} />}
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
            <Button onClick={handleRevealAll} className="w-full mt-2" variant="secondary">Revelar Tudo</Button>
        }
      </div>

      <div className="mt-4">
        {uiState === 'idle' || uiState === 'finished' ? (
          <Button 
            className="w-full h-16 text-xl font-bold bg-green-500 hover:bg-green-600 shadow-lg"
            onClick={uiState === 'idle' ? handlePlay : handlePlayAgain}
            disabled={isButtonDisabled}
          >
            {isButtonDisabled && uiState !== 'finished' ? (
              <LoaderCircle className="animate-spin" />
            ) : (
                uiState === 'finished' ? <><Rocket className="mr-2" /> Jogar Novamente</> : `Comprar e Raspar (${formatCurrency(card.price)})`
            )}
          </Button>
        ) : null}
      </div>
      
       <AlertDialog open={isResultModalOpen} onOpenChange={setIsResultModalOpen}>
        <AlertDialogContent>
          <AlertDialogHeader className="items-center">
             {gameResult?.prizeWon && gameResult.prizeWon.value > 0 ? (
                <PartyPopper className="h-16 w-16 text-green-500" />
            ) : (
                <XCircle className="h-16 w-16 text-destructive" />
            )}
            <AlertDialogTitle className="text-3xl text-center">
               {gameResult?.prizeWon && gameResult.prizeWon.value > 0 ? `Você Ganhou!` : `Não foi dessa vez!`}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-center text-lg">
                {gameResult?.prizeWon && gameResult.prizeWon.value > 0 ? (
                    <>
                    Parabéns! Você ganhou <span className="font-bold text-primary">{formatCurrency(gameResult.prizeWon.value)}</span>!
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
    </>
  );
}
