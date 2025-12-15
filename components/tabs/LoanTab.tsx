
import React, { useState, useMemo } from 'react';
import { useGame } from '../../context/GameContext';
import { Card, Button, Input, MoneyInput, Modal } from '../Shared';
import { Loan, RealEstateCell } from '../../types';

export const LoanTab: React.FC = () => {
    const { currentUser, db, showModal, createChat, sendMessage } = useGame();
    const [amount, setAmount] = useState('');
    const [selectedProperty, setSelectedProperty] = useState<RealEstateCell | null>(null);
    const [showPropModal, setShowPropModal] = useState(false);

    const interestSettings = db.settings.loanInterestRate;
    const interestDisplay = `${interestSettings.periodWeeks}주에 ${interestSettings.rate}%`;

    const myProperties = useMemo(() => (db.realEstate.grid || []).filter(p => p.owner === currentUser?.name), [db.realEstate.grid, currentUser]);
    const myLoans = currentUser?.loans ? (Array.isArray(currentUser.loans) ? currentUser.loans : Object.values(currentUser.loans)) : [];

    const handleApply = async () => {
        const valAmount = parseInt(amount);
        if (isNaN(valAmount) || valAmount <= 0) return showModal('금액을 입력하세요.');

        const chatId = await createChat(['한국은행'], 'private');
        
        const collateralText = selectedProperty ? `집 #${selectedProperty.id} (₩${selectedProperty.price.toLocaleString()})` : "신용 대출 (담보 없음)";

        await sendMessage(chatId, `[대출 신청]\n금액: ₩${valAmount.toLocaleString()}\n담보: ${collateralText}`, {
            type: 'application',
            value: '대출 신청',
            data: {
                appType: 'loan',
                amount: valAmount,
                collateral: selectedProperty ? `prop_${selectedProperty.id}` : null,
                id: `loan_req_${Date.now()}`
            }
        });

        showModal("한국은행에 대출 신청 메시지를 보냈습니다. 채팅방에서 협상을 진행하세요.");
        setAmount('');
        setSelectedProperty(null);
    };

    return (
        <div className="space-y-6">
            <h3 className="text-2xl font-bold">대출 신청</h3>
            
            <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-xl text-center border border-yellow-200 dark:border-yellow-800">
                <p className="text-sm text-gray-500 font-bold uppercase mb-1">현재 대출 금리</p>
                <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{interestDisplay}</p>
            </div>

            <Card>
                <div className="space-y-4">
                    <div>
                        <label className="text-sm font-bold block mb-2">필요 금액</label>
                        <MoneyInput 
                            value={amount} 
                            onChange={e => setAmount(e.target.value)} 
                            placeholder="대출 금액 (₩)" 
                            className="text-right text-xl font-bold p-3"
                        />
                    </div>

                    <div>
                        <label className="text-sm font-bold block mb-2">담보 설정 (선택)</label>
                        <button 
                            onClick={() => setShowPropModal(true)}
                            className={`w-full p-4 rounded-xl border-2 border-dashed text-left transition-colors ${selectedProperty ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-300 hover:border-gray-400'}`}
                        >
                            {selectedProperty ? (
                                <div>
                                    <p className="font-bold text-blue-600">🏠 집 #{selectedProperty.id}</p>
                                    <p className="text-xs text-gray-500">감정가: ₩{selectedProperty.price.toLocaleString()}</p>
                                </div>
                            ) : (
                                <span className="text-gray-400">+ 소유 부동산 선택하기</span>
                            )}
                        </button>
                    </div>

                    <Button onClick={handleApply} className="w-full py-4 text-lg bg-purple-600 hover:bg-purple-500">채팅으로 신청하기</Button>
                </div>
            </Card>

            <div className="mt-8">
                <h4 className="font-bold text-lg mb-3">내 대출 현황</h4>
                {myLoans.length === 0 ? <p className="text-gray-500 text-center py-6">진행 중인 대출이 없습니다.</p> : 
                    <div className="space-y-3">
                        {myLoans.map((l: Loan) => (
                            <div key={l.id} className="bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-100 shadow-sm">
                                <div className="flex justify-between items-center mb-2">
                                    <span className="font-bold text-lg">₩{l.amount.toLocaleString()}</span>
                                    <span className={`text-xs px-2 py-1 rounded ${l.status==='approved' ? 'bg-green-100 text-green-700' : 'bg-gray-200'}`}>{l.status}</span>
                                </div>
                                <p className="text-xs text-gray-500">상환 예정일: {l.repaymentDate ? new Date(l.repaymentDate).toLocaleDateString() : '-'}</p>
                            </div>
                        ))}
                    </div>
                }
            </div>

            <Modal isOpen={showPropModal} onClose={() => setShowPropModal(false)} title="담보물 선택">
                <div className="space-y-2 max-h-60 overflow-y-auto">
                    {myProperties.map(p => (
                        <div key={p.id} onClick={() => { setSelectedProperty(p); setShowPropModal(false); }} className="p-3 border rounded cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700">
                            <span className="font-bold">집 #{p.id}</span> (₩{p.price.toLocaleString()})
                        </div>
                    ))}
                    {myProperties.length === 0 && <p className="text-center text-gray-500 py-4">소유한 부동산이 없습니다.</p>}
                </div>
            </Modal>
        </div>
    );
};
