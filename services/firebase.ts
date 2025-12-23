
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
    endAt,
    off
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

// [Fix] Consistently lowercase and safe-ify keys
export const toSafeId = (id: string) => 
    (id || '').trim().toLowerCase()
    .replace(/[@.+]/g, '_')
    .replace(/[#$\[\]]/g, '_');

export const registerWithAutoRetry = async (email: string, pass: string): Promise<FirebaseUser> => {
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
        await sendEmailVerification(userCredential.user);
        return userCredential.user;
    } catch (error: any) {
        if (error.code === 'auth/email-already-in-use') {
            throw new Error("이미 가입된 이메일입니다.");
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

export const fetchEssentials = async (): Promise<Partial<DB>> => {
    try {
        const [settingsSnap, realEstateSnap, announceSnap, auctionSnap, stocksSnap, pendingAppsSnap] = await Promise.all([
            get(ref(database, 'settings')),
            get(ref(database, 'realEstate/grid')),
            get(query(ref(database, 'announcements'), limitToLast(20))),
            get(ref(database, 'auction')),
            get(ref(database, 'stocks')),
            get(ref(database, 'pendingApplications'))
        ]);

        return {
            settings: settingsSnap.val() || {},
            realEstate: { grid: realEstateSnap.val() || [] },
            announcements: Object.values(announceSnap.val() || {}),
            auction: auctionSnap.val() || null,
            stocks: stocksSnap.val() || {},
            pendingApplications: pendingAppsSnap.val() || {}
        };
    } catch (e) {
        return {};
    }
};

const normalizeUser = (user: User): User => {
    if (!user) return user;
    if (user.pendingTaxes && !Array.isArray(user.pendingTaxes)) user.pendingTaxes = Object.values(user.pendingTaxes);
    if (user.loans && !Array.isArray(user.loans)) user.loans = Object.values(user.loans);
    if (user.transactions && user.transactions.length > 50) user.transactions = user.transactions.slice(-50);
    return user;
};

export const fetchUser = async (userKey: string): Promise<User | null> => {
    // Try Direct Key First (Email format)
    const safeKey = toSafeId(userKey);
    const snapshot = await get(ref(database, `users/${safeKey}`));
    if (snapshot.exists()) return normalizeUser(snapshot.val());
    
    // If not found, try searching by ID field (Legacy support)
    return fetchUserByLoginId(userKey);
};

export const fetchUserByEmail = async (email: string): Promise<User | null> => {
    const safeKey = toSafeId(email);
    const snap = await get(ref(database, `users/${safeKey}`));
    if (snap.exists()) return normalizeUser(snap.val());
    
    // Fallback search if direct key fails
    const q = query(ref(database, 'users'), orderByChild('email'), equalTo(email));
    const qSnap = await get(q);
    if (qSnap.exists()) {
        return normalizeUser(Object.values(qSnap.val())[0] as User);
    }
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

export const fetchAllUsers = async (): Promise<Record<string, User>> => {
    // Block heavy fetch, use server action where possible
    console.warn("Use serverAction('fetch_all_users_light') instead.");
    return {}; 
};

export const searchUsersByName = async (name: string): Promise<User[]> => {
    try {
        const q = query(ref(database, 'users'), orderByChild('name'), startAt(name), endAt(name + "\uf8ff"), limitToLast(10));
        const snapshot = await get(q);
        if (snapshot.exists()) return Object.values(snapshot.val());
        return [];
    } catch (e) {
        return [];
    }
};

export const fetchMartUsers = async (): Promise<User[]> => {
    try {
        const snapshot = await get(query(ref(database, 'users'), orderByChild('type'), equalTo('mart')));
        if (snapshot.exists()) return Object.values(snapshot.val()) as User[];
        return [];
    } catch (e) { return []; }
};

export const fetchUserByLoginId = async (id: string): Promise<User | null> => {
    const input = id.trim();
    const safeKey = toSafeId(input);
    
    // 1. Direct check
    const directSnap = await get(ref(database, `users/${safeKey}`));
    if (directSnap.exists()) return normalizeUser(directSnap.val());
    
    // 2. Search by 'id' field
    const q = query(ref(database, 'users'), orderByChild('id'), equalTo(input));
    const querySnap = await get(q);
    if (querySnap.exists()) {
        const users = Object.values(querySnap.val()) as User[];
        return users.length > 0 ? normalizeUser(users[0]) : null;
    }
    
    // 3. Search by 'email' field (in case user entered email as ID)
    const qEmail = query(ref(database, 'users'), orderByChild('email'), equalTo(input));
    const qEmailSnap = await get(qEmail);
    if (qEmailSnap.exists()) {
        return normalizeUser(Object.values(qEmailSnap.val())[0] as User);
    }
    
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
        onValue(query(ref(database, 'chatRooms'), limitToLast(30)), (s) => callback(s.val() || {})),

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
        const safeKey = toSafeId(userId); // Use safe key
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
        const snapshot = await get(query(ref(database, `asset_histories/${toSafeId(userId)}`), limitToLast(30)));
        return snapshot.exists() ? Object.values(snapshot.val()) : [];
    }
};
