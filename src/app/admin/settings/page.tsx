
'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { getSettings, saveSettings, SettingsData } from './actions';
import { Skeleton } from '@/components/ui/skeleton';
import { LoaderCircle, Percent, RotateCw, Info, Palette, Upload, Code, Music } from 'lucide-react';
import Image from 'next/image';
import { Separator } from '@/components/ui/separator';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '@/lib/firebase';
import { Textarea } from '@/components/ui/textarea';

export default function AdminSettingsPage() {
    const { toast } = useToast();
    const [adminUser] = useAuthState(auth);
    const [settings, setSettings] = useState<SettingsData>({
        siteName: '',
        minDeposit: 0,
        minWithdrawal: 0,
        logoUrl: '',
        commissionRateL1: 0,
        commissionRateL2: 1,
        commissionRateL3: 0.5,
        rolloverMultiplier: 1,
        colorPrimary: '',
        colorBackground: '',
        colorAccent: '',
        customHeadScript: '',
        soundWinUrl: '',
        soundLoseUrl: '',
        soundScratchUrl: '',
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    
    const [logoFile, setLogoFile] = useState<File | null>(null);
    const [logoPreview, setLogoPreview] = useState<string | null>(null);
    const logoInputRef = useRef<HTMLInputElement>(null);
    
    const [soundWinFile, setSoundWinFile] = useState<File | null>(null);
    const [soundLoseFile, setSoundLoseFile] = useState<File | null>(null);
    const [soundScratchFile, setSoundScratchFile] = useState<File | null>(null);

    const soundWinInputRef = useRef<HTMLInputElement>(null);
    const soundLoseInputRef = useRef<HTMLInputElement>(null);
    const soundScratchInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        fetchSettings();
    }, []);

    const fetchSettings = async () => {
        setLoading(true);
        const result = await getSettings();
        if (result.success && result.data) {
            setSettings(result.data);
            setLogoPreview(result.data.logoUrl || null);
        } else {
            toast({
                variant: 'destructive',
                title: 'Erro ao Carregar',
                description: result.error || 'Não foi possível carregar as configurações.',
            });
        }
        setLoading(false);
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setSettings(prev => ({ ...prev, [name]: name.includes('min') || name.includes('commission') || name.includes('rollover') ? parseFloat(value) || 0 : value }));
    };
    
    const handleLogoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setLogoFile(file);
            const reader = new FileReader();
            reader.onloadend = () => {
                setLogoPreview(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };
    
    const handleSoundFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'win' | 'lose' | 'scratch') => {
        const file = e.target.files?.[0];
        if (file) {
            switch(type) {
                case 'win': setSoundWinFile(file); break;
                case 'lose': setSoundLoseFile(file); break;
                case 'scratch': setSoundScratchFile(file); break;
            }
        }
    }
    
    const fileToDataUrl = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    const handleSave = async () => {
        if (!adminUser) return;
        setSaving(true);

        let logoFileDataUrl: string | undefined = undefined;
        if (logoFile) {
            logoFileDataUrl = await fileToDataUrl(logoFile);
        }

        let soundWinFileDataUrl: string | undefined = undefined;
        if (soundWinFile) {
            soundWinFileDataUrl = await fileToDataUrl(soundWinFile);
        }
        
        let soundLoseFileDataUrl: string | undefined = undefined;
        if (soundLoseFile) {
            soundLoseFileDataUrl = await fileToDataUrl(soundLoseFile);
        }

        let soundScratchFileDataUrl: string | undefined = undefined;
        if (soundScratchFile) {
            soundScratchFileDataUrl = await fileToDataUrl(soundScratchFile);
        }


        const result = await saveSettings(settings, adminUser.uid, logoFileDataUrl, soundWinFileDataUrl, soundLoseFileDataUrl, soundScratchFileDataUrl);
        if (result.success) {
            toast({
                title: 'Sucesso!',
                description: 'Configurações salvas. As alterações podem levar um momento para serem refletidas em todo o site.',
            });
             // Reload the page to reflect color changes
            window.location.reload();
        } else {
            toast({
                variant: 'destructive',
                title: 'Erro ao Salvar',
                description: result.error || 'Não foi possível salvar as configurações.',
            });
        }
        setSaving(false);
    };

    if (loading) {
        return (
            <div className="space-y-8">
                <Skeleton className="h-10 w-1/3" />
                <Skeleton className="h-64 w-full" />
                <Skeleton className="h-48 w-full" />
            </div>
        )
    }

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold">Configurações Gerais</h1>
                <p className="text-muted-foreground">Gerencie as configurações básicas e a aparência do sistema.</p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Identidade Visual</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="grid md:grid-cols-2 gap-6 items-start">
                        <div className="space-y-2">
                            <Label htmlFor="siteName">Nome do Site</Label>
                            <Input
                                id="siteName"
                                name="siteName"
                                value={settings.siteName}
                                onChange={handleInputChange}
                                placeholder="Raspadinha"
                            />
                        </div>
                         <div className="space-y-2">
                            <Label>Logo do Site</Label>
                             <Input
                                id="logoUrl"
                                name="logoUrl"
                                type="file"
                                accept="image/png, image/jpeg, image/gif, image/webp"
                                ref={logoInputRef}
                                className="hidden"
                                onChange={handleLogoFileChange}
                            />
                             <Button variant="outline" onClick={() => logoInputRef.current?.click()}>
                                <Upload className="mr-2 h-4 w-4" />
                                Escolher Imagem da Logo
                            </Button>
                            {logoPreview && (
                                <div className='mt-4'>
                                    <p className='text-sm text-muted-foreground mb-2'>Preview da logo:</p>
                                    <div className="p-4 bg-secondary rounded-lg inline-block">
                                        <Image src={logoPreview} alt="Logo preview" width={160} height={50} className="object-contain" data-ai-hint="logo" />
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                     <Separator />
                     <div className="space-y-4">
                        <h3 className="text-lg font-medium flex items-center gap-2"><Palette/> Cores do Tema</h3>
                        <p className="text-sm text-muted-foreground">
                            Altere as cores principais do site. Os valores devem estar no formato HSL (Ex: `240 10% 3.9%`). Use um seletor de cores online para encontrar os valores HSL.
                        </p>
                        <div className="grid sm:grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="space-y-2">
                                <Label htmlFor="colorPrimary">Cor Primária</Label>
                                <Input
                                    id="colorPrimary"
                                    name="colorPrimary"
                                    value={settings.colorPrimary}
                                    onChange={handleInputChange}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="colorBackground">Cor de Fundo</Label>
                                <Input
                                    id="colorBackground"
                                    name="colorBackground"
                                    value={settings.colorBackground}
                                    onChange={handleInputChange}
                                />
                            </div>
                             <div className="space-y-2">
                                <Label htmlFor="colorAccent">Cor de Destaque (Accent)</Label>
                                <Input
                                    id="colorAccent"
                                    name="colorAccent"
                                    value={settings.colorAccent}
                                    onChange={handleInputChange}
                                />
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>
            
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Music/> Efeitos Sonoros</CardTitle>
                    <CardDescription>
                       Faça o upload dos seus efeitos sonoros para o jogo. Use arquivos pequenos (.mp3, .wav) para melhor performance.
                    </CardDescription>
                </CardHeader>
                 <CardContent className="space-y-4">
                    <div className="grid md:grid-cols-3 gap-6">
                        <div className="space-y-2">
                            <Label htmlFor="soundWinUrl">Som de Vitória</Label>
                             <Input id="soundWinUrl" name="soundWinUrl" type="file" accept="audio/*" ref={soundWinInputRef} onChange={(e) => handleSoundFileChange(e, 'win')} />
                             {settings.soundWinUrl && <p className="text-xs text-muted-foreground">Atual: <a href={settings.soundWinUrl} target="_blank" rel="noopener noreferrer" className="underline">Ouvir</a></p>}
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="soundLoseUrl">Som de Derrota</Label>
                            <Input id="soundLoseUrl" name="soundLoseUrl" type="file" accept="audio/*" ref={soundLoseInputRef} onChange={(e) => handleSoundFileChange(e, 'lose')} />
                            {settings.soundLoseUrl && <p className="text-xs text-muted-foreground">Atual: <a href={settings.soundLoseUrl} target="_blank" rel="noopener noreferrer" className="underline">Ouvir</a></p>}
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="soundScratchUrl">Som de Raspar</Label>
                             <Input id="soundScratchUrl" name="soundScratchUrl" type="file" accept="audio/*" ref={soundScratchInputRef} onChange={(e) => handleSoundFileChange(e, 'scratch')} />
                             {settings.soundScratchUrl && <p className="text-xs text-muted-foreground">Atual: <a href={settings.soundScratchUrl} target="_blank" rel="noopener noreferrer" className="underline">Ouvir</a></p>}
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Configurações Financeiras</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-6">
                        <div className="space-y-2">
                            <Label htmlFor="minDeposit">Depósito Mínimo (R$)</Label>
                            <Input
                                id="minDeposit"
                                name="minDeposit"
                                type="number"
                                value={settings.minDeposit}
                                onChange={handleInputChange}
                                placeholder="10.00"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="minWithdrawal">Saque Mínimo (R$)</Label>
                            <Input
                                id="minWithdrawal"
                                name="minWithdrawal"
                                type="number"
                                value={settings.minWithdrawal}
                                onChange={handleInputChange}
                                placeholder="30.00"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="commissionRateL1">
                                <div className="flex items-center gap-2">
                                    <Percent className="h-4 w-4" /> Taxa Comissão Nível 1 (%)
                                </div>
                            </Label>
                            <Input
                                id="commissionRateL1"
                                name="commissionRateL1"
                                type="number"
                                value={settings.commissionRateL1}
                                onChange={handleInputChange}
                                placeholder="10"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="commissionRateL2">
                                <div className="flex items-center gap-2">
                                    <Percent className="h-4 w-4" /> Taxa Comissão Nível 2 (%)
                                </div>
                            </Label>
                            <Input
                                id="commissionRateL2"
                                name="commissionRateL2"
                                type="number"
                                value={settings.commissionRateL2}
                                onChange={handleInputChange}
                                placeholder="1"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="commissionRateL3">
                                <div className="flex items-center gap-2">
                                    <Percent className="h-4 w-4" /> Taxa Comissão Nível 3 (%)
                                </div>
                            </Label>
                            <Input
                                id="commissionRateL3"
                                name="commissionRateL3"
                                type="number"
                                value={settings.commissionRateL3}
                                onChange={handleInputChange}
                                placeholder="0.5"
                            />
                        </div>
                    </div>
                     <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-6 pt-4">
                        <div className="space-y-2">
                            <Label htmlFor="rolloverMultiplier">
                                <div className="flex items-center gap-2">
                                    <RotateCw className="h-4 w-4" /> Multiplicador de Rollover
                                </div>
                            </Label>
                            <Input
                                id="rolloverMultiplier"
                                name="rolloverMultiplier"
                                type="number"
                                value={settings.rolloverMultiplier}
                                onChange={handleInputChange}
                                placeholder="1"
                            />
                             <p className="text-xs text-muted-foreground flex items-center gap-1"><Info className="h-3 w-3" /> Ex: 1 = precisa apostar 1x o valor depositado.</p>
                        </div>
                     </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Code/> Scripts Personalizados</CardTitle>
                    <CardDescription>
                        Insira aqui scripts para serem adicionados ao &lt;head&gt; de todas as páginas. Use com cuidado.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                     <div className="space-y-2">
                        <Label htmlFor="customHeadScript">Script do Head</Label>
                        <Textarea
                            id="customHeadScript"
                            name="customHeadScript"
                            value={settings.customHeadScript}
                            onChange={handleInputChange}
                            placeholder="<!-- Cole seu script aqui, incluindo as tags <script>... -->"
                            rows={8}
                            className="font-mono text-xs"
                        />
                    </div>
                </CardContent>
            </Card>

            <div className="flex justify-end">
                <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto bg-green-500 hover:bg-green-600">
                    {saving ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : 'Salvar Configurações'}
                </Button>
            </div>
        </div>
    );
}
