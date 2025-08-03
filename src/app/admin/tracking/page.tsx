'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { getTrackingSettings, saveTrackingSettings, TrackingSettingsData } from './actions';
import { Skeleton } from '@/components/ui/skeleton';
import { LoaderCircle, Save, Info } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '@/lib/firebase';

export default function AdminTrackingPage() {
    const { toast } = useToast();
    const [adminUser] = useAuthState(auth);
    const [settings, setSettings] = useState<TrackingSettingsData>({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        const fetchSettings = async () => {
            setLoading(true);
            const result = await getTrackingSettings();
            if (result.success && result.data) {
                setSettings(result.data);
            } else {
                toast({
                    variant: 'destructive',
                    title: 'Erro ao Carregar',
                    description: result.error || 'Não foi possível carregar as configurações de rastreamento.',
                });
            }
            setLoading(false);
        };
        fetchSettings();
    }, [toast]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setSettings(prev => ({ ...prev, [name]: value }));
    };

    const handleSave = async () => {
        if (!adminUser) {
            toast({ variant: 'destructive', title: 'Erro', description: 'Admin não autenticado.' });
            return;
        }
        setSaving(true);
        const result = await saveTrackingSettings(settings, adminUser.uid);
        if (result.success) {
            toast({
                title: 'Sucesso!',
                description: 'Configurações de rastreamento salvas com sucesso.',
            });
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
                <Skeleton className="h-48 w-full" />
            </div>
        )
    }

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold">Configurações de Rastreamento</h1>
                <p className="text-muted-foreground">Gerencie seus pixels e APIs de conversão para otimização de campanhas.</p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Meta Ads (Facebook)</CardTitle>
                    <CardDescription>
                       Insira o ID do seu Pixel para rastreamento no navegador e o Token da API de Conversões para rastreamento no servidor.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="space-y-2">
                        <Label htmlFor="metaPixelId">ID do Pixel da Meta</Label>
                        <Input
                            id="metaPixelId"
                            name="metaPixelId"
                            value={settings.metaPixelId || ''}
                            onChange={handleInputChange}
                            placeholder="Ex: 1234567890123456"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="metaConversionApiToken">Token da API de Conversões da Meta</Label>
                        <Input
                            id="metaConversionApiToken"
                            name="metaConversionApiToken"
                            type="password"
                            value={settings.metaConversionApiToken || ''}
                            onChange={handleInputChange}
                            placeholder="Cole seu token de acesso da API de conversões aqui"
                        />
                         <p className="text-xs text-muted-foreground">
                            Opcional, mas altamente recomendado para rastreamento de eventos do lado do servidor.
                        </p>
                    </div>
                </CardContent>
            </Card>

             <Card>
                <CardHeader>
                    <CardTitle>TikTok Ads</CardTitle>
                     <CardDescription>
                        Insira as informações do seu Pixel do TikTok e o Token de Acesso da Events API.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="space-y-2">
                        <Label htmlFor="tiktokPixelId">ID do Pixel do TikTok</Label>
                        <Input
                            id="tiktokPixelId"
                            name="tiktokPixelId"
                            value={settings.tiktokPixelId || ''}
                            onChange={handleInputChange}
                            placeholder="Ex: C123ABCD456E7F89GHIJ"
                        />
                         <p className="text-xs text-muted-foreground">
                            Encontrado em Ativos &gt; Eventos no seu painel do TikTok Ads Manager.
                        </p>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="tiktokAccessToken">Token de Acesso da Events API</Label>
                        <Input
                            id="tiktokAccessToken"
                            name="tiktokAccessToken"
                            type="password"
                            value={settings.tiktokAccessToken || ''}
                            onChange={handleInputChange}
                            placeholder="Cole seu token de acesso gerado nas configurações do pixel"
                        />
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Kwai for Business</CardTitle>
                     <CardDescription>
                        Insira o ID do seu Pixel do Kwai para rastreamento de eventos server-side.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="space-y-2">
                        <Label htmlFor="kwaiPixelId">ID do Pixel do Kwai</Label>
                        <Input
                            id="kwaiPixelId"
                            name="kwaiPixelId"
                            value={settings.kwaiPixelId || ''}
                            onChange={handleInputChange}
                            placeholder="Ex: KFP-12345-6789-abcdef"
                        />
                         <p className="text-xs text-muted-foreground">
                           Encontrado em Ativos > Pixel no seu painel do Kwai for Business.
                        </p>
                    </div>
                </CardContent>
            </Card>


            <Card>
                <CardHeader>
                    <CardTitle>Google Ads</CardTitle>
                     <CardDescription>
                        Insira as informações da sua tag do Google para rastreamento no navegador e da API de Conversões do lado do servidor.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="space-y-2">
                        <Label htmlFor="googleAdsId">ID da Tag do Google (AW-)</Label>
                        <Input
                            id="googleAdsId"
                            name="googleAdsId"
                            value={settings.googleAdsId || ''}
                            onChange={handleInputChange}
                            placeholder="Ex: AW-123456789"
                        />
                         <p className="text-xs text-muted-foreground">
                            Usado para o rastreamento no navegador (gtag.js).
                        </p>
                    </div>
                     <Separator />
                     <div className="space-y-2">
                        <Label htmlFor="googleAdsCustomerId">ID de Cliente do Google Ads</Label>
                        <Input
                            id="googleAdsCustomerId"
                            name="googleAdsCustomerId"
                            value={settings.googleAdsCustomerId || ''}
                            onChange={handleInputChange}
                            placeholder="Ex: 123-456-7890 (sem traços)"
                        />
                        <p className="text-xs text-muted-foreground flex items-center gap-1"><Info className="h-3 w-3" />Encontrado no canto superior direito do seu painel do Google Ads.</p>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="googleDeveloperToken">Token de Desenvolvedor do Google Ads</Label>
                        <Input
                            id="googleDeveloperToken"
                            name="googleDeveloperToken"
                            type="password"
                            value={settings.googleDeveloperToken || ''}
                            onChange={handleInputChange}
                            placeholder="Seu token de desenvolvedor"
                        />
                         <p className="text-xs text-muted-foreground flex items-center gap-1"><Info className="h-3 w-3" />Encontrado em Ferramentas e Configurações &gt; Acesso e Segurança &gt; API no seu painel.</p>

                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="googleAdsLoginCustomerId">Login Customer ID (MCC)</Label>
                        <Input
                            id="googleAdsLoginCustomerId"
                            name="googleAdsLoginCustomerId"
                            value={settings.googleAdsLoginCustomerId || ''}
                            onChange={handleInputChange}
                            placeholder="Ex: 987-654-3210 (opcional)"
                        />
                         <p className="text-xs text-muted-foreground flex items-center gap-1"><Info className="h-3 w-3" />Se sua conta é gerenciada por uma MCC, insira o ID da MCC aqui.</p>
                    </div>
                </CardContent>
            </Card>

            <div className="flex justify-end">
                <Button onClick={handleSave} disabled={saving || !adminUser} className="w-full sm:w-auto bg-green-500 hover:bg-green-600">
                    {saving ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <><Save className="mr-2 h-4 w-4" /> Salvar Tudo</>}
                </Button>
            </div>
        </div>
    );
}
