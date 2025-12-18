
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useGame } from '../../context/GameContext';
import { Card, Button, Modal, Input, formatSmartMoney, formatName, LineIcon, PieChart } from '../Shared';
import { TransferTab } from '../tabs/TransferTab';
import { PurchaseTab } from '../tabs/PurchaseTab';
import { ExchangeTab } from '../tabs/ExchangeTab';
import { SavingsTab } from '../tabs/SavingsTab';
import { LoanTab } from '../tabs/LoanTab';
import { RealEstateTab } from '../tabs/RealEstateTab';
import { MartSettingsTab } from '../tabs/MartSettingsTab';
import { MartProductTab } from '../tabs/MartProductTab';
import { ProfileSettingsTab } from '../tabs/ProfileSettingsTab';
import { TransactionHistoryTab } from '../tabs/TransactionHistoryTab';
import { GovDashboard } from '../tabs/government/GovDashboard';
import { TeacherDashboard } from '../tabs/teacher/TeacherDashboard';
import { AuctionModal } from '../tabs/AuctionModal';
import { StockTab } from '../tabs/StockTab';
import { StandardTableTab } from '../tabs/admin/StandardTableTab';
import { AdminFinanceTab } from '../tabs/admin/AdminFinanceTab';
import { AdminRequestTab } from '../tabs/admin/AdminRequestTab';
import { AdminOperationTab } from '../tabs/admin/AdminOperationTab';
import { AdminModeDashboard } from './AdminModeDashboard';
import { ChatSystem } from '../ChatSystem';
import { Announcement, User, TermDeposit, Loan, PendingTax, StockHolding } from '../../types';

const AssetHistoryChart: React.FC<{ data: { date: string, totalValue: number }[] }> = ({ data }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [hoverData, setHoverData] = useState<{ value: number, date: string, x: number } | null>(null);
    const chartData = useMemo(() => data.slice(-30), [data]);
    if (!chartData || chartData.length === 0) return <div className="h-40 flex items-center justify-center text-gray-500">데이터 없음</div>;
    const values = chartData.map(d => d.totalValue);
    const minVal = Math.min(...values); const maxVal = Math.max(...values); const range = maxVal - minVal || 1;
    const width = 1000; const height = 200;
    const points = chartData.map((d, i) => `${(i / (chartData.length - 1)) * width},${height - ((d.totalValue - minVal) / range) * height}`).join(' ');
    return (
        <div ref={containerRef} className="w-full h-40 relative bg-white dark:bg-[#1E1E1E] rounded-xl overflow-hidden border border-gray-100 dark:border-gray-800" onMouseMove={(e) => {
            const rect = containerRef.current!.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const index = Math.min(Math.floor((x / rect.width) * chartData.length), chartData.length - 1);
            if (index >= 0) setHoverData({ value: chartData[index].totalValue, date: chartData[index].date, x: (index / (chartData.length - 1)) * rect.width });
        }} onMouseLeave={() => setHoverData(null)}>
            <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full" preserveAspectRatio="none">
                <polyline points={points} fill="none" stroke="#10B981" strokeWidth="2" strokeLinejoin="round" />
                <polygon points={`0,${height} ${points} ${width},${height}`} fill="url(#grad)" opacity="0.2" />
                <defs><linearGradient id="grad" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#10B981"/><stop offset="100%" stopColor="transparent"/></linearGradient></defs>
            </svg>
            {hoverData && <div className="absolute top-2 left-2 bg-black/80 text-white p-2 rounded text-xs z-10 font-bold">₩ {hoverData.value.toLocaleString()}</div>}
        </div>
    );
};

const Wallet: React.FC<{ onOpenStats: () => void }> = ({ onOpenStats }) => {
    const { currentUser, db, triggerHaptic } = useGame();
    const [expandedCard, setExpandedCard] = useState<string | null>(null);
    const fmt = (num: number) => {
        const mode = currentUser?.preferences?.assetDisplayMode;
        return formatSmartMoney(num, mode === 'rounded');
    };
    const propVal = useMemo(() => (db.realEstate.grid || []).filter(p => p.owner === currentUser?.name && !p.tenant).reduce((s, p) => s + p.price, 0), [db.realEstate, currentUser]);
    const savingsTotal = useMemo(() => (Object.values(db.termDeposits || {}) as TermDeposit[]).filter(d => d.owner === currentUser?.name && d.status === 'active').reduce((s, d) => s + d.amount, 0), [db.termDeposits, currentUser]);
    const stockTotal = useMemo(() => { if (!currentUser?.stockHoldings || !db.stocks) return 0; return Object.entries(currentUser.stockHoldings).reduce((t, [id, h]) => t + (db.stocks![id]?.currentPrice || 0) * (h as StockHolding).quantity, 0); }, [currentUser, db.stocks]);
    
    const assetCards = [
        { id: 'krw', label: '현금 (KRW)', val: currentUser?.balanceKRW || 0, isUSD: false, bg: 'bg-white dark:bg-[#1E1E1E]' },
        { id: 'usd', label: '외화 (USD)', val: currentUser?.balanceUSD || 0, isUSD: true, bg: 'bg-purple-100 dark:bg-[#1E1E1E]' },
        { id: 'stock', label: '주식 평가금', val: stockTotal, isUSD: false, bg: 'bg-red-100 dark:bg-[#1E1E1E]' },
        { id: 'savings', label: '예금', val: savingsTotal, isUSD: false, bg: 'bg-blue-100 dark:bg-[#1E1E1E]' },
        { id: 'realestate', label: '부동산', val: propVal, isUSD: false, bg: 'bg-orange-100 dark:bg-[#1E1E1E]' },
    ].filter(a => a.val > 0);

    const handleCardClick = (id: string) => { triggerHaptic(); setExpandedCard(expandedCard === id ? null : id); };
    const expandedCardData = assetCards.find(c => c.id === expandedCard);

    return (
        <div className="mb-8 relative z-0">
             <div className="flex justify-between items-center mb-4 px-2">
                <h3 className="text-2xl font-bold">자산 대시보드</h3>
                {!currentUser?.preferences?.isEasyMode && <button onClick={onOpenStats} className="text-sm bg-black dark:bg-white text-white dark:text-black px-4 py-2 rounded-full font-bold shadow-md">통계</button>}
            </div>
            <div className="relative min-h-[8rem] w-full overflow-hidden rounded-[24px]">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 w-full">
                    {assetCards.map((a) => (
                        <div key={a.id} onClick={() => handleCardClick(a.id)} className={`rounded-[24px] p-4 cursor-pointer border shadow-sm flex flex-col justify-center items-center text-center h-32 hover:scale-[1.02] transition-transform ${a.bg} border-gray-100 dark:border-gray-800`}><p className="font-bold opacity-70 text-xs mb-2">{a.label}</p><p className="font-bold text-xl truncate">{a.isUSD ? '$' : '₩'} {fmt(a.val)}</p></div>
                    ))}
                </div>
                {expandedCardData && (
                    <div className={`absolute inset-0 z-50 w-full h-full rounded-[24px] p-6 cursor-pointer border-2 shadow-2xl flex flex-col justify-center items-center text-center animate-scale-in opacity-100 bg-white dark:bg-[#121212] border-green-500`} style={{backgroundColor: '', opacity: 1}} onClick={() => setExpandedCard(null)}>
                        <button className="absolute top-4 right-4 text-gray-400">✕</button>
                        <p className="font-bold text-lg mb-4 opacity-70">{expandedCardData.label}</p>
                        <p className="font-bold text-4xl break-all leading-tight">{expandedCardData.isUSD ? '$' : '₩'} {expandedCardData.val.toLocaleString()}</p>
                        <p className="text-xs text-gray-500 mt-4 opacity-70">(클릭하여 축소)</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export const Dashboard: React.FC = () => {
    const { currentUser, db, isAdminMode, setAdminMode, saveDb, notify, showModal, showConfirm, clearPaidTax, logout, triggerHaptic, loadAssetHistory, currentAssetHistory, requestNotificationPermission, updateUser } = useGame();
    const [activeTab, setActiveTab] = useState<string>('');
    const [isProfileOpen, setIsProfileOpen] = useState(false);
    const [isAssetModalOpen, setIsAssetModalOpen] = useState(false);
    const [hiddenAnnouncements, setHiddenAnnouncements] = useState<number[]>([]);
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [currentTaxIndex, setCurrentTaxIndex] = useState(0);

    const isTeacher = currentUser?.subType === 'teacher' || currentUser?.type === 'root';
    const isPresident = currentUser?.isPresident;
    const isEasyMode = currentUser?.preferences?.isEasyMode && currentUser?.type === 'citizen';
    
    const pendingTaxes = useMemo(() => {
        let taxes = currentUser?.pendingTaxes ? (Array.isArray(currentUser.pendingTaxes) ? [...currentUser.pendingTaxes] : Object.values(currentUser.pendingTaxes)) : [];
        return taxes.sort((a,b) => (a.status === 'paid' ? 1 : -1) || new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
    }, [currentUser?.pendingTaxes]);

    const tabs = useMemo(() => {
        if (isEasyMode) return ['이체', '구매', '저금', '대출', '환전'];
        if (isTeacher) return ['교사', '운영 관리', '이체', '거래 내역'];
        if (isPresident) return ['국정 운영', '정부', '이체', '거래 내역'];
        if (currentUser?.type === 'government') return ['정부', '이체', '거래 내역'];
        if (currentUser?.type === 'citizen') return ['이체', '구매', '환전', '주식', '저금', '대출', '부동산', '거래 내역', '기준표'];
        if (currentUser?.type === 'mart') return ['물품관리', '가게설정', '이체', '주식', '거래 내역'];
        if (currentUser?.type === 'admin') return ['재정 관리', '신청 관리', '운영 관리', '기준표', '거래 내역'];
        return ['이체', '거래 내역'];
    }, [currentUser, isTeacher, isPresident, isEasyMode]);

    const assetComposition = useMemo(() => {
        if (!currentUser) return [];
        const usdRate = db.settings.exchangeRate.KRW_USD || 1350;
        const propVal = (db.realEstate.grid || []).filter(p => p.owner === currentUser.name && !p.tenant).reduce((s, p) => s + p.price, 0);
        const savingsTotal = (Object.values(db.termDeposits || {}) as TermDeposit[]).filter(d => d.owner === currentUser.name && d.status === 'active').reduce((s, d) => s + d.amount, 0);
        const stockTotal = Object.entries(currentUser.stockHoldings || {}).reduce((t, [id, h]) => t + (db.stocks?.[id]?.currentPrice || 0) * (h as StockHolding).quantity, 0);
        
        return [
            { label: '현금', value: currentUser.balanceKRW || 0, color: '#10B981' },
            { label: '외화', value: (currentUser.balanceUSD || 0) * usdRate, color: '#8B5CF6' },
            { label: '주식', value: stockTotal, color: '#EF4444' },
            { label: '예금', value: savingsTotal, color: '#3B82F6' },
            { label: '부동산', value: propVal, color: '#F59E0B' }
        ].filter(item => item.value > 0);
    }, [currentUser, db.realEstate, db.termDeposits, db.stocks]);

    const totalAssets = useMemo(() => assetComposition.reduce((sum, item) => sum + item.value, 0), [assetComposition]);

    const rankInfo = useMemo(() => {
        const allUsers = Object.values(db.users) as User[];
        const usdRate = db.settings.exchangeRate.KRW_USD || 1350;
        const getVal = (u: User) => (u.balanceKRW || 0) + (u.balanceUSD || 0) * usdRate;
        const myValue = getVal(currentUser!);
        const allValues = allUsers.map(getVal).sort((a,b) => b-a);
        const rank = allValues.findIndex(v => v <= myValue) + 1;
        const visualPercent = Math.max(0, Math.min(100, 100 - ((rank / allValues.length) * 100)));
        return { rank, visualPercent, total: allValues.length, textPercent: (rank / allValues.length) * 100 };
    }, [db.users, currentUser]);

    useEffect(() => {
        requestNotificationPermission();
        const handleOpenChat = () => setIsChatOpen(true);
        window.addEventListener('open-chat', handleOpenChat);
        return () => window.removeEventListener('open-chat', handleOpenChat);
    }, []);

    useEffect(() => {
        if (isPresident) setActiveTab('국정 운영'); 
        else if (isEasyMode || currentUser?.type === 'citizen') setActiveTab('이체');
        else if (currentUser?.type === 'mart') setActiveTab('물품관리'); 
        else if (isTeacher) setActiveTab('교사');
        else if (currentUser?.type === 'admin') setActiveTab('재정 관리'); 
        else setActiveTab('이체');
    }, [currentUser?.name, isPresident, isEasyMode]);

    const handlePayTax = async (tax: PendingTax) => {
        if (tax.status === 'paid' || (new Date() > new Date(tax.dueDate))) return;
        const total = tax.amount + (tax.penalty || 0);
        if (currentUser!.balanceKRW < total) return showModal("잔액 부족");
        if (!await showConfirm(`₩${total.toLocaleString()} 세금을 납부하시겠습니까?`)) return;
        
        await saveDb({ ...db }); // Optimistic Placeholder
        notify(currentUser!.name, "납부 완료");
    };

    const handleDismissAnnouncement = (id: number) => {
        setHiddenAnnouncements(p => [...p, id]);
        localStorage.setItem(`closed_ann_${id}`, 'true');
    };

    if (isAdminMode) return <div className="container mx-auto max-w-7xl relative min-h-screen"><AuctionModal /><div className="fixed bottom-6 right-6 z-[999]"><button onClick={() => setAdminMode(false)} className="w-14 h-14 rounded-full bg-red-600 text-white font-bold border-2 border-white shadow-xl">EXIT</button></div><AdminModeDashboard isDesignMode={false} /><Modal isOpen={isProfileOpen} onClose={() => setIsProfileOpen(false)} title="설정"><ProfileSettingsTab /></Modal></div>;

    return (
        <div className={`container mx-auto max-w-6xl pb-24 transition-all duration-300 ${isChatOpen ? 'sm:pr-[450px]' : ''}`}>
            <AuctionModal />
            <ChatSystem isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} onAttachTab={setActiveTab} />
            <div className="fixed bottom-20 md:bottom-6 right-6 z-[60] flex flex-col gap-2">
                <button onClick={() => setIsChatOpen(true)} className="w-14 h-14 rounded-full bg-blue-600 text-white shadow-xl flex items-center justify-center hover:scale-110 transition-transform"><LineIcon icon="chat" className="w-6 h-6" /></button>
            </div>
            
            <div className="flex items-center gap-4 mb-8 px-2">
                <div onClick={() => setIsProfileOpen(true)} className="w-16 h-16 rounded-full bg-green-500 text-white flex items-center justify-center overflow-hidden border-4 border-white shadow-lg cursor-pointer">{currentUser?.profilePic ? <img src={currentUser.profilePic} className="w-full h-full object-cover"/> : <span className="text-2xl font-bold">{formatName(currentUser?.name)[0]}</span>}</div>
                <div><h2 className="text-2xl font-bold flex items-center gap-2" onClick={() => setIsProfileOpen(true)}>{formatName(currentUser?.name, currentUser)}<span className="text-xs bg-gray-200 dark:bg-gray-700 px-2 py-0.5 rounded-full font-bold">{currentUser?.customJob || currentUser?.type}</span></h2>{isEasyMode && <span className="text-[10px] text-green-600 font-bold bg-green-100 px-2 rounded-full">쉬운 모드</span>}</div>
            </div>

            <div className="mb-4 space-y-2 px-2">
                {db.announcements?.filter(a => !hiddenAnnouncements.includes(a.id) && !localStorage.getItem(`closed_ann_${a.id}`)).map(a => (
                    <div key={a.id} className="relative p-3 rounded-xl text-xs shadow-sm bg-yellow-50 dark:bg-yellow-900/30 border-l-4 border-yellow-500 flex justify-between items-start gap-3">
                        <span className="font-bold flex-1">{a.content}</span>
                        <button onClick={() => handleDismissAnnouncement(a.id)} className="opacity-50 text-[10px] underline">다시 보지 않기</button>
                    </div>
                ))}
            </div>

            {pendingTaxes.length > 0 && (
                <div className="relative px-2 mb-6 pt-6">
                    {pendingTaxes.length > 1 && (
                        <div className="absolute -top-1 left-1/2 -translate-x-1/2 flex gap-4 z-20">
                            <button onClick={() => setCurrentTaxIndex(p => Math.max(0, p-1))} className="w-8 h-8 bg-black dark:bg-white rounded-full shadow-lg flex items-center justify-center"><LineIcon icon="arrow-left" className="w-4 h-4 text-white dark:text-black"/></button>
                            <button onClick={() => setCurrentTaxIndex(p => Math.min(pendingTaxes.length-1, p+1))} className="w-8 h-8 bg-black dark:bg-white rounded-full shadow-lg flex items-center justify-center"><LineIcon icon="arrow-right" className="w-4 h-4 text-white dark:text-black"/></button>
                        </div>
                    )}
                    {(() => {
                        const tax = pendingTaxes[currentTaxIndex] || pendingTaxes[0];
                        const isPaid = tax.status === 'paid';
                        return (
                            <div className={`p-6 rounded-2xl border-2 shadow-md transition-all ${isPaid ? 'bg-gray-100 dark:bg-gray-800 opacity-60' : 'bg-red-50 dark:bg-red-900/30 border-red-200'}`}>
                                <div className="flex justify-between items-center">
                                    <div><h4 className="font-bold text-lg">{isPaid ? '✅ 납부 완료' : '🧾 세금 고지서'}</h4><p className="text-sm opacity-70">{tax.type}</p><p className="text-2xl font-bold mt-1">₩ {(tax.amount + (tax.penalty || 0)).toLocaleString()}</p></div>
                                    <Button onClick={() => handlePayTax(tax)} disabled={isPaid} className={isPaid ? 'bg-gray-400' : 'bg-red-600'}>{isPaid ? '완료' : '납부'}</Button>
                                </div>
                            </div>
                        );
                    })()}
                </div>
            )}
            
            <Wallet onOpenStats={() => { loadAssetHistory(); setIsAssetModalOpen(true); }} />

            <div className="flex overflow-x-auto gap-4 mb-8 scrollbar-hide border-b border-gray-200 dark:border-gray-700 px-2">
                {tabs.map(t => (
                    <button key={t} onClick={() => setActiveTab(t)} className={`px-2 py-3 text-sm font-bold border-b-2 whitespace-nowrap ${activeTab === t ? 'border-green-500 text-green-600' : 'border-transparent text-gray-400'}`}>{t}</button>
                ))}
            </div>

            <div className="min-h-[400px] px-1 pb-20 relative">
                {activeTab === '이체' && <TransferTab />}
                {activeTab === '구매' && <PurchaseTab />}
                {activeTab === '환전' && <ExchangeTab />}
                {activeTab === '주식' && <StockTab />}
                {activeTab === '저금' && <SavingsTab />}
                {activeTab === '대출' && <LoanTab />}
                {activeTab === '부동산' && <RealEstateTab />}
                {activeTab === '거래 내역' && <TransactionHistoryTab />}
                {activeTab === '물품관리' && <MartProductTab />}
                {activeTab === '가게설정' && <MartSettingsTab />}
                {activeTab === '정부' && <GovDashboard />}
                {activeTab === '국정 운영' && <GovDashboard />}
                {activeTab === '교사' && <TeacherDashboard />}
                {activeTab === '운영 관리' && <AdminOperationTab />}
                {activeTab === '기준표' && <StandardTableTab />}
                {activeTab === '재정 관리' && <AdminFinanceTab />}
                {activeTab === '신청 관리' && <AdminRequestTab />}
            </div>

            <Modal isOpen={isProfileOpen} onClose={() => setIsProfileOpen(false)} title="설정"><ProfileSettingsTab /></Modal>
            
            <Modal isOpen={isAssetModalOpen} onClose={() => setIsAssetModalOpen(false)} title="자산 포트폴리오 분석" zIndex={5000}>
                 <div className="space-y-8 p-4">
                     <div className="py-6 bg-white dark:bg-[#1E1E1E] border border-gray-200 rounded-[24px] shadow-lg px-6">
                         <p className="text-xs text-gray-500 font-bold mb-1">RANKING (상위 %)</p>
                         <p className="text-4xl font-bold mb-4">상위 {rankInfo.textPercent.toFixed(1)}%</p>
                         <div className="relative pt-4">
                             <div className="h-4 w-full bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden relative border">
                                 <div className="absolute inset-0 bg-gradient-to-r from-gray-400 via-yellow-400 to-red-500 opacity-80"></div>
                                 <div className="absolute top-0 bottom-0 w-2 bg-black dark:bg-white shadow-xl z-10" style={{ left: `${rankInfo.visualPercent}%` }}></div>
                             </div>
                             <p className="text-[10px] text-right mt-1 opacity-50">전체 {rankInfo.total}명 중 {rankInfo.rank}위</p>
                         </div>
                     </div>
                     <Card>
                         <h4 className="font-bold mb-6 text-sm text-gray-500 uppercase">자산 구성 분석</h4>
                         <PieChart data={assetComposition} centerText={`₩${formatSmartMoney(totalAssets, true)}`} />
                         <div className="mt-6 space-y-4">
                             {assetComposition.map((item, i) => (
                                 <div key={i} className="flex flex-col gap-1">
                                     <div className="flex justify-between items-center text-xs">
                                         <span className="font-bold" style={{color: item.color}}>{item.label}</span>
                                         <span className="font-bold">₩{formatSmartMoney(item.value, true)} ({((item.value/totalAssets)*100).toFixed(1)}%)</span>
                                     </div>
                                     <div className="h-2 w-full bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                                         <div className="h-full rounded-full" style={{width: `${(item.value/totalAssets)*100}%`, backgroundColor: item.color}}></div>
                                     </div>
                                 </div>
                             ))}
                         </div>
                     </Card>
                     <Card><h4 className="font-bold mb-6 text-sm text-gray-500 uppercase">자산 변동 추이</h4><AssetHistoryChart data={currentAssetHistory || []} /></Card>
                 </div>
            </Modal>
        </div>
    );
};
