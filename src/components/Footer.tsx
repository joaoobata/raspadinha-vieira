'use client';
import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { getSettings } from '@/app/admin/settings/actions';
import { Skeleton } from './ui/skeleton';

export function Footer() {
  const [logoUrl, setLogoUrl] = useState('');

   useEffect(() => {
    const fetchLogo = async () => {
      const settings = await getSettings();
      if (settings.success && settings.data?.logoUrl) {
        setLogoUrl(settings.data.logoUrl);
      }
    };
    fetchLogo();
  }, []);

  return (
    <footer className="bg-secondary/50 border-t border-gray-700">
      <div className="container mx-auto py-12 px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          <div className="space-y-4 col-span-2 md:col-span-1">
             {logoUrl ? (
                <Image src={logoUrl} alt="Raspadinha Oficial" width={150} height={50} data-ai-hint="logo" />
              ) : (
                <Skeleton className="h-[50px] w-[150px]" />
              )}
            <p className="text-muted-foreground text-sm">
              Raspou, levou! é a maior e melhor plataforma de raspadinhas do Brasil
            </p>
            <p className="text-muted-foreground text-sm">
              © {new Date().getFullYear()} Raspou, levou!. Todos os direitos reservados.
            </p>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground tracking-wider uppercase">Raspadinhas</h3>
            <ul className="mt-4 space-y-2">
              <li><Link href="#" className="text-base text-muted-foreground hover:text-primary">Caminho</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground tracking-wider uppercase">Carteira</h3>
            <ul className="mt-4 space-y-2">
              <li><Link href="#" className="text-base text-muted-foreground hover:text-primary">Depósito</Link></li>
              <li><Link href="#" className="text-base text-muted-foreground hover:text-primary">Saques</Link></li>
            </ul>
          </div>
           <div>
            <h3 className="text-sm font-semibold text-foreground tracking-wider uppercase">Legal</h3>
            <ul className="mt-4 space-y-2">
              <li><Link href="#" className="text-base text-muted-foreground hover:text-primary">Termos de Uso</Link></li>
              <li><Link href="#" className="text-base text-muted-foreground hover:text-primary">Política de Privacidade</Link></li>
              <li><Link href="#" className="text-base text-muted-foreground hover:text-primary">Termos de Bônus</Link></li>
            </ul>
          </div>
        </div>
      </div>
    </footer>
  );
}
