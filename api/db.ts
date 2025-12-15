import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';

// Global cache for the DB instance
let cachedDb: any = null;

function getDbInstance() {
    if (cachedDb) return cachedDb;

    const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    
    // If key is missing, throw specific error to be caught by API handlers
    if (!rawKey) {
        throw new Error("Configuration Error: FIREBASE_SERVICE_ACCOUNT_KEY is missing.");
    }

    // Initialize if not already initialized
    if (getApps().length === 0) {
        try {
            const serviceAccount = JSON.parse(rawKey);
            initializeApp({
                credential: cert(serviceAccount),
                databaseURL: "https://sunghwa-cffff-default-rtdb.asia-southeast1.firebasedatabase.app"
            });
        } catch (e) {
            console.error("Firebase Init Error:", e);
            throw new Error("Failed to parse service account key or initialize app.");
        }
    }

    cachedDb = getDatabase();
    return cachedDb;
}

// Export a proxy object that mimics the database interface.
// Initialization happens only when .ref() is actually called.
export const db = {
    ref: (path?: string) => getDbInstance().ref(path)
};