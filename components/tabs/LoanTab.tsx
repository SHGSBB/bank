
import React, { useState, useMemo } from 'react';
import { useGame } from '../../context/GameContext';
import { Card, Button, Input, MoneyInput, Modal } from '../Shared';
import { Loan, RealEstateCell, Application } from '../../types';

export const LoanTab: React.FC = () => {
    const { currentUser, db, showModal, createChat, sendMessage } = useGame();
    const [amount, setAmount] = useState('');
    const [selectedProperty, setSelectedProperty] = useState<RealEstateCell | null>(null);
    const [showPropModal, setShowPropModal] = useState(false);

    const myApplications = useMemo(() => {
        return (Object.values(db.pendingApplications || {}) as Application[])
            .filter(a => a.applicantName === currentUser?.name && a.type === 'loan');
    }, [db.pendingApplications, currentUser]);

    const handleApply = async () => {
        const valAmount = parseInt(amount);
        if (isNaN(valAmount) || valAmount <= 0) return showModal('금액을 입력하세요.');

        const chatId = await createChat(['한국은행'], 'private');
        const collateralText = selectedProperty ? `집 #${selectedProperty.id} (₩${selectedProperty.price.toLocaleString()})` : "신용 대출 (담보 없음)";

        await sendMessage(chatId, `[대출 신청]\n신청자: ${currentUser?.name}\n금액: ₩${valAmount.toLocaleString()}\n담보: ${collateralText}`, {
            type: 'application',
            value: '대출 신청',
            data: {
                appType: 'loan',
                amount: valAmount,
                collateral: selectedProperty ? `prop_${selectedProperty.id}` : null,
                id: `loan_req_${Date.now()}`,
                isThreadRoot: true 
            }
        });

        showModal("한국은행에 대출 신청을 보냈습니다. 메시지 탭의 스레드 대화에서 심사 과정을 확인하세요.");
        setAmount('');
        setSelectedProperty(null);
    };

    return (
        <div className="space-y-6">
            <h3 className="text-2xl font-bold">대출 서비스</h3>
            
            <Card className="bg-black text-white p-8 rounded-[35px] border-none shadow-xl">
                <div className="space-y-6">
                    <div>
                        <label className="text-[10px] font-black text-gray-500 mb-2 block uppercase tracking-widest">Amount to Borrow</label>
                        <MoneyInput value={amount} onChange={e => setAmount(e.target.value)} placeholder="₩ 0" className="bg-transparent text-4xl font-black border-none p-0 focus:ring-0 placeholder-gray-800" />
                    </div>
                    <Button onClick={handleApply} className="w-full py-5 bg-green-500 text-black text-lg font-black rounded-2xl hover:bg-green-400 active:scale-95 transition-all">신청서 제출</Button>
                </div>
            </Card>

            {myApplications.length > 0 && (
                <div className="space-y-4">
                    <h4 className="font-bold text-sm text-gray-400 px-1 uppercase tracking-wider">나의 신청 현황</h4>
                    {myApplications.map(app => (
                        <div key={app.id} className="p-5 bg-white dark:bg-[#1E1E1E] rounded-3xl border dark:border-gray-800 flex justify-between items-center shadow-sm">
                            <div>
                                <p className="font-black text-lg">₩ {app.amount.toLocaleString()}</p>
                                <p className="text-[10px] text-gray-400 mt-1 uppercase font-bold">{app.status === 'pending' ? 'Reviewing' : app.status}</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase ${app.status === 'pending' ? 'bg-yellow-100 text-yellow-700' : (app.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700')}`}>
                                    {app.status === 'pending' ? '심사 중' : (app.status === 'approved' ? '승인됨' : '거절됨')}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
