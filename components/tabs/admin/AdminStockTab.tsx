
import React, { useState, useMemo, useEffect } from 'react';
import { useGame } from '../../../context/GameContext';
import { Card, Button, Input, Toggle, Modal } from '../../Shared';
import { Stock, User, Application } from '../../../types';
import { ref, remove } from 'firebase/database';
import { database } from '../../../services/firebase';

export const AdminStockTab: React.FC = () => {
    const { db, saveDb, showModal, showConfirm, currentUser, notify, updateStock, refreshData } = useGame();
    
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
    const [selectedIpoApp, setSelectedIpoApp] = useState<Application | null>(null);
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
            mode: marketMode
        };
        await saveDb(newDb);
        showModal("주식 시장 설정이 저장되었습니다.");
    };

    const selectIpoRequest = (app: Application) => {
        const user = Object.values(db.users).find((u: any) => u.name === app.applicantName) as User;
        if (!user) return showModal("사용자를 찾을 수 없습니다.");
        setSelectedUserForIpo(user);
        setSelectedIpoApp(app);
        setIpoSearch(user.name);
    };

    const handleApproveIPO = async () => {
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
        
        // Remove pending application
        if (selectedIpoApp) {
            if (newDb.pendingApplications) delete newDb.pendingApplications[selectedIpoApp.id];
        } else {
            // Manual IPO - Check if any pending exists anyway to clean up
            const pending = Object.entries(newDb.pendingApplications || {}).find(([k, v]) => (v as Application).applicantName === selectedUserForIpo.name && (v as Application).type === 'ipo');
            if (pending) delete newDb.pendingApplications![pending[0]];
        }
        
        await saveDb(newDb);
        notify('ALL', `[IPO] ${newStock.name} 기업이 신규 상장되었습니다! (시초가: ₩${price.toLocaleString()})`, true);
        showModal("상장 완료");
        
        setSelectedUserForIpo(null);
        setSelectedIpoApp(null);
        setIpoPrice('');
        setIpoShares('');
        setIpoSearch('');
    };

    const handleRejectIPO = async () => {
        if (!selectedIpoApp) return;
        if (!await showConfirm("상장 요청을 거절하시겠습니까?")) return;
        
        await remove(ref(database, `pendingApplications/${selectedIpoApp.id}`));
        notify(selectedIpoApp.applicantName, "기업 상장 심사가 거절되었습니다.", true);
        
        setSelectedUserForIpo(null);
        setSelectedIpoApp(null);
        setIpoPrice('');
        setIpoShares('');
        setIpoSearch('');
    };

    return (
        <div className="space-y-6">
            <h3 className="text-2xl font-bold mb-4">KRX (한국거래소) 통합 관제</h3>
            
            <Card className="border-t-4 border-purple-600">
                <h4 className="font-bold text-lg mb-4">기업 상장 심사 (IPO)</h4>
                
                {pendingIpos.length > 0 && (
                    <div className="mb-6 p-3 bg-purple-50 dark:bg-purple-900/20 rounded-xl border border-purple-200">
                        <p className="text-sm font-bold text-purple-700 mb-2">심사 대기 목록 ({pendingIpos.length})</p>
                        <div className="space-y-2">
                            {pendingIpos.map(app => (
                                <div key={app.id} className="flex justify-between items-center bg-white dark:bg-gray-800 p-2 rounded border cursor-pointer hover:bg-gray-100" onClick={() => selectIpoRequest(app)}>
                                    <span className="text-sm">{app.applicantName}</span>
                                    <span className="text-xs text-gray-500">{new Date(app.requestedDate).toLocaleDateString()} 요청</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div className="space-y-4">
                    <div className="relative">
                        <label className="text-xs font-bold block mb-1">상장 대상 선택</label>
                        <Input placeholder="이름 검색 또는 목록 선택..." value={ipoSearch} onChange={e => { setIpoSearch(e.target.value); setSelectedUserForIpo(null); setSelectedIpoApp(null); }} />
                    </div>
                    {selectedUserForIpo && (
                        <div className="p-3 bg-purple-50 dark:bg-purple-900/30 rounded border border-purple-200">
                            <span className="font-bold text-purple-700 dark:text-purple-400">심사 중: {selectedUserForIpo.name}</span>
                            {selectedUserForIpo.customJob && <p className="text-xs">상호명: {selectedUserForIpo.customJob}</p>}
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
                    <div className="flex gap-2">
                        <Button onClick={handleApproveIPO} className="flex-1 bg-purple-600 hover:bg-purple-500">상장 승인</Button>
                        {selectedIpoApp && <Button onClick={handleRejectIPO} variant="danger" className="flex-1">거절</Button>}
                    </div>
                </div>
            </Card>
            
            <Card>
                <h4 className="font-bold mb-4">시장 운영 설정</h4>
                <div className="space-y-4">
                    <div className="flex justify-between items-center bg-gray-50 dark:bg-gray-800 p-3 rounded">
                        <div><span className="block font-bold text-sm">시장 개장 (Manual Override)</span><span className="text-xs text-gray-500">자동 개폐 무시하고 강제 설정</span></div>
                        <div className="flex gap-2 items-center">
                            <span className="text-xs font-bold">강제조작:</span>
                            <Toggle checked={manualOverride} onChange={setManualOverride} />
                            {manualOverride && <Toggle checked={manualOpen} onChange={setManualOpen} />}
                        </div>
                    </div>
                    <div className="flex justify-between items-center bg-gray-50 dark:bg-gray-800 p-3 rounded">
                        <div><span className="block font-bold text-sm">거래 모드</span></div>
                        <div className="flex gap-2">
                            <button onClick={() => setMarketMode('simple')} className={`text-xs px-2 py-1 rounded ${marketMode==='simple'?'bg-blue-600 text-white':'bg-gray-200'}`}>간편(즉시체결)</button>
                            <button onClick={() => setMarketMode('original')} className={`text-xs px-2 py-1 rounded ${marketMode==='original'?'bg-blue-600 text-white':'bg-gray-200'}`}>오리지널(호가)</button>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div><label className="text-xs font-bold">개장 시간</label><Input type="time" value={openTime} onChange={e => setOpenTime(e.target.value)} /></div>
                        <div><label className="text-xs font-bold">폐장 시간</label><Input type="time" value={closeTime} onChange={e => setCloseTime(e.target.value)} /></div>
                    </div>
                    
                    <div className="border-t pt-4">
                        <div className="flex justify-between items-center mb-2">
                            <span className="font-bold text-sm">성스피(SungSPI) 지수 산출</span>
                            <Toggle checked={sungSpiOn} onChange={setSungSpiOn} />
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-xs">기준 포인트:</span>
                            <Input type="number" value={sungSpiBase} onChange={e => setSungSpiBase(e.target.value)} className="w-24 py-1" />
                        </div>
                    </div>

                    <Button onClick={handleSaveMarketSettings} className="w-full">설정 저장</Button>
                </div>
            </Card>
        </div>
    );
};
