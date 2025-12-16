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

export const dbRef = ref(database, '/');

export const uploadImage = async (path: string, dataUrl: string): Promise<string> => {
    // 1. Basic Validation
    if (!dataUrl) return "";
    if (!dataUrl.startsWith('data:image')) {
        // Assume it might already be a URL if not base64 image data
        if (dataUrl.startsWith('http')) return dataUrl;
        console.warn("Invalid image format provided to uploadImage");
        return ""; 
    }

    try {
        const imageRef = storageRef(storage, path);
        // Using uploadString is generally reliable for data_urls
        await uploadString(imageRef, dataUrl, 'data_url', {
            contentType: 'image/jpeg', // Defaulting/forcing content type can sometimes help stability
        });
        const url = await getDownloadURL(imageRef);
        return url;
    } catch (error: any) {
        console.error("Image upload failed:", error);
        
        // Retry logic for specific error (retry-limit-exceeded)
        if (error.code === 'storage/retry-limit-exceeded') {
             console.log("Retrying upload...");
             try {
                 // Simple one-time retry
                 const imageRef = storageRef(storage, path);
                 await uploadString(imageRef, dataUrl, 'data_url');
                 return await getDownloadURL(imageRef);
             } catch (retryError) {
                 console.error("Retry failed:", retryError);
                 throw retryError;
             }
        }
        throw error;
    }
};

/**
 * Fetches global data via Server API (Sanitized).
 * DB 전체를 직접 다운로드하지 않고, 비밀번호가 제거된 데이터를 서버에서 받아옵니다.
 */
export const fetchGlobalData = async (): Promise<Partial<DB>> => {
    try {
        // ✅ [수정 완료] 절대 경로(Vercel 주소)로 변경
        const res = await fetch('https://bank-one-mu.vercel.app/api/game-action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'fetch_initial_data', payload: {} })
        });
        
        if (!res.ok) throw new Error("서버 데이터 로드 실패");
        
        const data = await res.json();
        return data;
    } catch (e) {
        console.error("데이터 로드 중 오류 (백업 방식 사용):", e);
        // 서버 에러 시 비상용으로 기존 방식 사용 (보안 취약하지만 앱 멈춤 방지)
        const snapshot = await get(ref(database));
        return snapshot.exists() ? snapshot.val() : {};
    }
};

const normalizeUser = (user: User): User => {
    if (!user) return user;
    if (user.pendingTaxes && !Array.isArray(user.pendingTaxes)) {
        user.pendingTaxes = Object.values(user.pendingTaxes);
    }
    if (user.loans && !Array.isArray(user.loans)) {
        user.loans = Object.values(user.loans);
    }
    // Optimize: Limit transaction history client-side if it wasn't done server-side
    if (user.transactions && Array.isArray(user.transactions)) {
        user.transactions = user.transactions.slice(-50); // Keep last 50
    }
    if (user.assetHistory) {
        delete user.assetHistory;
    }
    return user;
};

export const fetchUser = async (userId: string): Promise<User | null> => {
    try {
        const snapshot = await get(ref(database, `users/${userId}`));
        if (!snapshot.exists()) return null;
        return normalizeUser(snapshot.val());
    } catch (e) {
        console.error("Fetch user failed", e);
        return null;
    }
};

export const fetchUserByLoginId = async (loginId: string): Promise<User | null> => {
    if (!loginId) return null;
    
    try {
        const directSnapshot = await get(ref(database, `users/${loginId}`));
        if (directSnapshot.exists()) {
            const user = directSnapshot.val();
            if (user && (user.id === loginId || !user.id)) return normalizeUser(user);
        }

        try {
            const q = query(ref(database, 'users'), orderByChild('id'), equalTo(loginId), limitToLast(1));
            const snapshot = await get(q);
            if (snapshot.exists()) {
                const data = snapshot.val();
                const key = Object.keys(data)[0];
                return normalizeUser(data[key]);
            }
        } catch (queryError: any) {
            const msg = queryError.message || '';
            if (msg.includes("Index not defined") || msg.includes("indexOn")) {
                const allSnap = await get(ref(database, 'users'));
                if (allSnap.exists()) {
                    const allUsers = allSnap.val();
                    for (const key in allUsers) {
                        if (allUsers[key]?.id === loginId) {
                            return normalizeUser(allUsers[key]);
                        }
                    }
                }
            } else {
                throw queryError; 
            }
        }
        return null;
    } catch (e) {
        return null;
    }
};

export const fetchMartUsers = async (): Promise<User[]> => {
    try {
        const q = query(ref(database, 'users'), orderByChild('type'), equalTo('mart'));
        const snapshot = await get(q);
        
        if (snapshot.exists()) {
            return Object.values(snapshot.val()).map((u: any) => normalizeUser(u));
        }
        return [];
    } catch (e: any) {
        const msg = e.message || '';
        if (msg.includes("Index not defined") || msg.includes("indexOn")) {
            try {
                const allSnap = await get(ref(database, 'users'));
                if (!allSnap.exists()) return [];
                const allUsers = Object.values(allSnap.val()) as User[];
                return allUsers.filter(u => u.type === 'mart').map(u => normalizeUser(u));
            } catch (fallbackError) {
                return [];
            }
        }
        return [];
    }
};

export const searchUsersByName = async (nameQuery: string): Promise<User[]> => {
    if (!nameQuery) return [];
    
    try {
        const userRef = ref(database, 'users');
        const q = query(userRef, orderByChild('name'), startAt(nameQuery), endAt(nameQuery + "\uf8ff"));
        
        const snapshot = await get(q);
        if (!snapshot.exists()) return [];
        
        const usersObj = snapshot.val();
        const users = Object.values(usersObj) as User[];
        
        return users.map(u => normalizeUser({
            ...u,
            transactions: [],
            notifications: [],
            assetHistory: []
        }));
    } catch (e: any) {
        const msg = e.message || '';
        if (msg.includes("Index not defined") || msg.includes("indexOn")) {
             const allSnap = await get(ref(database, 'users'));
             if (!allSnap.exists()) return [];
             const all = Object.values(allSnap.val()) as User[];
             return all
                .filter(u => u.name && u.name.includes(nameQuery))
                .map(u => normalizeUser({ ...u, transactions: [], notifications: [], assetHistory: [] }));
        }
        return [];
    }
};

export const fetchAllUsers = async (): Promise<Record<string, User>> => {
    const snapshot = await get(ref(database, 'users'));
    const val = snapshot.val() || {};
    // Normalize all
    Object.keys(val).forEach(k => {
        val[k] = normalizeUser(val[k]);
    });
    return val;
};

export const saveDb = async (data: DB) => {
    const updates: any = {};
    const nodes = ['settings', 'realEstate', 'countries', 'announcements', 'ads', 'bonds', 'pendingApplications', 'termDeposits', 'mintingRequests', 'policyRequests', 'taxSessions', 'auction', 'deferredAuctions', 'signupSessions', 'stocks'];
    
    nodes.forEach(node => {
        if ((data as any)[node] !== undefined) {
            updates[node] = (data as any)[node];
        }
    });
    
    await update(ref(database), updates);
};

export const generateId = (): string => {
    return rtdbPush(ref(database, 'temp_ids')).key || `id_${Date.now()}`;
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
            if (!currentHistory) {
                return [{ date: new Date().toISOString(), totalValue }];
            }
            
            const history = Array.isArray(currentHistory) ? currentHistory : Object.values(currentHistory);
            const lastEntry = history[history.length - 1];
            
            if (!lastEntry) {
                history.push({ date: new Date().toISOString(), totalValue });
                return history;
            }

            const lastTime = new Date(lastEntry.date).getTime();
            const now = Date.now();
            const diffTime = now - lastTime;
            const isTimeElapsed = diffTime > 60 * 60 * 1000;
            const diffVal = Math.abs(totalValue - lastEntry.totalValue);
            const isSignificantChange = lastEntry.totalValue > 0 ? (diffVal / lastEntry.totalValue) > 0.01 : diffVal > 0;

            if (isTimeElapsed || isSignificantChange) {
                if (history.length > 100) history.shift();
                history.push({ date: new Date().toISOString(), totalValue });
            }
            
            return history;
        });
    },

    migrateUserHistory: async (userId: string, oldHistory: AssetHistoryPoint[]) => {
        if (!oldHistory || oldHistory.length === 0) return;
        const updates: any = {};
        updates[`asset_histories/${userId}`] = oldHistory;
        updates[`users/${userId}/assetHistory`] = null;
        await update(ref(database), updates);
    }
};

// NEW HELPER: Fetch Lite User List for Chat Creation
export const fetchUserListLite = async (category: 'all' | 'citizen' | 'mart' | 'gov' | 'teacher'): Promise<{name: string, type: string}[]> => {
    try {
        // Optimization: In real app, use query by category. For now, fetch all keys/types
        // Or if 'users' is huge, fetch name/type only via index (if set up)
        const snapshot = await get(ref(database, 'users'));
        if (!snapshot.exists()) return [];
        const users = snapshot.val();
        
        const list: {name: string, type: string}[] = [];
        
        Object.values(users).forEach((u: any) => {
            let matches = false;
            if (category === 'all') matches = true;
            else if (category === 'citizen' && u.type === 'citizen') matches = true;
            else if (category === 'mart' && u.type === 'mart') matches = true;
            else if (category === 'gov' && (u.type === 'government' || u.type === 'official' || u.subType === 'govt')) matches = true;
            else if (category === 'teacher' && (u.type === 'admin' || u.type === 'root' || u.subType === 'teacher')) matches = true;
            
            if (matches) list.push({ name: u.name, type: u.type });
        });
        
        return list.sort((a,b) => a.name.localeCompare(b.name));
    } catch (e) {
        console.error("Fetch lite users failed", e);
        return [];
    }
};

// NEW HELPER: Stub for Message Search
export const searchMessages = async (userId: string, queryText: string): Promise<any[]> => {
    return [];
};

// --- CHAT SERVICES ---

export const chatService = {
    subscribeToChatList: (callback: (chats: Record<string, Chat>) => void) => {
        const chatsRef = ref(database, 'chatRooms');
        return onValue(chatsRef, (snapshot) => {
            callback(snapshot.val() || {});
        });
    },

    subscribeToMessages: (chatId: string, limit: number = 20, callback: (messages: Record<string, ChatMessage>) => void) => {
        const msgsRef = query(ref(database, `chatMessages/${chatId}`), limitToLast(limit));
        return onValue(msgsRef, (snapshot) => {
            callback(snapshot.val() || {});
        });
    },

    sendMessage: async (chatId: string, message: ChatMessage, chatMetaUpdate?: Partial<Chat>) => {
        try {
            // 1. Write to DB directly for speed/reliability
            await set(ref(database, `chatMessages/${chatId}/${message.id}`), message);
            await update(ref(database, `chatRooms/${chatId}`), {
                lastMessage: message.text,
                lastTimestamp: message.timestamp
            });

            // 2. Call API for Notifications (Fire and Forget)
            fetch('https://bank-one-mu.vercel.app/api/chat-send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    chatId, 
                    message 
                }),
            }).catch(e => console.warn("Notification trigger failed", e));

        } catch (error) {
            console.error("Failed to send message:", error);
            throw error;
        }
    },

    createChat: async (participants: string[], type: 'private'|'group'|'feedback' = 'private', groupName?: string, isTeamChat: boolean = false) => {
        const chatId = `chat_${Date.now()}`;
        const updates: any = {};
        
        const chatData: any = {
            id: chatId,
            participants,
            type,
            groupName: groupName || (type === 'group' ? '그룹 채팅' : undefined),
            messages: {}
        };

        if (isTeamChat && type === 'group') {
            chatData.isTeamChat = true;
            // First participant is usually creator
            chatData.ownerId = participants[0]; 
            chatData.adminIds = [];
        }

        updates[`chatRooms/${chatId}`] = chatData;
        await update(ref(database), updates);
        return chatId;
    },

    updateChatMetadata: async (chatId: string, data: Partial<Chat>) => {
        const sanitizedData = JSON.parse(JSON.stringify(data));
        await update(ref(database, `chatRooms/${chatId}`), sanitizedData);
    },

    findExistingPrivateChat: async (participants: string[]): Promise<string | null> => {
        const snapshot = await get(ref(database, 'chatRooms'));
        if (!snapshot.exists()) return null;
        const rooms = snapshot.val();
        
        const sortedTarget = [...participants].sort();
        
        for (const [id, room] of Object.entries(rooms) as [string, Chat][]) {
            if (room.type === 'private' && room.participants) {
                const sortedRoom = [...room.participants].sort();
                if (JSON.stringify(sortedTarget) === JSON.stringify(sortedRoom)) {
                    return id;
                }
            }
        }
        return null;
    },

    updateMessage: async (chatId: string, msgId: string, data: Partial<ChatMessage>) => {
        const sanitizedData = JSON.parse(JSON.stringify(data));
        await update(ref(database, `chatMessages/${chatId}/${msgId}`), sanitizedData);
    },

    deleteMessage: async (chatId: string, msgId: string) => {
        const updates: any = {};
        updates[`chatMessages/${chatId}/${msgId}/isDeleted`] = true;
        updates[`chatMessages/${chatId}/${msgId}/text`] = "삭제된 메시지입니다.";
        updates[`chatMessages/${chatId}/${msgId}/attachment`] = null;
        await update(ref(database), updates);
    },

    leaveChat: async (chatId: string, userId: string) => {
        const chatRef = ref(database, `chatRooms/${chatId}`);
        await runTransaction(chatRef, (chat) => {
            if (chat) {
                if (chat.participants) {
                    chat.participants = chat.participants.filter((p: string) => p !== userId);
                }
            }
            return chat;
        });
    },

    hideChat: async (chatId: string, userId: string) => {
        const updates: any = {};
        updates[`chatRooms/${chatId}/deletedBy/${userId}`] = Date.now();
        await update(ref(database), updates);
    },

    restoreChat: async (chatId: string, userId: string) => {
        const updates: any = {};
        updates[`chatRooms/${chatId}/deletedBy/${userId}`] = null;
        await update(ref(database), updates);
    },

    markRead: async (chatId: string, userId: string) => {
        const updates: any = {};
        updates[`chatRooms/${chatId}/readStatus/${userId}`] = Date.now();
        updates[`chatRooms/${chatId}/manualUnread/${userId}`] = null;
        updates[`chatRooms/${chatId}/deletedBy/${userId}`] = null;
        await update(ref(database), updates);
    },

    markManualUnread: async (chatId: string, userId: string) => {
        const updates: any = {};
        updates[`chatRooms/${chatId}/manualUnread/${userId}`] = true;
        await update(ref(database), updates);
    },

    togglePinChat: async (chatId: string, userId: string, isPinned: boolean) => {
        const updates: any = {};
        if (isPinned) {
            updates[`chatRooms/${chatId}/pinnedBy/${userId}`] = Date.now();
        } else {
            updates[`chatRooms/${chatId}/pinnedBy/${userId}`] = null;
        }
        await update(ref(database), updates);
    },

    updatePinnedOrder: async (chatId: string, userId: string, newOrder: number) => {
        const updates: any = {};
        updates[`chatRooms/${chatId}/pinnedBy/${userId}`] = newOrder;
        await update(ref(database), updates);
    },

    muteChat: async (chatId: string, userId: string, isMuted: boolean) => {
        const chatRef = ref(database, `chatRooms/${chatId}/mutedBy`);
        await runTransaction(chatRef, (mutedBy) => {
            let list = mutedBy || [];
            if (isMuted) {
                if (!list.includes(userId)) list.push(userId);
            } else {
                list = list.filter((id: string) => id !== userId);
            }
            return list;
        });
    }
};