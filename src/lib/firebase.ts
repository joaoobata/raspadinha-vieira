// Import the functions you need from the SDKs you need
import { initializeApp, getApps, getApp, type FirebaseOptions, type FirebaseApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig: FirebaseOptions = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
};

// This function ensures that we initialize the app only once.
// It should be called ONLY on the client-side, within components or hooks.
function getFirebaseApp(): FirebaseApp {
    if (getApps().length === 0) {
        if (!firebaseConfig.apiKey) {
             throw new Error("Firebase client config is not set in environment variables. Please check your .env file.");
        }
        return initializeApp(firebaseConfig);
    } else {
        return getApp();
    }
}

// Instead of exporting the instances directly, we now export functions
// to get them. This delays initialization until they are actually needed.
export const getFirebaseAuth = () => getAuth(getFirebaseApp());
export const getFirestoreDb = () => getFirestore(getFirebaseApp());
export const getFirebaseStorage = () => getStorage(getFirebaseApp());

// The direct exports are removed to prevent premature initialization during build.
// Use the get... functions inside your client components and hooks.
// Example:
// import { getFirebaseAuth } from '@/lib/firebase';
// const auth = getFirebaseAuth();
// const [user] = useAuthState(auth);
//
// For convenience, we can re-export the instances for use in files that are guaranteed to be client-side.
// However, the recommended approach is to call the get... functions inside your components/hooks.
const auth = getFirebaseAuth();
const db = getFirestoreDb();
const storage = getFirebaseStorage();

export { auth, db, storage };
