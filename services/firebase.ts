
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

/**
 * Converts dot (.) to underscore (_) for safe Firebase RTDB keys
 */
export const toSafeId = (id: string) => id.replace(/\./g, '_');

// [회원가입] 이메일 중복 시 자동 에일리어싱 (+1, +2...) 시도
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

// [비밀번호 재설정]
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

// [성능 최적화] 특정 유저 정보만 콕 집어서 가져오기
export const fetchUser = async (userName: string): Promise<User | null> => {
    const snapshot = await get(ref(database, `users/${toSafeId(userName)}`));
    return snapshot.exists() ? normalizeUser(snapshot.val()) : null;
};

export const fetchUserByEmail = async (email: string): Promise<User | null> => {
    // Index-independent lookup (fetch all and find)
    const snapshot = await get(ref(database, 'users'));
    if (snapshot.exists()) {
        const users = snapshot.val();
        const found = Object.values(users).find((u: any) => u.email === email) as User;
        return found ? normalizeUser(found) : null;
    }
    return null;
};

// [아이디 찾기] 이름과 생년월일로 이메일 조회
export const findUserIdByInfo = async (name: string, birth: string): Promise<string | null> => {
    const snapshot = await get(ref(database, 'users'));
    if (snapshot.exists()) {
        const users = Object.values(snapshot.val()) as User[];
        const found = users.find(u => u.name === name && u.birthDate === birth);
        return found ? (found.id || found.email || null) : null;
    }
    return null;
};

export const fetchAllUsers = async (): Promise<Record<string, User>> => {
    const snapshot = await get(ref(database, 'users'));
    return snapshot.val() || {};
};

// [아이디로 유저 조회] 로그인 아이디(id 필드)로 유저 정보 조회
export const fetchUserByLoginId = async (id: string): Promise<User | null> => {
    // Index-independent lookup
    const snapshot = await get(ref(database, 'users'));
    if (snapshot.exists()) {
        const users = snapshot.val();
        // Check ID field OR Check Name (Key)
        const found = Object.values(users).find((u: any) => u.id === id || u.name === id) as User;
        if (found) return normalizeUser(found);
        
        // Also check transformed ID in keys
        const safeId = toSafeId(id);
        if (users[safeId]) return normalizeUser(users[safeId]);
    }
    return null;
};

// [마트 조회] 마트 타입의 유저만 필터링해서 가져오기
export const fetchMartUsers = async (): Promise<User[]> => {
    const snapshot = await get(ref(database, 'users'));
    if (snapshot.exists()) {
        const data = snapshot.val();
        return (Object.values(data) as User[]).filter(u => u.type === 'mart').map(normalizeUser);
    }
    return [];
};

// [유저 검색] 이름으로 유저 목록 검색
export const searchUsersByName = async (name: string): Promise<User[]> => {
    const snapshot = await get(ref(database, 'users'));
    if (snapshot.exists()) {
        const data = snapshot.val();
        const searchTerm = name.toLowerCase();
        return (Object.values(data) as User[])
            .filter(u => u.name.toLowerCase().includes(searchTerm))
            .map(normalizeUser);
    }
    return [];
};

// [이미지 업로드] 프로필/상품 이미지 Firebase Storage 저장
export const uploadImage = async (path: string, base64: string): Promise<string> => {
    const fileRef = storageRef(storage, path);
    await uploadString(fileRef, base64, 'data_url');
    return getDownloadURL(fileRef);
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
