
import { Wrench } from 'lucide-react';
import Link from 'next/link';

export default function BonusPage() {
  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-16 flex flex-col items-center justify-center text-center">
      <Wrench className="h-16 w-16 text-primary mb-4" />
      <h1 className="text-3xl font-bold text-white">Página em Construção</h1>
      <p className="mt-2 text-lg text-muted-foreground">
        Estamos trabalhando duro para trazer seus bônus e promoções para esta área.
      </p>
      <p className="text-lg text-muted-foreground">Volte em breve!</p>
      <Link href="/" className="mt-6 inline-block bg-primary text-primary-foreground py-2 px-6 rounded-lg font-semibold hover:bg-primary/80 transition-colors">
        Voltar para a Home
      </Link>
    </div>
  );
}
