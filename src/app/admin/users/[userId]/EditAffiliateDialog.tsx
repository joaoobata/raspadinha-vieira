'use client';

import { useState, useEffect, useCallback } from 'react';
import { useDebounce } from 'use-debounce';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { LoaderCircle, Search, User, X, Link as LinkIcon } from 'lucide-react';
import { UserDetailsData, updateUserAffiliate, searchUsers } from './actions';

interface EditAffiliateDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  user: UserDetailsData;
  onAffiliateUpdate: () => void;
  adminId: string;
}

export function EditAffiliateDialog({ isOpen, onOpenChange, user, onAffiliateUpdate, adminId }: EditAffiliateDialogProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm] = useDebounce(searchTerm, 500);
  const [searchResults, setSearchResults] = useState<UserDetailsData[]>([]);
  const [selectedAffiliate, setSelectedAffiliate] = useState<UserDetailsData | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleSearch = useCallback(async () => {
    if (debouncedSearchTerm.length < 3) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    const result = await searchUsers(debouncedSearchTerm);
    if (result.success && result.data) {
      // Exclude the current user from the search results to prevent self-affiliation
      setSearchResults(result.data.filter(u => u.id !== user.id)); 
    }
    setIsSearching(false);
  }, [debouncedSearchTerm, user.id]);

  useEffect(() => {
    handleSearch();
  }, [handleSearch]);

  const handleSelectAffiliate = (affiliate: UserDetailsData) => {
    setSelectedAffiliate(affiliate);
    setSearchTerm('');
    setSearchResults([]);
  };

  const handleSave = async () => {
    setLoading(true);
    const result = await updateUserAffiliate(user.id, selectedAffiliate?.id ?? null, adminId);
    setLoading(false);

    if (result.success) {
      toast({
        title: 'Sucesso!',
        description: `Afiliado de ${user.firstName} atualizado com sucesso.`,
      });
      onAffiliateUpdate();
      handleClose();
    } else {
      toast({
        variant: 'destructive',
        title: 'Erro!',
        description: result.error,
      });
    }
  };
  
  const handleRemoveAffiliation = async () => {
    setLoading(true);
    const result = await updateUserAffiliate(user.id, null, adminId);
    setLoading(false);
    if (result.success) {
      toast({
        title: 'Sucesso!',
        description: `Afiliação de ${user.firstName} removida.`,
      });
      onAffiliateUpdate();
      handleClose();
    } else {
      toast({
        variant: 'destructive',
        title: 'Erro!',
        description: result.error,
      });
    }
  }

  const handleClose = () => {
    onOpenChange(false);
    setTimeout(() => {
        setSearchTerm('');
        setSearchResults([]);
        setSelectedAffiliate(null);
        setLoading(false);
    }, 300);
  };
  
  const currentAffiliateName = user.referredByName || "Nenhum";

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Alterar Afiliado de {user.firstName}</DialogTitle>
          <DialogDescription>
            Atribua um novo "pai" de afiliação ou remova a afiliação atual.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
            <div className="p-3 rounded-md bg-secondary border">
                <p className="text-sm text-muted-foreground">Afiliado Atual</p>
                <p className="font-semibold">{currentAffiliateName}</p>
            </div>
            
            <div className="space-y-2">
                <Label htmlFor="search-affiliate">Buscar Novo Afiliado</Label>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <Input 
                        id="search-affiliate"
                        placeholder="Buscar por nome ou email..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10"
                    />
                </div>
                 {isSearching && <p className="text-sm text-muted-foreground">Buscando...</p>}
                 {searchResults.length > 0 && (
                     <div className="border rounded-md max-h-40 overflow-y-auto">
                         {searchResults.map(res => (
                            <button key={res.id} onClick={() => handleSelectAffiliate(res)} className="w-full text-left p-3 hover:bg-secondary transition-colors">
                                <p className="font-medium">{`${res.firstName} ${res.lastName}`.trim()}</p>
                                <p className="text-sm text-muted-foreground">{res.email}</p>
                            </button>
                         ))}
                     </div>
                 )}
            </div>

            {selectedAffiliate && (
                <div className="p-4 rounded-md bg-primary/10 border border-primary/20">
                     <div className="flex justify-between items-center">
                        <div>
                             <p className="text-sm text-muted-foreground">Novo Afiliado Selecionado:</p>
                             <p className="font-semibold text-primary">{selectedAffiliate.firstName} {selectedAffiliate.lastName}</p>
                        </div>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSelectedAffiliate(null)}>
                            <X className="h-4 w-4" />
                        </Button>
                     </div>
                </div>
            )}

        </div>
        <DialogFooter className="justify-between sm:justify-between">
            <Button variant="destructive" onClick={handleRemoveAffiliation} disabled={!user.referredBy || loading}>
                <LinkIcon className="mr-2 h-4 w-4"/>
                Remover Afiliação
            </Button>
            <div className="flex gap-2">
                <Button variant="outline" onClick={handleClose}>Cancelar</Button>
                <Button onClick={handleSave} disabled={loading || !selectedAffiliate}>
                    {loading ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : 'Salvar Novo Afiliado'}
                </Button>
            </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
