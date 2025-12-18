
import * as firebaseApp from "firebase/app";
import { getDatabase, ref, get, update, push as rtdbPush, query, limitToLast, off, runTransaction, onValue, orderByChild, startAt, endAt, equalTo, child, set } from "firebase/database";
import { getAuth } from "firebase/auth";
import { getStorage, ref as storageRef, uploadString, getDownloadURL } from "firebase/storage";
import { DB, ChatMessage, Chat, AssetHistoryPoint, User } from "../types";

// --- CONFIGURATION ---
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

// Helper: Sanitize object for Firebase (remove undefined)
const sanitize = (obj: any) => {
    return JSON.parse(JSON.stringify(obj, (k, v) => v === undefined ? null : v));
};

export const dbRef = ref(database, '/');

export const uploadImage = async (path: string, dataUrl: string): Promise<string> => {
    if (!dataUrl) return "";
    if (!dataUrl.startsWith('data:image')) {
        if (dataUrl.startsWith('http')) return dataUrl;
        return ""; 
    }
    try {
        const imageRef = storageRef(storage, path);
        await uploadString(imageRef, dataUrl, 'data_url', { contentType: 'image/jpeg' });
        return await getDownloadURL(imageRef);
    } catch (error: any) {
        if (error.code === 'storage/retry-limit-exceeded') {
             const imageRef = storageRef(storage, path);
             await uploadString(imageRef, dataUrl, 'data_url');
             return await getDownloadURL(imageRef);
        }
        throw error;
    }
};

export const fetchGlobalData = async (): Promise<Partial<DB>> => {
    // Attempt API fetch but fall back immediately if it fails or returns error
    try {
        const res = await fetch('/api/game-action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'fetch_initial_data', payload: {} })
        }).catch(() => null); // Catch network errors early

        if (res && res.ok) {
            return await res.json();
        }
        
        // If not ok or res is null (network error), go to direct firebase
        console.warn("API unavailable, falling back to direct Firebase fetch.");
        const snapshot = await get(ref(database));
        return snapshot.exists() ? snapshot.val() : {};
    } catch (e) {
        console.error("FetchGlobalData API Error, using direct fallback:", e);
        const snapshot = await get(ref(database));
        return snapshot.exists() ? snapshot.val() : {};
    }
};

const normalizeUser = (user: User): User => {
    if (!user) return user;
    if (user.pendingTaxes && !Array.isArray(user.pendingTaxes)) user.pendingTaxes = Object.values(user.pendingTaxes);
    if (user.loans && !Array.isArray(user.loans)) user.loans = Object.values(user.loans);
    if (user.transactions && Array.isArray(user.transactions)) user.transactions = user.transactions.slice(-50);
    return user;
};

export const fetchUser = async (userId: string): Promise<User | null> => {
    try {
        const snapshot = await get(ref(database, `users/${userId}`));
        return snapshot.exists() ? normalizeUser(snapshot.val()) : null;
    } catch (e) { return null; }
};

export const fetchUserByLoginId = async (loginId: string): Promise<User | null> => {
    if (!loginId) return null;
    try {
        const directSnapshot = await get(ref(database, `users/${loginId}`));
        if (directSnapshot.exists()) {
            const user = directSnapshot.val();
            if (user && (user.id === loginId || !user.id)) return normalizeUser(user);
        }
        const q = query(ref(database, 'users'), orderByChild('id'), equalTo(loginId), limitToLast(1));
        const snapshot = await get(q);
        if (snapshot.exists()) {
            const data = snapshot.val();
            const key = Object.keys(data)[0];
            return normalizeUser(data[key]);
        }
        return null;
    } catch (e) { return null; }
};

export const fetchAllUsers = async (): Promise<Record<string, User>> => {
    const snapshot = await get(ref(database, 'users'));
    const val = snapshot.val() || {};
    Object.keys(val).forEach(k => { val[k] = normalizeUser(val[k]); });
    return val;
};

export const saveDb = async (data: DB) => {
    const updates: any = {};
    const nodes = ['settings', 'realEstate', 'countries', 'announcements', 'ads', 'bonds', 'pendingApplications', 'termDeposits', 'mintingRequests', 'policyRequests', 'taxSessions', 'auction', 'deferredAuctions', 'signupSessions', 'stocks'];
    nodes.forEach(node => {
        if ((data as any)[node] !== undefined) updates[node] = (data as any)[node];
    });
    await update(ref(database), sanitize(updates));
};

export const generateId = (): string => rtdbPush(ref(database, 'temp_ids')).key || `id_${Date.now()}`;

// Add missing search functions
export const searchUsersByName = async (name: string): Promise<User[]> => {
    try {
        const snapshot = await get(ref(database, 'users'));
        if (!snapshot.exists()) return [];
        const users = snapshot.val();
        return Object.values(users)
            .filter((u: any) => u.name && u.name.toLowerCase().includes(name.toLowerCase()))
            .map(u => normalizeUser(u as User));
    } catch (e) { return []; }
};

export const fetchMartUsers = async (): Promise<User[]> => {
    try {
        const snapshot = await get(ref(database, 'users'));
        if (!snapshot.exists()) return [];
        const users = snapshot.val();
        return Object.values(users)
            .filter((u: any) => u.type === 'mart')
            .map(u => normalizeUser(u as User));
    } catch (e) { return []; }
};

export const searchMessages = async (chatId: string, term: string): Promise<ChatMessage[]> => {
    try {
        const snapshot = await get(ref(database, `chatMessages/${chatId}`));
        if (!snapshot.exists()) return [];
        const msgs = snapshot.val();
        return Object.values(msgs).filter((m: any) => m.text && m.text.includes(term)) as ChatMessage[];
    } catch (e) { return []; }
};

export const assetService = {
    fetchHistory: async (userId: string): Promise<AssetHistoryPoint[]> => {
        const snapshot = await get(ref(database, `asset_histories/${userId}`));
        const data = snapshot.val();
        if (!data) return [];
        return Array.isArray(data) ? data : Object.values(data);
    },
    recordHistory: async (userId: string, totalValue: number) => {
        const historyRef = ref(database, `asset_histories/${userId}`);
        await runTransaction(historyRef, (currentHistory) => {
            if (!currentHistory) return [{ date: new Date().toISOString(), totalValue }];
            const history = Array.isArray(currentHistory) ? currentHistory : Object.values(currentHistory);
            const lastEntry = history[history.length - 1];
            if (!lastEntry || (Date.now() - new Date(lastEntry.date).getTime() > 3600000) || Math.abs(totalValue - lastEntry.totalValue) / (lastEntry.totalValue || 1) > 0.01) {
                if (history.length > 100) history.shift();
                history.push({ date: new Date().toISOString(), totalValue });
            }
            return history;
        });
    }
};

export const fetchUserListLite = async (category: 'all' | 'citizen' | 'mart' | 'gov' | 'teacher'): Promise<{name: string, type: string}[]> => {
    try {
        const snapshot = await get(ref(database, 'users'));
        if (!snapshot.exists()) return [];
        const users = snapshot.val();
        const list: {name: string, type: string}[] = [];
        Object.values(users).forEach((u: any) => {
            let matches = category === 'all';
            if (category === 'citizen' && u.type === 'citizen') matches = true;
            else if (category === 'mart' && u.type === 'mart') matches = true;
            else if (category === 'gov' && (u.type === 'government' || u.type === 'official' || u.subType === 'govt')) matches = true;
            else if (category === 'teacher' && (u.type === 'admin' || u.type === 'root' || u.subType === 'teacher')) matches = true;
            if (matches) list.push({ name: u.name, type: u.type });
        });
        return list.sort((a,b) => a.name.localeCompare(b.name));
    } catch (e) { return []; }
};

export const chatService = {
    subscribeToChatList: (callback: (chats: Record<string, Chat>) => void) => {
        const chatsRef = ref(database, 'chatRooms');
        return onValue(chatsRef, (snapshot) => callback(snapshot.val() || {}));
    },
    subscribeToMessages: (chatId: string, limit: number = 20, callback: (messages: Record<string, ChatMessage>) => void) => {
        const msgsRef = query(ref(database, `chatMessages/${chatId}`), limitToLast(limit));
        return onValue(msgsRef, (snapshot) => callback(snapshot.val() || {}));
    },
    sendMessage: async (chatId: string, message: ChatMessage) => {
        try {
            const sanitizedMsg = sanitize(message);
            await set(ref(database, `chatMessages/${chatId}/${message.id}`), sanitizedMsg);
            await update(ref(database, `chatRooms/${chatId}`), {
                lastMessage: message.text,
                lastTimestamp: message.timestamp
            });
            fetch('/api/chat-send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chatId, message: sanitizedMsg }),
            }).catch(() => {});
        } catch (error) { throw error; }
    },
    createChat: async (participants: string[], type: 'private'|'group'|'feedback' = 'private', groupName?: string, isTeamChat: boolean = false) => {
        const chatId = `chat_${Date.now()}`;
        const chatData = sanitize({
            id: chatId,
            participants,
            type,
            groupName: groupName || (type === 'group' ? '그룹 채팅' : null),
            messages: {},
            isTeamChat: isTeamChat && type === 'group' ? true : null,
            ownerId: isTeamChat && type === 'group' ? participants[0] : null
        });
        await update(ref(database, `chatRooms/${chatId}`), chatData);
        return chatId;
    },
    updateChatMetadata: async (chatId: string, data: Partial<Chat>) => {
        await update(ref(database, `chatRooms/${chatId}`), sanitize(data));
    },
    findExistingPrivateChat: async (participants: string[]): Promise<string | null> => {
        const snapshot = await get(ref(database, 'chatRooms'));
        if (!snapshot.exists()) return null;
        const rooms = snapshot.val();
        const sortedTarget = [...participants].sort();
        for (const [id, room] of Object.entries(rooms) as [string, Chat][]) {
            if (room.type === 'private' && room.participants) {
                if (JSON.stringify(sortedTarget) === JSON.stringify([...room.participants].sort())) return id;
            }
        }
        return null;
    },
    updateMessage: async (chatId: string, msgId: string, data: Partial<ChatMessage>) => {
        await update(ref(database, `chatMessages/${chatId}/${msgId}`), sanitize(data));
    },
    deleteMessage: async (chatId: string, msgId: string) => {
        await update(ref(database, `chatMessages/${chatId}/${msgId}`), { isDeleted: true, text: "삭제된 메시지입니다.", attachment: null });
    },
    leaveChat: async (chatId: string, userId: string) => {
        const chatRef = ref(database, `chatRooms/${chatId}`);
        await runTransaction(chatRef, (chat) => {
            if (chat && chat.participants) chat.participants = chat.participants.filter((p: string) => p !== userId);
            return chat;
        });
    },
    hideChat: async (chatId: string, userId: string) => {
        await update(ref(database, `chatRooms/${chatId}/deletedBy/${userId}`), Date.now());
    },
    restoreChat: async (chatId: string, userId: string) => {
        await update(ref(database, `chatRooms/${chatId}/deletedBy/${userId}`), null);
    },
    markRead: async (chatId: string, userId: string) => {
        await update(ref(database, `chatRooms/${chatId}`), {
            [`readStatus/${userId}`]: Date.now(),
            [`manualUnread/${userId}`]: null,
            [`deletedBy/${userId}`]: null
        });
    },
    // Add missing methods to chatService
    markManualUnread: async (chatId: string, userId: string) => {
        await update(ref(database, `chatRooms/${chatId}/manualUnread/${userId}`), true);
    },
    togglePinChat: async (chatId: string, userId: string, isPinned: boolean) => {
        await update(ref(database, `chatRooms/${chatId}/pinnedBy/${userId}`), isPinned ? Date.now() : null);
    },
    updatePinnedOrder: async (chatId: string, userId: string, newOrder: number) => {
        await update(ref(database, `chatRooms/${chatId}/pinnedBy/${userId}`), newOrder);
    },
    muteChat: async (chatId: string, userId: string, isMuted: boolean) => {
        const chatRef = ref(database, `chatRooms/${chatId}/mutedBy`);
        await runTransaction(chatRef, (mutedBy) => {
            let list = mutedBy || [];
            if (isMuted) { if (!list.includes(userId)) list.push(userId); }
            else { list = list.filter((id: string) => id !== userId); }
            return list;
        });
    }
};
