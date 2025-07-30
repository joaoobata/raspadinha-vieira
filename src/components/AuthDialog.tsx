
'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import { Label } from './ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { LoaderCircle, AlertCircle, User, Phone, Lock, Mail, FileText, CheckCircle, ArrowRight, X, PartyPopper } from 'lucide-react';
import { useSignInWithEmailAndPassword, useCreateUserWithEmailAndPassword, useSendPasswordResetEmail } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { updateProfile } from 'firebase/auth';
import { logSystemEvent } from '@/lib/logging';
import { getBanners, BannerContent } from '@/app/admin/banners/actions';
import { getSignupRewardSettings } from '@/app/admin/signup-rewards/actions';
import { useForm } from 'react-hook-form';
import { trackServerEvent } from '@/lib/tracking';

interface AuthDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  defaultTab?: 'login' | 'signup';
}

function formatCPF(value: string) {
  const onlyNums = value.replace(/[^\d]/g, '');
  if (onlyNums.length <= 3) return onlyNums;
  if (onlyNums.length <= 6) return `${onlyNums.slice(0, 3)}.${onlyNums.slice(3)}`;
  if (onlyNums.length <= 9) return `${onlyNums.slice(0, 3)}.${onlyNums.slice(3, 6)}.${onlyNums.slice(6)}`;
  return `${onlyNums.slice(0, 3)}.${onlyNums.slice(3, 6)}.${onlyNums.slice(6, 9)}-${onlyNums.slice(9, 11)}`;
}

function formatPhone(value: string) {
  const onlyNums = value.replace(/[^\d]/g, '');
  if (onlyNums.length <= 2) return `(${onlyNums}`;
  if (onlyNums.length <= 6) return `(${onlyNums.slice(0, 2)}) ${onlyNums.slice(2)}`;
  if (onlyNums.length <= 10) return `(${onlyNums.slice(0, 2)}) ${onlyNums.slice(2, 6)}-${onlyNums.slice(6)}`;
  return `(${onlyNums.slice(0, 2)}) ${onlyNums.slice(2, 7)}-${onlyNums.slice(7, 11)}`;
}

function isValidCPF(cpf: string): boolean {
    if (typeof cpf !== 'string') return false;
    cpf = cpf.replace(/[^\d]+/g, '');
    if (cpf.length !== 11 || !!cpf.match(/(\d)\1{10}/)) return false;
    const digits = cpf.split('').map(Number);
    const validator = (rest: number[]) => {
        const sum = rest.reduce((s, e, i) => s + e * (rest.length + 1 - i), 0);
        const rem = (sum * 10) % 11;
        return rem < 10 ? rem : 0;
    };
    return validator(digits.slice(0, 9)) === digits[9] && validator(digits.slice(0, 10)) === digits[10];
}

function isValidPhone(phone: string): boolean {
    const phoneRegex = /^\d{10,11}$/;
    return phoneRegex.test(phone.replace(/\D/g, ''));
}


function LoginForm({ onLoginSuccess, onSwitchToSignup }: { onLoginSuccess: () => void; onSwitchToSignup: () => void; }) {
  const [loginView, setLoginView] = useState<'login' | 'forgot-password'>('login');
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [customError, setCustomError] = useState<string | null>(null);
  
  const [signInWithEmailAndPassword, user, loading, error] = useSignInWithEmailAndPassword(auth);
  const [sendPasswordResetEmail, sending, resetError] = useSendPasswordResetEmail(auth);
  const [emailSent, setEmailSent] = useState(false);

  
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setCustomError(null);
    const successUser = await signInWithEmailAndPassword(email, password);
    if (successUser) {
      await logSystemEvent(successUser.user.uid, 'user', 'USER_LOGIN', { email: successUser.user.email }, 'SUCCESS');
      onLoginSuccess();
    } else if (error) {
       if (error.code === 'auth/user-disabled') {
         setCustomError('Sua conta foi banida. Entre em contato com o suporte para mais informações.');
       }
    }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setCustomError(null);
    setEmailSent(false);
    const success = await sendPasswordResetEmail(email);
    if(success) {
      setEmailSent(true);
    }
  }
  
  const displayError = customError || (error && error.message.includes('auth/invalid-credential') ? 'Email ou senha inválidos.' : error?.message.replace('Firebase: ', ''));

  if (loginView === 'forgot-password') {
    return (
      <form onSubmit={handlePasswordReset} className="space-y-6">
        <h3 className="text-lg font-semibold text-white">Recuperar Senha</h3>
        {emailSent ? (
          <div className="flex flex-col items-center justify-center text-center p-4">
              <CheckCircle className="h-12 w-12 text-green-500 mb-4" />
              <p className="font-medium">E-mail enviado com sucesso!</p>
              <p className="text-sm text-muted-foreground">
                  Verifique sua caixa de entrada (e spam) para o link de redefinição.
              </p>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Digite seu e-mail para receber um link de redefinição de senha.
            </p>
            <div className="space-y-2">
                <Label htmlFor="reset-email">Email</Label>
                <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <Input id="reset-email" type="email" placeholder="seu@email.com" required value={email} onChange={(e) => setEmail(e.target.value)} className="pl-10" />
                </div>
            </div>
            {resetError && (
              <div className="flex items-center p-2 text-sm text-destructive bg-destructive/10 rounded-md border border-destructive/20">
                <AlertCircle className="h-4 w-4 mr-2"/>
                <p>{resetError.message.replace('Firebase: ', '')}</p>
              </div>
            )}
            <Button className="w-full bg-primary" type="submit" disabled={sending}>
              {sending && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}
              Enviar Link
            </Button>
          </>
        )}
         <p className="text-center text-sm text-muted-foreground">
            <button type="button" onClick={() => setLoginView('login')} className="underline text-primary hover:text-primary/80">Voltar para o Login</button>
        </p>
      </form>
    );
  }

  return (
     <form onSubmit={handleSignIn} className="space-y-6">
        <h3 className="text-lg font-semibold text-white">Acesse sua conta</h3>
        <div className="space-y-4">
            <div className="space-y-2">
                <Label htmlFor="login-email">Email</Label>
                <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <Input id="login-email" type="email" placeholder="seu@email.com" required value={email} onChange={(e) => setEmail(e.target.value)} className="pl-10" />
                </div>
            </div>
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <Label htmlFor="login-password">Senha</Label>
                    <button type="button" onClick={() => setLoginView('forgot-password')} className="text-xs text-muted-foreground hover:text-primary underline">Esqueci minha senha</button>
                </div>
                <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <Input id="login-password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="pl-10" />
                </div>
            </div>
        </div>
         {displayError && (
              <div className="flex items-center p-2 text-sm text-destructive bg-destructive/10 rounded-md border border-destructive/20">
                <AlertCircle className="h-4 w-4 mr-2"/>
                <p>{displayError}</p>
              </div>
        )}
        <Button className="w-full bg-primary" type="submit" disabled={loading}>
            {loading && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}
            Entrar
        </Button>
         <p className="text-center text-sm text-muted-foreground">
            Não tem uma conta?{' '}
            <button type="button" onClick={onSwitchToSignup} className="underline text-primary hover:text-primary/80">Crie agora</button>
        </p>
    </form>
  )
}

function SignupForm({ onSignupSuccess, onSwitchToLogin, onFormInteraction }: { onSignupSuccess: () => void; onSwitchToLogin: () => void; onFormInteraction: () => void; }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const referredBy = searchParams.get('ref');

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [cpf, setCpf] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [validationError, setValidationError] = useState('');
  
  const [signupComplete, setSignupComplete] = useState(false);
  const [rewardDetails, setRewardDetails] = useState({ hasReward: false, totalPlays: 0 });

  const [createUserWithEmailAndPassword, user, loading, error] = useCreateUserWithEmailAndPassword(auth);

  const handleInputChange = <T extends string>(setter: React.Dispatch<React.SetStateAction<T>>, formatter?: (val: string) => string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = formatter ? formatter(e.target.value) : e.target.value;
    setter(value as T);
    onFormInteraction();
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError('');

    if (password !== confirmPassword) {
      setValidationError("As senhas não coincidem.");
      return;
    }
    if (!isValidCPF(cpf)) {
      setValidationError("Por favor, insira um CPF válido.");
      return;
    }
    if (!isValidPhone(phone)) {
       setValidationError("Por favor, insira um telefone válido com DDD.");
       return;
    }

    try {
      const newUser = await createUserWithEmailAndPassword(email, password);
      if (newUser) {
        await updateProfile(newUser.user, {
            displayName: `${firstName} ${lastName}`
        });

        const userDocData: any = {
          firstName,
          lastName,
          phone: phone.replace(/\D/g, ''),
          cpf: cpf.replace(/\D/g, ''),
          email,
          balance: 0,
          prizeBalance: 0,
          status: 'active',
          role: null,
          createdAt: serverTimestamp()
        };

        if (referredBy) {
          userDocData.referredBy = referredBy;
        }

        const logDetails: any = { email, referredBy };
        const rewardSettingsResult = await getSignupRewardSettings();
        if (rewardSettingsResult.success && rewardSettingsResult.data?.journey && rewardSettingsResult.data.journey.length > 0) {
            const rewardData = rewardSettingsResult.data;
            const assignedReward = {
                status: 'unclaimed',
                currentStep: 0,
                journey: rewardData.journey,
            };
            userDocData.signupReward = assignedReward;
            logDetails.assignedReward = assignedReward;
        } else {
            logDetails.rewardStatus = "No active reward journey";
        }

        await setDoc(doc(db, "users", newUser.user.uid), userDocData);
        await logSystemEvent(newUser.user.uid, 'user', 'USER_SIGNUP', logDetails, 'SUCCESS');
        
        // --- SERVER-SIDE CONVERSION TRACKING ---
        await trackServerEvent(newUser.user.uid, {
            eventName: 'CompleteRegistration',
            value: 0, // Registration has no monetary value
            currency: 'BRL',
        });
        // --- END TRACKING ---
        
        setRewardDetails({ hasReward: !!userDocData.signupReward, totalPlays: userDocData.signupReward?.journey.length || 0 });
        setSignupComplete(true);
      }
    } catch (e: any) {
      console.error(e);
      await logSystemEvent(null, 'unauthenticated', 'USER_SIGNUP', { error: e.message, email }, 'ERROR');
    }
  };

  const displayError = validationError || (error?.message ? error.message.replace('Firebase: ', '') : null);

  const handleGoToRewards = () => {
    onSignupSuccess(); // Closes the dialog
    router.push('/account/shipping');
  }

  if (signupComplete) {
      return (
          <div className="flex flex-col items-center justify-center text-center p-4 space-y-4">
              <PartyPopper className="h-16 w-16 text-green-500" />
              <h3 className="text-2xl font-bold text-white">Cadastro Realizado!</h3>
              {rewardDetails.hasReward && (
                  <p className="text-muted-foreground">
                      Parabéns! Você ganhou <strong className="text-white">{rewardDetails.totalPlays} raspadinhas grátis</strong> como presente de boas-vindas!
                  </p>
              )}
              <Button onClick={handleGoToRewards} className="w-full bg-primary">
                  <ArrowRight className="mr-2 h-4 w-4" />
                  Ver Minhas Recompensas
              </Button>
          </div>
      )
  }

  return (
     <form onSubmit={handleSignUp} className="space-y-4">
        <h3 className="text-lg font-semibold text-white">Crie sua conta gratuita</h3>
        <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
                <Label htmlFor="first-name">Nome</Label>
                <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <Input id="first-name" placeholder="João" required value={firstName} onChange={handleInputChange(setFirstName)} className="pl-10" />
                </div>
            </div>
             <div className="space-y-2">
                <Label htmlFor="last-name">Sobrenome</Label>
                <div className="relative">
                     <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <Input id="last-name" placeholder="Silva" required value={lastName} onChange={handleInputChange(setLastName)} className="pl-10" />
                </div>
            </div>
        </div>
         <div className="space-y-2">
            <Label htmlFor="phone">Telefone</Label>
             <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input id="phone" type="tel" placeholder="(99) 99999-9999" required value={phone} onChange={handleInputChange(setPhone, formatPhone)} maxLength={15} className="pl-10"/>
             </div>
        </div>
        <div className="space-y-2">
            <Label htmlFor="cpf">CPF</Label>
            <div className="relative">
                <FileText className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input id="cpf" placeholder="000.000.000-00" required value={cpf} onChange={handleInputChange(setCpf, formatCPF)} maxLength={14} className="pl-10"/>
            </div>
        </div>
        <div className="space-y-2">
            <Label htmlFor="signup-email">Email</Label>
             <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input id="signup-email" type="email" placeholder="m@example.com" required value={email} onChange={handleInputChange(setEmail)} className="pl-10"/>
             </div>
        </div>
        <div className="space-y-2">
            <Label htmlFor="signup-password">Senha</Label>
            <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input id="signup-password" type="password" required minLength={6} value={password} onChange={handleInputChange(setPassword)} className="pl-10"/>
            </div>
        </div>
        <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirmar Senha</Label>
            <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input id="confirm-password" type="password" required minLength={6} value={confirmPassword} onChange={handleInputChange(setConfirmPassword)} className="pl-10" />
            </div>
        </div>
        {displayError && (
            <div className="flex items-center p-2 text-sm text-destructive bg-destructive/10 rounded-md border border-destructive/20">
                <AlertCircle className="h-4 w-4 mr-2" />
                <p>{displayError}</p>
            </div>
        )}
        <Button className="w-full bg-primary" type="submit" disabled={loading}>
            {loading && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}
            Criar conta
        </Button>
         <p className="text-center text-sm text-muted-foreground">
            Já tem uma conta?{' '}
            <button type="button" onClick={onSwitchToLogin} className="underline text-primary hover:text-primary/80">Conecte-se</button>
        </p>
    </form>
  );
}

function CancelRegistrationDialog({ open, onOpenChange, onConfirm }: { open: boolean, onOpenChange: (open: boolean) => void, onConfirm: () => void }) {
    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent className="bg-zinc-800 border-zinc-700 text-white max-w-sm p-8">
                <AlertDialogHeader className="text-center items-center">
                    <AlertDialogTitle className="text-2xl font-bold">Tem certeza que deseja cancelar seu registro?</AlertDialogTitle>
                    <AlertDialogDescription className="text-zinc-400">
                        Cadastre-se agora e tenha a chance de ganhar bônus e rodadas grátis!
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="flex-col gap-2 mt-4">
                    <Button onClick={() => onOpenChange(false)} className="w-full bg-green-500 hover:bg-green-600 text-black font-bold h-12 text-base">
                        Continuar <ArrowRight className="ml-2" />
                    </Button>
                    <Button onClick={onConfirm} variant="ghost" className="w-full hover:bg-transparent hover:text-zinc-300 text-zinc-400">
                        <X className="mr-2 h-4 w-4" /> Sim quero cancelar
                    </Button>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}


export function AuthDialog({ isOpen, onOpenChange, defaultTab = 'login' }: AuthDialogProps) {
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [authBanner, setAuthBanner] = useState<BannerContent | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    setActiveTab(defaultTab);
    setIsDirty(false); // Reset dirty state when tab changes
  }, [defaultTab, isOpen]);

  useEffect(() => {
    const fetchBanner = async () => {
      const bannersResult = await getBanners();
      if (bannersResult.success && bannersResult.data?.auth) {
        setAuthBanner(bannersResult.data.auth);
      }
    }
    if (isClient) {
      fetchBanner();
    }
  }, [isClient]);

  const handleOpenChange = (open: boolean) => {
    if (!open && activeTab === 'signup' && isDirty) {
        setShowCancelConfirm(true);
    } else {
        onOpenChange(open);
    }
  };

  const handleConfirmCancel = () => {
      setShowCancelConfirm(false);
      onOpenChange(false);
  };

  const handleFormInteraction = () => {
      if (!isDirty) {
          setIsDirty(true);
      }
  };

  const handleSwitchTab = (tab: string) => {
      setIsDirty(false);
      setActiveTab(tab as 'login' | 'signup');
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-4xl p-0 grid grid-cols-1 md:grid-cols-2 gap-0">
          <DialogHeader className="sr-only">
            <DialogTitle>Autenticação</DialogTitle>
          </DialogHeader>
          <div className="hidden md:block relative">
            <Image 
                  src={authBanner?.url || "https://placehold.co/800x600.png"} 
                  alt="Banner de autenticação" 
                  width={800}
                  height={600}
                  className="w-full h-full object-cover rounded-l-lg"
                  data-ai-hint="promotion"
              />
          </div>
          <div className="p-8">
              <Tabs value={activeTab} onValueChange={handleSwitchTab} className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-6">
                  <TabsTrigger value="login">Conecte-se</TabsTrigger>
                  <TabsTrigger value="signup">Inscrever-se</TabsTrigger>
              </TabsList>
              <TabsContent value="login">
                  <LoginForm onLoginSuccess={() => onOpenChange(false)} onSwitchToSignup={() => handleSwitchTab('signup')} />
              </TabsContent>
              <TabsContent value="signup">
                  <SignupForm onSignupSuccess={() => onOpenChange(false)} onSwitchToLogin={() => handleSwitchTab('login')} onFormInteraction={handleFormInteraction} />
              </TabsContent>
              </Tabs>
          </div>
        </DialogContent>
      </Dialog>
      <CancelRegistrationDialog
          open={showCancelConfirm}
          onOpenChange={setShowCancelConfirm}
          onConfirm={handleConfirmCancel}
      />
    </>
  );
}
