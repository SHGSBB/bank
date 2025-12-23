
import React, { useState, Suspense, lazy, useEffect } from 'react';
import { useGame } from '../../context/GameContext';
import { Card, Spinner, LineIcon } from '../Shared';

// Admin Specific Tabs
const TeacherDashboard = lazy(() => import('../tabs/teacher/TeacherDashboard').then(module => ({ default: module.TeacherDashboard })));
const AdminFinanceTab = lazy(() => import('../tabs/admin/AdminFinanceTab').then(module => ({ default: module.AdminFinanceTab })));
const AdminRequestTab = lazy(() => import('../tabs/admin/AdminRequestTab').then(module => ({ default: module.AdminRequestTab })));
const AdminOperationTab = lazy(() => import('../tabs/admin/AdminOperationTab').then(module => ({ default: module.AdminOperationTab })));
const StandardTableTab = lazy(() => import('../tabs/admin/StandardTableTab').then(module => ({ default: module.StandardTableTab })));
const UserManagementTab = lazy(() => import('../tabs/admin/UserManagementTab').then(module => ({ default: module.UserManagementTab })));
const AdminRealEstateTab = lazy(() => import('../tabs/admin/AdminRealEstateTab').then(module => ({ default: module.AdminRealEstateTab })));
const BusinessManagementTab = lazy(() => import('../tabs/admin/BusinessManagementTab').then(module => ({ default: module.BusinessManagementTab })));
const AnnouncementsTab = lazy(() => import('../tabs/admin/AnnouncementsTab').then(module => ({ default: module.AnnouncementsTab })));
const ConsentsTab = lazy(() => import('../tabs/admin/ConsentsTab').then(module => ({ default: module.ConsentsTab })));
const AdminFeedbackTab = lazy(() => import('../tabs/admin/AdminFeedbackTab').then(module => ({ default: module.AdminFeedbackTab })));
const SystemInfoEditorTab = lazy(() => import('../tabs/admin/SystemInfoEditorTab').then(module => ({ default: module.SystemInfoEditorTab })));
const ChatSystem = lazy(() => import('../ChatSystem').then(module => ({ default: module.ChatSystem })));

// Standard Tabs (Reused for Admin Super-Mode)
const TransferTab = lazy(() => import('../tabs/TransferTab').then(module => ({ default: module.TransferTab })));
const PurchaseTab = lazy(() => import('../tabs/PurchaseTab').then(module => ({ default: module.PurchaseTab })));
const ExchangeTab = lazy(() => import('../tabs/ExchangeTab').then(module => ({ default: module.ExchangeTab })));
const SavingsTab = lazy(() => import('../tabs/SavingsTab').then(module => ({ default: module.SavingsTab })));
const LoanTab = lazy(() => import('../tabs/LoanTab').then(module => ({ default: module.LoanTab })));
const RealEstateTab = lazy(() => import('../tabs/RealEstateTab').then(module => ({ default: module.RealEstateTab })));
const TransactionHistoryTab = lazy(() => import('../tabs/TransactionHistoryTab').then(module => ({ default: module.TransactionHistoryTab })));
const MartProductTab = lazy(() => import('../tabs/MartProductTab').then(module => ({ default: module.MartProductTab })));
const MartSettingsTab = lazy(() => import('../tabs/MartSettingsTab').then(module => ({ default: module.MartSettingsTab })));
const GovDashboard = lazy(() => import('../tabs/government/GovDashboard').then(module => ({ default: module.GovDashboard })));
const StockTab = lazy(() => import('../tabs/StockTab').then(module => ({ default: module.StockTab })));
const BillTab = lazy(() => import('../tabs/BillTab').then(module => ({ default: module.BillTab })));

export const AdminModeDashboard: React.FC<{ isDesignMode: boolean }> = ({ isDesignMode }) => {
    const { currentUser, db, saveDb, loadAllUsers } = useGame();
    const [isChatOpen, setIsChatOpen] = useState(false);
    
    // Level 1 Tabs
    const [mainTab, setMainTab] = useState<'bank' | 'system' | 'citizen' | 'mart' | 'gov' | 'teacher'>('bank');
    
    // Sub Tabs for System Admin
    const [systemSubTab, setSystemSubTab] = useState('사용자 관리');
    
    // Citizen Sub Tabs for Admin
    const [citizenSubTab, setCitizenSubTab] = useState('이체');

    // Force load all users on mount to ensure admin panels are populated
    useEffect(() => {
        loadAllUsers();
        
        const handleOpenChat = () => setIsChatOpen(true);
        window.addEventListener('open-chat', handleOpenChat);
        return () => window.removeEventListener('open-chat', handleOpenChat);
    }, []);

    const handleChannelChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
        const val = e.target.value as any;
        const newDb = { ...db };
        newDb.settings.betaChannel = val;
        await saveDb(newDb);
    };

    const renderTabContent = () => {
        return (
            <Suspense fallback={<Spinner />}>
                {/* 1. CENTRAL BANK CONTROL (Default Admin View) */}
                {mainTab === 'bank' && (
                    <div className="space-y-6 animate-fade-in">
                        <AdminFinanceTab />
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <AdminRequestTab />
                            <AdminRealEstateTab />
                        </div>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <BusinessManagementTab />
                            <StandardTableTab />
                        </div>
                        <AdminOperationTab />
                    </div>
                )}

                {/* 2. SYSTEM MANAGEMENT */}
                {mainTab === 'system' && (
                    <div className="space-y-6 animate-fade-in">
                        <div className="flex overflow-x-auto gap-2 mb-4 scrollbar-hide border-b border-gray-200 dark:border-gray-700 pb-1">
                            {['사용자 관리', '공지사항 관리', '약관 관리', '시스템 정보', '피드백'].map(t => (
                                <button key={t} onClick={() => setSystemSubTab(t)} className={`px-4 py-2 text-sm font-bold transition-colors border-b-2 whitespace-nowrap ${systemSubTab === t ? 'border-green-500 text-green-600' : 'border-transparent text-gray-500'}`}>
                                    {t}
                                </button>
                            ))}
                        </div>
                        {systemSubTab === '사용자 관리' && <UserManagementTab />}
                        {systemSubTab === '공지사항 관리' && <AnnouncementsTab />}
                        {systemSubTab === '약관 관리' && <ConsentsTab />}
                        {systemSubTab === '시스템 정보' && <SystemInfoEditorTab />}
                        {systemSubTab === '피드백' && <AdminFeedbackTab />}
                    </div>
                )}

                {/* 3. CITIZEN SIMULATION (Super User Mode) */}
                {mainTab === 'citizen' && (
                    <div className="space-y-6 animate-fade-in">
                        <div className="bg-blue-50 dark:bg-blue-900/10 p-3 rounded-lg text-xs text-blue-600 mb-2 border border-blue-100">
                            * 관리자 권한으로 일반 시민 기능을 수행합니다. 본인 계정(관리자) 기준입니다.
                        </div>
                        <div className="flex overflow-x-auto gap-4 mb-4 scrollbar-hide border-b border-gray-200 dark:border-gray-700 pb-1">
                            {['이체', '구매', '환전', '주식', '저금', '대출', '부동산', '고지서', '거래 내역'].map(t => (
                                <button key={t} onClick={() => setCitizenSubTab(t)} className={`px-3 py-2 text-sm font-bold transition-colors border-b-2 whitespace-nowrap ${citizenSubTab === t ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500'}`}>
                                    {t}
                                </button>
                            ))}
                        </div>
                        
                        {citizenSubTab === '이체' && <TransferTab />}
                        {citizenSubTab === '구매' && <PurchaseTab />}
                        {citizenSubTab === '환전' && <ExchangeTab />}
                        {citizenSubTab === '주식' && <StockTab />}
                        {citizenSubTab === '저금' && <SavingsTab />}
                        {citizenSubTab === '대출' && <LoanTab />}
                        {citizenSubTab === '부동산' && <RealEstateTab />}
                        {citizenSubTab === '고지서' && <BillTab />}
                        {citizenSubTab === '거래 내역' && <TransactionHistoryTab />}
                    </div>
                )}

                {/* 4. MART SIMULATION */}
                {mainTab === 'mart' && (
                    <div className="space-y-6 animate-fade-in">
                        <Card>
                            <h4 className="font-bold mb-4 text-orange-600">마트 기능 테스트</h4>
                            <MartProductTab />
                            <div className="h-8 border-t my-4"></div>
                            <MartSettingsTab />
                        </Card>
                    </div>
                )}

                {/* 5. GOVERNMENT SIMULATION */}
                {mainTab === 'gov' && (
                    <div className="space-y-6 animate-fade-in">
                        <GovDashboard />
                    </div>
                )}

                {/* 6. TEACHER/GOD MODE */}
                {mainTab === 'teacher' && <TeacherDashboard />}
            </Suspense>
        );
    };

    // Fixed Height Container with Overflow Auto for Scrolling
    return (
        <div className="h-screen w-full flex flex-col overflow-hidden bg-[#E9E9EB] dark:bg-[#121212]">
            <div className="flex-1 overflow-y-auto pb-24 scrollbar-hide p-4" style={{ marginRight: isChatOpen && window.innerWidth >= 640 ? '400px' : '0' }}>
                <div className="bg-[#1C1C1E] text-white p-6 rounded-[28px] mb-6 shadow-2xl border border-white/5 flex justify-between items-center relative overflow-hidden shrink-0">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-600 via-green-500 to-blue-600"></div>
                    <div className="relative z-10">
                        <h2 className="text-2xl font-black tracking-tighter flex items-center gap-2">
                            🏦 통합 관리자 시스템
                            <span className="text-[10px] bg-red-600 px-2 py-0.5 rounded-full font-bold uppercase">Super Admin</span>
                        </h2>
                        <div className="flex items-center gap-3 mt-2">
                             <div className="flex items-center gap-1.5">
                                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                                <span className="text-xs font-bold text-gray-400">System Online</span>
                             </div>
                            <select 
                                value={db.settings.betaChannel || 'Stable'} 
                                onChange={handleChannelChange}
                                className="bg-white/5 text-white text-[10px] border border-white/10 rounded-full px-3 py-0.5 font-bold outline-none"
                            >
                                <option value="Developer Beta">Dev Beta</option>
                                <option value="Public Beta">Public Beta</option>
                                <option value="Stable">Stable v1.0</option>
                            </select>
                        </div>
                    </div>
                    <div className="text-right shrink-0">
                        <p className="text-xs font-black text-blue-400">{currentUser?.name}</p>
                        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">{currentUser?.govtRole || 'Administrator'}</p>
                    </div>
                </div>

                <div className="flex overflow-x-auto gap-2 mb-8 scrollbar-hide shrink-0">
                    {[
                        { id: 'bank', label: '중앙은행 (Bank)', icon: 'finance' },
                        { id: 'system', label: '시스템 (System)', icon: 'security' },
                        { id: 'citizen', label: '시민 모드 (Citizen)', icon: 'profile' },
                        { id: 'mart', label: '마트 모드 (Mart)', icon: 'cart' },
                        { id: 'gov', label: '정부 모드 (Gov)', icon: 'id_card' },
                        { id: 'teacher', label: '교사/God (Teacher)', icon: 'star' }
                    ].map((t) => (
                        <button 
                            key={t.id} 
                            onClick={() => setMainTab(t.id as any)}
                            className={`px-5 py-3 rounded-xl font-bold transition-all shadow-sm whitespace-nowrap border-2 ${mainTab === t.id ? 'bg-white dark:bg-white text-black border-white scale-105 shadow-xl' : 'bg-transparent text-gray-500 border-transparent hover:bg-gray-100 dark:hover:bg-white/5'}`}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>
                
                <div className="min-h-[600px] animate-fade-in">
                    {renderTabContent()}
                </div>
            </div>

            {/* Chat Floating Button & System */}
            <div className="fixed bottom-6 right-6 z-[60] flex flex-col gap-2 transition-all" style={{ right: isChatOpen && window.innerWidth >= 640 ? '420px' : '1.5rem' }}>
                {!isChatOpen && (
                    <button onClick={() => setIsChatOpen(true)} className="w-14 h-14 rounded-full bg-blue-600 text-white shadow-xl flex items-center justify-center hover:scale-110 transition-transform">
                        <LineIcon icon="chat" className="w-6 h-6" />
                    </button>
                )}
            </div>
            
            <Suspense fallback={null}>
                <ChatSystem isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />
            </Suspense>
        </div>
    );
};
