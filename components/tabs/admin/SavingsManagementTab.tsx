
import React, { useMemo, useState } from 'react';
import { useGame } from '../../../context/GameContext';
import { Card, Button } from '../../Shared';
import { TermDeposit, Application } from '../../../types';

export const SavingsManagementTab: React.FC = () => {
    const { db, saveDb, notify, showConfirm, showModal, wait } = useGame();
    const [subTab, setSubTab] = useState<'pending' | 'active' | 'completed'>('pending');
    
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
        const user = newDb.users[app.applicantName];
        
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
        newDb.users['한국은행'].balanceKRW += app.amount;

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

    return (
        <Card>
            <h3 className="text-2xl font-bold mb-6">저금 관리</h3>
            
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
        </Card>
    );
};
