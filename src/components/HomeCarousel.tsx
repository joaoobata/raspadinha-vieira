
'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Card } from '@/components/ui/card';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel"
import Autoplay from "embla-carousel-autoplay"
import { type BannerContent } from '@/app/admin/banners/actions';

interface HomeCarouselProps {
    banners: BannerContent[];
}

export function HomeCarousel({ banners }: HomeCarouselProps) {
    if (!banners || banners.length === 0) {
        return null;
    }
    
    return (
        <Carousel
            plugins={[Autoplay({ delay: 5000, stopOnInteraction: true })]}
            opts={{ loop: banners.length > 1 }}
            className="w-full"
          >
            <CarouselContent>
              {banners.map((banner, index) => (
                <CarouselItem key={banner.id || index}>
                  <Link href={banner.link || '/'}>
                     <Card className="bg-card border-none overflow-hidden rounded-lg aspect-[8/3] max-h-[600px] relative">
                        <Image
                        src={banner.url || 'https://placehold.co/1920x640.png'}
                        alt={`Banner ${index + 1}`}
                        fill
                        className="object-cover"
                        data-ai-hint="promotion banner"
                        />
                    </Card>
                  </Link>
                </CarouselItem>
              ))}
            </CarouselContent>
            {banners.length > 1 && (
              <>
                <CarouselPrevious className="absolute left-4 top-1/2 -translate-y-1/2" />
                <CarouselNext className="absolute right-4 top-1/2 -translate-y-1/2" />
              </>
            )}
          </Carousel>
    );
}
