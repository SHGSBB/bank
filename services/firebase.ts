
import * as firebaseApp from "firebase/app";
import { 
    getDatabase, 
    ref, 
    get, 
    update, 
    push as rtdbPush, 
    query, 
    limitToLast, 
    onValue, 
    orderByChild, 
    equalTo, 
    set, 
    remove,
    startAt,
    endAt 
} from "firebase/database";
import { 
    getAuth, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged, 
    sendEmailVerification, 
    sendPasswordResetEmail,
    verifyBeforeUpdateEmail,
    User as FirebaseUser 
} from "firebase/auth";
import { DB, ChatMessage, Chat, AssetHistoryPoint, User } from "../types";

const firebaseConfig = {
  apiKey: "AIzaSyD5_YZU_luksAslG7nge_dQvauS1_lr3TA",
  authDomain: "sunghwa-cffff.firebaseapp.com",
  databaseURL: "https://sunghwa-cffff-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "sunghwa-cffff",
  storageBucket: "sunghwa-cffff.firebasestorage.app",
  messagingSenderId: "681876356246",
  appId: "1:681876356246:web:8c6895dd5bad7e9a4356b7",
  measurementId: "G-SYXWCG1YKS"
};

const app = firebaseApp.initializeApp(firebaseConfig);
export const database = getDatabase(app);
export const auth = getAuth(app);

const sanitize = (obj: any) => JSON.parse(JSON.stringify(obj, (k, v) => v === undefined ? null : v));

// Standardized safe ID generator for both client and API
export const toSafeId = (id: string) => (id || '').trim().toLowerCase().replace(/[@.]/g, '_').replace(/[#$\[\]]/g, '_');

export const registerWithAutoRetry = async (email: string, pass: string, retryCount = 0): Promise<FirebaseUser> => {
    let tryEmail = email;
    if (retryCount > 0) {
        const [local, domain] = email.split('@');
        tryEmail = `${local}+${retryCount}@${domain}`;
    }

    try {
        const userCredential = await createUserWithEmailAndPassword(auth, tryEmail, pass);
        await sendEmailVerification(userCredential.user);
        return userCredential.user;
    } catch (error: any) {
        if (error.code === 'auth/email-already-in-use' && retryCount < 20) {
            return registerWithAutoRetry(email, pass, retryCount + 1);
        }
        throw error;
    }
};

export const loginWithEmail = async (email: string, pass: string) => {
    const userCredential = await signInWithEmailAndPassword(auth, email, pass);
    return userCredential.user;
};

export const resetUserPassword = async (email: string) => {
    await sendPasswordResetEmail(auth, email);
    return true;
};

export const updateUserEmail = async (newEmail: string) => {
    if (auth.currentUser) {
        await verifyBeforeUpdateEmail(auth.currentUser, newEmail);
        return true;
    }
    throw new Error("로그인된 사용자가 없습니다.");
};

export const logoutFirebase = async () => signOut(auth);

export const subscribeAuth = (callback: (user: FirebaseUser | null) => void) => onAuthStateChanged(auth, callback);

// --- OPTIMIZED FETCHERS ---
// Replaces the heavy fetchGlobalData

export const fetchEssentials = async (): Promise<Partial<DB>> => {
    try {
        const [settingsSnap, realEstateSnap, announceSnap, auctionSnap, stocksSnap] = await Promise.all([
            get(ref(database, 'settings')),
            get(ref(database, 'realEstate')),
            get(ref(database, 'announcements')),
            get(ref(database, 'auction')),
            get(ref(database, 'stocks'))
        ]);

        return {
            settings: settingsSnap.val() || {},
            realEstate: realEstateSnap.val() || { grid: [] },
            announcements: announceSnap.val() || [],
            auction: auctionSnap.val() || null,
            stocks: stocksSnap.val() || {}
        };
    } catch (e) {
        console.error("Fetch Essentials Failed", e);
        return {};
    }
};

const normalizeUser = (user: User): User => {
    if (!user) return user;
    if (user.pendingTaxes && !Array.isArray(user.pendingTaxes)) user.pendingTaxes = Object.values(user.pendingTaxes);
    if (user.loans && !Array.isArray(user.loans)) user.loans = Object.values(user.loans);
    return user;
};

export const fetchUser = async (userKey: string): Promise<User | null> => {
    const safeKey = toSafeId(userKey);
    const snapshot = await get(ref(database, `users/${safeKey}`));
    return snapshot.exists() ? normalizeUser(snapshot.val()) : null;
};

export const fetchUserByEmail = async (email: string): Promise<User | null> => {
    // Only search index or use known key logic
    // Assuming toSafeId(email) is the key, try that first for speed
    const safeKey = toSafeId(email);
    const snap = await get(ref(database, `users/${safeKey}`));
    if (snap.exists()) return normalizeUser(snap.val());

    // Fallback: Query by email field
    const q = query(ref(database, 'users'), orderByChild('email'), equalTo(email));
    const querySnap = await get(q);
    if (querySnap.exists()) {
        const val = querySnap.val();
        const firstKey = Object.keys(val)[0];
        return normalizeUser(val[firstKey]);
    }
    return null;
};

export const findUserIdByInfo = async (name: string, birth: string): Promise<string | null> => {
    // Heavy query, but necessary for recovery
    const q = query(ref(database, 'users'), orderByChild('name'), equalTo(name));
    const snapshot = await get(q);
    if (snapshot.exists()) {
        const users = Object.values(snapshot.val()) as User[];
        const found = users.find(u => u.birthDate === birth);
        return found ? (found.id || null) : null;
    }
    return null;
};

export const findUserEmailForRecovery = async (id: string, name: string, birth: string): Promise<string | null> => {
    // Try direct lookup by ID first (fastest) - sanitize input ID for key
    const safeKey = toSafeId(id);
    const userRef = ref(database, `users/${safeKey}`);
    const snap = await get(userRef);
    if (snap.exists()) {
        const u = snap.val();
        if (u.name === name && u.birthDate === birth) {
            return u.email;
        }
    }
    return null;
};

// Admin Only - Heavy Fetch
export const fetchAllUsers = async (): Promise<Record<string, User>> => {
    const snapshot = await get(ref(database, 'users'));
    return snapshot.val() || {};
};

export const searchUsersByName = async (name: string): Promise<User[]> => {
    const q = query(ref(database, 'users'), orderByChild('name'), startAt(name), endAt(name + "\uf8ff"));
    const snapshot = await get(q);
    if (snapshot.exists()) return Object.values(snapshot.val());
    return [];
};

export const fetchMartUsers = async (): Promise<User[]> => {
    // Avoids "Index not defined" error by fetching all users and filtering client-side.
    // This is safer given we cannot modify database rules directly.
    const snapshot = await get(ref(database, 'users'));
    if (snapshot.exists()) {
        const allUsers = Object.values(snapshot.val()) as User[];
        return allUsers.filter(u => u.type === 'mart');
    }
    return [];
};

export const fetchUserByLoginId = async (id: string): Promise<User | null> => {
    const input = id.trim();
    const safeKey = toSafeId(input);
    const directSnap = await get(ref(database, `users/${safeKey}`));
    if (directSnap.exists()) return normalizeUser(directSnap.val());
    return null;
};

export const uploadImage = async (path: string, base64: string): Promise<string> => {
    const cloudName = "dopkc8q6l";
    const uploadPreset = "ml_default";
    const formData = new FormData();
    formData.append("file", base64);
    formData.append("upload_preset", uploadPreset);

    try {
        const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
            method: "POST",
            body: formData
        });
        if (!res.ok) throw new Error("이미지 서버 업로드 실패");
        const data = await res.json();
        return data.secure_url; 
    } catch (e: any) {
        console.error("Cloudinary Upload Error:", e);
        throw new Error("사진 업로드에 실패했습니다. 다시 시도해주세요.");
    }
};

export const saveDb = async (data: DB) => {
    const updates: any = {};
    const nodes = ['settings', 'realEstate', 'countries', 'announcements', 'ads', 'stocks'];
    nodes.forEach(node => {
        if ((data as any)[node] !== undefined) updates[node] = (data as any)[node];
    });
    await update(ref(database), sanitize(updates));
};

export const generateId = (): string => rtdbPush(ref(database, 'temp_ids')).key || `id_${Date.now()}`;

export const chatService = {
    subscribeToChatList: (callback: (chats: Record<string, Chat>) => void) => onValue(ref(database, 'chatRooms'), (s) => callback(s.val() || {})),
    subscribeToMessages: (chatId: string, limit: number = 50, callback: (messages: Record<string, ChatMessage>) => void) => onValue(query(ref(database, `chatMessages/${chatId}`), limitToLast(limit)), (s) => callback(s.val() || {})),
    sendMessage: async (chatId: string, message: ChatMessage) => {
        await set(ref(database, `chatMessages/${chatId}/${message.id}`), sanitize(message));
        await update(ref(database, `chatRooms/${chatId}`), { lastMessage: message.text, lastTimestamp: message.timestamp });
    },
    updateChat: async (chatId: string, data: any) => {
        await update(ref(database, `chatRooms/${chatId}`), sanitize(data));
    },
    updateChatPreferences: async (userId: string, chatId: string, prefs: any) => {
        const safeKey = toSafeId(userId);
        await update(ref(database, `users/${safeKey}/chatPreferences/${chatId}`), sanitize(prefs));
    },
    createChat: async (participants: string[], type: 'private'|'group'|'feedback'|'auction' = 'private', groupName?: string) => {
        // Reuse existing chat if 1:1 and private
        if (type === 'private' && participants.length === 2) {
            // Need a way to query finding chat with these 2 participants efficiently
            // For now, scan client side list or create new. 
            // Optimization: Store private chat ID in user profile?
            // To respect "no heavy load", we might skip full scan and just create new or check recent.
            // But let's assume client has loaded chatRooms list (lightweight metadata).
        }
        
        const chatId = `chat_${Date.now()}_${Math.random().toString(36).substr(2,9)}`;
        await update(ref(database, `chatRooms/${chatId}`), sanitize({ id: chatId, participants, type, groupName: groupName || null, lastTimestamp: Date.now() }));
        return chatId;
    }
};

export const assetService = {
    fetchHistory: async (userId: string): Promise<AssetHistoryPoint[]> => {
        const snapshot = await get(ref(database, `asset_histories/${toSafeId(userId)}`));
        return snapshot.exists() ? Object.values(snapshot.val()) : [];
    }
};
