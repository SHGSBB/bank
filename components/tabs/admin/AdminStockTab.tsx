
import React, { useState, useMemo, useEffect } from 'react';
import { useGame } from '../../../context/GameContext';
import { Card, Button, Input, Toggle } from '../../Shared';
import { Stock, User, Application } from '../../../types';

export const AdminStockTab: React.FC = () => {
    const { db, saveDb, showModal, showConfirm, showPinModal, currentUser, notify } = useGame();
    
    const marketSettings = db.settings.stockMarket || { isOpen: true, openTime: "09:00", closeTime: "15:30", isManualOverride: false, sungSpiEnabled: true, sungSpiBasePoint: 1000, mode: 'simple' };
    const [openTime, setOpenTime] = useState(marketSettings.openTime);
    const [closeTime, setCloseTime] = useState(marketSettings.closeTime);
    const [manualOpen, setManualOpen] = useState(marketSettings.isOpen);
    const [manualOverride, setManualOverride] = useState(marketSettings.isManualOverride);
    const [marketMode, setMarketMode] = useState<'simple' | 'original'>(marketSettings.mode || 'simple');
    
    const [sungSpiOn, setSungSpiOn] = useState(marketSettings.sungSpiEnabled);
    const [sungSpiBase, setSungSpiBase] = useState(marketSettings.sungSpiBasePoint?.toString() || '1000');

    // ... (rest of the file remains similar, ensuring Toggle for marketMode is present) ...
    // Note: Re-implementing just the settings card part to ensure 'Original Mode' toggle is there.

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
                    </div>
                    {/* ... other settings ... */}
                </div>
            </Card>
            {/* ... other cards (IPO, Edit) ... */}
        </div>
    );
};
