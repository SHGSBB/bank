import React, { useState } from 'react';
import { useGame } from '../../../context/GameContext';
import { Card, Button, Input } from '../../Shared';

export const MintingTab: React.FC = () => {
    const { currentUser, showModal, serverAction } = useGame();
    const [amount, setAmount] = useState('');
    const [currency, setCurrency] = useState<'KRW'|'USD'>('KRW');

    // Only Admin (Bank of Korea) can access
    if (currentUser?.type !== 'admin') return null;

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
            showModal(`${valAmount.toLocaleString()} ${currency} 발권이 완료되었습니다.`);
            setAmount('');
        } catch(e) {
            showModal("발권 실패: 서버 오류");
        }
    };

    return (
        <Card>
            <h3 className="text-2xl font-bold mb-6">화폐 발권 (한국은행 직권)</h3>
            <div className="space-y-4 p-4 border rounded-lg bg-gray-50 dark:bg-gray-800">
                <p className="text-sm text-gray-500 mb-2">한국은행의 권한으로 화폐를 신규 발행하여 은행 잔고에 추가합니다.</p>
                <Input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="발행할 금액" className="p-4 text-lg" />
                <select value={currency} onChange={e => setCurrency(e.target.value as any)} className="w-full p-4 rounded-2xl bg-white dark:bg-gray-700 text-lg border border-gray-200 dark:border-gray-600">
                    <option value="KRW">원화 (KRW)</option>
                    <option value="USD">달러 (USD)</option>
                </select>
                <Button onClick={handleMint} className="w-full py-4 text-lg bg-blue-600 hover:bg-blue-500">즉시 발권</Button>
            </div>
        </Card>
    );
};