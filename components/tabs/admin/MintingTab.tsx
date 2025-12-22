
import React, { useState, useMemo } from 'react';
import { useGame } from '../../../context/GameContext';
import { Button, Input } from '../../Shared';
import { User } from '../../../types';

export const MintingTab: React.FC = () => {
    const { currentUser, db, showModal, serverAction, refreshData } = useGame();
    const [amount, setAmount] = useState('');
    const [currency, setCurrency] = useState<'KRW'|'USD'>('KRW');

    // Display Logic: Show Current User's balance (Assuming Current User IS the Admin)
    const bankBalanceKRW = currentUser?.balanceKRW || 0;
    const bankBalanceUSD = currentUser?.balanceUSD || 0;

    const handleMint = async () => {
        const valAmount = parseFloat(amount);
        if (isNaN(valAmount) || valAmount <= 0) {
            showModal("올바른 금액을 입력하세요.");
            return;
        }

        try {
            await serverAction('mint_currency', {
                amount: valAmount,
                currency,
                // Send ID if available, otherwise email. API will handle lookup.
                userId: currentUser?.id || currentUser?.email 
            });
            await refreshData(); 
            showModal(`${valAmount.toLocaleString()} ${currency} 발권이 완료되었습니다.`);
            setAmount('');
        } catch(e) {
            showModal("발권 실패: 서버 오류");
        }
    };

    return (
        <div className="space-y-6">
            <h3 className="text-xl font-black mb-4">화폐 발권 (한국은행 직권)</h3>
            
            <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="p-4 bg-blue-900/20 border border-blue-500/30 rounded-2xl text-center">
                    <p className="text-xs text-blue-400 font-bold uppercase mb-1">현재 내(한국은행) 잔고 (KRW)</p>
                    <p className="text-2xl font-black text-white">₩ {bankBalanceKRW.toLocaleString()}</p>
                </div>
                <div className="p-4 bg-green-900/20 border border-green-500/30 rounded-2xl text-center">
                    <p className="text-xs text-green-400 font-bold uppercase mb-1">현재 내(한국은행) 잔고 (USD)</p>
                    <p className="text-2xl font-black text-white">$ {bankBalanceUSD.toLocaleString()}</p>
                </div>
            </div>

            <div className="p-6 bg-[#252525] rounded-2xl border border-blue-500/30">
                <p className="text-sm text-gray-400 mb-6 leading-relaxed">
                    한국은행(관리자)의 권한으로 화폐를 신규 발행하여 <b>현재 접속 중인 관리자 계정</b>의 잔고에 추가합니다.
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
