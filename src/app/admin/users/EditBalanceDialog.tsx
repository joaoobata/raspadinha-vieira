'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { LoaderCircle } from 'lucide-react';
import { updateUserBalance } from './actions';
import { UserDetailsData } from './actions';
import { Textarea } from '@/components/ui/textarea';

interface EditBalanceDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  user: UserDetailsData;
  onBalanceUpdate: () => void;
  adminId: string;
}

export function EditBalanceDialog({ isOpen, onOpenChange, user, onBalanceUpdate, adminId }: EditBalanceDialogProps) {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleSave = async () => {
    const balanceChange = parseFloat(amount);
    if (isNaN(balanceChange)) {
      toast({
        variant: 'destructive',
        title: 'Valor Inválido',
        description: 'Por favor, insira um número válido.',
      });
      return;
    }
    if (!reason.trim()) {
        toast({
            variant: 'destructive',
            title: 'Justificativa Obrigatória',
            description: 'Por favor, insira uma justificativa para a alteração de saldo.',
        });
        return;
    }


    setLoading(true);
    const result = await updateUserBalance(user.id, balanceChange, reason, adminId);
    setLoading(false);

    if (result.success) {
      toast({
        title: 'Sucesso!',
        description: `Saldo de ${user.firstName} atualizado com sucesso.`,
      });
      onBalanceUpdate(); // Re-fetch users to show updated balance
      handleClose();
    } else {
      toast({
        variant: 'destructive',
        title: 'Erro!',
        description: result.error,
      });
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    setTimeout(() => {
        setAmount('');
        setReason('');
        setLoading(false);
    }, 300);
  };

  const formatCurrency = (value: number) => {
    return (value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Editar Saldo de {user.firstName}</DialogTitle>
          <DialogDescription>
            Saldo atual: {formatCurrency(user.balance)}. Insira um valor para adicionar ou remover do saldo. Use valores negativos para remover.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="amount">
              Valor (R$)
            </Label>
            <Input
              id="amount"
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Ex: 50 ou -20"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="reason">
              Justificativa
            </Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex: Bônus de boas-vindas"
            />
          </div>
        </div>
        <DialogFooter>
            <DialogClose asChild>
                <Button variant="outline" onClick={handleClose}>Cancelar</Button>
            </DialogClose>
            <Button onClick={handleSave} disabled={loading}>
                {loading ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : 'Salvar Alterações'}
            </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
