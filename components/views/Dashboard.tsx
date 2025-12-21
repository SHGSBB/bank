
import React, { useState, useMemo, useEffect, useRef, Suspense, lazy } from 'react';
import { useGame } from '../../context/GameContext';
import { Button, formatSmartMoney, formatName, LineIcon, PieChart, Spinner, Modal } from '../Shared';
import { Announcement, User, TermDeposit, StockHolding, PendingTax } from '../../types';

// Lazy Load Tabs
const TransferTab = lazy(() => import('../tabs/TransferTab').then(module => ({ default: module.TransferTab })));
const PurchaseTab = lazy(() => import('../tabs/PurchaseTab').then(module => ({ default: module.PurchaseTab })));
const ExchangeTab = lazy(() => import('../tabs/ExchangeTab').then(module => ({ default: module.ExchangeTab })));
const SavingsTab = lazy(() => import('../tabs/SavingsTab').then(module => ({ default: module.SavingsTab })));
const LoanTab = lazy(() => import('../tabs/LoanTab').then(module => ({ default: module.LoanTab })));
const RealEstateTab = lazy(() => import('../tabs/RealEstateTab').then(module => ({ default: module.RealEstateTab })));
const MartSettingsTab = lazy(() => import('../tabs/MartSettingsTab').then(module => ({ default: module.MartSettingsTab })));
const MartProductTab = lazy(() => import('../tabs/MartProductTab').then(module => ({ default: module.MartProductTab })));
const ProfileSettingsTab = lazy(() => import('../tabs/ProfileSettingsTab').then(module => ({ default: module.ProfileSettingsTab })));
const TransactionHistoryTab = lazy(() => import('../tabs/TransactionHistoryTab').then(module => ({ default: module.TransactionHistoryTab })));
const GovDashboard = lazy(() => import('../tabs/government/GovDashboard').then(module => ({ default: module.GovDashboard })));
const TeacherDashboard = lazy(() => import('../tabs/teacher/TeacherDashboard').then(module => ({ default: module.TeacherDashboard })));
const StockTab = lazy(() => import('../tabs/StockTab').then(module => ({ default: module.StockTab })));
const StandardTableTab = lazy(() => import('../tabs/admin/StandardTableTab').then(module => ({ default: module.StandardTableTab })));
const AdminFinanceTab = lazy(() => import('../tabs/admin/AdminFinanceTab').then(module => ({ default: module.AdminFinanceTab })));
const AdminRequestTab = lazy(() => import('../tabs/admin/AdminRequestTab').then(module => ({ default: module.AdminRequestTab })));
const AdminOperationTab = lazy(() => import('../tabs/admin/AdminOperationTab').then(module => ({ default: module.AdminOperationTab })));
const BillTab = lazy(() => import('../tabs/BillTab').then(module => ({ default: module.BillTab })));
const ChatSystem = lazy(() => import('../ChatSystem').then(module => ({ default: module.ChatSystem })));
const AuctionModal = lazy(() => import('../tabs/AuctionModal').then(module => ({ default: module.AuctionModal })));
const AdminModeDashboard = lazy(() => import('./AdminModeDashboard').then(module => ({ default: module.AdminModeDashboard })));
const SimplePayTab = lazy(() => import('../tabs/SimplePayTab').then(module => ({ default: module.SimplePayTab })));

const Wallet: React.FC = () => {
    const { currentUser, db } = useGame();
    const [expandedCard, setExpandedCard] = useState<string | null>(null);
    const fmt = (num: number) => formatSmartMoney(num, currentUser?.preferences?.assetDisplayMode === 'rounded');
    
    const propVal = useMemo(() => (db.realEstate.grid || []).filter(p => p.owner === currentUser?.name && !p.tenant).reduce((s, p) => s + p.price, 0), [db.realEstate, currentUser]);
    const savingsTotal = useMemo(() => (Object.values(db.termDeposits || {}) as TermDeposit[]).filter(d => d.owner === currentUser?.name && d.status === 'active').reduce((s, d) => s + d.amount, 0), [db.termDeposits, currentUser]);
    const stockTotal = useMemo(() => { if (!currentUser?.stockHoldings || !db.stocks) return 0; return Object.entries(currentUser.stockHoldings).reduce((t, [id, h]) => t + (db.stocks![id]?.currentPrice || 0) * (h as StockHolding).quantity, 0); }, [currentUser, db.stocks]);
    const loanTotal = useMemo(() => {
        if (!currentUser?.loans) return 0;
        const loans = Array.isArray(currentUser.loans) ? currentUser.loans : Object.values(currentUser.loans);
        return loans.filter(l => l.status === 'approved' || l.status === 'collateral_pending').reduce((acc, l) => acc + l.amount, 0);
    }, [currentUser]);

    const assetCards = [
        { id: 'krw', label: '현금 (KRW)', val: currentUser?.balanceKRW || 0, isUSD: false, bg: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-900 dark:text-emerald-100 border-emerald-200 dark:border-emerald-800' },
        { id: 'usd', label: '외화 (USD)', val: currentUser?.balanceUSD || 0, isUSD: true, bg: 'bg-blue-100 dark:bg-blue-900/30 text-blue-900 dark:text-blue-100 border-blue-200 dark:border-blue-800' },
        { id: 'stock', label: '주식 평가금', val: stockTotal, isUSD: false, bg: 'bg-red-100 dark:bg-red-900/30 text-red-900 dark:text-red-100 border-red-200 dark:border-red-800' },
        { id: 'savings', label: '예금', val: savingsTotal, isUSD: false, bg: 'bg-violet-100 dark:bg-violet-900/30 text-violet-900 dark:text-violet-100 border-violet-200 dark:border-violet-800' },
        { id: 'realestate', label: '부동산', val: propVal, isUSD: false, bg: 'bg-amber-100 dark:bg-amber-900/30 text-amber-900 dark:text-amber-100 border-amber-200 dark:border-amber-800' },
        { id: 'loans', label: '대출금', val: loanTotal, isUSD: false, bg: 'bg-gray-200 dark:bg-gray-800 text-gray-800 dark:text-gray-200 border-gray-300 dark:border-gray-700' },
    ].filter(a => a.val > 0 || a.id === 'krw' || a.id === 'usd');

    const expandedCardData = assetCards.find(c => c.id === expandedCard);
    const gridCols = assetCards.length === 1 ? 'grid-cols-1' : assetCards.length === 2 ? 'grid-cols-2' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';

    return (
        <div className="mb-8 relative z-0">
             <div className="flex justify-between items-center mb-4 px-2 relative z-20">
                <h3 className="text-2xl font-bold">자산 대시보드</h3>
            </div>
            <div className="relative min-h-[8rem] w-full overflow-hidden rounded-[24px]">
                <div className={`grid ${gridCols} gap-3 w-full`}>
                    {assetCards.map((a) => (
                        <div key={a.id} onClick={() => setExpandedCard(a.id)} className={`rounded-[24px] p-4 cursor-pointer border shadow-sm flex flex-col justify-center items-center text-center h-32 hover:scale-[1.02] transition-transform ${a.bg}`}>
                            <p className="font-bold opacity-70 text-xs mb-2 uppercase tracking-wide">{a.label}</p>
                            <p className="font-black text-xl truncate w-full">
                                {a.isUSD ? '$' : '₩'} {fmt(a.val)}
                            </p>
                        </div>
                    ))}
                </div>
                {expandedCardData && (
                    <div className="absolute inset-0 z-50 w-full h-full rounded-[24px] p-6 cursor-pointer border-2 shadow-2xl flex flex-col justify-center items-center text-center animate-scale-in bg-white dark:bg-[#121212] border-green-500" onClick={() => setExpandedCard(null)}>
                        <button className="absolute top-4 right-4 text-gray-400">✕</button>
                        <p className="font-bold text-lg mb-4 opacity-70">{expandedCardData.label}</p>
                        <p className="font-bold text-4xl break-all leading-tight">{expandedCardData.isUSD ? '$' : '₩'} {expandedCardData.val.toLocaleString()}</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export const Dashboard: React.FC = () => {
    const { currentUser, db, isAdminMode, setAdminMode, saveDb, notify, showModal, showConfirm, clearPaidTax, logout, triggerHaptic, loadAssetHistory, currentAssetHistory, requestNotificationPermission, updateUser, payTax, dismissTax, setupPin, activeTab, setActiveTab, serverAction } = useGame();
    
    const [isProfileOpen, setIsProfileOpen] = useState(false);
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [showAllTabsModal, setShowAllTabsModal] = useState(false);
    
    const [taxDetail, setTaxDetail] = useState<PendingTax | null>(null);
    const [bannerIndex, setBannerIndex] = useState(0);

    const isBOK = currentUser?.name === '한국은행' || currentUser?.govtRole === '한국은행장' || currentUser?.customJob === '한국은행장';
    const isTeacher = currentUser?.subType === 'teacher' || currentUser?.type === 'root';
    const isPresident = currentUser?.isPresident;
    const isEasyMode = currentUser?.preferences?.isEasyMode && currentUser?.type === 'citizen';
    
    const myTaxes = useMemo(() => currentUser?.pendingTaxes || [], [currentUser?.pendingTaxes]);
    const now = new Date();
    const actionableTaxes = myTaxes.filter(t => { const isPending = t.status === 'pending'; const isPaid = t.status === 'paid'; const isOverdue = new Date(t.dueDate).getTime() <= now.getTime(); return (isPending && !isOverdue) || isPaid; });
    const overdueTaxes = myTaxes.filter(t => t.status === 'pending' && new Date(t.dueDate).getTime() <= now.getTime());
    
    const activeAnnouncements = useMemo(() => { 
        if (!db.announcements) return []; 
        const list = Array.isArray(db.announcements) ? db.announcements : Object.values(db.announcements);
        return list.filter(a => { 
            const createTime = new Date(a.date).getTime(); 
            const expireTime = createTime + (a.displayPeriodDays * 24 * 60 * 60 * 1000); 
            return Date.now() <= expireTime; 
        }); 
    }, [db.announcements]);

    const currentBannerTax = actionableTaxes[bannerIndex] || actionableTaxes[0];

    useEffect(() => { if (actionableTaxes.length > 1) { const timer = setInterval(() => { setBannerIndex(prev => (prev + 1) % actionableTaxes.length); }, 5000); return () => clearInterval(timer); } }, [actionableTaxes.length]);

    const tabs = useMemo(() => {
        if (isBOK) return ['재정 관리', '신청 관리', '운영 관리', '기준표', '거래 내역', '환전'];
        if (isEasyMode) return ['이체', '구매', '저금', '대출', '고지서', '환전']; 
        if (isTeacher) return ['교사', '운영 관리', '이체', '거래 내역'];
        if (isPresident) return ['국정 운영', '정부', '이체', '거래 내역'];
        if (currentUser?.type === 'government') return ['정부', '이체', '거래 내역', '고지서'];
        if (currentUser?.type === 'citizen') return ['이체', '구매', '환전', '주식', '저금', '대출', '부동산', '고지서', '간편결제', '거래 내역', '기준표'];
        if (currentUser?.type === 'mart') return ['물품관리', '가게설정', '간편결제', '이체', '주식', '고지서', '거래 내역'];
        if (currentUser?.type === 'admin') return ['재정 관리', '신청 관리', '운영 관리', '기준표', '거래 내역', '환전'];
        return ['이체', '거래 내역'];
    }, [currentUser, isTeacher, isPresident, isEasyMode, isBOK]);

    useEffect(() => {
        requestNotificationPermission();
        const handleOpenChat = () => setIsChatOpen(true);
        window.addEventListener('open-chat', handleOpenChat);
        return () => window.removeEventListener('open-chat', handleOpenChat);
    }, []);

    const getRoleName = () => { const t = currentUser?.type; if(t === 'citizen') return '시민'; if(t === 'mart') return '마트'; if(t === 'government') return '공무원'; if(t === 'admin') return '관리자'; if(t === 'teacher') return '교사'; return t; };
    const getTaxName = (type: string) => { const map: Record<string, string> = { 'real_estate': '종합부동산세', 'income': '소득세', 'asset': '재산세', 'fine': '과태료', 'acquisition': '취득세' }; return map[type] || type; };

    if (isAdminMode) {
        return (
            <div className="container mx-auto p-4">
                <Suspense fallback={<Spinner />}><AdminModeDashboard isDesignMode={false} /></Suspense>
                <div className="fixed bottom-4 right-4 z-50">
                    <Button onClick={() => setAdminMode(false)} className="bg-red-600 shadow-xl">관리자 모드 종료</Button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-screen overflow-hidden relative bg-[#E9E9EB] dark:bg-[#121212]">
            <div 
                className="flex-1 overflow-y-auto transition-all duration-300 ease-in-out relative z-0"
                style={{ 
                    marginRight: isChatOpen && window.innerWidth >= 640 ? '400px' : '0' 
                }}
            >
                <div className="container mx-auto max-w-6xl p-4 sm:p-8 pb-24">
                    <Suspense fallback={null}><AuctionModal /></Suspense>
                    
                    <div className="fixed bottom-24 sm:bottom-6 right-6 z-[60] flex flex-col gap-2 transition-all" style={{ right: isChatOpen && window.innerWidth >= 640 ? '420px' : '1.5rem' }}>
                        {!isChatOpen && (
                            <button onClick={() => setIsChatOpen(true)} className="w-14 h-14 rounded-full bg-blue-600 text-white shadow-xl flex items-center justify-center hover:scale-110 transition-transform">
                                <LineIcon icon="chat" className="w-6 h-6" />
                            </button>
                        )}
                    </div>
                    
                    {activeAnnouncements.length > 0 && (
                        <div className="mb-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-xl p-3 flex flex-col gap-2 animate-slide-down origin-top">
                            {activeAnnouncements.map(a => (
                                <div key={a.id} className="flex items-start gap-2">
                                    <span className="text-xl">📢</span>
                                    <div>
                                        <p className={`text-sm ${a.isImportant ? 'font-bold text-red-600' : 'text-gray-800 dark:text-gray-200'}`}>
                                            {a.content}
                                        </p>
                                        <p className="text-[10px] text-gray-500">{new Date(a.date).toLocaleDateString()}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="space-y-2 mb-6">
                        {currentBannerTax && (
                            <div className={`p-4 rounded-xl shadow-lg flex items-center justify-between transition-all duration-500 relative overflow-hidden ${currentBannerTax.status === 'paid' ? 'bg-gray-600 text-gray-200' : 'bg-red-600 text-white animate-pulse'}`}>
                                {actionableTaxes.length > 1 && (
                                    <button onClick={() => setBannerIndex((i) => (i - 1 + actionableTaxes.length) % actionableTaxes.length)} className="p-2 relative z-10">❮</button>
                                )}
                                <div className="flex-1 text-center cursor-pointer" onClick={() => setTaxDetail(currentBannerTax)}>
                                    <p className="font-bold text-sm mb-1 flex items-center justify-center gap-2">
                                        {currentBannerTax.status === 'paid' ? '✅ 납부 완료' : '🚨 세금 납부 알림'} 
                                        <span className="text-[10px] opacity-80 border border-white/30 px-1 rounded">{getTaxName(currentBannerTax.type)}</span>
                                    </p>
                                    <p className="font-black text-xl mt-1">₩ {currentBannerTax.amount.toLocaleString()}</p>
                                    <p className="text-[10px] mt-1 opacity-80 underline">클릭하여 상세 내역 확인</p>
                                </div>
                                <div className="flex items-center gap-2 relative z-10">
                                    {currentBannerTax.status === 'pending' ? (
                                        <button onClick={(e) => { e.stopPropagation(); payTax(currentBannerTax); }} className="bg-white text-red-600 px-4 py-2 rounded-lg text-xs font-bold hover:bg-gray-100 shadow-md">납부</button>
                                    ) : (
                                        <button onClick={(e) => { e.stopPropagation(); dismissTax(currentBannerTax.id); }} className="bg-white/20 hover:bg-white/30 p-2 rounded-full"><LineIcon icon="close" className="w-4 h-4" /></button>
                                    )}
                                </div>
                                {actionableTaxes.length > 1 && (
                                    <button onClick={() => setBannerIndex((i) => (i + 1) % actionableTaxes.length)} className="p-2 relative z-10">❯</button>
                                )}
                            </div>
                        )}
                        {overdueTaxes.map(t => (
                            <div key={t.id} className="bg-orange-100 dark:bg-orange-900/30 border-l-4 border-orange-500 text-orange-800 dark:text-orange-200 p-4 rounded-r shadow-sm flex justify-between items-center">
                                <div>
                                    <p className="font-bold text-sm">⚠️ {getTaxName(t.type)}를 미납하셨습니다.</p>
                                    <p className="text-xs mt-1">납부기한이 지났습니다. 본인의 재산에서 과태료가 징수될 수 있습니다.</p>
                                </div>
                                <Button className="text-xs bg-orange-600 hover:bg-orange-500 border-none" onClick={() => setActiveTab('고지서')}>확인</Button>
                            </div>
                        ))}
                    </div>

                    <div className="flex items-center gap-4 mb-8 px-2">
                        <div onClick={() => setIsProfileOpen(true)} className="w-16 h-16 rounded-full bg-green-500 text-white flex items-center justify-center overflow-hidden border-4 border-white shadow-lg cursor-pointer">
                            {currentUser?.profilePic ? <img src={currentUser.profilePic} className="w-full h-full object-cover" alt="p"/> : <span className="text-2xl font-bold">{formatName(currentUser?.name)[0]}</span>}
                        </div>
                        <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                                <h2 className="text-2xl font-bold" onClick={() => setIsProfileOpen(true)}>{formatName(currentUser?.name, currentUser)}</h2>
                                <span className="text-[10px] bg-gray-700 text-white px-2 py-0.5 rounded-full font-bold uppercase tracking-tight">{currentUser?.govtRole || currentUser?.customJob || getRoleName()}</span>
                            </div>
                        </div>
                    </div>

                    <Wallet />

                    <div className="hidden sm:flex overflow-x-auto gap-8 mb-8 scrollbar-hide border-b border-gray-800 px-2">
                        {tabs.map(t => (
                            <button key={t} onClick={() => setActiveTab(t)} className={`pb-3 text-sm font-black whitespace-nowrap border-b-2 transition-all ${activeTab === t ? 'border-green-500 text-green-500' : 'border-transparent text-gray-500'}`}>{t}</button>
                        ))}
                    </div>

                    <div className="min-h-[400px] px-1 pb-20 relative">
                        <Suspense fallback={<Spinner />}>
                            {activeTab === '이체' && <TransferTab />}
                            {activeTab === '구매' && <PurchaseTab />}
                            {activeTab === '환전' && <ExchangeTab />}
                            {activeTab === '주식' && <StockTab />}
                            {activeTab === '저금' && <SavingsTab />}
                            {activeTab === '대출' && <LoanTab />}
                            {activeTab === '부동산' && <RealEstateTab />}
                            {activeTab === '고지서' && <BillTab />}
                            {activeTab === '거래 내역' && <TransactionHistoryTab />}
                            {activeTab === '물품관리' && <MartProductTab />}
                            {activeTab === '가게설정' && <MartSettingsTab />}
                            {activeTab === '정부' && <GovDashboard />}
                            {activeTab === '국정 운영' && <GovDashboard />}
                            {activeTab === '교사' && <TeacherDashboard />}
                            {activeTab === '운영 관리' && <AdminOperationTab />}
                            {activeTab === '기준표' && <StandardTableTab />}
                            {activeTab === '재정 관리' && <AdminFinanceTab restricted={false} />}
                            {activeTab === '신청 관리' && <AdminRequestTab />}
                            {activeTab === '간편결제' && <SimplePayTab />}
                        </Suspense>
                    </div>
                </div>
            </div>

            <div className="fixed bottom-0 left-0 right-0 h-20 bg-white/80 dark:bg-[#121212]/80 backdrop-blur-lg border-t border-gray-200 dark:border-gray-800 flex justify-around items-center px-2 pb-4 z-[50] sm:hidden">
                {[
                    { id: '이체', icon: 'finance', label: '홈' },
                    { id: '거래 내역', icon: 'menu', label: '내역' },
                    { id: '주식', icon: 'chart', label: '주식' }
                ].map(t => {
                    const isActive = activeTab === t.id;
                    return (
                        <button 
                            key={t.id}
                            onClick={() => setActiveTab(t.id)}
                            className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all active:scale-95 ${isActive ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}`}
                        >
                            <LineIcon icon={t.icon === 'chart' ? 'finance' : t.icon} className={`w-6 h-6 ${isActive ? 'stroke-[2.5px]' : 'stroke-2'}`} />
                            <span className="text-[10px] font-bold">{t.label}</span>
                        </button>
                    )
                })}
                <button 
                    onClick={() => setShowAllTabsModal(true)}
                    className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all active:scale-95 text-gray-400`}
                >
                    <LineIcon icon="dots" className="w-6 h-6 stroke-2" />
                    <span className="text-[10px] font-bold">전체</span>
                </button>
            </div>

            <Modal isOpen={showAllTabsModal} onClose={() => setShowAllTabsModal(false)} title="전체 메뉴">
                <div className="grid grid-cols-3 gap-3">
                    {tabs.map(t => (
                        <button 
                            key={t} 
                            onClick={() => { setActiveTab(t); setShowAllTabsModal(false); }}
                            className={`p-3 rounded-xl border font-bold text-sm ${activeTab === t ? 'bg-green-600 text-white border-green-600' : 'bg-gray-50 dark:bg-gray-800 dark:text-white border-gray-200 dark:border-gray-700'}`}
                        >
                            {t}
                        </button>
                    ))}
                </div>
            </Modal>

            <Suspense fallback={<Spinner />}>
                <ChatSystem isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} onAttachTab={setActiveTab} />
            </Suspense>

            <Modal isOpen={isProfileOpen} onClose={() => setIsProfileOpen(false)} title="설정" wide>
                <Suspense fallback={<Spinner />}><ProfileSettingsTab /></Suspense>
            </Modal>
        </div>
    );
};
