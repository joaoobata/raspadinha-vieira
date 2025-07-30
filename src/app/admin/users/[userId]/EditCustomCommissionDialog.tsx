
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
import { UserDetailsData, DirectReferral, updateCustomCommissionForUser } from './actions';

interface EditCustomCommissionDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  affiliate: UserDetailsData; // The user whose page we are on
  referredUser: DirectReferral; // The user whose commission is being customized
  onSave: () => void;
  adminId: string;
}

export function EditCustomCommissionDialog({ 
    isOpen, 
    onOpenChange, 
    affiliate, 
    referredUser, 
    onSave, 
    adminId 
}: EditCustomCommissionDialogProps) {
  const [rate, setRate] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (referredUser) {
        // Use the custom rate if it exists, otherwise default to an empty string
        setRate(referredUser.customRate !== undefined ? referredUser.customRate.toString() : '');
    }
  }, [referredUser]);

  const handleSave = async () => {
    const rateValue = rate.trim() === '' ? null : parseFloat(rate);

    if (rateValue !== null && (isNaN(rateValue) || rateValue < 0 || rateValue > 100)) {
      toast({
        variant: 'destructive',
        title: 'Valor Inválido',
        description: 'Por favor, insira uma porcentagem entre 0 e 100, ou deixe o campo em branco para usar a taxa padrão.',
      });
      return;
    }

    setLoading(true);
    const result = await updateCustomCommissionForUser(affiliate.id, referredUser.id, rateValue, adminId);
    setLoading(false);

    if (result.success) {
      toast({
        title: 'Sucesso!',
        description: `Taxa de comissão personalizada para ${referredUser.name} atualizada.`,
      });
      onSave();
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
  
  const defaultRate = (affiliate.commissionRate ?? 10).toFixed(2);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Taxa Personalizada</DialogTitle>
          <DialogDescription>
            Defina a comissão que <strong>{affiliate.firstName}</strong> ganha sobre os depósitos de <strong>{referredUser.name}</strong>.
            Deixe em branco para usar a taxa padrão do afiliado ({defaultRate}%).
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
              placeholder={`Padrão: ${defaultRate}%`}
            />
          </div>
        </div>
        <DialogFooter>
            <DialogClose asChild>
                <Button variant="outline" onClick={handleClose}>Cancelar</Button>
            </DialogClose>
            <Button onClick={handleSave} disabled={loading}>
                {loading ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : 'Salvar Taxa'}
            </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

    