
import React, { useState, useMemo, useEffect } from 'react';
import { useGame } from '../../../context/GameContext';
import { Card, Button, Input, Toggle, Modal } from '../../Shared';
import { Stock, User, Application } from '../../../types';
import { ref, remove } from 'firebase/database';
import { database } from '../../../services/firebase';

export const AdminStockTab: React.FC = () => {
    const { db, saveDb, showModal, showConfirm, notify, updateStock, refreshData } = useGame();
    
    // Market Settings
    const marketSettings = db.settings.stockMarket || { 
        isOpen: true, 
        openTime: "09:00", 
        closeTime: "15:30", 
        isManualOverride: false, 
        sungSpiEnabled: true, 
        sungSpiBasePoint: 1000, 
        mode: 'simple' 
    };

    const [openTime, setOpenTime] = useState(marketSettings.openTime);
    const [closeTime, setCloseTime] = useState(marketSettings.closeTime);
    const [manualOpen, setManualOpen] = useState(marketSettings.isOpen);
    const [manualOverride, setManualOverride] = useState(marketSettings.isManualOverride);
    const [marketModeOriginal, setMarketModeOriginal] = useState(marketSettings.mode === 'original');
    
    // SungSPI Settings
    const [sungSpiOn, setSungSpiOn] = useState(marketSettings.sungSpiEnabled);
    const [sungSpiBase, setSungSpiBase] = useState(marketSettings.sungSpiBasePoint?.toString() || '1000');

    // IPO & Stock Management
    const [activeSection, setActiveSection] = useState<'settings' | 'ipo' | 'stocks'>('settings');
    
    // IPO Manual
    const [ipoSearch, setIpoSearch] = useState('');
    const [selectedUserForIpo, setSelectedUserForIpo] = useState<User | null>(null);
    const [ipoPrice, setIpoPrice] = useState('');
    const [ipoShares, setIpoShares] = useState('');

    const stocks = Object.values(db.stocks || {}) as Stock[];
    const pendingIpos = (Object.values(db.pendingApplications || {}) as Application[]).filter(a => a.type === 'ipo' && a.status === 'pending');

    useEffect(() => { refreshData(); }, []);

    const handleSaveMarketSettings = async () => {
        const newDb = { ...db };
        newDb.settings.stockMarket = {
            openTime,
            closeTime,
            isOpen: manualOpen,
            isManualOverride: manualOverride,
            sungSpiEnabled: sungSpiOn,
            sungSpiBasePoint: parseFloat(sungSpiBase) || 1000,
            mode: marketModeOriginal ? 'original' : 'simple'
        };
        await saveDb(newDb);
        showModal("주식 시장 및 지수 설정이 저장되었습니다.");
    };

    const handleApprovePendingIPO = async (app: Application) => {
        const user = Object.values(db.users).find((u: any) => u.name === app.applicantName) as User;
        if (!user) return showModal("신청자를 찾을 수 없습니다.");
        
        setSelectedUserForIpo(user);
        setIpoSearch(user.name);
        setActiveSection('ipo');
        // Pre-fill if app has data (currently apps don't have price/shares, admin sets them)
        // If app structure changes to include proposed price, set it here.
    };

    const handleManualIPO = async () => {
        if (!selectedUserForIpo) return showModal("상장할 기업(유저)을 선택하세요.");
        const price = parseInt(ipoPrice);
        const shares = parseInt(ipoShares);
        
        if (isNaN(price) || price <= 0) return showModal("공모가를 입력하세요.");
        if (isNaN(shares) || shares <= 0) return showModal("발행 주식 수를 입력하세요.");

        if (!await showConfirm(`${selectedUserForIpo.name} 기업을 상장 승인하시겠습니까?\n공모가: ₩${price.toLocaleString()}\n발행수: ${shares.toLocaleString()}주`)) return;

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
        
        // Remove related pending application if exists
        const pending = (Object.entries(newDb.pendingApplications || {}) as [string, Application][]).find(([k, v]) => v.applicantName === selectedUserForIpo.name && v.type === 'ipo');
        if (pending) delete newDb.pendingApplications![pending[0]];
        
        await saveDb(newDb);
        notify('ALL', `[IPO] ${newStock.name} 기업이 신규 상장되었습니다! (시초가: ₩${price.toLocaleString()})`, true);
        showModal("상장 완료");
        
        setSelectedUserForIpo(null);
        setIpoPrice('');
        setIpoShares('');
        setIpoSearch('');
    };

    const handleDelist = async (stockId: string) => {
        if (!await showConfirm("정말 상장 폐지하시겠습니까? 모든 주식 데이터가 삭제됩니다.")) return;
        const newDb = { ...db };
        if (newDb.stocks) delete newDb.stocks[stockId];
        await saveDb(newDb);
        showModal("상장 폐지되었습니다.");
    };

    return (
        <div className="space-y-6">
            <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700 pb-1 overflow-x-auto">
                {[{id:'settings', label:'시장 운영/지수'}, {id:'ipo', label:'IPO (상장)'}, {id:'stocks', label:'상장 종목 관리'}].map(t => (
                    <button key={t.id} onClick={() => setActiveSection(t.id as any)} className={`px-4 py-2 font-bold whitespace-nowrap border-b-2 transition-colors ${activeSection === t.id ? 'border-purple-500 text-purple-600' : 'border-transparent text-gray-500'}`}>{t.label}</button>
                ))}
            </div>

            {activeSection === 'settings' && (
                <Card>
                    <h4 className="font-bold text-lg mb-4">시장 운영 및 지수 설정</h4>
                    <div className="space-y-6">
                        <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
                            <h5 className="font-bold mb-3 border-b pb-2">운영 시간 및 모드</h5>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                                <div><label className="text-xs font-bold block mb-1">개장 시간</label><Input type="time" value={openTime} onChange={e => setOpenTime(e.target.value)} /></div>
                                <div><label className="text-xs font-bold block mb-1">폐장 시간</label><Input type="time" value={closeTime} onChange={e => setCloseTime(e.target.value)} /></div>
                            </div>
                            <div className="flex justify-between items-center mb-2">
                                <div><span className="block font-bold text-sm">오리지널 모드 (호가창)</span><span className="text-xs text-gray-500">실시간 매칭 체결 사용</span></div>
                                <Toggle checked={marketModeOriginal} onChange={setMarketModeOriginal} />
                            </div>
                            <div className="flex justify-between items-center">
                                <div><span className="block font-bold text-sm">수동 개폐 모드 (Manual Override)</span><span className="text-xs text-gray-500">시간 무관 강제 제어</span></div>
                                <Toggle checked={manualOverride} onChange={setManualOverride} />
                            </div>
                            {manualOverride && (
                                <div className="mt-2 flex items-center justify-between bg-yellow-50 p-2 rounded">
                                    <span className="text-sm font-bold text-yellow-700">현재 상태: {manualOpen ? '개장 (OPEN)' : '폐장 (CLOSED)'}</span>
                                    <Toggle checked={manualOpen} onChange={setManualOpen} />
                                </div>
                            )}
                        </div>

                        <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
                            <h5 className="font-bold mb-3 border-b pb-2 text-blue-700 dark:text-blue-300">SungSPI 지수 설정</h5>
                            <div className="flex justify-between items-center mb-4">
                                <span className="font-bold text-sm">지수 산출 활성화</span>
                                <Toggle checked={sungSpiOn} onChange={setSungSpiOn} />
                            </div>
                            <div>
                                <label className="text-xs font-bold block mb-1">기준 포인트 (Base Point)</label>
                                <Input type="number" value={sungSpiBase} onChange={e => setSungSpiBase(e.target.value)} placeholder="1000" />
                                <p className="text-[10px] text-gray-500 mt-1">* 시가총액 합계를 나눌 기준값입니다.</p>
                            </div>
                        </div>
                        
                        <Button onClick={handleSaveMarketSettings} className="w-full">설정 저장</Button>
                    </div>
                </Card>
            )}

            {activeSection === 'ipo' && (
                <div className="space-y-6">
                    {pendingIpos.length > 0 && (
                        <Card className="border-l-4 border-orange-500">
                            <h4 className="font-bold text-lg mb-3 text-orange-600">상장 심사 대기 ({pendingIpos.length})</h4>
                            <div className="space-y-2">
                                {pendingIpos.map(app => (
                                    <div key={app.id} className="flex justify-between items-center bg-white dark:bg-gray-800 p-3 rounded-lg border shadow-sm">
                                        <div>
                                            <p className="font-bold">{app.applicantName}</p>
                                            <p className="text-xs text-gray-500">{new Date(app.requestedDate).toLocaleDateString()} 요청</p>
                                        </div>
                                        <Button onClick={() => handleApprovePendingIPO(app)} className="text-xs">심사하기</Button>
                                    </div>
                                ))}
                            </div>
                        </Card>
                    )}

                    <Card>
                        <h4 className="font-bold text-lg mb-4">기업 수동 상장 (IPO)</h4>
                        <div className="space-y-4">
                            <div className="relative">
                                <label className="text-xs font-bold block mb-1">상장 대상 검색</label>
                                <Input placeholder="이름 입력..." value={ipoSearch} onChange={e => { setIpoSearch(e.target.value); setSelectedUserForIpo(null); }} />
                                {ipoSearch && !selectedUserForIpo && (
                                    <div className="absolute z-10 w-full bg-white dark:bg-[#2D2D2D] border dark:border-gray-600 rounded-md mt-1 shadow-lg max-h-40 overflow-y-auto">
                                        {(Object.values(db.users) as User[])
                                            .filter(u => (u.name || '').includes(ipoSearch) && u.type === 'mart')
                                            .map(u => (
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
                                <div><label className="text-xs font-bold block mb-1">공모가 (1주당)</label><Input type="number" value={ipoPrice} onChange={e => setIpoPrice(e.target.value)} placeholder="₩" /></div>
                                <div><label className="text-xs font-bold block mb-1">발행 주식 수</label><Input type="number" value={ipoShares} onChange={e => setIpoShares(e.target.value)} placeholder="주" /></div>
                            </div>
                            <Button onClick={handleManualIPO} className="w-full bg-purple-600 hover:bg-purple-500">상장 실행</Button>
                        </div>
                    </Card>
                </div>
            )}

            {activeSection === 'stocks' && (
                <Card>
                    <h4 className="font-bold text-lg mb-4">상장 종목 관리</h4>
                    {stocks.length === 0 ? <p className="text-gray-500 py-4 text-center">상장된 종목이 없습니다.</p> :
                    <div className="space-y-2">
                        {stocks.map(s => (
                            <div key={s.id} className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                                <div>
                                    <p className="font-bold">{s.name}</p>
                                    <p className="text-xs text-gray-500">현재가: ₩{s.currentPrice.toLocaleString()} | 총발행: {s.totalShares}주</p>
                                </div>
                                <Button variant="danger" className="text-xs py-1 px-3" onClick={() => handleDelist(s.id)}>상장폐지</Button>
                            </div>
                        ))}
                    </div>}
                </Card>
            )}
        </div>
    );
};
