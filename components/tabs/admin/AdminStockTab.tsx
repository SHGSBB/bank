

import React, { useState, useMemo, useEffect } from 'react';
import { useGame } from '../../../context/GameContext';
import { Card, Button, Input, Toggle } from '../../Shared';
import { Stock, User, Application } from '../../../types';

export const AdminStockTab: React.FC = () => {
    const { db, saveDb, showModal, showConfirm, showPinModal, currentUser, notify } = useGame();
    
    // Market Control
    const marketSettings = db.settings.stockMarket || { isOpen: true, openTime: "09:00", closeTime: "15:30", isManualOverride: false, sungSpiEnabled: true, sungSpiBasePoint: 1000 };
    const [openTime, setOpenTime] = useState(marketSettings.openTime);
    const [closeTime, setCloseTime] = useState(marketSettings.closeTime);
    const [manualOpen, setManualOpen] = useState(marketSettings.isOpen);
    const [manualOverride, setManualOverride] = useState(marketSettings.isManualOverride);
    
    const [sungSpiOn, setSungSpiOn] = useState(marketSettings.sungSpiEnabled);
    const [sungSpiBase, setSungSpiBase] = useState(marketSettings.sungSpiBasePoint?.toString() || '1000');

    // IPO
    const [searchUser, setSearchUser] = useState('');
    const [selectedCorp, setSelectedCorp] = useState<User | null>(null);
    const [ipoPrice, setIpoPrice] = useState('5000');
    const [ipoShares, setIpoShares] = useState('10000');
    
    // Edit Stock
    const [editStockId, setEditStockId] = useState<string>('');
    const [editName, setEditName] = useState('');
    const [editPrice, setEditPrice] = useState('');
    const [editShares, setEditShares] = useState('');

    // List of Stocks
    const stocks = Object.values(db.stocks || {}) as Stock[];

    useEffect(() => {
        if (editStockId && db.stocks?.[editStockId]) {
            const s = db.stocks[editStockId];
            setEditName(s.name);
            setEditPrice(s.currentPrice.toString());
            setEditShares(s.totalShares.toString());
        }
    }, [editStockId]);

    const handleSaveMarketSettings = async () => {
        const newDb = { ...db };
        newDb.settings.stockMarket = {
            openTime,
            closeTime,
            isOpen: manualOpen,
            isManualOverride: manualOverride,
            sungSpiEnabled: sungSpiOn,
            sungSpiBasePoint: parseFloat(sungSpiBase) || 1000
        };
        await saveDb(newDb);
        showModal("주식 시장 및 SungSPI 설정이 저장되었습니다.");
    };

    const handleSearchCorp = () => {
        const users = Object.values(db.users) as User[];
        const found = users.find(u => u.name === searchUser && u.type === 'mart');
        if (found) {
            setSelectedCorp(found);
        } else {
            showModal("일치하는 사업자(마트)를 찾을 수 없습니다.");
            setSelectedCorp(null);
        }
    };

    const handleForceIPO = async () => {
        if (!selectedCorp) return;
        const price = parseInt(ipoPrice);
        const shares = parseInt(ipoShares);
        
        if (isNaN(price) || isNaN(shares)) return showModal("올바른 숫자 값을 입력하세요.");
        if (db.stocks?.[selectedCorp.id!]) return showModal("이미 상장된 기업입니다.");

        const stockId = selectedCorp.id!; // Use User ID as Stock ID
        const newStock: Stock = {
            id: stockId,
            name: selectedCorp.customJob || selectedCorp.name, // Store Name
            currentPrice: price,
            openPrice: price,
            totalShares: shares,
            history: [{ date: new Date().toISOString(), price }]
        };

        const newDb = { ...db };
        newDb.stocks = { ...(newDb.stocks || {}), [stockId]: newStock };
        
        const ownerShares = Math.floor(shares * 0.5);
        if(!newDb.users[selectedCorp.name].stockHoldings) newDb.users[selectedCorp.name].stockHoldings = {};
        newDb.users[selectedCorp.name].stockHoldings[stockId] = { quantity: ownerShares, averagePrice: 0 }; 

        const bankShares = shares - ownerShares;
        if(!newDb.users['한국은행'].stockHoldings) newDb.users['한국은행'].stockHoldings = {};
        newDb.users['한국은행'].stockHoldings[stockId] = { quantity: bankShares, averagePrice: price };

        await saveDb(newDb);
        notify(selectedCorp.name, `축하합니다! 당신의 기업이 주식 시장에 상장되었습니다. (공모가: ₩${price.toLocaleString()})`, true);
        showModal(`기업 '${newStock.name}' 직권 상장 완료.`);
        setSelectedCorp(null);
        setSearchUser('');
    };

    const handleEditStock = async () => {
        if (!editStockId || !db.stocks?.[editStockId]) return;
        const price = parseInt(editPrice);
        const shares = parseInt(editShares);
        
        if (isNaN(price) || isNaN(shares)) return showModal("올바른 값을 입력하세요.");

        const newDb = { ...db };
        const s = newDb.stocks![editStockId];
        s.name = editName;
        s.currentPrice = price;
        s.totalShares = shares;
        
        await saveDb(newDb);
        showModal("종목 정보가 수정되었습니다.");
    };

    const handleDeleteStock = async () => {
        if (!editStockId) return;
        if (!await showConfirm("정말 상장 폐지하시겠습니까? 보유자들의 주식은 휴지조각이 됩니다.")) return;
        
        const newDb = { ...db };
        delete newDb.stocks![editStockId];
        
        // Remove holdings (Optional, clean up DB)
        Object.values(newDb.users).forEach((u: User) => {
            if (u.stockHoldings && u.stockHoldings[editStockId]) {
                delete u.stockHoldings[editStockId];
            }
        });

        await saveDb(newDb);
        setEditStockId('');
        showModal("상장 폐지되었습니다.");
    };

    return (
        <div className="space-y-6">
            <h3 className="text-2xl font-bold mb-4">KRX (한국거래소) 통합 관제</h3>

            {/* Market Control Panel */}
            <Card className="border-t-4 border-blue-600">
                <div className="flex justify-between items-center mb-4">
                    <h4 className="font-bold text-lg">시장 운영 및 지수 설정</h4>
                    <Button onClick={handleSaveMarketSettings}>설정 저장</Button>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-3 bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                        <h5 className="font-bold text-sm text-gray-500">시장 운영 시간</h5>
                        <div className="flex gap-2 items-center">
                            <Input type="time" value={openTime} onChange={e => setOpenTime(e.target.value)} />
                            <span>~</span>
                            <Input type="time" value={closeTime} onChange={e => setCloseTime(e.target.value)} />
                        </div>
                        <div className="flex justify-between items-center mt-2">
                            <span className="text-sm">수동 개폐 모드</span>
                            <Toggle checked={manualOverride} onChange={setManualOverride} />
                        </div>
                        {manualOverride && (
                            <div className="flex justify-between items-center">
                                <span className="text-sm font-bold">강제 개장</span>
                                <Toggle checked={manualOpen} onChange={setManualOpen} />
                            </div>
                        )}
                    </div>

                    <div className="space-y-3 bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                        <h5 className="font-bold text-sm text-gray-500">Sung-SPI (종합주가지수)</h5>
                        <div className="flex justify-between items-center">
                            <span className="text-sm">지수 표시 활성화</span>
                            <Toggle checked={!!sungSpiOn} onChange={setSungSpiOn} />
                        </div>
                        <div>
                            <label className="text-xs block mb-1">기준 포인트 (Base Point)</label>
                            <Input type="number" value={sungSpiBase} onChange={e => setSungSpiBase(e.target.value)} />
                        </div>
                    </div>
                </div>
            </Card>

            <Card className="border-t-4 border-purple-600">
                <h4 className="font-bold text-lg mb-4">기업 직권 상장 (Force IPO)</h4>
                <div className="space-y-4">
                    <div className="flex gap-2">
                        <Input placeholder="사업자 이름 검색 (User Name)" value={searchUser} onChange={e => setSearchUser(e.target.value)} />
                        <Button onClick={handleSearchCorp}>검색</Button>
                    </div>
                    {selectedCorp && (
                        <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-lg">
                            <p className="font-bold mb-2 text-purple-700 dark:text-purple-300">대상: {selectedCorp.name} ({selectedCorp.customJob || '상호명 미설정'})</p>
                            <div className="grid grid-cols-2 gap-4 mb-4">
                                <div>
                                    <label className="text-xs font-bold">공모가 (1주당)</label>
                                    <Input type="number" value={ipoPrice} onChange={e => setIpoPrice(e.target.value)} />
                                </div>
                                <div>
                                    <label className="text-xs font-bold">총 발행 주식수</label>
                                    <Input type="number" value={ipoShares} onChange={e => setIpoShares(e.target.value)} />
                                </div>
                            </div>
                            <Button onClick={handleForceIPO} className="w-full bg-purple-600 hover:bg-purple-500">상장 집행</Button>
                        </div>
                    )}
                </div>
            </Card>

            <Card className="border-t-4 border-green-600">
                <h4 className="font-bold text-lg mb-4">종목 관리 / 수정</h4>
                <div className="space-y-4">
                    <select value={editStockId} onChange={e => setEditStockId(e.target.value)} className="w-full p-3 rounded border bg-white dark:bg-[#2D2D2D]">
                        <option value="">종목 선택</option>
                        {stocks.map(s => <option key={s.id} value={s.id}>{s.name} ({s.id})</option>)}
                    </select>
                    
                    {editStockId && (
                        <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg space-y-3">
                            <div><label className="text-xs block mb-1">종목명</label><Input value={editName} onChange={e => setEditName(e.target.value)} /></div>
                            <div><label className="text-xs block mb-1">현재가</label><Input type="number" value={editPrice} onChange={e => setEditPrice(e.target.value)} /></div>
                            <div><label className="text-xs block mb-1">총 발행량</label><Input type="number" value={editShares} onChange={e => setEditShares(e.target.value)} /></div>
                            <div className="flex gap-2 pt-2">
                                <Button onClick={handleEditStock} className="flex-1">수정 저장</Button>
                                <Button onClick={handleDeleteStock} variant="danger" className="flex-1">상장 폐지</Button>
                            </div>
                        </div>
                    )}
                </div>
            </Card>

            {/* KRX Dashboard Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {stocks.map(stock => {
                    const change = stock.currentPrice - stock.openPrice;
                    const changeRate = ((change / stock.openPrice) * 100).toFixed(2);
                    const isUp = change >= 0;
                    const colorClass = isUp ? 'text-red-500' : 'text-blue-500';
                    const bgClass = isUp ? 'bg-red-50 dark:bg-red-900/10' : 'bg-blue-50 dark:bg-blue-900/10';

                    return (
                        <div key={stock.id} className={`p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm ${bgClass} relative overflow-hidden group`}>
                            <div className="flex justify-between items-start mb-2 relative z-10">
                                <h5 className="font-bold text-lg truncate">{stock.name}</h5>
                                <span className="text-xs bg-white/50 px-2 py-1 rounded">{stock.id}</span>
                            </div>
                            <div className="relative z-10">
                                <p className={`text-2xl font-bold ${colorClass}`}>
                                    {stock.currentPrice.toLocaleString()}
                                </p>
                                <p className={`text-sm font-bold ${colorClass}`}>
                                    {isUp ? '▲' : '▼'} {Math.abs(change).toLocaleString()} ({changeRate}%)
                                </p>
                            </div>
                            <div className="mt-4 pt-2 border-t border-gray-300 dark:border-gray-600 flex justify-between text-xs text-gray-500 relative z-10">
                                <span>시총: {(stock.currentPrice * stock.totalShares / 100000000).toFixed(1)}억</span>
                                <span>주식수: {stock.totalShares.toLocaleString()}</span>
                            </div>
                            
                            {/* Mini Chart Background Simulation */}
                            <div className="absolute bottom-0 left-0 w-full h-16 opacity-20 pointer-events-none">
                                <svg viewBox="0 0 100 20" className="w-full h-full" preserveAspectRatio="none">
                                    <polyline 
                                        fill="none" 
                                        stroke={isUp ? 'red' : 'blue'} 
                                        strokeWidth="2"
                                        points={stock.history.slice(-20).map((h, i) => `${i * 5},${20 - (h.price / stock.currentPrice * 10)}`).join(' ')}
                                    />
                                </svg>
                            </div>
                        </div>
                    );
                })}
                {stocks.length === 0 && <div className="col-span-full text-center py-20 text-gray-500">상장된 종목이 없습니다.</div>}
            </div>
        </div>
    );
};
