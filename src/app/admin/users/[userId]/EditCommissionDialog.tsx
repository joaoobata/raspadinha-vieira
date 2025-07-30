'use client';

import { useState, useEffect } from 'react';
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
import { updateUserCommissionRate, UserDetailsData } from './actions';

interface UserDetailsCommissionDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  user: UserDetailsData;
  onCommissionUpdate: () => void;
}

export function UserDetailsCommissionDialog({ isOpen, onOpenChange, user, onCommissionUpdate }: UserDetailsCommissionDialogProps) {
  const [rate, setRate] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    // The rate is stored as a percentage, e.g., 10 for 10%
    if (user?.commissionRate !== undefined) {
        setRate(user.commissionRate.toString());
    } else {
        setRate('10'); // Default to 10% if not set
    }
  }, [user]);

  const handleSave = async () => {
    const ratePercentage = parseFloat(rate);
    if (isNaN(ratePercentage) || ratePercentage < 0 || ratePercentage > 100) {
      toast({
        variant: 'destructive',
        title: 'Valor Inválido',
        description: 'Por favor, insira uma porcentagem entre 0 e 100.',
      });
      return;
    }

    setLoading(true);
    // Pass the percentage value directly to the server action
    const result = await updateUserCommissionRate(user.id, ratePercentage);
    setLoading(false);

    if (result.success) {
      toast({
        title: 'Sucesso!',
        description: `Taxa de comissão de ${user.firstName} atualizada com sucesso.`,
      });
      onCommissionUpdate(); // Re-fetch user details to show updated rate
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
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Editar Taxa de Comissão</DialogTitle>
          <DialogDescription>
            Defina a porcentagem de comissão para {user.firstName} sobre os depósitos de seus indicados.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="rate" className="text-right">
              Taxa (%)
            </Label>
            <Input
              id="rate"
              type="number"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              className="col-span-3"
              placeholder="Ex: 10 para 10%"
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
