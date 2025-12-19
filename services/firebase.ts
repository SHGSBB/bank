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
    User as FirebaseUser 
} from "firebase/auth";
import { getStorage, ref as storageRef, uploadString, getDownloadURL } from "firebase/storage";
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
export const storage = getStorage(app);

const sanitize = (obj: any) => JSON.parse(JSON.stringify(obj, (k, v) => v === undefined ? null : v));

// Standardized safe ID generator for both client and API
export const toSafeId = (id: string) => (id || '').trim().toLowerCase().replace(/[@.]/g, '_');

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

export const logoutFirebase = async () => signOut(auth);

export const subscribeAuth = (callback: (user: FirebaseUser | null) => void) => onAuthStateChanged(auth, callback);

export const fetchGlobalData = async (): Promise<Partial<DB>> => {
    try {
        const res = await fetch('https://bank-one-mu.vercel.app/api/game-action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'fetch_initial_data', payload: {} })
        }).catch(() => null);
        if (res && res.ok) return await res.json();
        const snapshot = await get(ref(database));
        return snapshot.exists() ? snapshot.val() : {};
    } catch (e) {
        return {};
    }
};

const normalizeUser = (user: User): User => {
    if (!user) return user;
    if (user.pendingTaxes && !Array.isArray(user.pendingTaxes)) user.pendingTaxes = Object.values(user.pendingTaxes);
    if (user.loans && !Array.isArray(user.loans)) user.loans = Object.values(user.loans);
    return user;
};

export const fetchUser = async (userName: string): Promise<User | null> => {
    const snapshot = await get(ref(database, `users/${toSafeId(userName)}`));
    return snapshot.exists() ? normalizeUser(snapshot.val()) : null;
};

export const fetchUserByEmail = async (email: string): Promise<User | null> => {
    const snapshot = await get(ref(database, 'users'));
    if (snapshot.exists()) {
        const users = snapshot.val();
        const searchTerm = email.trim().toLowerCase();
        const found = Object.values(users).find((u: any) => {
            if (!u.email) return false;
            const userEmail = u.email.toLowerCase();
            if (userEmail === searchTerm) return true;
            if (searchTerm.includes('@') && userEmail.includes('+')) {
                const [inputLocal, inputDomain] = searchTerm.split('@');
                const [storedLocal, storedDomain] = userEmail.split('@');
                const baseLocal = storedLocal.split('+')[0];
                return inputLocal === baseLocal && inputDomain === storedDomain;
            }
            return false;
        }) as User;
        return found ? normalizeUser(found) : null;
    }
    return null;
};

export const findUserIdByInfo = async (name: string, birth: string): Promise<string | null> => {
    const searchName = name.trim().toLowerCase();
    const searchBirth = birth.trim();
    const snapshot = await get(ref(database, 'users'));
    if (snapshot.exists()) {
        const users = Object.values(snapshot.val()) as User[];
        const found = users.find(u => (u.name || "").toLowerCase() === searchName && u.birthDate === searchBirth);
        return found ? (found.id || found.email || null) : null;
    }
    return null;
};

export const fetchAllUsers = async (): Promise<Record<string, User>> => {
    const snapshot = await get(ref(database, 'users'));
    return snapshot.val() || {};
};

// Fix for TransferTab: Added missing searchUsersByName helper
export const searchUsersByName = async (name: string): Promise<User[]> => {
    const users = await fetchAllUsers();
    const term = name.trim().toLowerCase();
    return Object.values(users).filter(u => 
        (u.name || "").toLowerCase().includes(term) || 
        (u.nickname || "").toLowerCase().includes(term)
    );
};

// Fix for PurchaseTab: Added missing fetchMartUsers helper
export const fetchMartUsers = async (): Promise<User[]> => {
    const users = await fetchAllUsers();
    return Object.values(users).filter(u => u.type === 'mart' && u.approvalStatus === 'approved');
};

export const fetchUserByLoginId = async (id: string): Promise<User | null> => {
    const input = id.trim().toLowerCase();
    const snapshot = await get(ref(database, 'users'));
    if (snapshot.exists()) {
        const users = snapshot.val();
        const found = Object.values(users).find((u: any) => 
            (u.id || "").toLowerCase() === input || 
            (u.name || "").toLowerCase() === input || 
            (u.email || "").toLowerCase() === input
        ) as User;
        if (found) return normalizeUser(found);
        const safeId = toSafeId(id.trim());
        if (users[safeId]) return normalizeUser(users[safeId]);
    }
    return null;
};

export const uploadImage = async (path: string, base64: string): Promise<string> => {
    // Standardize path and remove potential dangerous chars
    const cleanPath = path.trim().replace(/[^a-zA-Z0-9\/._-]/g, '_');
    const fileRef = storageRef(storage, cleanPath);
    
    if (!base64.startsWith('data:')) {
        throw new Error('Invalid image format: Must be a data_url');
    }

    try {
        await uploadString(fileRef, base64, 'data_url');
        const url = await getDownloadURL(fileRef);
        return url;
    } catch (e: any) {
        console.error("Firebase Storage Upload Error:", e);
        throw new Error(`Upload failed: ${e.message}`);
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
    subscribeToMessages: (chatId: string, limit: number = 20, callback: (messages: Record<string, ChatMessage>) => void) => onValue(query(ref(database, `chatMessages/${chatId}`), limitToLast(limit)), (s) => callback(s.val() || {})),
    sendMessage: async (chatId: string, message: ChatMessage) => {
        await set(ref(database, `chatMessages/${chatId}/${message.id}`), sanitize(message));
        await update(ref(database, `chatRooms/${chatId}`), { lastMessage: message.text, lastTimestamp: message.timestamp });
    },
    createChat: async (participants: string[], type: 'private'|'group'|'feedback' = 'private', groupName?: string) => {
        const chatId = `chat_${Date.now()}`;
        await update(ref(database, `chatRooms/${chatId}`), sanitize({ id: chatId, participants, type, groupName: groupName || null }));
        return chatId;
    }
};

export const assetService = {
    fetchHistory: async (userId: string): Promise<AssetHistoryPoint[]> => {
        const snapshot = await get(ref(database, `asset_histories/${toSafeId(userId)}`));
        return snapshot.exists() ? Object.values(snapshot.val()) : [];
    }
};