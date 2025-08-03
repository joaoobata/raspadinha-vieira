
'use server';
import { getAdminDb, getAdminStorage } from "@/lib/firebase-admin-init";
import { FieldValue } from "firebase-admin/firestore";
import { cache } from 'react';
import { logAdminAction } from "@/lib/logging";

export interface BannerContent {
    id: string; // uuid
    url: string;
    link?: string;
}

export interface BannersData {
    home: BannerContent[];
    auth: BannerContent;
    deposit: BannerContent;
}

async function uploadImageAndGetURL(fileBuffer: Buffer, fileName: string, mimeType: string): Promise<string> {
    const bucket = getAdminStorage().bucket(); // Use the default bucket configured in firebase-admin-init
    const file = bucket.file(`banners/${fileName}`);

    await file.save(fileBuffer, {
        metadata: {
            contentType: mimeType,
        },
    });
    
    // Make the file public and get the URL
    await file.makePublic();
    
    return file.publicUrl();
}

// Get all banners
export const getBanners = cache(async (): Promise<{ success: boolean; data?: BannersData; error?: string }> => {
    try {
        const adminDb = getAdminDb();
        const bannersCollection = adminDb.collection('banners');
        const snapshot = await bannersCollection.get();
        const data: BannersData = {
            home: [],
            auth: { id: 'auth-banner', url: '', link: '#' },
            deposit: { id: 'deposit-banner', url: '', link: '#' }
        };

        if (snapshot.empty) {
            return { success: true, data };
        }

        snapshot.docs.forEach(doc => {
            const docData = doc.data();
            if (doc.id === 'home') {
                data.home = Array.isArray(docData.banners) ? docData.banners : [];
            } else if (doc.id === 'auth') {
                data.auth = {
                    id: doc.id + '-banner',
                    url: docData.url || '',
                    link: docData.link || '#'
                };
            } else if (doc.id === 'deposit') {
                data.deposit = {
                    id: doc.id + '-banner',
                    url: docData.url || '',
                    link: docData.link || '#'
                };
            }
        });
        return { success: true, data };
    } catch (error: any) {
        console.error("Error getting banners: ", error);
        return { success: false, error: "Falha ao buscar banners. Tente novamente mais tarde." };
    }
});


// Create or Update a single (non-home) banner
export async function saveSingleBanner(id: 'auth' | 'deposit', link: string, adminId: string, fileDataUrl?: string): Promise<{ success: boolean; error?: string }> {
    try {
        if (!id) {
             return { success: false, error: "ID do banner é obrigatório." };
        }
        
        const adminDb = getAdminDb();
        const bannersCollection = adminDb.collection('banners');
        
        let newUrl = '';
        let detailsForLog: any = { bannerId: id, link };

        if(fileDataUrl) {
            const [metadata, base64Data] = fileDataUrl.split(',');
            const mimeType = metadata.split(':')[1].split(';')[0];
            const fileBuffer = Buffer.from(base64Data, 'base64');
            const fileName = `${id}-${Date.now()}`;
            newUrl = await uploadImageAndGetURL(fileBuffer, fileName, mimeType);
            await bannersCollection.doc(id).set({ url: newUrl, link: link || '#' }, { merge: true });
            detailsForLog.newUrl = newUrl;
            detailsForLog.action = 'update_with_image';
        } else {
            // If no new file is uploaded, just update the link
            await bannersCollection.doc(id).set({ link: link || '#' }, { merge: true });
            detailsForLog.action = 'update_link_only';
        }

        await logAdminAction(adminId, adminId, 'UPDATE_SINGLE_BANNER', detailsForLog, 'SUCCESS');
        return { success: true };
    } catch (error: any) {
        console.error("Error saving banner: ", error);
        await logAdminAction(adminId, adminId, 'UPDATE_SINGLE_BANNER', { bannerId: id, link, error: error.message, stack: error.stack }, 'ERROR');
        return { success: false, error: "Falha ao salvar o banner. Tente novamente." };
    }
}

// Save the entire list of home banners
export async function saveHomeBanners(banners: {link?: string, fileDataUrl?: string, existingUrl?: string, id: string}[], adminId: string): Promise<{ success: boolean; error?: string }> {
     try {
        const adminDb = getAdminDb();
        const bannersCollection = adminDb.collection('banners');
        
        const processedBanners: BannerContent[] = [];

        for (const banner of banners) {
            let finalUrl = banner.existingUrl;
            if(banner.fileDataUrl) {
                const [metadata, base64Data] = banner.fileDataUrl.split(',');
                const mimeType = metadata.split(':')[1].split(';')[0];
                const fileBuffer = Buffer.from(base64Data, 'base64');
                const fileName = `home-${banner.id}-${Date.now()}`;
                finalUrl = await uploadImageAndGetURL(fileBuffer, fileName, mimeType);
            }

            if (!finalUrl) {
                // Skip if no URL is available (e.g. new banner without file)
                continue;
            }

            processedBanners.push({
                id: banner.id,
                url: finalUrl,
                link: banner.link || '/'
            });
        }
        
        await bannersCollection.doc('home').set({
            banners: processedBanners,
            updatedAt: FieldValue.serverTimestamp()
        });
        
        await logAdminAction(adminId, adminId, 'UPDATE_HOME_BANNERS', { bannerCount: processedBanners.length }, 'SUCCESS');
        return { success: true };
    } catch (error: any) {
        console.error("Error saving home banners: ", error);
        await logAdminAction(adminId, adminId, 'UPDATE_HOME_BANNERS', { bannerCount: banners.length, error: error.message, stack: error.stack }, 'ERROR');
        return { success: false, error: "Falha ao salvar os banners da home. Tente novamente." };
    }
}
