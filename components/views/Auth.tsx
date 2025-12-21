
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useGame } from '../../context/GameContext';
import { Button, Input, LineIcon, Modal, formatName } from '../Shared';
import { UserSubType, GovtBranch, User } from '../../types';
import { auth, findUserEmailForRecovery, findUserIdByInfo, resetUserPassword } from '../../services/firebase';
import { sendEmailVerification } from 'firebase/auth';

type ViewMode = 'login' | 'signup' | 'find_account' | 'notif_setup';

const GOVT_STRUCTURE = {
    '행정부': ['대통령', '한국은행장', '법무부장관', '검사', '검찰총장'],
    '입법부': ['국회의원', '국회의장'],
    '사법부': ['판사', '대법원장']
};

export const AuthView: React.FC = () => {
    const { login, registerUser, showModal, db, requestNotificationPermission, showPinModal, highQualityGraphics } = useGame();
    const [view, setView] = useState<ViewMode>('login');
    const [history, setHistory] = useState<ViewMode[]>([]);

    const navigateTo = (v: ViewMode) => {
        setHistory(prev => [...prev, view]);
        setView(v);
        setStep(1);
    };

    const goBack = () => {
        if (history.length > 0) {
            const prev = history[history.length - 1];
            setHistory(prev => prev.slice(0, -1));
            setView(prev);
            setStep(1);
        } else {
            setView('login');
        }
    };

    // Form States
    const [loginId, setLoginId] = useState('');
    const [password, setPassword] = useState('');
    const [passwordConfirm, setPasswordConfirm] = useState('');
    const [signupId, setSignupId] = useState('');
    const [email, setEmail] = useState('');
    const [step, setStep] = useState(1);
    const [isProcessing, setIsProcessing] = useState(false);
    
    // Signup Extra Info
    const [subType, setSubType] = useState<UserSubType | 'teacher'>('personal');
    const [sName, setSName] = useState('');
    const [sBirth, setSBirth] = useState('');
    const [govtRole, setGovtRole] = useState('');
    
    // Recovery Info
    const [findName, setFindName] = useState('');
    const [findBirth, setFindBirth] = useState('');
    const [findId, setFindId] = useState('');
    const [recoveryMode, setRecoveryMode] = useState<'id' | 'pw'>('id');
    
    const [agreedTerms, setAgreedTerms] = useState<Record<string, boolean>>({});
    const [currentTermIndex, setCurrentTermIndex] = useState(0);
    
    // Login History State
    const [loginHistory, setLoginHistory] = useState<any[]>([]);

    const consents = useMemo(() => {
        const raw = db.settings.consents || {};
        return Object.entries(raw).map(([key, val]) => ({ key, ...(val as any) }));
    }, [db.settings.consents]);

    const allMandatoryAgreed = consents.every(c => c.isMandatory === false || agreedTerms[c.key]);
    const verificationInterval = useRef<any>(null);

    useEffect(() => {
        try {
            const hist = JSON.parse(localStorage.getItem('sh_login_history') || '[]');
            setLoginHistory(hist);
        } catch (e) {}
        return () => { if (verificationInterval.current) clearInterval(verificationInterval.current); };
    }, []);

    const handleLogin = async () => {
        if (!loginId || !password) return showModal("정보를 입력하세요.");
        const success = await login(loginId, password);
        if (success) {
            setView('notif_setup');
        }
    };

    const handleQuickLogin = async (user: any) => {
        const targetId = user.id || user.email;
        if (!user.pin) {
            setLoginId(targetId);
            return;
        }
        
        const pin = await showPinModal(`${user.name}님 로그인`, user.pin, (user.pin.length as any) || 4);
        if (pin === user.pin) {
            try {
                const pass = atob(user.password);
                const success = await login(targetId, pass);
                if (success) setView('notif_setup');
            } catch(e) {
                showModal("로그인 정보가 만료되었습니다. 다시 로그인해주세요.");
            }
        }
    };

    const handleResendEmail = async () => {
        if (auth.currentUser) {
            try {
                await sendEmailVerification(auth.currentUser);
                showModal("인증 메일을 재전송했습니다.");
            } catch (e) {
                showModal("재전송 실패: 잠시 후 다시 시도하세요.");
            }
        }
    };

    const startEmailCheck = (targetView: ViewMode = 'login') => {
        if (verificationInterval.current) clearInterval(verificationInterval.current);
        verificationInterval.current = setInterval(async () => {
            try {
                await auth.currentUser?.reload();
                if (auth.currentUser?.emailVerified) {
                    clearInterval(verificationInterval.current);
                    setStep(5);
                    setTimeout(() => setView(targetView), 2500);
                }
            } catch (e) { console.error(e); }
        }, 3000);
    };

    const handleSignupNext = async () => {
        if (isProcessing) return;
        if (step === 1) {
            if (!allMandatoryAgreed) return showModal("필수 약관에 모두 동의해야 합니다.");
            setStep(2);
        } else if (step === 2) {
            if (!sName.trim() || !sBirth.trim()) return showModal("이름과 생년월일을 입력하세요.");
            if (sBirth.length !== 6) return showModal("생년월일 6자리를 입력하세요 (YYMMDD).");
            if (subType === 'govt' && !govtRole) return showModal("공무원 직책을 선택하세요.");
            setStep(3);
        } else if (step === 3) {
            if (!signupId.trim()) return showModal("사용할 아이디를 입력하세요.");
            if (!email.includes('@')) return showModal("유효한 이메일을 입력하세요.");
            if (password.length < 8) return showModal("비밀번호는 8자리 이상이어야 합니다.");
            if (password !== passwordConfirm) return showModal("비밀번호가 일치하지 않습니다.");
            
            setIsProcessing(true);
            try {
                let finalType: User['type'] = 'citizen';
                let branches: GovtBranch[] = [];
                let status: User['approvalStatus'] = 'pending';
                let isPresident = false;

                if (subType === 'personal') finalType = 'citizen';
                else if (subType === 'business') finalType = 'mart';
                else if (subType === 'teacher') finalType = 'teacher';
                else if (subType === 'govt') {
                    finalType = 'government';
                    if (GOVT_STRUCTURE['행정부'].includes(govtRole)) branches = ['executive'];
                    else if (GOVT_STRUCTURE['입법부'].includes(govtRole)) branches = ['legislative'];
                    else if (GOVT_STRUCTURE['사법부'].includes(govtRole)) branches = ['judicial'];
                    if (govtRole === '대통령') isPresident = true;
                    if (govtRole === '한국은행장' || sName.trim() === '한국은행') status = 'approved';
                }

                await registerUser({
                    email: email.trim(), 
                    id: signupId.trim(),
                    name: sName.trim(), 
                    type: finalType, 
                    subType: subType === 'teacher' ? 'teacher' : subType,
                    birthDate: sBirth.trim(), 
                    govtBranch: branches, 
                    govtRole,
                    isPresident,
                    approvalStatus: status,
                    balanceKRW: 0,
                    balanceUSD: 0
                }, password);

                setStep(4);
                startEmailCheck('login');
            } catch (e: any) {
                showModal("가입 처리 중 오류가 발생했습니다: " + (e.message || "알 수 없는 오류"));
            } finally { setIsProcessing(false); }
        }
    };

    const handleRecovery = async () => {
        setIsProcessing(true);
        try {
            if (recoveryMode === 'id') {
                if (!findName || !findBirth) throw new Error("이름과 생년월일을 입력하세요.");
                const foundId = await findUserIdByInfo(findName, findBirth);
                if (foundId) showModal(`회원님의 아이디는 [ ${foundId} ] 입니다.`);
                else showModal("일치하는 정보를 찾을 수 없습니다.");
            } else {
                if (!findId || !findName || !findBirth) throw new Error("모든 정보를 입력하세요.");
                const foundEmail = await findUserEmailForRecovery(findId, findName, findBirth);
                if (foundEmail) {
                    await resetUserPassword(foundEmail);
                    showModal(`[${foundEmail}]로 비밀번호 재설정 링크를 발송했습니다.`);
                    setView('login');
                } else {
                    showModal("일치하는 계정 정보를 찾을 수 없습니다.");
                }
            }
        } catch (e: any) {
            showModal(e.message || "오류가 발생했습니다.");
        } finally {
            setIsProcessing(false);
        }
    };

    const getInfo = () => {
        if (view === 'login') return { title: "성화 은행", desc: "서비스 이용을 위해\n로그인해주세요." };
        if (view === 'notif_setup') return { title: "알림 설정", desc: "더 빠른 소식을 위해\n알림 방식을 선택하세요." };
        if (view === 'find_account') return { title: "계정 찾기", desc: "아이디 또는 비밀번호를\n찾을 수 있습니다." };
        if (view === 'signup') {
            switch(step) {
                case 1: return { title: "약관 동의", desc: "관리자가 등록한\n이용 약관입니다." };
                case 2: return { title: "정보 입력", desc: "사용하실 실명과\n역할을 선택하세요." };
                case 3: return { title: "계정 생성", desc: "사용하실 아이디와\n비밀번호를 입력하세요." };
                case 4: return { title: "이메일 인증", desc: "메일함의 인증 링크를\n클릭하여 완료하세요." };
                default: return { title: "가입 완료", desc: "가입을 축하합니다!" };
            }
        }
        return { title: "성화 은행", desc: "" };
    };

    const info = getInfo();

    return (
        <div className="fixed inset-0 flex items-center justify-center overflow-hidden font-sans bg-[#F2F2F7] dark:bg-[#050505]">
            {/* Enhanced Ambient Background Orbs */}
            {highQualityGraphics && (
                <>
                    <div className="absolute top-[-20%] left-[-10%] w-[60vw] h-[60vw] rounded-full bg-green-500/20 blur-[150px] animate-blob mix-blend-screen"></div>
                    <div className="absolute bottom-[-20%] right-[-10%] w-[60vw] h-[60vw] rounded-full bg-blue-500/20 blur-[150px] animate-blob animation-delay-2000 mix-blend-screen"></div>
                    <div className="absolute top-[30%] left-[30%] w-[40vw] h-[40vw] rounded-full bg-purple-500/15 blur-[120px] animate-blob animation-delay-4000 mix-blend-screen"></div>
                </>
            )}

            <div className={`w-full max-w-5xl h-full sm:h-[720px] flex flex-col sm:flex-row overflow-hidden relative z-10 transition-all duration-500 sm:rounded-[40px] shadow-2xl ${highQualityGraphics ? 'bg-white/10 dark:bg-black/40 backdrop-blur-3xl border border-white/20 shadow-[0_0_40px_rgba(0,0,0,0.1)]' : 'bg-white dark:bg-[#1C1C1E] border border-gray-200 dark:border-gray-800'}`}>
                
                {/* Mobile Header */}
                <div className="sm:hidden w-full px-6 pt-8 pb-4 flex items-center justify-between shrink-0">
                    <button onClick={goBack} className={`p-2 -ml-2 text-gray-500 transition-transform active:scale-95 ${view === 'login' ? 'invisible' : ''}`}><LineIcon icon="arrow-left" className="w-6 h-6" /></button>
                    <div className="text-center animate-fade-in">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{view === 'signup' ? `Step ${step}` : view.toUpperCase()}</p>
                        <h1 className="text-lg font-black dark:text-white">{info.title}</h1>
                    </div>
                    <div className="w-10"></div>
                </div>

                {/* Left Panel (Desktop) */}
                <div className="hidden sm:flex flex-col justify-start p-12 pt-24 w-[35%] border-r border-white/10 relative">
                    <div className="w-12 h-12 bg-green-600 rounded-[18px] flex items-center justify-center text-white mb-8 shadow-lg shadow-green-600/30">
                        <LineIcon icon="finance" className="w-7 h-7" />
                    </div>
                    <div className="animate-slide-up mb-8">
                        {view !== 'login' && <button onClick={goBack} className="text-xs font-bold text-green-600 mb-2 flex items-center gap-1 hover:underline">← 뒤로가기</button>}
                        <h1 key={info.title} className="text-3xl font-black tracking-tighter text-black dark:text-white mb-4 leading-tight whitespace-pre-line animate-fade-in">{info.title}</h1>
                        <p key={info.desc} className="text-gray-500 dark:text-white/60 text-base font-medium leading-relaxed break-keep whitespace-pre-line animate-fade-in">{info.desc}</p>
                    </div>

                    {/* Quick Login List */}
                    {view === 'login' && loginHistory.length > 0 && (
                        <div className="mt-auto animate-fade-in w-full">
                            <p className="text-xs font-bold text-gray-400 mb-3 uppercase tracking-wider">최근 접속 계정</p>
                            <div className="space-y-2">
                                {loginHistory.map(user => (
                                    <button 
                                        key={user.id} 
                                        onClick={() => handleQuickLogin(user)}
                                        className="w-full flex items-center gap-3 p-3 bg-white/40 dark:bg-white/5 rounded-2xl hover:bg-white/60 dark:hover:bg-white/10 transition-colors text-left border border-white/20 shadow-sm group backdrop-blur-sm"
                                    >
                                        <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform border border-white/20">
                                            {user.profilePic ? <img src={user.profilePic} className="w-full h-full object-cover" /> : <span className="font-bold text-gray-500">{formatName(user.name)[0]}</span>}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-bold text-sm truncate dark:text-white">{formatName(user.name)}</p>
                                            <p className="text-[10px] text-gray-400 truncate">{user.id}</p>
                                        </div>
                                        <div className="w-8 h-8 rounded-full bg-green-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg shadow-green-500/30">
                                            <LineIcon icon="arrow-right" className="w-4 h-4" />
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Right Panel (Content) */}
                <div className="flex-1 p-6 sm:p-16 flex flex-col justify-center items-center relative z-10 overflow-y-auto w-full">
                    <div className="w-full max-w-sm space-y-6 animate-fade-in relative">
                        {view === 'login' && (
                            <div className="space-y-6 animate-slide-up">
                                <div className="space-y-3">
                                    <Input placeholder="아이디" value={loginId} onChange={e => setLoginId(e.target.value)} className="h-14 bg-white/50 dark:bg-black/30 backdrop-blur-md border-white/20 focus:border-green-500" />
                                    <Input type="password" placeholder="비밀번호" value={password} onChange={e => setPassword(e.target.value)} className="h-14 bg-white/50 dark:bg-black/30 backdrop-blur-md border-white/20 focus:border-green-500" />
                                </div>
                                <Button onClick={handleLogin} className="w-full h-14 text-lg rounded-2xl bg-green-600 hover:bg-green-500 shadow-lg shadow-green-600/30 backdrop-blur-sm">접속하기</Button>
                                <div className="flex justify-between items-center px-1 pt-4 border-t border-gray-200/50 dark:border-white/10">
                                    <button onClick={() => navigateTo('signup')} className="text-sm font-bold text-gray-500 hover:text-green-600 transition-colors">회원가입</button>
                                    <button onClick={() => navigateTo('find_account')} className="text-xs text-gray-400 hover:text-gray-600 transition-colors">아이디/비번 찾기</button>
                                </div>
                            </div>
                        )}

                        {view === 'notif_setup' && (
                            <div className="space-y-6 animate-slide-up">
                                <h3 className="text-center font-bold text-lg mb-2 dark:text-white">알림 권한 설정</h3>
                                <p className="text-xs text-center text-gray-500">네이티브 알림 사용 시 더 정확한 정보를 즉시 받을 수 있습니다.</p>
                                <div className="space-y-3">
                                    <Button onClick={() => { requestNotificationPermission('native'); window.location.reload(); }} className="w-full py-4 bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-600/30">네이티브 알림 (권장)</Button>
                                    <Button onClick={() => { requestNotificationPermission('browser'); window.location.reload(); }} variant="secondary" className="w-full py-4 bg-white/50 dark:bg-white/10 backdrop-blur-sm">브라우저 토스트 알림</Button>
                                </div>
                            </div>
                        )}

                        {view === 'signup' && (
                            <div className="space-y-6 animate-slide-up">
                                <div className="flex gap-1.5 mb-2">
                                    {[1,2,3,4].map(s => <div key={s} className={`h-1 flex-1 rounded-full transition-all duration-500 ${step >= s ? 'bg-green-500/50' : 'bg-gray-200 dark:bg-white/10'} ${step === s ? 'bg-green-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : ''}`}></div>)}
                                </div>
                                {step === 1 && (
                                    <div className="space-y-3 animate-fade-in">
                                        <div className="space-y-2 max-h-80 overflow-y-auto pr-1 scrollbar-hide">
                                            {consents.map((c, idx) => (
                                                <div key={c.key} className={`border rounded-2xl transition-all duration-300 overflow-hidden ${currentTermIndex === idx ? 'border-green-500 bg-green-50/20 dark:bg-green-900/20 shadow-sm' : 'border-gray-200 dark:border-white/10 bg-white/40 dark:bg-white/5'}`}>
                                                    <button onClick={() => setCurrentTermIndex(idx)} className="w-full p-4 flex justify-between items-center text-left">
                                                        <span className="font-bold text-sm dark:text-white">{idx + 1}. {c.title} {c.isMandatory !== false && <span className="text-red-500 ml-1">(필수)</span>}</span>
                                                    </button>
                                                    {currentTermIndex === idx && (
                                                        <div className="px-4 pb-4 animate-slide-up">
                                                            <div className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed mb-4 p-3 bg-white/50 dark:bg-black/20 rounded-xl" dangerouslySetInnerHTML={{ __html: c.content }} />
                                                            <label className="flex items-center gap-3 cursor-pointer p-2 hover:bg-white/10 rounded-lg transition-colors"><input type="checkbox" checked={!!agreedTerms[c.key]} onChange={e => setAgreedTerms({ ...agreedTerms, [c.key]: e.target.checked })} className="accent-green-600 w-5 h-5" /><span className="text-sm font-bold dark:text-white">동의합니다.</span></label>
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {step === 2 && (
                                    <div className="space-y-4 animate-fade-in">
                                        <Input placeholder="실명" value={sName} onChange={e => setSName(e.target.value)} className="h-14 bg-white/50 dark:bg-black/30 backdrop-blur-md" />
                                        <Input placeholder="생년월일 (YYMMDD)" value={sBirth} onChange={e => setSBirth(e.target.value)} maxLength={6} className="h-14 bg-white/50 dark:bg-black/30 backdrop-blur-md" />
                                        <div className="grid grid-cols-2 gap-2">
                                            {[{ id: 'personal', label: '개인' }, { id: 'business', label: '사업자' }, { id: 'govt', label: '공무원' }, { id: 'teacher', label: '교사' }].map(t => (
                                                <button 
                                                    key={t.id} 
                                                    onClick={() => { setSubType(t.id as any); setGovtRole(''); }} 
                                                    className={`py-3 rounded-xl font-bold border transition-all duration-200 active:scale-95 ${subType === t.id ? 'bg-green-600 text-white shadow-lg shadow-green-600/20 border-green-600' : 'bg-white/50 dark:bg-white/5 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-white/10 hover:bg-white/80 dark:hover:bg-white/10'}`}
                                                >
                                                    {t.label}
                                                </button>
                                            ))}
                                        </div>
                                        {subType === 'govt' && (
                                            <div className="mt-2 space-y-3 bg-white/50 dark:bg-white/5 p-3 rounded-xl border border-gray-200 dark:border-white/10 max-h-60 overflow-y-auto animate-fade-in backdrop-blur-sm">
                                                <p className="text-xs font-bold text-gray-500 dark:text-gray-400">공무원 직책 선택</p>
                                                {Object.entries(GOVT_STRUCTURE).map(([branchName, roles]) => (
                                                    <div key={branchName} className="space-y-1">
                                                        <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500">{branchName}</p>
                                                        <div className="flex flex-wrap gap-2">
                                                            {roles.map(role => (
                                                                <button
                                                                    key={role}
                                                                    onClick={() => setGovtRole(role)}
                                                                    className={`px-3 py-1.5 text-xs rounded-lg border transition-all font-medium ${govtRole === role ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'bg-white dark:bg-[#3D3D3D] text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-[#4D4D4D]'}`}
                                                                >
                                                                    {role}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                                {step === 3 && (
                                    <div className="space-y-3 animate-fade-in">
                                        <Input placeholder="사용할 아이디 (ID)" value={signupId} onChange={e => setSignupId(e.target.value)} className="h-14 bg-white/50 dark:bg-black/30 backdrop-blur-md" />
                                        <Input placeholder="인증용 이메일" value={email} onChange={e => setEmail(e.target.value)} className="h-14 bg-white/50 dark:bg-black/30 backdrop-blur-md" />
                                        <Input type="password" placeholder="비밀번호" value={password} onChange={e => setPassword(e.target.value)} className="h-14 bg-white/50 dark:bg-black/30 backdrop-blur-md" />
                                        <Input type="password" placeholder="비밀번호 확인" value={passwordConfirm} onChange={e => setPasswordConfirm(e.target.value)} className="h-14 bg-white/50 dark:bg-black/30 backdrop-blur-md" />
                                        <p className="text-xs text-gray-500">※ 이메일은 본인 인증 및 비밀번호 찾기에 사용됩니다.</p>
                                    </div>
                                )}
                                {step === 4 && (
                                    <div className="text-center py-6 animate-pulse">
                                        <div className="w-20 h-20 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto mb-6"><LineIcon icon="mail" className="text-blue-500 w-10 h-10" /></div>
                                        <p className="font-bold dark:text-white">이메일 인증 대기 중</p>
                                        <button onClick={handleResendEmail} className="text-xs text-blue-600 underline mt-2 hover:text-blue-500">인증 메일 재발송</button>
                                    </div>
                                )}
                                {step === 5 && (
                                    <div className="text-center py-6 animate-scale-in">
                                        <div className="w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-6"><LineIcon icon="check" className="text-green-500 w-10 h-10" /></div>
                                        <p className="text-xl font-bold dark:text-white">가입 처리 완료!</p>
                                    </div>
                                )}
                                <div className="flex gap-2">
                                    {step > 1 && step < 4 && <button onClick={() => setStep(step-1)} className="flex-1 h-14 bg-gray-100 dark:bg-white/5 text-gray-500 font-bold rounded-2xl hover:bg-gray-200 dark:hover:bg-white/10 transition-colors">이전</button>}
                                    {step < 4 && <Button onClick={handleSignupNext} className="flex-[2] h-14 bg-green-600 font-bold rounded-2xl shadow-lg shadow-green-600/30 hover:bg-green-500">{step === 3 ? '가입 신청' : '다음'}</Button>}
                                </div>
                            </div>
                        )}
                        
                        {view === 'find_account' && (
                            <div className="space-y-6 animate-slide-up">
                                <div className="flex p-1 bg-gray-200 dark:bg-white/10 rounded-xl">
                                    <button onClick={() => setRecoveryMode('id')} className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${recoveryMode === 'id' ? 'bg-white dark:bg-black/50 shadow text-black dark:text-white' : 'text-gray-500'}`}>아이디 찾기</button>
                                    <button onClick={() => setRecoveryMode('pw')} className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${recoveryMode === 'pw' ? 'bg-white dark:bg-black/50 shadow text-black dark:text-white' : 'text-gray-500'}`}>비밀번호 찾기</button>
                                </div>
                                <div className="space-y-3">
                                    <Input placeholder="이름" value={findName} onChange={e => setFindName(e.target.value)} className="h-12 bg-white/50 dark:bg-black/30" />
                                    <Input placeholder="생년월일 (6자리)" value={findBirth} onChange={e => setFindBirth(e.target.value)} maxLength={6} className="h-12 bg-white/50 dark:bg-black/30" />
                                    {recoveryMode === 'pw' && <Input placeholder="아이디" value={findId} onChange={e => setFindId(e.target.value)} className="h-12 bg-white/50 dark:bg-black/30" />}
                                </div>
                                <Button onClick={handleRecovery} className="w-full h-12 bg-blue-600 hover:bg-blue-500">
                                    {recoveryMode === 'id' ? '아이디 찾기' : '재설정 이메일 발송'}
                                </Button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
            
            <style>{`
                @keyframes blob {
                    0% { transform: translate(0px, 0px) scale(1); }
                    33% { transform: translate(30px, -50px) scale(1.1); }
                    66% { transform: translate(-20px, 20px) scale(0.9); }
                    100% { transform: translate(0px, 0px) scale(1); }
                }
                .animate-blob {
                    animation: blob 7s infinite;
                }
                .animation-delay-2000 {
                    animation-delay: 2s;
                }
                .animation-delay-4000 {
                    animation-delay: 4s;
                }
            `}</style>
        </div>
    );
};
