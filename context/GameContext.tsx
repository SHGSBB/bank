
import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { fetchGlobalData, saveDb as firebaseSaveDb, generateId, chatService, assetService, fetchUser, fetchAllUsers, fetchUserByLoginId, database } from "../services/firebase";
import { update, ref, push as rtdbPush, get, set, onValue, remove, onChildAdded, query, limitToLast } from "firebase/database";
import { DB, DEFAULT_DB, User, GameNotification, MintingRequest, SignupSession, StickyNote, Chat, ChatMessage, ChatAttachment, Ad, PolicyRequest, ChatReaction, ToastNotification, PendingTax, TaxSession, AssetHistoryPoint } from "../types";

interface GameContextType {
    db: DB;
    currentUser: User | null;
    isAdminMode: boolean; 
    setAdminMode: (val: boolean) => void;
    setCurrentUser: (user: User | null) => void;
    login: (id: string, pass: string, remember?: boolean, silent?: boolean, userObject?: User) => Promise<boolean>;
    logout: () => void;
    updateUser: (name: string, data: Partial<User>) => Promise<void>;
    updateStock: (stockId: string, data: any) => Promise<void>; 
    deleteAccount: (name: string) => Promise<void>;
    isLoading: boolean;
    showPinModal: (message: string, expectedPin?: string, length?: 4 | 6, allowBiometric?: boolean) => Promise<string | null>;
    showConfirm: (message: string) => Promise<boolean>;
    showModal: (message: string) => void;
    notify: (userName: string, message: string, isPersistent?: boolean, action?: any, actionData?: any) => void;
    
    // Toast System
    toasts: ToastNotification[];
    addToast: (toast: Omit<ToastNotification, 'id' | 'timestamp'>) => void;
    removeToast: (id: string) => void;
    markToastPaid: (id: string) => void;

    saveDb: (data: DB) => Promise<void>;
    simulateSMS: (phone: string) => string;
    switchAccount: (targetId: string) => Promise<boolean>;
    requestMinting: (amount: number, currency: 'KRW' | 'USD') => Promise<void>;
    approveMinting: (reqId: string) => Promise<void>;
    createSignupSession: (name: string, phone: string) => Promise<string>;
    validateSignupCode: (sessionId: string, code: string) => Promise<boolean>;
    respondToAuctionInvite: (leaderName: string, accept: boolean, notifId: string) => Promise<void>;
    
    // Design Mode
    stickyNotes: StickyNote[];
    addStickyNote: (note: StickyNote) => void;
    removeStickyNote: (id: string) => void;

    // Chat
    sendMessage: (chatId: string, text: string, attachment?: ChatAttachment, replyTo?: string, senderId?: string) => Promise<void>;
    editMessage: (chatId: string, msgId: string, newText: string) => Promise<void>;
    addReaction: (chatId: string, msgId: string, reaction: ChatReaction) => Promise<void>;
    deleteMessage: (chatId: string, msgId: string) => Promise<void>;
    createChat: (participants: string[], type?: 'private'|'group'|'feedback', groupName?: string, isTeamChat?: boolean) => Promise<string>;
    markChatRead: (chatId: string) => Promise<void>;
    markChatManualUnread: (chatId: string) => Promise<void>;
    toggleChatPin: (chatId: string, isPinned: boolean) => Promise<void>;
    updatePinnedOrder: (chatId: string, newOrder: number) => Promise<void>;
    deleteChat: (chatId: string) => Promise<void>;
    restoreChat: (chatId: string) => Promise<void>;
    hardDeleteChat: (chatId: string) => Promise<void>;
    muteChat: (chatId: string, isMuted: boolean) => Promise<void>;

    // Ads
    createAdProposal: (businessName: string, imageUrl: string, fee: number) => Promise<void>;
    acceptAd: (ad: Ad) => Promise<void>;

    // Policy
    requestPolicyChange: (type: 'tax_rate'|'interest_rate'|'standard', data: any, description: string) => Promise<void>;
    approvePolicyChange: (reqId: string) => Promise<void>;
    rejectPolicyChange: (reqId: string) => Promise<void>;

    // Notifications
    requestNotificationPermission: () => void;

    // Helper
    wait: (type: 'light' | 'heavy') => Promise<void>;
    triggerHaptic: () => void;

    // UI Sharing
    isElementPicking: boolean;
    setElementPicking: (val: boolean, callback?: (data: any) => void) => void;
    
    applyBankruptcy: () => Promise<void>;
    clearPaidTax: (taxId?: string) => Promise<void>;

    // Asset History
    currentAssetHistory: AssetHistoryPoint[];
    loadAssetHistory: () => Promise<void>;

    // Server API Actions
    serverAction: (action: string, payload: any) => Promise<any>;

    // Caching
    cachedMarts: User[];
    setCachedMarts: (marts: User[]) => void;
    cachedLinkedUsers: any[];
    setCachedLinkedUsers: (users: any[]) => void;

    // Exposed UI State for Global Overlay
    pinResolver: any;
    setPinResolver: any;
    confirmResolver: any;
    setConfirmResolver: any;
    alertMessage: string | null;
    setAlertMessage: (msg: string | null) => void;
    
    refreshData: () => Promise<void>;
    loadAllUsers: () => Promise<void>; // Admin helper
}

const GameContext = createContext<GameContextType | undefined>(undefined);

export const useGame = () => {
    const context = useContext(GameContext);
    if (!context) {
        throw new Error("useGame must be used within a GameProvider");
    }
    return context;
};

export const GameProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [db, setDb] = useState<DB>(DEFAULT_DB);
    const dbRef = useRef<DB>(DEFAULT_DB);
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [currentAssetHistory, setCurrentAssetHistory] = useState<AssetHistoryPoint[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isAdminMode, setAdminMode] = useState(false);
    
    const [pinResolver, setPinResolver] = useState<any>(null);
    const [confirmResolver, setConfirmResolver] = useState<any>(null);
    const [alertMessage, setAlertMessage] = useState<string | null>(null);
    const [simulatedLoading, setSimulatedLoading] = useState(false);
    const [toasts, setToasts] = useState<ToastNotification[]>([]);
    
    const [isElementPicking, setIsElementPickingState] = useState(false);
    const elementPickCallback = useRef<((data: any) => void) | null>(null);

    // Caching states to prevent reload
    const [cachedMarts, setCachedMarts] = useState<User[]>([]);
    const [cachedLinkedUsers, setCachedLinkedUsers] = useState<any[]>([]);

    // Real-time listener for notifications
    useEffect(() => {
        if (!currentUser) return;

        // Listen for new notifications
        const notifRef = query(ref(database, `users/${currentUser.name}/notifications`), limitToLast(1));
        const unsubscribe = onChildAdded(notifRef, (snapshot) => {
             const data = snapshot.val();
             if (data && !data.read && (Date.now() - new Date(data.date).getTime() < 10000)) {
                 // Only show toast if recent (e.g. within 10s) to avoid spamming on load
                 addToast({
                    message: data.message,
                    read: false,
                    isPersistent: data.isPersistent,
                    date: data.date,
                    type: data.type || 'info', 
                    title: data.title,
                    action: data.action,
                    actionData: data.actionData
                 });
             }
        });

        // Also check last_popup for backward compatibility/ephemeral
        const popupRef = ref(database, `users/${currentUser.name}/last_popup`);
        const unsubscribePopup = onValue(popupRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                addToast({
                    message: data.message,
                    read: false,
                    isPersistent: false,
                    date: new Date().toISOString(),
                    type: data.type || 'info',
                    title: data.title
                });
                remove(popupRef).catch(e => console.error("Failed to clear popup signal", e));
            }
        });

        return () => {
            unsubscribe();
            unsubscribePopup();
        };
    }, [currentUser?.name]);

    const refreshData = async () => {
        // Fetch only global settings (NO USERS)
        const data = await fetchGlobalData();
        const val = { ...DEFAULT_DB, ...data };
        
        // Check for logged in user
        const storedUserId = localStorage.getItem('sh_user_id');
        // Use currentUser.name (Key) if available, NOT currentUser.id (Login ID)
        const activeUserId = storedUserId || currentUser?.name;

        if (activeUserId) {
            // Only fetch CURRENT user's data
            const me = await fetchUser(activeUserId);
            if (me) {
                // Manually place current user into db.users for local access
                if (!val.users) val.users = {};
                val.users[me.name] = me;
                
                setCurrentUser(me);
            } else {
                if (storedUserId) logout();
            }
        }
        
        setDb(val as DB);
        dbRef.current = val as DB;
        setIsLoading(false);
    };

    // Admin function to load everyone (bandwidth heavy)
    const loadAllUsers = async () => {
        setSimulatedLoading(true);
        const all = await fetchAllUsers();
        const newDb = { ...db, users: all };
        setDb(newDb);
        dbRef.current = newDb;
        setSimulatedLoading(false);
    };

    const serverAction = async (action: string, payload: any) => {
        setSimulatedLoading(true);
        try {
            const res = await fetch('/api/game-action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, payload })
            });
            
            if (!res.ok) {
                if (res.status === 404 || res.status === 405) {
                    throw new Error("PREVIEW_MODE: Server API not available.");
                }
                throw new Error('Server action failed');
            }
            
            // Just refresh current user data after action
            await refreshData();
            return await res.json();
        } catch (e: any) {
            console.error("Action Error:", e);
            setAlertMessage("오류가 발생했습니다: " + e.message);
            throw e;
        } finally {
            setSimulatedLoading(false);
        }
    };

    const saveDb = async (data: DB) => {
        const dataClone = JSON.parse(JSON.stringify(data));
        setDb(dataClone); 
        await firebaseSaveDb(dataClone);
        refreshData();
    };
    
    const setElementPicking = (val: boolean, callback?: (data: any) => void) => {
        setIsElementPickingState(val);
        if (callback) elementPickCallback.current = callback;
        else if(!val) elementPickCallback.current = null;
    };

    const login = async (id: string, pass: string, remember = false, silent = false, userObject?: User) => {
        if (!silent) await wait('light');
        
        try {
            // [Security Update] Use server-side verification via API
            // If userObject is provided (e.g. signup flow shortcut), use it directly but verify session later
            if (userObject) {
                 const targetUser = userObject;
                 // Manually set into db for context
                const newDb = { ...dbRef.current };
                if (!newDb.users) newDb.users = {};
                newDb.users[targetUser.name] = targetUser;
                setDb(newDb);
                
                setCurrentUser(targetUser);
                return true;
            }

            const res = await fetch('/api/game-action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    action: 'login', 
                    payload: { userId: id, password: pass } 
                })
            });

            const data = await res.json();

            if (res.ok && data.success && data.user) {
                const targetUser = data.user;
                
                if (targetUser.approvalStatus === 'pending') { if (!silent) setAlertMessage("승인 대기"); return false; }
                if (targetUser.isSuspended) { if (!silent) setAlertMessage("정지된 계정"); return false; }
                
                if (remember) { 
                    localStorage.setItem('sh_user_id', targetUser.name); 
                    // Do NOT store password in local storage for security
                } else {
                    sessionStorage.setItem('sh_user_id', targetUser.name);
                }

                // Update online status
                const updates: Partial<User> = { isOnline: true, lastActive: Date.now() };
                await updateUser(targetUser.name, updates);

                // Manually set into db for context
                const newDb = { ...dbRef.current };
                if (!newDb.users) newDb.users = {};
                newDb.users[targetUser.name] = { ...targetUser, ...updates };
                setDb(newDb);
                
                setCurrentUser({ ...targetUser, ...updates });
                return true;
            } else {
                if (!silent) setAlertMessage("로그인 실패: 아이디 또는 비밀번호를 확인하세요."); 
                return false; 
            }
        } catch (e) {
            console.error("Login Error:", e);
            if (!silent) setAlertMessage("서버 연결 오류");
            return false;
        }
    };

    const logout = () => { 
        if (currentUser) updateUser(currentUser.name, { isOnline: false }); 
        setCurrentUser(null); 
        setCachedMarts([]);
        setCachedLinkedUsers([]);
        localStorage.removeItem('sh_user_id'); 
        sessionStorage.removeItem('sh_user_id');
        setAdminMode(false); 
        // Clear sensitive data from memory
        setDb({ ...DEFAULT_DB, settings: db.settings });
    };

    const updateUser = async (name: string, data: Partial<User>) => { 
        const sanitizedData = JSON.parse(JSON.stringify(data)); // Remove undefined
        
        // Optimistic UI update
        const newDb = { ...dbRef.current };
        if (newDb.users[name]) { 
            newDb.users[name] = { ...newDb.users[name], ...sanitizedData }; 
            setDb(newDb);
            
            if (currentUser && currentUser.name === name) {
                setCurrentUser({ ...currentUser, ...sanitizedData });
            }
        }
        
        // Direct Firebase Update
        try {
            await update(ref(database, `users/${name}`), sanitizedData);
        } catch(e) {
            console.error("Update user failed", e);
            refreshData(); // Revert on fail
        }
    };

    const updateStock = async (stockId: string, data: any) => {
        try {
            const sanitizedData = JSON.parse(JSON.stringify(data));
            await update(ref(database, `stocks/${stockId}`), sanitizedData);
            
            // Local optimistic
            const newDb = { ...dbRef.current };
            if (newDb.stocks) {
                newDb.stocks[stockId] = { ...newDb.stocks[stockId], ...sanitizedData };
                setDb(newDb);
            }
        } catch(e) {
            console.error("Update stock failed", e);
        }
    };

    const deleteAccount = async (name: string) => { 
        await wait('heavy'); 
        await update(ref(database, `users/${name}`), null);
        refreshData();
    };
    
    const wait = async (t: 'light'|'heavy') => { setSimulatedLoading(true); await new Promise(r => setTimeout(r, t==='light'?400:1200)); setSimulatedLoading(false); };
    
    const showPinModal = (m: string, e?: string, l: 4|6=4, allowBiometric: boolean = true) => 
        new Promise<string|null>(r => setPinResolver({ resolve: r, message: m, expectedPin: e, pinLength: l, allowBiometric }));
    
    const showConfirm = (m: string) => new Promise<boolean>(r => setConfirmResolver({ resolve: r, message: m }));
    const showModal = (m: string) => setAlertMessage(m);
    
    // [1] 알림 보내기 (notify) - 이게 없으면 월급 들어와도 모름
    const notify = async (targetUser: string, message: string, isPersistent = false, action: any = null, actionData: any = null) => {
        if (!targetUser) return;
        
        // 알림 고유 ID 생성
        const notifId = `n_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        const newNotif: GameNotification = {
            id: notifId,
            message,
            read: false,
            date: new Date().toISOString(),
            isPersistent,
            action,
            actionData,
            type: 'info',
            timestamp: Date.now()
        };

        const updates: any = {};
        // 해당 유저의 notifications 경로에 추가
        updates[`users/${targetUser}/notifications/${notifId}`] = newNotif;
        
        // DB 업데이트 (이 함수는 await을 안 걸어도 됨, 백그라운드 처리)
        update(ref(database), updates).catch(console.error);
    };
    
    const simulateSMS = (p: string) => { const c = "1234"; showModal(c); return c; };
    
    // [2] 계정 전환 (switchAccount) - 연동된 계정으로 바로 로그인
    const switchAccount = async (targetId: string): Promise<boolean> => {
        await refreshData(); // 최신 데이터 불러오기
        
        // Fetch specific user if not in context
        // Ensure array iteration is safe by handling potential null
        const currentUsers = dbRef.current.users || {};
        let targetUser = Object.values(currentUsers).find((u: any) => u.id === targetId) as User | undefined;
        
        if (!targetUser) {
            targetUser = await fetchUserByLoginId(targetId) || undefined;
        }
        
        if (!targetUser) {
            showModal("전환할 계정을 찾을 수 없습니다.");
            return false;
        }

        // 로그인 처리 (비밀번호 확인 없이 즉시 전환)
        localStorage.setItem('sh_user_id', targetUser.name);
        
        const newDb = { ...dbRef.current };
        if (!newDb.users) newDb.users = {};
        newDb.users[targetUser.name] = targetUser;
        setDb(newDb);

        setCurrentUser(targetUser);
        updateUser(targetUser.name, { isOnline: true, lastActive: Date.now() });
        
        showModal(`${targetUser.name}님으로 전환되었습니다.`);
        return true;
    }; 

    // [1] 화폐 발행 요청 (한국은행 -> 관리자)
    const requestMinting = async (amount: number, currency: 'KRW' | 'USD') => {
        const reqId = `mint_${Date.now()}`;
        const newReq: MintingRequest = {
            id: reqId,
            amount,
            currency,
            status: 'pending',
            timestamp: Date.now(),
            requester: currentUser?.name || 'Admin', // Changed from requestedBy to match updated type or use existing
            requestedBy: currentUser?.name || 'Admin' // Keeping both for compatibility if type updated
        };
        const updates: any = {};
        updates[`mintingRequests/${reqId}`] = newReq;
        await update(ref(database), updates);
        showModal(`${currency} ${amount.toLocaleString()} 발행 승인을 요청했습니다.`);
    };

    // [2] 화폐 발행 승인 (관리자 -> 한국은행 잔고 증가)
    const approveMinting = async (reqId: string) => {
        if (!db.mintingRequests || !db.mintingRequests[reqId]) return;
        const req = db.mintingRequests[reqId];
        
        const updates: any = {};
        // 1. 요청 상태 완료로 변경
        updates[`mintingRequests/${reqId}/status`] = 'approved';
        
        // 2. 한국은행 잔고 증가
        const bankName = '한국은행';
        const currentBankBalance = db.users[bankName]?.balanceKRW || 0;
        const currentBankDollar = db.users[bankName]?.balanceUSD || 0;

        if (req.currency === 'KRW') {
            updates[`users/${bankName}/balanceKRW`] = currentBankBalance + req.amount;
        } else {
            updates[`users/${bankName}/balanceUSD`] = currentBankDollar + req.amount;
        }

        await update(ref(database), updates);
        notify(bankName, `화폐 발행 승인 완료: ${req.amount.toLocaleString()} ${req.currency}`, true);
    };

    // [3] 파산 신청 (시민)
    const applyBankruptcy = async () => {
        if (!currentUser) return;
        if (!await showConfirm("정말 파산 신청을 하시겠습니까? \n신용 등급이 최하로 떨어지며 자산이 압류될 수 있습니다.")) return;
        
        await updateUser(currentUser.name, { bankruptcyStatus: 'pending' });
        notify('한국은행', `${currentUser.name}님이 파산 신청을 접수했습니다.`, true);
        showModal("파산 신청이 법원에 접수되었습니다.");
    };

    // [4] 세금 납부 후 고지서 삭제 (시민)
    const clearPaidTax = async (taxId?: string) => {
        if (!currentUser || !currentUser.pendingTaxes) return;
        
        // 납부된 세금(taxId)을 제외한 나머지만 남김 (Firebase는 배열 삭제가 까다로워 필터링 후 덮어쓰기)
        const currentTaxes = Array.isArray(currentUser.pendingTaxes) 
            ? currentUser.pendingTaxes 
            : Object.values(currentUser.pendingTaxes);
            
        const remainingTaxes = currentTaxes.filter((t: any) => t.id !== taxId);
        
        await updateUser(currentUser.name, { pendingTaxes: remainingTaxes as any });
    };

    // [4] 회원가입 세션 생성 (선생님용)
    const createSignupSession = async (name: string, phone: string) => {
        // 6자리 랜덤 코드 생성
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        const sessionId = `session_${code}`;
        
        const updates: any = {};
        updates[`signupSessions/${sessionId}`] = {
            id: sessionId,
            code,
            createdAt: Date.now(), // Fixed property name
            name, // 반 이름 또는 선생님 성함
            status: 'active',
            attempts: 0 // Initialize attempts
        };
        
        await update(ref(database), updates);
        return code; // 화면에 이 코드를 보여주면 됨
    };

    // [5] 가입 코드 검증 (학생용)
    const validateSignupCode = async (sessionId: string, code: string) => {
        const snapshot = await get(ref(database, 'signupSessions'));
        if (!snapshot.exists()) return false;
        
        const sessions = snapshot.val() as Record<string, any>; // Cast to avoid unknown error
        // 코드와 일치하고 활성화된 세션이 있는지 확인
        const isValid = Object.values(sessions).some((s: any) => s.code === code && s.status === 'active');
        return isValid;
    };

    // [8] 경매 팀 초대 응답 (수락/거절) - FIXED
    const respondToAuctionInvite = async (leaderName: string, accept: boolean, notifId: string) => {
        const user = currentUser as User;
        if (!user) return;
        
        // 1. 알림 지우기
        const notifs = user.notifications ? (Array.isArray(user.notifications) ? user.notifications : Object.values(user.notifications)) : [];
        const remainingNotifs = notifs.filter((n: any) => n.id !== notifId);
        await updateUser(user.name, { notifications: remainingNotifs });

        if (accept) {
            // 2. 수락 시: 해당 경매 팀 찾아서 내 상태를 'accepted'로 변경
            const teamRef = ref(database, `auction/teams/${leaderName}`);
            const snapshot = await get(teamRef);
            if (snapshot.exists()) {
                const members = snapshot.val() as any[]; // Cast to avoid unknown error
                if (members) {
                    // Try to handle both array and object responses for safety
                    let myIndex = -1;
                    if (Array.isArray(members)) {
                        myIndex = members.findIndex((m: any) => m && m.name === user.name);
                    } else {
                        // If it's an object map, find key
                        const entries = Object.entries(members);
                        const entry = entries.find(([_, m]: [string, any]) => m && m.name === user.name);
                        if(entry) myIndex = entry[0] as any;
                    }
                    
                    if (myIndex !== -1) {
                        const updates: any = {};
                        updates[`auction/teams/${leaderName}/${myIndex}/status`] = 'accepted';
                        await update(ref(database), updates);
                        notify(leaderName, `${user.name}님이 팀 초대를 수락했습니다.`, true);
                    }
                }
            }
        } else {
            notify(leaderName, `${user.name}님이 팀 초대를 거절했습니다.`, true);
        }
    };

    // [6] 화면 포스트잇 추가 (addStickyNote)
    const addStickyNote = async (note: StickyNote) => {
         const currentNotes = db.settings.stickyNotes || [];
         const newNotes = [...currentNotes, note];
         
         const updates: any = {};
         updates['settings/stickyNotes'] = newNotes;
         await update(ref(database), updates);
    };

    // [7] 화면 포스트잇 삭제 (removeStickyNote)
    const removeStickyNote = async (id: string) => {
         const currentNotes = db.settings.stickyNotes || [];
         const newNotes = currentNotes.filter(n => n.id !== id);
         
         const updates: any = {};
         updates['settings/stickyNotes'] = newNotes;
         await update(ref(database), updates);
    };
    
    const createChat = async (p: string[], t: any = 'private', n?: string, isTeamChat: boolean = false) => { 
        const sender = currentUser?.name;
        if (!sender) throw new Error("User not identified");
        
        // Ensure unique participants
        const participants = Array.from(new Set([...p, sender])).sort();

        // 1. Check existing 1:1 chat via Service (checks DB)
        if (t === 'private' && participants.length === 2) {
            const existingId = await chatService.findExistingPrivateChat(participants);
            if (existingId) return existingId;
        }

        // 2. Create new if not found
        // Corrected to pass arguments instead of object
        return await chatService.createChat(participants, t, n, isTeamChat); 
    };

    const sendMessage = async (cid: string, t: string, att?: ChatAttachment, rep?: string, senderId?: string) => { 
        const sender = senderId || currentUser?.name;
        if (!sender) throw new Error("User not identified for sending message");
        await chatService.sendMessage(cid, {id: `msg_${Date.now()}`, sender: sender, text: t, timestamp: Date.now(), attachment: att, replyTo: rep}); 
    };
    const editMessage = async (cid: string, mid: string, t: string) => { await chatService.updateMessage(cid, mid, {text: t, isEdited: true}); };
    
    // [3] 채팅 이모지 반응 (addReaction)
    const addReaction = async (chatId: string, msgId: string, reaction: ChatReaction) => {
        // 현재 메시지의 반응 목록 가져오기
        const msgRef = ref(database, `chatMessages/${chatId}/${msgId}/reactions`);
        const snapshot = await get(msgRef);
        let reactions: ChatReaction[] = snapshot.val() || [];

        // 이미 내가 누른 반응인지 확인 (토글 기능)
        const existingIdx = reactions.findIndex(r => r.user === reaction.user && r.emoji === reaction.emoji);
        
        if (existingIdx !== -1) {
            // 이미 있으면 삭제 (취소)
            reactions.splice(existingIdx, 1);
        } else {
            // 없으면 추가
            reactions.push(reaction);
        }
        
        const updates: any = {};
        updates[`chatMessages/${chatId}/${msgId}/reactions`] = reactions;
        await update(ref(database), updates);
    };

    const deleteMessage = async (cid: string, mid: string) => { await chatService.deleteMessage(cid, mid); };
    
    // New Chat Functions
    const markChatRead = async (chatId: string) => {
        if (!currentUser) return;
        await chatService.markRead(chatId, currentUser.name);
    };

    const markChatManualUnread = async (chatId: string) => {
        if (!currentUser) return;
        await chatService.markManualUnread(chatId, currentUser.name);
    };
    
    const toggleChatPin = async (chatId: string, isPinned: boolean) => {
        if (!currentUser) return;
        await chatService.togglePinChat(chatId, currentUser.name, isPinned);
    };

    const updatePinnedOrder = async (chatId: string, newOrder: number) => {
        if (!currentUser) return;
        await chatService.updatePinnedOrder(chatId, currentUser.name, newOrder);
    };
    
    const deleteChat = async (chatId: string) => {
        if (!currentUser) return;
        await chatService.hideChat(chatId, currentUser.name);
    };

    const restoreChat = async (chatId: string) => {
        if (!currentUser) return;
        await chatService.restoreChat(chatId, currentUser.name);
    }

    const hardDeleteChat = async (chatId: string) => {
        if (!currentUser) return;
        await chatService.leaveChat(chatId, currentUser.name);
    }
    
    const muteChat = async (chatId: string, isMuted: boolean) => {
        if (!currentUser) return;
        await chatService.muteChat(chatId, currentUser.name, isMuted);
    };

    // [9] 광고 신청 (시민 -> 마트/관리자)
    const createAdProposal = async (businessName: string, imageUrl: string, fee: number) => {
        const adId = `ad_${Date.now()}`;
        const newAd: Ad = {
            id: adId,
            type: 'banner',
            businessName,
            content: '광고', // Default content
            imageUrl, // 이미지는 Storage URL이어야 함
            fee,
            status: 'pending',
            owner: currentUser?.name || 'unknown'
        };
        const updates: any = {};
        updates[`ads/${adId}`] = newAd;
        await update(ref(database), updates);
        showModal("광고 신청이 접수되었습니다. 승인 후 게시됩니다.");
    };

    // [10] 광고 승인 (관리자)
    const acceptAd = async (ad: Ad) => {
        const updates: any = {};
        updates[`ads/${ad.id}/status`] = 'active';
        updates[`ads/${ad.id}/startDate`] = Date.now();
        await update(ref(database), updates);
        // Only notify if owner is present
        if(ad.owner) {
            notify(ad.owner, `신청하신 '${ad.businessName}' 광고가 승인되었습니다.`, true);
        }
    };

    // [5] 정책 변경 제안 (공무원/정부)
    const requestPolicyChange = async (type: 'tax_rate'|'interest_rate'|'standard', data: any, description: string) => {
        const reqId = `pol_${Date.now()}`;
        const request: PolicyRequest = {
            id: reqId,
            type,
            targetValue: data, // Maps to data in original type or new field
            data: data, // Keeping compat
            description,
            status: 'pending',
            requester: currentUser?.name || 'unknown',
            proposer: currentUser?.name || 'unknown', // New field
            timestamp: Date.now(), // New field
            requestedAt: new Date().toISOString(),
            votes: { [currentUser?.name || 'admin']: 'agree' } // 제안자는 자동 찬성
        };
        
        const updates: any = {};
        updates[`policyRequests/${reqId}`] = request;
        await update(ref(database), updates);
        showModal("정책 변경 안건이 등록되었습니다. 국무회의 투표를 기다립니다.");
    };

    // [6] 정책 승인 및 실제 반영 (관리자/대통령)
    const approvePolicyChange = async (reqId: string) => {
        const req = db.policyRequests?.[reqId];
        if (!req) return;

        const updates: any = {};
        updates[`policyRequests/${reqId}/status`] = 'approved';

        const val = req.targetValue || req.data;

        // 실제 게임 설정(Settings) 변경 적용
        if (req.type === 'tax_rate') {
            updates[`settings/taxRate`] = val;
            notify('ALL', `세율이 ${val}%로 변경되었습니다.`, true);
        } else if (req.type === 'interest_rate') {
            updates[`settings/depositRate`] = val; // 예금 이자율 예시
            notify('ALL', `기준 금리가 ${val}%로 변경되었습니다.`, true);
        } else if (req.type === 'standard') {
            updates[`settings/standards`] = val;
            notify('ALL', `국가 기준표가 변경되었습니다.`, true);
        }

        await update(ref(database), updates);
    };

    // [7] 정책 거절
    const rejectPolicyChange = async (reqId: string) => {
        const updates: any = {};
        updates[`policyRequests/${reqId}/status`] = 'rejected';
        await update(ref(database), updates);
    };

    // [10] 알림 권한 요청 (브라우저)
    const requestNotificationPermission = async () => {
        if (!("Notification" in window)) return;
        if (Notification.permission === "granted") return;
        
        try {
            await Notification.requestPermission();
        } catch (e) {
            console.log("알림 권한 요청 실패");
        }
    };
    
    const loadAssetHistory = async () => { if(currentUser) setCurrentAssetHistory(await assetService.fetchHistory(currentUser.name)); };
    const addToast = (t: any) => setToasts(p => [...p, { ...t, id: Date.now().toString(), timestamp: Date.now() }]);
    const removeToast = (id: string) => setToasts(p => p.filter(t => t.id !== id));
    
    // [9] 토스트 알림(화면 하단 팝업) 처리
    const markToastPaid = (id: string) => {
        // 토스트 목록에서 제거
        removeToast(id);
        // (필요하다면 여기서 세금 납부 로직을 연쇄적으로 호출할 수도 있음)
    };

    // [8] 진동 울리기 (모바일에서만 작동)
    const triggerHaptic = () => {
        // 설정에서 진동을 켰고, 브라우저가 지원할 때만
        if (navigator.vibrate && currentUser?.preferences?.vibration !== false) {
            navigator.vibrate(50); // 50ms 짧은 진동
        }
    };

    useEffect(() => { refreshData(); }, []);

    return (
        <GameContext.Provider value={{ 
            db, currentUser, isAdminMode, setAdminMode, setCurrentUser, login, logout, updateUser, updateStock, deleteAccount, isLoading, 
            showPinModal, showConfirm, showModal, notify, saveDb, simulateSMS, switchAccount,
            requestMinting, approveMinting, createSignupSession, validateSignupCode, respondToAuctionInvite,
            stickyNotes: db.settings.stickyNotes || [], addStickyNote, removeStickyNote,
            wait, sendMessage, editMessage, createChat, markChatRead, markChatManualUnread, toggleChatPin, updatePinnedOrder, deleteChat, restoreChat, hardDeleteChat, muteChat,
            createAdProposal, acceptAd, requestNotificationPermission,
            requestPolicyChange, approvePolicyChange, rejectPolicyChange, addReaction, deleteMessage,
            toasts, addToast, removeToast, markToastPaid,
            isElementPicking, setElementPicking, applyBankruptcy, clearPaidTax, triggerHaptic,
            pinResolver, setPinResolver, confirmResolver, setConfirmResolver, alertMessage, setAlertMessage,
            currentAssetHistory, loadAssetHistory,
            refreshData, loadAllUsers,
            serverAction,
            cachedMarts, setCachedMarts,
            cachedLinkedUsers, setCachedLinkedUsers
        }}>
            {children}
            <div id="element-picker-bridge" data-active={isElementPicking} style={{display:'none'}}></div>
            {simulatedLoading && (
                <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/20 backdrop-blur-sm">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
                </div>
            )}
        </GameContext.Provider>
    );
};
