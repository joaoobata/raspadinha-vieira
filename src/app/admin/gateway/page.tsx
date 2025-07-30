
// HMR fix
'use client';

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { LoaderCircle, Save } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthState } from "react-firebase-hooks/auth";
import { auth } from "@/lib/firebase";
import { useState, useEffect, useCallback } from 'react';
import { getGatewaySettings, saveGatewaySettings } from './actions';


export default function GatewaySettingsPage() {
    const { toast } = useToast();
    const [adminUser, adminLoading] = useAuthState(auth);

    // States are initialized with empty strings to ensure they are always controlled.
    const [cnPayPublicKey, setCnPayPublicKey] = useState("");
    const [cnPaySecretKey, setCnPaySecretKey] = useState("");
    const [allowedIps, setAllowedIps] = useState("");
    
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const fetchSettings = useCallback(async () => {
        if (!adminUser) return;
        setLoading(true);
        const result = await getGatewaySettings(adminUser.uid);
        if (result.success && result.data) {
            setCnPayPublicKey(result.data.publicKey || "");
            setCnPaySecretKey(result.data.secretKey || "");
            setAllowedIps((result.data.allowedIps || []).join('\n'));
        } else {
            toast({ variant: "destructive", title: "Erro de Carregamento!", description: result.error });
        }
        setLoading(false);
    }, [adminUser, toast]);

    useEffect(() => {
        if (!adminLoading && adminUser) {
            fetchSettings();
        } else if (!adminLoading && !adminUser) {
            setLoading(false);
        }
    }, [adminLoading, adminUser, fetchSettings]);

    const handleSave = async () => {
        if (!adminUser) {
            toast({ variant: "destructive", title: "Erro!", description: "Você precisa estar autenticado como administrador para salvar." });
            return;
        }

        setSaving(true);
        try {
            const ipArray = allowedIps.split('\n').map(ip => ip.trim()).filter(Boolean);
            
            const result = await saveGatewaySettings({
                publicKey: cnPayPublicKey,
                secretKey: cnPaySecretKey,
                allowedIps: ipArray,
            }, adminUser.uid);

            if (result.success) {
                 toast({ title: "Sucesso!", description: "Configurações do Gateway salvas com sucesso." });
            } else {
                toast({ variant: "destructive", title: "Erro!", description: result.error });
            }
        } catch (error: any) {
            toast({ variant: "destructive", title: "Erro!", description: error.message });
        } finally {
            setSaving(false);
        }
    };
    
    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold">Configuração de Gateway</h1>
                <p className="text-muted-foreground">Gerencie as credenciais e a segurança do seu gateway de pagamento.</p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Credenciais CN Pay</CardTitle>
                    <CardDescription>Insira suas chaves de API fornecidas pela CN Pay.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                     {loading ? (
                        <>
                            <div className="space-y-2"><Label>Chave Pública (x-public-key)</Label><Skeleton className="h-10 w-full" /></div>
                            <div className="space-y-2"><Label>Chave Secreta (x-secret-key)</Label><Skeleton className="h-10 w-full" /></div>
                        </>
                    ) : (
                        <>
                            <div className="space-y-2">
                                <Label htmlFor="cnpay-public-key">Chave Pública (x-public-key)</Label>
                                <Input id="cnpay-public-key" placeholder="Sua chave pública" value={cnPayPublicKey} onChange={(e) => setCnPayPublicKey(e.target.value)} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="cnpay-secret-key">Chave Secreta (x-secret-key)</Label>
                                <Input id="cnpay-secret-key" type="password" placeholder="Sua chave secreta" value={cnPaySecretKey} onChange={(e) => setCnPaySecretKey(e.target.value)} />
                            </div>
                        </>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Segurança de Webhook</CardTitle>
                    <CardDescription>
                        Para aumentar a segurança, você pode restringir os webhooks para aceitar requisições apenas de IPs autorizados pela CN Pay. Insira um IP por linha.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                     {loading ? (
                        <div className="space-y-2"><Label>IPs Permitidos</Label><Skeleton className="h-24 w-full" /></div>
                     ) : (
                        <div className="space-y-2">
                            <Label htmlFor="allowed-ips">IPs Permitidos (um por linha)</Label>
                            <Textarea
                                id="allowed-ips"
                                value={allowedIps}
                                onChange={(e) => setAllowedIps(e.target.value)}
                                placeholder="200.10.20.30&#10;201.40.50.60"
                                rows={5}
                            />
                        </div>
                     )}
                </CardContent>
            </Card>

            <div className="flex justify-end">
                <Button onClick={handleSave} disabled={loading || saving} className="w-full sm:w-auto">
                    {saving ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <><Save className="mr-2 h-4 w-4" /> Salvar Configurações</>}
                </Button>
            </div>

            <footer className="text-center text-muted-foreground text-xs mt-12">
                <p>Desenvolvido por NexCode</p>
            </footer>
        </div>
    );
}
