
'use client';

import { useState, useEffect, useRef } from 'react';
import { useForm, useFieldArray }from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { v4 as uuidv4 } from 'uuid';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription as ShadcnFormDescription
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { LoaderCircle, PlusCircle, Trash2, Percent, Upload, Image as ImageIcon } from 'lucide-react';
import { Scratchcard, saveScratchcard, Prize } from './actions';
import { Separator } from '@/components/ui/separator';
import { getRtpSettings } from '../scratchcard-health/actions';
import { getCategories, Category } from '../categories/actions';
import { Checkbox } from '@/components/ui/checkbox';
import Image from 'next/image';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '@/lib/firebase';

interface ScratchcardDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSave: () => void;
  scratchcard: Scratchcard | null;
}

interface PrizeState extends Prize {
    file?: File;
    previewUrl?: string;
}

const prizeSchema = z.object({
  id: z.string(),
  name: z.string().min(1, 'Nome do prêmio é obrigatório.'),
  value: z.coerce.number().min(0, 'Valor deve ser 0 ou maior'),
  imageUrl: z.string().optional(), // Optional as it might not be present if a new file is uploaded
});

const formSchema = z.object({
  name: z.string().min(3, 'Nome é obrigatório'),
  description: z.string().optional(),
  price: z.coerce.number().min(0, 'Preço não pode ser negativo'),
  imageUrl: z.string().optional(),
  scratchImageUrl: z.string().optional(),
  isEnabled: z.boolean(),
  prizes: z.array(prizeSchema).min(1, 'Adicione ao menos um prêmio.'),
  categoryIds: z.array(z.string()).optional(),
  rtpRate: z.string().optional(),
});

type ScratchcardFormValues = z.infer<typeof formSchema>;

export function ScratchcardDialog({ isOpen, onOpenChange, onSave, scratchcard }: ScratchcardDialogProps) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const [rtpRate, setRtpRate] = useState<number | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [adminUser] = useAuthState(auth);
  
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [scratchFile, setScratchFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [scratchPreview, setScratchPreview] = useState<string | null>(null);
  
  const [prizeStates, setPrizeStates] = useState<PrizeState[]>([]);
  const prizeFileInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const form = useForm<ScratchcardFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      description: '',
      price: 0,
      imageUrl: '',
      scratchImageUrl: '',
      isEnabled: true,
      prizes: [],
      categoryIds: [],
      rtpRate: '',
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'prizes',
  });

  const watchedPrizes = form.watch('prizes');
  const watchedRtpRate = form.watch('rtpRate');

  useEffect(() => {
    if (isOpen) {
      setCoverFile(null);
      setScratchFile(null);
      setCoverPreview(null);
      setScratchPreview(null);

      const fetchInitialData = async () => {
        const [rtpResult, categoriesResult] = await Promise.all([
           getRtpSettings(),
           getCategories()
        ]);
        
        const currentRtpRate = rtpResult.success && rtpResult.data?.rate !== undefined ? rtpResult.data.rate : 30;
        setRtpRate(currentRtpRate);
        
        if (categoriesResult.success && categoriesResult.data) {
          setCategories(categoriesResult.data);
        }

        if (scratchcard) {
          form.reset({
            ...scratchcard,
            categoryIds: scratchcard.categoryIds || [],
            rtpRate: scratchcard.rtpRate?.toString() || '',
            imageUrl: scratchcard.imageUrl || '',
            scratchImageUrl: scratchcard.scratchImageUrl || '',
          });
          setCoverPreview(scratchcard.imageUrl || null);
          setScratchPreview(scratchcard.scratchImageUrl || null);
          setPrizeStates(scratchcard.prizes.map(p => ({ ...p, previewUrl: p.imageUrl })))
        } else {
          const defaultPrizes = [{ id: uuidv4(), name: 'Não Ganhou', value: 0, imageUrl: 'https://placehold.co/100x100.png' }];
          form.reset({
            name: '',
            description: '',
            price: 0,
            imageUrl: '',
            scratchImageUrl: '',
            isEnabled: true,
            prizes: defaultPrizes,
            categoryIds: [],
            rtpRate: '',
          });
          setPrizeStates(defaultPrizes.map(p => ({ ...p, previewUrl: p.imageUrl })));
        }
      };
      fetchInitialData();
    }
  }, [isOpen, scratchcard, form]);
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'cover' | 'scratch') => {
    const file = e.target.files?.[0];
    if (file) {
        const reader = new FileReader();
        reader.onloadend = () => {
            if (type === 'cover') {
                setCoverFile(file);
                setCoverPreview(reader.result as string);
            } else {
                setScratchFile(file);
                setScratchPreview(reader.result as string);
            }
        };
        reader.readAsDataURL(file);
    }
  };

  const handlePrizeFileChange = (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
    const file = e.target.files?.[0];
    if (file) {
        const reader = new FileReader();
        reader.onloadend = () => {
            const updatedPrizeStates = [...prizeStates];
            updatedPrizeStates[index] = {
                ...updatedPrizeStates[index],
                file: file,
                previewUrl: reader.result as string,
            };
            setPrizeStates(updatedPrizeStates);
        };
        reader.readAsDataURL(file);
    }
  };


  const probabilityRtp = watchedRtpRate ? parseFloat(watchedRtpRate) : rtpRate;

  const calculateProbability = (prize: Prize, allWinnablePrizes: Prize[], currentRtp: number | null): string => {
      if (currentRtp === null || prize.value <= 0 || allWinnablePrizes.length === 0) {
        return '-';
      }

      const weightedPrizes = allWinnablePrizes.map(p => ({
        id: p.id,
        weight: 1 / (p.value + 0.1) 
      }));
      
      const totalWeight = weightedPrizes.reduce((sum, p) => sum + p.weight, 0);
      if (totalWeight === 0) {
          return '-';
      }

      const prizeWeight = weightedPrizes.find(p => p.id === prize.id)?.weight || 0;
      
      const overallWinChance = currentRtp / 100;
      const relativeChance = prizeWeight / totalWeight;
      const finalProbability = overallWinChance * relativeChance * 100;
      
      if (isNaN(finalProbability)) {
        return '-';
      }
      
      return finalProbability.toFixed(4) + '%';
  };


  const handleClose = () => {
    onOpenChange(false);
  };
  
  const handleAddNewPrize = () => {
    const newPrize: PrizeState = { id: uuidv4(), name: '', value: 1, imageUrl: '', previewUrl: '' };
    append(newPrize);
    setPrizeStates(prev => [...prev, newPrize]);
  };

  const handleRemovePrize = (index: number) => {
      remove(index);
      setPrizeStates(prev => prev.filter((_, i) => i !== index));
  }
  
  const fileToDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
  }


  const onSubmit = async (data: ScratchcardFormValues) => {
    if (!adminUser) {
        toast({ variant: 'destructive', title: 'Erro', description: 'Admin não autenticado.' });
        return;
    }
    setLoading(true);

    const rtpValue = data.rtpRate ? parseFloat(data.rtpRate) : undefined;
    if (data.rtpRate && (isNaN(rtpValue) || rtpValue < 0 || rtpValue > 100)) {
        toast({ variant: 'destructive', title: 'Erro', description: 'O RTP personalizado deve ser um número entre 0 e 100.' });
        setLoading(false);
        return;
    }
    
    // Process prizes with file uploads
    const processedPrizes = await Promise.all(data.prizes.map(async (prize, index) => {
        const prizeState = prizeStates[index];
        let prizeFileDataUrl: string | undefined = undefined;
        if (prizeState.file) {
            prizeFileDataUrl = await fileToDataUrl(prizeState.file);
        }
        return {
            ...prize,
            prizeFileDataUrl,
            existingImageUrl: prizeState.file ? undefined : prize.imageUrl,
        }
    }));


    let coverFileDataUrl: string | undefined = undefined;
    if (coverFile) {
        coverFileDataUrl = await fileToDataUrl(coverFile);
    }

    let scratchFileDataUrl: string | undefined = undefined;
    if (scratchFile) {
        scratchFileDataUrl = await fileToDataUrl(scratchFile);
    }

    const payload = {
      ...data,
      id: scratchcard?.id,
      rtpRate: rtpValue,
      coverFileDataUrl,
      scratchFileDataUrl,
      prizes: processedPrizes, // Send processed prizes
      adminId: adminUser.uid,
    };
    
    const result = await saveScratchcard(payload);
    setLoading(false);

    if (result.success) {
      toast({
        title: 'Sucesso!',
        description: 'Raspadinha salva com sucesso.',
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
  
  const winnablePrizes = watchedPrizes.filter(p => p.value > 0);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{scratchcard ? 'Editar' : 'Criar'} Raspadinha</DialogTitle>
          <DialogDescription>
            Preencha os detalhes da raspadinha. A lógica do jogo é encontrar 3 imagens de prêmios iguais.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Nome da Raspadinha</FormLabel>
                        <FormControl>
                            <Input placeholder="Ex: PIX na Conta" {...field} />
                        </FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                    />
                <FormField
                    control={form.control}
                    name="price"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Preço para Jogar (R$)</FormLabel>
                        <FormControl>
                            <Input type="number" step="0.01" placeholder="Ex: 2.50" {...field} />
                        </FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                    />
            </div>

            <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>Descrição</FormLabel>
                    <FormControl>
                        <Textarea placeholder="Descreva os prêmios ou tema da raspadinha." {...field} />
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
                />
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                    <Label>Imagem de Capa</Label>
                    <Input 
                        type="file" 
                        ref={useRef<HTMLInputElement | null>(null)}
                        className="hidden"
                        accept="image/png, image/jpeg, image/gif, image/webp"
                        onChange={(e) => handleFileChange(e, 'cover')}
                    />
                    {coverPreview ? (
                        <div className="relative aspect-video w-full rounded-md border overflow-hidden">
                             <Image src={coverPreview} alt="Preview da capa" layout="fill" objectFit="cover" />
                        </div>
                    ) : (
                        <div className="flex items-center justify-center w-full aspect-video rounded-md border-2 border-dashed bg-secondary/50">
                            <div className="text-center text-muted-foreground">
                                <ImageIcon className="mx-auto h-12 w-12" />
                                <p className="text-sm mt-2">Nenhuma imagem selecionada</p>
                            </div>
                        </div>
                    )}
                    <Button type="button" variant="outline" size="sm" onClick={() => (document.querySelector('input[type="file"][id^="cover-input-"]') as HTMLInputElement)?.click()} id={`cover-input-${uuidv4()}`}>
                        <Upload className="mr-2 h-4 w-4" /> Escolher Imagem
                    </Button>
                    <ShadcnFormDescription>Tamanho recomendado: 400x200 pixels.</ShadcnFormDescription>
                </div>
                <div className="space-y-2">
                     <Label>Imagem para Raspar (Opcional)</Label>
                    <Input 
                        type="file" 
                        ref={useRef<HTMLInputElement | null>(null)}
                        className="hidden"
                        accept="image/png, image/jpeg, image/gif, image/webp"
                        onChange={(e) => handleFileChange(e, 'scratch')}
                    />
                    {scratchPreview ? (
                        <div className="relative aspect-square w-full rounded-md border overflow-hidden">
                             <Image src={scratchPreview} alt="Preview da imagem de raspar" layout="fill" objectFit="cover" />
                        </div>
                    ) : (
                        <div className="flex items-center justify-center w-full aspect-square rounded-md border-2 border-dashed bg-secondary/50">
                             <div className="text-center text-muted-foreground">
                                <ImageIcon className="mx-auto h-12 w-12" />
                                <p className="text-sm mt-2">Nenhuma imagem selecionada</p>
                            </div>
                        </div>
                    )}
                     <Button type="button" variant="outline" size="sm" onClick={() => (document.querySelector('input[type="file"][id^="scratch-input-"]') as HTMLInputElement)?.click()} id={`scratch-input-${uuidv4()}`}>
                        <Upload className="mr-2 h-4 w-4" /> Escolher Imagem
                    </Button>
                    <ShadcnFormDescription>Se deixado em branco, será usada uma cor cinza. Tamanho recomendado: 500x500 pixels.</ShadcnFormDescription>
                </div>
            </div>
            
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                    control={form.control}
                    name="rtpRate"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>RTP Personalizado (%)</FormLabel>
                        <FormControl>
                            <Input type="number" placeholder={`Global: ${rtpRate}%`} {...field} />
                        </FormControl>
                        <ShadcnFormDescription>Deixe em branco para usar o RTP global.</ShadcnFormDescription>
                        <FormMessage />
                        </FormItem>
                    )}
                    />
                <FormField
                    control={form.control}
                    name="isEnabled"
                    render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm mt-5">
                        <div className="space-y-0.5">
                            <FormLabel>Ativada</FormLabel>
                            <ShadcnFormDescription>
                                Permitir que jogadores comprem e joguem.
                            </ShadcnFormDescription>
                        </div>
                        <FormControl>
                            <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            />
                        </FormControl>
                        </FormItem>
                    )}
                    />
            </div>


             <Separator />
            
             <FormField
                control={form.control}
                name="categoryIds"
                render={() => (
                    <FormItem>
                    <div className="mb-4">
                        <FormLabel className="text-base">Categorias</FormLabel>
                        <ShadcnFormDescription>
                            Associe esta raspadinha a uma ou mais categorias.
                        </ShadcnFormDescription>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                        {categories.map((item) => (
                        <FormField
                            key={item.id}
                            control={form.control}
                            name="categoryIds"
                            render={({ field }) => {
                            return (
                                <FormItem
                                key={item.id}
                                className="flex flex-row items-start space-x-3 space-y-0"
                                >
                                <FormControl>
                                    <Checkbox
                                    checked={field.value?.includes(item.id)}
                                    onCheckedChange={(checked) => {
                                        return checked
                                        ? field.onChange([...(field.value || []), item.id])
                                        : field.onChange(
                                            (field.value || []).filter(
                                                (value) => value !== item.id
                                            )
                                            );
                                    }}
                                    />
                                </FormControl>
                                <FormLabel className="font-normal">
                                    {item.name}
                                </FormLabel>
                                </FormItem>
                            );
                            }}
                        />
                        ))}
                    </div>
                    <FormMessage />
                    </FormItem>
                )}
                />


            <Separator />

            <div>
              <h3 className="text-lg font-medium">Definição de Prêmios</h3>
               <p className="text-sm text-muted-foreground">
                    Defina os prêmios. A chance de ganhar é calculada com base no valor e na taxa de RTP (RTP da raspadinha, ou o global: ${rtpRate ?? '...'}%). Prêmios maiores são mais raros. É obrigatório ter um prêmio com valor 0 (derrota).
               </p>
            </div>

            <div className="space-y-4">
                {fields.map((field, index) => {
                  const prizeState = prizeStates[index];
                  return (
                    <div key={field.id} className="grid grid-cols-1 md:grid-cols-10 items-end gap-4 p-4 border rounded-md relative">
                        <Button type="button" variant="ghost" size="icon" className="absolute top-2 right-2 h-7 w-7 text-destructive hover:bg-destructive/10" onClick={() => handleRemovePrize(index)}>
                            <Trash2 className="h-4 w-4" />
                        </Button>
                        <FormField
                        control={form.control}
                        name={`prizes.${index}.name`}
                        render={({ field: formField }) => (
                            <FormItem className="md:col-span-3">
                            <FormLabel>Nome do Prêmio</FormLabel>
                            <FormControl>
                                <Input placeholder="Ex: Diamante" {...formField} />
                            </FormControl>
                            <FormMessage />
                            </FormItem>
                        )}
                        />
                        <FormField
                        control={form.control}
                        name={`prizes.${index}.value`}
                        render={({ field: formField }) => (
                            <FormItem className="md:col-span-2">
                            <FormLabel>Valor (R$)</FormLabel>
                            <FormControl>
                                <Input type="number" step="0.01" {...formField} />
                            </FormControl>
                            <FormMessage />
                            </FormItem>
                        )}
                        />
                        <div className="md:col-span-5 space-y-2">
                            <FormLabel>Imagem do Prêmio</FormLabel>
                             <Input 
                                type="file"
                                className="hidden"
                                accept="image/png, image/jpeg, image/gif, image/webp"
                                ref={el => prizeFileInputRefs.current[index] = el}
                                onChange={(e) => handlePrizeFileChange(e, index)}
                            />
                            <div className="flex items-center gap-4">
                                {prizeState?.previewUrl ? (
                                    <Image src={prizeState.previewUrl} alt="Preview" width={64} height={64} className="rounded-md border aspect-square object-contain" />
                                ) : (
                                    <div className="w-16 h-16 rounded-md border-2 border-dashed bg-secondary/50 flex items-center justify-center">
                                        <ImageIcon className="h-8 w-8 text-muted-foreground" />
                                    </div>
                                )}
                                <Button type="button" variant="outline" size="sm" onClick={() => prizeFileInputRefs.current[index]?.click()}>
                                    <Upload className="mr-2 h-4 w-4" /> Enviar
                                </Button>
                            </div>
                        </div>
                    </div>
                )})}
            </div>
            
            <Button type="button" variant="outline" size="sm" onClick={handleAddNewPrize}>
              <PlusCircle className="mr-2 h-4 w-4" />
              Adicionar Novo Prêmio
            </Button>
            
            {probabilityRtp !== null && winnablePrizes.length > 0 && (
                <div className="space-y-4 pt-4">
                     <Separator />
                    <h3 className="text-lg font-medium">Resumo de Probabilidades</h3>
                    <div className="p-4 bg-secondary/50 rounded-lg space-y-2">
                        {winnablePrizes.map(prize => (
                            <div key={prize.id} className="flex justify-between items-center text-sm">
                                <span className="text-muted-foreground">{prize.name} ({new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(prize.value)})</span>
                                <span className="font-mono text-primary font-bold">
                                    <Percent className="inline-block mr-2 h-4 w-4" />
                                    {calculateProbability(prize, winnablePrizes, probabilityRtp)}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}


            <DialogFooter className="pt-6">
              <Button type="button" variant="outline" onClick={handleClose}>Cancelar</Button>
              <Button type="submit" disabled={loading}>
                {loading ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : 'Salvar'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
