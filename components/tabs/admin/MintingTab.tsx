
import React, { useState } from 'react';
import { useGame } from '../../../context/GameContext';
import { Button, Input } from '../../Shared';

export const MintingTab: React.FC = () => {
    const { currentUser, showModal, serverAction, refreshData } = useGame();
    const [amount, setAmount] = useState('');
    const [currency, setCurrency] = useState<'KRW'|'USD'>('KRW');

    const handleMint = async () => {
        const valAmount = parseFloat(amount);
        if (isNaN(valAmount) || valAmount <= 0) {
            showModal("올바른 금액을 입력하세요.");
            return;
        }

        try {
            await serverAction('mint_currency', {
                amount: valAmount,
                currency
            });
            await refreshData(); // Refresh to show new balance
            showModal(`${valAmount.toLocaleString()} ${currency} 발권이 완료되었습니다.`);
            setAmount('');
        } catch(e) {
            showModal("발권 실패: 서버 오류");
        }
    };

    return (
        <div className="space-y-6">
            <h3 className="text-xl font-black mb-4">화폐 발권 (한국은행 직권)</h3>
            
            <div className="p-6 bg-[#252525] rounded-2xl border border-blue-500/30">
                <p className="text-sm text-gray-400 mb-6 leading-relaxed">
                    한국은행의 권한으로 화폐를 신규 발행하여 은행 잔고에 추가합니다.
                </p>
                
                <div className="space-y-4 mb-6">
                    <Input 
                        type="number" 
                        value={amount} 
                        onChange={e => setAmount(e.target.value)} 
                        placeholder="발행할 금액" 
                        className="p-5 text-lg bg-[#121212] border-none text-white font-bold" 
                    />
                    <select 
                        value={currency} 
                        onChange={e => setCurrency(e.target.value as any)} 
                        className="w-full p-5 rounded-[18px] bg-[#121212] text-lg border-none text-white font-bold appearance-none cursor-pointer"
                    >
                        <option value="KRW">원화 (KRW)</option>
                        <option value="USD">달러 (USD)</option>
                    </select>
                </div>
                
                <Button onClick={handleMint} className="w-full py-5 text-lg bg-blue-600 hover:bg-blue-500 rounded-[18px] font-black shadow-lg">
                    즉시 발권
                </Button>
            </div>
        </div>
    );
};
