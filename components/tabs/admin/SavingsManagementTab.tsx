
import React, { useMemo } from 'react';
import { useGame } from '../../../context/GameContext';
import { Card, Button } from '../../Shared';
import { TermDeposit, Application } from '../../../types';

export const SavingsManagementTab: React.FC = () => {
    const { db, saveDb, notify, showConfirm, showModal, wait } = useGame();
    
    const allDeposits = (Object.values(db.termDeposits || {}) as TermDeposit[])
        .sort((a,b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
        
    const activeDeposits = allDeposits.filter(d => d.status === 'active');
    const historyDeposits = allDeposits.filter(d => d.status !== 'active');

    // Strict filtering: Just get everything from db.pendingApplications where type is 'savings'
    // Do NOT filter by status. If it's in the pending table, it's pending.
    const pendingApplications = useMemo(() => {
        const apps = Object.values(db.pendingApplications || {}) as Application[];
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
        delete newDb.pendingApplications[app.id];
        newDb.users['한국은행'].balanceKRW += app.amount;

        await saveDb(newDb);
        notify(app.applicantName, `예금 신청(₩${app.amount.toLocaleString()})이 승인되었습니다.`, true);
        showModal("승인 완료.");
    };

    const handleReject = async (app: Application) => {
        if (!await showConfirm("거절하시겠습니까?")) return;
        await wait('light');
        const newDb = { ...db };
        delete newDb.pendingApplications[app.id];
        await saveDb(newDb);
        notify(app.applicantName, `예금 신청이 거절되었습니다.`);
    };

    const handleForceWithdraw = async (depositId: string, owner: string, amount: number) => {
        const confirm = await showConfirm(`${owner}님의 예금 ₩${amount.toLocaleString()}을 강제 해지하시겠습니까?`);
        if (!confirm) return;

        await wait('heavy');
        const newDb = { ...db };
        const deposits = { ...newDb.termDeposits };
        
        if (deposits[depositId]) {
            deposits[depositId] = { ...deposits[depositId], status: 'withdrawn' };
            newDb.termDeposits = deposits;

            const user = newDb.users[owner];
            user.balanceKRW += amount; // Return principal
            
            user.transactions = [...(user.transactions || []), { id: Date.now(), type: 'savings', amount: amount, currency: 'KRW', description: '예금 강제 해지', date: new Date().toISOString() }];

            await saveDb(newDb);
            notify(owner, `예금이 관리자에 의해 강제 해지되어 원금 ₩${amount.toLocaleString()}가 입금되었습니다.`, true);
        }
    };

    return (
        <Card>
            <h3 className="text-2xl font-bold mb-6">예금 관리</h3>
            
            <div className="mb-8">
                <h4 className="text-lg font-bold text-blue-600 mb-4 flex items-center gap-2">
                    승인 대기 ({pendingApplications.length})
                </h4>
                {pendingApplications.length > 0 ? (
                    <div className="space-y-3">
                        {pendingApplications.map(app => (
                            <div key={app.id} className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-2xl border border-blue-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shadow-sm">
                                <div>
                                    <p className="font-bold text-lg">{app.applicantName}</p>
                                    <p className="text-sm">신청 금액: <span className="font-bold text-blue-700">₩ {(app.amount || 0).toLocaleString()}</span></p>
                                    <p className="text-xs text-gray-500">{new Date(app.requestedDate).toLocaleString()}</p>
                                </div>
                                <div className="flex gap-2 w-full sm:w-auto">
                                    <Button onClick={() => handleApprove(app)} className="text-xs py-2 flex-1">승인</Button>
                                    <Button variant="danger" onClick={() => handleReject(app)} className="text-xs py-2 flex-1">거절</Button>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : <p className="text-gray-400">대기 중인 신청이 없습니다.</p>}
            </div>

            <div className="mb-8">
                <h4 className="text-lg font-bold mb-4 flex items-center gap-2">
                    진행 중인 예금 ({activeDeposits.length})
                </h4>
                <div className="space-y-4 w-full max-h-80 overflow-y-auto pr-1">
                    {activeDeposits.length === 0 ? <p className="text-gray-500">진행 중인 예금이 없습니다.</p> : activeDeposits.map(d => {
                        const expectedPayout = Math.floor(d.amount * (1 + d.interestRate / 100));
                        return (
                            <div key={d.id} className="flex flex-col sm:flex-row justify-between items-center border border-gray-100 dark:border-gray-700 rounded-2xl p-4 bg-white dark:bg-gray-800 w-full shadow-sm">
                                <div className="mb-4 sm:mb-0">
                                    <p className="font-bold text-lg">{d.owner}</p>
                                    <p className="text-sm text-gray-500">만기: {new Date(d.endDate).toLocaleDateString()}</p>
                                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 mt-1">
                                        <p className="font-bold text-green-600">원금: ₩ {(d.amount || 0).toLocaleString()}</p>
                                        <p className="text-sm font-bold text-blue-600">(만기 지급: ₩ {expectedPayout.toLocaleString()})</p>
                                    </div>
                                </div>
                                <Button variant="danger" className="text-sm py-2 px-6" onClick={() => handleForceWithdraw(d.id, d.owner, d.amount)}>강제 해지</Button>
                            </div>
                        );
                    })}
                </div>
            </div>

            <div>
                 <h4 className="text-lg font-bold mb-4 flex items-center gap-2 text-gray-500">
                    만기/해지 내역 ({historyDeposits.length})
                </h4>
                <div className="space-y-2 w-full max-h-60 overflow-y-auto pr-1 opacity-70">
                    {historyDeposits.map(d => (
                         <div key={d.id} className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-900 rounded-lg text-sm">
                            <span>{d.owner} | ₩{(d.amount || 0).toLocaleString()}</span>
                            <span className="text-xs px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded">{d.status}</span>
                         </div>
                    ))}
                    {historyDeposits.length === 0 && <p className="text-gray-400">내역이 없습니다.</p>}
                </div>
            </div>
        </Card>
    );
};
