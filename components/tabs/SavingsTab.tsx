import React, { useState, useMemo } from 'react';
import { useGame } from '../../context/GameContext';
import { Card, Button, Input, MoneyInput } from '../Shared';
import { generateId } from '../../services/firebase';
import { TermDeposit, Application } from '../../types';

export const SavingsTab: React.FC = () => {
    const { currentUser, db, saveDb, notify, showModal, showConfirm } = useGame();
    const [activeType, setActiveType] = useState<'regular' | 'term' | 'installment'>('regular');
    const [amount, setAmount] = useState('');
    const [period, setPeriod] = useState('4');

    const depositList = useMemo(() => {
        // Use db.pendingApplications directly to get real-time pending items
        const pendingApps = (Object.values(db.pendingApplications || {}) as Application[])
            .filter(a => a.type === 'savings' && a.applicantName === currentUser?.name);

        const pendingDeposits = pendingApps.map(a => ({
            id: a.id,
            owner: a.applicantName,
            amount: a.amount,
            startDate: a.requestedDate,
            endDate: '', 
            interestRate: db.settings.savingsInterest.rate,
            status: 'pending' as const,
            type: a.savingsType || 'regular'
        }));

        const myDeposits = (Object.values(db.termDeposits || {}) as TermDeposit[])
            .filter(d => d.owner === currentUser?.name)
            .map(d => ({ 
                ...d, 
                type: d.type || 'regular',
                status: (d.status === 'active' ? 'active' : 'history') as any
            }));
        
        return [...pendingDeposits, ...myDeposits].sort((a,b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
    }, [db.termDeposits, db.pendingApplications, currentUser?.name, db.settings.savingsInterest.rate]);
    
    const handleApply = async () => {
        if (db.settings.isFrozen) return showModal('거래 중지 상태입니다.');
        
        const valAmount = parseInt(amount);
        const valPeriod = parseInt(period);
        if (isNaN(valAmount) || valAmount <= 0) return showModal('올바른 금액을 입력하세요.');
        if (currentUser!.balanceKRW < valAmount && activeType !== 'installment') return showModal('잔액이 부족합니다.');

        const appId = generateId();
        const newApp: Omit<Application, 'id'> = {
            type: 'savings',
            savingsType: activeType,
            savingsPeriod: valPeriod,
            applicantName: currentUser!.name,
            amount: valAmount,
            requestedDate: new Date().toISOString(),
            status: 'pending'
        };

        const newDb = { ...db };
        if (!newDb.pendingApplications) newDb.pendingApplications = {};
        newDb.pendingApplications[appId] = { id: appId, ...newApp };
        
        await saveDb(newDb);
        const typeName = activeType === 'regular' ? '보통예금' : (activeType === 'term' ? '정기예금' : '정기적금');
        notify('한국은행', `${currentUser!.name}님의 ${typeName} 신청이 있습니다.`, true);
        showModal('신청이 완료되었습니다. 관리자 승인을 기다려주세요.');
        setAmount('');
    };
    
    const handleWithdraw = async (deposit: any) => {
        const confirmed = await showConfirm(`예금을 중도해지하시겠습니까? 이자를 받을 수 없습니다. (원금: ₩${deposit.amount.toLocaleString()})`);
        if (!confirmed) return;
        
        const newDb = { ...db };
        const user = newDb.users[currentUser!.name];
        
        const deposits = { ...newDb.termDeposits };
        if (deposits[deposit.id]) {
            deposits[deposit.id].status = 'withdrawn';
            newDb.termDeposits = deposits;
        }

        user.balanceKRW += deposit.amount;
        user.transactions = [...(user.transactions || []), {
            id: Date.now(), type: 'savings', amount: deposit.amount, currency: 'KRW', description: '예금 중도해지', date: new Date().toISOString()
        }];

        await saveDb(newDb);
        notify(currentUser!.name, `예금이 해지되어 원금 ₩${deposit.amount.toLocaleString()}가 입금되었습니다.`);
        showModal('예금 해지가 완료되었습니다.');
    };

    const renderDepositCard = (d: any, isHistory = false) => (
        <div key={d.id} className={`p-4 rounded-2xl border ${isHistory ? 'bg-gray-50 border-gray-100 opacity-70' : 'bg-white border-gray-100'} shadow-sm dark:bg-gray-800 dark:border-gray-700`}>
            <div className="flex justify-between items-center">
                <div>
                    <p className="text-xs text-gray-500 font-bold uppercase mb-1">
                        {d.type === 'regular' ? '보통예금' : (d.type === 'term' ? '정기예금' : '정기적금')}
                    </p>
                    <p className="font-bold text-lg mb-1">₩ {d.amount.toLocaleString()}</p>
                    <p className="text-sm text-gray-500">
                        {d.status === 'pending' ? `신청일: ${new Date(d.startDate).toLocaleDateString()}` : `만기: ${new Date(d.endDate).toLocaleDateString()}`}
                    </p>
                    {d.status !== 'pending' && <p className="text-xs text-blue-500 mt-1">이자율: {d.interestRate ? d.interestRate.toFixed(2) : 0}%</p>}
                </div>
                <div className="text-right flex flex-col items-end gap-2">
                    <span className={`px-2 py-1 text-xs rounded font-bold ${
                        d.status === 'active' ? 'bg-green-100 text-green-800' : 
                        d.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                        d.status === 'matured' ? 'bg-blue-100 text-blue-800' : 'bg-gray-200 text-gray-600'
                    }`}>
                        {{
                            'active': '진행중',
                            'pending': '승인 대기',
                            'matured': '만기',
                            'withdrawn': '해지됨',
                            'history': '종료'
                        }[d.status]}
                    </span>
                    {d.status === 'active' && <Button variant="danger" className="text-xs py-1 px-3" onClick={() => handleWithdraw(d)}>중도해지</Button>}
                </div>
            </div>
        </div>
    );

    return (
        <div className="w-full space-y-6">
            <h3 className="text-2xl font-bold">저축</h3>
            
            <Card>
                 <div className="flex gap-2 mb-4 border-b border-gray-200 dark:border-gray-700 pb-1">
                     <button onClick={() => setActiveType('regular')} className={`flex-1 py-2 text-sm font-bold border-b-2 transition-colors ${activeType === 'regular' ? 'border-green-500 text-green-600' : 'border-transparent text-gray-400'}`}>보통예금</button>
                     <button onClick={() => setActiveType('term')} className={`flex-1 py-2 text-sm font-bold border-b-2 transition-colors ${activeType === 'term' ? 'border-green-500 text-green-600' : 'border-transparent text-gray-400'}`}>정기예금</button>
                     <button onClick={() => setActiveType('installment')} className={`flex-1 py-2 text-sm font-bold border-b-2 transition-colors ${activeType === 'installment' ? 'border-green-500 text-green-600' : 'border-transparent text-gray-400'}`}>정기적금</button>
                 </div>

                 <div className="mb-4 text-xs text-gray-500 bg-gray-50 dark:bg-gray-800 p-3 rounded">
                     {activeType === 'regular' && "입출금이 자유로우며 이자가 낮은 기본적인 예금입니다."}
                     {activeType === 'term' && "목돈을 일정 기간 예치하여 높은 이자를 받는 예금입니다."}
                     {activeType === 'installment' && "매달 일정 금액을 납입하여 목돈을 만드는 적금입니다. (현재 일시납 형태로 시뮬레이션)"}
                 </div>

                 <h4 className="text-lg font-bold mb-4">신청하기</h4>
                 <div className="space-y-3">
                    <MoneyInput type="number" value={amount} onChange={e => setAmount(e.target.value)} className="flex-grow" placeholder="금액 (₩)" />
                    {(activeType === 'term' || activeType === 'installment') && (
                        <div>
                            <label className="text-xs font-bold block mb-1">기간 (주)</label>
                            <Input type="number" value={period} onChange={e => setPeriod(e.target.value)} placeholder="기간 (주)" />
                        </div>
                    )}
                    <Button onClick={handleApply} className="w-full py-3">신청</Button>
                </div>
                 <p className="text-xs text-gray-500 text-center mt-2">
                    현재 기본 이자율: {db.settings.savingsInterest.periodWeeks}주당 {db.settings.savingsInterest.rate}%
                </p>
            </Card>

            <div>
                <h4 className="text-lg font-bold mb-2">나의 저축 현황</h4>
                <div className="space-y-4 max-h-[600px] overflow-y-auto pr-1">
                    {depositList.map(d => renderDepositCard(d, d.status !== 'pending' && d.status !== 'active'))}
                    {depositList.length === 0 && (
                        <div className="text-center text-gray-500 py-10 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg">
                            가입한 상품이 없습니다.
                        </div> 
                    )}
                </div>
            </div>
        </div>
    );
};