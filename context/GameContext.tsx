
import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { fetchGlobalData, saveDb as firebaseSaveDb, generateId, chatService, assetService, fetchUser, fetchAllUsers, fetchUserByLoginId, database } from "../services/firebase";
import { update, ref, push as rtdbPush, get, set, onValue, remove, onChildAdded, query, limitToLast } from "firebase/database";
import { DB, DEFAULT_DB, User, MintingRequest, SignupSession, StickyNote, Chat, ChatMessage, ChatAttachment, Ad, PolicyRequest, ChatReaction, ToastNotification, PendingTax, TaxSession, AssetHistoryPoint, Application } from "../types";

interface GameContextType {
    db: DB;
    currentUser: User | null;
    isAdminMode: boolean;
    setAdminMode: (val: boolean) => void;
    setCurrentUser: (user: User | null) => void;
    login: (id: string, pass: string, remember?: boolean, silent?: boolean) => Promise<boolean>;
    logout: () => Promise<void>;
    updateUser: (name: string, data: Partial<User>) => Promise<void>;
    updateStock: (stockId: string, data: any) => Promise<void>;
    isLoading: boolean;
    showPinModal: (message: string, expectedPin?: string, length?: 4 | 6, allowBiometric?: boolean) => Promise<string | null>;
    showConfirm: (message: string) => Promise<boolean>;
    showModal: (message: string) => void;
    notify: (userName: string, message: string, isPersistent?: boolean, action?: string, actionData?: any) => void;
    toasts: ToastNotification[];
    addToast: (toast: Omit<ToastNotification, 'id' | 'timestamp'>) => void;
    removeToast: (id: string) => void;
    saveDb: (data: DB) => Promise<void>;
    switchAccount: (targetName: string) => Promise<boolean>;
    refreshData: () => Promise<void>;
    loadAllUsers: () => Promise<void>;
    serverAction: (action: string, payload: any) => Promise<any>;
    requestNotificationPermission: () => void;
    clearPaidTax: (taxId?: string) => Promise<void>;
    // Chat System
    sendMessage: (chatId: string, text: string, attachment?: ChatAttachment) => Promise<void>;
    createChat: (participants: string[], type?: 'private' | 'group' | 'feedback', groupName?: string, isTeamChat?: boolean) => Promise<string>;
    markChatRead: (chatId: string) => Promise<void>;
    markChatManualUnread: (chatId: string) => Promise<void>;
    toggleChatPin: (chatId: string, isPinned: boolean) => Promise<void>;
    updatePinnedOrder: (chatId: string, newOrder: number) => Promise<void>;
    deleteChat: (chatId: string) => Promise<void>;
    restoreChat: (chatId: string) => Promise<void>;
    hardDeleteChat: (chatId: string) => Promise<void>;
    muteChat: (chatId: string, isMuted: boolean) => Promise<void>;
    // Helpers
    wait: (type: 'light' | 'heavy') => Promise<void>;
    applyBankruptcy: () => Promise<void>;
    requestPolicyChange: (type: any, data: any, description: string) => Promise<void>;
    approvePolicyChange: (id: string) => Promise<void>;
    rejectPolicyChange: (id: string) => Promise<void>;
    respondToAuctionInvite: (from: string, accept: boolean, notificationId: string) => Promise<void>;
    simulateSMS: (phone: string) => string;
    createSignupSession: (name: string, phone: string) => Promise<string>;
    validateSignupCode: (sessionId: string, code: string) => Promise<boolean>;
    
    pinResolver: any; setPinResolver: any; confirmResolver: any; setConfirmResolver: any; alertMessage: string | null; setAlertMessage: (msg: string | null) => void;
    currentAssetHistory: AssetHistoryPoint[]; loadAssetHistory: () => Promise<void>;
    cachedMarts: User[]; setCachedMarts: (marts: User[]) => void;
    cachedLinkedUsers: any[]; setCachedLinkedUsers: (users: any[]) => void;
    triggerHaptic: () => void;
}

const GameContext = createContext<GameContextType | undefined>(undefined);
export const useGame = () => { const context = useContext(GameContext); if (!context) throw new Error("useGame error"); return context; };

export const GameProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [db, setDb] = useState<DB>(DEFAULT_DB);
    const dbRef = useRef<DB>(DEFAULT_DB);
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [currentAssetHistory, setCurrentAssetHistory] = useState<AssetHistoryPoint[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isAdminMode, setAdminMode] = useState(false);
    const [simulatedLoading, setSimulatedLoading] = useState(false);
    const [toasts, setToasts] = useState<ToastNotification[]>([]);
    const [pinResolver, setPinResolver] = useState<any>(null);
    const [confirmResolver, setConfirmResolver] = useState<any>(null);
    const [alertMessage, setAlertMessage] = useState<string | null>(null);
    const [cachedMarts, setCachedMarts] = useState<User[]>([]);
    const [cachedLinkedUsers, setCachedLinkedUsers] = useState<any[]>([]);

    const refreshData = async () => {
        try {
            // Set initial state from default to ensure something renders if fetch is slow
            const data = await fetchGlobalData();
            const val = { ...DEFAULT_DB, ...data };
            
            const storedUserId = localStorage.getItem('sh_user_id') || sessionStorage.getItem('sh_user_id');
            if (storedUserId) {
                const me = await fetchUser(storedUserId).catch(() => null);
                if (me) {
                    if (!val.users) val.users = {};
                    val.users[me.name] = me;
                    setCurrentUser(me);
                } else {
                    // Don't logout immediately on transient network failure
                    console.warn("Could not fetch current user details.");
                }
            }
            setDb(val as DB);
            dbRef.current = val as DB;
        } catch(e) {
            console.error("Refresh Data failed:", e);
        } finally {
            // Critical: Always stop loading even if everything failed
            setIsLoading(false);
        }
    };

    const serverAction = async (action: string, payload: any) => {
        setSimulatedLoading(true);
        try {
            const res = await fetch('/api/game-action', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                mode: 'cors',
                body: JSON.stringify({ action, payload })
            });
            
            if (!res.ok) {
                const errorText = await res.text();
                let errMsg = `HTTP ${res.status}`;
                try { 
                    const parsed = JSON.parse(errorText); 
                    errMsg = parsed.error || errMsg; 
                } catch(e){}
                throw new Error(errMsg);
            }
            
            const result = await res.json();
            // Critical: Refresh data after any action to prevent PIN or balance sync issues
            await refreshData();
            return result;
        } catch (e: any) {
            console.error("Action Error:", e.message);
            throw e;
        } finally {
            setSimulatedLoading(false);
        }
    };

    const requestNotificationPermission = () => {
        if (!("Notification" in window)) return;
        if (Notification.permission === "default") {
            Notification.requestPermission();
        }
    };

    const clearPaidTax = async (taxId?: string) => {
        if (!currentUser) return;
        const currentTaxes = currentUser.pendingTaxes || [];
        const newTaxes = taxId 
            ? currentTaxes.filter(t => t.id !== taxId)
            : currentTaxes.filter(t => t.status !== 'paid');
        
        await updateUser(currentUser.name, { pendingTaxes: newTaxes });
    };

    const login = async (id: string, pass: string, remember = false, silent = false) => {
        if (!silent) setSimulatedLoading(true);
        try {
            const data = await serverAction('login', { userId: id, password: pass });
            if (data.success && data.user) {
                const targetUser = data.user;
                if (remember) localStorage.setItem('sh_user_id', targetUser.name);
                else sessionStorage.setItem('sh_user_id', targetUser.name);
                
                await update(ref(database, `users/${targetUser.name}`), { isOnline: true, lastActive: Date.now() });
                await refreshData();
                return true;
            } else {
                if (!silent) setAlertMessage("로그인 실패: 정보를 확인하세요.");
                return false;
            }
        } catch (e: any) {
            if (!silent) setAlertMessage("로그인 중 오류가 발생했습니다: " + e.message);
            return false;
        } finally {
            setSimulatedLoading(false);
        }
    };

    const logout = async () => {
        setSimulatedLoading(true);
        if (currentUser) {
            try { await update(ref(database, `users/${currentUser.name}`), { isOnline: false }); } catch(e){}
        }
        localStorage.removeItem('sh_user_id');
        sessionStorage.removeItem('sh_user_id');
        setCurrentUser(null);
        setAdminMode(false);
        setCachedLinkedUsers([]);
        setDb({ ...DEFAULT_DB, settings: db.settings });
        setSimulatedLoading(false);
    };

    const switchAccount = async (targetName: string): Promise<boolean> => {
        setSimulatedLoading(true);
        try {
            // Find user by their DB Key (name) directly
            const targetUser = await fetchUser(targetName);
            if (!targetUser) {
                setAlertMessage("사용자를 찾을 수 없습니다.");
                return false;
            }
            localStorage.setItem('sh_user_id', targetName);
            await refreshData();
            return true;
        } catch(e) {
            setAlertMessage("계정 전환 중 오류 발생");
            return false;
        } finally {
            setSimulatedLoading(false);
        }
    };

    const updateUser = async (name: string, data: Partial<User>) => {
        const sanitizedData = JSON.parse(JSON.stringify(data, (k, v) => v === undefined ? null : v));
        try {
            await update(ref(database, `users/${name}`), sanitizedData);
            await refreshData(); // PIN 등 중요한 정보 업데이트 시 즉시 동기화
        } catch(e) { console.error("Update User Error", e); }
    };

    const updateStock = async (stockId: string, data: any) => {
        try {
            await update(ref(database, `stocks/${stockId}`), data);
        } catch(e) { console.error("Update Stock Error", e); }
    };

    const saveDb = async (data: DB) => {
        setSimulatedLoading(true);
        try {
            const dataClone = JSON.parse(JSON.stringify(data));
            await firebaseSaveDb(dataClone);
            await refreshData();
        } catch(e) {
            console.error("Save DB Error", e);
        } finally {
            setSimulatedLoading(false);
        }
    };

    // Chat Implementation
    const sendMessage = async (chatId: string, text: string, attachment?: ChatAttachment) => {
        if (!currentUser) return;
        const msg: ChatMessage = {
            id: generateId(),
            sender: currentUser.name,
            text,
            timestamp: Date.now(),
            attachment
        };
        await chatService.sendMessage(chatId, msg);
    };

    const createChat = async (participants: string[], type: 'private' | 'group' | 'feedback' = 'private', groupName?: string, isTeamChat: boolean = false) => {
        const fullParticipants = Array.from(new Set([...participants, currentUser!.name]));
        return await chatService.createChat(fullParticipants, type, groupName, isTeamChat);
    };

    const markChatRead = async (chatId: string) => { if(currentUser) await chatService.markRead(chatId, currentUser.name); };
    const markChatManualUnread = async (chatId: string) => { if(currentUser) await chatService.markManualUnread(chatId, currentUser.name); };
    const toggleChatPin = async (chatId: string, isPinned: boolean) => { if(currentUser) await chatService.togglePinChat(chatId, currentUser.name, isPinned); };
    const updatePinnedOrder = async (chatId: string, newOrder: number) => { if(currentUser) await chatService.updatePinnedOrder(chatId, currentUser.name, newOrder); };
    const deleteChat = async (chatId: string) => { if(currentUser) await chatService.hideChat(chatId, currentUser.name); };
    const restoreChat = async (chatId: string) => { if(currentUser) await chatService.restoreChat(chatId, currentUser.name); };
    const hardDeleteChat = async (chatId: string) => { if(currentUser) await chatService.leaveChat(chatId, currentUser.name); };
    const muteChat = async (chatId: string, isMuted: boolean) => { if(currentUser) await chatService.muteChat(chatId, currentUser.name, isMuted); };

    // Helpers
    const wait = (type: 'light' | 'heavy') => new Promise<void>(resolve => setTimeout(resolve, type === 'light' ? 500 : 1500));
    
    const applyBankruptcy = async () => {
        if (!currentUser) return;
        if (!await showConfirm("정말 파산 신청을 하시겠습니까? 모든 자산(현금, 달러, 예금, 주식, 부동산)이 초기화됩니다.")) return;
        
        const pin = await showPinModal("파산 승인 PIN 입력", currentUser.pin!, (currentUser.pinLength as any) || 4);
        if (pin !== currentUser.pin) return;

        setSimulatedLoading(true);
        const newDb = { ...db };
        const u = newDb.users[currentUser.name];
        u.balanceKRW = 0;
        u.balanceUSD = 0;
        u.stockHoldings = {};
        u.loans = {};
        u.pendingTaxes = [];
        
        // Remove real estate
        if (newDb.realEstate?.grid) {
            newDb.realEstate.grid.forEach(cell => {
                if (cell.owner === currentUser.name) cell.owner = null;
                if (cell.tenant === currentUser.name) cell.tenant = null;
            });
        }
        
        // Remove savings
        if (newDb.termDeposits) {
            Object.keys(newDb.termDeposits).forEach(k => {
                if (newDb.termDeposits![k].owner === currentUser.name) {
                    newDb.termDeposits![k].status = 'withdrawn';
                }
            });
        }

        await saveDb(newDb);
        setSimulatedLoading(false);
        showModal("파산 처리가 완료되었습니다. 모든 자산이 국고로 환수되었습니다.");
    };

    const requestPolicyChange = async (type: any, data: any, description: string) => {
        if(!currentUser) return;
        const id = `pol_${Date.now()}`;
        const req: PolicyRequest = { id, type, data, description, requester: currentUser.name, status: 'pending', requestedAt: new Date().toISOString() };
        await update(ref(database, `policyRequests/${id}`), req);
        showModal("대통령에게 정책 변경 승인 요청을 보냈습니다.");
    };

    const approvePolicyChange = async (id: string) => {
        const snap = await get(ref(database, `policyRequests/${id}`));
        if(!snap.exists()) return;
        const pol = snap.val() as PolicyRequest;
        const newDb = { ...db };
        
        if (pol.type === 'standard') {
            newDb.settings.standards = pol.data;
        }
        // apply other types...
        
        await update(ref(database, `policyRequests/${id}/status`), 'approved');
        await saveDb(newDb);
        notify(pol.requester, `요청하신 정책('${pol.description}')이 승인되었습니다.`, true);
    };

    const rejectPolicyChange = async (id: string) => {
        await update(ref(database, `policyRequests/${id}/status`), 'rejected');
        const snap = await get(ref(database, `policyRequests/${id}`));
        if(snap.exists()) notify(snap.val().requester, `요청하신 정책('${snap.val().description}')이 거절되었습니다.`, true);
    };

    const respondToAuctionInvite = async (from: string, accept: boolean, notificationId: string) => {
        if (!currentUser || !db.auction) return;
        const newDb = { ...db };
        const team = newDb.auction.teams?.[from] || [];
        const idx = team.findIndex(m => m.name === currentUser.name);
        if (idx !== -1) {
            if (accept) team[idx].status = 'accepted';
            else team.splice(idx, 1);
            newDb.auction.teams![from] = team;
        }
        await remove(ref(database, `users/${currentUser.name}/notifications/${notificationId}`));
        await saveDb(newDb);
    };

    const simulateSMS = (phone: string) => {
        const code = Math.floor(1000 + Math.random() * 9000).toString();
        showModal(`[알림] 인증번호 [${code}] 가 ${phone}번으로 발송되었습니다.`);
        return code;
    };

    const createSignupSession = async (name: string, phone: string) => {
        const id = generateId();
        const code = Math.floor(100000 + Math.random() * 899999).toString();
        const sess: SignupSession = { id, name, phone, code, createdAt: Date.now(), status: 'active' };
        await update(ref(database, `signupSessions/${id}`), sess);
        return id;
    };

    const validateSignupCode = async (sessionId: string, code: string) => {
        const snap = await get(ref(database, `signupSessions/${sessionId}`));
        if(!snap.exists()) throw new Error("세션이 만료되었습니다.");
        const sess = snap.val() as SignupSession;
        return sess.code === code;
    };

    const showPinModal = (m: string, e?: string, l: 4|6=4, allowBiometric: boolean = true) =>
        new Promise<string|null>(r => setPinResolver({ resolve: r, message: m, expectedPin: e, pinLength: l, allowBiometric }));
    const showConfirm = (m: string) => new Promise<boolean>(r => setConfirmResolver({ resolve: r, message: m }));
    const showModal = (m: string) => setAlertMessage(m);
    const notify = async (targetUser: string, message: string, isPersistent = false, action?: string, actionData?: any) => {
        if (!targetUser) return;
        const notifId = `n_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        const newNotif = { id: notifId, message, read: false, date: new Date().toISOString(), isPersistent, type: 'info', timestamp: Date.now(), action, actionData };
        if (targetUser === 'ALL') {
            const allUsers = await fetchAllUsers();
            const updates: any = {};
            Object.keys(allUsers).forEach(k => { updates[`users/${k}/notifications/${notifId}`] = newNotif; });
            update(ref(database), updates).catch(e=>console.error(e));
        } else {
            update(ref(database, `users/${targetUser}/notifications/${notifId}`), newNotif).catch(e=>console.error(e));
        }
    };

    const addToast = (t: any) => setToasts(p => [...p, { ...t, id: Date.now().toString(), timestamp: Date.now() }]);
    const removeToast = (id: string) => setToasts(p => p.filter(t => t.id !== id));
    const triggerHaptic = () => { if (navigator.vibrate && currentUser?.preferences?.vibration !== false) navigator.vibrate(50); };
    const loadAssetHistory = async () => { if(currentUser) setCurrentAssetHistory(await assetService.fetchHistory(currentUser.name)); };

    useEffect(() => { refreshData(); }, []);

    return (
        <GameContext.Provider value={{
            db, currentUser, isAdminMode, setAdminMode, setCurrentUser, login, logout, updateUser, isLoading,
            showPinModal, showConfirm, showModal, notify, saveDb, switchAccount, refreshData, 
            loadAllUsers: async () => { setSimulatedLoading(true); const all = await fetchAllUsers(); setDb(p => ({...p, users: all})); setSimulatedLoading(false); },
            serverAction, requestNotificationPermission, clearPaidTax, pinResolver, setPinResolver, confirmResolver, setConfirmResolver, alertMessage, setAlertMessage,
            currentAssetHistory, loadAssetHistory, cachedMarts, setCachedMarts, cachedLinkedUsers, setCachedLinkedUsers, triggerHaptic, toasts, addToast, removeToast, updateStock,
            sendMessage, createChat, markChatRead, markChatManualUnread, toggleChatPin, updatePinnedOrder, deleteChat, restoreChat, hardDeleteChat, muteChat,
            wait, applyBankruptcy, requestPolicyChange, approvePolicyChange, rejectPolicyChange, respondToAuctionInvite, simulateSMS, createSignupSession, validateSignupCode
        }}>
            {children}
            {simulatedLoading && <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 backdrop-blur-sm"><div className="animate-spin rounded-full h-16 w-16 border-t-4 border-white"></div></div>}
        </GameContext.Provider>
    );
};
