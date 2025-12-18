
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useGame } from '../../context/GameContext';
import { Card, Button, Input, formatSmartMoney } from '../Shared';
import { Stock, StockHistory } from '../../types';

// --- Improved Chart Component (Yahoo Finance Style) ---

interface ChartProps {
    data: StockHistory[];
    color: string;
    period: '1D' | '1W' | '1M' | '1Y';
}

const StockChart: React.FC<ChartProps> = ({ data, color, period }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [hoverData, setHoverData] = useState<{ price: number, date: string, x: number } | null>(null);

    // Filter Data based on Period
    const chartData = useMemo(() => {
        const now = new Date();
        let startTime = 0;
        switch (period) {
            case '1D': 
                // Set start time to 00:00 of today
                const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
                startTime = startOfDay.getTime();
                break;
            case '1W': startTime = Date.now() - 7 * 24 * 60 * 60 * 1000; break;
            case '1M': startTime = Date.now() - 30 * 24 * 60 * 60 * 1000; break;
            case '1Y': startTime = Date.now() - 365 * 24 * 60 * 60 * 1000; break;
        }
        const filtered = data.filter(d => new Date(d.date).getTime() >= startTime);
        // If 1D has no data (e.g. before market open), show the last known point or empty
        return filtered.length > 0 ? filtered : (period === '1D' ? data.slice(-1) : []); 
    }, [data, period]);

    if (!chartData || chartData.length === 0) return <div className="h-64 flex items-center justify-center text-gray-500">데이터 없음</div>;

    const prices = chartData.map(d => d.price);
    const minPrice = Math.min(...prices) * 0.995;
    const maxPrice = Math.max(...prices) * 1.005;
    const range = maxPrice - minPrice || 1;

    const width = 1000; 
    const height = 300; 

    // Generate Path
    const points = chartData.map((d, i) => {
        const x = (i / (chartData.length - 1)) * width;
        const y = height - ((d.price - minPrice) / range) * height;
        return `${x},${y}`;
    }).join(' ');

    const areaPath = `${points} ${width},${height} 0,${height}`;

    const handleMouseMove = (e: React.MouseEvent | React.TouchEvent) => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
        const x = clientX - rect.left;
        
        const index = Math.min(Math.floor((x / rect.width) * chartData.length), chartData.length - 1);
        if (index >= 0) {
            setHoverData({
                price: chartData[index].price,
                date: chartData[index].date,
                x: (index / (chartData.length - 1)) * rect.width
            });
        }
    };

    return (
        <div 
            ref={containerRef}
            className="w-full h-64 sm:h-80 relative cursor-crosshair touch-none select-none bg-white dark:bg-[#121212] border-b border-gray-100 dark:border-gray-800"
            onMouseMove={handleMouseMove}
            onTouchMove={handleMouseMove}
            onMouseLeave={() => setHoverData(null)}
            onTouchEnd={() => setHoverData(null)}
        >
            <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full" preserveAspectRatio="none">
                <defs>
                    <linearGradient id={`gradient-${color}`} x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor={color} stopOpacity="0.3" />
                        <stop offset="100%" stopColor={color} stopOpacity="0" />
                    </linearGradient>
                </defs>
                <polygon points={areaPath} fill={`url(#gradient-${color})`} />
                <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
                {chartData.map((d, i) => {
                    const x = (i / (chartData.length - 1)) * width;
                    const y = height - ((d.price - minPrice) / range) * height;
                    return <circle key={i} cx={x} cy={y} r="3" fill={color} stroke="white" strokeWidth="1" />;
                })}
            </svg>

            {hoverData && (
                <>
                    <div 
                        className="absolute top-0 bottom-0 w-px border-l border-dashed border-gray-400 pointer-events-none"
                        style={{ left: hoverData.x }}
                    />
                    <div className="absolute top-2 left-2 bg-white/90 dark:bg-black/80 p-2 rounded shadow-md pointer-events-none z-10 border border-gray-200 dark:border-gray-700">
                        <p className="text-xl font-bold" style={{ color }}>{hoverData.price.toLocaleString()}</p>
                        <p className="text-xs text-gray-500">{new Date(hoverData.date).toLocaleString()}</p>
                    </div>
                </>
            )}
        </div>
    );
};

// Mini Chart for Selection Cards
const MiniStockChart: React.FC<{ data: StockHistory[], color: string }> = ({ data, color }) => {
    if (!data || data.length < 2) return null;
    const recent = data.slice(-20);
    const prices = recent.map(d => d.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const range = max - min || 1;
    
    const points = recent.map((d, i) => {
        const x = (i / (recent.length - 1)) * 100;
        const y = 100 - ((d.price - min) / range) * 80; // keep it somewhat centered vertically
        return `${x},${y}`;
    }).join(' ');

    return (
        <svg viewBox="0 0 100 100" className="w-full h-full overflow-visible" preserveAspectRatio="none">
            <polyline fill="none" stroke={color} strokeWidth="4" strokeOpacity="0.3" points={points} />
        </svg>
    );
};

// --- Helper: Clean Number Format ---
const fmt = (num: number) => Math.floor(num).toLocaleString();

export const StockTab: React.FC = () => {
    const { db, currentUser, updateUser, updateStock, notify, showModal, showPinModal } = useGame();
    
    // State
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [period, setPeriod] = useState<'1D' | '1W' | '1M' | '1Y'>('1D');
    
    // Trading State
    const [tab, setTab] = useState<'buy' | 'sell'>('buy');
    const [mode, setMode] = useState<'market' | 'limit'>('market');
    const [priceInput, setPriceInput] = useState('');
    const [qtyInput, setQtyInput] = useState('');

    // SungSPI View State
    const [isSungSpiView, setIsSungSpiView] = useState(false);

    // Derived Data
    const stocks = Object.values(db.stocks || {}) as Stock[];
    // Use DIRECT DB Access for User to prevent stale state issues in stock holdings
    const user = db.users[currentUser!.name] || currentUser; 

    // Sort stocks: Owned first, then alphabetical
    const sortedStocks = useMemo(() => {
        return [...stocks].sort((a, b) => {
            const qtyA = user?.stockHoldings?.[a.id]?.quantity || 0;
            const qtyB = user?.stockHoldings?.[b.id]?.quantity || 0;
            if (qtyA > 0 && qtyB <= 0) return -1;
            if (qtyA <= 0 && qtyB > 0) return 1;
            return a.name.localeCompare(b.name);
        });
    }, [stocks, user]);

    const stock = stocks.find(s => s.id === selectedId) || sortedStocks[0];

    useEffect(() => {
        if (!selectedId && sortedStocks.length > 0) setSelectedId(sortedStocks[0].id);
    }, [sortedStocks, selectedId]);

    useEffect(() => {
        setQtyInput('');
        if (stock) setPriceInput(stock.currentPrice.toString());
        setIsSungSpiView(false);
    }, [selectedId, stock]);

    const currentPrice = stock?.currentPrice || 0;
    const change = currentPrice - (stock?.openPrice || 0);
    const changeRate = stock ? ((change / stock.openPrice) * 100) : 0;
    const isUp = change >= 0;
    const color = isUp ? '#ef4444' : '#3b82f6';

    const myHolding = (user?.stockHoldings && stock) ? user.stockHoldings[stock.id] : undefined;
    const myQty = myHolding?.quantity || 0;
    const myAvg = myHolding?.averagePrice || 0;
    const myProfit = (currentPrice - myAvg) * myQty;
    const myRate = myAvg > 0 ? ((currentPrice - myAvg) / myAvg) * 100 : 0;

    const marketSettings = db.settings.stockMarket || { isOpen: true, sungSpiBasePoint: 1000 };
    
    // Real SungSPI Logic: Calculate Market Cap Weight average price
    const sungSpi = useMemo(() => {
        if (stocks.length === 0) return 1000;
        const totalCap = stocks.reduce((sum, s) => sum + (s.currentPrice * s.totalShares), 0);
        return (totalCap / (marketSettings.sungSpiBasePoint || 1000));
    }, [stocks, marketSettings]);

    // SungSPI History: Aggregate all stock histories
    const spiHistory = useMemo(() => {
        if (stocks.length === 0) return [];
        // Flatten and sort all history points by date
        const allPoints: StockHistory[] = [];
        // Just take the history of the first stock as timeline reference, and re-calculate average for those points
        // NOTE: This is a simplification. Ideally, we snapshot the index daily.
        // For simulation, we create a synthetic history based on the first stock's dates.
        const refStock = stocks[0];
        if(!refStock.history) return [];

        return refStock.history.map((h, i) => {
            let totalCapAtTime = 0;
            stocks.forEach(s => {
                // Find closest history point
                const pt = s.history[i] || s.history[s.history.length - 1];
                if(pt) totalCapAtTime += (pt.price * s.totalShares);
            });
            return {
                date: h.date,
                price: (totalCapAtTime / (marketSettings.sungSpiBasePoint || 1000))
            };
        });
    }, [stocks, marketSettings]);

    const handleOrder = async () => {
        if (!stock) return;
        const qty = parseInt(qtyInput);
        if (isNaN(qty) || qty <= 0) return showModal("수량을 입력하세요.");

        let tradePrice = currentPrice;
        if (mode === 'limit') {
            const limit = parseInt(priceInput);
            if (isNaN(limit) || limit <= 0) return showModal("지정가를 입력하세요.");
            tradePrice = limit;
            
            if (tab === 'buy' && limit < currentPrice) return showModal(`현재가(${fmt(currentPrice)})보다 낮아 매수할 수 없습니다. (대기 미지원)`);
            if (tab === 'sell' && limit > currentPrice) return showModal(`현재가(${fmt(currentPrice)})보다 높아 매도할 수 없습니다. (대기 미지원)`);
        }

        const totalAmount = tradePrice * qty;

        if (tab === 'buy') {
            if (user.balanceKRW < totalAmount) return showModal("예수금이 부족합니다.");
        } else {
            if (myQty < qty) return showModal(`보유 수량이 부족합니다. (보유: ${myQty}주)`);
        }

        const pin = await showPinModal("거래 승인 (PIN)", currentUser?.pin!, (currentUser?.pinLength as 4 | 6) || 4);
        if (pin !== currentUser?.pin) return;

        // Use deep clone or new object for user updates
        const userUpdates: any = {};
        
        if (tab === 'buy') {
            userUpdates.balanceKRW = user.balanceKRW - totalAmount;
            
            const existing = user.stockHoldings?.[stock.id] || { quantity: 0, averagePrice: 0 };
            const newQty = existing.quantity + qty;
            const newAvg = ((existing.quantity * existing.averagePrice) + totalAmount) / newQty;

            userUpdates.stockHoldings = { ...user.stockHoldings, [stock.id]: { quantity: newQty, averagePrice: newAvg } };

            userUpdates.transactions = [...(user.transactions || []), {
                id: Date.now(), type: 'stock_buy', amount: -totalAmount, currency: 'KRW', description: `${stock.name} ${qty}주 매수`, date: new Date().toISOString()
            }];
            
            const newPrice = Math.floor(tradePrice * (1 + 0.0001 * qty));
            
            // Execute Update for User
            await updateUser(currentUser!.name, userUpdates);
            
            // Execute Update for Stock
            const history = [...(stock.history || [])];
            history.push({ date: new Date().toISOString(), price: newPrice });
            await updateStock(stock.id, { currentPrice: newPrice, history });
            
            notify(currentUser!.name, `${stock.name} ${qty}주 매수 체결`);
        } else {
            userUpdates.balanceKRW = user.balanceKRW + totalAmount;
            
            const existing = user.stockHoldings?.[stock.id] || { quantity: 0, averagePrice: 0 };
            const newQty = existing.quantity - qty;
            
            const profit = (tradePrice - existing.averagePrice) * qty;
            userUpdates.realizedStockProfit = (user.realizedStockProfit || 0) + profit;

            const newHoldings = { ...user.stockHoldings };
            if (newQty <= 0) {
                delete newHoldings[stock.id];
            } else {
                newHoldings[stock.id] = { ...existing, quantity: newQty };
            }
            userUpdates.stockHoldings = newHoldings;

            userUpdates.transactions = [...(user.transactions || []), {
                id: Date.now(), type: 'stock_sell', amount: totalAmount, currency: 'KRW', description: `${stock.name} ${qty}주 매도`, date: new Date().toISOString()
            }];

            const newPrice = Math.max(1, Math.floor(tradePrice * (1 - 0.0001 * qty)));
            
            // Execute Update for User
            await updateUser(currentUser!.name, userUpdates);
            
            // Execute Update for Stock
            const history = [...(stock.history || [])];
            history.push({ date: new Date().toISOString(), price: newPrice });
            await updateStock(stock.id, { currentPrice: newPrice, history });

            notify(currentUser!.name, `${stock.name} ${qty}주 매도 체결`);
        }

        setQtyInput('');
        showModal('주문이 체결되었습니다.');
    };

    const renderOrderBook = () => {
        if (!stock) return null;
        const sells = [3, 2, 1].map(i => Math.floor(currentPrice * (1 + i * 0.003)));
        const buys = [1, 2, 3].map(i => Math.floor(currentPrice * (1 - i * 0.003)));

        return (
            <div className="text-xs font-mono border dark:border-gray-700 rounded-lg overflow-hidden mb-4">
                <div className="bg-gray-100 dark:bg-gray-800 p-1 text-center text-gray-500 font-bold border-b dark:border-gray-700">호가</div>
                {sells.map(p => (
                    <div key={p} className="flex justify-between px-2 py-1 bg-blue-50 dark:bg-blue-900/10 text-blue-600 cursor-pointer hover:bg-gray-200" onClick={() => { setMode('limit'); setPriceInput(p.toString()); }}>
                        <span>{fmt(p)}</span>
                        <span className="opacity-50">{Math.floor(Math.random() * 500)}</span>
                    </div>
                ))}
                <div className="px-2 py-2 font-bold text-center border-y dark:border-gray-700 text-lg bg-white dark:bg-[#1E1E1E]">
                    {fmt(currentPrice)}
                </div>
                {buys.map(p => (
                    <div key={p} className="flex justify-between px-2 py-1 bg-red-50 dark:bg-red-900/10 text-red-600 cursor-pointer hover:bg-gray-200" onClick={() => { setMode('limit'); setPriceInput(p.toString()); }}>
                        <span>{fmt(p)}</span>
                        <span className="opacity-50">{Math.floor(Math.random() * 500)}</span>
                    </div>
                ))}
            </div>
        );
    };

    return (
        <div className="flex flex-col h-full space-y-4">
            {/* Stock List Scroll - Added p-4 for clipping prevention */}
            <div className="flex overflow-x-auto gap-3 pb-2 scrollbar-hide select-none p-4 -mx-4">
                <div 
                    onClick={() => setIsSungSpiView(true)}
                    className={`flex-shrink-0 min-w-[120px] p-3 rounded-xl border cursor-pointer transition-all ${isSungSpiView ? 'bg-gray-800 text-white border-gray-600 scale-105 shadow-lg' : 'bg-white dark:bg-[#1E1E1E] border-gray-200 dark:border-gray-700'}`}
                >
                    <p className="text-xs font-bold opacity-70">SungSPI</p>
                    <p className="text-lg font-bold text-yellow-500">{sungSpi.toFixed(2)}</p>
                </div>
                {sortedStocks.map(s => {
                    const c = s.currentPrice - s.openPrice;
                    const cRate = (c / s.openPrice) * 100;
                    const myStockQty = user?.stockHoldings?.[s.id]?.quantity || 0;
                    const cardColor = c >= 0 ? '#ef4444' : '#3b82f6';
                    
                    return (
                        <div 
                            key={s.id}
                            onClick={() => { setSelectedId(s.id); setIsSungSpiView(false); }}
                            className={`relative flex-shrink-0 min-w-[140px] p-3 rounded-xl border cursor-pointer transition-all overflow-hidden ${selectedId === s.id && !isSungSpiView ? 'bg-gray-800 text-white border-gray-600 scale-105 shadow-lg' : 'bg-white dark:bg-[#1E1E1E] border-gray-200 dark:border-gray-700'}`}
                        >
                            {/* Background Chart */}
                            <div className="absolute inset-0 z-0 pointer-events-none opacity-20 bottom-0 top-auto h-16">
                                <MiniStockChart data={s.history} color={cardColor} />
                            </div>

                            <div className="relative z-10">
                                {myStockQty > 0 && (
                                    <span className="absolute top-[-6px] right-[-6px] bg-green-100 text-green-800 text-[10px] px-2 py-0.5 rounded-full font-bold z-10 border border-green-200 shadow-sm">
                                        보유중
                                    </span>
                                )}
                                <p className="text-xs font-bold truncate">{s.name}</p>
                                <div className="flex justify-between items-end mt-1">
                                    <span className={`font-bold ${c >= 0 ? 'text-red-500' : 'text-blue-500'}`}>{fmt(s.currentPrice)}</span>
                                    <span className={`text-[10px] ${c >= 0 ? 'text-red-500' : 'text-blue-500'}`}>{cRate.toFixed(1)}%</span>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {isSungSpiView ? (
                <Card>
                    <h3 className="text-3xl font-bold mb-2">Sung-SPI 종합주가지수</h3>
                    <p className="text-4xl font-bold text-yellow-500 mb-6">{sungSpi.toFixed(2)}</p>
                    <div className="bg-gray-900 rounded-xl p-4 overflow-hidden">
                        <StockChart 
                            data={spiHistory} 
                            color="#eab308" 
                            period="1D" 
                        />
                    </div>
                    <p className="text-center text-gray-500 mt-4">종합주가지수는 시장 전체(시가총액)의 흐름을 나타냅니다.</p>
                </Card>
            ) : stock ? (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2 space-y-4">
                        <Card className="p-0 overflow-hidden border-none shadow-none bg-transparent">
                            <div className="bg-white dark:bg-[#1E1E1E] rounded-2xl p-6 border border-gray-100 dark:border-gray-800">
                                <div className="flex justify-between items-start mb-6">
                                    <div>
                                        <h2 className="text-3xl font-bold flex items-center gap-2">
                                            {stock.name}
                                            {myQty > 0 && <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full font-bold">보유중</span>}
                                        </h2>
                                        <div className="flex items-baseline gap-3 mt-1">
                                            <span className={`text-4xl font-bold ${color === '#ef4444' ? 'text-red-500' : 'text-blue-500'}`}>{fmt(currentPrice)}</span>
                                            <span className={`text-lg font-medium ${color === '#ef4444' ? 'text-red-500' : 'text-blue-500'}`}>
                                                {isUp ? '▲' : '▼'} {Math.abs(change).toLocaleString()} ({changeRate.toFixed(2)}%)
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
                                        {['1D', '1W', '1M', '1Y'].map((p) => (
                                            <button 
                                                key={p} 
                                                onClick={() => setPeriod(p as any)}
                                                className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${period === p ? 'bg-white dark:bg-gray-600 shadow text-black dark:text-white' : 'text-gray-400'}`}
                                            >
                                                {p}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <StockChart data={stock.history} color={color} period={period} />
                            </div>
                        </Card>
                    </div>

                    <div className="lg:col-span-1 space-y-4">
                        <Card className="flex flex-col h-full">
                            <div className="flex mb-4 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl">
                                <button onClick={() => setTab('buy')} className={`flex-1 py-3 rounded-lg font-bold text-sm transition-all ${tab === 'buy' ? 'bg-red-500 text-white shadow' : 'text-gray-500 hover:text-gray-700'}`}>매수 (Buy)</button>
                                <button onClick={() => setTab('sell')} className={`flex-1 py-3 rounded-lg font-bold text-sm transition-all ${tab === 'sell' ? 'bg-blue-500 text-white shadow' : 'text-gray-500 hover:text-gray-700'}`}>매도 (Sell)</button>
                            </div>

                            <div className="mb-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700">
                                <div className="flex justify-between text-xs text-gray-500 mb-1">
                                    <span>보유 수량</span>
                                    <span className="font-bold text-black dark:text-white text-sm">{myQty.toLocaleString()} 주</span>
                                </div>
                                <div className="flex justify-between text-xs text-gray-500 mb-1">
                                    <span>평균 단가</span>
                                    <span className="font-bold text-black dark:text-white text-sm">{fmt(myAvg)}</span>
                                </div>
                                <div className="flex justify-between text-xs text-gray-500">
                                    <span>평가 손익</span>
                                    <span className={`font-bold text-sm ${myProfit >= 0 ? 'text-red-500' : 'text-blue-500'}`}>
                                        {myProfit > 0 ? '+' : ''}{fmt(myProfit)} ({myRate.toFixed(2)}%)
                                    </span>
                                </div>
                            </div>

                            {renderOrderBook()}

                            <div className="space-y-3 flex-1">
                                <div className="flex border-b border-gray-200 dark:border-gray-700 mb-2">
                                    <button 
                                        onClick={() => setMode('market')} 
                                        className={`flex-1 py-2 text-sm font-bold border-b-2 transition-colors ${mode === 'market' ? 'border-black dark:border-white text-black dark:text-white' : 'border-transparent text-gray-400'}`}
                                    >
                                        시장가
                                    </button>
                                    <button 
                                        onClick={() => setMode('limit')} 
                                        className={`flex-1 py-2 text-sm font-bold border-b-2 transition-colors ${mode === 'limit' ? 'border-black dark:border-white text-black dark:text-white' : 'border-transparent text-gray-400'}`}
                                    >
                                        지정가
                                    </button>
                                </div>

                                {mode === 'limit' && (
                                    <div className="flex items-center gap-2">
                                        <Input type="number" value={priceInput} onChange={e => setPriceInput(e.target.value)} className="text-right font-bold" placeholder="가격" />
                                        <span className="text-xs font-bold whitespace-nowrap w-8">원</span>
                                    </div>
                                )}
                                
                                <div className="flex items-center gap-2">
                                    <Input type="number" value={qtyInput} onChange={e => setQtyInput(e.target.value)} className="text-right font-bold" placeholder="수량" />
                                    <span className="text-xs font-bold whitespace-nowrap w-8">주</span>
                                </div>

                                <div className="flex justify-between text-xs text-gray-500 px-1">
                                    <span>주문 총액</span>
                                    <span className="font-bold text-black dark:text-white">
                                        {fmt((parseInt(qtyInput)||0) * (mode==='market' ? currentPrice : (parseInt(priceInput)||0)))} 원
                                    </span>
                                </div>
                                
                                {tab === 'buy' && (
                                    <p className="text-xs text-right text-gray-400">가용: {fmt(user.balanceKRW)} 원</p>
                                )}
                            </div>

                            <Button 
                                onClick={handleOrder} 
                                className={`w-full py-4 text-lg mt-4 shadow-lg ${tab === 'buy' ? 'bg-red-600 hover:bg-red-500' : 'bg-blue-600 hover:bg-blue-500'}`}
                            >
                                {tab === 'buy' ? '현금 매수' : '현금 매도'}
                            </Button>
                        </Card>
                    </div>
                </div>
            ) : null}
        </div>
    );
};
