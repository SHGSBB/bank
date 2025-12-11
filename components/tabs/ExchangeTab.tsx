import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useGame } from '../../context/GameContext';
import { Card, Button, Input, MoneyInput } from '../Shared';

type Currency = 'KRW' | 'USD';

const ExchangeChart: React.FC<{ data: { date: string, rate: number }[] }> = ({ data }) => {
    const [hoverInfo, setHoverInfo] = useState<{ x: number, rate: number, date: string, svgX: number, svgY: number } | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const chartData = useMemo(() => data.slice(-50), [data]); 

    if (chartData.length === 0) return <div className="h-full flex items-center justify-center text-gray-400">데이터 없음</div>;

    const width = 1000;
    const height = 300;
    
    const rates = chartData.map(d => d.rate);
    const minRate = Math.min(...rates) * 0.99;
    const maxRate = Math.max(...rates) * 1.01;
    const range = maxRate - minRate || 1; 

    const isSinglePoint = chartData.length === 1;

    const handleInteraction = (e: React.MouseEvent | React.TouchEvent) => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
        const x = clientX - rect.left;
        
        if (x < 0 || x > rect.width) return;

        if (isSinglePoint) {
             const point = chartData[0];
             setHoverInfo({
                x: rect.width / 2,
                rate: point.rate,
                date: point.date,
                svgX: width / 2,
                svgY: height / 2
             });
             return;
        }

        const index = Math.min(Math.floor((x / rect.width) * chartData.length), chartData.length - 1);
        const point = chartData[index];
        
        const svgX = (index / (chartData.length - 1)) * width;
        const svgY = height - ((point.rate - minRate) / range) * height;

        setHoverInfo({
            x, 
            rate: point.rate,
            date: point.date,
            svgX,
            svgY
        });
    };

    const handleLeave = () => setHoverInfo(null);

    let points = "";
    if (isSinglePoint) {
        points = `0,${height/2} ${width},${height/2}`;
    } else {
        points = chartData.map((d, i) => {
            const x = (i / (chartData.length - 1)) * width;
            const y = height - ((d.rate - minRate) / range) * height;
            return `${x},${y}`;
        }).join(' ');
    }

    return (
        <div 
            ref={containerRef}
            className="w-full h-full relative cursor-crosshair touch-none"
            onMouseMove={handleInteraction}
            onMouseLeave={handleLeave}
            onTouchStart={handleInteraction}
            onTouchMove={handleInteraction}
            onTouchEnd={handleLeave}
        >
            <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible" preserveAspectRatio="none">
                <polyline
                    fill="none"
                    stroke="#3b82f6"
                    strokeWidth="3"
                    points={points}
                    vectorEffect="non-scaling-stroke"
                />
                <defs>
                    <linearGradient id="exGradient" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.2" />
                        <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
                    </linearGradient>
                </defs>
                <polygon points={`0,${height} ${points} ${width},${height}`} fill="url(#exGradient)" />
                
                {chartData.map((d, i) => {
                    const x = (i / (chartData.length - 1)) * width;
                    const y = height - ((d.rate - minRate) / range) * height;
                    return <circle key={i} cx={x} cy={y} r="3" fill="#3b82f6" stroke="white" strokeWidth="1" />;
                })}

                {hoverInfo && (
                    <>
                        <line 
                            x1={hoverInfo.svgX} y1={0} x2={hoverInfo.svgX} y2={height} 
                            stroke="#888" strokeWidth="1" strokeDasharray="5,5" 
                            vectorEffect="non-scaling-stroke"
                        />
                        <circle 
                            cx={hoverInfo.svgX} cy={hoverInfo.svgY} r="6" 
                            fill="#3b82f6" stroke="white" strokeWidth="2"
                            vectorEffect="non-scaling-stroke"
                        />
                    </>
                )}
            </svg>
            
            {hoverInfo && (
                <div 
                    className="absolute bg-black/80 text-white text-xs p-2 rounded pointer-events-none z-10 whitespace-nowrap shadow-xl border border-white/20"
                    style={{ 
                        left: hoverInfo.x, 
                        top: 10,
                        transform: 'translateX(-50%)'
                    }}
                >
                    <p className="font-bold mb-1 text-gray-300">{new Date(hoverInfo.date).toLocaleString()}</p>
                    <p className="text-lg font-bold">1 USD = {hoverInfo.rate} KRW</p>
                </div>
            )}
        </div>
    );
};

export const ExchangeTab: React.FC = () => {
    const { currentUser, db, saveDb, notify, showModal, showPinModal } = useGame();
    
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
            let displayRate = rate;
            let displayFrom = fromCurrency;
            let displayTo = toCurrency;
            
            if (rate < 1 && rate > 0) {
                displayRate = 1 / rate;
                displayFrom = toCurrency;
                displayTo = fromCurrency;
            }
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
        
        const bank = db.users['한국은행'];
        
        // Auto Stop Check (Manual Stop)
        if (config.isAutoStopEnabled) {
             if (toCurrency === 'USD' && (bank.balanceUSD || 0) < (config.autoStopThresholdUSD || 100)) return showModal("은행 외화 보유량 부족으로 환전이 일시 중지되었습니다.");
        }

        const amount = parseFloat(fromAmount);
        if (isNaN(amount) || amount <= 0) return showModal('올바른 금액을 입력하세요.');
        
        const rate = getRate(fromCurrency, toCurrency);
        if (rate === 0) return showModal("현재 지원하지 않는 환전 경로입니다.");

        const finalToAmount = amount * rate;

        const getBalanceKey = (c: Currency) => c === 'KRW' ? 'balanceKRW' : 'balanceUSD';
        const fromKey = getBalanceKey(fromCurrency);
        const toKey = getBalanceKey(toCurrency);

        if ((currentUser![fromKey] || 0) < amount) return showModal('잔액이 부족합니다.');

        const pin = await showPinModal('간편번호를 입력하세요.', currentUser!.pin!, currentUser?.pinLength || 4);
        if (pin !== currentUser!.pin) return;

        const newDb = { ...db };
        const user = newDb.users[currentUser!.name];
        const bankUser = newDb.users['한국은행'];

        // Auto Minting Logic: Check if bank has enough funds
        // @ts-ignore
        const bankBalance = bankUser[toKey] || 0;
        
        if (bankBalance < finalToAmount) {
            const deficit = finalToAmount - bankBalance;
            const mintLimit = config.autoMintLimit || 1000000000;
            
            // Allow buffer (e.g., mint deficit + 50%)
            const mintAmount = deficit * 1.5;
            
            if (mintAmount <= mintLimit) {
                // Auto Mint
                // @ts-ignore
                bankUser[toKey] = (bankUser[toKey] || 0) + mintAmount;
                bankUser.transactions = [...(bankUser.transactions || []), {
                    id: Date.now() + Math.random(), 
                    type: 'income', 
                    amount: mintAmount, 
                    currency: toCurrency, 
                    description: `긴급 발권 (환전 유동성 공급)`, 
                    date: new Date().toISOString()
                }];
            } else {
                return showModal("은행 잔고가 부족하며, 자동 발권 한도를 초과하여 환전을 진행할 수 없습니다.");
            }
        }

        // @ts-ignore
        user[fromKey] -= amount;
        // @ts-ignore
        user[toKey] = (user[toKey] || 0) + finalToAmount;
        
        // @ts-ignore
        bankUser[fromKey] = (bankUser[fromKey] || 0) + amount;
        // @ts-ignore
        bankUser[toKey] = (bankUser[toKey] || 0) - finalToAmount;

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
                        <MoneyInput 
                            type="number" 
                            placeholder="0" 
                            value={fromAmount} 
                            onChange={e => setFromAmount(e.target.value)}
                            className="text-right w-full" 
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

                    <div className="pb-0 sm:pb-8">
                        <Button variant="secondary" className="px-3 py-2" onClick={handleSwap}>
                             ⇄
                        </Button>
                    </div>

                    <div className="w-full flex-1">
                        <label className="text-sm font-medium mb-1 block">받을 금액 (예상)</label>
                        <Input 
                            value={toAmount} 
                            readOnly 
                            className="text-right bg-gray-200 dark:bg-gray-600 cursor-not-allowed w-full"
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

                <div className="text-center text-sm text-gray-500 mb-6 font-bold">
                    {rateInfo}
                </div>

                <Button className="w-full" onClick={handleExchange}>환전하기</Button>
            </Card>
        </div>
    );
};