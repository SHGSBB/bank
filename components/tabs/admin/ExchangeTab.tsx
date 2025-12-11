
import React, { useState, useEffect } from 'react';
import { useGame } from '../../context/GameContext';
import { Card, Button, Input } from '../Shared';

type Currency = 'KRW' | 'USD';

export const ExchangeTab: React.FC = () => {
    const { currentUser, db, saveDb, notify, showModal, showPinModal } = useGame();
    
    const [fromAmount, setFromAmount] = useState<string>('');
    const [fromCurrency, setFromCurrency] = useState<Currency>('KRW');
    const [toCurrency, setToCurrency] = useState<Currency>('USD');
    const [toAmount, setToAmount] = useState<string>('0');
    const [rateInfo, setRateInfo] = useState('');

    const exchangeRates = db.settings.exchangeRate || { KRW_USD: 1350 };

    const getRate = (from: Currency, to: Currency) => {
        if (from === to) return 1;
        if (from === 'KRW' && to === 'USD') return 1 / exchangeRates.KRW_USD;
        if (from === 'USD' && to === 'KRW') return exchangeRates.KRW_USD;
        return 0;
    };

    useEffect(() => {
        const amount = parseFloat(fromAmount) || 0;
        const rate = getRate(fromCurrency, toCurrency);
        
        setToAmount((amount * rate).toLocaleString(undefined, { maximumFractionDigits: 2 }));

        if (rate > 0) {
            let displayRate = rate;
            let displayFrom = fromCurrency;
            let displayTo = toCurrency;
            
            if (rate < 1) {
                displayRate = 1 / rate;
                displayFrom = toCurrency;
                displayTo = fromCurrency;
            }
            setRateInfo(`환율: 1 ${displayFrom} = ${displayRate.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${displayTo}`);
        } else {
            setRateInfo('환전 불가');
        }
    }, [fromAmount, fromCurrency, toCurrency, exchangeRates]);

    const handleSwap = () => {
        setFromCurrency(toCurrency);
        setToCurrency(fromCurrency);
    };

    const handleExchange = async () => {
        const amount = parseFloat(fromAmount);
        if (isNaN(amount) || amount <= 0) return showModal('올바른 금액을 입력하세요.');
        
        const rate = getRate(fromCurrency, toCurrency);
        const finalToAmount = amount * rate;

        let balanceField: 'balanceKRW' | 'balanceUSD' = 'balanceKRW';
        if (fromCurrency === 'USD') balanceField = 'balanceUSD';

        if (currentUser![balanceField] < amount) return showModal('잔액이 부족합니다.');

        const pin = await showPinModal('간편번호를 입력하세요.', currentUser!.pin!);
        if (pin !== currentUser!.pin) return; // Incorrect PIN handled by modal

        const newDb = { ...db };
        const user = newDb.users[currentUser!.name];

        // Deduct
        if (fromCurrency === 'KRW') user.balanceKRW -= amount;
        else user.balanceUSD -= amount;

        // Add
        if (toCurrency === 'KRW') user.balanceKRW += finalToAmount;
        else user.balanceUSD += finalToAmount;

        // Transactions
        const date = new Date().toISOString();
        user.transactions = [...(user.transactions || []), 
            { id: Date.now(), type: 'exchange', amount: -amount, currency: fromCurrency, description: `${fromCurrency} -> ${toCurrency} 환전`, date },
            { id: Date.now() + 1, type: 'exchange', amount: finalToAmount, currency: toCurrency, description: `${fromCurrency} -> ${toCurrency} 환전`, date }
        ];

        await saveDb(newDb);
        notify(currentUser!.name, '환전이 완료되었습니다.');
        showModal('환전이 완료되었습니다.');
        setFromAmount('');
    };

    return (
        <Card>
            <h3 className="text-2xl font-bold mb-6">환전</h3>
            <div className="space-y-6 max-w-lg mx-auto">
                <div className="flex gap-4 items-end">
                    <div className="flex-1">
                        <label className="text-sm font-medium mb-1 block">보낼 금액</label>
                        <Input 
                            type="number" 
                            placeholder="0" 
                            value={fromAmount} 
                            onChange={e => setFromAmount(e.target.value)}
                            className="text-right" 
                        />
                        <select 
                            value={fromCurrency} 
                            onChange={e => setFromCurrency(e.target.value as Currency)}
                            className="w-full mt-2 p-2 rounded-md bg-gray-100 dark:bg-gray-700 outline-none"
                        >
                            <option value="KRW">원 (KRW)</option>
                            <option value="USD">달러 (USD)</option>
                        </select>
                    </div>

                    <div className="pb-8">
                        <Button variant="secondary" className="px-3 py-2" onClick={handleSwap}>
                             ⇄
                        </Button>
                    </div>

                    <div className="flex-1">
                        <label className="text-sm font-medium mb-1 block">받을 금액 (예상)</label>
                        <Input 
                            value={toAmount} 
                            readOnly 
                            className="text-right bg-gray-200 dark:bg-gray-600 cursor-not-allowed"
                        />
                        <select 
                            value={toCurrency} 
                            onChange={e => setToCurrency(e.target.value as Currency)}
                            className="w-full mt-2 p-2 rounded-md bg-gray-100 dark:bg-gray-700 outline-none"
                        >
                            <option value="KRW">원 (KRW)</option>
                            <option value="USD">달러 (USD)</option>
                        </select>
                    </div>
                </div>

                <div className="text-center text-sm text-gray-500">
                    {rateInfo}
                </div>

                <Button className="w-full" onClick={handleExchange}>환전하기</Button>
            </div>
        </Card>
    );
};
