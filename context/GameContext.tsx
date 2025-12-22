
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { 
    fetchEssentials, 
    saveDb as firebaseSaveDb, 
    generateId, 
    chatService, 
    assetService, 
    fetchUser, 
    loginWithEmail, 
    logoutFirebase, 
    registerWithAutoRetry, 
    subscribeAuth, 
    fetchUserByEmail,
    resetUserPassword,
    updateUserEmail,
    database,
    toSafeId,
    fetchUserByLoginId
} from "../services/firebase";
import { update, ref, set, get, remove } from "firebase/database";
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
    updateUser: (key: string, data: Partial<User>) => Promise<void>;
    registerUser: (userData: Partial<User>, password: string) => Promise<void>;
    isLoading: boolean;
    showPinModal: (message: string, expectedPin?: string, length?: 4 | 6, allowBiometric?: boolean) => Promise<string | null>;
    showConfirm: (message: string) => Promise<boolean>;
    showModal: (message: React.ReactNode) => void;
    notify: (targetUser: string, message: string, isPersistent?: boolean, action?: string | null, actionData?: any) => Promise<void>;
    saveDb: (data: DB) => Promise<void>;
    refreshData: () => Promise<void>;
    loadAllUsers: () => Promise<void>;
    serverAction: (action: string, payload: any) => Promise<any>;
    pinResolver: any; setPinResolver: any; confirmResolver: any; setConfirmResolver: any; alertMessage: React.ReactNode | null; setAlertMessage: (msg: React.ReactNode | null) => void;
    currentAssetHistory: AssetHistoryPoint[]; loadAssetHistory: () => Promise<void>;
    cachedLinkedUsers: any[]; setCachedLinkedUsers: (users: any[]) => void;
    triggerHaptic: () => void;
    isElementPicking: boolean; setElementPicking: (val: boolean) => void;
    requestNotificationPermission: (mode?: 'native' | 'browser') => Promise<void>;
    createChat: (participants: string[], type?: 'private'|'group'|'feedback'|'auction', groupName?: string) => Promise<string>;
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
    requestPasswordReset: (email: string) => Promise<boolean>;
    changeUserEmail: (newEmail: string) => Promise<void>;
    payTax: (tax: PendingTax) => Promise<void>;
    dismissTax: (taxId: string) => Promise<void>;
    setupPin: (pin: string) => Promise<void>;
    openChat: () => void;
    findUserKeyByName: (name: string) => string | undefined;
    activeTab: string;
    setActiveTab: (tab: string) => void;
    highQualityGraphics: boolean;
    setHighQualityGraphics: (val: boolean) => void;
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
    const [alertMessage, setAlertMessage] = useState<React.ReactNode | null>(null);
    const [cachedLinkedUsers, setCachedLinkedUsers] = useState<any[]>([]);
    const [isElementPicking, setElementPicking] = useState(false);
    const [cachedMarts, setCachedMarts] = useState<User[]>([]);
    const [toasts, setToasts] = useState<ToastNotification[]>([]);
    
    // Global Navigation State for Mobile Tab Bar Sync
    const [activeTab, setActiveTab] = useState<string>('이체');
    const [highQualityGraphics, setHighQualityGraphics] = useState(true);

    const serverAction = async (action: string, payload: any) => {
        setSimulatedLoading(true);
        try {
            const res = await fetch('https://bank-one-mu.vercel.app/api/game-action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, payload })
            });
            const result = await res.json();
            return result;
        } catch (e) {
            console.error(`Server Action Error (${action}):`, e);
            throw e;
        } finally { 
            setSimulatedLoading(false); 
        }
    };

    const refreshData = useCallback(async () => {
        try {
            const essentials = await fetchEssentials();
            setDb(prev => ({ ...prev, ...essentials }));
            
            if (currentUser) {
                const uid = currentUser.id || currentUser.email!;
                const userData = await serverAction('fetch_my_lite_info', { userId: uid });
                if (userData && userData.id) {
                    // Ensure pendingTaxes is array
                    if (userData.pendingTaxes && !Array.isArray(userData.pendingTaxes)) {
                        userData.pendingTaxes = Object.values(userData.pendingTaxes);
                    }
                    setCurrentUser(prev => {
                        // Merge logic: prefer new data but keep existing structure if missing
                        if (!prev) return userData;
                        return { ...prev, ...userData };
                    });
                }
            }
        } catch(e) { console.error("Data Fetch Error:", e); }
    }, [currentUser?.id, currentUser?.email]);

    // Auction Chat Trigger
    useEffect(() => {
        if (db.auction?.isActive && db.auction?.status === 'active') {
            window.dispatchEvent(new CustomEvent('open-chat'));
        }
    }, [db.auction?.status, db.auction?.id]);

    const isBOKUser = (user: User | null) => {
        if (!user) return false;
        return user.name === '한국은행' || user.govtRole === '한국은행장' || user.customJob === '한국은행장';
    };

    // Role Auto-Migration Logic
    useEffect(() => {
        if (currentUser) {
            const updates: Partial<User> = {};
            let needsUpdate = false;

            if (isBOKUser(currentUser) && currentUser.type !== 'admin') {
                updates.type = 'admin';
                updates.subType = 'govt'; 
                needsUpdate = true;
            }

            if (currentUser.govtRole) {
                const role = currentUser.govtRole;
                if (['판사', '검사', '국회의원', '대통령', '법무부장관'].includes(role) && currentUser.type !== 'government' && currentUser.type !== 'admin') {
                    updates.type = 'government';
                    needsUpdate = true;
                }
            }

            if (needsUpdate) {
                updateUser(currentUser.name, updates);
                setCurrentUser(prev => prev ? { ...prev, ...updates } : null);
            }
        }
    }, [currentUser?.name, currentUser?.govtRole, currentUser?.type]);

    // Main Auth Listener & Loop Prevention
    useEffect(() => {
        if (currentUser?.email) {
            refreshData();
        }
    }, [currentUser?.email, currentUser?.id]); 

    // Initial Auth
    useEffect(() => {
        let isMount = true;
        
        const initAuth = async () => {
            const switchedId = localStorage.getItem('sh_user_id');
            if (switchedId) {
                const switchedUser = await fetchUserByLoginId(switchedId);
                if (switchedUser && isMount) {
                    if (switchedUser.pendingTaxes && !Array.isArray(switchedUser.pendingTaxes)) {
                        switchedUser.pendingTaxes = Object.values(switchedUser.pendingTaxes);
                    }
                    setCurrentUser(switchedUser);
                    if (isBOKUser(switchedUser)) setAdminMode(false);
                    const userKey = toSafeId(switchedUser.id || switchedUser.email!);
                    await update(ref(database, `users/${userKey}`), { isOnline: true, lastActive: Date.now() });
                    setIsLoading(false);
                    return; 
                } else if (!switchedUser && isMount) {
                    localStorage.removeItem('sh_user_id');
                }
            }

            const unsubscribe = subscribeAuth(async (firebaseUser) => {
                if (!isMount) return;
                if (localStorage.getItem('sh_user_id')) return;

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
                            if (userData.pendingTaxes && !Array.isArray(userData.pendingTaxes)) {
                                userData.pendingTaxes = Object.values(userData.pendingTaxes);
                            }
                            setCurrentUser(userData);
                            localStorage.setItem('sh_user_id', userData.id || userData.email!);
                            
                            if (isBOKUser(userData)) setAdminMode(false);
                            const userKey = toSafeId(userData.id || userData.email!);
                            await update(ref(database, `users/${userKey}`), { isOnline: true, lastActive: Date.now() });
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
            return unsubscribe;
        };

        serverAction('fetch_initial_data', {}).then((data) => {
            if(isMount) setDb(prev => ({ ...prev, ...data }));
            initAuth();
        }).catch(() => {
            fetchEssentials().then((data) => {
                if(isMount) setDb(prev => ({ ...prev, ...data }));
                initAuth();
            });
        });

        return () => { isMount = false; };
    }, []);

    const findUserKeyByName = (name: string): string | undefined => {
        const entry = Object.entries(db.users).find(([k, u]) => (u as User).name === name);
        return entry ? entry[0] : undefined; 
    };

    const loadAllUsers = async () => {
        setSimulatedLoading(true);
        try {
            const res = await serverAction('fetch_all_users_light', {});
            if (res && res.users) {
                setDb(prev => ({ ...prev, users: res.users }));
            } else {
                throw new Error("Server action returned empty user list");
            }
        } catch(e) {
            console.error("Admin user load failed:", e);
            setAlertMessage("사용자 목록을 불러올 수 없습니다. 잠시 후 다시 시도해주세요.");
        } finally {
            setSimulatedLoading(false);
        }
    };

    const login = async (id: string, pass: string, remember = false) => {
        setSimulatedLoading(true);
        try {
            const inputId = id.trim();
            let userData = await fetchUserByLoginId(inputId);
            
            if (!userData) {
                setAlertMessage("존재하지 않는 아이디입니다.");
                return false;
            }

            let actualEmail = userData.email;
            if (!actualEmail) {
                setAlertMessage("계정 데이터 오류: 이메일 정보가 없습니다.");
                return false;
            }

            await loginWithEmail(actualEmail, pass);
            
            // Check Approval Status explicitly on login
            const requireApproval = db.settings.requireSignupApproval !== false;
            if (requireApproval && userData.approvalStatus !== 'approved' && !isBOKUser(userData)) {
                await logoutFirebase();
                setAlertMessage("가입 승인 대기 중입니다. 관리자에게 문의하세요.");
                return false;
            }

            // PIN Setup Logic
            if (!userData.pin) {
                setSimulatedLoading(false); // Hide loading to show modal
                // Allow user to choose length, default to 6 in the call but UI handles toggle if expectedPin is undefined
                const newPin = await showPinModal("보안을 위해 PIN(간편비밀번호)을 설정해주세요.", undefined, 6, false);
                if (!newPin) {
                    await logoutFirebase();
                    setAlertMessage("PIN 설정을 취소하여 로그인이 중단되었습니다.");
                    return false;
                }
                const userKey = toSafeId(userData.id || userData.email!);
                await update(ref(database, `users/${userKey}`), { pin: newPin, pinLength: newPin.length });
                userData.pin = newPin; // Update local data
                userData.pinLength = newPin.length;
                setSimulatedLoading(true); // Resume loading state if needed
            }

            const userId = userData.id || userData.email!;
            localStorage.setItem('sh_user_id', userId);
            setCurrentUser(userData);

            try {
                const historyStr = localStorage.getItem('sh_login_history');
                const history = historyStr ? JSON.parse(historyStr) : [];
                const newEntry = {
                    email: userData.email, name: userData.name, id: userData.id, 
                    profilePic: (userData.profilePic && userData.profilePic.length < 500) ? userData.profilePic : null, 
                    timestamp: Date.now()
                };
                const filtered = history.filter((h: any) => h.id !== userData!.id); 
                const newHistory = [newEntry, ...filtered].slice(0, 4); 
                localStorage.setItem('sh_login_history', JSON.stringify(newHistory));
            } catch (e) { }

            return true;
        } catch (authError: any) {
            if (authError.code === 'auth/invalid-credential' || authError.code === 'auth/wrong-password') {
                setAlertMessage("비밀번호가 일치하지 않습니다.");
            } else {
                setAlertMessage("로그인 오류: " + authError.message);
            }
            return false;
        } finally {
            setSimulatedLoading(false);
        }
    };

    const logout = async () => {
        setSimulatedLoading(true);
        if (currentUser) {
            try {
                const userKey = toSafeId(currentUser.id || currentUser.email!);
                await update(ref(database, `users/${userKey}`), { isOnline: false });
            } catch(e) {}
        }
        
        localStorage.removeItem('sh_user_id');
        
        try {
            await logoutFirebase();
        } catch(e) {
            console.warn("Firebase logout failed, possibly already logged out", e);
        }
        
        setCurrentUser(null);
        setAdminMode(false);
        setSimulatedLoading(false);
        window.location.reload();
    };

    const registerUser = async (userData: Partial<User>, password: string) => {
        setSimulatedLoading(true);
        try {
            const fUser = await registerWithAutoRetry(userData.email!.trim().toLowerCase(), password);
            const userEmail = fUser.email!.toLowerCase();
            const dbKey = toSafeId(userData.id!.trim()); 
            
            const isKoreaBank = userData.name === '한국은행';
            const initialBalance = isKoreaBank ? 1000000000000000 : 0;
            const finalType = isKoreaBank ? 'admin' : (userData.type || 'citizen');
            
            // Check if approval is required (default true)
            const requireApproval = db.settings.requireSignupApproval !== false;
            // If approval NOT required, approve immediately
            const approvalStatus = (!requireApproval || isKoreaBank || userData.approvalStatus === 'approved') ? 'approved' : 'pending';

            const newUser: User = {
                id: userData.id!.trim(), 
                email: userEmail,
                name: userData.name || '',
                password: password, 
                type: finalType,
                subType: userData.subType || 'personal',
                govtRole: userData.govtRole || '',
                govtBranch: userData.govtBranch || [],
                approvalStatus,
                balanceKRW: initialBalance,
                balanceUSD: 0,
                birthDate: userData.birthDate || '',
                phoneNumber: userData.phoneNumber || '',
                nickname: userData.nickname || '',
                customJob: userData.customJob || '',
                statusMessage: userData.statusMessage || '',
                profilePic: userData.profilePic || null,
                gender: userData.gender || 'male',
                idCard: {
                    issueDate: new Date().toLocaleDateString('ko-KR'),
                    address: '신규 등록',
                    residentNumber: userData.birthDate ? `${userData.birthDate}-*******` : undefined
                },
                preferences: {
                    theme: 'system', isEasyMode: false, skipPinForCommonActions: false, vibration: true, assetDisplayMode: 'full', biometricEnabled: false, saveLoginHistory: true, use2FA: false
                },
                linkedAccounts: [], transactions: [], notifications: [], pendingTaxes: [], loans: [], stockHoldings: {}, ledger: {}, autoTransfers: {}, isOnline: true, lastActive: Date.now(), failedLoginAttempts: 0
            };
            
            await set(ref(database, `users/${dbKey}`), sanitize(newUser));
        } catch (e: any) {
            console.error("registerUser Error:", e);
            throw e;
        } finally {
            setSimulatedLoading(false);
        }
    };

    const updateUser = async (key: string, data: Partial<User>) => {
        const targetKey = key || currentUser?.id || currentUser?.email;
        if (!targetKey) return;
        const safeKey = toSafeId(targetKey);
        
        // Optimistic UI Update: If updating current user, update local state immediately
        if (currentUser && (targetKey === currentUser.id || targetKey === currentUser.email)) {
            setCurrentUser(prev => {
                if (!prev) return null;
                // Deep merge preferences if present
                if (data.preferences) {
                    return { ...prev, ...data, preferences: { ...prev.preferences, ...data.preferences } };
                }
                return { ...prev, ...data };
            });
        }

        try {
            await update(ref(database, `users/${safeKey}`), sanitize(data));
        } catch (e) {
            console.error("DB Update failed", e);
        }
    };

    const setupPin = async (pin: string) => {
        if (!currentUser) return;
        await updateUser(currentUser.id || currentUser.email!, { pin, pinLength: pin.length as any });
        setAlertMessage("PIN이 등록되었습니다. 이제 이 번호로 인증할 수 있습니다.");
    };

    const saveDb = async (data: DB) => {
        setSimulatedLoading(true);
        try { await firebaseSaveDb(data); await refreshData(); } finally { setSimulatedLoading(false); }
    };

    const showPinModal = (m: string, e?: string, l: 4|6=4, allowBiometric: boolean = true) => new Promise<string|null>(r => setPinResolver({ resolve: r, message: m, expectedPin: e, pinLength: l, allowBiometric }));
    const showConfirm = (m: string) => new Promise<boolean>(r => setConfirmResolver({ resolve: r, message: m }));
    const showModal = (m: React.ReactNode) => setAlertMessage(m);
    
    const notify = async (targetUser: string, message: string, isPersistent = false, action: string | null = null, actionData: any = null) => {
        const notifId = `n_${Date.now()}`;
        const newNotif = { id: notifId, message, read: false, date: new Date().toISOString(), isPersistent, type: 'info' as const, timestamp: Date.now(), action: action || null, actionData: actionData || null };
        setToasts(prev => [...prev, newNotif]);
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== notifId)), 4000);
        const sanitizedNotif = sanitize(newNotif);
        if (targetUser === 'ALL') {
            const usersSnap = await get(ref(database, 'users'));
            const users = usersSnap.val() || {};
            const updates: any = {};
            Object.keys(users).forEach(ukey => { updates[`users/${ukey}/notifications/${notifId}`] = sanitizedNotif; });
            await update(ref(database), updates);
        } else {
            let finalKey = toSafeId(targetUser);
            const check = await get(ref(database, `users/${finalKey}`));
            if (!check.exists()) {
                 const all = await fetchUserByLoginId(targetUser);
                 if (all) finalKey = toSafeId(all.id || all.email!);
            }
            await update(ref(database, `users/${finalKey}/notifications/${notifId}`), sanitizedNotif);
        }
    };

    const triggerHaptic = () => { if (navigator.vibrate) navigator.vibrate(50); };
    const loadAssetHistory = async () => { if(currentUser) setCurrentAssetHistory(await assetService.fetchHistory(currentUser.id || currentUser.email!)); };
    
    const requestNotificationPermission = async (mode: 'native' | 'browser' = 'browser') => { 
        if (mode === 'native') {
            if (!('Notification' in window)) {
                setAlertMessage("이 브라우저는 알림을 지원하지 않습니다.");
                return;
            }
            
            try {
                const permission = await Notification.requestPermission();
                if (permission === 'granted') {
                    setAlertMessage("알림 권한이 허용되었습니다.");
                } else {
                    setAlertMessage("알림 권한이 거부되었습니다. 브라우저 설정에서 확인해주세요.");
                }
            } catch(e) {
                console.error(e);
            }
        }
    };
    
    const openChat = () => {
        window.dispatchEvent(new CustomEvent('open-chat'));
    };

    const createChat = async (participants: string[], type: 'private'|'group'|'feedback'|'auction' = 'private', groupName?: string) => {
        const id = await chatService.createChat(participants, type, groupName);
        return id;
    };

    const sendMessage = async (chatId: string, text: string, attachment?: ChatAttachment) => {
        const myIdentity = (currentUser?.name === '한국은행' || currentUser?.govtRole === '한국은행장') ? '한국은행' : currentUser!.name;
        const msg: ChatMessage = { id: generateId(), sender: myIdentity, text, timestamp: Date.now(), attachment };
        await chatService.sendMessage(chatId, msg);
        
        if (attachment?.type === 'application' || attachment?.type === 'proposal') {
            openChat();
        }
    };

    const wait = (type: 'light' | 'heavy') => new Promise<void>(resolve => setTimeout(resolve, type === 'light' ? 500 : 1500));
    
    const requestPolicyChange = async (type: string, data: any, description: string) => {
        const id = generateId();
        const req: PolicyRequest = { id, type: type as any, requester: currentUser!.name, data, description, status: 'pending', requestedAt: new Date().toISOString() };
        await update(ref(database, `policyRequests/${id}`), sanitize(req));
        await refreshData();
        const prez = (Object.values(db.users) as User[]).find(u => u.govtRole === '대통령');
        if (prez) notify(prez.name, `[정책] ${description} 승인 요청이 도착했습니다.`, true);
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
        const userKey = toSafeId(currentUser.id || currentUser.email!);
        const userNotifsRef = ref(database, `users/${userKey}/notifications/${notifId}`);
        await set(userNotifsRef, null);
        await saveDb(newDb);
    };

    const updateStock = async (stockId: string, data: Partial<Stock>) => { await update(ref(database, `stocks/${stockId}`), sanitize(data)); await refreshData(); };
    const markChatRead = async (chatId: string) => { /* Impl */ };

    const applyBankruptcy = async () => {
        if (!currentUser) return;
        if (!await showConfirm("정말 파산을 신청하시겠습니까?")) return;
        const pin = await showPinModal("PIN 입력", currentUser.pin!);
        if (pin !== currentUser.pin) return;
        const newDb = { ...db };
        const userKey = toSafeId(currentUser.id || currentUser.email!);
        const user = newDb.users[userKey];
        user.balanceKRW = 0; user.balanceUSD = 0; user.stockHoldings = {};
        await saveDb(newDb);
        setAlertMessage("파산 처리가 완료되었습니다.");
    };
    
    const switchAccount = async (targetEmail: string): Promise<boolean> => {
        setSimulatedLoading(true);
        try {
            const userData = await fetchUserByEmail(targetEmail);
            if (userData) { 
                localStorage.setItem('sh_user_id', userData.id || userData.email!);
                // Critical fix: Wait for localStorage to be reliably set before reloading
                await new Promise(resolve => setTimeout(resolve, 100));
                window.location.reload();
                return true; 
            }
            return false;
        } catch(e) {
            setAlertMessage("계전 전환 실패");
            return false;
        } finally { 
            // Don't disable loading here if successful, as reload happens
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
        if (req.requester) notify(req.requester, `[정책] ${req.description} 승인되었습니다.`, true);
    };

    const rejectPolicyChange = async (id: string) => { 
        await update(ref(database, `policyRequests/${id}`), { status: 'rejected' }); 
        await refreshData(); 
    };

    const payTax = async (tax: PendingTax) => {
        if(!currentUser) return;
        if(currentUser.balanceKRW < tax.amount) { setAlertMessage("잔액이 부족합니다."); return; }
        if(!await showConfirm(`₩${tax.amount.toLocaleString()} 세금을 납부하시겠습니까?`)) return;
        const newDb = {...db};
        const bank = (Object.values(newDb.users) as User[]).find(u => u.name === '한국은행');
        const userKey = toSafeId(currentUser.id || currentUser.email!);
        const me = newDb.users[userKey];
        
        if (bank) bank.balanceKRW += tax.amount;
        me.balanceKRW -= tax.amount;
        
        // Ensure pendingTaxes is array
        if (!Array.isArray(me.pendingTaxes)) {
            // @ts-ignore - Handle legacy object structure if present
            me.pendingTaxes = me.pendingTaxes ? Object.values(me.pendingTaxes) : [];
        }

        const myTaxIdx = (me.pendingTaxes || []).findIndex(t => t.id === tax.id);
        if(myTaxIdx !== -1 && me.pendingTaxes) me.pendingTaxes[myTaxIdx].status = 'paid';
        
        const date = new Date().toISOString();
        me.transactions = [...(me.transactions||[]), { id: Date.now(), type: 'tax', amount: -tax.amount, currency: 'KRW', description: `${tax.type} 납부`, date }];
        if (bank) bank.transactions = [...(bank.transactions||[]), { id: Date.now(), type: 'income', amount: tax.amount, currency: 'KRW', description: `${me.name} ${tax.type} 납부`, date }];
        
        await saveDb(newDb);
        setAlertMessage("세금 납부가 완료되었습니다.");
    };

    const dismissTax = async (taxId: string) => {
        if(!currentUser) return;
        const userKey = toSafeId(currentUser.id || currentUser.email!);
        
        // Ensure array
        let currentTaxes = currentUser.pendingTaxes || [];
        if (!Array.isArray(currentTaxes)) currentTaxes = Object.values(currentTaxes);

        const newTaxes = currentTaxes.filter(t => t.id !== taxId);
        await update(ref(database, `users/${userKey}`), { pendingTaxes: newTaxes });
        
        setCurrentUser(prev => prev ? { ...prev, pendingTaxes: newTaxes } : null);
    };

    const changeUserEmail = async (newEmail: string) => {
        if (!currentUser || !currentUser.email) return;
        setSimulatedLoading(true);
        try {
            await updateUserEmail(newEmail);
            
            const oldKey = toSafeId(currentUser.email);
            const newKey = toSafeId(newEmail);
            
            if (oldKey !== newKey) {
                const oldDataSnap = await get(ref(database, `users/${oldKey}`));
                if (oldDataSnap.exists()) {
                    const userData = oldDataSnap.val();
                    userData.email = newEmail; 
                    
                    await set(ref(database, `users/${newKey}`), userData);
                    await remove(ref(database, `users/${oldKey}`));
                    
                    setCurrentUser({ ...currentUser, email: newEmail });
                    localStorage.setItem('sh_user_id', currentUser.id || newEmail); 
                }
            }
            
            setAlertMessage("이메일 변경 인증 메일을 보냈습니다. 인증 후 변경이 완료됩니다.");
        } catch (e: any) {
            console.error(e);
            setAlertMessage("이메일 변경 실패: " + e.message);
        } finally {
            setSimulatedLoading(false);
        }
    };

    return (
        <GameContext.Provider value={{
            db, currentUser, isAdminMode, toasts, setAdminMode, login, logout, updateUser, registerUser, isLoading,
            showPinModal, showConfirm, showModal, notify, saveDb, refreshData, loadAllUsers,
            serverAction, pinResolver, setPinResolver, confirmResolver, setConfirmResolver, alertMessage, setAlertMessage,
            currentAssetHistory, loadAssetHistory, cachedLinkedUsers, setCachedLinkedUsers, triggerHaptic, 
            isElementPicking, setElementPicking,
            requestNotificationPermission, createChat, sendMessage, clearPaidTax: async () => {}, cachedMarts, setCachedMarts, wait,
            requestPolicyChange, respondToAuctionInvite, updateStock, markChatRead, applyBankruptcy, switchAccount, approvePolicyChange, rejectPolicyChange,
            requestPasswordReset: async (email) => { try { await resetUserPassword(email); return true; } catch(e) { return false; } },
            changeUserEmail,
            payTax, dismissTax, setupPin, openChat, findUserKeyByName,
            activeTab, setActiveTab, highQualityGraphics, setHighQualityGraphics
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
