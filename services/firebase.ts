import * as firebaseApp from "firebase/app";
import { getDatabase, ref, get, update, push as rtdbPush, query, limitToLast, off, runTransaction, onValue } from "firebase/database";
import { getAuth } from "firebase/auth";
import { getStorage, ref as storageRef, uploadString, getDownloadURL } from "firebase/storage";
import { DB, ChatMessage, Chat, AssetHistoryPoint } from "../types";

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

// --- OPTIMIZED API ---

/**
 * Uploads a Base64 image string to Firebase Storage and returns the public URL.
 * path: e.g., 'profiles/user1.jpg'
 */
export const uploadImage = async (path: string, dataUrl: string): Promise<string> => {
    if (!dataUrl || !dataUrl.startsWith('data:')) return dataUrl; // Return if already URL or empty
    
    try {
        const imageRef = storageRef(storage, path);
        await uploadString(imageRef, dataUrl, 'data_url');
        const url = await getDownloadURL(imageRef);
        return url;
    } catch (error) {
        console.error("Image upload failed:", error);
        throw error;
    }
};

/**
 * Fetches global data once (One-time fetch instead of subscription).
 */
export const fetchGlobalData = async (): Promise<Partial<DB>> => {
    // List of nodes to fetch. 
    // Chat nodes (chatRooms, chatMessages) are EXCLUDED to save bandwidth.
    const nodes = ['users', 'settings', 'realEstate', 'countries', 'announcements', 'ads', 'bonds', 'pendingApplications', 'termDeposits', 'mintingRequests', 'policyRequests', 'taxSessions', 'auction', 'deferredAuctions', 'signupSessions', 'stocks'];
    
    const snapshot = await get(ref(database));
    if (!snapshot.exists()) return {};
    
    const fullData = snapshot.val();
    const result: any = {};

    nodes.forEach(node => {
        if (fullData[node]) {
            result[node] = fullData[node];
        }
    });

    return result;
};

/**
 * Saves global data (excluding chat/history).
 */
export const saveDb = async (data: DB) => {
    const updates: any = {};
    const nodes = ['users', 'settings', 'realEstate', 'countries', 'announcements', 'ads', 'bonds', 'pendingApplications', 'termDeposits', 'mintingRequests', 'policyRequests', 'taxSessions', 'auction', 'deferredAuctions', 'signupSessions', 'stocks'];
    
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

// --- ASSET HISTORY SERVICES ---

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

// --- OPTIMIZED CHAT SERVICES ---

export const chatService = {
    /**
     * Subscribe only to the list of rooms (chatRooms), NOT messages.
     * This keeps the bandwidth low.
     */
    subscribeToChatList: (callback: (chats: Record<string, Chat>) => void) => {
        const chatsRef = ref(database, 'chatRooms');
        return onValue(chatsRef, (snapshot) => {
            callback(snapshot.val() || {});
        });
    },

    /**
     * Subscribe to messages for a SPECIFIC chat room, limited to the last 20.
     * This ensures we don't download megabytes of history.
     */
    subscribeToMessages: (chatId: string, limit: number = 20, callback: (messages: Record<string, ChatMessage>) => void) => {
        const msgsRef = query(ref(database, `chatMessages/${chatId}`), limitToLast(limit));
        return onValue(msgsRef, (snapshot) => {
            callback(snapshot.val() || {});
        });
    },

    /**
     * Send message via Server API (Vercel) to handle writing to DB and notifying.
     */
    sendMessage: async (chatId: string, message: ChatMessage, chatMetaUpdate?: Partial<Chat>) => {
        // Optimistic UI update is handled by the subscriber above if internet is fast,
        // but the actual write happens on server.
        try {
            await fetch('/api/chat-send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    chatId, 
                    message 
                }),
            });
        } catch (error) {
            console.error("Failed to send message via API:", error);
        }
    },

    createChat: async (chat: Chat) => {
        const updates: any = {};
        // Strip messages just in case, only save room metadata
        const { messages, ...roomData } = chat;
        updates[`chatRooms/${chat.id}`] = roomData;
        await update(ref(database), updates);
        return chat.id;
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
    }
};
