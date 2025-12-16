
import React, { useState, useEffect, useRef } from 'react';
import { useGame } from '../../context/GameContext';
import { Button, Input, Card, NoPasteInput, Modal, formatName, LineIcon } from '../Shared';
import { saveDb, chatService, fetchUserByLoginId, searchUsersByName, fetchAllUsers } from '../../services/firebase';
import { User, UserSubType, GovtBranch } from '../../types';
import { ref, update } from "firebase/database";
import { database } from '../../services/firebase';

// Predefined Jobs for Auto-Complete
const PREDEFINED_JOBS = [
    '무직', '백수', '없음',
    '대통령', '한국은행장', '법무부장관', '검찰총장', '검사', '환경미화원',
    '국회의장', '국회의원', '판사', '대법원장', '변호사', '변호사 협회장',
    '마트사장', '마트직원', '마트알바', '투자자'
];

export const AuthView: React.FC = () => {
    const { login, showPinModal, showModal, showConfirm, db, updateUser, simulateSMS, createChat, sendMessage, createSignupSession, validateSignupCode, refreshData } = useGame();
    const [view, setView] = useState<'login' | 'signup' | 'find_choice' | 'find_id' | 'find_pw' | 'find_pin'>('login');
    
    // ... (rest of state code)
    const [loginId, setLoginId] = useState('');
    const [loginPass, setLoginPass] = useState('');
    const [rememberMe, setRememberMe] = useState(false);
    
    const [recentLogins, setRecentLogins] = useState<any[]>([]);

    // Signup State
    const [subType, setSubType] = useState<'citizen' | 'mart' | 'government' | 'teacher'>('citizen');
    const [step, setStep] = useState(1);
    
    // Pending Redirect State
    const [pendingRedirect, setPendingRedirect] = useState<{
        type: 'government' | 'mart';
        job: string;
        citizenId: string;
        citizenName: string;
        citizenPw: string;
    } | null>(null);

    // Shared Signup Fields
    const [sName, setSName] = useState('');
    const [sGender, setSGender] = useState<'male'|'female'>('male');
    const [sBirth, setSBirth] = useState('');
    const [sJob, setSJob] = useState('');
    const [sId, setSId] = useState('');
    const [sPw, setSPw] = useState('');
    const [sPwConfirm, setSPwConfirm] = useState('');
    const [sPhone, setSPhone] = useState('');
    const [sAuthCode, setSAuthCode] = useState(''); 
    const [sSentCode, setSSentCode] = useState('');
    const [sConsents, setSConsents] = useState<Record<string, boolean>>({});

    // Job Search State
    const [showJobSuggestions, setShowJobSuggestions] = useState(false);
    const [filteredJobs, setFilteredJobs] = useState<string[]>([]);

    // Business/Gov Linking
    const [linkId, setLinkId] = useState('');
    const [linkPw, setLinkPw] = useState('');
    const [linkedUser, setLinkedUser] = useState<User | null>(null);

    // Gov Specific
    const [sGovBranches, setSGovBranches] = useState<GovtBranch[]>([]);
    const [sGovRole, setSGovRole] = useState('');
    const [sJointOwners, setSJointOwners] = useState<string[]>([]);
    const [isCorporation, setIsCorporation] = useState(false);
    const [isPresident, setIsPresident] = useState(false);

    // Find Account State
    const [findName, setFindName] = useState('');
    const [findPhone, setFindPhone] = useState('');
    const [findAuthCode, setFindAuthCode] = useState('');
    const [findSentCode, setFindSentCode] = useState('');
    const [findId, setFindId] = useState('');
    const [findPin, setFindPin] = useState('');
    const [findPw, setFindPw] = useState('');
    const [newPw, setNewPw] = useState('');
    const [foundResult, setFoundResult] = useState('');

    useEffect(() => {
        resetSignupForm();
        const history = JSON.parse(localStorage.getItem('sh_login_history') || '[]');
        setRecentLogins(history);
        refreshData(); // Ensure settings like consents are loaded
    }, [view]);

    // Apply pending redirect info when switching to specialized signup
    useEffect(() => {
        if (pendingRedirect && step === 1 && subType === pendingRedirect.type) {
            setLinkId(pendingRedirect.citizenId);
            setLinkPw(pendingRedirect.citizenPw);
            setSName(pendingRedirect.citizenName); // Default name match
            
            // Auto Verify
            const autoVerify = async () => {
                // Mock verification object since we just created it locally or it exists in DB
                setLinkedUser({
                    id: pendingRedirect.citizenId,
                    name: pendingRedirect.citizenName,
                    type: 'citizen'
                } as any);
                
                // Pre-fill Gov role if applicable
                if (pendingRedirect.type === 'government') {
                    const job = pendingRedirect.job;
                    if (job.includes('대통령')) { setSGovBranches(['executive']); setSGovRole('대통령'); setIsPresident(true); }
                    else if (job.includes('한국은행장')) { setSGovBranches(['executive']); setSGovRole('한국은행장'); }
                    else if (job.includes('법무부장관')) { setSGovBranches(['executive']); setSGovRole('법무부장관'); }
                    else if (job.includes('검사') || job.includes('검찰총장')) { setSGovBranches(['executive']); setSGovRole('검사'); }
                    else if (job.includes('국회의원') || job.includes('국회의장')) { setSGovBranches(['legislative']); setSGovRole('국회의원'); }
                    else if (job.includes('판사') || job.includes('대법원장')) { setSGovBranches(['judicial']); setSGovRole('판사'); }
                }
            };
            autoVerify();
        }
    }, [pendingRedirect, step, subType]);

    // Handle Job Input Change for Auto-complete
    const handleJobChange = (val: string) => {
        setSJob(val);
        if (val.trim()) {
            const matches = PREDEFINED_JOBS.filter(j => j.includes(val));
            setFilteredJobs(matches);
            setShowJobSuggestions(matches.length > 0);
        } else {
            setShowJobSuggestions(false);
        }
    };

    const selectJob = (job: string) => {
        setSJob(job);
        setShowJobSuggestions(false);
    };

    // --- Role Redirection Logic Check ---
    const getRedirectType = (job: string): 'government' | 'mart' | null => {
        const govRoles = ['대통령', '한국은행장', '법무부장관', '검찰총장', '검사', '국회의장', '국회의원', '대법원장', '판사'];
        if (govRoles.some(r => job.includes(r))) return 'government';
        if (['마트사장', '마트직원', '마트알바'].some(r => job.includes(r))) return 'mart';
        return null;
    };

    const resetSignupForm = () => {
        setLoginId(''); setLoginPass(''); setSId(''); setSPw(''); setSPwConfirm('');
        setSPhone(''); setSAuthCode(''); setSSentCode(''); setSName('');
        setSBirth(''); setSJob(''); setSGender('male'); setLinkedUser(null);
        setSGovBranches([]); setSGovRole(''); setSJointOwners([]);
        setIsCorporation(false); setIsPresident(false);
        setStep(1);
        setShowJobSuggestions(false);
        setPendingRedirect(null);
        
        // Find Reset
        setFindName(''); setFindPhone(''); setFindAuthCode(''); setFindSentCode('');
        setFindId(''); setFindPin(''); setFindPw(''); setNewPw(''); setFoundResult('');
    };

    const handleLogin = async () => {
        // Fetch user from server to check PIN status properly
        const user = await fetchUserByLoginId(loginId);

        if (user && user.pin && !loginPass) {
            const pin = await showPinModal(`${formatName(user.name)}님, 로그인하시겠습니까?`, user.pin, (user.pinLength || 4) as 4 | 6);
            if (pin === user.pin) {
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
        const user = await fetchUserByLoginId(historyUser.id);
        if (!user) {
            const newHistory = recentLogins.filter(h => h.id !== historyUser.id);
            setRecentLogins(newHistory);
            localStorage.setItem('sh_login_history', JSON.stringify(newHistory));
            return showModal("계정 정보를 찾을 수 없습니다.");
        }

        if (user.pin) {
            const pin = await showPinModal(`${formatName(user.name)}님, 로그인하시겠습니까?`, user.pin, (user.pinLength || 4) as 4 | 6);
            if (pin === user.pin) {
                await login(user.id!, user.password!, true, true); 
            }
        } else {
            setLoginId(user.id || '');
            showModal("간편번호가 설정되지 않았습니다. 비밀번호로 로그인해주세요.");
        }
    };

    const removeRecentLogin = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        const newHistory = recentLogins.filter(h => h.id !== id);
        setRecentLogins(newHistory);
        localStorage.setItem('sh_login_history', JSON.stringify(newHistory));
    };

    const handleVerifyLinkAccount = async () => {
        // If auto-filled from redirection, trust it
        if (pendingRedirect && linkId === pendingRedirect.citizenId) {
             setLinkedUser({ id: linkId, name: pendingRedirect.citizenName, type: 'citizen' } as any);
             showModal("시민 계정이 확인되었습니다.");
             return;
        }

        const user = await fetchUserByLoginId(linkId);
        if (user && user.password === linkPw && user.type === 'citizen') {
            setLinkedUser(user);
            showModal(`'${user.name}' 계정이 확인되었습니다.`);
        } else {
            showModal("일치하는 시민 계정이 없거나 비밀번호가 틀립니다.");
        }
    };

    const handleSendAuth = () => {
        if (!sPhone) return showModal("전화번호를 입력하세요.");
        const code = simulateSMS(sPhone);
        setSSentCode(code);
    };

    const handleSendFindAuth = () => {
        if (!findPhone) return showModal("전화번호를 입력하세요.");
        const code = simulateSMS(findPhone);
        setFindSentCode(code);
    };

    // --- Find Account Logic ---

    const handleFindID = async () => {
        // Step 1: Check Auth
        if (!findAuthCode || findAuthCode !== findSentCode) return showModal("전화번호 인증이 완료되지 않았습니다.");
        
        // Step 2: Validate Name & PIN
        if (!findName || !findPin) return showModal("이름과 간편번호를 입력하세요.");

        // In real app, search by phone+name. Here, simplified scan.
        const allUsers = await fetchAllUsers();
        const found = Object.values(allUsers).find(u => u.name === findName && u.phoneNumber === findPhone && u.pin === findPin);

        if (found) {
            setFoundResult(found.id || "알 수 없음");
        } else {
            showModal("일치하는 정보가 없습니다.");
        }
    };

    const handleFindPW = async () => {
        if (!findAuthCode || findAuthCode !== findSentCode) return showModal("전화번호 인증이 완료되지 않았습니다.");
        if (!findName || !findId || !findPin) return showModal("모든 정보를 입력하세요.");

        const user = await fetchUserByLoginId(findId);
        
        if (user && user.name === findName && user.phoneNumber === findPhone && user.pin === findPin) {
            // Validation Passed
            if (!newPw) return showModal("새 비밀번호를 입력하세요.");
            if (newPw === user.password) return showModal("기존 비밀번호와 다르게 설정해야 합니다.");
            
            updateUser(user.name, { password: newPw });
            showModal("비밀번호가 변경되었습니다. 로그인해주세요.");
            setView('login');
        } else {
            showModal("정보가 일치하지 않습니다.");
        }
    };

    const handleFindPIN = async () => {
        if (!findId || !findPw) return showModal("아이디와 비밀번호를 입력하세요.");
        
        const user = await fetchUserByLoginId(findId);
        if (user && user.password === findPw) {
            setFoundResult(user.pin || "설정되지 않음");
        } else {
            showModal("아이디 또는 비밀번호가 일치하지 않습니다.");
        }
    };

    // --- Specific Step Logic --- (Signup rendering omitted for brevity, reusing existing structure)
    // ... (renderCitizenFlow, renderBusinessFlow, etc. - same as before) ...
    const nextStep = () => setStep(prev => prev + 1);
    const prevStep = () => setStep(prev => prev - 1);
    
    // Paste logic for renders...
    // CITIZEN FLOW: Info -> ID -> PW -> Phone -> Terms -> Wait
    const renderCitizenFlow = () => {
        switch(step) {
            case 1: // Info
                return (
                    <div className="space-y-4">
                        <Input placeholder="이름" value={sName} onChange={e => setSName(e.target.value)} />
                        <div className="flex gap-2">
                            <button onClick={() => setSGender('male')} className={`flex-1 py-3 rounded-xl border ${sGender==='male'?'bg-blue-100 border-blue-500':'bg-gray-100 border-gray-300'}`}>남성</button>
                            <button onClick={() => setSGender('female')} className={`flex-1 py-3 rounded-xl border ${sGender==='female'?'bg-pink-100 border-pink-500':'bg-gray-100 border-gray-300'}`}>여성</button>
                        </div>
                        <Input placeholder="생년월일 (YYMMDD)" value={sBirth} onChange={e => setSBirth(e.target.value)} />
                        
                        {/* Intelligent Job Search */}
                        <div className="relative">
                            <Input 
                                placeholder="직업 (검색 가능)" 
                                value={sJob} 
                                onChange={e => handleJobChange(e.target.value)} 
                                onFocus={() => sJob && setShowJobSuggestions(true)}
                            />
                            {showJobSuggestions && (
                                <div className="absolute top-full left-0 w-full bg-white dark:bg-[#1E1E1E] border dark:border-gray-700 shadow-xl rounded-b-xl z-20 max-h-40 overflow-y-auto">
                                    {filteredJobs.map((job, i) => (
                                        <div key={i} className="p-3 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer text-sm" onClick={() => selectJob(job)}>
                                            {job}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <Button className="w-full" onClick={async () => {
                            if(!sName.trim() || !sBirth || !sJob) return showModal("모든 정보를 입력하세요.");
                            if(/[.#$/\[\]]/.test(sName)) return showModal("이름에 특수문자를 사용할 수 없습니다.");
                            nextStep();
                        }}>다음</Button>
                    </div>
                );
            case 2: // ID
                return (
                    <div className="space-y-4">
                        <Input placeholder="아이디" value={sId} onChange={e => setSId(e.target.value)} />
                        <Button className="w-full" onClick={async () => {
                            if(!sId) return showModal("아이디를 입력하세요.");
                            const exists = await fetchUserByLoginId(sId);
                            if(exists) return showModal("이미 사용중인 아이디입니다.");
                            nextStep();
                        }}>다음</Button>
                    </div>
                );
            case 3: // PW
                return (
                    <div className="space-y-4">
                        <Input type="password" placeholder="비밀번호" value={sPw} onChange={e => setSPw(e.target.value)} />
                        <Input type="password" placeholder="비밀번호 확인" value={sPwConfirm} onChange={e => setSPwConfirm(e.target.value)} />
                        <Button className="w-full" onClick={() => {
                            if(!sPw) return showModal("비밀번호를 입력하세요.");
                            if(sPw.length < 4) return showModal("비밀번호는 4자 이상이어야 합니다.");
                            if(sPw !== sPwConfirm) return showModal("비밀번호가 일치하지 않습니다.");
                            nextStep();
                        }}>다음</Button>
                    </div>
                );
            case 4: // Phone
                return (
                    <div className="space-y-4">
                        <div className="flex gap-2">
                            <Input placeholder="전화번호" value={sPhone} onChange={e => setSPhone(e.target.value)} />
                            <Button onClick={handleSendAuth} className="whitespace-nowrap">발송</Button>
                        </div>
                        <Input placeholder="인증번호" value={sAuthCode} onChange={e => setSAuthCode(e.target.value)} />
                        <Button className="w-full" onClick={() => {
                            if(!sPhone || !sAuthCode) return showModal("인증을 완료해주세요.");
                            if(sAuthCode !== sSentCode) return showModal("인증번호가 틀렸습니다.");
                            nextStep();
                        }}>인증 확인</Button>
                    </div>
                );
            case 5: // Terms
                return renderTermsStep();
            default: return null;
        }
    };

    // BUSINESS FLOW
    const renderBusinessFlow = () => {
        switch(step) {
            case 1:
                return (
                    <div className="space-y-4">
                        <Input placeholder="상호명 (가게 이름)" value={sName} onChange={e => setSName(e.target.value)} />
                        <div className="bg-gray-100 p-4 rounded-xl">
                            <p className="text-xs font-bold mb-2">본인(시민) 계정 연결</p>
                            <Input placeholder="시민 아이디" value={linkId} onChange={e => setLinkId(e.target.value)} className="mb-2" />
                            <div className="flex gap-2">
                                <Input type="password" placeholder="비밀번호" value={linkPw} onChange={e => setLinkPw(e.target.value)} />
                                <Button onClick={handleVerifyLinkAccount} className="text-xs py-2 px-3">확인</Button>
                            </div>
                            {linkedUser && <p className="text-xs text-green-600 mt-2 font-bold">✅ {linkedUser.name} 확인됨</p>}
                        </div>
                        <Button className="w-full" onClick={() => {
                            if(!sName.trim()) return showModal("상호명을 입력하세요.");
                            if(!linkedUser) return showModal("본인 계정을 연결해주세요.");
                            nextStep();
                        }}>다음</Button>
                    </div>
                );
            case 2:
                return (
                    <div className="space-y-4">
                        <Input placeholder="사업자 아이디" value={sId} onChange={e => setSId(e.target.value)} />
                        <Button className="w-full" onClick={async () => {
                            if(!sId) return showModal("아이디를 입력하세요.");
                            const exists = await fetchUserByLoginId(sId);
                            if(exists) return showModal("이미 사용중인 아이디입니다.");
                            nextStep();
                        }}>다음</Button>
                    </div>
                );
            case 3: return (
                    <div className="space-y-4">
                        <Input type="password" placeholder="비밀번호" value={sPw} onChange={e => setSPw(e.target.value)} />
                        <Input type="password" placeholder="비밀번호 확인" value={sPwConfirm} onChange={e => setSPwConfirm(e.target.value)} />
                        <Button className="w-full" onClick={() => {
                            if(!sPw || sPw !== sPwConfirm) return showModal("비밀번호를 확인하세요.");
                            nextStep();
                        }}>다음</Button>
                    </div>
                );
            case 4: return (
                    <div className="space-y-4">
                        <div className="flex gap-2">
                            <Input placeholder="대표 전화번호" value={sPhone} onChange={e => setSPhone(e.target.value)} />
                            <Button onClick={handleSendAuth} className="whitespace-nowrap">발송</Button>
                        </div>
                        <Input placeholder="인증번호" value={sAuthCode} onChange={e => setSAuthCode(e.target.value)} />
                        <Button className="w-full" onClick={() => {
                            if(!sAuthCode || sAuthCode !== sSentCode) return showModal("인증번호를 확인하세요.");
                            nextStep();
                        }}>인증 확인</Button>
                    </div>
                );
            case 5: return renderTermsStep();
            default: return null;
        }
    };

    // GOVT FLOW
    const renderGovtFlow = () => {
        switch(step) {
            case 1: return (
                    <div className="space-y-4">
                        <Input placeholder="이름 (실명)" value={sName} onChange={e => setSName(e.target.value)} />
                        <div className="bg-gray-100 p-4 rounded-xl">
                            <p className="text-xs font-bold mb-2">본인(시민) 계정 연결</p>
                            <Input placeholder="시민 아이디" value={linkId} onChange={e => setLinkId(e.target.value)} className="mb-2" />
                            <div className="flex gap-2">
                                <Input type="password" placeholder="비밀번호" value={linkPw} onChange={e => setLinkPw(e.target.value)} />
                                <Button onClick={handleVerifyLinkAccount} className="text-xs py-2 px-3">확인</Button>
                            </div>
                            {linkedUser && <p className="text-xs text-green-600 mt-2 font-bold">✅ {linkedUser.name} 확인됨</p>}
                        </div>
                        <Button className="w-full" onClick={() => {
                            if(!sName.trim()) return showModal("이름을 입력하세요.");
                            if(!linkedUser) return showModal("본인 계정을 연결해주세요.");
                            nextStep();
                        }}>다음</Button>
                    </div>
                );
            case 2:
                return (
                    <div className="space-y-4">
                        <p className="font-bold text-sm">소속 부처 (복수 선택 가능)</p>
                        <div className="flex flex-wrap gap-2">
                            {['executive', 'legislative', 'judicial'].map(b => (
                                <label key={b} className="flex items-center gap-2 border p-2 rounded cursor-pointer text-sm">
                                    <input 
                                        type="checkbox" 
                                        checked={sGovBranches.includes(b as GovtBranch)} 
                                        onChange={e => {
                                            if (e.target.checked) setSGovBranches([...sGovBranches, b as GovtBranch]);
                                            else setSGovBranches(sGovBranches.filter(x => x !== b));
                                        }}
                                        className="accent-green-600"
                                    />
                                    {b === 'executive' ? '행정부' : (b === 'legislative' ? '입법부' : '사법부')}
                                </label>
                            ))}
                        </div>
                        <p className="font-bold text-sm mt-4">직책 선택</p>
                        <select value={sGovRole} onChange={e => setSGovRole(e.target.value)} className="w-full p-3 rounded-xl bg-gray-100 dark:bg-gray-800 border-none outline-none">
                            <option value="">직책 선택</option>
                            <option value="대통령">대통령 (행정부)</option>
                            <option value="한국은행장">한국은행장 (행정부)</option>
                            <option value="법무부장관">법무부장관 (행정부)</option>
                            <option value="검사">검사 (행정부)</option>
                            <option value="국회의원">국회의원 (입법부)</option>
                            <option value="판사">판사 (사법부)</option>
                        </select>
                        {sGovRole === '대통령' && (
                            <label className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded border border-blue-200 mt-2">
                                <input type="checkbox" checked={isPresident} onChange={e => setIsPresident(e.target.checked)} className="accent-blue-600" />
                                <span className="text-sm font-bold">대통령 권한 신청 확인</span>
                            </label>
                        )}
                        <Button className="w-full mt-4" onClick={() => {
                            if(sGovBranches.length === 0) return showModal("최소 1개 이상의 부처를 선택하세요.");
                            if(!sGovRole) return showModal("직책을 선택하세요.");
                            nextStep();
                        }}>다음</Button>
                    </div>
                );
            case 3: return (
                    <div className="space-y-4">
                        <Input placeholder="공무원 아이디" value={sId} onChange={e => setSId(e.target.value)} />
                        <Button className="w-full" onClick={async () => {
                            if(!sId) return showModal("아이디를 입력하세요.");
                            const exists = await fetchUserByLoginId(sId);
                            if(exists) return showModal("이미 사용중인 아이디입니다.");
                            nextStep();
                        }}>다음</Button>
                    </div>
                );
            case 4: return (
                    <div className="space-y-4">
                        <Input type="password" placeholder="비밀번호" value={sPw} onChange={e => setSPw(e.target.value)} />
                        <Input type="password" placeholder="비밀번호 확인" value={sPwConfirm} onChange={e => setSPwConfirm(e.target.value)} />
                        <Button className="w-full" onClick={() => {
                            if(!sPw || sPw !== sPwConfirm) return showModal("비밀번호를 확인하세요.");
                            nextStep();
                        }}>다음</Button>
                    </div>
                );
            case 5: return (
                    <div className="space-y-4">
                        <div className="flex gap-2">
                            <Input placeholder="공무원 연락처 (부처 대표번호)" value={sPhone} onChange={e => setSPhone(e.target.value)} />
                            <Button onClick={handleSendAuth} className="whitespace-nowrap">발송</Button>
                        </div>
                        <Input placeholder="인증번호" value={sAuthCode} onChange={e => setSAuthCode(e.target.value)} />
                        <Button className="w-full" onClick={() => {
                            if(!sAuthCode || sAuthCode !== sSentCode) return showModal("인증번호를 확인하세요.");
                            nextStep();
                        }}>인증 확인</Button>
                    </div>
                );
            case 6: return renderTermsStep();
            default: return null;
        }
    };

    // TEACHER FLOW
    const renderTeacherFlow = () => {
        switch(step) {
            case 1:
                return (
                    <div className="space-y-4">
                        <Input placeholder="이름" value={sName} onChange={e => setSName(e.target.value)} />
                        <div className="flex gap-2">
                            <button onClick={() => setSGender('male')} className={`flex-1 py-3 rounded-xl border ${sGender==='male'?'bg-blue-100 border-blue-500':'bg-gray-100 border-gray-300'}`}>남성</button>
                            <button onClick={() => setSGender('female')} className={`flex-1 py-3 rounded-xl border ${sGender==='female'?'bg-pink-100 border-pink-500':'bg-gray-100 border-gray-300'}`}>여성</button>
                        </div>
                        <Button className="w-full" onClick={() => {
                            if(!sName.trim()) return showModal("이름을 입력하세요.");
                            nextStep();
                        }}>다음</Button>
                    </div>
                );
            case 2: return (
                    <div className="space-y-4">
                        <Input placeholder="아이디" value={sId} onChange={e => setSId(e.target.value)} />
                        <Button className="w-full" onClick={async () => {
                            if(!sId) return showModal("아이디를 입력하세요.");
                            const exists = await fetchUserByLoginId(sId);
                            if(exists) return showModal("이미 사용중인 아이디입니다.");
                            nextStep();
                        }}>다음</Button>
                    </div>
                );
            case 3: return (
                    <div className="space-y-4">
                        <Input type="password" placeholder="비밀번호" value={sPw} onChange={e => setSPw(e.target.value)} />
                        <Input type="password" placeholder="비밀번호 확인" value={sPwConfirm} onChange={e => setSPwConfirm(e.target.value)} />
                        <Button className="w-full" onClick={() => {
                            if(!sPw || sPw !== sPwConfirm) return showModal("비밀번호를 확인하세요.");
                            nextStep();
                        }}>다음</Button>
                    </div>
                );
            case 4: return renderTermsStep();
            default: return null;
        }
    };

    const renderTermsStep = () => {
        const consents = (db?.settings?.consents || {}) as Record<string, { title: string; content: string; isMandatory?: boolean }>;
        const entries = Object.entries(consents);
        
        return (
            <div className="space-y-4">
                <h3 className="font-bold">약관 동의</h3>
                <div className="max-h-40 overflow-y-auto p-2 border rounded bg-gray-50 dark:bg-gray-800">
                    {entries.length > 0 ? entries.map(([key, val]) => (
                        <div key={key} className="flex items-center gap-2 mb-2">
                            <input type="checkbox" checked={!!sConsents[key]} onChange={e => setSConsents({...sConsents, [key]: e.target.checked})} className="accent-green-600 w-5 h-5" />
                            <span className="text-sm">
                                {val.title} {val.isMandatory !== false && <span className="text-red-500">*</span>}
                            </span>
                        </div>
                    )) : (
                        <p className="text-gray-500 text-sm p-2">등록된 약관이 없습니다.</p>
                    )}
                </div>
                <Button className="w-full" onClick={handleSignupSubmit}>가입 완료</Button>
            </div>
        );
    };

    const handleSignupSubmit = async () => {
        const consents = db?.settings?.consents || {};
        const required = (Object.entries(consents) as [string, any][])
            .filter(([_, v]) => v.isMandatory !== false).map(([k]) => k);
        if (!required.every(k => sConsents[k])) return showModal("필수 약관에 동의해야 합니다.");

        let finalName = sName.trim();
        let exists = await fetchUserByLoginId(finalName); 
        while (exists) {
             finalName = `${sName.trim()}_${Math.floor(1000 + Math.random() * 9000)}`;
             exists = await fetchUserByLoginId(finalName);
        }

        let userSubType: UserSubType = 'personal';
        if (subType === 'mart') userSubType = 'business';
        else if (subType === 'government') userSubType = 'govt';
        else if (subType === 'teacher') userSubType = 'teacher';

        // Check if approval is required
        const requireApproval = db.settings.requireSignupApproval !== false; // Default true if undefined
        const approvalStatus = requireApproval ? 'pending' : 'approved';

        const newUser: User = {
            name: finalName,
            id: sId,
            password: sPw,
            balanceKRW: 0,
            balanceUSD: 0,
            type: subType === 'government' ? 'government' : (subType === 'mart' ? 'mart' : (subType === 'teacher' ? 'admin' : 'citizen')), 
            subType: userSubType,
            pin: null,
            pinLength: 4,
            approvalStatus: approvalStatus,
            phoneNumber: subType === 'teacher' ? undefined : sPhone,
            gender: sGender,
            birthDate: sBirth,
            customJob: subType === 'mart' ? sName : (isPresident ? '대통령' : (subType === 'government' ? sGovRole : sJob)),
            linkedUser: linkedUser?.id || null, 
            linkedAccounts: linkedUser?.id ? [linkedUser.id] : [],
            govtBranch: sGovBranches,
            govtRole: sGovRole,
            isPresident: isPresident,
            isCorporation: isCorporation,
            jointOwners: sJointOwners,
            consents: sConsents
        };

        // If linking, update the citizen account too
        if (linkedUser && linkedUser.id) {
            // NOTE: We need the citizen's NAME (key) to update them. linkedUser.name holds this.
            // But verify we have it. fetchUserByLoginId returns User which has name.
            try {
                // Fetch fresh user to get current links
                const citizen = await fetchUserByLoginId(linkedUser.id);
                if (citizen) {
                    const currentLinks = citizen.linkedAccounts || [];
                    if (!currentLinks.includes(sId)) {
                        await update(ref(database, `users/${citizen.name}`), { linkedAccounts: [...currentLinks, sId] });
                    }
                }
            } catch (e) {
                console.error("Auto-linking citizen failed:", e);
            }
        }

        const sanitizedUser = JSON.parse(JSON.stringify(newUser));
        const newDb = JSON.parse(JSON.stringify(db));
        newDb.users[finalName] = sanitizedUser;
        await saveDb(newDb);

        // Check for redirection trigger (Job based)
        const redirectType = getRedirectType(sJob);
        
        // If citizen signup and has specific job title, trigger redirect flow
        if (subType === 'citizen' && redirectType) {
            if (await showConfirm(`시민 가입이 완료되었습니다.\n직업이 '${sJob}'이므로 ${redirectType === 'government' ? '공무원' : '사업자'} 가입을 이어서 진행하시겠습니까?`)) {
                
                // Set pending info to pre-fill next form
                setPendingRedirect({
                    type: redirectType,
                    job: sJob,
                    citizenId: sId,
                    citizenName: finalName,
                    citizenPw: sPw
                });
                
                // Clear inputs but keep redirect info
                setSId(''); setSPw(''); setSPwConfirm(''); setSPhone(''); setSAuthCode(''); 
                setSubType(redirectType);
                setStep(1); // Go to step 1 of new flow
                return;
            }
        }

        if (approvalStatus === 'approved') {
            showModal("회원가입이 완료되었습니다. 즉시 로그인을 시도합니다.");
            // Pass the user object directly to skip unnecessary fetching delay
            const loginSuccess = await login(sId, sPw, false, false, sanitizedUser);
            if (!loginSuccess) setView('login');
        } else {
            showModal("가입 신청이 완료되었습니다. 관리자 승인 대기 중입니다.");
            setView('login');
        }
    };

    // RENDER: LOGIN
    if (view === 'login') {
        return (
            <div className="min-h-screen flex items-center justify-center p-4">
                <Card className="w-full max-w-md text-center">
                    <h2 className="text-3xl font-bold mb-8">성화 은행</h2>
                    
                    {/* Recent Logins */}
                    {recentLogins.length > 0 && (
                        <div className="mb-8">
                            <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide justify-center">
                                {recentLogins.map(user => (
                                    <div key={user.id} className="flex flex-col items-center relative group cursor-pointer" onClick={() => handleRecentLogin(user)}>
                                        <div className="w-16 h-16 rounded-full bg-green-500 text-white text-2xl font-bold flex items-center justify-center overflow-hidden border-2 border-transparent group-hover:border-green-300 transition-all shadow-md">
                                            {user.profilePic ? <img src={user.profilePic} className="w-full h-full object-cover"/> : formatName(user.name)[0]}
                                        </div>
                                        <span className="text-xs mt-2 font-bold max-w-[70px] truncate">{formatName(user.name)}</span>
                                        <button 
                                            onClick={(e) => removeRecentLogin(e, user.id)}
                                            className="absolute -top-1 -right-1 bg-gray-200 text-gray-500 rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            ✕
                                        </button>
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
                        <button onClick={() => setView('find_choice')} className="text-gray-500 underline">계정 찾기</button>
                        <div>계정이 없으신가요? <button onClick={() => setView('signup')} className="text-green-500 font-bold ml-1">회원가입</button></div>
                    </div>
                </Card>
            </div>
        );
    }

    // RENDER: SIGNUP
    if (view === 'signup') {
        return (
            <div className="min-h-screen flex items-center justify-center p-4">
                <Card className="w-full max-w-xl relative">
                    <h2 className="text-2xl font-bold mb-4 text-center">회원가입</h2>
                    
                    {step === 1 && (
                        <div className="flex mb-6 border-b border-gray-200 dark:border-gray-700 overflow-x-auto pb-1">
                            {['citizen', 'mart', 'government', 'teacher'].map(t => (
                                <button 
                                    key={t} 
                                    onClick={() => {
                                        setSubType(t as any);
                                        // Reset pending redirect if manually switching tabs to prevent confusion
                                        if(pendingRedirect && t !== pendingRedirect.type) setPendingRedirect(null);
                                    }} 
                                    className={`flex-1 py-2 px-2 text-sm font-bold border-b-2 whitespace-nowrap transition-colors ${subType === t ? 'border-green-500 text-green-600' : 'border-transparent text-gray-500'}`}
                                >
                                    {t === 'citizen' ? '시민' : t === 'mart' ? '사업자' : t === 'government' ? '공무원' : '교사'}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Progress Indicator */}
                    <div className="mb-6 flex justify-between items-center px-2">
                        <span className="text-xs font-bold text-gray-500">Step {step}</span>
                        <div className="flex gap-1">
                            {[1,2,3,4,5,6,7].map(i => {
                                let max = 6;
                                if(subType === 'government') max = 7;
                                if(subType === 'teacher') max = 5;
                                if(i > max) return null;
                                return <div key={i} className={`h-1 w-6 rounded-full ${step >= i ? 'bg-green-500' : 'bg-gray-200'}`}></div>;
                            })}
                        </div>
                    </div>

                    {subType === 'citizen' && renderCitizenFlow()}
                    {subType === 'mart' && renderBusinessFlow()}
                    {subType === 'government' && renderGovtFlow()}
                    {subType === 'teacher' && renderTeacherFlow()}

                    {step > 1 && (
                        <button onClick={prevStep} className="mt-4 text-sm text-gray-500 underline w-full text-center">
                            이전 단계
                        </button>
                    )}
                    {step === 1 && (
                        <button onClick={() => setView('login')} className="mt-4 text-sm text-gray-500 underline w-full text-center">
                            취소하고 돌아가기
                        </button>
                    )}
                </Card>
            </div>
        );
    }

    // RENDER: FIND ACCOUNT CHOICE
    if (view === 'find_choice') {
        return (
            <div className="min-h-screen flex items-center justify-center p-4">
                <Card className="w-full max-w-md text-center">
                    <h2 className="text-2xl font-bold mb-6">계정 찾기</h2>
                    <div className="space-y-3">
                        <Button className="w-full py-4 bg-white dark:bg-gray-800 text-black dark:text-white border border-gray-200 hover:bg-gray-50" onClick={() => setView('find_id')}>아이디 찾기</Button>
                        <Button className="w-full py-4 bg-white dark:bg-gray-800 text-black dark:text-white border border-gray-200 hover:bg-gray-50" onClick={() => setView('find_pw')}>비밀번호 찾기</Button>
                        <Button className="w-full py-4 bg-white dark:bg-gray-800 text-black dark:text-white border border-gray-200 hover:bg-gray-50" onClick={() => setView('find_pin')}>간편번호(PIN) 찾기</Button>
                    </div>
                    <Button variant="secondary" className="w-full mt-6" onClick={() => setView('login')}>뒤로가기</Button>
                </Card>
            </div>
        );
    }

    // RENDER: FIND ID
    if (view === 'find_id') {
        return (
            <div className="min-h-screen flex items-center justify-center p-4">
                <Card className="w-full max-w-md">
                    <h2 className="text-xl font-bold mb-4 text-center">아이디 찾기</h2>
                    {foundResult ? (
                        <div className="text-center space-y-4">
                            <p className="text-gray-500">회원님의 아이디는</p>
                            <p className="text-2xl font-bold text-blue-600">{foundResult}</p>
                            <p className="text-gray-500">입니다.</p>
                            <Button className="w-full" onClick={() => setView('login')}>로그인하러 가기</Button>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-gray-500">1. 본인 인증</label>
                                <div className="flex gap-2">
                                    <Input placeholder="전화번호" value={findPhone} onChange={e => setFindPhone(e.target.value)} />
                                    <Button onClick={handleSendFindAuth} className="whitespace-nowrap px-3 text-xs">발송</Button>
                                </div>
                                <Input placeholder="인증번호" value={findAuthCode} onChange={e => setFindAuthCode(e.target.value)} />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-gray-500">2. 정보 입력</label>
                                <Input placeholder="이름" value={findName} onChange={e => setFindName(e.target.value)} />
                                <Input type="password" placeholder="간편번호 (PIN)" value={findPin} onChange={e => setFindPin(e.target.value)} maxLength={6} />
                            </div>
                            <Button className="w-full mt-2" onClick={handleFindID}>아이디 찾기</Button>
                            <Button variant="secondary" className="w-full" onClick={() => setView('find_choice')}>뒤로가기</Button>
                        </div>
                    )}
                </Card>
            </div>
        );
    }

    // RENDER: FIND PW
    if (view === 'find_pw') {
        return (
            <div className="min-h-screen flex items-center justify-center p-4">
                <Card className="w-full max-w-md">
                    <h2 className="text-xl font-bold mb-4 text-center">비밀번호 찾기 (재설정)</h2>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-500">1. 본인 인증</label>
                            <div className="flex gap-2">
                                <Input placeholder="전화번호" value={findPhone} onChange={e => setFindPhone(e.target.value)} />
                                <Button onClick={handleSendFindAuth} className="whitespace-nowrap px-3 text-xs">발송</Button>
                            </div>
                            <Input placeholder="인증번호" value={findAuthCode} onChange={e => setFindAuthCode(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-500">2. 정보 입력</label>
                            <Input placeholder="이름" value={findName} onChange={e => setFindName(e.target.value)} />
                            <Input placeholder="아이디" value={findId} onChange={e => setFindId(e.target.value)} />
                            <Input type="password" placeholder="간편번호 (PIN)" value={findPin} onChange={e => setFindPin(e.target.value)} maxLength={6} />
                        </div>
                        <div className="space-y-2 pt-2 border-t dark:border-gray-700">
                            <label className="text-xs font-bold text-gray-500">3. 새 비밀번호 설정</label>
                            <Input type="password" placeholder="새 비밀번호 (기존과 다르게)" value={newPw} onChange={e => setNewPw(e.target.value)} />
                        </div>
                        <Button className="w-full mt-2" onClick={handleFindPW}>비밀번호 변경</Button>
                        <Button variant="secondary" className="w-full" onClick={() => setView('find_choice')}>뒤로가기</Button>
                    </div>
                </Card>
            </div>
        );
    }

    // RENDER: FIND PIN
    if (view === 'find_pin') {
        return (
            <div className="min-h-screen flex items-center justify-center p-4">
                <Card className="w-full max-w-md">
                    <h2 className="text-xl font-bold mb-4 text-center">간편번호(PIN) 찾기</h2>
                    {foundResult ? (
                        <div className="text-center space-y-4">
                            <p className="text-gray-500">설정된 간편번호는</p>
                            <p className="text-2xl font-bold text-green-600 tracking-widest">{foundResult}</p>
                            <p className="text-gray-500">입니다.</p>
                            <Button className="w-full" onClick={() => setView('login')}>로그인하러 가기</Button>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-gray-500">계정 정보 확인</label>
                                <Input placeholder="아이디" value={findId} onChange={e => setFindId(e.target.value)} />
                                <Input type="password" placeholder="비밀번호" value={findPw} onChange={e => setFindPw(e.target.value)} />
                            </div>
                            <Button className="w-full mt-2" onClick={handleFindPIN}>PIN 찾기</Button>
                            <Button variant="secondary" className="w-full" onClick={() => setView('find_choice')}>뒤로가기</Button>
                        </div>
                    )}
                </Card>
            </div>
        );
    }

    return null;
};
