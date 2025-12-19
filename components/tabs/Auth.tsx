import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useGame } from '../../context/GameContext';
import { Button, Input, LineIcon } from '../Shared';
import { UserSubType, GovtBranch, User } from '../../types';
import { auth, database } from '../../services/firebase';
import { sendEmailVerification } from 'firebase/auth';
import { ref, get } from 'firebase/database';

type ViewMode = 'login' | 'signup' | 'email_change' | 'find_pw';

export const AuthView: React.FC = () => {
    const { login, registerUser, showModal, requestPasswordReset, db } = useGame();
    const [view, setView] = useState<ViewMode>('login');

    // Navigation Stack for "Back" button
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

    // Form States (Not in localStorage as requested)
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [passwordConfirm, setPasswordConfirm] = useState('');
    const [step, setStep] = useState(1);
    const [isProcessing, setIsProcessing] = useState(false);
    
    // SignUp Details
    const [subType, setSubType] = useState<UserSubType | 'teacher'>('personal');
    const [sName, setSName] = useState('');
    const [sBirth, setSBirth] = useState('');
    const [govtRole, setGovtRole] = useState('');
    
    // Terms Agreement States
    const [agreedTerms, setAgreedTerms] = useState<Record<string, boolean>>({});
    const [currentTermIndex, setCurrentTermIndex] = useState(0);

    const consents = useMemo(() => {
        const raw = db.settings.consents || {};
        /* Fix: Spread types may only be created from object types. Explicitly cast val to any. */
        return Object.entries(raw).map(([key, val]) => ({ key, ...(val as any) }));
    }, [db.settings.consents]);

    const allMandatoryAgreed = consents.every(c => c.isMandatory === false || agreedTerms[c.key]);

    const verificationInterval = useRef<any>(null);

    useEffect(() => {
        return () => {
            if (verificationInterval.current) clearInterval(verificationInterval.current);
        };
    }, []);

    const handleLogin = async () => {
        if (!email || !password) return showModal("정보를 입력하세요.");
        await login(email, password);
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
                    setStep(5); // Final success
                    setTimeout(() => setView(targetView), 2500);
                }
            } catch (e) {
                console.error("Verification check error:", e);
            }
        }, 3000);
    };

    const handleSignupNext = async () => {
        if (isProcessing) return;

        // Step 1: Terms Agreement (Accordion style)
        if (step === 1) {
            if (!allMandatoryAgreed) return showModal("필수 약관에 모두 동의해야 합니다.");
            setStep(2);
        }
        // Step 2: Personal Info & Role
        else if (step === 2) {
            if (!sName.trim() || !sBirth.trim()) return showModal("이름과 생년월일을 입력하세요.");
            if (sBirth.length !== 6) return showModal("생년월일 6자리를 입력하세요 (YYMMDD).");
            if (subType === 'govt' && !govtRole) return showModal("공무원 직책을 선택하세요.");
            setStep(3);
        }
        // Step 3: Account Credentials & Submit
        else if (step === 3) {
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

                    if (govtRole === '한국은행장' || sName.trim() === '한국은행') {
                        status = 'approved';
                    }
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
            } finally {
                setIsProcessing(false);
            }
        }
    };

    const handleEmailChangeSubmit = async () => {
        if (!email.includes('@')) return showModal("유효한 이메일을 입력하세요.");
        setIsProcessing(true);
        try {
            // 이메일 변경 로직은 실제 Auth 유저가 있어야 하므로, 
            // 여기서는 '변경을 위한 이메일 인증 메일 발송' 시뮬레이션
            showModal(`${email} 주소로 인증 메일을 보냈습니다. 인증 완료 후 이메일이 변경됩니다.`);
            setStep(4);
            startEmailCheck('login');
        } catch (e) {
            showModal("오류가 발생했습니다.");
        } finally {
            setIsProcessing(false);
        }
    };

    const handlePasswordResetRequest = async () => {
        if(!email) return showModal("이메일을 입력하세요.");
        setIsProcessing(true);
        const success = await requestPasswordReset(email);
        setIsProcessing(false);
        if (success) {
            showModal("재설정 링크가 발송되었습니다. 링크 확인 후 비밀번호가 변경되면 자동으로 로그인 창으로 이동합니다.");
            setStep(5); // Show success message
            setTimeout(() => setView('login'), 4000);
        }
    };

    const getInfo = () => {
        if (view === 'login') return { title: "성화 은행", desc: "서비스 이용을 위해\n로그인해주세요." };
        if (view === 'email_change') return { title: "이메일 변경", desc: "계정의 이메일 주소를\n새로 설정합니다." };
        if (view === 'find_pw') return { title: "비밀번호 찾기", desc: "이메일로 재설정\n링크를 보냅니다." };
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
                
                {/* Mobile Header indicator */}
                <div className="sm:hidden w-full px-6 pt-8 pb-4 flex items-center justify-between shrink-0">
                    <button onClick={goBack} className="p-2 -ml-2 text-gray-500"><LineIcon icon="arrow-left" className="w-6 h-6" /></button>
                    <div className="text-center">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{view === 'signup' ? `Step ${step}` : view.toUpperCase()}</p>
                        <h1 className="text-lg font-black dark:text-white">{info.title}</h1>
                    </div>
                    <div className="w-10"></div>
                </div>

                {/* Left Panel (Side Guide) */}
                <div className="hidden sm:flex flex-col justify-center p-12 w-[35%] border-r border-gray-100 dark:border-white/5 bg-gray-50/50 dark:bg-white/5">
                    <div className="w-12 h-12 bg-green-600 rounded-[18px] flex items-center justify-center text-white mb-8 shadow-lg">
                        <LineIcon icon="finance" className="w-7 h-7" />
                    </div>
                    <div className="animate-fade-in">
                        {view !== 'login' && <button onClick={goBack} className="text-xs font-bold text-green-600 mb-2 flex items-center gap-1">← 뒤로가기</button>}
                        <h1 className="text-3xl font-black tracking-tighter text-black dark:text-white mb-4 leading-tight whitespace-pre-line">{info.title}</h1>
                        <p className="text-gray-500 dark:text-white/60 text-base font-medium leading-relaxed break-keep whitespace-pre-line">{info.desc}</p>
                    </div>
                    <div className="mt-auto space-y-3">
                        <button onClick={() => navigateTo('login')} className="text-xs font-bold text-gray-400 hover:text-green-600 transition-colors block">로그인 화면으로</button>
                        <button onClick={() => navigateTo('signup')} className="text-xs font-bold text-gray-400 hover:text-green-600 transition-colors block">새 계정 만들기</button>
                    </div>
                </div>

                {/* Right Panel (Input Area) */}
                <div className="flex-1 p-6 sm:p-16 flex flex-col justify-center items-center relative z-10 overflow-y-auto">
                    <div className="w-full max-w-sm space-y-6 animate-fade-in">
                        
                        {view === 'login' && (
                            <div className="space-y-6">
                                <h2 className="text-2xl font-black text-black dark:text-white text-center hidden sm:block">로그인</h2>
                                <div className="space-y-3">
                                    <Input placeholder="이메일 주소" value={email} onChange={e => setEmail(e.target.value)} className="h-14" />
                                    <Input type="password" placeholder="비밀번호" value={password} onChange={e => setPassword(e.target.value)} className="h-14" />
                                </div>
                                <Button onClick={handleLogin} className="w-full h-14 text-lg rounded-2xl bg-green-600">접속하기</Button>
                                <div className="flex justify-between items-center px-1 pt-4 border-t border-gray-100 dark:border-white/5">
                                    <button onClick={() => navigateTo('signup')} className="text-sm font-bold text-gray-500 hover:text-green-600">회원가입</button>
                                    <div className="flex gap-4">
                                        <button onClick={() => navigateTo('email_change')} className="text-xs text-gray-400 hover:text-black dark:hover:text-white">이메일 변경</button>
                                        <button onClick={() => navigateTo('find_pw')} className="text-xs text-gray-400 hover:text-black dark:hover:text-white">PW 재설정</button>
                                    </div>
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
                                                <div key={c.key} className={`border rounded-2xl transition-all overflow-hidden ${currentTermIndex === idx ? 'border-green-500 bg-green-50/5 dark:bg-green-500/5' : 'border-gray-100 dark:border-white/5'}`}>
                                                    <button 
                                                        onClick={() => setCurrentTermIndex(idx)}
                                                        className="w-full p-4 flex justify-between items-center text-left"
                                                    >
                                                        <span className="font-bold text-sm dark:text-white">
                                                            {idx + 1}. {c.title}
                                                            {c.isMandatory !== false && <span className="text-red-500 ml-1">(필수)</span>}
                                                        </span>
                                                        <LineIcon icon={currentTermIndex === idx ? 'arrow-up' : 'arrow-down'} className="w-4 h-4 text-gray-400" />
                                                    </button>
                                                    {currentTermIndex === idx && (
                                                        <div className="px-4 pb-4">
                                                            <div 
                                                                className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed mb-4 p-3 bg-gray-50 dark:bg-white/5 rounded-xl max-h-40 overflow-y-auto"
                                                                dangerouslySetInnerHTML={{ __html: c.content }}
                                                            />
                                                            <label className="flex items-center gap-3 cursor-pointer group">
                                                                <input 
                                                                    type="checkbox" 
                                                                    checked={!!agreedTerms[c.key]} 
                                                                    onChange={e => {
                                                                        setAgreedTerms({ ...agreedTerms, [c.key]: e.target.checked });
                                                                        if (e.target.checked && idx < consents.length - 1) setCurrentTermIndex(idx + 1);
                                                                    }}
                                                                    className="accent-green-600 w-5 h-5" 
                                                                />
                                                                <span className="text-sm font-bold dark:text-white group-hover:text-green-600">내용을 확인했으며 동의합니다.</span>
                                                            </label>
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                        <label className="flex items-center gap-3 p-4 bg-gray-50 dark:bg-white/5 rounded-2xl cursor-pointer">
                                            <input 
                                                type="checkbox" 
                                                checked={consents.every(c => agreedTerms[c.key])} 
                                                onChange={e => {
                                                    const newAgreed = { ...agreedTerms };
                                                    consents.forEach(c => newAgreed[c.key] = e.target.checked);
                                                    setAgreedTerms(newAgreed);
                                                }}
                                                className="accent-green-600 w-5 h-5" 
                                            />
                                            <span className="text-black dark:text-white text-sm font-black">모든 약관에 전체 동의합니다.</span>
                                        </label>
                                    </div>
                                )}
                                
                                {step === 2 && (
                                    <div className="space-y-4">
                                        <Input placeholder="실명" value={sName} onChange={e => setSName(e.target.value)} className="h-14" />
                                        <Input placeholder="생년월일 (YYMMDD)" value={sBirth} onChange={e => setSBirth(e.target.value)} maxLength={6} className="h-14" />
                                        <div className="grid grid-cols-2 gap-2">
                                            {[
                                                { id: 'personal', label: '개인(시민)' },
                                                { id: 'business', label: '사업자' },
                                                { id: 'govt', label: '공무원' },
                                                { id: 'teacher', label: '교사' }
                                            ].map(t => (
                                                <button key={t.id} onClick={() => setSubType(t.id as any)} className={`py-3 rounded-xl font-bold border transition-all text-sm ${subType === t.id ? 'bg-green-600 border-green-500 text-white shadow-md' : 'bg-white dark:bg-[#2D2D2D] border-gray-200 dark:border-white/10 text-gray-500 dark:text-gray-400'}`}>{t.label}</button>
                                            ))}
                                        </div>
                                        
                                        {subType === 'govt' && (
                                            <div className="animate-slide-up">
                                                <label className="text-xs font-bold text-gray-500 mb-1 block px-1">상세 직책 선택</label>
                                                <select 
                                                    value={govtRole} 
                                                    onChange={e => setGovtRole(e.target.value)}
                                                    className="w-full h-14 rounded-2xl bg-gray-50 dark:bg-[#2D2D2D] border border-gray-100 dark:border-white/10 px-4 text-sm font-bold outline-none text-black dark:text-white"
                                                >
                                                    <option value="" className="dark:bg-[#1C1C1E]">직책을 선택하세요</option>
                                                    <optgroup label="행정부" className="dark:bg-[#1C1C1E]">
                                                        <option value="대통령">대통령</option>
                                                        <option value="법무부장관">법무부장관</option>
                                                        <option value="한국은행장">한국은행장 (즉시 승인)</option>
                                                        <option value="검사">검사</option>
                                                    </optgroup>
                                                    <optgroup label="사법부" className="dark:bg-[#1C1C1E]">
                                                        <option value="판사">판사</option>
                                                    </optgroup>
                                                    <optgroup label="입법부" className="dark:bg-[#1C1C1E]">
                                                        <option value="국회의원">국회의원</option>
                                                    </optgroup>
                                                </select>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {step === 3 && (
                                    <div className="space-y-3">
                                        <Input placeholder="이메일 주소" value={email} onChange={e => setEmail(e.target.value)} className="h-14" disabled={isProcessing} />
                                        <Input type="password" placeholder="비밀번호 (8자 이상)" value={password} onChange={e => setPassword(e.target.value)} className="h-14" disabled={isProcessing} />
                                        <Input type="password" placeholder="비밀번호 확인" value={passwordConfirm} onChange={e => setPasswordConfirm(e.target.value)} className="h-14" disabled={isProcessing} />
                                        <div className="bg-blue-50 dark:bg-blue-900/10 p-3 rounded-xl border border-blue-100 dark:border-blue-900/30">
                                            <p className="text-[11px] text-blue-700 dark:text-blue-400 font-medium leading-relaxed">
                                                * 같은 이메일로 여러 계정을 가입하신다면, 보안을 위해 비밀번호를 다르게 설정하시는 것을 권장합니다.
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {step === 4 && (
                                    <div className="text-center py-6 animate-pulse">
                                        <div className="w-20 h-20 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto mb-6"><LineIcon icon="mail" className="text-blue-500 w-10 h-10" /></div>
                                        <p className="text-black dark:text-white text-lg font-bold mb-1">이메일 인증 대기 중</p>
                                        <p className="text-xs text-gray-500 mb-6">{email} 주소의<br/>인증 링크를 클릭해주세요.</p>
                                        <button onClick={handleResendEmail} className="text-xs text-blue-600 underline font-bold">인증 메일 재발송</button>
                                    </div>
                                )}

                                {step === 5 && (
                                    <div className="text-center py-6">
                                        <div className="w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-6"><LineIcon icon="check" className="text-green-500 w-10 h-10" /></div>
                                        <p className="text-black dark:text-white text-xl font-bold mb-2">처리 완료!</p>
                                        <p className="text-sm text-gray-500">잠시 후 이전 화면으로 이동합니다.</p>
                                    </div>
                                )}

                                <div className="flex gap-2">
                                    {step > 1 && step < 4 && <button onClick={() => setStep(step-1)} className="flex-1 h-14 bg-gray-100 dark:bg-white/5 text-gray-500 font-bold rounded-2xl" disabled={isProcessing}>이전</button>}
                                    {step < 4 && (
                                        <Button onClick={handleSignupNext} className="flex-[2] h-14 bg-green-600 font-bold rounded-2xl" disabled={isProcessing}>
                                            {isProcessing ? "처리 중..." : (step === 3 ? '가입 신청' : '다음')}
                                        </Button>
                                    )}
                                </div>
                            </div>
                        )}

                        {view === 'email_change' && (
                            <div className="space-y-6">
                                <h2 className="text-2xl font-bold text-black dark:text-white text-center hidden sm:block">이메일 변경</h2>
                                {step === 1 && (
                                    <div className="space-y-4">
                                        <p className="text-sm text-gray-500 dark:text-gray-400 break-keep">새로 사용할 이메일 주소를 입력하세요. 인증 완료 후 계정 이메일이 변경됩니다.</p>
                                        <Input placeholder="새 이메일 주소" value={email} onChange={e => setEmail(e.target.value)} className="h-14" />
                                        <Button onClick={handleEmailChangeSubmit} className="w-full h-14">인증 메일 발송</Button>
                                    </div>
                                )}
                                {step === 4 && (
                                    <div className="text-center py-6 animate-pulse">
                                        <div className="w-20 h-20 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto mb-6"><LineIcon icon="mail" className="text-blue-500 w-10 h-10" /></div>
                                        <p className="text-black dark:text-white text-lg font-bold mb-1">새 이메일 인증 대기 중</p>
                                        <p className="text-xs text-gray-500 mb-6">{email} 주소의<br/>인증 링크를 클릭해주세요.</p>
                                        <button onClick={handleResendEmail} className="text-xs text-blue-600 underline font-bold">인증 메일 재발송</button>
                                    </div>
                                )}
                                {step === 5 && (
                                    <div className="text-center py-6">
                                        <div className="w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-6"><LineIcon icon="check" className="text-green-500 w-10 h-10" /></div>
                                        <p className="text-black dark:text-white text-xl font-bold mb-2">이메일 변경 완료!</p>
                                        <p className="text-sm text-gray-500">잠시 후 로그인 화면으로 이동합니다.</p>
                                    </div>
                                )}
                                <button onClick={goBack} className="w-full text-gray-400 text-sm">돌아가기</button>
                            </div>
                        )}

                        {view === 'find_pw' && (
                            <div className="space-y-6">
                                <h2 className="text-2xl font-bold text-black dark:text-white text-center hidden sm:block">PW 재설정</h2>
                                {step === 1 && (
                                    <div className="space-y-3">
                                        <p className="text-sm text-gray-500 dark:text-gray-400 break-keep">가입하신 이메일 주소를 입력하시면 비밀번호 재설정 링크를 보내드립니다.</p>
                                        <Input placeholder="가입한 이메일 주소" value={email} onChange={e => setEmail(e.target.value)} className="h-14" />
                                        <Button onClick={handlePasswordResetRequest} className="w-full h-14" disabled={isProcessing}>
                                            {isProcessing ? "처리 중..." : "재설정 링크 발송"}
                                        </Button>
                                    </div>
                                )}
                                {step === 5 && (
                                    <div className="text-center py-6">
                                        <div className="w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-6"><LineIcon icon="check" className="text-green-500 w-10 h-10" /></div>
                                        <p className="text-black dark:text-white text-xl font-bold mb-2">링크 발송 완료!</p>
                                        <p className="text-sm text-gray-500 break-keep">메일함의 링크를 통해 비밀번호를 변경해주세요.<br/>변경 완료 후 다시 로그인해주세요.</p>
                                    </div>
                                )}
                                <button onClick={goBack} className="w-full text-gray-400 text-sm">돌아가기</button>
                            </div>
                        )}

                    </div>
                </div>
            </div>
        </div>
    );
};
