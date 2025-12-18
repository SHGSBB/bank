
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { 
    fetchGlobalData, 
    saveDb as firebaseSaveDb, 
    generateId, 
    chatService, 
    assetService, 
    fetchUser, 
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
import { DB, DEFAULT_DB, User, ToastNotification, AssetHistoryPoint, ChatAttachment, ChatMessage, PolicyRequest, Stock } from "../types";

interface GameContextType {
    db: DB;
    currentUser: User | null;
    isAdminMode: boolean;
    setAdminMode: (val: boolean) => void;
    login: (id: string, pass: string, remember?: boolean) => Promise<boolean>;
    logout: () => Promise<void>;
    updateUser: (name: string, data: Partial<User>) => Promise<void>;
    registerUser: (userData: Partial<User>, password: string) => Promise<void>;
    isLoading: boolean;
    showPinModal: (message: string, expectedPin?: string, length?: 4 | 6, allowBiometric?: boolean) => Promise<string | null>;
    showConfirm: (message: string) => Promise<boolean>;
    showModal: (message: string) => void;
    notify: (targetUser: string, message: string, isPersistent?: boolean, action?: any, actionData?: any) => Promise<void>;
    saveDb: (data: DB) => Promise<void>;
    refreshData: () => Promise<void>;
    loadAllUsers: () => Promise<void>;
    serverAction: (action: string, payload: any) => Promise<any>;
    pinResolver: any; setPinResolver: any; confirmResolver: any; setConfirmResolver: any; alertMessage: string | null; setAlertMessage: (msg: string | null) => void;
    currentAssetHistory: AssetHistoryPoint[]; loadAssetHistory: () => Promise<void>;
    cachedLinkedUsers: any[]; setCachedLinkedUsers: (users: any[]) => void;
    triggerHaptic: () => void;
    isElementPicking: boolean; setElementPicking: (val: boolean) => void;
    requestNotificationPermission: () => Promise<void>;
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

    const refreshData = useCallback(async () => {
        try {
            const data = await fetchGlobalData();
            setDb(prev => ({ ...prev, ...data }));
        } catch(e) { console.error("Global Data Fetch Error:", e); }
    }, []);

    useEffect(() => {
        const unsubscribe = subscribeAuth(async (firebaseUser) => {
            if (firebaseUser) {
                if (!firebaseUser.emailVerified) {
                    setCurrentUser(null);
                    setIsLoading(false);
                    return;
                }
                const userData = await fetchUserByEmail(firebaseUser.email!);
                if (userData && userData.approvalStatus === 'approved') {
                    setCurrentUser(userData);
                    await update(ref(database, `users/${toSafeId(userData.name)}`), { isOnline: true, lastActive: Date.now() });
                } else {
                    await logoutFirebase();
                }
            } else {
                setCurrentUser(null);
            }
            setIsLoading(false);
        });
        refreshData();
        return () => unsubscribe();
    }, [refreshData]);

    const serverAction = async (action: string, payload: any) => {
        setSimulatedLoading(true);
        try {
            const res = await fetch('https://bank-one-mu.vercel.app/api/game-action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, payload })
            });
            const result = await res.json();
            if (action !== 'fetch_linked_accounts' && action !== 'get_user_email') {
                await refreshData();
            }
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
            if (!inputId) {
                setAlertMessage("아이디를 입력해주세요.");
                return false;
            }

            // 1. Try to find user in DB to get their actual email
            let userData = await fetchUserByLoginId(inputId);
            
            // If not found and input looks like email, try fetching by email directly
            if (!userData && inputId.includes('@')) {
                userData = await fetchUserByEmail(inputId);
            }

            let actualEmail = inputId;
            if (userData && userData.email) {
                actualEmail = userData.email;
            } else {
                // Not found locally. Try server-side lookup (which handles index-less filtering)
                try {
                    const res = await serverAction('get_user_email', { id: inputId });
                    if (res && res.email) {
                        actualEmail = res.email;
                        userData = await fetchUserByEmail(actualEmail);
                    } else {
                        // Fallback: If it's not an email format and we can't resolve it, it's definitely not a valid user.
                        if (!inputId.includes('@')) {
                            setAlertMessage("존재하지 않는 사용자 아이디입니다.");
                            return false;
                        }
                    }
                } catch (e) {
                    console.error("Resolution error:", e);
                    // Continue with inputId if it looks like an email, otherwise fail
                    if (!inputId.includes('@')) {
                        setAlertMessage("사용자 정보를 확인하는 중 오류가 발생했습니다.");
                        return false;
                    }
                }
            }

            // Double check: if after all resolution actualEmail is still not an email, Firebase will throw auth/invalid-credential
            if (!actualEmail.includes('@')) {
                setAlertMessage("가입되지 않은 정보이거나 아이디 형식이 올바르지 않습니다.");
                return false;
            }

            // 2. Firebase Auth login with Resolved Email
            try {
                const fUser = await loginWithEmail(actualEmail, pass);
                
                if (!fUser.emailVerified) {
                    setAlertMessage("이메일 인증이 완료되지 않았습니다. 메일함을 확인해주세요.");
                    await logoutFirebase();
                    return false;
                }

                // Refresh userData in case resolution was partial
                if (!userData) {
                    userData = await fetchUserByEmail(fUser.email!);
                }

                if (!userData) {
                    setAlertMessage("인증은 성공했으나 사용자 데이터가 없습니다. 관리자에게 문의하세요.");
                    await logoutFirebase();
                    return false;
                }

                if (userData.approvalStatus !== 'approved') {
                    setAlertMessage("승인 대기 중이거나 비활성화된 계정입니다.");
                    await logoutFirebase();
                    return false;
                }

                setCurrentUser(userData);
                if (remember) localStorage.setItem('sh_user_id', userData.name);
                await update(ref(database, `users/${toSafeId(userData.name)}`), { isOnline: true, lastActive: Date.now() });
                
                return true;
            } catch (authError: any) {
                console.error("Firebase Auth Error:", authError.code);
                // auth/invalid-credential is the generic code for both wrong password and wrong email in v10+
                if (authError.code === 'auth/invalid-credential' || authError.code === 'auth/wrong-password' || authError.code === 'auth/user-not-found' || authError.code === 'auth/invalid-email') {
                    setAlertMessage("아이디 또는 비밀번호가 올바르지 않습니다.");
                } else if (authError.code === 'auth/too-many-requests') {
                    setAlertMessage("너무 많은 로그인 시도가 감지되었습니다. 잠시 후 다시 시도하세요.");
                } else {
                    setAlertMessage(`로그인 실패: ${authError.message}`);
                }
                return false;
            }
        } finally {
            setSimulatedLoading(false);
        }
    };

    const requestPasswordReset = async (email: string) => {
        try {
            await resetUserPassword(email.trim());
            setAlertMessage("비밀번호 재설정 이메일을 보냈습니다.");
        } catch (e) {
            setAlertMessage("이메일 전송 실패: 가입된 주소인지 확인해주세요.");
        }
    };

    const logout = async () => {
        setSimulatedLoading(true);
        if (currentUser) {
            try {
                await update(ref(database, `users/${toSafeId(currentUser.name)}`), { isOnline: false });
            } catch(e) {}
        }
        await logoutFirebase();
        setCurrentUser(null);
        setSimulatedLoading(false);
    };

    const registerUser = async (userData: Partial<User>, password: string) => {
        setSimulatedLoading(true);
        try {
            const fUser = await registerWithAutoRetry(userData.email!.trim(), password);
            const userId = userData.id || userData.email!;
            const safeId = toSafeId(userData.name || userId);
            
            const newUser = { 
                ...userData, 
                id: userId.trim(),
                email: fUser.email!, 
                approvalStatus: userData.approvalStatus || 'pending', 
                balanceKRW: 0, 
                balanceUSD: 0, 
                transactions: [] 
            };
            
            await set(ref(database, `users/${safeId}`), newUser);
            // Alert message is handled by the component
        } catch (e: any) {
            console.error("registerUser Error:", e);
            throw e;
        } finally {
            setSimulatedLoading(false);
        }
    };

    const updateUser = async (name: string, data: Partial<User>) => {
        await update(ref(database, `users/${toSafeId(name)}`), JSON.parse(JSON.stringify(data)));
        await refreshData();
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
    
    const notify = async (targetUser: string, message: string, isPersistent = false, action?: any, actionData?: any) => {
        const notifId = `n_${Date.now()}`;
        const newNotif = { id: notifId, message, read: false, date: new Date().toISOString(), isPersistent, type: 'info', timestamp: Date.now(), action, actionData };
        if (targetUser === 'ALL') {
            const usersSnap = await get(ref(database, 'users'));
            const users = usersSnap.val() || {};
            const updates: any = {};
            Object.keys(users).forEach(uname => { updates[`users/${toSafeId(uname)}/notifications/${notifId}`] = newNotif; });
            await update(ref(database), updates);
        } else {
            await update(ref(database, `users/${toSafeId(targetUser)}/notifications/${notifId}`), newNotif);
        }
    };

    const triggerHaptic = () => { if (navigator.vibrate) navigator.vibrate(50); };
    const loadAssetHistory = async () => { if(currentUser) setCurrentAssetHistory(await assetService.fetchHistory(currentUser.name)); };

    const requestNotificationPermission = async () => { if ('Notification' in window) await Notification.requestPermission(); };
    
    const createChat = async (participants: string[], type: 'private'|'group'|'feedback' = 'private', groupName?: string) => {
        const id = await chatService.createChat(participants, type, groupName);
        await refreshData();
        return id;
    };

    const sendMessage = async (chatId: string, text: string, attachment?: ChatAttachment) => {
        const msg: ChatMessage = { id: generateId(), sender: currentUser!.name, text, timestamp: Date.now(), attachment };
        await chatService.sendMessage(chatId, msg);
    };

    const clearPaidTax = async () => { /* Logic already implemented in TaxTab */ };
    const wait = (type: 'light' | 'heavy') => new Promise<void>(resolve => setTimeout(resolve, type === 'light' ? 500 : 1500));
    
    const requestPolicyChange = async (type: string, data: any, description: string) => {
        const id = generateId();
        const req: PolicyRequest = { id, type: type as any, requester: currentUser!.name, data, description, status: 'pending', requestedAt: new Date().toISOString() };
        await update(ref(database, `policyRequests/${id}`), JSON.parse(JSON.stringify(req)));
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
        // Remove Notification
        const userNotifsRef = ref(database, `users/${toSafeId(currentUser.name)}/notifications/${notifId}`);
        await set(userNotifsRef, null);
        await saveDb(newDb);
    };

    const updateStock = async (stockId: string, data: Partial<Stock>) => { 
        await update(ref(database, `stocks/${stockId}`), JSON.parse(JSON.stringify(data))); 
        await refreshData(); 
    };

    const markChatRead = async (chatId: string) => {};
    const applyBankruptcy = async () => {
        if (!currentUser) return;
        if (!await showConfirm("정말 파산을 신청하시겠습니까? 모든 자산(KRW, USD, 주식, 예금, 부동산)이 초기화됩니다.")) return;
        const pin = await showPinModal("파산 확정을 위해 PIN을 입력하세요.", currentUser.pin!);
        if (pin !== currentUser.pin) return;

        const newDb = { ...db };
        const user = newDb.users[currentUser.name];
        user.balanceKRW = 0;
        user.balanceUSD = 0;
        user.stockHoldings = {};
        user.transactions = [...(user.transactions || []), { 
            id: Date.now(), type: 'seize', amount: 0, currency: 'KRW', description: "파산 처리 (자산 초기화)", date: new Date().toISOString() 
        }];
        
        // Clear real estate ownership
        newDb.realEstate.grid = (newDb.realEstate.grid || []).map(p => {
            if (p.owner === currentUser.name) return { ...p, owner: null, tenant: null };
            return p;
        });

        await saveDb(newDb);
        setAlertMessage("파산 처리가 완료되었습니다.");
    };
    
    const switchAccount = async (targetName: string): Promise<boolean> => {
        setSimulatedLoading(true);
        try {
            const userData = await fetchUser(targetName);
            if (userData && userData.approvalStatus === 'approved') { 
                setCurrentUser(userData); 
                return true; 
            }
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

    return (
        <GameContext.Provider value={{
            db, currentUser, isAdminMode, setAdminMode, login, logout, updateUser, registerUser, isLoading,
            showPinModal, showConfirm, showModal, notify, saveDb, refreshData, 
            loadAllUsers: async () => { const all = await fetchAllUsers(); setDb(p => ({...p, users: all})); },
            serverAction, pinResolver, setPinResolver, confirmResolver, setConfirmResolver, alertMessage, setAlertMessage,
            currentAssetHistory, loadAssetHistory, cachedLinkedUsers, setCachedLinkedUsers, triggerHaptic, toasts: [], 
            isElementPicking, setElementPicking,
            requestNotificationPermission, createChat, sendMessage, clearPaidTax, cachedMarts, setCachedMarts, wait,
            requestPolicyChange, respondToAuctionInvite, updateStock, markChatRead, applyBankruptcy, switchAccount, approvePolicyChange, rejectPolicyChange,
            requestPasswordReset
        }}>
            {children}
            {simulatedLoading && (
                <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="flex flex-col items-center gap-4">
                        <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-white"></div>
                        <p className="animate-pulse text-white font-bold">처리 중...</p>
                    </div>
                </div>
            )}
        </GameContext.Provider>
    );
};
