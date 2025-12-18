
import React, { useState, useEffect, useRef } from 'react';
import { useGame } from '../../context/GameContext';
import { Button, Input, LineIcon } from '../Shared';
import { UserSubType, GovtBranch, User } from '../../types';
import { auth, database } from '../../services/firebase';
import { sendEmailVerification } from 'firebase/auth';
import { ref, get } from 'firebase/database';

type ViewMode = 'login' | 'signup' | 'find_id' | 'find_pw';

export const AuthView: React.FC = () => {
    const { login, registerUser, showModal, requestPasswordReset } = useGame();
    const [view, setView] = useState<ViewMode>('login');

    // Form States
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
    const [agreeTerms, setAgreeTerms] = useState(false);

    const [findResult, setFindResult] = useState<string | null>(null);

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

    const startEmailCheck = () => {
        if (verificationInterval.current) clearInterval(verificationInterval.current);
        verificationInterval.current = setInterval(async () => {
            try {
                await auth.currentUser?.reload();
                if (auth.currentUser?.emailVerified) {
                    clearInterval(verificationInterval.current);
                    setStep(5); // Final success
                    setTimeout(() => setView('login'), 3000);
                }
            } catch (e) {
                console.error("Verification check error:", e);
            }
        }, 3000);
    };

    const handleSignupNext = async () => {
        if (isProcessing) return;

        // Step 1: Terms Agreement
        if (step === 1) {
            if (!agreeTerms) return showModal("약관에 동의해야 진행할 수 있습니다.");
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
                // Determine final type and branch
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

                    // [Special Logic] Bank of Korea Governor direct approval for the first person
                    // Fix: Use client-side filtering to avoid "Index not defined" error
                    if (govtRole === '한국은행장') {
                        const usersSnap = await get(ref(database, 'users'));
                        const users = usersSnap.val() || {};
                        const governorExists = Object.values(users).some((u: any) => u.govtRole === '한국은행장');
                        if (!governorExists) {
                            status = 'approved';
                        }
                    }
                }

                // Call GameContext register (handles Firebase Auth and DB set)
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

                // Success: Move to verification step
                setStep(4);
                startEmailCheck();
            } catch (e: any) {
                console.error("Signup error:", e);
                showModal("가입 처리 중 오류가 발생했습니다: " + (e.message || "알 수 없는 오류"));
            } finally {
                setIsProcessing(false);
            }
        }
    };

    const handleFindId = async () => {
        if (!sName.trim() || !sBirth.trim()) return showModal("이름과 생년월일을 입력하세요.");
        try {
            // Fix: Use client-side filtering to avoid "Index not defined" error
            const usersSnap = await get(ref(database, 'users'));
            const users = usersSnap.val() || {};
            const foundUser = Object.values(users).find((u: any) => u.name === sName.trim() && u.birthDate === sBirth.trim()) as any;
            
            if (foundUser) {
                setFindResult(`찾으시는 아이디(이메일)는 ${foundUser.email || foundUser.id} 입니다.`);
            } else {
                showModal("일치하는 정보를 찾을 수 없습니다.");
            }
        } catch (e) {
            showModal("조회 중 오류가 발생했습니다.");
        }
    };

    const getLeftContent = () => {
        if (view === 'login') return { title: "성화 은행", desc: "서비스 이용을 위해\n로그인해주세요." };
        if (view === 'find_id') return { title: "아이디 찾기", desc: "실명과 생년월일로\n계정을 찾습니다." };
        if (view === 'find_pw') return { title: "비밀번호 찾기", desc: "이메일로 재설정\n링크를 보냅니다." };
        if (view === 'signup') {
            switch(step) {
                case 1: return { title: "약관 동의", desc: "성화 은행 시뮬레이션\n이용 약관입니다." };
                case 2: return { title: "정보 입력", desc: "사용하실 실명과\n역할을 선택하세요." };
                case 3: return { title: "계정 생성", desc: "사용하실 이메일과\n비밀번호를 입력하세요." };
                case 4: return { title: "이메일 인증", desc: "메일함의 인증 링크를\n클릭하여 완료하세요." };
                default: return { title: "가입 완료", desc: "가입을 축하합니다!" };
            }
        }
        return { title: "성화 은행", desc: "" };
    };

    const info = getLeftContent();

    return (
        <div className="fixed inset-0 flex items-center justify-center bg-[#F2F2F7] dark:bg-[#050505] p-0 sm:p-4 overflow-hidden font-sans">
            <div className="w-full max-w-5xl h-full sm:h-[680px] bg-white dark:bg-white/10 backdrop-blur-[40px] border border-gray-200 dark:border-white/10 shadow-xl rounded-none sm:rounded-[40px] flex flex-col sm:flex-row overflow-hidden">
                
                {/* Left Panel (Side Guide) */}
                <div className="hidden sm:flex flex-col justify-center p-12 w-[35%] border-r border-gray-100 dark:border-white/5 bg-gray-50/50 dark:bg-white/5">
                    <div className="w-12 h-12 bg-green-600 rounded-[18px] flex items-center justify-center text-white mb-8 shadow-lg">
                        <LineIcon icon="finance" className="w-7 h-7" />
                    </div>
                    <div className="animate-fade-in">
                        <h1 className="text-3xl font-black tracking-tighter text-black dark:text-white mb-4 leading-tight whitespace-pre-line">{info.title}</h1>
                        <p className="text-gray-500 dark:text-white/60 text-base font-medium leading-relaxed break-keep whitespace-pre-line">{info.desc}</p>
                    </div>
                    <div className="mt-auto space-y-3">
                        <button onClick={() => { setView('login'); setStep(1); }} className="text-xs font-bold text-gray-400 hover:text-green-600 transition-colors block">로그인 화면으로</button>
                        <button onClick={() => { setView('signup'); setStep(1); }} className="text-xs font-bold text-gray-400 hover:text-green-600 transition-colors block">새 계정 만들기</button>
                    </div>
                </div>

                {/* Right Panel (Input Area) */}
                <div className="flex-1 p-6 sm:p-16 flex flex-col justify-center items-center relative z-10 overflow-y-auto">
                    <div className="w-full max-w-sm space-y-6 animate-fade-in">
                        
                        {view === 'login' && (
                            <div className="space-y-6">
                                <h2 className="text-2xl font-black text-black dark:text-white text-center">로그인</h2>
                                <div className="space-y-3">
                                    <Input placeholder="이메일 주소" value={email} onChange={e => setEmail(e.target.value)} className="h-14" />
                                    <Input type="password" placeholder="비밀번호" value={password} onChange={e => setPassword(e.target.value)} className="h-14" />
                                </div>
                                <Button onClick={handleLogin} className="w-full h-14 text-lg rounded-2xl bg-green-600">접속하기</Button>
                                <div className="flex justify-between items-center px-1 pt-4 border-t border-gray-100 dark:border-white/5">
                                    <button onClick={() => setView('signup')} className="text-sm font-bold text-gray-500 hover:text-green-600">회원가입</button>
                                    <div className="flex gap-4">
                                        <button onClick={() => setView('find_id')} className="text-xs text-gray-400 hover:text-black">ID 찾기</button>
                                        <button onClick={() => setView('find_pw')} className="text-xs text-gray-400 hover:text-black">PW 재설정</button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {view === 'signup' && (
                            <div className="space-y-6">
                                <div className="flex gap-1.5 mb-2">
                                    {[1,2,3,4].map(s => <div key={s} className={`h-1 flex-1 rounded-full ${step >= s ? 'bg-green-50' : 'bg-gray-200 dark:bg-white/10'} ${step === s ? 'bg-green-500' : ''}`}></div>)}
                                </div>
                                
                                {step === 1 && (
                                    <div className="space-y-4">
                                        <div className="h-64 overflow-y-auto p-4 bg-gray-50 dark:bg-white/5 rounded-2xl text-xs text-gray-500 dark:text-white/40 border border-gray-100 dark:border-white/10 leading-relaxed">
                                            <h4 className="font-bold mb-2">성화 은행 서비스 이용 약관</h4>
                                            <p>1. 본 서비스는 교육적 목적의 금융 시뮬레이션입니다.</p>
                                            <p>2. 실제 화폐 가치는 존재하지 않으며, 모든 데이터는 예고 없이 초기화될 수 있습니다.</p>
                                            <p>3. 타인의 정보를 도용하거나 시스템을 악용하는 경우 계정이 영구 정지될 수 있습니다.</p>
                                            <p>4. 가입 시 입력하는 실명과 생년월일은 신분증 자동 발급 및 금융 실명제 구현을 위해 사용됩니다.</p>
                                        </div>
                                        <label className="flex items-center gap-3 p-4 bg-gray-50 dark:bg-white/5 rounded-2xl cursor-pointer">
                                            <input type="checkbox" checked={agreeTerms} onChange={e => setAgreeTerms(e.target.checked)} className="accent-green-600 w-5 h-5" />
                                            <span className="text-black dark:text-white text-sm font-bold">약관을 모두 읽었으며 동의합니다.</span>
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
                                                <button key={t.id} onClick={() => setSubType(t.id as any)} className={`py-3 rounded-xl font-bold border transition-all text-sm ${subType === t.id ? 'bg-green-600 border-green-500 text-white shadow-md' : 'bg-white dark:bg-black/20 border-gray-200 dark:border-white/10 text-gray-500'}`}>{t.label}</button>
                                            ))}
                                        </div>
                                        
                                        {subType === 'govt' && (
                                            <div className="animate-slide-up">
                                                <label className="text-xs font-bold text-gray-500 mb-1 block px-1">상세 직책 선택</label>
                                                <select 
                                                    value={govtRole} 
                                                    onChange={e => setGovtRole(e.target.value)}
                                                    className="w-full h-14 rounded-2xl bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-white/10 px-4 text-sm font-bold outline-none dark:text-white"
                                                >
                                                    <option value="">직책을 선택하세요</option>
                                                    <optgroup label="행정부">
                                                        <option value="대통령">대통령</option>
                                                        <option value="법무부장관">법무부장관</option>
                                                        <option value="한국은행장">한국은행장 (1인 한정 즉시 승인)</option>
                                                        <option value="검사">검사</option>
                                                    </optgroup>
                                                    <optgroup label="사법부">
                                                        <option value="판사">판사</option>
                                                    </optgroup>
                                                    <optgroup label="입법부">
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
                                        <p className="text-[10px] text-gray-400 px-1">* 입력하신 이메일로 인증 메일이 발송됩니다.</p>
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
                                        <p className="text-black dark:text-white text-xl font-bold mb-2">인증 완료!</p>
                                        <p className="text-sm text-gray-500">잠시 후 로그인 화면으로 이동합니다.</p>
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

                        {view === 'find_id' && (
                            <div className="space-y-6">
                                <h2 className="text-2xl font-bold text-black dark:text-white text-center">아이디 찾기</h2>
                                {findResult ? (
                                    <div className="p-6 bg-gray-50 dark:bg-white/5 rounded-2xl text-center">
                                        <p className="text-sm text-gray-500 mb-2">조회 결과</p>
                                        <p className="text-lg font-bold dark:text-white break-all">{findResult}</p>
                                        <Button onClick={() => setView('login')} className="w-full mt-6 h-14">로그인하러 가기</Button>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        <Input placeholder="이름" value={sName} onChange={e => setSName(e.target.value)} className="h-14" />
                                        <Input placeholder="생년월일 (YYMMDD)" value={sBirth} onChange={e => setSBirth(e.target.value)} className="h-14" />
                                        <Button onClick={handleFindId} className="w-full h-14">찾기</Button>
                                    </div>
                                )}
                                <button onClick={() => setView('login')} className="w-full text-gray-400 text-sm">돌아가기</button>
                            </div>
                        )}

                        {view === 'find_pw' && (
                            <div className="space-y-6">
                                <h2 className="text-2xl font-bold text-black dark:text-white text-center">PW 재설정</h2>
                                <div className="space-y-3">
                                    <Input placeholder="가입한 이메일 주소" value={email} onChange={e => setEmail(e.target.value)} className="h-14" />
                                    <Button onClick={async () => {
                                        if(!email) return showModal("이메일을 입력하세요.");
                                        await requestPasswordReset(email);
                                    }} className="w-full h-14">재설정 링크 발송</Button>
                                </div>
                                <button onClick={() => setView('login')} className="w-full text-gray-400 text-sm">돌아가기</button>
                            </div>
                        )}

                    </div>
                </div>
            </div>
        </div>
    );
};
