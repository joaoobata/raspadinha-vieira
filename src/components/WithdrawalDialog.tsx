
'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { useToast } from '@/hooks/use-toast';
import { LoaderCircle, Info, X, RotateCw } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { createWithdrawal } from '@/app/actions/withdraw';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { getSettings, SettingsData } from '@/app/admin/settings/actions';
import { Progress } from './ui/progress';

interface WithdrawalDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}

type PixKeyType = 'cpf' | 'cnpj' | 'phone' | 'email';

interface UserData {
    firstName: string;
    lastName: string;
    cpf: string;
    balance: number;
    prizeBalance: number;
    rolloverRequirement: number;
    rolloverProgress: number;
    role: 'influencer' | 'admin' | null;
}

export function WithdrawalDialog({ isOpen, onOpenChange }: WithdrawalDialogProps) {
  const [user] = useAuthState(auth);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [amount, setAmount] = useState('');
  const [pixKey, setPixKey] = useState('');
  const [pixKeyType, setPixKeyType] = useState<PixKeyType>('cpf');
  const [settings, setSettings] = useState<SettingsData | null>(null);
  
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const { toast } = useToast();
  
  // Real-time listener for user data (including balance and rollover)
  useEffect(() => {
    if (user && isOpen) {
      const userDocRef = doc(db, 'users', user.uid);
      const unsubscribe = onSnapshot(userDocRef, (doc) => {
        if (doc.exists()) {
          const data = doc.data();
          setUserData({
              firstName: data.firstName || '',
              lastName: data.lastName || '',
              cpf: data.cpf || '',
              balance: data.balance || 0,
              prizeBalance: data.prizeBalance || 0,
              rolloverRequirement: data.rolloverRequirement || 0,
              rolloverProgress: data.rolloverProgress || 0,
              role: data.role || null,
          });
        }
      });

      // Fetch settings once
      getSettings().then(result => {
          if(result.success && result.data) {
              setSettings(result.data);
          }
      });
      
      return () => unsubscribe();
    }
  }, [user, isOpen]);


  const handleWithdrawal = async () => {
    if (!user || !userData) {
        toast({ variant: 'destructive', title: 'Erro', description: 'Você precisa estar logado para sacar.' });
        return;
    }
    const withdrawalAmount = parseFloat(amount);
    const minWithdrawal = settings?.minWithdrawal ?? 30;

    if (isNaN(withdrawalAmount) || withdrawalAmount < minWithdrawal) {
      toast({
        variant: 'destructive',
        title: 'Valor Inválido',
        description: `O valor mínimo para saque é de ${formatCurrency(minWithdrawal)}.`,
      });
      return;
    }
    if (withdrawalAmount > userData.balance) {
         toast({
            variant: 'destructive',
            title: 'Saldo Insuficiente',
            description: 'O valor do saque não pode ser maior que o seu saldo disponível.',
        });
        return;
    }
     if (!pixKey || !pixKeyType) {
        toast({
            variant: 'destructive',
            title: 'Dados Inválidos',
            description: 'Por favor, preencha o tipo e a chave PIX.',
        });
        return;
    }
    if (!userData.cpf) {
        toast({
            variant: 'destructive',
            title: 'CPF Necessário',
            description: 'Seu CPF não está cadastrado. Por favor, atualize seus dados.',
        });
        return;
    }

    setLoading(true);

    try {
      const payload: Parameters<typeof createWithdrawal>[0] = {
        amount: withdrawalAmount,
        pixKey,
        pixKeyType,
        userId: user.uid,
        cpf: userData.cpf,
      };

      const result = await createWithdrawal(payload);

      if (result.success) {
        setSuccess(true);
        toast({
          title: 'Pedido de Saque Enviado!',
          description: 'Sua solicitação de saque foi enviada e está sendo processada.',
        });
      } else {
        toast({
          variant: 'destructive',
          title: 'Erro ao Solicitar Saque',
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

  const handleClose = () => {
    onOpenChange(false);
    // Reset state after a short delay to allow the dialog to close smoothly
    setTimeout(() => {
        setAmount('');
        setPixKey('');
        setPixKeyType('cpf');
        setLoading(false);
        setSuccess(false);
    }, 300);
  }
  
  const formatCurrency = (value: number) => {
    return (value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };
  
  const isRolloverComplete = (userData?.rolloverProgress ?? 0) >= (userData?.rolloverRequirement ?? 0);
  const rolloverPercentage = userData?.rolloverRequirement ? Math.min(100, ((userData.rolloverProgress || 0) / userData.rolloverRequirement) * 100) : 100;

  const renderContent = () => {
      if (!userData) {
          return (
              <div className='flex items-center justify-center p-10 h-64'>
                <LoaderCircle className="h-12 w-12 animate-spin text-primary" />
            </div>
          )
      }
      
       if (success) {
        return (
             <div className="space-y-4 py-4 text-center">
                <p className="text-lg font-medium">Sua solicitação foi enviada com sucesso!</p>
                <p className="text-sm text-muted-foreground">O valor será transferido para a chave PIX informada em breve. Você pode acompanhar o status na sua aba de transações.</p>
                <Button onClick={handleClose}>Fechar</Button>
            </div>
        )
      }
      
      return (
           <>
            <div className="space-y-4">
              <div className="relative">
                <div className="flex items-center justify-between h-11 w-full rounded-md border border-input bg-zinc-800 px-3 py-2 text-sm">
                    <span className="text-muted-foreground">Saldo sacável:</span>
                    <span className="font-bold text-lg text-primary">{formatCurrency(userData.balance)}</span>
                </div>
              </div>
              
              {userData.prizeBalance > 0 && (
                 <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg text-blue-300 text-sm">
                        <p className="font-bold">Você tem {formatCurrency(userData.prizeBalance)} em prêmios para desbloquear!</p>
                        <p className="text-xs mt-1">Faça seu primeiro depósito para transferir este valor para seu saldo sacável.</p>
                    </div>
              )}

              <div className="space-y-1">
                <Label htmlFor="amount">Valor do saque</Label>
                <Input
                  id="amount"
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="R$ 0,00"
                />
                 {settings?.minWithdrawal && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1"><Info className="h-3 w-3" /> Mínimo: {formatCurrency(settings.minWithdrawal)}</p>
                 )}
              </div>
              
              <div className="space-y-1">
                <Label htmlFor="pix-key-type">Tipo de chave Pix</Label>
                 <Select value={pixKeyType} onValueChange={(value) => setPixKeyType(value as PixKeyType)}>
                    <SelectTrigger id="pix-key-type">
                        <SelectValue placeholder="Selecione o tipo da chave" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="cpf">CPF</SelectItem>
                        <SelectItem value="cnpj">CNPJ</SelectItem>
                        <SelectItem value="email">E-mail</SelectItem>
                        <SelectItem value="phone">Telefone</SelectItem>
                    </SelectContent>
                </Select>
              </div>
              
               <div className="space-y-1">
                <Label htmlFor="pix-key">Chave Pix</Label>
                <Input
                  id="pix-key"
                  value={pixKey}
                  onChange={(e) => setPixKey(e.target.value)}
                  placeholder="000.000.000-00"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="beneficiary-name">Nome do beneficiário</Label>
                <Input
                  id="beneficiary-name"
                  readOnly
                  value={`${userData.firstName} ${userData.lastName}`}
                  className="bg-zinc-800"
                />
              </div>
               <div className="space-y-1">
                <Label htmlFor="beneficiary-cpf">CPF do beneficiário</Label>
                <Input
                  id="beneficiary-cpf"
                  readOnly
                  value={userData.cpf}
                  className="bg-zinc-800"
                />
              </div>

            </div>
            <DialogFooter className="flex-col gap-4 pt-4">
                {!isRolloverComplete && (
                    <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
                        <p className="font-bold flex items-center gap-2"><RotateCw className="h-4 w-4" />Rollover Pendente</p>
                        <p className="text-xs mt-2">Você precisa apostar mais {formatCurrency(userData.rolloverRequirement - userData.rolloverProgress)} para poder solicitar um saque.</p>
                        <Progress value={rolloverPercentage} className="mt-2 h-2" />
                    </div>
                )}
                 {userData.role === 'influencer' && (
                    <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-yellow-300 text-sm">
                        <p className="font-bold flex items-center gap-2">Saque Desabilitado</p>
                        <p className="text-xs mt-1">Contas de influenciador não estão autorizadas a realizar saques.</p>
                    </div>
                )}
              <Button onClick={handleWithdrawal} disabled={loading || !isRolloverComplete || userData.role === 'influencer'} className="w-full h-12 text-lg bg-green-500 hover:bg-green-600">
                {loading ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <><svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="mr-2"><path d="M17.8411 6.22424C17.6044 5.98634 17.2678 5.85714 16.9167 5.85714H7.08333C6.73223 5.85714 6.39563 5.98634 6.15889 6.22424C5.92215 6.46214 5.79286 6.80034 5.79286 7.15274V16.8472C5.79286 17.1996 5.92215 17.5378 6.15889 17.7757C6.39563 18.0136 6.73223 18.1429 16.9167 18.1429H16.9167C17.2678 18.1429 17.6044 18.0136 17.8411 17.7757C18.0779 17.5378 18.2071 17.1996 18.2071 16.8472V7.15274C18.2071 6.80034 18.0779 6.46214 17.8411 6.22424ZM7.08333 7.15274H16.9167V16.8472H7.08333V7.15274Z" fill="currentColor"/><path d="M9.625 10.4286C9.97609 10.4286 10.3127 10.5578 10.5494 10.7957C10.7862 11.0336 10.9154 11.3718 10.9154 11.7242C10.9154 12.0766 10.7862 12.4148 10.5494 12.6527C10.3127 12.8906 9.97609 13.0198 9.625 13.0198H8.33333V14.3154H7.04286V9.13314H9.625C9.97609 9.13314 10.3127 9.26234 10.5494 9.50024C10.7862 9.73814 10.9154 10.0763 10.9154 10.4286V10.4286ZM8.33333 11.7242H9.625V10.4286H8.33333V11.7242Z" fill="currentColor"/><path d="M12.9571 14.3154H11.6667V9.13314H12.9571V14.3154Z" fill="currentColor"/><path d="M15.4293 12.8395L16.9579 9.13314H15.6143L14.6543 11.8395H14.615L13.655 9.13314H12.3114L13.84 12.8395V14.3154H15.4293V12.8395Z" fill="currentColor"/></svg> Solicitar Saque</>
                }
              </Button>
               <div className="p-4 bg-secondary rounded-lg text-sm">
                    <h4 className="font-bold text-foreground mb-2 flex items-center gap-2"><Info className="h-4 w-4 text-primary" /> Informações importantes</h4>
                    <ul className="list-disc list-inside text-muted-foreground space-y-1 text-xs">
                        <li>Saques são processados em até 24 horas</li>
                        {settings?.minWithdrawal && (
                            <li>Valor mínimo para saque: {formatCurrency(settings.minWithdrawal)}</li>
                        )}
                        <li>Apenas um saque pendente por vez</li>
                        <li>Verifique se os dados estão corretos antes de confirmar</li>
                    </ul>
                </div>
            </DialogFooter>
          </>
      )
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md bg-zinc-900 border-zinc-800 p-6">
        <DialogHeader className="text-center">
          <DialogTitle className="text-2xl font-bold">Solicitar Saque</DialogTitle>
          <DialogDescription>
            Retire seus ganhos de forma rápida e segura
          </DialogDescription>
        </DialogHeader>
         <Button variant="ghost" size="icon" className="absolute top-2 right-2 text-zinc-400 hover:text-white" onClick={handleClose}>
            <X />
        </Button>
        {renderContent()}
      </DialogContent>
    </Dialog>
  );
}
