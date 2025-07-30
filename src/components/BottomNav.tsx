
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Gamepad2, Home, User, Wallet, Users2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { DepositDialog } from './DepositDialog';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '@/lib/firebase';
import { AuthDialog } from './AuthDialog';

const navItems = [
    { href: '/', label: 'Início', icon: Home },
    { href: '/#jogos', label: 'Jogos', icon: Gamepad2 },
];

const navItemsRight = [
    { href: '/account/affiliates', label: 'Afiliados', icon: Users2 },
    { href: '/account', label: 'Conta', icon: User },
];

export function BottomNav() {
    const pathname = usePathname();
    const [user] = useAuthState(auth);
    const [isDepositOpen, setIsDepositOpen] = useState(false);
    const [isAuthOpen, setIsAuthOpen] = useState(false);

    const handleDepositClick = () => {
        if (user) {
            setIsDepositOpen(true);
        } else {
            setIsAuthOpen(true);
        }
    };
    
    const handleGamesClick = (e: React.MouseEvent<HTMLAnchorElement, MouseEvent>) => {
        if (pathname === '/') {
            e.preventDefault();
            const gamesSection = document.getElementById('jogos');
            if(gamesSection) {
                 gamesSection.scrollIntoView({ behavior: 'smooth' });
            }
        }
    }

    return (
        <>
        <div className="md:hidden fixed bottom-0 left-0 right-0 h-20 bg-background/90 backdrop-blur-lg border-t border-border z-50">
            <div className="grid h-full grid-cols-5 items-center">
                {navItems.map(item => (
                    <Link key={item.href} href={item.href} onClick={item.href === '/#jogos' ? handleGamesClick : undefined} className={cn(
                        "flex flex-col items-center justify-center gap-1 text-muted-foreground transition-colors h-full",
                        pathname === item.href && "text-primary"
                    )}>
                        <item.icon className="h-6 w-6" />
                        <span className="text-xs font-medium">{item.label}</span>
                    </Link>
                ))}

                <div className="flex justify-center">
                     <button 
                        onClick={handleDepositClick}
                        className="flex items-center justify-center h-16 w-16 rounded-full bg-primary text-primary-foreground shadow-lg -translate-y-4 ring-4 ring-background"
                    >
                        <Wallet className="h-8 w-8" />
                        <span className="sr-only">Depositar</span>
                    </button>
                </div>
                
                {navItemsRight.map(item => (
                    <Link key={item.href} href={item.href} className={cn(
                        "flex flex-col items-center justify-center gap-1 text-muted-foreground transition-colors h-full",
                        pathname.startsWith(item.href) && item.href !== '/' && "text-primary"
                    )}>
                        <item.icon className="h-6 w-6" />
                        <span className="text-xs font-medium">{item.label}</span>
                    </Link>
                ))}
            </div>
        </div>
        {user ? (
            <DepositDialog isOpen={isDepositOpen} onOpenChange={setIsDepositOpen} />
        ) : (
            <AuthDialog isOpen={isAuthOpen} onOpenChange={setIsAuthOpen} defaultTab="login" />
        )}
        </>
    );
}

