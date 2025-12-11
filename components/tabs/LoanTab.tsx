import React, { useState, useMemo } from 'react';
import { useGame } from '../../context/GameContext';
import { Card, Button, Input, MoneyInput, Modal } from '../Shared';
import { Loan, Application, RealEstateCell } from '../../types';
import { generateId } from '../../services/firebase';

export const LoanTab: React.FC = () => {
    const { currentUser, db, saveDb, notify, showModal, showPinModal, showConfirm } = useGame();
    const [amount, setAmount] = useState('');
    
    // Collateral Input
    const [collateralInput, setCollateralInput] = useState('');
    
    // Negotiation State
    const [negotiatingApp, setNegotiatingApp] = useState<Application | null>(null);
    const [negotiationInput, setNegotiationInput] = useState('');

    // Mortgage State
    const [isMortgageMode, setIsMortgageMode] = useState(false);
    const [selectedProperty, setSelectedProperty] = useState<RealEstateCell | null>(null);

    const loanList = useMemo(() => {
        // Fix: Use db.users[currentUser.name] to get fresh data instead of prop currentUser which might be stale
        const freshUser = db.users[currentUser!.name];
        if (!freshUser) return [];

        let userLoans = freshUser.loans ? (Array.isArray(freshUser.loans) ? freshUser.loans : Object.values(freshUser.loans)) : [];
        
        // Find pending applications directly from DB
        const pendingApps = (Object.values(db.pendingApplications || {}) as Application[])
            .filter(a => a.type === 'loan' && a.applicantName === currentUser?.name);
        
        const pendingLoansAsLoan = pendingApps.map(app => ({
            id: app.loanId || app.id,
            amount: app.amount,
            interestRate: db.settings.loanInterestRate,
            applyDate: app.requestedDate,
            repaymentDate: null,
            status: (app.status === 'negotiating' ? 'collateral_pending' : app.status) as any,
            collateral: app.collateral || null,
            type: app.loanType || 'general',
            appRef: app 
        }));
            
        const loanMap = new Map();
        // Pending first (newer)
        pendingLoansAsLoan.forEach(l => loanMap.set(l.id, l));
        // Then active/history
        userLoans.forEach(l => {
            if (!loanMap.has(l.id)) {
                loanMap.set(l.id, l);
            }
        });

        return Array.from(loanMap.values()).sort((a,b) => new Date(b.applyDate).getTime() - new Date(a.applyDate).getTime());
    }, [currentUser?.name, db.users, db.pendingApplications, db.settings.loanInterestRate]);
    
    const myProperties = useMemo(() => {
        return (db.realEstate.grid || []).filter(p => p.owner === currentUser?.name);
    }, [db.realEstate.grid, currentUser]);

    const handleApply = async () => {
        const valAmount = parseInt(amount);
        if (isNaN(valAmount) || valAmount <= 0) return showModal('올바른 금액을 입력하세요.');

        const loanId = generateId();
        const appId = generateId();
        
        const newApp: Omit<Application, 'id'> & {loanId: string} = {
            type: 'loan',
            applicantName: currentUser!.name,
            amount: valAmount,
            loanId: loanId,
            requestedDate: new Date().toISOString(),
            status: 'pending',
            collateral: isMortgageMode && selectedProperty ? `집 #${selectedProperty.id} (감정가: ₩${selectedProperty.price.toLocaleString()})` : (collateralInput || undefined),
            collateralStatus: (isMortgageMode && selectedProperty) || collateralInput ? 'proposed_by_user' : 'none',
            loanType: isMortgageMode ? 'mortgage' : 'general'
        };
        
        const newDb = { ...db };
        if (!newDb.pendingApplications) newDb.pendingApplications = {};
        newDb.pendingApplications[appId] = { id: appId, ...newApp };
        
        await saveDb(newDb);
        notify('한국은행', `${currentUser!.name}님의 ₩${valAmount.toLocaleString()} ${isMortgageMode ? '주택담보대출' : '대출'} 신청이 있습니다.`, true);
        showModal('대출 신청이 완료되었습니다. 관리자 승인을 기다려주세요.');
        setAmount('');
        setCollateralInput('');
        setSelectedProperty(null);
        setIsMortgageMode(false);
    };

    const handlePropertySelect = (p: RealEstateCell) => {
        setSelectedProperty(p);
        // Mortgage limit: 70% of property value
        const limit = Math.floor(p.price * 0.7);
        setAmount(limit.toString());
        showModal(`집 #${p.id} 선택됨. 최대 대출 가능액(LTV 70%): ₩${limit.toLocaleString()}`);
    };

    const handleRepay = async (loan: Loan) => {
        const repayAmount = Math.floor(loan.amount * (1 + loan.interestRate.rate / 100));
        if (currentUser!.balanceKRW < repayAmount) return showModal('상환할 잔액이 부족합니다.');

        const pin = await showPinModal(`간편번호를 입력하여 ₩${repayAmount.toLocaleString()}을 상환하세요.`, currentUser!.pin!);
        if (pin !== currentUser!.pin) return;
        
        const newDb = { ...db };
        const user = newDb.users[currentUser!.name];
        user.balanceKRW -= repayAmount;
        
        const loans = user.loans ? (Array.isArray(user.loans) ? [...user.loans] : Object.values(user.loans)) : [];
        const loanIndex = loans.findIndex(l => l.id === loan.id);
        if (loanIndex > -1) {
            loans[loanIndex].status = 'repaid';
            user.loans = loans;
        }

        user.transactions = [...(user.transactions || []), {
            id: Date.now(), type: 'loan', amount: -repayAmount, currency: 'KRW', description: '대출 상환', date: new Date().toISOString()
        }];

        newDb.users['한국은행'].balanceKRW += repayAmount;

        await saveDb(newDb);
        notify(currentUser!.name, '대출 상환이 완료되었습니다.');
        showModal('상환 완료!');
    };
    
    const openNegotiation = (loanItem: any) => {
        if (loanItem.appRef) {
            setNegotiatingApp(loanItem.appRef);
            setNegotiationInput(loanItem.appRef.collateral || '');
        }
    };

    const handleNegotiateSubmit = async (accept: boolean) => {
        if (!negotiatingApp) return;
        const newDb = { ...db };
        const app = newDb.pendingApplications[negotiatingApp.id];
        
        if (accept) {
            if (!app.collateral) return showModal("담보 내용이 없습니다.");
            app.collateralStatus = 'accepted';
            app.status = 'pending';
            notify('한국은행', `${currentUser!.name}님이 대출 담보 제안을 수락했습니다.`, true);
        } else {
            if (negotiationInput.trim() === '') {
                if(!await showConfirm("담보 협상을 거절하고 대출 신청을 취소하시겠습니까?")) return;
                delete newDb.pendingApplications[negotiatingApp.id];
                notify('한국은행', `${currentUser!.name}님이 대출 신청을 취소했습니다.`);
            } else {
                app.collateral = negotiationInput;
                app.collateralStatus = 'proposed_by_user';
                app.status = 'pending';
                notify('한국은행', `${currentUser!.name}님이 대출 담보 재협상을 요청했습니다: ${negotiationInput}`, true);
            }
        }
        
        await saveDb(newDb);
        setNegotiatingApp(null);
        showModal(accept ? "담보가 설정되었습니다. 최종 승인을 기다려주세요." : "협상 내용이 전송되었습니다.");
    };

    // Grouping
    const pendingList = loanList.filter(l => l.status === 'pending' || l.status === 'collateral_pending' || l.status === 'negotiating' as any);
    const activeList = loanList.filter(l => l.status === 'approved');
    const historyList = loanList.filter(l => l.status === 'repaid' || l.status === 'rejected');

    const renderLoanCard = (loan: any) => {
        const repayAmount = Math.floor(loan.amount * (1 + loan.interestRate.rate / 100));
        return (
            <div key={loan.id} className="p-4 rounded-2xl border bg-white dark:bg-gray-800 shadow-sm border-gray-100 dark:border-gray-700">
                <div className="flex justify-between items-center">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <span className="font-bold text-lg text-gray-800 dark:text-gray-200">₩ {loan.amount.toLocaleString()}</span>
                            {loan.type === 'mortgage' && <span className="text-[10px] bg-purple-100 text-purple-800 px-2 py-0.5 rounded">주택담보</span>}
                            {loan.status === 'pending' && <span className="text-[10px] bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded">승인 대기</span>}
                            {loan.status === 'collateral_pending' && <span className="text-[10px] bg-orange-100 text-orange-800 px-2 py-0.5 rounded">담보 협상중</span>}
                            {loan.status === 'approved' && <span className="text-[10px] bg-green-100 text-green-800 px-2 py-0.5 rounded">진행중</span>}
                            {loan.status === 'repaid' && <span className="text-[10px] bg-gray-200 text-gray-600 px-2 py-0.5 rounded">상환 완료</span>}
                        </div>
                        <p className="text-sm text-gray-500">신청일: {new Date(loan.applyDate).toLocaleDateString()}</p>
                        {loan.status === 'approved' && (
                            <p className="text-sm text-red-500 font-bold mt-1">상환 예정액: ₩ {repayAmount.toLocaleString()}</p>
                        )}
                        {loan.collateral && <p className="text-xs text-orange-600 mt-1">담보: {loan.collateral}</p>}
                    </div>
                    <div>
                        {loan.status === 'approved' && (
                            <Button onClick={() => handleRepay(loan)} className="text-xs px-3 py-2 bg-blue-600 hover:bg-blue-500">상환하기</Button>
                        )}
                        {loan.status === 'collateral_pending' && (
                            <Button onClick={() => openNegotiation(loan)} className="text-xs px-3 py-2 bg-orange-500 hover:bg-orange-400">협상 확인</Button>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="w-full space-y-6">
            <h3 className="text-2xl font-bold">대출</h3>
            
            <Card>
                 <div className="flex justify-between items-center mb-4">
                     <h4 className="text-lg font-bold">{isMortgageMode ? '주택담보대출 신청' : '일반 대출 신청'}</h4>
                     <Button 
                        onClick={() => { setIsMortgageMode(!isMortgageMode); setAmount(''); setCollateralInput(''); setSelectedProperty(null); }} 
                        className={`text-xs py-1 px-3 ${isMortgageMode ? 'bg-gray-500' : 'bg-purple-600'}`}
                     >
                        {isMortgageMode ? '일반 대출로 전환' : '주택담보대출 전환'}
                     </Button>
                 </div>

                 {isMortgageMode && (
                     <div className="mb-4">
                         <p className="text-sm font-bold mb-2">담보로 설정할 부동산 선택</p>
                         {myProperties.length === 0 ? <p className="text-sm text-gray-500">보유한 부동산이 없습니다.</p> : 
                         <div className="flex gap-2 overflow-x-auto pb-2">
                             {myProperties.map(p => (
                                 <button 
                                    key={p.id} 
                                    onClick={() => handlePropertySelect(p)}
                                    className={`p-2 border rounded min-w-[100px] text-sm ${selectedProperty?.id === p.id ? 'bg-purple-100 border-purple-500' : 'bg-gray-50'}`}
                                 >
                                     집 #{p.id}<br/>₩{p.price.toLocaleString()}
                                 </button>
                             ))}
                         </div>}
                     </div>
                 )}

                 <div className="flex gap-4 items-center">
                    <MoneyInput type="number" value={amount} onChange={e => setAmount(e.target.value)} className="flex-grow" placeholder="대출할 금액 (₩)" />
                    <Button onClick={handleApply} className="whitespace-nowrap h-auto py-3">신청</Button>
                </div>
                {!isMortgageMode && (
                    <div className="mt-4">
                        <label className="text-sm font-bold mb-1 block text-gray-600 dark:text-gray-400">담보 (선택)</label>
                        <Input placeholder="예: 보석, 자동차 등" value={collateralInput} onChange={e => setCollateralInput(e.target.value)} />
                        <p className="text-xs text-gray-400 mt-1">담보를 입력하면 승인 확률이 높아집니다.</p>
                    </div>
                )}
                 <p className="text-xs text-gray-500 text-center mt-4">
                    기본 이자율: {db.settings.loanInterestRate.periodWeeks}주당 {db.settings.loanInterestRate.rate}%
                </p>
            </Card>

            <div>
                <h4 className="text-lg font-bold mb-2">나의 대출 현황</h4>
                <div className="space-y-4 max-h-[600px] overflow-y-auto pr-1">
                    {pendingList.length > 0 && (
                        <div>
                             <h5 className="text-sm font-bold text-yellow-600 mb-2 px-1">신청 / 대기중</h5>
                             <div className="space-y-2">{pendingList.map(l => renderLoanCard(l))}</div>
                        </div>
                    )}
                    {activeList.length > 0 && (
                        <div>
                             <h5 className="text-sm font-bold text-green-600 mb-2 px-1">진행중</h5>
                             <div className="space-y-2">{activeList.map(l => renderLoanCard(l))}</div>
                        </div>
                    )}
                    {historyList.length > 0 && (
                        <div>
                             <h5 className="text-sm font-bold text-gray-500 mb-2 px-1">종료 / 내역</h5>
                             <div className="space-y-2 opacity-70">{historyList.map(l => renderLoanCard(l))}</div>
                        </div>
                    )}
                    {loanList.length === 0 && (
                        <div className="text-center text-gray-500 py-10 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg">
                            대출 내역이 없습니다.
                        </div> 
                    )}
                </div>
            </div>

            <Modal isOpen={!!negotiatingApp} onClose={() => setNegotiatingApp(null)} title="담보 협상">
                <div className="space-y-4">
                    <div className="bg-gray-100 dark:bg-gray-700 p-4 rounded-2xl">
                        <p className="text-xs text-gray-500 mb-1 font-bold">한국은행 제안</p>
                        <p className="font-bold text-lg">{negotiatingApp?.collateral || "(내용 없음)"}</p>
                    </div>
                    
                    <div>
                        <label className="text-sm font-bold mb-2 block">재협상 내용 입력 (거절 시 입력)</label>
                        <Input value={negotiationInput} onChange={e => setNegotiationInput(e.target.value)} placeholder="빈 칸으로 거절 시 신청이 취소됩니다." />
                    </div>

                    <div className="flex gap-2 pt-2">
                         <Button onClick={() => handleNegotiateSubmit(true)} className="flex-1 bg-green-600">수락 및 진행</Button>
                         <Button onClick={() => handleNegotiateSubmit(false)} className="flex-1 bg-red-600">거절 (취소/재협상)</Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};