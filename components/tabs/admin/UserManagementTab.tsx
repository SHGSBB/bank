
import React, { useState, useMemo, useEffect } from 'react';
import { useGame } from '../../../context/GameContext';
import { Card, Button, Modal, Input, Toggle, formatName, MoneyInput } from '../../Shared';
import { User, TermDeposit, Loan } from '../../../types';
import { ref, remove } from 'firebase/database';
import { database, toSafeId } from '../../../services/firebase';

export const UserManagementTab: React.FC = () => {
    const { db, saveDb, showModal, showConfirm, notify, updateUser, loadAllUsers, createChat, sendMessage } = useGame();
    
    // Force load users on mount
    useEffect(() => { 
        loadAllUsers();
    }, []);

    const [selectedUser, setSelectedUser] = useState<User | null>(null);
    const [activeTab, setActiveTab] = useState<'citizen'|'mart'|'gov'|'teacher'|'pending'>('citizen');

    // Edit states
    const [editBalanceKRW, setEditBalanceKRW] = useState('');
    const [editBalanceUSD, setEditBalanceUSD] = useState('');
    const [editDeposits, setEditDeposits] = useState<TermDeposit[]>([]);
    const [editLoans, setEditLoans] = useState<Loan[]>([]);

    const users = useMemo(() => db.users ? (Object.values(db.users) as User[]) : [], [db.users]);
    const pendingUsers = useMemo(() => users.filter(u => u.approvalStatus === 'pending'), [users]);
    const approvedUsers = useMemo(() => users.filter(u => u.approvalStatus !== 'pending'), [users]);

    const groupedUsers = useMemo(() => {
        const sorted = [...approvedUsers].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko-KR'));
        return {
            citizen: sorted.filter(u => u.type === 'citizen'),
            mart: sorted.filter(u => u.type === 'mart'),
            gov: sorted.filter(u => u.type === 'government'),
            teacher: sorted.filter(u => u.type === 'admin' || u.type === 'teacher' || u.type === 'root'),
            pending: pendingUsers
        };
    }, [approvedUsers, pendingUsers]);

    const openEditModal = (user: User) => {
        setSelectedUser(user);
        setEditBalanceKRW((user.balanceKRW || 0).toString());
        setEditBalanceUSD((user.balanceUSD || 0).toString());
        
        const deposits = (Object.values(db.termDeposits || {}) as TermDeposit[]).filter((d: TermDeposit) => d.owner === user.name);
        setEditDeposits(deposits);

        const loans = user.loans ? (Array.isArray(user.loans) ? user.loans : Object.values(user.loans)) : [];
        setEditLoans(loans);
    };

    const handleSaveUser = async () => {
        if (!selectedUser) return;
        const newDb = { ...db };
        const userRef = newDb.users[toSafeId(selectedUser.email || selectedUser.id || '')];
        if (!userRef) return showModal("사용자를 찾을 수 없습니다.");

        userRef.balanceKRW = parseInt(editBalanceKRW) || 0;
        userRef.balanceUSD = parseInt(editBalanceUSD) || 0;

        const loanObj: Record<string, Loan> = {};
        editLoans.forEach(l => loanObj[l.id] = l);
        userRef.loans = loanObj;

        const currentGlobalDeposits = newDb.termDeposits || {};
        const otherDeposits = (Object.values(currentGlobalDeposits) as TermDeposit[]).filter(d => d.owner !== selectedUser.name);
        const newGlobalDeposits: Record<string, TermDeposit> = {};
        otherDeposits.forEach(d => newGlobalDeposits[d.id] = d);
        editDeposits.forEach(d => newGlobalDeposits[d.id] = d);
        newDb.termDeposits = newGlobalDeposits;

        await saveDb(newDb);
        showModal("사용자 정보가 저장되었습니다.");
        setSelectedUser(null);
    };

    const updateDeposit = (idx: number, field: keyof TermDeposit, val: any) => {
        const newArr = [...editDeposits];
        newArr[idx] = { ...newArr[idx], [field]: val };
        setEditDeposits(newArr);
    };

    const updateLoan = (idx: number, field: keyof Loan | 'rate' | 'period', val: any) => {
        const newArr = [...editLoans];
        if (field === 'rate' || field === 'period') {
            newArr[idx].interestRate = {
                ...newArr[idx].interestRate,
                [field === 'rate' ? 'rate' : 'periodWeeks']: parseFloat(val)
            };
        } else {
            newArr[idx] = { ...newArr[idx], [field]: val };
        }
        setEditLoans(newArr);
    };

    const addDeposit = () => {
        setEditDeposits([...editDeposits, {
            id: `admin_dep_${Date.now()}`,
            owner: selectedUser!.name,
            amount: 0,
            startDate: new Date().toISOString(),
            endDate: new Date().toISOString(),
            interestRate: 0,
            status: 'active',
            type: 'term'
        }]);
    };

    const addLoan = () => {
        setEditLoans([...editLoans, {
            id: `admin_loan_${Date.now()}`,
            amount: 0,
            interestRate: { rate: 5, periodWeeks: 4 },
            applyDate: new Date().toISOString(),
            repaymentDate: new Date().toISOString(),
            status: 'approved'
        }]);
    };

    const handleApproval = async (user: User, approve: boolean) => {
        if (!approve && !(await showConfirm(`${user.name} 님의 가입을 거절하시겠습니까?`))) return;
        
        if (approve) {
            await updateUser(user.id || user.email!, { approvalStatus: 'approved' });
            notify(user.name, '회원가입이 승인되었습니다.', true);
        } else {
            const safeKey = user.email ? toSafeId(user.email) : user.name;
            await remove(ref(database, `users/${safeKey}`));
        }
        showModal('처리되었습니다.');
        await loadAllUsers();
    };

    const handleChatWithUser = async (user: User) => {
        try {
            const chatId = await createChat([user.name], 'private');
            // Open the chat system via global event or state if possible
            // Currently, ChatSystem is opened via state in Dashboard. 
            // We can dispatch event to open chat.
            window.dispatchEvent(new CustomEvent('open-chat'));
            
            // Optionally send a greeting
            // await sendMessage(chatId, "관리자가 대화를 시작했습니다.");
        } catch (e) {
            showModal("채팅방 생성 실패");
        }
    };

    return (
        <div className="space-y-6 w-full">
            <div className="flex justify-between items-center px-1">
                <h3 className="text-2xl font-bold">사용자 및 승인 관리</h3>
                <Button onClick={loadAllUsers} className="text-xs py-1" variant="secondary">새로고침</Button>
            </div>
            
            <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700 overflow-x-auto pb-1">
                {[
                    {id: 'citizen', label: '시민'},
                    {id: 'mart', label: '마트'},
                    {id: 'gov', label: '공무원'},
                    {id: 'teacher', label: '관리자/교사'},
                    {id: 'pending', label: `승인 대기 (${pendingUsers.length})`}
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

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full">
                {groupedUsers[activeTab].map(u => (
                    <Card key={u.id || u.name} className={`flex flex-col justify-between p-6 ${activeTab === 'pending' ? 'border-2 border-orange-400 bg-orange-50 dark:bg-orange-900/10' : ''}`}>
                        <div>
                            <div className="flex justify-between items-start">
                                <p className="font-bold text-lg">{formatName(u.name)}</p>
                                <span className="text-xs bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded">
                                    {u.type}
                                </span>
                            </div>
                            <p className="text-xs text-gray-500 mt-1">{u.email}</p>
                            <p className="text-[10px] text-gray-400 mt-2">ID: {u.id}</p>
                        </div>
                        <div className="mt-4 flex flex-col gap-2">
                            {activeTab === 'pending' ? (
                                <div className="flex gap-2">
                                    <Button onClick={() => handleApproval(u, true)} className="flex-1 text-xs py-2">승인</Button>
                                    <Button variant="danger" onClick={() => handleApproval(u, false)} className="flex-1 text-xs py-2">거절</Button>
                                </div>
                            ) : (
                                <div className="flex gap-2">
                                    <Button variant="secondary" className="flex-1 text-xs py-2" onClick={() => openEditModal(u)}>관리</Button>
                                    <Button className="flex-1 text-xs py-2 bg-blue-600 hover:bg-blue-500" onClick={() => handleChatWithUser(u)}>채팅</Button>
                                </div>
                            )}
                        </div>
                    </Card>
                ))}
                {groupedUsers[activeTab].length === 0 && <p className="col-span-full text-center py-10 text-gray-500">표시할 사용자가 없습니다.</p>}
            </div>

            <Modal isOpen={!!selectedUser} onClose={() => setSelectedUser(null)} title={`${selectedUser?.name} 관리`} wide>
                {selectedUser && (
                    <div className="space-y-6">
                        <div className="grid grid-cols-2 gap-4 bg-gray-50 dark:bg-gray-800 p-4 rounded-xl">
                            <div><label className="text-xs font-bold block mb-1">원화 잔고 (KRW)</label><MoneyInput value={editBalanceKRW} onChange={e => setEditBalanceKRW(e.target.value)} /></div>
                            <div><label className="text-xs font-bold block mb-1">달러 잔고 (USD)</label><Input type="number" value={editBalanceUSD} onChange={e => setEditBalanceUSD(e.target.value)} /></div>
                        </div>
                        <div className="border rounded-xl p-4">
                            <div className="flex justify-between items-center mb-2"><h4 className="font-bold text-sm">예금 관리</h4><Button onClick={addDeposit} className="text-xs py-1 px-2">+ 추가</Button></div>
                            {editDeposits.map((d, i) => (
                                <div key={i} className="flex flex-wrap gap-2 mb-2 bg-gray-100 dark:bg-gray-700 p-2 rounded items-center text-xs">
                                    <select value={d.type} onChange={e => updateDeposit(i, 'type', e.target.value)} className="p-1 rounded"><option value="regular">보통</option><option value="term">정기</option></select>
                                    <input type="number" value={d.amount} onChange={e => updateDeposit(i, 'amount', parseInt(e.target.value))} className="w-20 p-1 rounded" placeholder="금액" />
                                    <input type="number" value={d.interestRate} onChange={e => updateDeposit(i, 'interestRate', parseFloat(e.target.value))} className="w-12 p-1 rounded" placeholder="%" />
                                    <input type="date" value={new Date(d.endDate).toISOString().split('T')[0]} onChange={e => updateDeposit(i, 'endDate', new Date(e.target.value).toISOString())} className="p-1 rounded" />
                                    <button onClick={() => setEditDeposits(editDeposits.filter((_, idx) => idx !== i))} className="text-red-500 font-bold px-2">X</button>
                                </div>
                            ))}
                        </div>
                        <div className="border rounded-xl p-4">
                            <div className="flex justify-between items-center mb-2"><h4 className="font-bold text-sm">대출 관리</h4><Button onClick={addLoan} className="text-xs py-1 px-2">+ 추가</Button></div>
                            {editLoans.map((l, i) => (
                                <div key={i} className="flex flex-wrap gap-2 mb-2 bg-red-50 dark:bg-red-900/20 p-2 rounded items-center text-xs">
                                    <input type="number" value={l.amount} onChange={e => updateLoan(i, 'amount', parseInt(e.target.value))} className="w-20 p-1 rounded" placeholder="금액" />
                                    <input type="number" value={l.interestRate.rate} onChange={e => updateLoan(i, 'rate', parseFloat(e.target.value))} className="w-12 p-1 rounded" placeholder="이율" />
                                    <span className="text-[10px]">만기:</span>
                                    <input type="date" value={new Date(l.repaymentDate).toISOString().split('T')[0]} onChange={e => updateLoan(i, 'repaymentDate', new Date(e.target.value).toISOString())} className="p-1 rounded" />
                                    <button onClick={() => setEditLoans(editLoans.filter((_, idx) => idx !== i))} className="text-red-500 font-bold px-2">X</button>
                                </div>
                            ))}
                        </div>
                        <div className="flex gap-2">
                            <Button onClick={handleSaveUser} className="flex-1">저장하기</Button>
                            <Button onClick={() => { handleChatWithUser(selectedUser); setSelectedUser(null); }} className="flex-1 bg-blue-600 hover:bg-blue-500">채팅하기</Button>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
};
