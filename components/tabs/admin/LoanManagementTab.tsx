
import React, { useState, useMemo } from 'react';
import { useGame } from '../../../context/GameContext';
import { Card, Button, Input, Modal } from '../../Shared';
import { User, Loan, Application } from '../../../types';
import { toSafeId } from '../../../services/firebase';

export const LoanManagementTab: React.FC = () => {
    const { db, saveDb, notify, showConfirm, showModal, wait } = useGame();
    const [subTab, setSubTab] = useState<'pending' | 'active' | 'completed'>('pending');

    const allLoans = useMemo(() => {
        return (Object.values(db.users) as User[]).flatMap(user => {
            const loans = user.loans ? (Array.isArray(user.loans) ? user.loans : Object.values(user.loans)) : [];
            return loans.map(loan => ({ ...loan, userName: user.name }));
        }).sort((a,b) => new Date(b.applyDate).getTime() - new Date(a.applyDate).getTime());
    }, [db.users]);

    const pendingApplications = useMemo(() => {
        if (!db.pendingApplications) return [];
        const apps = Object.values(db.pendingApplications) as Application[];
        return apps.filter(app => app.type === 'loan').sort((a,b) => new Date(b.requestedDate).getTime() - new Date(a.requestedDate).getTime());
    }, [db.pendingApplications]);

    const activeLoans = allLoans.filter(l => l.status === 'approved' || l.status === 'collateral_pending');
    const historyLoans = allLoans.filter(l => l.status !== 'approved' && l.status !== 'collateral_pending');

    const handleApprove = async (app: Application) => {
        if (!await showConfirm(`${app.applicantName}님의 대출(₩${app.amount.toLocaleString()})을 승인하시겠습니까?`)) return;
        
        await wait('heavy');
        const newDb = { ...db };
        
        // Find applicant
        const userEntry = (Object.entries(newDb.users) as [string, User][]).find(([k, u]) => u.name === app.applicantName);
        if (!userEntry) return showModal("사용자를 찾을 수 없습니다.");
        const [userKey, user] = userEntry;

        // Find Bank - Dynamic Lookup
        const bankUser = (Object.values(newDb.users) as User[]).find(u => 
            u.govtRole === '한국은행장' ||
            (u.type === 'admin' && u.subType === 'govt') ||
            u.name === '한국은행'
        );
        
        if (!bankUser) return showModal("한국은행 계정을 찾을 수 없습니다. (관리자에게 문의)");

        const newLoan: Loan = {
            id: app.loanId || app.id,
            amount: app.amount,
            interestRate: db.settings.loanInterestRate,
            applyDate: new Date().toISOString(),
            repaymentDate: new Date(Date.now() + db.settings.loanInterestRate.periodWeeks * 7 * 24 * 60 * 60 * 1000).toISOString(),
            status: 'approved',
            collateral: app.collateral || null
        };
        
        user.balanceKRW += app.amount;
        user.transactions = [...(user.transactions || []), { 
            id: Date.now(), type: 'loan', amount: app.amount, currency: 'KRW', description: '대출금 입금', date: new Date().toISOString() 
        }];
        
        if (!user.loans) user.loans = {};
        if (Array.isArray(user.loans)) {
             const loanObj: Record<string, Loan> = {};
             user.loans.forEach(l => loanObj[l.id] = l);
             user.loans = loanObj;
        }
        (user.loans as Record<string, Loan>)[newLoan.id] = newLoan;

        if (newDb.pendingApplications) delete newDb.pendingApplications[app.id];
        
        // Deduct from Bank
        bankUser.balanceKRW -= app.amount;

        await saveDb(newDb);
        notify(app.applicantName, `대출 신청(₩${app.amount.toLocaleString()})이 승인되었습니다.`, true);
        showModal("승인 완료.");
    };

    const handleReject = async (app: Application) => {
        if (!await showConfirm("거절하시겠습니까?")) return;
        await wait('light');
        const newDb = { ...db };
        if (newDb.pendingApplications) delete newDb.pendingApplications[app.id];
        await saveDb(newDb);
        notify(app.applicantName, `대출 신청이 거절되었습니다.`);
    };

    return (
        <Card>
            <h3 className="text-2xl font-bold mb-6">대출 관리</h3>
            
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
                                {app.collateral && <span className="text-xs bg-orange-100 text-orange-800 px-2 rounded">담보: {app.collateral}</span>}
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
                    {activeLoans.length === 0 && <p className="text-gray-400 py-4">진행 중인 대출이 없습니다.</p>}
                    {activeLoans.map(loan => (
                        <div key={loan.id} className="p-4 bg-green-50 dark:bg-green-900/20 rounded-2xl border border-green-200 flex justify-between items-center">
                            <div>
                                <p className="font-bold">{loan.userName}</p>
                                <p className="text-sm">₩ {loan.amount.toLocaleString()}</p>
                                <p className="text-xs text-gray-500">만기: {new Date(loan.repaymentDate).toLocaleDateString()}</p>
                            </div>
                            <span className="text-xs font-bold text-green-600">진행중</span>
                        </div>
                    ))}
                </div>
            )}

            {subTab === 'completed' && (
                <div className="space-y-3">
                    {historyLoans.length === 0 && <p className="text-gray-400 py-4">종료된 내역이 없습니다.</p>}
                    {historyLoans.map(loan => (
                        <div key={loan.id} className="p-4 bg-gray-100 dark:bg-gray-800 rounded-2xl border flex justify-between items-center opacity-70">
                            <div>
                                <p className="font-bold">{loan.userName}</p>
                                <p className="text-sm">₩ {loan.amount.toLocaleString()}</p>
                                <p className="text-xs">{loan.status === 'repaid' ? '상환 완료' : '거절/취소됨'}</p>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </Card>
    );
};
