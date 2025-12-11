import React, { useState } from 'react';
import { useGame } from '../../../context/GameContext';
import { Card, Button, Toggle } from '../../Shared';
import { BankSettingsTab } from './BankSettingsTab';

export const AdminOperationTab: React.FC<{ restricted?: boolean }> = ({ restricted }) => {
    const { db, saveDb, showModal } = useGame();
    const [subTab, setSubTab] = useState('은행설정');
    const tabs = ['은행설정', '기능제어', '서비스관리'];

    // Tab Groups
    const tabGroups = {
        'Citizen (시민)': ['이체', '구매', '환전', '주식', '저금', '대출', '부동산', '거래 내역', '기준표'],
        'Mart (마트)': ['물품관리', '가게설정', '이체', '주식', '거래 내역'],
        'Government (공무원)': ['정부', '이체', '거래 내역'],
        'Admin (관리자)': ['재정 관리', '신청 관리', '운영 관리', '기준표', '거래 내역', '환전']
    };

    // Service Status
    const [status, setStatus] = useState(db.settings.serviceStatus || 'active');
    
    // Automation
    const [automationEnabled, setAutomationEnabled] = useState(db.settings.automation?.enabled || false);

    const handleLockGroup = async (groupName: string, locked: boolean) => {
        const newDb = { ...db };
        const features = (tabGroups as any)[groupName] || [];
        
        if (!newDb.settings.lockedFeatures) newDb.settings.lockedFeatures = {};
        
        features.forEach((f: string) => {
            newDb.settings.lockedFeatures![f] = locked;
        });
        
        await saveDb(newDb);
        showModal(`${groupName} 탭 그룹이 ${locked ? '잠금' : '해제'}되었습니다.`);
    };

    const handleServiceStatus = async (newStatus: 'active' | 'maintenance' | 'ended') => {
        const newDb = { ...db };
        newDb.settings.serviceStatus = newStatus;
        await saveDb(newDb);
        showModal(`서비스 상태가 '${newStatus}'로 변경되었습니다.`);
        setStatus(newStatus);
    };

    const handleAutomationToggle = async (val: boolean) => {
        const newDb = { ...db };
        newDb.settings.automation = { enabled: val, lastRunDate: newDb.settings.automation?.lastRunDate };
        await saveDb(newDb);
        setAutomationEnabled(val);
        showModal(`자동화 시스템이 ${val ? '활성화' : '비활성화'}되었습니다.`);
    };

    return (
        <div className="w-full">
             <div className="flex overflow-x-auto gap-2 mb-6 scrollbar-hide border-b border-gray-200 dark:border-gray-700">
                {tabs.map(t => (
                    <button key={t} onClick={() => setSubTab(t)} className={`whitespace-nowrap px-4 py-2 text-sm font-medium transition-colors border-b-[3px] ${subTab === t ? 'border-green-500 text-green-600 dark:text-green-400' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>{t}</button>
                ))}
            </div>
            
            {subTab === '은행설정' && <BankSettingsTab />}
            
            {subTab === '기능제어' && (
                <Card>
                    <h3 className="text-lg font-bold mb-4">탭 그룹 일괄 제어</h3>
                    <div className="space-y-4">
                        {Object.entries(tabGroups).map(([name, tabs]) => (
                            <div key={name} className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">
                                <div>
                                    <p className="font-bold">{name}</p>
                                    <p className="text-xs text-gray-500">{tabs.join(', ')}</p>
                                </div>
                                <div className="flex gap-2">
                                    <Button className="text-xs py-1 px-3 bg-green-600" onClick={() => handleLockGroup(name, false)}>모두 해제</Button>
                                    <Button className="text-xs py-1 px-3 bg-red-600" onClick={() => handleLockGroup(name, true)}>모두 잠금</Button>
                                </div>
                            </div>
                        ))}
                    </div>
                </Card>
            )}

            {subTab === '서비스관리' && (
                <div className="space-y-6">
                    <Card>
                        <h3 className="text-lg font-bold mb-4 text-red-600">서비스 상태 제어 (전체 적용)</h3>
                        <div className="grid grid-cols-3 gap-4">
                            <button 
                                onClick={() => handleServiceStatus('active')}
                                className={`p-4 rounded-xl border-2 flex flex-col items-center gap-2 ${status === 'active' ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : 'border-gray-200 dark:border-gray-700'}`}
                            >
                                <span className="text-2xl">🟢</span>
                                <span className="font-bold">정상 운영</span>
                            </button>
                            <button 
                                onClick={() => handleServiceStatus('maintenance')}
                                className={`p-4 rounded-xl border-2 flex flex-col items-center gap-2 ${status === 'maintenance' ? 'border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20' : 'border-gray-200 dark:border-gray-700'}`}
                            >
                                <span className="text-2xl">⚠️</span>
                                <span className="font-bold">서비스 점검</span>
                                <span className="text-[10px] text-gray-500">기능 제한, 관리자만 가능</span>
                            </button>
                            <button 
                                onClick={() => handleServiceStatus('ended')}
                                className={`p-4 rounded-xl border-2 flex flex-col items-center gap-2 ${status === 'ended' ? 'border-red-500 bg-red-50 dark:bg-red-900/20' : 'border-gray-200 dark:border-gray-700'}`}
                            >
                                <span className="text-2xl">🛑</span>
                                <span className="font-bold">서비스 종료</span>
                                <span className="text-[10px] text-gray-500">로그인 불가 (관리자 제외)</span>
                            </button>
                        </div>
                    </Card>

                    <Card>
                        <div className="flex justify-between items-center mb-4">
                            <div>
                                <h3 className="text-lg font-bold">주간 자동화 (Weekly Automation)</h3>
                                <p className="text-xs text-gray-500">매주 금요일에 주급 지급 및 세금 고지를 자동으로 실행합니다.</p>
                            </div>
                            <Toggle checked={automationEnabled} onChange={handleAutomationToggle} />
                        </div>
                        {automationEnabled && (
                            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded border border-blue-200 text-sm">
                                <p>✅ 자동화 활성화됨</p>
                                <p className="text-xs text-gray-500 mt-1">마지막 실행일: {db.settings.automation?.lastRunDate || '없음'}</p>
                            </div>
                        )}
                    </Card>
                </div>
            )}
        </div>
    );
};