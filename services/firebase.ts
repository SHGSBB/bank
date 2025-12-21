
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

export const toSafeId = (id: string) => 
    (id || '').trim().toLowerCase()
    .replace(/[@.+]/g, '_')
    .replace(/[#$\[\]]/g, '_');

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

// Client-side essentials fetch - ONLY used as fallback if server action fails
export const fetchEssentials = async (): Promise<Partial<DB>> => {
    try {
        const [settingsSnap, realEstateSnap, announceSnap, auctionSnap, stocksSnap] = await Promise.all([
            get(ref(database, 'settings')),
            get(ref(database, 'realEstate/grid')), // Fetch grid only
            get(query(ref(database, 'announcements'), limitToLast(5))), // Limit announcements
            get(ref(database, 'auction')),
            get(ref(database, 'stocks'))
        ]);

        return {
            settings: settingsSnap.val() || {},
            realEstate: { grid: realEstateSnap.val() || [] },
            announcements: Object.values(announceSnap.val() || {}),
            auction: auctionSnap.val() || null,
            stocks: stocksSnap.val() || {}
        };
    } catch (e) {
        return {};
    }
};

const normalizeUser = (user: User): User => {
    if (!user) return user;
    if (user.pendingTaxes && !Array.isArray(user.pendingTaxes)) user.pendingTaxes = Object.values(user.pendingTaxes);
    if (user.loans && !Array.isArray(user.loans)) user.loans = Object.values(user.loans);
    // Ensure we don't accidentally load huge data if client SDK is used
    if (user.transactions && user.transactions.length > 50) user.transactions = user.transactions.slice(-50);
    return user;
};

export const fetchUser = async (userKey: string): Promise<User | null> => {
    const safeKey = toSafeId(userKey);
    const snapshot = await get(ref(database, `users/${safeKey}`));
    return snapshot.exists() ? normalizeUser(snapshot.val()) : null;
};

export const fetchUserByEmail = async (email: string): Promise<User | null> => {
    const safeKey = toSafeId(email);
    const snap = await get(ref(database, `users/${safeKey}`));
    if (snap.exists()) return normalizeUser(snap.val());
    return null;
};

export const findUserIdByInfo = async (name: string, birth: string): Promise<string | null> => {
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
    const safeKey = toSafeId(id);
    const userRef = ref(database, `users/${safeKey}`);
    const snap = await get(userRef);
    if (snap.exists()) {
        const u = snap.val();
        if (u.name === name && u.birthDate === birth) return u.email;
    }
    return null;
};

// 🔴 [CRITICAL] Block full user fetch to prevent 200MB download
export const fetchAllUsers = async (): Promise<Record<string, User>> => {
    console.warn("Client-side fetchAllUsers blocked for performance. Use serverAction.");
    return {}; 
};

export const searchUsersByName = async (name: string): Promise<User[]> => {
    const q = query(ref(database, 'users'), orderByChild('name'), startAt(name), endAt(name + "\uf8ff"), limitToLast(10));
    const snapshot = await get(q);
    if (snapshot.exists()) return Object.values(snapshot.val());
    return [];
};

export const fetchMartUsers = async (): Promise<User[]> => {
    const snapshot = await get(query(ref(database, 'users'), orderByChild('type'), equalTo('mart')));
    if (snapshot.exists()) {
        return Object.values(snapshot.val()) as User[];
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
            method: "POST", body: formData
        });
        if (!res.ok) throw new Error("Upload failed");
        const data = await res.json();
        return data.secure_url; 
    } catch (e: any) {
        throw new Error("사진 업로드에 실패했습니다.");
    }
};

export const saveDb = async (data: DB) => {
    const updates: any = {};
    const nodes = ['settings', 'realEstate', 'countries', 'announcements', 'ads', 'stocks', 'pendingApplications'];
    nodes.forEach(node => {
        if ((data as any)[node] !== undefined) updates[node] = (data as any)[node];
    });
    await update(ref(database), sanitize(updates));
};

export const generateId = (): string => rtdbPush(ref(database, 'temp_ids')).key || `id_${Date.now()}`;

export const chatService = {
    subscribeToChatList: (callback: (chats: Record<string, Chat>) => void) => 
        onValue(ref(database, 'chatRooms'), (s) => callback(s.val() || {})),

    subscribeToMessages: (chatId: string, limit: number = 20, callback: (messages: Record<string, ChatMessage>) => void) => 
        onValue(query(ref(database, `chatMessages/${chatId}`), limitToLast(limit)), (s) => callback(s.val() || {})),
    
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
        const chatId = `chat_${Date.now()}_${Math.random().toString(36).substr(2,9)}`;
        await update(ref(database, `chatRooms/${chatId}`), sanitize({ id: chatId, participants, type, groupName: groupName || null, lastTimestamp: Date.now() }));
        return chatId;
    }
};

export const assetService = {
    fetchHistory: async (userId: string): Promise<AssetHistoryPoint[]> => {
        // Load only last 30 points
        const snapshot = await get(query(ref(database, `asset_histories/${toSafeId(userId)}`), limitToLast(30)));
        return snapshot.exists() ? Object.values(snapshot.val()) : [];
    }
};