import React, { useState, useEffect } from 'react';
import { useGame } from '../../context/GameContext';
import { Button, Input, Card, NoPasteInput, Modal, formatName } from '../Shared';
import { saveDb } from '../../services/firebase';
import { User, UserSubType, GovtBranch } from '../../types';

export const AuthView: React.FC = () => {
    const { login, showPinModal, showModal, db, updateUser, simulateSMS, createSignupSession, validateSignupCode } = useGame();
    const [view, setView] = useState<'login' | 'signup' | 'find'>('login');
    
    const [loginId, setLoginId] = useState('');
    const [loginPass, setLoginPass] = useState('');
    const [rememberMe, setRememberMe] = useState(false);
    
    const [recentLogins, setRecentLogins] = useState<any[]>([]);

    const [subType, setSubType] = useState<UserSubType | 'root'>('personal');
    const [step, setStep] = useState(1);
    
    const [sId, setSId] = useState('');
    const [sPw, setSPw] = useState('');
    const [sPwConfirm, setSPwConfirm] = useState('');
    
    const [sPhone, setSPhone] = useState('');
    const [sAuthCode, setSAuthCode] = useState(''); 
    const [sSentCode, setSSentCode] = useState('');
    
    // Removed Admin Code Verification steps
    // const [sSessionId, setSSessionId] = useState<string | null>(null);
    // const [sAdminCode, setSAdminCode] = useState(''); 

    const [sName, setSName] = useState('');
    const [sBirth, setSBirth] = useState('');
    const [sJob, setSJob] = useState('');
    const [sBranch, setSBranch] = useState<GovtBranch>('executive');
    const [sJointOwners, setSJointOwners] = useState<string[]>([]);
    const [isCorporation, setIsCorporation] = useState(false);
    const [isPresident, setIsPresident] = useState(false);
    
    const [sConsents, setSConsents] = useState<Record<string, boolean>>({});

    const [findName, setFindName] = useState('');

    useEffect(() => {
        resetSignupForm();
        const history = JSON.parse(localStorage.getItem('sh_login_history') || '[]');
        setRecentLogins(history);
    }, [view]);

    const resetSignupForm = () => {
        setLoginId(''); setLoginPass(''); setSId(''); setSPw(''); setSPwConfirm('');
        setSPhone(''); setSAuthCode(''); setSSentCode(''); setSName('');
        setSBirth(''); setSJob(''); setSJointOwners([]); setSBranch('executive');
        setIsCorporation(false);
        setIsPresident(false);
        setStep(1);
    };

    const handleLogin = async () => {
        // Try to find user first for PIN login check
        const users = Object.values(db.users) as User[];
        const user = users.find(u => u.id === loginId);

        if (user && user.pin && !loginPass) {
            const pin = await showPinModal(`${formatName(user.name)}님, 로그인하시겠습니까?`, user.pin, user.pinLength || 4);
            if (pin === user.pin) {
                // Pin matched, bypass password
                await login(user.id!, user.password!, rememberMe, true);
                return;
            } else {
                return showModal("간편번호가 일치하지 않습니다.");
            }
        }

        const success = await login(loginId, loginPass, rememberMe);
        if (success && user) {
            if (!user.pin) {
                const newPin = await showPinModal("새로운 간편번호 4자리를 등록하세요.", undefined, 4);
                if (newPin) updateUser(user.name, { pin: newPin, pinLength: 4 });
            }
        }
    };

    const handleRecentLogin = async (historyUser: any) => {
        const user = (Object.values(db.users) as User[]).find(u => u.id === historyUser.id);
        if (!user) {
            const newHistory = recentLogins.filter(h => h.id !== historyUser.id);
            setRecentLogins(newHistory);
            localStorage.setItem('sh_login_history', JSON.stringify(newHistory));
            return showModal("계정 정보를 찾을 수 없습니다.");
        }

        const pin = await showPinModal(`${formatName(user.name)}님, 로그인하시겠습니까?`, user.pin || undefined, user.pinLength || 4);
        if (pin === user.pin) {
            await login(user.id!, user.password!, true, true); 
        } else {
            showModal("간편번호가 일치하지 않습니다.");
        }
    };

    const handleSendAuth = () => {
        if (!sPhone) return showModal("전화번호를 입력하세요.");
        const code = simulateSMS(sPhone);
        setSSentCode(code);
    };

    const handleNext = async () => {
        if (step === 1) {
            if (!sId || !sPw) return showModal("아이디/비밀번호를 입력하세요.");
            if (sPw !== sPwConfirm) return showModal("비밀번호가 일치하지 않습니다.");
            if (sPw.length < 4) return showModal("비밀번호는 4자 이상이어야 합니다.");
            if (Object.values(db.users).some((u: any) => u.id === sId)) return showModal("이미 사용중인 아이디입니다.");
            
            if (subType === 'teacher' || subType === 'root') {
                setStep(4);
            } else {
                setStep(2);
            }
        } else if (step === 2) {
            if (!sPhone || !sAuthCode) return showModal("전화번호 인증을 완료해주세요.");
            if (sAuthCode !== sSentCode) return showModal("인증번호가 틀렸습니다.");
            if (subType === 'govt' && !sPhone.startsWith('010')) return showModal("각 부처 장의 대표 번호를 입력하시오.");
            
            // Skip Admin Code, go directly to Info
            setStep(4);
        } else if (step === 4) {
            if (!sName.trim()) return showModal("이름을 입력하세요.");
            if (/[.#$/\[\]]/.test(sName)) return showModal("이름에 특수문자(., #, $, /, [, ])를 포함할 수 없습니다.");
            
            if (isPresident) {
                const existingPres = (Object.values(db.users) as User[]).find(u => u.isPresident);
                if (existingPres) return showModal("이미 대통령 계정이 존재합니다. 관리자에게 문의하세요.");
            }
            
            setStep(5);
        }
    };

    const handleSignupSubmit = async () => {
        const consents = db.settings.consents || {};
        const required = (Object.entries(consents) as [string, { isMandatory?: boolean }][])
            .filter(([_, v]) => v.isMandatory !== false).map(([k]) => k);
            
        if (!required.every(k => sConsents[k])) return showModal("필수 약관에 동의해야 합니다.");

        const finalType = subType === 'business' ? 'mart' : (subType === 'govt' ? 'government' : (subType === 'teacher' ? 'admin' : (subType === 'root' ? 'root' : 'citizen')));
        const approvalStatus = 'pending';

        const randomSuffix = Math.floor(1000 + Math.random() * 9000);
        let finalName = `${sName.trim()}_${randomSuffix}`;
        
        while (db.users[finalName]) {
             const r = Math.floor(1000 + Math.random() * 9000);
             finalName = `${sName.trim()}_${r}`;
        }

        const newUser: User = {
            name: finalName, 
            id: sId,
            password: sPw,
            balanceKRW: 0,
            balanceUSD: 0,
            type: finalType,
            subType: subType === 'root' ? undefined : (subType as UserSubType),
            pin: null,
            pinLength: 4, 
            consents: sConsents,
            phoneNumber: (subType === 'teacher' || subType === 'root') ? undefined : sPhone,
            approvalStatus: approvalStatus,
            govtBranch: subType === 'govt' ? sBranch : undefined,
            jointOwners: sJointOwners,
            birthDate: sBirth,
            customJob: isPresident ? '대통령' : sJob,
            isCorporation: (subType === 'business' && isCorporation),
            isPresident: isPresident
        };

        const newDb = JSON.parse(JSON.stringify(db));
        newDb.users[finalName] = newUser;
        await saveDb(newDb);

        showModal(`회원가입 신청이 완료되었습니다.\n등록된 이름: ${sName.trim()}\n한국은행 승인 후 로그인이 가능합니다.`);
        setView('login');
    };

    const addJointOwner = () => {
        const name = prompt("공동 사업자 이름:");
        if (name && sJointOwners.length < 14) setSJointOwners([...sJointOwners, name]);
    };

    if (view === 'signup') {
        return (
            <div className="min-h-screen flex items-center justify-center p-4">
                <Card className="w-full max-w-xl relative">
                    <h2 className="text-2xl font-bold mb-4 text-center">회원가입</h2>
                    
                    {step === 1 && (
                         <>
                            <div className="flex mb-6 border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
                                {['personal', 'business', 'govt', 'teacher'].map(t => (
                                    <button key={t} onClick={() => setSubType(t as UserSubType)} className={`flex-1 py-2 px-2 text-sm font-bold border-b-2 whitespace-nowrap ${subType === t ? 'border-green-500 text-green-600' : 'border-transparent text-gray-500'}`}>
                                        {t === 'personal' ? '시민' : t === 'business' ? '사업자' : t === 'govt' ? '부처' : '교사'}
                                    </button>
                                ))}
                            </div>
                            <div className="space-y-4">
                                <Input placeholder="아이디" value={sId} onChange={e => setSId(e.target.value)} />
                                <Input type="password" placeholder="비밀번호" value={sPw} onChange={e => setSPw(e.target.value)} />
                                <Input type="password" placeholder="비밀번호 확인" value={sPwConfirm} onChange={e => setSPwConfirm(e.target.value)} />
                                
                                <div className="flex gap-4 mt-6">
                                    <Button variant="secondary" className="w-full" onClick={() => setView('login')}>취소</Button>
                                    <Button className="w-full" onClick={handleNext}>다음</Button>
                                </div>
                            </div>
                        </>
                    )}

                    {step === 2 && (
                        <div className="space-y-4">
                            <h3 className="font-bold">전화번호 인증</h3>
                            <div className="flex gap-2">
                                <Input placeholder="전화번호" value={sPhone} onChange={e => setSPhone(e.target.value)} />
                                <Button onClick={handleSendAuth} className="whitespace-nowrap">발송</Button>
                            </div>
                            <Input placeholder="인증번호" value={sAuthCode} onChange={e => setSAuthCode(e.target.value)} />
                            <div className="flex gap-4 mt-6">
                                <Button variant="secondary" className="w-full" onClick={() => setStep(1)}>이전</Button>
                                <Button className="w-full" onClick={handleNext}>다음</Button>
                            </div>
                        </div>
                    )}

                    {step === 4 && (
                        <div className="space-y-4">
                            <h3 className="font-bold">기본 정보 입력</h3>
                            <Input placeholder="이름 (실명/상호명)" value={sName} onChange={e => setSName(e.target.value)} />
                            
                            {subType === 'personal' && (
                                <>
                                    <Input placeholder="생년월일 (YYMMDD)" value={sBirth} onChange={e => setSBirth(e.target.value)} />
                                    <Input placeholder="직업" value={sJob} onChange={e => setSJob(e.target.value)} />
                                </>
                            )}
                            {subType === 'business' && (
                                <div>
                                    <div className="flex items-center gap-2 mb-4 bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded-lg border border-yellow-200">
                                        <input 
                                            type="checkbox" 
                                            id="corp_check"
                                            checked={isCorporation}
                                            onChange={e => setIsCorporation(e.target.checked)}
                                            className="w-5 h-5 accent-yellow-600"
                                        />
                                        <label htmlFor="corp_check" className="text-sm font-bold cursor-pointer">
                                            주식회사(Corporation)로 등록
                                            <p className="text-xs font-normal text-gray-500">한국은행 승인 후 주식 시장에 상장할 수 있습니다.</p>
                                        </label>
                                    </div>

                                    <div className="flex justify-between items-center mb-2">
                                        <label className="text-sm font-bold">공동 사업자</label>
                                        <Button onClick={addJointOwner} className="text-xs py-1 px-2">+</Button>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {sJointOwners.map((jo, i) => <span key={i} className="bg-gray-200 px-2 py-1 rounded text-xs">{jo}</span>)}
                                    </div>
                                </div>
                            )}
                            {subType === 'govt' && (
                                <div className="space-y-3">
                                    <select value={sBranch} onChange={e => setSBranch(e.target.value as GovtBranch)} className="w-full p-3 rounded bg-gray-100 dark:bg-gray-800">
                                        <option value="executive">행정부</option>
                                        <option value="legislative">입법부</option>
                                        <option value="judicial">사법부</option>
                                    </select>
                                    {sBranch === 'executive' && (
                                        <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded border border-blue-200">
                                            <input 
                                                type="checkbox" 
                                                id="pres_check"
                                                checked={isPresident}
                                                onChange={e => setIsPresident(e.target.checked)}
                                                className="w-5 h-5 accent-blue-600"
                                            />
                                            <label htmlFor="pres_check" className="text-sm font-bold cursor-pointer">
                                                대통령(President)으로 등록
                                                <p className="text-xs font-normal text-gray-500">재정 정책 승인 권한을 가집니다.</p>
                                            </label>
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="flex gap-4 mt-6">
                                <Button variant="secondary" className="w-full" onClick={() => setStep(subType === 'teacher' || subType === 'root' ? 1 : 2)}>이전</Button>
                                <Button className="w-full" onClick={handleNext}>다음</Button>
                            </div>
                        </div>
                    )}

                    {step === 5 && (
                        <div className="space-y-4">
                            <h3 className="font-bold">약관 동의</h3>
                            <div className="max-h-40 overflow-y-auto p-2 border rounded">
                                {(Object.entries(db.settings.consents || {}) as [string, { title: string; content: string; isMandatory?: boolean }][]).map(([key, val]) => (
                                    <div key={key} className="flex items-center gap-2 mb-2">
                                        <input type="checkbox" checked={!!sConsents[key]} onChange={e => setSConsents({...sConsents, [key]: e.target.checked})} className="accent-green-600" />
                                        <span className="text-sm">{val.title} {val.isMandatory !== false && <span className="text-red-500">*</span>}</span>
                                    </div>
                                ))}
                            </div>
                            <div className="flex gap-4 mt-6">
                                <Button variant="secondary" className="w-full" onClick={() => setStep(4)}>이전</Button>
                                <Button className="w-full" onClick={handleSignupSubmit}>가입 완료</Button>
                            </div>
                        </div>
                    )}
                </Card>
            </div>
        );
    }

    if (view === 'find') {
        const handleFindAccount = async () => {
            const users = Object.values(db.users) as User[];
            const matches = users.filter(u => formatName(u.name) === findName);
            
            if (matches.length === 0) return showModal('존재하지 않는 이름입니다.');
            
            let targetUser = matches[0];
            if (matches.length > 1) {
                const inputId = prompt(`동명이인이 ${matches.length}명 있습니다. 아이디를 입력해주세요.`);
                const found = matches.find(u => u.id === inputId);
                if (found) targetUser = found;
                else return showModal("일치하는 아이디가 없습니다.");
            }

            if (!targetUser.pin) return showModal('간편번호가 설정되지 않았습니다.');
            const pin = await showPinModal(`${formatName(targetUser.name)}님, 본인 확인을 위해 간편번호를 입력하세요.`, targetUser.pin, targetUser.pinLength || 4);
            if (pin === targetUser.pin) {
                showModal(`아이디: ${targetUser.id}\n비밀번호: ${targetUser.password}`);
                setView('login');
            }
        };
        return (
             <div className="min-h-screen flex items-center justify-center p-4">
                <Card className="w-full max-w-md text-center">
                    <h2 className="text-2xl font-bold mb-6">계정 찾기</h2>
                    <Input placeholder="이름" value={findName} onChange={e => setFindName(e.target.value)} className="mb-4" />
                    <Button className="w-full mb-2" onClick={handleFindAccount}>찾기</Button>
                    <Button variant="secondary" className="w-full" onClick={() => setView('login')}>뒤로가기</Button>
                </Card>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center p-4">
            <Card className="w-full max-w-md text-center">
                <h2 className="text-3xl font-bold mb-8">성화 은행</h2>
                
                {recentLogins.length > 0 && (
                    <div className="mb-6">
                        <p className="text-xs text-gray-500 mb-2 font-bold text-left px-1">최근 로그인</p>
                        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                            {recentLogins.map((u: any) => (
                                <div key={u.id} className="flex flex-col items-center cursor-pointer min-w-[60px]" onClick={() => handleRecentLogin(u)}>
                                    <div className="w-14 h-14 rounded-full bg-gray-200 flex items-center justify-center overflow-hidden border-2 border-transparent hover:border-green-500 transition-colors shadow-sm">
                                        {u.profilePic ? <img src={u.profilePic} className="w-full h-full object-cover"/> : <span className="font-bold text-gray-500">{formatName(u.name)[0]}</span>}
                                    </div>
                                    <span className="text-xs mt-1 truncate w-full">{formatName(u.name)}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div className="space-y-4">
                    <Input placeholder="아이디" value={loginId} onChange={e => setLoginId(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleLogin()} />
                    <Input type="password" placeholder="비밀번호" value={loginPass} onChange={e => setLoginPass(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleLogin()} />
                    <label className="flex items-center gap-2 text-sm justify-start"><input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} className="accent-green-600" /> 로그인 유지</label>
                    <Button className="w-full" onClick={handleLogin}>로그인</Button>
                </div>
                <div className="mt-6 text-sm flex justify-between px-2">
                    <button onClick={() => setView('find')} className="text-gray-500 underline">계정 찾기</button>
                    <div>계정이 없으신가요? <button onClick={() => setView('signup')} className="text-green-500 font-bold ml-1">회원가입</button></div>
                </div>
            </Card>
        </div>
    );
};