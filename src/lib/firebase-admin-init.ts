import admin from 'firebase-admin';
import type { ServiceAccount } from 'firebase-admin';

const getServiceAccount = (): ServiceAccount => {
  const serviceAccount: ServiceAccount = {
    projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
    privateKey: (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
  };

  if (!serviceAccount.projectId || !serviceAccount.privateKey || !serviceAccount.clientEmail) {
    throw new Error("Firebase Admin credentials (PROJECT_ID, PRIVATE_KEY, CLIENT_EMAIL) are not fully set in the environment. Please check your .env file.");
  }
  return serviceAccount;
}

const getStorageBucket = (): string => {
    const bucket = process.env.FIREBASE_STORAGE_BUCKET;
    if (!bucket) {
        throw new Error("Firebase Storage Bucket name (FIREBASE_STORAGE_BUCKET) is not set in the environment. Please check your .env file.");
    }
    return bucket;
}


function initializeAdminApp() {
    if (admin.apps.length === 0) {
        admin.initializeApp({
            credential: admin.credential.cert(getServiceAccount()),
            storageBucket: getStorageBucket(),
        });
        console.log("Firebase Admin SDK initialized successfully.");
    }
}

export function getAdminDb() {
    initializeAdminApp();
    return admin.firestore();
}

export function getAdminAuth() {
    initializeAdminApp();
    return admin.auth();
}

export function getAdminStorage() {
    initializeAdminApp();
    return admin.storage();
}
