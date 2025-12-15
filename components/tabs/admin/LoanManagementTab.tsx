
import React, { useState, useMemo } from 'react';
import { useGame } from '../../../context/GameContext';
import { Card, Button, Input, Modal } from '../../Shared';
import { User, Loan, Application } from '../../../types';

export const LoanManagementTab: React.FC = () => {
    const { db, saveDb, notify, showConfirm, showModal, wait } = useGame();
    
    // Negotiation State
    const [negotiatingApp, setNegotiatingApp] = useState<Application | null>(null);
    const [negotiationInput, setNegotiationInput] = useState('');

    const allLoans = (Object.values(db.users) as User[]).flatMap(user => {
        const loans = user.loans ? (Array.isArray(user.loans) ? user.loans : Object.values(user.loans)) : [];
        return loans.map(loan => ({ ...loan, userName: user.name }));
    }).sort((a,b) => new Date(b.applyDate).getTime() - new Date(a.applyDate).getTime());

    // Strict filtering: Just get everything from db.pendingApplications where type is 'loan'
    // Do NOT filter by status. If it's in the pending table, it's pending.
    const pendingApplications = useMemo(() => {
        const apps = Object.values(db.pendingApplications || {}) as Application[];
        return apps.filter(app => app.type === 'loan').sort((a,b) => new Date(b.requestedDate).getTime() - new Date(a.requestedDate).getTime());
    }, [db.pendingApplications]);

    const activeLoans = allLoans.filter(l => l.status === 'approved' || l.status === 'collateral_pending');
    const historyLoans = allLoans.filter(l => l.status !== 'approved' && l.status !== 'collateral_pending');

    const handleApprove = async (app: Application) => {
        if (!await showConfirm(`${app.applicantName}님의 대출(₩${app.amount.toLocaleString()})을 승인하시겠습니까?`)) return;
        
        await wait('heavy');
        const newDb = { ...db };
        const user = newDb.users[app.applicantName];
        
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
        
        if (user.loans && !Array.isArray(user.loans)) {
            user.loans = { ...user.loans, [newLoan.id]: newLoan };
        } else {
            user.loans = [...(user.loans as Loan[] || []), newLoan];
        }

        delete newDb.pendingApplications[app.id];
        newDb.users['한국은행'].balanceKRW -= app.amount;

        await saveDb(newDb);
        notify(app.applicantName, `대출 신청(₩${app.amount.toLocaleString()})이 승인되었습니다.`, true);
        showModal("승인 완료.");
    };

    const handleReject = async (app: Application) => {
        if (!await showConfirm("거절하시겠습니까?")) return;
        await wait('light');
        const newDb = { ...db };
        delete newDb.pendingApplications[app.id];
        await saveDb(newDb);
        notify(app.applicantName, `대출 신청이 거절되었습니다.`);
    };

    const openNegotiation = (app: Application) => {
        setNegotiatingApp(app);
        setNegotiationInput(app.collateral || '');
    };

    const submitNegotiation = async (accept: boolean) => {
        if (!negotiatingApp) return;
        await wait('light');
        const newDb = { ...db };
        const app = newDb.pendingApplications[negotiatingApp.id];
        
        if (accept) {
            app.collateralStatus = 'accepted';
            notify(negotiatingApp.applicantName, `대출 담보가 확정되었습니다. 승인을 기다려주세요.`, true);
        } else {
             app.collateral = negotiationInput;
             app.collateralStatus = 'proposed_by_admin';
             notify(negotiatingApp.applicantName, `한국은행이 대출 담보 조정을 요청했습니다: ${negotiationInput}`, true);
        }

        await saveDb(newDb);
        setNegotiatingApp(null);
        showModal("처리되었습니다.");
    };

    const handleForceRepay = async (userName: string, loan: Loan & { userName: string }) => {
        const confirm = await showConfirm(`${userName}님의 대출금 ₩${loan.amount.toLocaleString()}을 강제 상환 처리하시겠습니까?`);
        if (!confirm) return;
        
        await wait('heavy');
        const newDb = { ...db };
        const user = newDb.users[userName];
        const userLoans = { ...(user.loans as Record<string, Loan>) };
        
        if (userLoans[loan.id]) {
            const repayAmount = Math.floor(loan.amount * (1 + loan.interestRate.rate / 100));
            user.balanceKRW -= repayAmount;
            newDb.users['한국은행'].balanceKRW += repayAmount;
            userLoans[loan.id] = { ...userLoans[loan.id], status: 'repaid' };
            user.loans = userLoans;
            
            const date = new Date().toISOString();
            user.transactions = [...(user.transactions || []), { id: Date.now(), type: 'loan', amount: -repayAmount, currency: 'KRW', description: '대출 강제 상환', date }];
            
            await saveDb(newDb);
            notify(userName, `대출금 ₩${repayAmount.toLocaleString()}이 강제 상환되었습니다.`, true);
        }
    };

    return (
        <Card>
            <h3 className="text-2xl font-bold mb-6">대출 관리</h3>

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
                                    {app.collateral && (
                                        <div className="mt-1 flex items-center gap-2">
                                            <span className="text-xs font-bold text-orange-600 bg-orange-100 px-2 py-0.5 rounded">담보: {app.collateral}</span>
                                            {app.collateralStatus === 'proposed_by_user' && <span className="text-[10px] bg-red-100 text-red-600 px-1 rounded">검토 필요</span>}
                                            {app.collateralStatus === 'accepted' && <span className="text-[10px] bg-green-100 text-green-600 px-1 rounded">합의됨</span>}
                                        </div>
                                    )}
                                </div>
                                <div className="flex flex-col gap-2 w-full sm:w-auto">
                                    <Button onClick={() => openNegotiation(app)} variant="secondary" className="text-xs py-2">담보 협상</Button>
                                    <div className="flex gap-2">
                                        <Button onClick={() => handleApprove(app)} className="text-xs py-2 flex-1">승인</Button>
                                        <Button variant="danger" onClick={() => handleReject(app)} className="text-xs py-2 flex-1">거절</Button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : <p className="text-gray-400">대기 중인 신청이 없습니다.</p>}
            </div>
            
            <div className="mb-8">
                <h4 className="text-lg font-bold mb-4 flex items-center gap-2">
                    진행 중인 대출 ({activeLoans.length})
                </h4>
                <div className="space-y-4 w-full max-h-80 overflow-y-auto pr-1">
                    {activeLoans.map(l => {
                        const repayAmount = Math.floor(l.amount * (1 + l.interestRate.rate / 100));
                        return (
                            <div key={l.id} className="flex justify-between items-center border border-gray-100 dark:border-gray-700 p-4 rounded-2xl bg-white dark:bg-gray-800 shadow-sm">
                                <div>
                                    <p className="font-bold text-lg mb-1">{l.userName}</p>
                                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
                                        <p className="text-sm font-bold text-gray-700 dark:text-gray-300">원금: ₩ {(l.amount || 0).toLocaleString()}</p>
                                        <p className="text-sm font-bold text-red-600">(상환 예정: ₩ {repayAmount.toLocaleString()})</p>
                                    </div>
                                    <p className="text-xs text-gray-400 mt-1">담보: {l.collateral || '없음'}</p>
                                </div>
                                <Button variant="danger" className="text-xs py-2 px-4 whitespace-nowrap" onClick={() => handleForceRepay(l.userName, l)}>강제 상환</Button>
                            </div>
                        );
                    })}
                    {activeLoans.length === 0 && <p className="text-gray-500">진행 중인 대출이 없습니다.</p>}
                </div>
            </div>

            <div>
                <h4 className="text-lg font-bold mb-4 flex items-center gap-2 text-gray-500">
                    완료/종료된 대출 내역 ({historyLoans.length})
                </h4>
                <div className="space-y-2 w-full max-h-60 overflow-y-auto pr-1 opacity-70">
                    {historyLoans.map(l => (
                         <div key={l.id} className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-900 rounded-lg text-sm">
                            <span>{l.userName} | ₩{(l.amount || 0).toLocaleString()}</span>
                            <span className="text-xs px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded">{l.status}</span>
                         </div>
                    ))}
                    {historyLoans.length === 0 && <p className="text-gray-400">내역이 없습니다.</p>}
                </div>
            </div>

            {/* Negotiation Modal */}
            <Modal isOpen={!!negotiatingApp} onClose={() => setNegotiatingApp(null)} title="담보 협상 (관리자)">
                <div className="space-y-4">
                    <div className="bg-gray-100 dark:bg-gray-700 p-4 rounded-2xl">
                        <p className="text-xs text-gray-500 mb-1 font-bold">신청자 제안</p>
                        <p className="font-bold text-lg">{negotiatingApp?.collateral || "(담보 없음)"}</p>
                    </div>
                    
                    <div>
                        <label className="text-sm font-bold mb-2 block">담보 변경 제안 / 수정</label>
                        <Input value={negotiationInput} onChange={e => setNegotiationInput(e.target.value)} placeholder="변경할 내용을 입력하세요." />
                    </div>

                    <div className="flex gap-2 pt-2">
                         <Button onClick={() => submitNegotiation(true)} className="flex-1 bg-green-600">현재 내용으로 수락</Button>
                         <Button onClick={() => submitNegotiation(false)} className="flex-1 bg-blue-600">변경 제안 보내기</Button>
                    </div>
                </div>
            </Modal>
        </Card>
    );
};
