

import React, { useState } from 'react';
import { useGame } from '../../context/GameContext';
import { Card } from '../Shared';

// Import existing feature components
import { TeacherDashboard } from '../tabs/teacher/TeacherDashboard';
import { AdminFinanceTab } from '../tabs/admin/AdminFinanceTab';
import { AdminRequestTab } from '../tabs/admin/AdminRequestTab';
import { AdminOperationTab } from '../tabs/admin/AdminOperationTab';
import { StandardTableTab } from '../tabs/admin/StandardTableTab';
import { UserManagementTab } from '../tabs/admin/UserManagementTab';
import { GovDashboard } from '../tabs/government/GovDashboard';
import { AuthView } from '../views/Auth';

// Moved Tabs
import { AdminRealEstateTab } from '../tabs/admin/AdminRealEstateTab';
import { BusinessManagementTab } from '../tabs/admin/BusinessManagementTab';

// System Admin Tabs
import { AnnouncementsTab } from '../tabs/admin/AnnouncementsTab';
import { ConsentsTab } from '../tabs/admin/ConsentsTab';
import { DatabaseTab } from '../tabs/admin/DatabaseTab';

// Citizen Tabs for Admin Preview
import { TransferTab } from '../tabs/TransferTab';
import { PurchaseTab } from '../tabs/PurchaseTab';
import { ExchangeTab } from '../tabs/ExchangeTab';
import { SavingsTab } from '../tabs/SavingsTab';
import { LoanTab } from '../tabs/LoanTab';
import { RealEstateTab } from '../tabs/RealEstateTab';
import { TransactionHistoryTab } from '../tabs/TransactionHistoryTab';
import { MartProductTab } from '../tabs/MartProductTab';
import { MartSettingsTab } from '../tabs/MartSettingsTab';

export const AdminModeDashboard: React.FC<{ isDesignMode: boolean }> = ({ isDesignMode }) => {
    const { currentUser, db, saveDb } = useGame();
    
    // Level 1 Tabs
    const [mainTab, setMainTab] = useState<'teacher' | 'bank' | 'system' | 'citizen' | 'gov' | 'mart' | 'auth'>('bank');
    
    // Sub Tabs for System Admin
    const [systemSubTab, setSystemSubTab] = useState('사용자 관리');
    
    // Citizen Sub Tabs for Admin
    const [citizenSubTab, setCitizenSubTab] = useState('이체');

    const handleChannelChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
        const val = e.target.value as any;
        const newDb = { ...db };
        newDb.settings.betaChannel = val;
        await saveDb(newDb);
    };

    const renderTabContent = () => {
        switch (mainTab) {
            case 'teacher':
                return <TeacherDashboard />;
            case 'bank':
                return (
                    <div className="space-y-6">
                        <AdminFinanceTab />
                        <div className="h-4"></div>
                        
                        {/* Integrated Operations */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <AdminRealEstateTab />
                            <BusinessManagementTab />
                        </div>

                        <div className="h-4"></div>
                        <AdminOperationTab />
                        <div className="h-4"></div>
                        <AdminRequestTab />
                        <div className="h-4"></div>
                        <StandardTableTab />
                    </div>
                );
            case 'system':
                return (
                    <div className="space-y-6">
                        <div className="flex overflow-x-auto gap-2 mb-2 scrollbar-hide border-b border-gray-200 dark:border-gray-700 pb-1">
                            {['사용자 관리', '공지사항 관리', '약관 관리', '데이터베이스'].map(t => (
                                <button key={t} onClick={() => setSystemSubTab(t)} className={`px-3 py-1 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${systemSubTab === t ? 'border-green-500 text-green-600' : 'border-transparent text-gray-500'}`}>
                                    {t}
                                </button>
                            ))}
                        </div>
                        {systemSubTab === '사용자 관리' && <UserManagementTab />}
                        {systemSubTab === '공지사항 관리' && <AnnouncementsTab />}
                        {systemSubTab === '약관 관리' && <ConsentsTab />}
                        {systemSubTab === '데이터베이스' && <DatabaseTab />}
                    </div>
                );
            case 'citizen':
                return (
                    <div className="space-y-6">
                        <div className="flex overflow-x-auto gap-2 mb-2 scrollbar-hide border-b border-gray-200 dark:border-gray-700 pb-1">
                            {['이체', '구매', '환전', '저금', '대출', '부동산', '거래 내역'].map(t => (
                                <button key={t} onClick={() => setCitizenSubTab(t)} className={`px-3 py-1 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${citizenSubTab === t ? 'border-green-500 text-green-600' : 'border-transparent text-gray-500'}`}>
                                    {t}
                                </button>
                            ))}
                        </div>
                        <Card>
                            {citizenSubTab === '이체' && <TransferTab />}
                            {citizenSubTab === '구매' && <PurchaseTab />}
                            {citizenSubTab === '환전' && <ExchangeTab />}
                            {citizenSubTab === '저금' && <SavingsTab />}
                            {citizenSubTab === '대출' && <LoanTab />}
                            {citizenSubTab === '부동산' && <RealEstateTab />}
                            {citizenSubTab === '거래 내역' && <TransactionHistoryTab />}
                        </Card>
                    </div>
                );
            case 'gov':
                return <GovDashboard />;
            case 'mart':
                return (
                    <div className="space-y-6">
                        <Card>
                            <h4 className="font-bold mb-4">마트 기능 테스트 (관리자 권한)</h4>
                            <MartProductTab />
                            <div className="h-4"></div>
                            <MartSettingsTab />
                        </Card>
                    </div>
                );
            case 'auth':
                return (
                    <div className="space-y-6">
                        <Card>
                            <h4 className="font-bold mb-4">로그인/가입 화면 미리보기</h4>
                            <div className="pointer-events-none opacity-75 transform scale-90 origin-top-left border p-2">
                                <AuthView />
                            </div>
                        </Card>
                    </div>
                );
            default:
                return null;
        }
    };

    return (
        <div className="w-full">
            <div className="bg-gray-800 text-white p-4 rounded-xl mb-6 shadow-lg flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold">🛠️ 관리자 모드 (Admin Mode)</h2>
                    <div className="flex items-center gap-2 mt-1">
                        <span className="text-sm opacity-70">App Version:</span>
                        <select 
                            value={db.settings.betaChannel || 'Stable'} 
                            onChange={handleChannelChange}
                            className="bg-gray-700 text-white text-xs border border-gray-600 rounded px-2 py-1"
                        >
                            <option value="Developer Beta">Developer Beta</option>
                            <option value="Public Beta">Public Beta</option>
                            <option value="Stable">정식 (Stable)</option>
                        </select>
                    </div>
                </div>
                <div className="text-right text-xs">
                    <p>User: {currentUser?.name}</p>
                    <p>PIN Level: {currentUser?.pinLength} digits</p>
                </div>
            </div>

            <div className="flex overflow-x-auto gap-2 mb-6 scrollbar-hide">
                {[
                    { id: 'teacher', label: '교사' },
                    { id: 'bank', label: '한국은행' },
                    { id: 'system', label: '시스템 관리' },
                    { id: 'citizen', label: '시민' },
                    { id: 'mart', label: '마트' },
                    { id: 'gov', label: '공무원' },
                    { id: 'auth', label: '로그인 과정' }
                ].map((t) => (
                    <button 
                        key={t.id} 
                        onClick={() => setMainTab(t.id as any)}
                        className={`px-6 py-3 rounded-lg font-bold transition-all shadow-sm whitespace-nowrap ${mainTab === t.id ? 'bg-green-600 text-white transform scale-105' : 'bg-white dark:bg-gray-700 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-600'}`}
                    >
                        {t.label}
                    </button>
                ))}
            </div>
            
            <div className="min-h-[500px] animate-fade-in">
                {renderTabContent()}
            </div>
        </div>
    );
};