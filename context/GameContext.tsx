
import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
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
import { update, ref, set, get, remove, onValue, off } from "firebase/database";
import { DB, DEFAULT_DB, User, ToastNotification, AssetHistoryPoint, ChatAttachment, ChatMessage, PolicyRequest, Stock, Application, PendingTax } from "../types";
import { Spinner, PinModal, ToastContainer } from "../components/Shared";

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
    createSubAccount: (parentUser: User, subData: Partial<User>) => Promise<void>;
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
    isScreenLocked: boolean;
    unlockScreen: () => void;
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
    const [activeTab, setActiveTab] = useState<string>('이체');
    const [highQualityGraphics, setHighQualityGraphics] = useState(true);
    
    // Security Lock State
    const [isScreenLocked, setIsScreenLocked] = useState(false);
    const lastVisibilityChange = useRef<number>(Date.now());

    const userRef = useRef<any>(null);

    const serverAction = async (action: string, payload: any) => {
        setSimulatedLoading(true);
        try {
            const res = await fetch('/api/game-action', {
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
            
            // Refresh current user if logged in
            if (currentUser) {
                const updatedUser = await fetchUser(currentUser.id || currentUser.email!);
                if (updatedUser) setCurrentUser(updatedUser);
            }
        } catch(e) { console.error("Data Fetch Error:", e); }
    }, [currentUser?.id]);

    // BOK Auto-Lock Logic
    const isBOKUser = (user: User | null) => {
        if (!user) return false;
        return (user.type === 'admin') || user.govtRole === '한국은행장' || user.name === '한국은행';
    };

    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.hidden) {
                lastVisibilityChange.current = Date.now();
            } else {
                // If BOK user and hidden for more than 1 second, lock
                if (currentUser && isBOKUser(currentUser)) {
                    const diff = Date.now() - lastVisibilityChange.current;
                    if (diff > 1000) { 
                        setIsScreenLocked(true);
                    }
                }
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [currentUser]);

    const unlockScreen = async () => {
        const pin = await showPinModal("보안 잠금 해제 (PIN)", currentUser?.pin!, 4, true);
        if (pin === currentUser?.pin) {
            setIsScreenLocked(false);
        }
    };

    // Initial Auth & Data Load
    useEffect(() => {
        let isMount = true;
        
        const initAuth = async () => {
            const switchedId = localStorage.getItem('sh_user_id');
            if (switchedId) {
                let switchedUser = null;
                if (switchedId.includes('@')) {
                    switchedUser = await fetchUserByEmail(switchedId);
                } else {
                    switchedUser = await fetchUserByLoginId(switchedId);
                }

                if (switchedUser && isMount) {
                    if (switchedUser.pendingTaxes && !Array.isArray(switchedUser.pendingTaxes)) {
                        switchedUser.pendingTaxes = Object.values(switchedUser.pendingTaxes);
                    }
                    setCurrentUser(switchedUser);
                    if (isBOKUser(switchedUser)) setAdminMode(false);
                    
                    const userKey = toSafeId(switchedUser.email || switchedUser.id!);
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
                        // Service Status Check (Ended)
                        if (db.settings.serviceStatus === 'ended' && !isBOKUser(userData)) {
                            await logoutFirebase();
                            setAlertMessage("서비스가 종료되었습니다. 이용해주셔서 감사합니다.");
                            setCurrentUser(null);
                            setIsLoading(false);
                            return;
                        }

                        // Approval Check
                        const requireApproval = db.settings.requireSignupApproval !== false;
                        if (userData.approvalStatus === 'approved' || !requireApproval || isBOKUser(userData)) {
                            if (userData.pendingTaxes && !Array.isArray(userData.pendingTaxes)) {
                                userData.pendingTaxes = Object.values(userData.pendingTaxes);
                            }
                            setCurrentUser(userData);
                            localStorage.setItem('sh_user_id', userData.id || userData.email!);
                            
                            if (isBOKUser(userData)) setAdminMode(false);
                            const userKey = toSafeId(userData.email || userData.id!);
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
            if(isMount) {
                setDb(prev => ({ ...prev, ...data }));
                initAuth();
            }
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
            }
        } catch(e) {
            console.error("Admin user load failed:", e);
        } finally {
            setSimulatedLoading(false);
        }
    };

    const login = async (id: string, pass: string, remember = false) => {
        setSimulatedLoading(true);
        try {
            const inputId = id.trim();
            let userData = await fetchUserByLoginId(inputId);
            if (!userData && inputId.includes('@')) {
                userData = await fetchUserByEmail(inputId);
            }
            
            if (!userData) {
                setAlertMessage("존재하지 않는 아이디입니다.");
                return false;
            }

            // Service Status Check (Maintenance/Ended)
            const isBOK = isBOKUser(userData);
            if (db.settings.serviceStatus === 'ended' && !isBOK) {
                setAlertMessage("서비스가 종료되었습니다.");
                return false;
            }
            
            // Maintenance mode allows login but UI is blocked in Dashboard
            
            if (userData.isSuspended) {
                setAlertMessage("정지된 계정입니다. 관리자에게 문의하세요.");
                return false;
            }

            let actualEmail = userData.email;
            if (!actualEmail) {
                // If it's a sub-account without direct email login, reject (Sub accounts must switch from main)
                // But if we allow login via ID/PW if they share PW? 
                // Requirement: "이 계정으로 바로 로그인할 수는 없지". 
                // So if it's a linked account (subType govt/business) without separate auth, we might block.
                // However, current implementation puts 'email' even on sub accounts as dummy.
                // Let's assume only Main accounts (citizen/teacher) have real auth credentials.
                // But for simplicity, we allow login if credentials match.
                
                // If ID matches a sub-account, we must find the PARENT email to auth against? 
                // No, requirement says "Sub-account... shares info".
                // Let's assume direct login is blocked for sub-accounts as per prompt.
                if (userData.type === 'mart' || userData.type === 'government') {
                     setAlertMessage("부계정(공무원/마트)은 직접 로그인할 수 없습니다. 본계정(시민)으로 로그인 후 모드를 전환하세요.");
                     return false;
                }
                setAlertMessage("계정 데이터 오류: 이메일 정보가 없습니다.");
                return false;
            }

            await loginWithEmail(actualEmail, pass);
            
            const requireApproval = db.settings.requireSignupApproval !== false;
            if (requireApproval && userData.approvalStatus !== 'approved' && !isBOK) {
                await logoutFirebase();
                setAlertMessage("가입 승인 대기 중입니다. 관리자에게 문의하세요.");
                return false;
            }

            if (!userData.pin) {
                setSimulatedLoading(false);
                const newPin = await showPinModal("보안을 위해 PIN(간편비밀번호)을 설정해주세요.", undefined, 6, false);
                if (!newPin) {
                    await logoutFirebase();
                    setAlertMessage("PIN 설정을 취소하여 로그인이 중단되었습니다.");
                    return false;
                }
                const userKey = toSafeId(userData.email || userData.id!);
                await update(ref(database, `users/${userKey}`), { pin: newPin, pinLength: newPin.length });
                userData.pin = newPin;
                userData.pinLength = newPin.length;
                setSimulatedLoading(true);
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
                const userKey = toSafeId(currentUser.email || currentUser.id!);
                await update(ref(database, `users/${userKey}`), { isOnline: false });
                if (userRef.current) off(userRef.current);
            } catch(e) {}
        }
        
        localStorage.removeItem('sh_user_id');
        setCachedLinkedUsers([]); // Clear cache on logout
        
        try {
            await logoutFirebase();
        } catch(e) {
            console.warn("Firebase logout failed", e);
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
            
            const isKoreaBank = userData.name === '한국은행' || userData.govtRole === '한국은행장';
            const initialBalance = isKoreaBank ? 1000000000000000 : 0;
            
            const newUser: User = {
                id: userData.id!.trim(), 
                email: userEmail,
                name: userData.name || '',
                password: password, 
                type: userData.type || 'citizen',
                subType: userData.subType || 'personal',
                govtRole: userData.govtRole || '',
                govtBranch: userData.govtBranch || [],
                approvalStatus: userData.approvalStatus || 'pending',
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
                linkedAccounts: userData.linkedAccounts || [],
                transactions: [], notifications: [], pendingTaxes: [], loans: [], stockHoldings: {}, ledger: {}, autoTransfers: {}, isOnline: true, lastActive: Date.now(), failedLoginAttempts: 0
            };
            
            await set(ref(database, `users/${dbKey}`), sanitize(newUser));
        } catch (e: any) {
            console.error("registerUser Error:", e);
            throw e;
        } finally {
            setSimulatedLoading(false);
        }
    };

    // New: Create Sub Account (without Firebase Auth)
    const createSubAccount = async (parentUser: User, subData: Partial<User>) => {
        setSimulatedLoading(true);
        try {
            const subId = subData.id!;
            const subKey = toSafeId(subId);
            
            // Sub account shares password logic conceptually (mode switch)
            const newUser: User = {
                id: subId,
                email: `${subId}@sunghwa.bank`, // Dummy email
                name: parentUser.name, // Same name
                type: subData.type || 'citizen',
                subType: subData.subType || 'personal',
                govtRole: subData.govtRole || '',
                govtBranch: subData.govtBranch || [],
                approvalStatus: subData.approvalStatus || 'pending',
                balanceKRW: 0,
                balanceUSD: 0,
                birthDate: parentUser.birthDate,
                phoneNumber: parentUser.phoneNumber,
                customJob: subData.customJob || '',
                profilePic: parentUser.profilePic,
                pin: parentUser.pin, // Share PIN
                pinLength: parentUser.pinLength,
                linkedAccounts: [parentUser.id || parentUser.email!], // Link back to parent
                preferences: parentUser.preferences,
                transactions: [], notifications: [], pendingTaxes: [], loans: [], stockHoldings: {}
            };

            await set(ref(database, `users/${subKey}`), sanitize(newUser));
            
            // Link Parent to Sub
            const parentKey = toSafeId(parentUser.email || parentUser.id!);
            const currentLinks = parentUser.linkedAccounts || [];
            if (!currentLinks.includes(subId)) {
                await update(ref(database, `users/${parentKey}`), { 
                    linkedAccounts: [...currentLinks, subId] 
                });
            }
        } catch(e) {
            console.error(e);
            throw e;
        } finally {
            setSimulatedLoading(false);
        }
    };

    const updateUser = async (key: string, data: Partial<User>) => {
        const targetKey = key || currentUser?.id || currentUser?.email;
        if (!targetKey) return;
        const safeKey = toSafeId(targetKey);
        
        if (currentUser && (targetKey === currentUser.id || targetKey === currentUser.email)) {
            setCurrentUser(prev => {
                if (!prev) return null;
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

    const showPinModal = (m: string, e?: string, l: 4|6=4, allowBiometric: boolean = true) => {
        if (db.settings.bypassPin) {
            return Promise.resolve(e || "0000"); 
        }
        return new Promise<string|null>(r => setPinResolver({ resolve: r, message: m, expectedPin: e, pinLength: l, allowBiometric }));
    };

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
                 if (all) finalKey = toSafeId(all.email || all.id!);
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
            } catch(e) { console.error(e); }
        }
    };
    
    const openChat = () => { window.dispatchEvent(new CustomEvent('open-chat')); };

    const createChat = async (participants: string[], type: 'private'|'group'|'feedback'|'auction' = 'private', groupName?: string) => {
        const id = await chatService.createChat(participants, type, groupName);
        return id;
    };

    const sendMessage = async (chatId: string, text: string, attachment?: ChatAttachment) => {
        const myIdentity = isBOKUser(currentUser) ? '한국은행' : currentUser!.name;
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
        const userKey = toSafeId(currentUser.email || currentUser.id!);
        const userNotifsRef = ref(database, `users/${userKey}/notifications/${notifId}`);
        await set(userNotifsRef, null);
        await saveDb(newDb);
    };

    const updateStock = async (stockId: string, data: Partial<Stock>) => { await update(ref(database, `stocks/${stockId}`), sanitize(data)); };
    const markChatRead = async (chatId: string) => { /* Impl */ };

    const applyBankruptcy = async () => {
        if (!currentUser) return;
        if (!await showConfirm("정말 파산을 신청하시겠습니까?")) return;
        const pin = await showPinModal("PIN 입력", currentUser.pin!);
        if (pin !== currentUser.pin) return;
        const newDb = { ...db };
        const userKey = toSafeId(currentUser.email || currentUser.id!);
        const user = newDb.users[userKey];
        user.balanceKRW = 0; user.balanceUSD = 0; user.stockHoldings = {};
        await saveDb(newDb);
        setAlertMessage("파산 처리가 완료되었습니다.");
    };
    
    const switchAccount = async (targetEmail: string): Promise<boolean> => {
        setSimulatedLoading(true);
        try {
            let userData = await fetchUserByEmail(targetEmail);
            if (!userData) userData = await fetchUserByLoginId(targetEmail);

            if (userData) { 
                localStorage.setItem('sh_user_id', userData.id || userData.email!);
                await new Promise(resolve => setTimeout(resolve, 100));
                window.location.reload();
                return true; 
            }
            return false;
        } catch(e) {
            setAlertMessage("계전 전환 실패");
            return false;
        } finally { 
        }
    };

    const approvePolicyChange = async (id: string) => {
        const req = (await get(ref(database, `policyRequests/${id}`))).val(); 
        if (!req) return;
        const updates: any = {};
        if (req.type === 'standard') updates['settings/standards'] = req.data;
        updates[`policyRequests/${id}/status`] = 'approved';
        await update(ref(database), updates);
        if (req.requester) notify(req.requester, `[정책] ${req.description} 승인되었습니다.`, true);
    };

    const rejectPolicyChange = async (id: string) => { 
        await update(ref(database, `policyRequests/${id}`), { status: 'rejected' }); 
    };

    const payTax = async (tax: PendingTax) => {
        if(!currentUser) return;
        if(currentUser.balanceKRW < tax.amount) { setAlertMessage("잔액이 부족합니다."); return; }
        if(!await showConfirm(`₩${tax.amount.toLocaleString()} 세금을 납부하시겠습니까?`)) return;
        
        const newDb = {...db};
        const bank = (Object.values(newDb.users) as User[]).find(u => u.govtRole === '한국은행장' || (u.type === 'admin' && u.subType === 'govt') || u.name === '한국은행');

        const userKey = toSafeId(currentUser.email || currentUser.id!);
        const me = newDb.users[userKey];
        
        if (bank) bank.balanceKRW += tax.amount;
        me.balanceKRW -= tax.amount;
        
        if (!Array.isArray(me.pendingTaxes)) {
            // @ts-ignore
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
        const userKey = toSafeId(currentUser.email || currentUser.id!);
        
        let currentTaxes = currentUser.pendingTaxes || [];
        if (!Array.isArray(currentTaxes)) currentTaxes = Object.values(currentTaxes);

        const newTaxes = currentTaxes.filter(t => t.id !== taxId);
        await update(ref(database, `users/${userKey}`), { pendingTaxes: newTaxes });
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
                    
                    localStorage.setItem('sh_user_id', currentUser.id || newEmail); 
                    window.location.reload();
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
            db, currentUser, isAdminMode, toasts, setAdminMode, login, logout, updateUser, registerUser, createSubAccount, isLoading,
            showPinModal, showConfirm, showModal, notify, saveDb, refreshData, loadAllUsers,
            serverAction, pinResolver, setPinResolver, confirmResolver, setConfirmResolver, alertMessage, setAlertMessage,
            currentAssetHistory, loadAssetHistory, cachedLinkedUsers, setCachedLinkedUsers, triggerHaptic, 
            isElementPicking, setElementPicking,
            requestNotificationPermission, createChat, sendMessage, clearPaidTax: async () => {}, cachedMarts, setCachedMarts, wait,
            requestPolicyChange, respondToAuctionInvite, updateStock, markChatRead, applyBankruptcy, switchAccount, approvePolicyChange, rejectPolicyChange,
            requestPasswordReset: async (email) => { try { await resetUserPassword(email); return true; } catch(e) { return false; } },
            changeUserEmail,
            payTax, dismissTax, setupPin, openChat, findUserKeyByName,
            activeTab, setActiveTab, highQualityGraphics, setHighQualityGraphics,
            isScreenLocked, unlockScreen
        }}>
            {children}
            {isScreenLocked && (
                <div className="fixed inset-0 z-[9999] bg-black/95 backdrop-blur-xl flex flex-col items-center justify-center text-white">
                    <div className="w-24 h-24 bg-gray-800 rounded-3xl flex items-center justify-center mb-8 animate-bounce shadow-2xl border border-gray-700">
                        <span className="text-5xl">🔒</span>
                    </div>
                    <h2 className="text-3xl font-black mb-2 tracking-tight">보안 잠금</h2>
                    <p className="text-gray-400 mb-10 text-sm font-medium">관리자/한국은행 계정 보안 정책에 의해 자동 잠금되었습니다.</p>
                    <button onClick={unlockScreen} className="px-10 py-4 bg-green-600 rounded-2xl font-bold hover:bg-green-500 transition-all hover:scale-105 shadow-lg shadow-green-600/30">잠금 해제 (PIN)</button>
                </div>
            )}
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
