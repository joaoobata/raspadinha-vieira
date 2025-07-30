
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { getBanners, saveSingleBanner, saveHomeBanners, BannersData } from './actions';
import { Skeleton } from '@/components/ui/skeleton';
import { LoaderCircle, Link as LinkIcon, PlusCircle, Trash2, Upload } from 'lucide-react';
import Image from 'next/image';
import { v4 as uuidv4 } from 'uuid';
import { Separator } from '@/components/ui/separator';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '@/lib/firebase';

type BannerName = 'auth' | 'deposit';

interface BannerConfig {
    title: string;
    description: string;
    width: number;
    height: number;
    previewClasses: string;
}

interface HomeBannerState {
    id: string;
    url: string;
    link?: string;
    file?: File;
    previewUrl?: string;
}

const bannerConfigs: Record<BannerName, BannerConfig> = {
    auth: {
        title: 'Banner de Autenticação',
        description: 'Exibido nas páginas de login e cadastro.',
        width: 800,
        height: 600,
        previewClasses: 'aspect-[4/3] w-full'
    },
    deposit: {
        title: 'Banner de Depósito',
        description: 'Exibido na área de depósito para promoções.',
        width: 400,
        height: 200,
        previewClasses: 'aspect-video w-full'
    }
};

export default function AdminBannersPage() {
    const { toast } = useToast();
    const [adminUser] = useAuthState(auth);
    const [banners, setBanners] = useState<BannersData | null>(null);
    const [homeBanners, setHomeBanners] = useState<HomeBannerState[]>([]);
    
    const [authBannerFile, setAuthBannerFile] = useState<File | null>(null);
    const [depositBannerFile, setDepositBannerFile] = useState<File | null>(null);
    
    const [authPreview, setAuthPreview] = useState<string | null>(null);
    const [depositPreview, setDepositPreview] = useState<string | null>(null);

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState<string | null>(null);
    
    const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

    const fetchBanners = useCallback(async () => {
        setLoading(true);
        const result = await getBanners();
        if (result.success && result.data) {
            setBanners(result.data);
            setHomeBanners(result.data.home.map(b => ({ ...b, previewUrl: b.url })) || []);
            setAuthPreview(result.data.auth.url);
            setDepositPreview(result.data.deposit.url);
        } else {
            toast({
                variant: 'destructive',
                title: 'Erro ao Carregar',
                description: result.error || 'Não foi possível carregar os banners.',
            });
        }
        setLoading(false);
    }, [toast]);

    useEffect(() => {
        fetchBanners();
    }, [fetchBanners]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, name: BannerName | number) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onloadend = () => {
             const preview = reader.result as string;
             if(typeof name === 'number') { // Home Banner
                const updated = [...homeBanners];
                updated[name].file = file;
                updated[name].previewUrl = preview;
                setHomeBanners(updated);
             } else { // Single Banner
                if(name === 'auth') {
                    setAuthBannerFile(file);
                    setAuthPreview(preview);
                } else if(name === 'deposit') {
                    setDepositBannerFile(file);
                    setDepositPreview(preview);
                }
             }
        };
        reader.readAsDataURL(file);
    };
    
    const fileToDataUrl = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    const handleSingleBannerSave = async (name: BannerName) => {
        if (!banners || !adminUser) return;
        const bannerLink = banners[name]?.link || '#';
        const fileToUpload = name === 'auth' ? authBannerFile : depositBannerFile;
        
        setSaving(name);
        
        let fileDataUrl: string | undefined = undefined;
        if(fileToUpload) {
            fileDataUrl = await fileToDataUrl(fileToUpload);
        }
        
        const result = await saveSingleBanner(name, bannerLink, adminUser.uid, fileDataUrl);
        
        if (result.success) {
            toast({ title: 'Sucesso!', description: 'Banner salvo com sucesso.' });
            await fetchBanners(); // Re-fetch to confirm
        } else {
            toast({ variant: 'destructive', title: 'Erro ao Salvar', description: result.error });
        }
        setSaving(null);
    };
    
    const handleHomeBannersSave = async () => {
        if (!adminUser) return;
        setSaving('home');
        
        const payload = await Promise.all(homeBanners.map(async banner => {
            let fileDataUrl: string | undefined = undefined;
            if(banner.file) {
                fileDataUrl = await fileToDataUrl(banner.file);
            }
            return {
                id: banner.id,
                link: banner.link,
                fileDataUrl,
                existingUrl: banner.file ? undefined : banner.url // Pass existing URL only if no new file
            }
        }));

        const result = await saveHomeBanners(payload, adminUser.uid);
        if (result.success) {
            toast({ title: 'Sucesso!', description: 'Banners da página inicial salvos com sucesso.' });
            await fetchBanners();
        } else {
            toast({ variant: 'destructive', title: 'Erro ao Salvar', description: result.error });
        }
        setSaving(null);
    };


    const handleSingleBannerChange = (name: BannerName, field: 'link', value: string) => {
        if (!banners) return;
        setBanners(prev => {
            if (!prev) return null;
            return { 
                ...prev,
                [name]: {
                    ...(prev[name] || { id: `${name}-banner`, url: '', link: '#' }),
                    [field]: value 
                }
            }
        });
    };
    

    const handleHomeBannerChange = (index: number, field: 'link', value: string) => {
        const updatedBanners = [...homeBanners];
        updatedBanners[index] = { ...updatedBanners[index], [field]: value };
        setHomeBanners(updatedBanners);
    };

    const handleAddHomeBanner = () => {
        setHomeBanners([...homeBanners, { id: uuidv4(), url: '', link: '/' }]);
    };

    const handleRemoveHomeBanner = (index: number) => {
        const updatedBanners = homeBanners.filter((_, i) => i !== index);
        setHomeBanners(updatedBanners);
    };

    const renderSingleBannerCard = (name: BannerName) => {
        const config = bannerConfigs[name];
        const previewUrl = name === 'auth' ? authPreview : depositPreview;
        const bannerContent = banners ? banners[name] : { id: `${name}-banner`, url: '', link: '#' };
        const finalPreviewUrl = previewUrl || `https://placehold.co/${config.width}x${config.height}.png/000000/FFF?text=Preview`;

        return (
            <Card key={name}>
                <CardHeader>
                    <CardTitle>{config.title}</CardTitle>
                    <CardDescription>{config.description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div>
                        <Label>Preview</Label>
                        <div className={`mt-2 rounded-lg border-2 border-dashed bg-secondary/50 p-2 overflow-hidden ${config.previewClasses}`}>
                           <Image 
                             src={finalPreviewUrl}
                             alt={`Preview do ${config.title}`}
                             width={config.width}
                             height={config.height}
                             className="w-full h-full object-cover rounded-md"
                           />
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="space-y-2">
                             <Label>Imagem do Banner</Label>
                              <Input
                                type="file"
                                className="hidden"
                                accept="image/png, image/jpeg, image/gif, image/webp"
                                ref={el => fileInputRefs.current[name] = el}
                                onChange={(e) => handleFileChange(e, name)}
                            />
                            <Button variant="outline" onClick={() => fileInputRefs.current[name]?.click()}>
                                <Upload className="mr-2 h-4 w-4" />
                                Escolher Imagem
                            </Button>
                        </div>
                        <div className="space-y-2">
                             <Label htmlFor={`banner-link-${name}`} className="flex items-center gap-2">
                                <LinkIcon className="h-4 w-4" />
                                URL do Link (opcional)
                            </Label>
                            <Input
                                id={`banner-link-${name}`}
                                placeholder="Ex: /play/card-id ou https://..."
                                value={bannerContent?.link || ''}
                                onChange={(e) => handleSingleBannerChange(name, 'link', e.target.value)}
                            />
                        </div>
                    </div>
                     <div className="flex justify-end">
                        <Button onClick={() => handleSingleBannerSave(name)} disabled={saving === name}>
                            {saving === name ? <LoaderCircle className="h-4 w-4 animate-spin" /> : 'Salvar Banner'}
                        </Button>
                    </div>
                </CardContent>
            </Card>
        );
    }

    if (loading) {
        return (
             <div className="space-y-8">
                <div>
                    <Skeleton className="h-8 w-1/3 mb-2" />
                    <Skeleton className="h-4 w-1/2" />
                </div>
                 <div className="grid gap-6 lg:grid-cols-2">
                    <Skeleton className="h-[600px] w-full" />
                    <div className="space-y-6">
                        <Skeleton className="h-96 w-full" />
                        <Skeleton className="h-96 w-full" />
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold">Gerenciar Banners</h1>
                <p className="text-muted-foreground">Atualize as imagens de banner exibidas na sua plataforma.</p>
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
                <Card>
                     <CardHeader>
                        <CardTitle>Banners da Home (Carrossel)</CardTitle>
                        <CardDescription>Adicione um ou mais banners para a página inicial.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {homeBanners.map((banner, index) => (
                            <div key={banner.id} className="p-4 border rounded-lg space-y-4 relative">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="absolute top-2 right-2 h-7 w-7 text-destructive hover:bg-destructive/10"
                                    onClick={() => handleRemoveHomeBanner(index)}
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                                {banner.previewUrl && 
                                    <Image 
                                        src={banner.previewUrl}
                                        alt="Preview"
                                        width={400}
                                        height={150}
                                        className="w-full aspect-video object-cover rounded-md border"
                                    />
                                }
                                <div className="space-y-2">
                                     <Label>Imagem</Label>
                                     <Input
                                        type="file"
                                        className="hidden"
                                        accept="image/png, image/jpeg, image/gif, image/webp"
                                        ref={el => fileInputRefs.current[`home-${index}`] = el}
                                        onChange={(e) => handleFileChange(e, index)}
                                    />
                                    <Button variant="outline" size="sm" onClick={() => fileInputRefs.current[`home-${index}`]?.click()}>
                                        <Upload className="mr-2 h-4 w-4" />
                                        Alterar Imagem
                                    </Button>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor={`home-link-${index}`}>URL do Link (opcional)</Label>
                                    <Input
                                        id={`home-link-${index}`}
                                        value={banner.link}
                                        placeholder="/"
                                        onChange={(e) => handleHomeBannerChange(index, 'link', e.target.value)}
                                    />
                                </div>
                            </div>
                        ))}
                        <Button variant="outline" onClick={handleAddHomeBanner}>
                            <PlusCircle className="mr-2 h-4 w-4" />
                            Adicionar Banner na Home
                        </Button>
                        <Separator />
                        <div className="flex justify-end">
                            <Button onClick={handleHomeBannersSave} disabled={saving === 'home'}>
                                {saving === 'home' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : 'Salvar Banners da Home'}
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                <div className="space-y-6">
                    {renderSingleBannerCard('auth')}
                    {renderSingleBannerCard('deposit')}
                </div>
            </div>
        </div>
    );
}
