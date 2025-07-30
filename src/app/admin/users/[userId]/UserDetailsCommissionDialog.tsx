
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
import { getSettings } from '../../settings/actions';

interface UserDetailsCommissionDialogL1Props {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  user: UserDetailsData;
  onCommissionUpdate: () => void;
  adminId: string;
}

export function UserDetailsCommissionDialogL1({ isOpen, onOpenChange, user, onCommissionUpdate, adminId }: UserDetailsCommissionDialogL1Props) {
  const [rate, setRate] = useState('');
  const [loading, setLoading] = useState(false);
  const [globalRate, setGlobalRate] = useState<number>(10);
  const { toast } = useToast();

  useEffect(() => {
    const fetchGlobalRate = async () => {
        const settingsResult = await getSettings();
        if (settingsResult.success && settingsResult.data?.commissionRateL1) {
            setGlobalRate(settingsResult.data.commissionRateL1);
        }
    }
    fetchGlobalRate();
  }, []);

  useEffect(() => {
    if (isOpen) {
        // The rate is always a percentage number, e.g., 10 for 10%
        const currentRate = user.commissionRate !== undefined ? user.commissionRate : globalRate;
        setRate(currentRate.toString());
    }
  }, [user, isOpen, globalRate]);

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
    // Always save as a whole number percentage
    const result = await updateUserCommissionRate(user.id, ratePercentage, adminId);
    setLoading(false);

    if (result.success) {
      toast({
        title: 'Sucesso!',
        description: `Taxa de comissão de Nível 1 de ${user.firstName} atualizada com sucesso.`,
      });
      onCommissionUpdate();
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
          <DialogTitle>Editar Taxa de Comissão Padrão (Nível 1)</DialogTitle>
          <DialogDescription>
            Defina a comissão que este usuário ganha de seus indicados diretos. O padrão global é {globalRate}%.
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
              placeholder={`Padrão Global: ${globalRate}`}
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
