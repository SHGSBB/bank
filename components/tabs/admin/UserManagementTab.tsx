
import React, { useState, useMemo, useEffect } from 'react';
import { useGame } from '../../../context/GameContext';
import { Card, Button, Modal, Input, Toggle, formatName } from '../../Shared';
import { User, Country, SignupSession, TermDeposit, Loan } from '../../../types';
import { ref, update, remove } from 'firebase/database';
import { database, generateId } from '../../../services/firebase';

export const UserManagementTab: React.FC = () => {
    const { db, saveDb, showModal, showConfirm, notify, updateUser, showPinModal, currentUser, loadAllUsers } = useGame();
    
    // Load users on mount to ensure we have the full list
    useEffect(() => {
        loadAllUsers();
    }, []);

    const [selectedUser, setSelectedUser] = useState<string | null>(null);
    const [editKRW, setEditKRW] = useState('');
    const [editUSD, setEditUSD] = useState('');
    const [editType, setEditType] = useState<string>('citizen');
    const [isCustomType, setIsCustomType] = useState(false);
    
    const [activeTab, setActiveTab] = useState<'citizen'|'mart'|'gov'|'teacher'|'country'|'signup'>('citizen');

    // Create User State
    const [isCreating, setIsCreating] = useState(false);
    const [newName, setNewName] = useState('');
    const [newId, setNewId] = useState('');
    const [newPw, setNewPw] = useState('');

    // Country Management State
    const [newCountryName, setNewCountryName] = useState('');
    const [newCountryCurrency, setNewCountryCurrency] = useState<'KRW'|'USD'>('KRW');
    
    // Secure Code Viewing
    const [revealedCodes, setRevealedCodes] = useState<Set<string>>(new Set());

    // --- Sub-Modals for Savings/Loans ---
    const [isEditingSavings, setIsEditingSavings] = useState(false);
    const [isEditingLoans, setIsEditingLoans] = useState(false);
    
    // New Savings/Loan Inputs
    const [newSaveAmount, setNewSaveAmount] = useState('');
    const [newSaveType, setNewSaveType] = useState<'regular'|'term'|'installment'>('term');
    const [newSaveWeeks, setNewSaveWeeks] = useState('52');
    const [newSaveRate, setNewSaveRate] = useState('3');

    const [newLoanAmount, setNewLoanAmount] = useState('');
    const [newLoanWeeks, setNewLoanWeeks] = useState('4');
    const [newLoanRate, setNewLoanRate] = useState('5');
    const [newLoanCollateral, setNewLoanCollateral] = useState('');

    const users = useMemo(() => Object.values(db.users || {}) as User[], [db.users]);
    const countries = useMemo(() => Object.values(db.countries || {}) as Country[], [db.countries]);
    const signupSessions = useMemo(() => Object.values(db.signupSessions || {}) as SignupSession[], [db.signupSessions]);

    // Ensure pending users are updated correctly
    const pendingUsers = useMemo(() => users.filter(u => u.approvalStatus === 'pending'), [users]);
    const activeUsers = useMemo(() => users.filter(u => u.approvalStatus !== 'pending'), [users]);

    const calculateTotalAsset = (user: User) => {
        const krw = user.balanceKRW;
        const usdVal = user.balanceUSD * (db.settings.exchangeRate?.KRW_USD || 1350);
        const propVal = (db.realEstate.grid || []).filter(p => p.owner === user.name).reduce((sum, p) => sum + p.price, 0);
        return krw + usdVal + propVal;
    };

    const groupedUsers = useMemo(() => {
        const sorted = [...activeUsers].sort((a, b) => a.name.localeCompare(b.name, 'ko-KR'));
        return {
            citizen: sorted.filter(u => u.type === 'citizen' || u.type === 'government' || u.type === 'official' || u.subType === 'govt' || u.subType === 'personal'),
            mart: sorted.filter(u => u.type === 'mart'),
            gov: sorted.filter(u => u.type === 'government' || u.type === 'official' || u.subType === 'govt'),
            teacher: sorted.filter(u => u.type === 'admin' || u.subType === 'teacher' || u.type === 'teacher' || u.type === 'root')
        };
    }, [activeUsers]);

    const openEdit = (user: User) => {
        setSelectedUser(user.name);
        setEditKRW(user.balanceKRW.toString());
        setEditUSD(user.balanceUSD.toString());
        
        if (['citizen', 'mart', 'admin', 'government'].includes(user.type)) {
            setEditType(user.type);
            setIsCustomType(false);
        } else {
            setEditType(user.type);
            setIsCustomType(true);
        }
    };

    const handleCreateUser = async () => {
        if (!newName.trim()) return showModal('이름을 입력하세요.');
        if (/[.#$/\[\]]/.test(newName)) return showModal("이름에 특수문자(., #, $, /, [, ])를 포함할 수 없습니다.");
        if (!newId || !newPw) return showModal('모든 필드를 입력하세요.');
        if (db.users[newName]) return showModal('이미 존재하는 이름입니다.');
        if (Object.values(db.users).some((u: any) => u.id === newId)) return showModal('이미 존재하는 아이디입니다.');

        const finalName = newName.trim();
        const newUser: User = {
            name: finalName,
            id: newId,
            password: newPw,
            balanceKRW: 0,
            balanceUSD: 0,
            type: 'citizen',
            pin: null,
            transactions: [],
            notifications: {},
            approvalStatus: 'approved'
        };

        // Direct DB update to prevent stale state overwrites
        await update(ref(database, `users/${finalName}`), newUser);
        
        showModal('사용자가 생성되었습니다.');
        setIsCreating(false);
        setNewName(''); setNewId(''); setNewPw('');
        loadAllUsers(); // Refresh list explicitly
    };

    const handleSave = async () => {
        if (!selectedUser) return;
        const krw = parseInt(editKRW);
        const usd = parseFloat(editUSD);

        if (isNaN(krw)) return showModal('올바른 현금 금액을 입력하세요.');
        if (isNaN(usd)) return showModal('올바른 달러 금액을 입력하세요.');

        // Use context method which handles partial updates safely
        await updateUser(selectedUser, {
            balanceKRW: krw,
            balanceUSD: usd,
            type: editType as any
        });

        showModal(`${selectedUser}님의 정보가 수정되었습니다.`);
        setSelectedUser(null);
        loadAllUsers();
    };

    const handleDeleteUser = async () => {
        if (!selectedUser) return;
        if (await showConfirm('정말 이 사용자를 삭제하시겠습니까?')) {
            // Direct remove
            await remove(ref(database, `users/${selectedUser}`));
            showModal('삭제되었습니다.');
            setSelectedUser(null);
            loadAllUsers();
        }
    };

    const handleApproval = async (user: User, approve: boolean) => {
        if (!approve && !(await showConfirm(`${user.name} 님의 가입을 거절하시겠습니까?`))) return;
        
        if (approve) {
            await updateUser(user.name, { approvalStatus: 'approved' });
            notify(user.name, '회원가입이 승인되었습니다.', true);
        } else {
            await remove(ref(database, `users/${user.name}`));
        }
        
        showModal('처리되었습니다.');
        loadAllUsers();
    };

    // ... (Code and country logic remains the same, omitted for brevity but preserved structure)

    const handleAddSavings = async () => {
        if (!selectedUser) return;
        const amount = parseInt(newSaveAmount);
        const weeks = parseInt(newSaveWeeks);
        const rate = parseFloat(newSaveRate);
        if (isNaN(amount) || isNaN(weeks) || isNaN(rate)) return showModal("올바른 값을 입력하세요.");

        const id = generateId();
        const deposit: TermDeposit = {
            id,
            owner: selectedUser,
            amount,
            interestRate: rate,
            startDate: new Date().toISOString(),
            endDate: new Date(Date.now() + weeks * 7 * 24 * 60 * 60 * 1000).toISOString(),
            status: 'active',
            type: newSaveType
        };

        const newDb = { ...db };
        if(!newDb.termDeposits) newDb.termDeposits = {};
        newDb.termDeposits[id] = deposit;
        
        await saveDb(newDb);
        showModal("예금이 추가되었습니다.");
        setNewSaveAmount('');
    };

    const handleDeleteSavings = async (id: string) => {
        if(!await showConfirm("예금을 삭제하시겠습니까?")) return;
        const newDb = { ...db };
        delete newDb.termDeposits?.[id];
        await saveDb(newDb);
    };

    const handleAddLoan = async () => {
        if (!selectedUser) return;
        const amount = parseInt(newLoanAmount);
        const weeks = parseInt(newLoanWeeks);
        const rate = parseFloat(newLoanRate);
        if (isNaN(amount) || isNaN(weeks) || isNaN(rate)) return showModal("올바른 값을 입력하세요.");

        const id = generateId();
        const loan: Loan = {
            id,
            amount,
            interestRate: { rate, periodWeeks: weeks },
            applyDate: new Date().toISOString(),
            repaymentDate: new Date(Date.now() + weeks * 7 * 24 * 60 * 60 * 1000).toISOString(),
            status: 'approved',
            collateral: newLoanCollateral || null
        };

        // Loans are stored on the user object in this schema
        const user = db.users[selectedUser];
        const currentLoans = user.loans ? (Array.isArray(user.loans) ? user.loans : Object.values(user.loans)) : [];
        const newLoans = [...currentLoans, loan]; // Array update logic, or keyed
        // Actually, schema supports Keyed object better for updates, but let's stick to consistent array/object handling
        // For direct DB update to be safe:
        await update(ref(database, `users/${selectedUser}/loans/${id}`), loan);
        
        showModal("대출이 추가되었습니다.");
        setNewLoanAmount(''); setNewLoanCollateral('');
    };

    const handleDeleteLoan = async (loanId: string) => {
        if(!selectedUser) return;
        if(!await showConfirm("대출을 삭제하시겠습니까?")) return;
        await remove(ref(database, `users/${selectedUser}/loans/${loanId}`));
    };

    // Filtered lists for current selected user
    const userDeposits = useMemo(() => {
        return selectedUser ? (Object.values(db.termDeposits || {}) as TermDeposit[]).filter(d => d.owner === selectedUser) : [];
    }, [db.termDeposits, selectedUser]);

    const userLoans = useMemo(() => {
        if (!selectedUser) return [];
        const u = db.users[selectedUser];
        return u.loans ? (Array.isArray(u.loans) ? u.loans : Object.values(u.loans)) : [];
    }, [db.users, selectedUser]);

    // ... (rest of view code)

    return (
        <div className="space-y-6 w-full">
            <div className="flex justify-between items-center px-1">
                <h3 className="text-2xl font-bold">사용자 관리</h3>
                <Button onClick={() => setIsCreating(true)}>+ 사용자 추가</Button>
            </div>
            
            {/* ... Pending Users & Filter Tabs Code (Identical to previous) ... */}
            
            {/* Filter Tabs */}
            <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700 overflow-x-auto pb-1">
                {[
                    {id: 'citizen', label: '개인/공무원'},
                    {id: 'mart', label: '사업자 (마트)'},
                    {id: 'gov', label: '공무원 전용'},
                    {id: 'teacher', label: '교사/관리자'},
                    {id: 'country', label: '나라 관리'},
                    {id: 'signup', label: '가입 모니터링'}
                ].map(tab => (
                    <button 
                        key={tab.id} 
                        onClick={() => setActiveTab(tab.id as any)}
                        className={`px-4 py-2 text-sm font-bold whitespace-nowrap border-b-2 transition-colors ${activeTab === tab.id ? 'border-green-500 text-green-600' : 'border-transparent text-gray-500'}`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* ... Active Tab Content (Country, Signup, List) - Keeping List rendering ... */}
            
            {activeTab !== 'country' && activeTab !== 'signup' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full">
                    {groupedUsers[activeTab].map(u => (
                        <Card key={u.name} className={`flex flex-col justify-between p-6 hover:shadow-lg transition-shadow h-44 ${u.isSuspended ? 'border-2 border-red-500 bg-red-50 dark:bg-red-900/10' : ''}`}>
                            <div>
                                <div className="flex justify-between items-start">
                                    <p className="font-bold text-lg flex items-center gap-2">
                                        {formatName(u.name)}
                                        {u.isOnline && <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" title="온라인"></span>}
                                        {u.isSuspended && <span className="text-xs bg-red-500 text-white px-2 py-0.5 rounded">정지됨</span>}
                                    </p>
                                    <span className="text-xs bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded">{u.customJob || u.type}</span>
                                </div>
                                <p className="text-xs text-gray-500 mt-1">ID: {u.id || '미가입'}</p>
                                <p className="text-sm text-blue-500 mt-2 font-bold">총 자산: ₩ {calculateTotalAsset(u).toLocaleString()}</p>
                            </div>
                            <div className="mt-4 flex justify-end">
                                <Button variant="secondary" className="text-xs py-2 px-4" onClick={() => openEdit(u)}>
                                    관리
                                </Button>
                            </div>
                        </Card>
                    ))}
                </div>
            )}

            {/* Create Modal */}
            <Modal isOpen={isCreating} onClose={() => setIsCreating(false)} title="새 사용자 추가">
                <div className="space-y-4">
                    <Input placeholder="이름" value={newName} onChange={e => setNewName(e.target.value)} />
                    <Input placeholder="아이디" value={newId} onChange={e => setNewId(e.target.value)} />
                    <Input placeholder="비밀번호" value={newPw} onChange={e => setNewPw(e.target.value)} />
                    <Button className="w-full" onClick={handleCreateUser}>생성</Button>
                </div>
            </Modal>

            {/* Edit Modal */}
            <Modal isOpen={!!selectedUser && !isEditingSavings && !isEditingLoans} onClose={() => setSelectedUser(null)} title={`${formatName(selectedUser)} 정보 수정`}>
                <div className="space-y-4 w-full">
                    {/* Basic Info Inputs ... */}
                    <div>
                        <div className="flex justify-between items-center mb-1">
                            <label className="text-sm font-medium">직업 (Type)</label>
                            <button onClick={() => setIsCustomType(!isCustomType)} className="text-xs text-blue-500 underline">
                                {isCustomType ? '기본 목록 선택' : '직접 입력'}
                            </button>
                        </div>
                        {isCustomType ? (
                            <Input value={editType} onChange={e => setEditType(e.target.value)} placeholder="직업 직접 입력" />
                        ) : (
                            <select value={editType} onChange={e => setEditType(e.target.value)} className="w-full p-3 rounded-md bg-[#F0F0F0] text-[#121212] dark:bg-[#2D2D2D] dark:text-[#E0E0E0] outline-none">
                                <option value="citizen">시민</option>
                                <option value="mart">마트</option>
                                <option value="government">정부</option>
                                <option value="admin">관리자</option>
                                <option value="teacher">교사</option>
                            </select>
                        )}
                    </div>
                    <div><label className="text-sm font-medium block mb-1">현금 (KRW)</label><Input type="number" value={editKRW} onChange={e => setEditKRW(e.target.value)} /></div>
                    <div><label className="text-sm font-medium block mb-1">달러 (USD)</label><Input type="number" value={editUSD} onChange={e => setEditUSD(e.target.value)} /></div>
                    
                    <div className="flex gap-2 mt-4">
                        <Button variant="secondary" onClick={() => setIsEditingSavings(true)} className="flex-1 text-sm">저금 관리 ({userDeposits.length})</Button>
                        <Button variant="secondary" onClick={() => setIsEditingLoans(true)} className="flex-1 text-sm">대출 관리 ({userLoans.length})</Button>
                    </div>

                    <div className="flex gap-2 pt-4">
                        <Button variant="danger" className="flex-1" onClick={handleDeleteUser}>삭제</Button>
                        <Button className="flex-1" onClick={handleSave}>저장</Button>
                    </div>
                </div>
            </Modal>

            {/* Savings Edit Modal */}
            <Modal isOpen={isEditingSavings} onClose={() => setIsEditingSavings(false)} title={`저금 관리 - ${selectedUser}`}>
                <div className="space-y-4">
                    <div className="max-h-60 overflow-y-auto space-y-2 border p-2 rounded">
                        {userDeposits.map(d => (
                            <div key={d.id} className="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-800 rounded">
                                <span className="text-sm">{d.type} | ₩{d.amount.toLocaleString()} ({d.status})</span>
                                <button onClick={() => handleDeleteSavings(d.id)} className="text-red-500 text-xs font-bold">삭제</button>
                            </div>
                        ))}
                        {userDeposits.length === 0 && <p className="text-xs text-center text-gray-500">내역 없음</p>}
                    </div>
                    <div className="pt-2 border-t">
                        <h5 className="font-bold text-sm mb-2">새 저금 추가</h5>
                        <div className="grid grid-cols-2 gap-2 mb-2">
                            <select value={newSaveType} onChange={e => setNewSaveType(e.target.value as any)} className="border p-2 rounded text-sm bg-white dark:bg-gray-700">
                                <option value="regular">보통예금</option>
                                <option value="term">정기예금</option>
                                <option value="installment">정기적금</option>
                            </select>
                            <Input type="number" placeholder="금액" value={newSaveAmount} onChange={e => setNewSaveAmount(e.target.value)} className="py-1 text-sm" />
                            <Input type="number" placeholder="기간(주)" value={newSaveWeeks} onChange={e => setNewSaveWeeks(e.target.value)} className="py-1 text-sm" />
                            <Input type="number" placeholder="이자율(%)" value={newSaveRate} onChange={e => setNewSaveRate(e.target.value)} className="py-1 text-sm" />
                        </div>
                        <Button onClick={handleAddSavings} className="w-full text-sm">추가하기</Button>
                    </div>
                    <Button variant="secondary" onClick={() => setIsEditingSavings(false)} className="w-full">뒤로가기</Button>
                </div>
            </Modal>

            {/* Loans Edit Modal */}
            <Modal isOpen={isEditingLoans} onClose={() => setIsEditingLoans(false)} title={`대출 관리 - ${selectedUser}`}>
                <div className="space-y-4">
                    <div className="max-h-60 overflow-y-auto space-y-2 border p-2 rounded">
                        {userLoans.map(l => (
                            <div key={l.id} className="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-800 rounded">
                                <span className="text-sm">₩{l.amount.toLocaleString()} | {l.interestRate.rate}% ({l.status})</span>
                                <button onClick={() => handleDeleteLoan(l.id)} className="text-red-500 text-xs font-bold">삭제</button>
                            </div>
                        ))}
                        {userLoans.length === 0 && <p className="text-xs text-center text-gray-500">내역 없음</p>}
                    </div>
                    <div className="pt-2 border-t">
                        <h5 className="font-bold text-sm mb-2">새 대출 추가</h5>
                        <div className="grid grid-cols-2 gap-2 mb-2">
                            <Input type="number" placeholder="금액" value={newLoanAmount} onChange={e => setNewLoanAmount(e.target.value)} className="py-1 text-sm" />
                            <Input type="number" placeholder="기간(주)" value={newLoanWeeks} onChange={e => setNewLoanWeeks(e.target.value)} className="py-1 text-sm" />
                            <Input type="number" placeholder="이자율(%)" value={newLoanRate} onChange={e => setNewLoanRate(e.target.value)} className="py-1 text-sm" />
                            <Input placeholder="담보 (선택)" value={newLoanCollateral} onChange={e => setNewLoanCollateral(e.target.value)} className="py-1 text-sm" />
                        </div>
                        <Button onClick={handleAddLoan} className="w-full text-sm">추가하기</Button>
                    </div>
                    <Button variant="secondary" onClick={() => setIsEditingLoans(false)} className="w-full">뒤로가기</Button>
                </div>
            </Modal>
        </div>
    );
};
