
import React, { useState, useMemo } from 'react';
import { useGame } from '../../context/GameContext';
import { Card, Button, Input, MoneyInput } from '../Shared';
import { TermDeposit } from '../../types';

export const SavingsTab: React.FC = () => {
    const { currentUser, db, showModal, createChat, sendMessage } = useGame();
    const [activeType, setActiveType] = useState<'regular' | 'term' | 'installment'>('regular');
    const [amount, setAmount] = useState('');
    const [duration, setDuration] = useState('');

    const interestSettings = db.settings.savingsInterest;
    
    // Safety check for old DB structure
    const getRateInfo = (type: 'regular' | 'term' | 'installment') => {
        if (!interestSettings) return { rate: 0, periodWeeks: 0 };
        // Handle migration case where interestSettings might be the old format
        // @ts-ignore
        if (typeof interestSettings.rate === 'number') {
             // @ts-ignore
             return { rate: interestSettings.rate, periodWeeks: interestSettings.periodWeeks };
        }
        return interestSettings[type] || { rate: 0, periodWeeks: 0 };
    };

    const currentRate = getRateInfo(activeType);
    const maxWeeks = currentRate.periodWeeks || 52; // Default max 52 weeks if not set

    const savingsTypes = {
        regular: { label: '보통예금', desc: '자유롭게 입출금이 가능한 기본 통장입니다.' },
        term: { label: '정기예금', desc: '목돈을 일정 기간 예치하여 이자를 받습니다.' },
        installment: { label: '정기적금', desc: '매월 일정 금액을 납입하여 목돈을 만듭니다.' }
    };

    const interestDisplay = activeType === 'regular' 
        ? `연 ${currentRate.rate}% (수시입출금)` 
        : `최대 ${maxWeeks}주 / 연 ${currentRate.rate}%`;

    const myDeposits = (Object.values(db.termDeposits || {}) as TermDeposit[])
        .filter(d => d.owner === currentUser?.name && d.status === 'active');

    const handleApply = async () => {
        const valAmount = parseInt(amount);
        const valDuration = parseInt(duration) || 0;

        if (isNaN(valAmount) || valAmount <= 0) return showModal('금액을 입력하세요.');
        if (activeType !== 'regular') {
            if (isNaN(valDuration) || valDuration <= 0) return showModal('기간을 입력하세요.');
            if (valDuration > maxWeeks) return showModal(`최대 가입 기간은 ${maxWeeks}주 입니다.`);
        }
        
        if (currentUser!.balanceKRW < valAmount && activeType !== 'installment') return showModal('잔액이 부족합니다.');

        const chatId = await createChat(['한국은행'], 'private');
        
        const durationText = activeType === 'regular' ? '기간 없음' : `${valDuration}주`;

        await sendMessage(chatId, `[${savingsTypes[activeType].label}] 신청\n금액: ₩${valAmount.toLocaleString()}\n기간: ${durationText}`, {
            type: 'application',
            value: `${savingsTypes[activeType].label} 신청`,
            data: {
                appType: 'savings',
                savingsType: activeType,
                amount: valAmount,
                durationWeeks: valDuration,
                id: `sav_req_${Date.now()}` 
            }
        });

        showModal("한국은행에 가입 신청 메시지를 보냈습니다. 채팅방을 확인하세요.");
        setAmount('');
        setDuration('');
    };

    return (
        <div className="space-y-6">
            <h3 className="text-2xl font-bold">저금 상품</h3>
            
            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl text-center border border-blue-200 dark:border-blue-800">
                <p className="text-sm text-gray-500 font-bold uppercase mb-1">현재 적용 금리 ({savingsTypes[activeType].label})</p>
                <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{interestDisplay}</p>
            </div>

            <div className="flex gap-2 overflow-x-auto pb-2">
                {(Object.keys(savingsTypes) as Array<keyof typeof savingsTypes>).map(type => (
                    <button 
                        key={type} 
                        onClick={() => setActiveType(type)}
                        className={`flex-1 min-w-[100px] p-4 rounded-2xl border-2 text-left transition-all ${activeType === type ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : 'border-gray-200 dark:border-gray-700'}`}
                    >
                        <div className="font-bold text-lg mb-1">{savingsTypes[type].label}</div>
                        <div className="text-xs text-gray-500">{savingsTypes[type].desc}</div>
                    </button>
                ))}
            </div>

            <Card>
                <div className="flex justify-between items-center mb-4">
                    <h4 className="font-bold text-xl">{savingsTypes[activeType].label} 신청</h4>
                </div>
                <div className="space-y-4">
                    <MoneyInput 
                        value={amount} 
                        onChange={e => setAmount(e.target.value)} 
                        placeholder={activeType === 'installment' ? "월 납입 금액 (₩)" : "예치 금액 (₩)"}
                        className="text-right text-xl font-bold p-3"
                    />
                    
                    {activeType !== 'regular' && (
                        <div>
                            <label className="text-sm font-bold block mb-1">가입 기간 (주)</label>
                            <Input 
                                type="number"
                                value={duration}
                                onChange={e => setDuration(e.target.value)}
                                placeholder={`최대 ${maxWeeks}주`}
                                className="w-full text-right"
                            />
                        </div>
                    )}

                    <Button onClick={handleApply} className="w-full py-4 text-lg">채팅으로 신청하기</Button>
                    <p className="text-center text-xs text-gray-400">신청 시 한국은행 관리자와 1:1 채팅이 시작됩니다.</p>
                </div>
            </Card>

            <div className="mt-8">
                <h4 className="font-bold text-lg mb-3">내 저금 현황</h4>
                {myDeposits.length === 0 ? <p className="text-gray-500 text-center py-6">가입된 상품이 없습니다.</p> : 
                    <div className="space-y-3">
                        {myDeposits.map(d => (
                            <div key={d.id} className="bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-100 shadow-sm flex justify-between items-center">
                                <div>
                                    <p className="font-bold">{d.type === 'regular' ? '보통예금' : (d.type === 'term' ? '정기예금' : '정기적금')}</p>
                                    <p className="text-xs text-gray-500">{new Date(d.startDate).toLocaleDateString()} 가입</p>
                                </div>
                                <div className="text-right">
                                    <p className="font-bold text-lg text-blue-600">₩{d.amount.toLocaleString()}</p>
                                    <p className="text-xs text-green-600">이자 {d.interestRate}%</p>
                                </div>
                            </div>
                        ))}
                    </div>
                }
            </div>
        </div>
    );
};
