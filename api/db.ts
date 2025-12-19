
import admin from 'firebase-admin';

let dbInstance: admin.database.Database | null = null;
let authInstance: admin.auth.Auth | null = null;

try {
    const key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    // Only attempt initialization if the key exists and is valid JSON
    if (key) {
        let serviceAccount;
        try {
            serviceAccount = JSON.parse(key);
        } catch (e) {
            console.error("FIREBASE_SERVICE_ACCOUNT_KEY is not valid JSON.");
        }

        if (serviceAccount && !admin.apps.length) {
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount),
                databaseURL: "https://sunghwa-cffff-default-rtdb.asia-southeast1.firebasedatabase.app"
            });
        }
        
        if (admin.apps.length) {
            dbInstance = admin.database();
            authInstance = admin.auth();
        }
    } else {
        console.warn("FIREBASE_SERVICE_ACCOUNT_KEY is missing. Server actions will fail safely.");
    }
} catch (error) {
    console.error("Firebase Admin Init Error:", error);
}

export const db = dbInstance;
export const adminAuth = authInstance;
