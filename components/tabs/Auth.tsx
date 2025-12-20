
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useGame } from '../../context/GameContext';
import { Button, Input, LineIcon, Modal } from '../Shared';
import { UserSubType, GovtBranch, User } from '../../types';
import { auth } from '../../services/firebase';
import { sendEmailVerification } from 'firebase/auth';

type ViewMode = 'login' | 'signup' | 'email_change' | 'find_pw' | 'notif_setup';

export const AuthView: React.FC = () => {
    const { login, registerUser, showModal, requestPasswordReset, db, requestNotificationPermission } = useGame();
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

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [passwordConfirm, setPasswordConfirm] = useState('');
    const [step, setStep] = useState(1);
    const [isProcessing, setIsProcessing] = useState(false);
    
    const [subType, setSubType] = useState<UserSubType | 'teacher'>('personal');
    const [sName, setSName] = useState('');
    const [sBirth, setSBirth] = useState('');
    const [govtRole, setGovtRole] = useState('');
    
    const [agreedTerms, setAgreedTerms] = useState<Record<string, boolean>>({});
    const [currentTermIndex, setCurrentTermIndex] = useState(0);

    const consents = useMemo(() => {
        const raw = db.settings.consents || {};
        return Object.entries(raw).map(([key, val]) => ({ key, ...(val as any) }));
    }, [db.settings.consents]);

    const allMandatoryAgreed = consents.every(c => c.isMandatory === false || agreedTerms[c.key]);
    const verificationInterval = useRef<any>(null);

    useEffect(() => {
        return () => { if (verificationInterval.current) clearInterval(verificationInterval.current); };
    }, []);

    const handleLogin = async () => {
        if (!email || !password) return showModal("정보를 입력하세요.");
        const success = await login(email, password);
        if (success) {
            setView('notif_setup');
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
            setStep(3);
        } else if (step === 3) {
            if (!email.includes('@')) return showModal("유효한 이메일을 입력하세요.");
            if (password.length < 8) return showModal("비밀번호는 8자리 이상이어야 합니다.");
            if (password !== passwordConfirm) return showModal("비밀번호가 일치하지 않습니다.");
            
            setIsProcessing(true);
            try {
                let finalType: User['type'] = 'citizen';
                let branches: GovtBranch[] = [];
                let status: User['approvalStatus'] = 'pending';

                if (subType === 'personal') finalType = 'citizen';
                else if (subType === 'business') finalType = 'mart';
                else if (subType === 'teacher') finalType = 'teacher';
                else if (subType === 'govt') {
                    finalType = 'government';
                    if (['대통령', '법무부장관', '한국은행장', '검사'].includes(govtRole)) branches = ['executive'];
                    else if (govtRole === '국회의원') branches = ['legislative'];
                    else if (govtRole === '판사') branches = ['judicial'];
                    if (govtRole === '한국은행장' || sName.trim() === '한국은행') status = 'approved';
                }

                await registerUser({
                    email: email.trim(), 
                    id: email.trim(), 
                    name: sName.trim(), 
                    type: finalType, 
                    subType: subType === 'teacher' ? 'teacher' : subType,
                    birthDate: sBirth.trim(), 
                    govtBranch: branches, 
                    govtRole,
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

    const handlePasswordResetRequest = async () => {
        if(!email) return showModal("이메일을 입력하세요.");
        setIsProcessing(true);
        const success = await requestPasswordReset(email);
        setIsProcessing(false);
        if (success) {
            showModal("재설정 링크가 발송되었습니다.");
            setStep(5);
            setTimeout(() => setView('login'), 4000);
        }
    };

    const getInfo = () => {
        if (view === 'login') return { title: "성화 은행", desc: "서비스 이용을 위해\n로그인해주세요." };
        if (view === 'notif_setup') return { title: "알림 설정", desc: "더 빠른 소식을 위해\n알림 방식을 선택하세요." };
        if (view === 'signup') {
            switch(step) {
                case 1: return { title: "약관 동의", desc: "관리자가 등록한\n이용 약관입니다." };
                case 2: return { title: "정보 입력", desc: "사용하실 실명과\n역할을 선택하세요." };
                case 3: return { title: "계정 생성", desc: "사용하실 이메일과\n비밀번호를 입력하세요." };
                case 4: return { title: "이메일 인증", desc: "메일함의 인증 링크를\n클릭하여 완료하세요." };
                default: return { title: "가입 완료", desc: "가입을 축하합니다!" };
            }
        }
        return { title: "성화 은행", desc: "" };
    };

    const info = getInfo();

    return (
        <div className="fixed inset-0 flex items-center justify-center bg-[#F2F2F7] dark:bg-[#050505] p-0 sm:p-4 overflow-hidden font-sans">
            <div className="w-full max-w-5xl h-full sm:h-[720px] bg-white dark:bg-[#1C1C1E] backdrop-blur-[40px] border border-gray-200 dark:border-white/10 shadow-xl rounded-none sm:rounded-[40px] flex flex-col sm:flex-row overflow-hidden">
                <div className="sm:hidden w-full px-6 pt-8 pb-4 flex items-center justify-between shrink-0">
                    <button onClick={goBack} className="p-2 -ml-2 text-gray-500"><LineIcon icon="arrow-left" className="w-6 h-6" /></button>
                    <div className="text-center">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{view === 'signup' ? `Step ${step}` : view.toUpperCase()}</p>
                        <h1 className="text-lg font-black dark:text-white">{info.title}</h1>
                    </div>
                    <div className="w-10"></div>
                </div>

                <div className="hidden sm:flex flex-col justify-start p-12 pt-24 w-[35%] border-r border-gray-100 dark:border-white/5 bg-gray-50/5 dark:bg-white/5">
                    <div className="w-12 h-12 bg-green-600 rounded-[18px] flex items-center justify-center text-white mb-8 shadow-lg">
                        <LineIcon icon="finance" className="w-7 h-7" />
                    </div>
                    <div className="animate-fade-in">
                        {view !== 'login' && <button onClick={goBack} className="text-xs font-bold text-green-600 mb-2 flex items-center gap-1">← 뒤로가기</button>}
                        <h1 className="text-3xl font-black tracking-tighter text-black dark:text-white mb-4 leading-tight whitespace-pre-line">{info.title}</h1>
                        <p className="text-gray-500 dark:text-white/60 text-base font-medium leading-relaxed break-keep whitespace-pre-line">{info.desc}</p>
                    </div>
                </div>

                <div className="flex-1 p-6 sm:p-16 flex flex-col justify-center items-center relative z-10 overflow-y-auto">
                    <div className="w-full max-w-sm space-y-6 animate-fade-in">
                        {view === 'login' && (
                            <div className="space-y-6">
                                <div className="space-y-3">
                                    <Input placeholder="이메일 주소" value={email} onChange={e => setEmail(e.target.value)} className="h-14" />
                                    <Input type="password" placeholder="비밀번호" value={password} onChange={e => setPassword(e.target.value)} className="h-14" />
                                </div>
                                <Button onClick={handleLogin} className="w-full h-14 text-lg rounded-2xl bg-green-600">접속하기</Button>
                                <div className="flex justify-between items-center px-1 pt-4 border-t border-gray-100 dark:border-white/5">
                                    <button onClick={() => navigateTo('signup')} className="text-sm font-bold text-gray-500 hover:text-green-600">회원가입</button>
                                    <button onClick={() => navigateTo('find_pw')} className="text-xs text-gray-400">PW 재설정</button>
                                </div>
                            </div>
                        )}

                        {view === 'notif_setup' && (
                            <div className="space-y-6">
                                <h3 className="text-center font-bold text-lg mb-2">알림 권한 설정</h3>
                                <p className="text-xs text-center text-gray-500">네이티브 알림 사용 시 더 정확한 정보를 즉시 받을 수 있습니다.</p>
                                <div className="space-y-3">
                                    <Button onClick={() => { requestNotificationPermission('native'); window.location.reload(); }} className="w-full py-4 bg-blue-600">네이티브 알림 (권장)</Button>
                                    <Button onClick={() => { requestNotificationPermission('browser'); window.location.reload(); }} variant="secondary" className="w-full py-4">브라우저 토스트 알림</Button>
                                </div>
                            </div>
                        )}

                        {view === 'signup' && (
                            <div className="space-y-6">
                                <div className="flex gap-1.5 mb-2">
                                    {[1,2,3,4].map(s => <div key={s} className={`h-1 flex-1 rounded-full ${step >= s ? 'bg-green-500/30' : 'bg-gray-200 dark:bg-white/10'} ${step === s ? 'bg-green-500' : ''}`}></div>)}
                                </div>
                                {step === 1 && (
                                    <div className="space-y-3">
                                        <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                                            {consents.map((c, idx) => (
                                                <div key={c.key} className={`border rounded-2xl transition-all overflow-hidden ${currentTermIndex === idx ? 'border-green-500 bg-green-50/5' : 'border-gray-100 dark:border-white/5'}`}>
                                                    <button onClick={() => setCurrentTermIndex(idx)} className="w-full p-4 flex justify-between items-center text-left">
                                                        <span className="font-bold text-sm dark:text-white">{idx + 1}. {c.title} {c.isMandatory !== false && <span className="text-red-500 ml-1">(필수)</span>}</span>
                                                    </button>
                                                    {currentTermIndex === idx && (
                                                        <div className="px-4 pb-4">
                                                            <div className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed mb-4 p-3 bg-gray-50 dark:bg-white/5 rounded-xl" dangerouslySetInnerHTML={{ __html: c.content }} />
                                                            <label className="flex items-center gap-3 cursor-pointer"><input type="checkbox" checked={!!agreedTerms[c.key]} onChange={e => setAgreedTerms({ ...agreedTerms, [c.key]: e.target.checked })} className="accent-green-600 w-5 h-5" /><span className="text-sm font-bold dark:text-white">동의합니다.</span></label>
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {step === 2 && (
                                    <div className="space-y-4">
                                        <Input placeholder="실명" value={sName} onChange={e => setSName(e.target.value)} className="h-14" />
                                        <Input placeholder="생년월일 (YYMMDD)" value={sBirth} onChange={e => setSBirth(e.target.value)} maxLength={6} className="h-14" />
                                        <div className="grid grid-cols-2 gap-2">
                                            {[{ id: 'personal', label: '개인' }, { id: 'business', label: '사업자' }, { id: 'govt', label: '공무원' }, { id: 'teacher', label: '교사' }].map(t => (
                                                <button key={t.id} onClick={() => setSubType(t.id as any)} className={`py-3 rounded-xl font-bold border ${subType === t.id ? 'bg-green-600 text-white' : 'bg-white dark:bg-[#2D2D2D]'}`}>{t.label}</button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {step === 3 && (
                                    <div className="space-y-3">
                                        <Input placeholder="이메일 주소" value={email} onChange={e => setEmail(e.target.value)} className="h-14" />
                                        <Input type="password" placeholder="비밀번호" value={password} onChange={e => setPassword(e.target.value)} className="h-14" />
                                        <Input type="password" placeholder="비밀번호 확인" value={passwordConfirm} onChange={e => setPasswordConfirm(e.target.value)} className="h-14" />
                                    </div>
                                )}
                                {step === 4 && (
                                    <div className="text-center py-6 animate-pulse">
                                        <div className="w-20 h-20 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto mb-6"><LineIcon icon="mail" className="text-blue-500 w-10 h-10" /></div>
                                        <p className="font-bold">이메일 인증 대기 중</p>
                                        <button onClick={handleResendEmail} className="text-xs text-blue-600 underline">인증 메일 재발송</button>
                                    </div>
                                )}
                                {step === 5 && (
                                    <div className="text-center py-6">
                                        <div className="w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-6"><LineIcon icon="check" className="text-green-500 w-10 h-10" /></div>
                                        <p className="text-xl font-bold">가입 처리 완료!</p>
                                    </div>
                                )}
                                <div className="flex gap-2">
                                    {step > 1 && step < 4 && <button onClick={() => setStep(step-1)} className="flex-1 h-14 bg-gray-100 dark:bg-white/5 text-gray-500 font-bold rounded-2xl">이전</button>}
                                    {step < 4 && <Button onClick={handleSignupNext} className="flex-[2] h-14 bg-green-600 font-bold rounded-2xl">{step === 3 ? '가입 신청' : '다음'}</Button>}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
