
import React, { useState, useMemo } from 'react';
import { useGame } from '../../context/GameContext';
import { Card, Button, Input, MoneyInput, Modal } from '../Shared';
import { Loan, RealEstateCell, Application } from '../../types';

export const LoanTab: React.FC = () => {
    const { currentUser, db, showModal, createChat, sendMessage, openChat, submitApplication } = useGame();
    const [amount, setAmount] = useState('');
    const [selectedProperty, setSelectedProperty] = useState<RealEstateCell | null>(null);
    const [showPropModal, setShowPropModal] = useState(false);

    const myApplications = useMemo(() => {
        return (Object.values(db.pendingApplications || {}) as Application[])
            .filter(a => a.applicantName === currentUser?.name && a.type === 'loan');
    }, [db.pendingApplications, currentUser]);

    const interestRate = db.settings.loanInterestRate?.rate || 5;
    const loanPeriod = db.settings.loanInterestRate?.periodWeeks || 4;

    const handleApply = async () => {
        const valAmount = parseInt(amount);
        if (isNaN(valAmount) || valAmount <= 0) return showModal('금액을 입력하세요.');

        const chatId = await createChat(['한국은행'], 'private');
        const collateralText = selectedProperty ? `집 #${selectedProperty.id} (₩${selectedProperty.price.toLocaleString()})` : "신용 대출 (담보 없음)";

        const app: Application = {
            id: `loan_req_${Date.now()}`,
            type: 'loan',
            applicantName: currentUser!.name,
            amount: valAmount,
            requestedDate: new Date().toISOString(),
            status: 'pending',
            collateral: selectedProperty ? `prop_${selectedProperty.id}` : null,
            collateralStatus: selectedProperty ? 'proposed_by_user' : undefined
        };

        await sendMessage(chatId, `[대출 신청]\n신청자: ${currentUser?.name}\n금액: ₩${valAmount.toLocaleString()}\n담보: ${collateralText}`, {
            type: 'application',
            value: '대출 신청',
            data: { ...app, appType: 'loan', isThreadRoot: true }
        });

        await submitApplication(app);

        openChat(chatId);
        showModal("한국은행에 대출 신청을 보냈습니다. 채팅방으로 이동합니다.");
        setAmount('');
        setSelectedProperty(null);
    };

    return (
        <div className="space-y-6">
            <h3 className="text-2xl font-bold">대출 상품</h3>
            
            <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-xl text-center border border-red-200 dark:border-red-800">
                <p className="text-sm text-gray-500 font-bold uppercase mb-1">현재 적용 금리</p>
                <p className="text-2xl font-bold text-red-600 dark:text-red-400">연 {interestRate}% / {loanPeriod}주</p>
            </div>

            <Card>
                <div className="flex justify-between items-center mb-4">
                    <h4 className="font-bold text-xl">대출 신청</h4>
                </div>
                <div className="space-y-4">
                    <MoneyInput 
                        value={amount} 
                        onChange={e => setAmount(e.target.value)} 
                        placeholder="대출 요청 금액 (₩)" 
                        className="text-right text-xl font-bold p-3"
                    />
                    
                    <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                        <label className="text-sm font-bold block mb-2">담보 설정 (선택)</label>
                        {selectedProperty ? (
                            <div className="flex justify-between items-center bg-white dark:bg-[#1E1E1E] p-2 rounded border">
                                <span className="text-sm font-bold">집 #{selectedProperty.id} (₩{selectedProperty.price.toLocaleString()})</span>
                                <button onClick={() => setSelectedProperty(null)} className="text-red-500 text-xs">해제</button>
                            </div>
                        ) : (
                            <Button variant="secondary" onClick={() => setShowPropModal(true)} className="w-full text-xs py-2">
                                보유 부동산 선택하기
                            </Button>
                        )}
                        <p className="text-xs text-gray-400 mt-2">* 담보 설정 시 승인 확률과 한도가 높아집니다.</p>
                    </div>

                    <Button onClick={handleApply} className="w-full py-4 text-lg bg-red-600 hover:bg-red-500">신청서 제출</Button>
                    <p className="text-center text-xs text-gray-400">신청 시 한국은행 관리자와 1:1 채팅이 시작됩니다.</p>
                </div>
            </Card>

            {myApplications.length > 0 && (
                <div className="mt-8">
                    <h4 className="font-bold text-lg mb-3">나의 신청 현황</h4>
                    <div className="space-y-3">
                        {myApplications.map(app => (
                            <div key={app.id} className="bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-100 shadow-sm flex justify-between items-center">
                                <div>
                                    <p className="font-bold text-lg">₩ {app.amount.toLocaleString()}</p>
                                    <p className="text-xs text-gray-500 mt-1 uppercase font-bold">{app.status === 'pending' ? '심사 중' : app.status}</p>
                                </div>
                                <span className={`px-3 py-1 rounded-full text-xs font-bold ${app.status === 'pending' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}`}>
                                    {app.status}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <Modal isOpen={showPropModal} onClose={() => setShowPropModal(false)} title="담보 부동산 선택">
                <div className="space-y-2">
                    {(db.realEstate.grid || []).filter(p => p.owner === currentUser?.name).map(p => (
                        <div 
                            key={p.id} 
                            onClick={() => { setSelectedProperty(p); setShowPropModal(false); }}
                            className="p-3 border rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 flex justify-between"
                        >
                            <span>집 #{p.id}</span>
                            <span className="font-bold">₩{p.price.toLocaleString()}</span>
                        </div>
                    ))}
                    {(db.realEstate.grid || []).filter(p => p.owner === currentUser?.name).length === 0 && <p className="text-center text-gray-500">보유한 부동산이 없습니다.</p>}
                </div>
            </Modal>
        </div>
    );
};
