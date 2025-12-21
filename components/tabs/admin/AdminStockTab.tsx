
import React, { useState, useMemo, useEffect } from 'react';
import { useGame } from '../../../context/GameContext';
import { Card, Button, Input, Toggle, Modal } from '../../Shared';
import { Stock, User, Application } from '../../../types';

export const AdminStockTab: React.FC = () => {
    const { db, saveDb, showModal, showConfirm, showPinModal, currentUser, notify, updateStock } = useGame();
    
    const marketSettings = db.settings.stockMarket || { isOpen: true, openTime: "09:00", closeTime: "15:30", isManualOverride: false, sungSpiEnabled: true, sungSpiBasePoint: 1000, mode: 'simple' };
    const [openTime, setOpenTime] = useState(marketSettings.openTime);
    const [closeTime, setCloseTime] = useState(marketSettings.closeTime);
    const [manualOpen, setManualOpen] = useState(marketSettings.isOpen);
    const [manualOverride, setManualOverride] = useState(marketSettings.isManualOverride);
    const [marketMode, setMarketMode] = useState<'simple' | 'original'>(marketSettings.mode || 'simple');
    
    const [sungSpiOn, setSungSpiOn] = useState(marketSettings.sungSpiEnabled);
    const [sungSpiBase, setSungSpiBase] = useState(marketSettings.sungSpiBasePoint?.toString() || '1000');

    // IPO States
    const [ipoSearch, setIpoSearch] = useState('');
    const [selectedUserForIpo, setSelectedUserForIpo] = useState<User | null>(null);
    const [ipoPrice, setIpoPrice] = useState('');
    const [ipoShares, setIpoShares] = useState('');

    // Edit Stock States
    const [editingStock, setEditingStock] = useState<Stock | null>(null);
    const [editName, setEditName] = useState('');
    const [editShares, setEditShares] = useState('');

    const stocks = Object.values(db.stocks || {}) as Stock[];
    const potentialMarts = (Object.values(db.users) as User[])
        .filter(u => (u.type === 'mart' || u.type === 'citizen') && !stocks.find(s => s.id === u.id) && u.name.includes(ipoSearch))
        .slice(0, 5);

    const handleSaveMarketSettings = async () => {
        const newDb = { ...db };
        newDb.settings.stockMarket = {
            openTime,
            closeTime,
            isOpen: manualOpen,
            isManualOverride: manualOverride,
            sungSpiEnabled: sungSpiOn,
            sungSpiBasePoint: parseFloat(sungSpiBase) || 1000,
            mode: marketMode
        };
        await saveDb(newDb);
        showModal("주식 시장 설정이 저장되었습니다.");
    };

    const handleManualIPO = async () => {
        if (!selectedUserForIpo) return showModal("상장할 기업(유저)을 선택하세요.");
        const price = parseInt(ipoPrice);
        const shares = parseInt(ipoShares);
        
        if (isNaN(price) || price <= 0) return showModal("공모가를 입력하세요.");
        if (isNaN(shares) || shares <= 0) return showModal("발행 주식 수를 입력하세요.");

        if (!await showConfirm(`${selectedUserForIpo.name} 기업을 상장하시겠습니까?\n공모가: ₩${price.toLocaleString()}\n발행수: ${shares.toLocaleString()}주`)) return;

        const stockId = selectedUserForIpo.id || selectedUserForIpo.email!;
        const newStock: Stock = {
            id: stockId,
            name: selectedUserForIpo.customJob || selectedUserForIpo.name,
            currentPrice: price,
            openPrice: price,
            totalShares: shares,
            history: [{ date: new Date().toISOString(), price: price }],
            buyOrders: {},
            sellOrders: {}
        };

        const newDb = { ...db };
        if (!newDb.stocks) newDb.stocks = {};
        newDb.stocks[stockId] = newStock;
        
        await saveDb(newDb);
        notify('ALL', `[IPO] ${newStock.name} 기업이 신규 상장되었습니다! (시초가: ₩${price.toLocaleString()})`, true);
        showModal("상장 완료");
        
        setSelectedUserForIpo(null);
        setIpoPrice('');
        setIpoShares('');
        setIpoSearch('');
    };

    const openEditStock = (s: Stock) => {
        setEditingStock(s);
        setEditName(s.name);
        setEditShares(s.totalShares.toString());
    };

    const handleUpdateStock = async () => {
        if (!editingStock) return;
        const shares = parseInt(editShares);
        if (isNaN(shares) || shares <= 0) return showModal("유효한 주식 수를 입력하세요.");

        await updateStock(editingStock.id, {
            name: editName,
            totalShares: shares
        });
        showModal("종목 정보가 수정되었습니다.");
        setEditingStock(null);
    };

    const handleDelist = async () => {
        if (!editingStock) return;
        if (!await showConfirm(`정말 ${editingStock.name} 종목을 상장 폐지하시겠습니까? 보유자들의 주식은 휴지조각이 됩니다.`)) return;
        
        const newDb = { ...db };
        delete newDb.stocks![editingStock.id];
        
        // Remove from users holdings (optional cleanup, heavy op)
        Object.values(newDb.users).forEach((u: User) => {
            if (u.stockHoldings && u.stockHoldings[editingStock.id]) {
                delete u.stockHoldings[editingStock.id];
            }
        });

        await saveDb(newDb);
        showModal("상장 폐지되었습니다.");
        setEditingStock(null);
    };

    return (
        <div className="space-y-6">
            <h3 className="text-2xl font-bold mb-4">KRX (한국거래소) 통합 관제</h3>

            <Card className="border-t-4 border-blue-600">
                <div className="flex justify-between items-center mb-4">
                    <h4 className="font-bold text-lg">시장 운영 및 지수 설정</h4>
                    <Button onClick={handleSaveMarketSettings}>설정 저장</Button>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-3 bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                        <h5 className="font-bold text-sm text-gray-500">시장 운영 및 모드</h5>
                        <div className="flex gap-2 items-center">
                            <Input type="time" value={openTime} onChange={e => setOpenTime(e.target.value)} />
                            <span>~</span>
                            <Input type="time" value={closeTime} onChange={e => setCloseTime(e.target.value)} />
                        </div>
                        <div className="flex justify-between items-center mt-2">
                            <span className="text-sm">주식 시장 오리지널 모드</span>
                            <Toggle checked={marketMode === 'original'} onChange={v => setMarketMode(v ? 'original' : 'simple')} />
                        </div>
                        <p className="text-[10px] text-gray-500">* 오리지널 모드: 실시간 호가 기반 체결 (매수/매도 물량 대조)</p>
                        <div className="flex justify-between items-center mt-2">
                            <span className="text-sm">수동 개폐 모드</span>
                            <Toggle checked={manualOverride} onChange={setManualOverride} />
                        </div>
                        {manualOverride && (
                            <div className="flex justify-between items-center mt-1 pl-2 border-l-2 border-blue-500">
                                <span className="text-sm font-bold text-blue-600">현재 시장 상태</span>
                                <div className="flex gap-2">
                                    <button onClick={() => setManualOpen(true)} className={`px-3 py-1 rounded text-xs ${manualOpen ? 'bg-green-600 text-white' : 'bg-gray-200'}`}>OPEN</button>
                                    <button onClick={() => setManualOpen(false)} className={`px-3 py-1 rounded text-xs ${!manualOpen ? 'bg-red-600 text-white' : 'bg-gray-200'}`}>CLOSE</button>
                                </div>
                            </div>
                        )}
                    </div>
                    
                    <div className="space-y-3 bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                        <h5 className="font-bold text-sm text-gray-500">Sung-SPI (지수) 설정</h5>
                        <div className="flex justify-between items-center">
                            <span className="text-sm">지수 산출 활성화</span>
                            <Toggle checked={sungSpiOn} onChange={setSungSpiOn} />
                        </div>
                        <div>
                            <label className="text-xs font-bold block mb-1">기준 포인트 (Base Point)</label>
                            <Input type="number" value={sungSpiBase} onChange={e => setSungSpiBase(e.target.value)} />
                        </div>
                    </div>
                </div>
            </Card>

            <Card className="border-t-4 border-purple-600">
                <h4 className="font-bold text-lg mb-4">기업 수동 상장 (IPO)</h4>
                <div className="space-y-4">
                    <div className="relative">
                        <label className="text-xs font-bold block mb-1">상장 대상 검색 (마트/시민)</label>
                        <Input placeholder="이름 검색..." value={ipoSearch} onChange={e => { setIpoSearch(e.target.value); setSelectedUserForIpo(null); }} />
                        {ipoSearch && !selectedUserForIpo && (
                            <div className="absolute z-10 w-full bg-white dark:bg-[#2D2D2D] border dark:border-gray-600 rounded-md mt-1 shadow-lg max-h-40 overflow-y-auto">
                                {potentialMarts.map(u => (
                                    <div key={u.name} className="p-3 hover:bg-gray-100 dark:hover:bg-gray-600 cursor-pointer" onClick={() => { setSelectedUserForIpo(u); setIpoSearch(u.name); }}>
                                        {u.name} {u.customJob && `(${u.customJob})`}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    {selectedUserForIpo && (
                        <div className="p-3 bg-purple-50 dark:bg-purple-900/30 rounded border border-purple-200">
                            <span className="font-bold text-purple-700 dark:text-purple-400">선택됨: {selectedUserForIpo.name}</span>
                        </div>
                    )}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs font-bold block mb-1">공모가 (1주당)</label>
                            <Input type="number" value={ipoPrice} onChange={e => setIpoPrice(e.target.value)} placeholder="₩" />
                        </div>
                        <div>
                            <label className="text-xs font-bold block mb-1">발행 주식 수</label>
                            <Input type="number" value={ipoShares} onChange={e => setIpoShares(e.target.value)} placeholder="주" />
                        </div>
                    </div>
                    <Button onClick={handleManualIPO} className="w-full bg-purple-600 hover:bg-purple-500">기업 상장 실행</Button>
                </div>
            </Card>

            <Card className="border-t-4 border-gray-600">
                <h4 className="font-bold text-lg mb-4">상장 종목 관리</h4>
                <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
                    {stocks.length === 0 && <p className="text-center text-gray-500 py-4">상장된 종목이 없습니다.</p>}
                    {stocks.map(s => (
                        <div key={s.id} className="flex justify-between items-center p-3 bg-white dark:bg-gray-800 border rounded shadow-sm">
                            <div>
                                <p className="font-bold">{s.name}</p>
                                <p className="text-xs text-gray-500">현재가: ₩{s.currentPrice.toLocaleString()} | 총 {s.totalShares.toLocaleString()}주</p>
                            </div>
                            <Button onClick={() => openEditStock(s)} className="text-xs py-1 px-3" variant="secondary">수정/관리</Button>
                        </div>
                    ))}
                </div>
            </Card>

            <Modal isOpen={!!editingStock} onClose={() => setEditingStock(null)} title="종목 수정">
                {editingStock && (
                    <div className="space-y-4">
                        <div>
                            <label className="text-sm font-bold block mb-1">종목명</label>
                            <Input value={editName} onChange={e => setEditName(e.target.value)} />
                        </div>
                        <div>
                            <label className="text-sm font-bold block mb-1">총 발행 주식 수</label>
                            <Input type="number" value={editShares} onChange={e => setEditShares(e.target.value)} />
                            <p className="text-xs text-gray-500 mt-1">주식 수를 늘리면 유상증자 효과가 있습니다 (기존 주주 비율 희석).</p>
                        </div>
                        <div className="flex gap-2 pt-4">
                            <Button onClick={handleUpdateStock} className="flex-1">수정 저장</Button>
                            <Button onClick={handleDelist} variant="danger" className="flex-1">상장 폐지</Button>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
};
