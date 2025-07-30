
'use client';

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from '@/components/ui/alert-dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { createDeposit } from '@/app/actions/deposit';
import { useToast } from '@/hooks/use-toast';
import { LoaderCircle, CheckCircle, ShieldCheck, Info, X, ArrowRight } from 'lucide-react';
import Image from 'next/image';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { getSettings, SettingsData } from '@/app/admin/settings/actions';
import { getBanners, BannerContent } from '@/app/admin/banners/actions';
import { cn } from '@/lib/utils';


interface DepositDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}

interface PixData {
    code: string;
    base64: string;
    identifier: string;
}

function CancelDepositDialog({ open, onOpenChange, onConfirm }: { open: boolean, onOpenChange: (open: boolean) => void, onConfirm: () => void }) {
    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent className="bg-zinc-800 border-zinc-700 text-white max-w-sm p-8">
                <AlertDialogHeader className="text-center items-center">
                    <AlertDialogTitle className="text-2xl font-bold">Tem certeza que deseja sair?</AlertDialogTitle>
                    <AlertDialogDescription className="text-zinc-400">
                       Não perca sua oferta especial! Finalize o depósito agora e ganhe um bônus exclusivo.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="flex-col gap-2 mt-4">
                    <Button onClick={() => onOpenChange(false)} className="w-full bg-green-500 hover:bg-green-600 text-black font-bold h-12 text-base">
                        Continuar Depositando <ArrowRight className="ml-2" />
                    </Button>
                    <Button onClick={onConfirm} variant="ghost" className="w-full hover:bg-transparent hover:text-zinc-300 text-zinc-400">
                        <X className="mr-2 h-4 w-4" /> Sair mesmo assim
                    </Button>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}

const quickDepositOptions = [
    { amount: 20, label: '+Querido', highlight: true },
    { amount: 40, label: '+Recomendado' },
    { amount: 80, label: '+Chances' },
    { amount: 200, label: '+Chances' },
]

export function DepositDialog({ isOpen, onOpenChange }: DepositDialogProps) {
  const [user] = useAuthState(auth);
  const [amount, setAmount] = useState('');
  const [selectedQuickAmount, setSelectedQuickAmount] = useState<number | null>(null);
  const [fullName, setFullName] = useState('');
  const [cpf, setCpf] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [depositBanner, setDepositBanner] = useState<BannerContent | null>(null);
  
  const [loading, setLoading] = useState(false);
  const [pixData, setPixData] = useState<PixData | null>(null);
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const { toast } = useToast();
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  
  const resetState = () => {
    setAmount('');
    setSelectedQuickAmount(null);
    setPixData(null);
    setPaymentConfirmed(false);
    setLoading(false);
  };

  useEffect(() => {
    const fetchInitialData = async () => {
        if(user) {
            const userDocRef = doc(db, 'users', user.uid);
            const userDocSnap = await getDoc(userDocRef);
            if (userDocSnap.exists()) {
                const userData = userDocSnap.data();
                setFullName(`${userData.firstName} ${userData.lastName}`);
                setCpf(userData.cpf || '');
                setEmail(userData.email || '');
                setPhone(userData.phone || '');
            }
        }
        const settingsResult = await getSettings();
        if (settingsResult.success && settingsResult.data) {
            setSettings(settingsResult.data);
        }
        const bannersResult = await getBanners();
        if (bannersResult.success && bannersResult.data?.deposit) {
            setDepositBanner(bannersResult.data.deposit);
        }
    }
    if (isOpen) {
        resetState();
        fetchInitialData();
    }
  }, [user, isOpen]);

  // Real-time listener for transaction status
   useEffect(() => {
    if (!pixData?.identifier) return;

    // Listener now uses the Firestore document ID returned by the createDeposit action
    const transactionRef = doc(db, "transactions", pixData.identifier);
    const unsubscribe = onSnapshot(transactionRef, (doc) => {
      if (doc.exists() && doc.data().status === 'COMPLETED') {
        setPaymentConfirmed(true);
      }
    }, (error) => {
        console.error("Error listening to transaction status:", error);
    });

    return () => unsubscribe();
}, [pixData?.identifier]);


  const handleDeposit = async () => {
    if (!user) {
        toast({ variant: 'destructive', title: 'Erro', description: 'Você precisa estar logado para depositar.' });
        return;
    }

    const depositAmount = parseFloat(amount.replace(',', '.'));
    const minDeposit = settings?.minDeposit ?? 10;

    if (isNaN(depositAmount) || depositAmount < minDeposit) {
      toast({
        variant: 'destructive',
        title: 'Valor Inválido',
        description: `O valor do depósito deve ser de no mínimo ${minDeposit.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}.`,
      });
      return;
    }
     if (!cpf) {
      toast({
        variant: 'destructive',
        title: 'Dados Incompletos',
        description: 'Por favor, preencha o seu CPF.',
      });
      return;
    }


    setLoading(true);
    setPixData(null);

    try {
      const result = await createDeposit({
        amount: depositAmount,
        fullName,
        cpf,
        userId: user.uid,
        email,
        phone,
      });
      if (result.success && result.data) {
        setPixData(result.data);
      } else {
        toast({
          variant: 'destructive',
          title: 'Erro ao gerar PIX',
          description: result.error || 'Ocorreu um erro desconhecido.',
        });
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro Inesperado',
        description: 'Não foi possível se comunicar com o servidor.',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCopyToClipboard = () => {
    if (pixData?.code) {
      navigator.clipboard.writeText(pixData.code);
      toast({ title: 'Copiado!', description: 'Código PIX copiado para a área de transferência.' });
    }
  };
  
  const handleCloseAttempt = () => {
    if (!pixData && !paymentConfirmed) {
        setShowCancelConfirm(true);
    } else {
        onOpenChange(false);
    }
  };

  const handleConfirmCancel = () => {
    setShowCancelConfirm(false);
    onOpenChange(false);
  }

  const handleQuickAmountSelect = (value: number) => {
    setSelectedQuickAmount(value);
    setAmount(value.toFixed(2).replace('.', ','));
  }
  
  const minDepositText = settings?.minDeposit 
    ? `Mínimo: ${settings.minDeposit.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`
    : '';

  const renderContent = () => {
    if (loading) {
        return (
            <div className='flex items-center justify-center p-10 h-96'>
                <LoaderCircle className="h-16 w-16 animate-spin text-primary" />
            </div>
        );
    }
    
    if (paymentConfirmed) {
        return (
             <div className="space-y-4 py-4 text-center">
                <CheckCircle className="h-16 w-16 text-green-500 mx-auto" />
                <p className="text-lg font-medium text-white">Pagamento Confirmado!</p>
                <p className="text-sm text-muted-foreground">O valor já foi adicionado ao seu saldo. Você já pode jogar!</p>
                <Button onClick={() => onOpenChange(false)}>Fechar</Button>
            </div>
        )
    }
    
    if (pixData) {
        return (
             <div className="space-y-4 py-4">
                <p className='text-center text-sm font-semibold text-yellow-400 animate-pulse'>Aguardando pagamento...</p>
                <div className="flex justify-center">
                <Image src={`data:image/png;base64,${pixData.base64}`} alt="PIX QR Code" width={250} height={250} />
                </div>
                <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                        <Input id="pix-code" readOnly value={pixData.code} className="text-xs" />
                        <Button onClick={handleCopyToClipboard}>Copiar</Button>
                    </div>
                </div>
                <p className="text-center text-xs text-muted-foreground pt-4">Após o pagamento, o saldo será atualizado automaticamente.</p>
            </div>
        );
    }
    
    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
                {quickDepositOptions.map(opt => (
                     <button 
                        key={opt.amount} 
                        onClick={() => handleQuickAmountSelect(opt.amount)}
                        className={cn(
                            "p-3 rounded-lg text-left relative transition-all",
                            selectedQuickAmount === opt.amount 
                                ? 'bg-primary text-primary-foreground shadow-lg' 
                                : 'bg-secondary hover:bg-secondary/80'
                        )}
                    >
                        <span className="absolute top-1.5 right-2 text-xs font-semibold bg-yellow-500 text-black px-2 py-0.5 rounded-full">{opt.label}</span>
                        <p className="text-lg font-bold">{opt.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                    </button>
                ))}
            </div>
            
            <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                   <span className="text-primary font-bold text-lg">$</span> Valor do depósito
                </label>
                <Input 
                    type="text" 
                    value={amount}
                    onChange={(e) => {
                        setAmount(e.target.value);
                        setSelectedQuickAmount(null); // Deselect quick amount
                    }}
                    placeholder="0,00"
                    className="h-12 text-lg"
                />
            </div>
            <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                   <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-primary"><path d="M20 5H4C3.44772 5 3 5.44772 3 6V18C3 18.5523 3.44772 19 4 19H20C20.5523 19 21 18.5523 21 18V6C21 5.44772 20.5523 5 20 5ZM19 17H5V7H19V17Z" fill="currentColor"></path><path d="M8 11H12V13H8V11Z" fill="currentColor"></path></svg>
                   CPF do titular
                </label>
                <Input
                    value={cpf}
                    onChange={(e) => setCpf(e.target.value)}
                    placeholder="000.000.000-00"
                    className="h-12 text-lg"
                />
            </div>

            <div className="flex justify-between items-center text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><Info className="h-3 w-3" /> {minDepositText}</span>
                <span>Máximo: R$ 5.000,00</span>
            </div>

            <Button onClick={handleDeposit} disabled={loading} className="w-full h-14 text-lg bg-green-600 hover:bg-green-700">
                {loading 
                    ? <LoaderCircle className="animate-spin" /> 
                    : <><svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M14 6H16V8H14V6Z" fill="currentColor"></path><path d="M14 10H16V12H14V10Z" fill="currentColor"></path><path d="M14 14H16V16H14V14Z" fill="currentColor"></path><path d="M18 6H20V8H18V6Z" fill="currentColor"></path><path d="M18 10H20V12H18V10Z" fill="currentColor"></path><path d="M18 14H20V16H18V14Z" fill="currentColor"></path><path d="M10 14H12V16H10V14Z" fill="currentColor"></path><path d="M6 14H8V16H6V14Z" fill="currentColor"></path><path d="M10 18H12V20H10V18Z" fill="currentColor"></path><path d="M6 18H8V20H6V18Z" fill="currentColor"></path><path d="M14 18H16V20H14V18Z" fill="currentColor"></path><path d="M18 18H20V20H18V18Z" fill="currentColor"></path><path d="M6 10H8V12H6V10Z" fill="currentColor"></path><path d="M10 10H12V12H10V10Z" fill="currentColor"></path><path d="M10 6H12V8H10V6Z" fill="currentColor"></path><path d="M6 6H8V8H6V6Z" fill="currentColor"></path><path fillRule="evenodd" clipRule="evenodd" d="M22 2H2V22H22V2ZM20 4H4V20H20V4Z" fill="currentColor"></path></svg> Gerar PIX Instantâneo</>
                }
            </Button>
        </div>
    );
  };


  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open ? handleCloseAttempt() : onOpenChange(true)}>
        <DialogContent className="sm:max-w-md bg-zinc-900 border-zinc-800 text-white p-6">
              <DialogHeader>
                <DialogTitle className="sr-only">Realizar um Depósito</DialogTitle>
              </DialogHeader>
              <Button variant="ghost" size="icon" className="absolute top-2 right-2 text-zinc-400 hover:text-white" onClick={handleCloseAttempt}>
                  <X />
              </Button>
              {depositBanner?.url && (
                  <div className="w-full h-24 bg-cover bg-center rounded-lg" style={{backgroundImage: `url(${depositBanner.url})`}}>
                  </div>
              )}
               <div className="flex items-center gap-2 p-2 rounded-lg bg-secondary/80 text-sm">
                  <ShieldCheck className="h-5 w-5 text-primary" />
                  <span>Pagamento seguro</span>
              </div>
              {renderContent()}
        </DialogContent>
      </Dialog>
      <CancelDepositDialog
        open={showCancelConfirm}
        onOpenChange={setShowCancelConfirm}
        onConfirm={handleConfirmCancel}
      />
    </>
  );
}
