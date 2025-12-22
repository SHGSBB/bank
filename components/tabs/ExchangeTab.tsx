
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useGame } from '../../context/GameContext';
import { Card, Button, Input, MoneyInput } from '../Shared';
import { User } from '../../types';

type Currency = 'KRW' | 'USD';

const ExchangeChart: React.FC<{ data: { date: string, rate: number }[] }> = ({ data }) => {
    // ... (Chart UI code remains unchanged for brevity, reusing existing logic)
    const containerRef = useRef<HTMLDivElement>(null);
    const [hoverInfo, setHoverInfo] = useState<{ x: number, rate: number, date: string, svgX: number, svgY: number } | null>(null);
    const chartData = useMemo(() => data.slice(-50), [data]); 
    if (chartData.length === 0) return <div className="h-full flex items-center justify-center text-gray-400">데이터 없음</div>;
    const width = 1000; const height = 300;
    const rates = chartData.map(d => d.rate);
    const minRate = Math.min(...rates) * 0.99; const maxRate = Math.max(...rates) * 1.01; const range = maxRate - minRate || 1; 
    let points = chartData.map((d, i) => { const x = (i / (chartData.length - 1)) * width; const y = height - ((d.rate - minRate) / range) * height; return `${x},${y}`; }).join(' ');
    
    return (
        <div className="w-full h-full relative" ref={containerRef}>
             <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible" preserveAspectRatio="none">
                <polyline fill="none" stroke="#3b82f6" strokeWidth="3" points={points} />
             </svg>
        </div>
    );
};

export const ExchangeTab: React.FC = () => {
    const { currentUser, db, notify, showModal, showPinModal, serverAction } = useGame();
    
    const [fromAmount, setFromAmount] = useState<string>('');
    const [fromCurrency, setFromCurrency] = useState<Currency>('KRW');
    const [toCurrency, setToCurrency] = useState<Currency>('USD');
    const [toAmount, setToAmount] = useState<string>('0');
    const [rateInfo, setRateInfo] = useState('');

    const config = db.settings.exchangeConfig || { 
        pairs: { KRW_USD: true },
        rates: { KRW_USD: 1350 },
        isAutoStopEnabled: false,
        autoMintLimit: 1000000000
    };

    const history = db.settings.exchangeRateHistory || [];

    const getRate = (from: Currency, to: Currency) => {
        if (from === to) return 1;
        if (from === 'KRW' && to === 'USD' && config.pairs.KRW_USD) return 1 / config.rates.KRW_USD;
        if (from === 'USD' && to === 'KRW' && config.pairs.KRW_USD) return config.rates.KRW_USD;
        return 0;
    };

    useEffect(() => {
        const amount = parseFloat(fromAmount) || 0;
        const rate = getRate(fromCurrency, toCurrency);
        setToAmount((amount * rate).toLocaleString(undefined, { maximumFractionDigits: 2 }));
        if (rate > 0) {
            let displayRate = rate; let displayFrom = fromCurrency; let displayTo = toCurrency;
            if (rate < 1 && rate > 0) { displayRate = 1 / rate; displayFrom = toCurrency; displayTo = fromCurrency; }
            setRateInfo(`환율: 1 ${displayFrom} = ${displayRate.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${displayTo}`);
        } else {
            setRateInfo('환전 불가 (설정 제한)');
        }
    }, [fromAmount, fromCurrency, toCurrency, config]);

    const handleSwap = () => {
        setFromCurrency(toCurrency);
        setToCurrency(fromCurrency);
    };

    const handleExchange = async () => {
        if (db.settings.isFrozen) return showModal('현재 모든 금융 거래가 중지되었습니다.');
        
        // Dynamic Bank Lookup
        const bank = (Object.values(db.users) as User[]).find(u => 
            u.govtRole === '한국은행장' || 
            (u.type === 'admin' && u.subType === 'govt') || 
            u.name === '한국은행'
        );

        if (config.isAutoStopEnabled && toCurrency === 'USD') {
            if (!bank || (bank.balanceUSD || 0) < (config.autoStopThresholdUSD || 100)) {
                return showModal("은행 외화 보유량 부족으로 환전이 일시 중지되었습니다.");
            }
        }

        const amount = parseFloat(fromAmount);
        if (isNaN(amount) || amount <= 0) return showModal('올바른 금액을 입력하세요.');
        
        const fromKey = fromCurrency === 'KRW' ? 'balanceKRW' : 'balanceUSD';
        if ((currentUser![fromKey] || 0) < amount) return showModal('잔액이 부족합니다.');

        const pin = await showPinModal('간편번호를 입력하세요.', currentUser!.pin!, (currentUser?.pinLength as 4 | 6) || 4);
        if (pin !== currentUser!.pin) return;

        try {
            await serverAction('exchange', {
                userId: currentUser!.name,
                fromCurrency,
                toCurrency,
                amount
            });
            notify(currentUser!.name, '환전이 완료되었습니다.');
            showModal('환전이 완료되었습니다.');
            setFromAmount('');
        } catch(e) {
            showModal('환전 실패: 서버 오류');
        }
    };

    return (
        <div className="space-y-6">
            <h3 className="text-2xl font-bold">환전</h3>
            <Card className="mb-6 h-[400px] flex flex-col">
                <h4 className="font-bold mb-4 text-gray-700 dark:text-gray-300">환율 변동 추이 (USD/KRW)</h4>
                <div className="flex-1 w-full min-h-0 border-b border-l border-gray-300 dark:border-gray-600">
                    <ExchangeChart data={history} />
                </div>
            </Card>
            
            <Card>
                <div className="flex flex-col sm:flex-row gap-4 items-center sm:items-end mb-6">
                    <div className="w-full flex-1">
                        <label className="text-sm font-medium mb-1 block">보낼 금액</label>
                        <MoneyInput type="number" placeholder="0" value={fromAmount} onChange={e => setFromAmount(e.target.value)} className="text-right w-full" />
                        <select value={fromCurrency} onChange={e => setFromCurrency(e.target.value as Currency)} className="w-full mt-2 p-2 rounded-md bg-gray-100 dark:bg-gray-700 outline-none">
                            <option value="KRW">원 (KRW)</option>
                            <option value="USD">달러 (USD)</option>
                        </select>
                    </div>
                    <div className="pb-0 sm:pb-8">
                        <Button variant="secondary" className="px-3 py-2" onClick={handleSwap}>⇄</Button>
                    </div>
                    <div className="w-full flex-1">
                        <label className="text-sm font-medium mb-1 block">받을 금액 (예상)</label>
                        <Input value={toAmount} readOnly className="text-right bg-gray-200 dark:bg-gray-600 cursor-not-allowed w-full" />
                        <select value={toCurrency} onChange={e => setToCurrency(e.target.value as Currency)} className="w-full mt-2 p-2 rounded-md bg-gray-100 dark:bg-gray-700 outline-none">
                            <option value="KRW">원 (KRW)</option>
                            <option value="USD">달러 (USD)</option>
                        </select>
                    </div>
                </div>
                <div className="text-center text-sm text-gray-500 mb-6 font-bold">{rateInfo}</div>
                <Button className="w-full" onClick={handleExchange}>환전하기</Button>
            </Card>
        </div>
    );
};
