
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Gamepad2, Home, User, Wallet, Users2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useEffect } from 'react';
import { DepositDialog } from './DepositDialog';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { AuthDialog } from './AuthDialog';
import { doc, getDoc } from 'firebase/firestore';

const navItems = [
    { href: '/', label: 'Início', icon: Home },
    { href: '/#jogos', label: 'Jogos', icon: Gamepad2 },
];

const navItemsRight = [
    { href: '/account/affiliates', label: 'Afiliados', icon: Users2, affiliateHref: '/affiliate-panel' },
    { href: '/account', label: 'Conta', icon: User },
];

export function BottomNav() {
    const pathname = usePathname();
    const [user] = useAuthState(auth);
    const [userRoles, setUserRoles] = useState<string[]>([]);
    const [isDepositOpen, setIsDepositOpen] = useState(false);
    const [isAuthOpen, setIsAuthOpen] = useState(false);
    
    useEffect(() => {
        if(user) {
            const userDocRef = doc(db, 'users', user.uid);
            const unsub = getDoc(userDocRef).then(docSnap => {
                if(docSnap.exists()){
                    setUserRoles(docSnap.data()?.roles || []);
                }
            });
        } else {
            setUserRoles([]);
        }
    }, [user]);

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
    
    const isAffiliate = userRoles.includes('afiliado') || userRoles.includes('admin');

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
                
                {navItemsRight.map(item => {
                    const href = isAffiliate && item.affiliateHref ? item.affiliateHref : item.href;
                    return (
                        <Link key={item.label} href={href} className={cn(
                            "flex flex-col items-center justify-center gap-1 text-muted-foreground transition-colors h-full",
                            pathname.startsWith(href) && href !== '/' && "text-primary"
                        )}>
                            <item.icon className="h-6 w-6" />
                            <span className="text-xs font-medium">{item.label}</span>
                        </Link>
                    )
                })}
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
