
import React, { useMemo, useState } from 'react';
import { useGame } from '../../../context/GameContext';
import { Card, Button, Input, Modal, MoneyInput } from '../../Shared';
import { TermDeposit, Application, User } from '../../../types';
import { toSafeId } from '../../../services/firebase';

export const SavingsManagementTab: React.FC = () => {
    const { db, saveDb, notify, showConfirm, showModal, wait } = useGame();
    const [subTab, setSubTab] = useState<'pending' | 'active' | 'completed'>('pending');
    
    // Manual Create
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [targetUser, setTargetUser] = useState('');
    const [createAmount, setCreateAmount] = useState('');
    const [createRate, setCreateRate] = useState('3');
    const [createType, setCreateType] = useState<'regular'|'term'|'installment'>('term');
    const [createPeriod, setCreatePeriod] = useState('4');

    const allDeposits = (Object.values(db.termDeposits || {}) as TermDeposit[])
        .sort((a,b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
        
    const activeDeposits = allDeposits.filter(d => d.status === 'active');
    const completedDeposits = allDeposits.filter(d => d.status !== 'active');

    const pendingApplications = useMemo(() => {
        if (!db.pendingApplications) return [];
        const apps = Object.values(db.pendingApplications) as Application[];
        return apps.filter(app => app.type === 'savings').sort((a,b) => new Date(b.requestedDate).getTime() - new Date(a.requestedDate).getTime());
    }, [db.pendingApplications]);

    const handleApprove = async (app: Application) => {
        if (!await showConfirm(`${app.applicantName}님의 예금(₩${app.amount.toLocaleString()})을 승인하시겠습니까?`)) return;

        await wait('heavy');
        const newDb = { ...db };
        
        const userEntry = (Object.entries(newDb.users) as [string, User][]).find(([k, u]) => u.name === app.applicantName);
        if (!userEntry) return showModal("사용자를 찾을 수 없습니다.");
        const [userKey, user] = userEntry;

        const bankUser = (Object.values(newDb.users) as User[]).find(u => u.govtRole === '한국은행장' || u.name === '한국은행');
        if (!bankUser) return showModal("한국은행 계정을 찾을 수 없습니다.");

        if (user.balanceKRW < app.amount) {
             showModal("사용자 잔액 부족으로 승인 불가.");
             return;
        }
        user.balanceKRW -= app.amount;
        user.transactions = [...(user.transactions || []), { 
            id: Date.now(), type: 'savings', amount: -app.amount, currency: 'KRW', description: '예금 가입', date: new Date().toISOString() 
        }];

        const newDeposit: TermDeposit = {
            id: `dep_${Date.now()}`,
            owner: app.applicantName,
            amount: app.amount,
            startDate: new Date().toISOString(),
            endDate: new Date(Date.now() + db.settings.savingsInterest.periodWeeks * 7 * 24 * 60 * 60 * 1000).toISOString(),
            interestRate: db.settings.savingsInterest.rate,
            status: 'active',
            type: app.savingsType || 'regular'
        };
        
        newDb.termDeposits = { ...(newDb.termDeposits || {}), [newDeposit.id]: newDeposit };
        if (newDb.pendingApplications) delete newDb.pendingApplications[app.id];
        
        bankUser.balanceKRW += app.amount;

        await saveDb(newDb);
        notify(app.applicantName, `예금 신청(₩${app.amount.toLocaleString()})이 승인되었습니다.`, true);
        showModal("승인 완료.");
    };

    const handleReject = async (app: Application) => {
        if (!await showConfirm("거절하시겠습니까?")) return;
        await wait('light');
        const newDb = { ...db };
        if (newDb.pendingApplications) delete newDb.pendingApplications[app.id];
        await saveDb(newDb);
        notify(app.applicantName, `예금 신청이 거절되었습니다.`);
    };

    const handleManualCreate = async () => {
        const amount = parseInt(createAmount);
        const rate = parseFloat(createRate);
        const weeks = parseInt(createPeriod);
        
        if (!targetUser || isNaN(amount) || isNaN(rate)) return showModal("정보를 입력하세요.");

        const newDb = { ...db };
        const newDeposit: TermDeposit = {
            id: `manual_dep_${Date.now()}`,
            owner: targetUser,
            amount: amount,
            startDate: new Date().toISOString(),
            endDate: new Date(Date.now() + weeks * 7 * 24 * 60 * 60 * 1000).toISOString(),
            interestRate: rate,
            status: 'active',
            type: createType
        };
        
        newDb.termDeposits = { ...(newDb.termDeposits || {}), [newDeposit.id]: newDeposit };
        await saveDb(newDb);
        showModal("저금 상품이 수동 생성되었습니다.");
        setShowCreateModal(false);
    };

    return (
        <Card>
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-bold">저금 관리</h3>
                <Button onClick={() => setShowCreateModal(true)} className="text-xs">+ 수동 생성</Button>
            </div>
            
            <div className="flex gap-2 mb-4 border-b border-gray-200 dark:border-gray-700 pb-1">
                <button onClick={() => setSubTab('pending')} className={`px-4 py-2 border-b-2 ${subTab === 'pending' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500'}`}>승인 대기</button>
                <button onClick={() => setSubTab('active')} className={`px-4 py-2 border-b-2 ${subTab === 'active' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500'}`}>진행 중</button>
                <button onClick={() => setSubTab('completed')} className={`px-4 py-2 border-b-2 ${subTab === 'completed' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500'}`}>완료/종료</button>
            </div>

            {subTab === 'pending' && (
                <div className="space-y-3">
                    {pendingApplications.length === 0 && <p className="text-gray-400 py-4">대기 중인 신청이 없습니다.</p>}
                    {pendingApplications.map(app => (
                        <div key={app.id} className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-2xl border border-blue-200 flex justify-between items-center shadow-sm">
                            <div>
                                <p className="font-bold text-lg">{app.applicantName}</p>
                                <p className="text-sm">₩ {(app.amount || 0).toLocaleString()}</p>
                                <p className="text-xs text-gray-500">{new Date(app.requestedDate).toLocaleString()}</p>
                                <span className="text-xs bg-gray-200 px-2 rounded">{app.savingsType}</span>
                            </div>
                            <div className="flex gap-2">
                                <Button onClick={() => handleApprove(app)} className="text-xs py-2">승인</Button>
                                <Button variant="danger" onClick={() => handleReject(app)} className="text-xs py-2">거절</Button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {subTab === 'active' && (
                <div className="space-y-3">
                    {activeDeposits.length === 0 && <p className="text-gray-400 py-4">진행 중인 저금이 없습니다.</p>}
                    {activeDeposits.map(dep => (
                        <div key={dep.id} className="p-4 bg-green-50 dark:bg-green-900/20 rounded-2xl border border-green-200 flex justify-between items-center">
                            <div>
                                <p className="font-bold">{dep.owner}</p>
                                <p className="text-sm">₩ {dep.amount.toLocaleString()}</p>
                                <p className="text-xs text-gray-500">{dep.type} | 만기: {new Date(dep.endDate).toLocaleDateString()}</p>
                            </div>
                            <span className="text-xs font-bold text-green-600">이자 {dep.interestRate}%</span>
                        </div>
                    ))}
                </div>
            )}

            {subTab === 'completed' && (
                <div className="space-y-3">
                    {completedDeposits.length === 0 && <p className="text-gray-400 py-4">종료된 내역이 없습니다.</p>}
                    {completedDeposits.map(dep => (
                        <div key={dep.id} className="p-4 bg-gray-100 dark:bg-gray-800 rounded-2xl border flex justify-between items-center opacity-70">
                            <div>
                                <p className="font-bold">{dep.owner}</p>
                                <p className="text-sm">₩ {dep.amount.toLocaleString()}</p>
                                <p className="text-xs">{dep.status}</p>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <Modal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} title="저금 수동 생성">
                <div className="space-y-4">
                    <Input placeholder="대상 유저 이름" value={targetUser} onChange={e => setTargetUser(e.target.value)} />
                    <MoneyInput placeholder="예치 금액" value={createAmount} onChange={e => setCreateAmount(e.target.value)} />
                    <select value={createType} onChange={e => setCreateType(e.target.value as any)} className="w-full p-3 rounded-2xl bg-gray-100 dark:bg-gray-800 border-none">
                        <option value="regular">보통예금</option>
                        <option value="term">정기예금</option>
                        <option value="installment">정기적금</option>
                    </select>
                    <div className="flex gap-2">
                        <Input placeholder="이자율 (%)" type="number" value={createRate} onChange={e => setCreateRate(e.target.value)} className="flex-1" />
                        <Input placeholder="기간 (주)" type="number" value={createPeriod} onChange={e => setCreatePeriod(e.target.value)} className="flex-1" />
                    </div>
                    <Button onClick={handleManualCreate} className="w-full">생성하기</Button>
                </div>
            </Modal>
        </Card>
    );
};
