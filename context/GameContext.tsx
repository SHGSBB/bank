import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { 
    fetchGlobalData, 
    saveDb as firebaseSaveDb, 
    generateId, 
    chatService, 
    assetService, 
    fetchAllUsers, 
    loginWithEmail, 
    logoutFirebase, 
    registerWithAutoRetry, 
    subscribeAuth, 
    fetchUserByEmail,
    resetUserPassword,
    database,
    toSafeId,
    fetchUserByLoginId
} from "../services/firebase";
import { update, ref, set, get } from "firebase/database";
import { DB, DEFAULT_DB, User, ToastNotification, AssetHistoryPoint, ChatAttachment, ChatMessage, PolicyRequest, Stock, Application, PendingTax } from "../types";
import { Spinner } from "../components/Shared";

const sanitize = (obj: any) => JSON.parse(JSON.stringify(obj, (k, v) => v === undefined ? null : v));

interface GameContextType {
    db: DB;
    currentUser: User | null;
    isAdminMode: boolean;
    toasts: ToastNotification[];
    setAdminMode: (val: boolean) => void;
    login: (id: string, pass: string, remember?: boolean) => Promise<boolean>;
    logout: () => Promise<void>;
    updateUser: (email: string, data: Partial<User>) => Promise<void>;
    registerUser: (userData: Partial<User>, password: string) => Promise<void>;
    isLoading: boolean;
    showPinModal: (message: string, expectedPin?: string, length?: 4 | 6, allowBiometric?: boolean) => Promise<string | null>;
    showConfirm: (message: string) => Promise<boolean>;
    showModal: (message: string) => void;
    notify: (targetUser: string, message: string, isPersistent?: boolean, action?: string | null, actionData?: any) => Promise<void>;
    saveDb: (data: DB) => Promise<void>;
    refreshData: () => Promise<void>;
    loadAllUsers: () => Promise<void>;
    serverAction: (action: string, payload: any) => Promise<any>;
    pinResolver: any; setPinResolver: any; confirmResolver: any; setConfirmResolver: any; alertMessage: string | null; setAlertMessage: (msg: string | null) => void;
    currentAssetHistory: AssetHistoryPoint[]; loadAssetHistory: () => Promise<void>;
    cachedLinkedUsers: any[]; setCachedLinkedUsers: (users: any[]) => void;
    triggerHaptic: () => void;
    isElementPicking: boolean; setElementPicking: (val: boolean) => void;
    requestNotificationPermission: (mode?: 'native' | 'browser') => Promise<void>;
    createChat: (participants: string[], type?: 'private'|'group'|'feedback', groupName?: string) => Promise<string>;
    sendMessage: (chatId: string, text: string, attachment?: ChatAttachment) => Promise<void>;
    clearPaidTax: () => Promise<void>;
    cachedMarts: User[];
    setCachedMarts: (marts: User[]) => void;
    wait: (type: 'light' | 'heavy') => Promise<void>;
    requestPolicyChange: (type: string, data: any, description: string) => Promise<void>;
    respondToAuctionInvite: (from: string, accept: boolean, notifId: string) => Promise<void>;
    updateStock: (stockId: string, data: Partial<Stock>) => Promise<void>;
    markChatRead: (chatId: string) => Promise<void>;
    applyBankruptcy: () => Promise<void>;
    switchAccount: (targetName: string) => Promise<boolean>;
    approvePolicyChange: (id: string) => Promise<void>;
    rejectPolicyChange: (id: string) => Promise<void>;
    requestPasswordReset: (email: string) => Promise<void>;
    payTax: (tax: PendingTax) => Promise<void>;
    dismissTax: (taxId: string) => Promise<void>;
    openChat: (chatId: string) => void;
    submitApplication: (app: Application) => Promise<void>;
}

const GameContext = createContext<GameContextType | undefined>(undefined);
export const useGame = () => { 
    const context = useContext(GameContext); 
    if (!context) throw new Error("useGame must be used within a GameProvider"); 
    return context; 
};

export const GameProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [db, setDb] = useState<DB>(DEFAULT_DB);
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [currentAssetHistory, setCurrentAssetHistory] = useState<AssetHistoryPoint[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isAdminMode, setAdminMode] = useState(false);
    const [simulatedLoading, setSimulatedLoading] = useState(false);
    const [pinResolver, setPinResolver] = useState<any>(null);
    const [confirmResolver, setConfirmResolver] = useState<any>(null);
    const [alertMessage, setAlertMessage] = useState<string | null>(null);
    const [cachedLinkedUsers, setCachedLinkedUsers] = useState<any[]>([]);
    const [isElementPicking, setElementPicking] = useState(false);
    const [cachedMarts, setCachedMarts] = useState<User[]>([]);
    const [toasts, setToasts] = useState<ToastNotification[]>([]);

    const refreshData = useCallback(async () => {
        try {
            // Use Email or ID as the key for fetching data. 
            // Crucial: Use the ID if email is missing (legacy support or ID-based login)
            const currentId = currentUser?.email || currentUser?.id || undefined;
            const data = await fetchGlobalData(currentId);
            
            setDb(prev => ({ 
                ...prev, 
                ...data,
                users: { ...prev.users, ...data.users } 
            }));
            
            if (currentId) {
                const safeId = toSafeId(currentId);
                const updatedMe = (data.users && data.users[safeId]) ? data.users[safeId] : null;
                
                if (updatedMe) {
                    setCurrentUser(prev => {
                        if (!prev) return updatedMe;
                        
                        // [Critical Fix] If the server returned a 'diet' object (missing transactions) because it failed to identify 'me',
                        // we MUST NOT overwrite the existing detailed data with the diet data.
                        const isDietObject = (!updatedMe.transactions || updatedMe.transactions.length === 0) && (prev.transactions && prev.transactions.length > 0);
                        
                        if (isDietObject) {
                            // Merge carefully: Keep local heavy data, update light data
                            return {
                                ...updatedMe,
                                transactions: prev.transactions,
                                notifications: prev.notifications || updatedMe.notifications,
                                ledger: prev.ledger || updatedMe.ledger,
                                // Ensure critical fields aren't lost
                                name: updatedMe.name || prev.name,
                                type: updatedMe.type || prev.type,
                                govtRole: updatedMe.govtRole || prev.govtRole,
                                customJob: updatedMe.customJob || prev.customJob
                            };
                        }
                        
                        return { ...prev, ...updatedMe };
                    });
                }
            }
        } catch(e) { console.error("Global Data Fetch Error:", e); }
    }, [currentUser?.email, currentUser?.id]);

    const isBOKUser = (user: User | null) => {
        if (!user) return false;
        return user.name === '한국은행' || user.govtRole === '한국은행장' || user.customJob === '한국은행장';
    };

    useEffect(() => {
        const unsubscribe = subscribeAuth(async (firebaseUser) => {
            if (firebaseUser) {
                if (!firebaseUser.emailVerified) {
                    setCurrentUser(null);
                    setIsLoading(false);
                    return;
                }
                const userData = await fetchUserByEmail(firebaseUser.email!);
                if (userData) {
                    const requireApproval = db.settings.requireSignupApproval !== false;
                    if (userData.approvalStatus === 'approved' || !requireApproval || isBOKUser(userData)) {
                        setCurrentUser(userData);
                        if (isBOKUser(userData)) setAdminMode(false);
                        await update(ref(database, `users/${toSafeId(userData.email!)}`), { isOnline: true, lastActive: Date.now() });
                    } else {
                        await logoutFirebase();
                        setAlertMessage("가입 승인 대기 중입니다.");
                    }
                } else {
                    await logoutFirebase();
                }
            } else {
                setCurrentUser(null);
                setAdminMode(false);
            }
            setIsLoading(false);
        });
        // Initial fetch call moved to after mount to ensure context is ready
        refreshData();
        return () => unsubscribe();
    }, [db.settings.requireSignupApproval]);

    const serverAction = async (action: string, payload: any) => {
        setSimulatedLoading(true);
        try {
            const res = await fetch('https://bank-one-mu.vercel.app/api/game-action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, payload })
            });
            const result = await res.json();
            await refreshData();
            return result;
        } catch (e) {
            console.error(`Server Action Error (${action}):`, e);
            throw e;
        } finally { 
            setSimulatedLoading(false); 
        }
    };

    const login = async (id: string, pass: string, remember = false) => {
        setSimulatedLoading(true);
        try {
            const inputId = id.trim();
            // Use optimized fetch
            let userData = await fetchUserByLoginId(inputId);
            if (!userData && inputId.includes('@')) userData = await fetchUserByEmail(inputId);
            
            // Allow login even if fetch failed initially (Firebase Auth will verify)
            // But we need the email for Firebase Auth
            let actualEmail = userData?.email || inputId;

            const fUser = await loginWithEmail(actualEmail.toLowerCase(), pass);
            if (!fUser.emailVerified) {
                setAlertMessage("이메일 인증이 완료되지 않았습니다.");
                await logoutFirebase();
                return false;
            }

            // Fetch again to be sure we have the latest
            userData = await fetchUserByEmail(fUser.email!);
            
            if (!userData) {
                setAlertMessage("계정 데이터가 존재하지 않습니다.");
                await logoutFirebase();
                return false;
            }

            const requireApproval = db.settings.requireSignupApproval !== false;
            if (userData.approvalStatus !== 'approved' && requireApproval && !isBOKUser(userData)) {
                setAlertMessage("승인 대기 중인 계정입니다.");
                await logoutFirebase();
                return false;
            }

            try {
                const historyStr = localStorage.getItem('sh_login_history');
                const history = historyStr ? JSON.parse(historyStr) : [];
                
                const newEntry = {
                    email: userData.email,
                    name: userData.name,
                    id: userData.id,
                    profilePic: userData.profilePic,
                    pin: userData.pin, 
                    password: btoa(pass), 
                    timestamp: Date.now()
                };

                const filtered = history.filter((h: any) => h.email !== userData.email);
                const newHistory = [newEntry, ...filtered].slice(0, 4); 
                localStorage.setItem('sh_login_history', JSON.stringify(newHistory));
            } catch (e) { console.error("History Save Error", e); }

            setCurrentUser(userData);
            if (remember) localStorage.setItem('sh_user_id', userData.email!);
            await update(ref(database, `users/${toSafeId(userData.email!)}`), { isOnline: true, lastActive: Date.now() });
            
            // Force immediate data refresh
            await refreshData();
            return true;
        } catch (authError: any) {
            setAlertMessage("아이디 또는 비밀번호가 올바르지 않습니다.");
            return false;
        } finally {
            setSimulatedLoading(false);
        }
    };

    const logout = async () => {
        setSimulatedLoading(true);
        if (currentUser) {
            try { await update(ref(database, `users/${toSafeId(currentUser.email!)}`), { isOnline: false }); } catch(e) {}
        }
        await logoutFirebase();
        setCurrentUser(null);
        setAdminMode(false);
        setSimulatedLoading(false);
    };

    const registerUser = async (userData: Partial<User>, password: string) => {
        setSimulatedLoading(true);
        try {
            const fUser = await registerWithAutoRetry(userData.email!.trim().toLowerCase(), password);
            const userEmail = fUser.email!.trim().toLowerCase();
            const safeId = toSafeId(userEmail);
            
            const newUser = { 
                ...userData, 
                id: userData.id || userEmail,
                email: userEmail,
                password: password,
                approvalStatus: userData.approvalStatus || 'pending', 
                balanceKRW: 0, 
                balanceUSD: 0, 
                transactions: [] 
            };
            
            await set(ref(database, `users/${safeId}`), sanitize(newUser));
        } catch (e: any) {
            console.error("registerUser Error:", e);
            throw e;
        } finally {
            setSimulatedLoading(false);
        }
    };

    const updateUser = async (email: string, data: Partial<User>) => {
        const userEmail = email || currentUser?.email;
        if (!userEmail) return;
        const safeId = toSafeId(userEmail);
        await update(ref(database, `users/${safeId}`), sanitize(data));
        
        if (currentUser && currentUser.email === userEmail) {
            setCurrentUser(prev => ({ ...prev!, ...data }));
        }
    };

    const saveDb = async (data: DB) => {
        setSimulatedLoading(true);
        try { 
            await firebaseSaveDb(data); 
            await refreshData(); 
        } finally { 
            setSimulatedLoading(false); 
        }
    };

    const showPinModal = (m: string, e?: string, l: 4|6=4, allowBiometric: boolean = true) => 
        new Promise<string|null>(r => setPinResolver({ resolve: r, message: m, expectedPin: e, pinLength: l, allowBiometric }));
    
    const showConfirm = (m: string) => 
        new Promise<boolean>(r => setConfirmResolver({ resolve: r, message: m }));
    
    const showModal = (m: string) => setAlertMessage(m);
    
    const notify = async (targetUser: string, message: string, isPersistent = false, action: string | null = null, actionData: any = null) => {
        const notifId = `n_${Date.now()}`;
        const newNotif = { 
            id: notifId, 
            message, 
            read: false, 
            date: new Date().toISOString(), 
            isPersistent, 
            type: 'info' as const, 
            timestamp: Date.now(), 
            action: action || null, 
            actionData: actionData || null 
        };
        
        const nativeEnabled = Notification.permission === 'granted';
        if (nativeEnabled) new Notification("성화은행 알림", { body: message });
        else {
            setToasts(prev => [...prev, newNotif]);
            setTimeout(() => setToasts(prev => prev.filter(t => t.id !== notifId)), 4000);
        }

        const sanitizedNotif = sanitize(newNotif);

        if (targetUser === 'ALL') {
            const usersSnap = await get(ref(database, 'users'));
            const users = usersSnap.val() || {};
            const updates: any = {};
            Object.keys(users).forEach(ukey => { updates[`users/${ukey}/notifications/${notifId}`] = sanitizedNotif; });
            await update(ref(database), updates);
        } else {
            const targetKey = Object.keys(db.users).find(k => db.users[k].name === targetUser) || toSafeId(targetUser);
            if (targetKey) await update(ref(database, `users/${targetKey}/notifications/${notifId}`), sanitizedNotif);
        }
    };

    const triggerHaptic = () => { if (navigator.vibrate) navigator.vibrate(50); };
    const loadAssetHistory = async () => { if(currentUser) setCurrentAssetHistory(await assetService.fetchHistory(currentUser.email!)); };

    const requestNotificationPermission = async (mode: 'native' | 'browser' = 'browser') => {
        if (mode === 'native' && 'Notification' in window) await Notification.requestPermission();
    };
    
    const createChat = async (participants: string[], type: 'private'|'group'|'feedback' = 'private', groupName?: string) => {
        const id = await chatService.createChat(participants, type, groupName);
        await refreshData();
        return id;
    };

    const sendMessage = async (chatId: string, text: string, attachment?: ChatAttachment) => {
        const myIdentity = (currentUser?.name === '한국은행' || currentUser?.govtRole === '한국은행장') ? '한국은행' : currentUser!.name;
        const msg: ChatMessage = { id: generateId(), sender: myIdentity, text, timestamp: Date.now(), attachment };
        await chatService.sendMessage(chatId, msg);
    };

    const wait = (type: 'light' | 'heavy') => new Promise<void>(resolve => setTimeout(resolve, type === 'light' ? 500 : 1500));
    
    const requestPolicyChange = async (type: string, data: any, description: string) => {
        const id = generateId();
        const req: PolicyRequest = { id, type: type as any, requester: currentUser!.name, data, description, status: 'pending', requestedAt: new Date().toISOString() };
        await update(ref(database, `policyRequests/${id}`), sanitize(req));
        await refreshData();
    };

    const respondToAuctionInvite = async (from: string, accept: boolean, notifId: string) => {
        if (!currentUser) return;
        const newDb = { ...db };
        if (newDb.auction?.teams?.[from]) {
            const memberIdx = newDb.auction.teams[from].findIndex(m => m.name === currentUser.name);
            if (memberIdx !== -1) {
                if (accept) newDb.auction.teams[from][memberIdx].status = 'accepted';
                else newDb.auction.teams[from].splice(memberIdx, 1);
            }
        }
        const userNotifsRef = ref(database, `users/${toSafeId(currentUser.email!)}/notifications/${notifId}`);
        await set(userNotifsRef, null);
        await saveDb(newDb);
    };

    const updateStock = async (stockId: string, data: Partial<Stock>) => { 
        await update(ref(database, `stocks/${stockId}`), sanitize(data)); 
        await refreshData(); 
    };

    const applyBankruptcy = async () => {
        if (!currentUser) return;
        if (!await showConfirm("정말 파산을 신청하시겠습니까?")) return;
        const pin = await showPinModal("PIN 입력", currentUser.pin!);
        if (pin !== currentUser.pin) return;

        const newDb = { ...db };
        const userKey = toSafeId(currentUser.email!);
        const user = newDb.users[userKey];
        user.balanceKRW = 0;
        user.balanceUSD = 0;
        user.stockHoldings = {};
        await saveDb(newDb);
        setAlertMessage("파산 처리가 완료되었습니다.");
    };
    
    const switchAccount = async (targetEmail: string): Promise<boolean> => {
        setSimulatedLoading(true);
        try {
            if (currentUser?.email === targetEmail) return true;
            
            // Use optimized fetch to ensure no 87MB download
            const userData = await fetchUserByEmail(targetEmail);
            if (userData) { 
                setCurrentUser(userData); 
                setAdminMode(false);
                return true; 
            }
            return false;
        } catch (e) {
            console.error("Switch Account Error:", e);
            return false;
        } finally { 
            setSimulatedLoading(false); 
        }
    };

    const approvePolicyChange = async (id: string) => {
        const req = (await get(ref(database, `policyRequests/${id}`))).val(); 
        if (!req) return;
        const updates: any = {};
        if (req.type === 'standard') updates['settings/standards'] = req.data;
        updates[`policyRequests/${id}/status`] = 'approved';
        await update(ref(database), updates);
        await refreshData();
    };

    const rejectPolicyChange = async (id: string) => {
        await update(ref(database, `policyRequests/${id}`), { status: 'rejected' });
        await refreshData();
    };

    const payTax = async (tax: PendingTax) => {
        if(!currentUser) return;
        if(currentUser.balanceKRW < tax.amount) {
            setAlertMessage("잔액이 부족합니다.");
            return;
        }
        if(!await showConfirm(`₩${tax.amount.toLocaleString()} 세금을 납부하시겠습니까?`)) return;
        
        const newDb = {...db};
        const me = newDb.users[toSafeId(currentUser.email!)];
        if (me) me.balanceKRW -= tax.amount;
        
        const myTaxIdx = (me?.pendingTaxes || []).findIndex(t => t.id === tax.id);
        if(myTaxIdx !== -1 && me?.pendingTaxes) {
            me.pendingTaxes[myTaxIdx].status = 'paid';
        }
        
        await saveDb(newDb);
        setAlertMessage("세금 납부가 완료되었습니다.");
    };

    const dismissTax = async (taxId: string) => {
        if(!currentUser) return;
        const safeId = toSafeId(currentUser.email!);
        const currentTaxes = currentUser.pendingTaxes || [];
        const newTaxes = currentTaxes.filter(t => t.id !== taxId);
        
        await update(ref(database, `users/${safeId}`), { pendingTaxes: newTaxes });
        await refreshData();
    };

    const openChat = (chatId: string) => {
        window.dispatchEvent(new CustomEvent('open-chat', { detail: { chatId } }));
    };

    const submitApplication = async (app: Application) => {
        setDb(prev => ({
            ...prev,
            pendingApplications: { ...prev.pendingApplications, [app.id]: app }
        }));
        await update(ref(database, `pendingApplications/${app.id}`), sanitize(app));
    };

    return (
        <GameContext.Provider value={{
            db, currentUser, isAdminMode, toasts, setAdminMode, login, logout, updateUser, registerUser, isLoading,
            showPinModal, showConfirm, showModal, notify, saveDb, refreshData, 
            loadAllUsers: async () => { const all = await fetchAllUsers(); setDb(p => ({...p, users: all})); },
            serverAction, pinResolver, setPinResolver, confirmResolver, setConfirmResolver, alertMessage, setAlertMessage,
            currentAssetHistory, loadAssetHistory, cachedLinkedUsers, setCachedLinkedUsers, triggerHaptic, 
            isElementPicking, setElementPicking,
            requestNotificationPermission, createChat, sendMessage, clearPaidTax: async () => {}, cachedMarts, setCachedMarts, wait,
            requestPolicyChange, respondToAuctionInvite, updateStock, markChatRead: async () => {}, applyBankruptcy, switchAccount, approvePolicyChange, rejectPolicyChange,
            requestPasswordReset: async (email) => { try { await resetUserPassword(email); return true; } catch(e) { return false; } },
            payTax, dismissTax, openChat, submitApplication
        }}>
            {children}
            {simulatedLoading && (
                <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="flex flex-col items-center gap-4">
                        <Spinner />
                        <p className="animate-pulse text-white font-bold">처리 중...</p>
                    </div>
                </div>
            )}
        </GameContext.Provider>
    );
};