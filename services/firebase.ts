
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
    set,
    orderByChild,
    equalTo,
    limitToFirst
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
export const toSafeId = (id: string) => (id || '').trim().toLowerCase().replace(/[@.]/g, '_');

// [신규] 서버 액션 호출 헬퍼
const callServerAction = async (action: string, payload: any) => {
    try {
        const res = await fetch('https://bank-one-mu.vercel.app/api/game-action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, payload })
        });
        return await res.json();
    } catch (e) {
        return null;
    }
};

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

// [최적화] 내 데이터만 상세 조회
export const fetchGlobalData = async (currentUserId?: string): Promise<Partial<DB>> => {
    try {
        const safeId = currentUserId ? toSafeId(currentUserId) : undefined;
        const res = await fetch('https://bank-one-mu.vercel.app/api/game-action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'fetch_initial_data', payload: { currentUserId: safeId } })
        }).catch(() => null);
        
        if (res && res.ok) return await res.json();
        
        // Fallback: Do NOT download everything if server fails, just return empty to prevent crash
        return {};
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
    // Note: userName here might be ID or Name. SafeId assumes email format mostly.
    const snapshot = await get(ref(database, `users/${toSafeId(userName)}`));
    return snapshot.exists() ? normalizeUser(snapshot.val()) : null;
};

// [최적화] 클라이언트 전체 스캔 제거 -> 서버 액션 위임
export const fetchUserByEmail = async (email: string): Promise<User | null> => {
    const safeKey = toSafeId(email);
    // 1. Try Direct Key (Fastest)
    const exactSnap = await get(ref(database, `users/${safeKey}`));
    if (exactSnap.exists()) return normalizeUser(exactSnap.val());

    // 2. Server Action Search (No client download)
    const res = await callServerAction('fetch_user', { query: email });
    if (res && res.user) return normalizeUser(res.user);

    return null;
};

// [최적화] 클라이언트 전체 스캔 제거 -> 서버 액션 위임
export const fetchUserByLoginId = async (id: string): Promise<User | null> => {
    // 1. Try Direct Key
    const safeKey = toSafeId(id);
    const exactSnap = await get(ref(database, `users/${safeKey}`));
    if (exactSnap.exists()) return normalizeUser(exactSnap.val());

    // 2. Server Action Search
    const res = await callServerAction('fetch_user', { query: id });
    if (res && res.user) return normalizeUser(res.user);

    return null;
};

export const searchUsersByName = async (name: string): Promise<User[]> => {
    // Optimization: Use orderByChild if index exists, else limit
    const q = query(ref(database, 'users'), orderByChild('name'), limitToFirst(20)); // Limit scan
    const snapshot = await get(q);
    if (!snapshot.exists()) return [];
    
    // Filter locally from the limited set (not perfect but prevents 87MB download)
    // For better search, needs server-side search action
    const users = snapshot.val();
    const term = name.trim().toLowerCase();
    return Object.values(users).filter((u: any) => 
        (u.name || "").toLowerCase().includes(term) || 
        (u.nickname || "").toLowerCase().includes(term)
    ) as User[];
};

export const fetchMartUsers = async (): Promise<User[]> => {
    const snapshot = await get(query(ref(database, 'users'), orderByChild('type'), equalTo('mart')));
    if (!snapshot.exists()) return [];
    return Object.values(snapshot.val()).filter((u: any) => u.approvalStatus === 'approved') as User[];
};

export const fetchAllUsers = async (): Promise<Record<string, User>> => {
    // CAUTION: This still downloads everything. Only used by admin.
    const snapshot = await get(ref(database, 'users'));
    return snapshot.val() || {};
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
        throw new Error("사진 업로드에 실패했습니다.");
    }
};

export const saveDb = async (data: DB) => {
    const updates: any = {};
    const nodes = ['settings', 'realEstate', 'countries', 'announcements', 'ads', 'stocks', 'pendingApplications', 'deferredAuctions', 'auction', 'bonds', 'taxSessions'];
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
