
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
import { ChatSystem } from '../ChatSystem';
import { BillTab } from '../tabs/BillTab'; // Import BillTab
import { Announcement, User, TermDeposit, Loan as LoanType, PendingTax, StockHolding } from '../../types';

const Wallet: React.FC<{ onOpenStats: () => void }> = ({ onOpenStats }) => {
    // ... same content as before ...
    const { currentUser, db, triggerHaptic } = useGame();
    const [expandedCard, setExpandedCard] = useState<string | null>(null);
    const fmt = (num: number) => formatSmartMoney(num, currentUser?.preferences?.assetDisplayMode === 'rounded');
    
    const propVal = useMemo(() => (db.realEstate.grid || []).filter(p => p.owner === currentUser?.name && !p.tenant).reduce((s, p) => s + p.price, 0), [db.realEstate, currentUser]);
    const savingsTotal = useMemo(() => (Object.values(db.termDeposits || {}) as TermDeposit[]).filter(d => d.owner === currentUser?.name && d.status === 'active').reduce((s, d) => s + d.amount, 0), [db.termDeposits, currentUser]);
    const stockTotal = useMemo(() => { if (!currentUser?.stockHoldings || !db.stocks) return 0; return Object.entries(currentUser.stockHoldings).reduce((t, [id, h]) => t + (db.stocks![id]?.currentPrice || 0) * (h as StockHolding).quantity, 0); }, [currentUser, db.stocks]);
    
    const assetCards = [
        { id: 'krw', label: '현금 (KRW)', val: currentUser?.balanceKRW || 0, isUSD: false, bg: 'bg-[#1C1C1E] border-gray-800' },
        { id: 'usd', label: '외화 (USD)', val: currentUser?.balanceUSD || 0, isUSD: true, bg: 'bg-[#1C1C1E] border-gray-800' },
        { id: 'stock', label: '주식 평가금', val: stockTotal, isUSD: false, bg: 'bg-[#1C1C1E] border-gray-800' },
        { id: 'savings', label: '예금', val: savingsTotal, isUSD: false, bg: 'bg-[#1C1C1E] border-gray-800' },
        { id: 'realestate', label: '부동산', val: propVal, isUSD: false, bg: 'bg-[#1C1C1E] border-gray-800' },
    ].filter(a => a.val > 0 || a.id === 'krw' || a.id === 'usd');

    const expandedCardData = assetCards.find(c => c.id === expandedCard);

    return (
        <div className="mb-8 relative z-0">
             <div className="flex justify-between items-center mb-4 px-2">
                <h3 className="text-2xl font-bold">자산 대시보드</h3>
                {!currentUser?.preferences?.isEasyMode && (
                    <button onClick={onOpenStats} className="text-sm bg-white text-black px-4 py-2 rounded-full font-bold shadow-md">
                        통계
                    </button>
                )}
            </div>
            <div className="relative min-h-[8rem] w-full overflow-hidden rounded-[24px]">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                    {assetCards.slice(0, 2).map((a) => (
                        <div key={a.id} onClick={() => setExpandedCard(a.id)} className={`rounded-[24px] p-6 cursor-pointer border shadow-sm flex flex-col justify-center items-center text-center h-40 hover:scale-[1.01] transition-transform ${a.bg}`}>
                            <p className="font-bold opacity-70 text-sm mb-3">{a.label}</p>
                            <p className="font-black text-3xl truncate">
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
    const { currentUser, db, isAdminMode, setAdminMode, saveDb, notify, showModal, showConfirm, clearPaidTax, logout, triggerHaptic, loadAssetHistory, currentAssetHistory, requestNotificationPermission, updateUser, payTax, dismissTax } = useGame();
    const [activeTab, setActiveTab] = useState<string>('');
    const [isProfileOpen, setIsProfileOpen] = useState(false);
    const [isAssetModalOpen, setIsAssetModalOpen] = useState(false);
    const [isChatOpen, setIsChatOpen] = useState(false);
    
    // Tax States
    const [taxDetail, setTaxDetail] = useState<PendingTax | null>(null);
    const [bannerIndex, setBannerIndex] = useState(0);

    const isBOK = currentUser?.name === '한국은행' || currentUser?.govtRole === '한국은행장' || currentUser?.customJob === '한국은행장';
    const isTeacher = currentUser?.subType === 'teacher' || currentUser?.type === 'root';
    const isPresident = currentUser?.isPresident;
    const isEasyMode = currentUser?.preferences?.isEasyMode && currentUser?.type === 'citizen';
    
    // Tax Logic
    const myTaxes = useMemo(() => currentUser?.pendingTaxes || [], [currentUser?.pendingTaxes]);
    const now = new Date();

    const actionableTaxes = myTaxes.filter(t => {
        const isPending = t.status === 'pending';
        const isPaid = t.status === 'paid';
        const isOverdue = new Date(t.dueDate).getTime() <= now.getTime();
        return (isPending && !isOverdue) || isPaid;
    });

    const overdueTaxes = myTaxes.filter(t => t.status === 'pending' && new Date(t.dueDate).getTime() <= now.getTime());

    // Cycle Banner if multiple
    useEffect(() => {
        if (actionableTaxes.length > 1) {
            const timer = setInterval(() => {
                setBannerIndex(prev => (prev + 1) % actionableTaxes.length);
            }, 5000);
            return () => clearInterval(timer);
        }
    }, [actionableTaxes.length]);

    const currentBannerTax = actionableTaxes[bannerIndex] || actionableTaxes[0];

    // Tabs
    const tabs = useMemo(() => {
        if (isBOK) return ['재정 관리', '신청 관리', '운영 관리', '기준표', '거래 내역', '환전'];
        if (isEasyMode) return ['이체', '구매', '저금', '대출', '고지서', '환전']; // Easy mode citizen
        if (isTeacher) return ['교사', '운영 관리', '이체', '거래 내역'];
        if (isPresident) return ['국정 운영', '정부', '이체', '거래 내역'];
        if (currentUser?.type === 'government') return ['정부', '이체', '거래 내역', '고지서'];
        if (currentUser?.type === 'citizen') return ['이체', '구매', '환전', '주식', '저금', '대출', '부동산', '고지서', '거래 내역', '기준표'];
        if (currentUser?.type === 'mart') return ['물품관리', '가게설정', '이체', '주식', '고지서', '거래 내역'];
        if (currentUser?.type === 'admin') return ['재정 관리', '신청 관리', '운영 관리', '기준표', '거래 내역', '환전'];
        return ['이체', '거래 내역'];
    }, [currentUser, isTeacher, isPresident, isEasyMode, isBOK]);

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
    }, [currentUser, db.realEstate, db.termDeposits, db.stocks, db.settings.exchangeRate.KRW_USD]);

    const totalAssets = useMemo(() => assetComposition.reduce((sum, item) => sum + item.value, 0), [assetComposition]);

    const myPercentile = useMemo(() => {
        if (!currentUser || !db.users) return 0;
        const usdRate = db.settings.exchangeRate.KRW_USD || 1350;
        const allUsers = Object.values(db.users) as User[];
        
        const getUserTotal = (u: User) => {
            const prop = (db.realEstate.grid || []).filter(p => p.owner === u.name && !p.tenant).reduce((s, p) => s + p.price, 0);
            const sav = (Object.values(db.termDeposits || {}) as TermDeposit[]).filter(d => d.owner === u.name && d.status === 'active').reduce((s, d) => s + d.amount, 0);
            const stock = Object.entries(u.stockHoldings || {}).reduce((t, [id, h]) => t + (db.stocks?.[id]?.currentPrice || 0) * (h as StockHolding).quantity, 0);
            return (u.balanceKRW || 0) + (u.balanceUSD || 0) * usdRate + prop + sav + stock;
        };

        const sortedTotals = allUsers.map(getUserTotal).sort((a, b) => b - a);
        const myVal = getUserTotal(currentUser);
        const myIdx = sortedTotals.indexOf(myVal);
        if (myIdx === -1) return 100;
        return ((myIdx) / Math.max(1, sortedTotals.length)) * 100;
    }, [db, currentUser]);

    useEffect(() => {
        requestNotificationPermission();
        const handleOpenChat = () => setIsChatOpen(true);
        window.addEventListener('open-chat', handleOpenChat);
        return () => window.removeEventListener('open-chat', handleOpenChat);
    }, []);

    useEffect(() => {
        if (isBOK) setActiveTab('재정 관리');
        else if (isPresident) setActiveTab('국정 운영'); 
        else if (isEasyMode || currentUser?.type === 'citizen') setActiveTab('이체');
        else if (currentUser?.type === 'mart') setActiveTab('물품관리'); 
        else if (isTeacher) setActiveTab('교사');
        else if (currentUser?.type === 'admin') setActiveTab('재정 관리'); 
        else setActiveTab('이체');
    }, [currentUser?.name, isPresident, isEasyMode, isBOK, currentUser?.type, isTeacher]);

    const getRoleName = () => {
        const t = currentUser?.type;
        if(t === 'citizen') return '시민';
        if(t === 'mart') return '마트';
        if(t === 'government') return '공무원';
        if(t === 'admin') return '관리자';
        if(t === 'teacher') return '교사';
        return t;
    };

    const getTaxName = (type: string) => {
        const map: Record<string, string> = { 'real_estate': '종합부동산세', 'income': '소득세', 'asset': '재산세', 'fine': '과태료', 'acquisition': '취득세' };
        return map[type] || type;
    };

    return (
        <div className={`container mx-auto max-w-6xl pb-24 transition-all duration-300 ${isChatOpen ? 'sm:pr-[400px]' : ''}`}>
            <AuctionModal />
            {isChatOpen && <ChatSystem isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} onAttachTab={setActiveTab} />}
            
            <div className="fixed bottom-20 md:bottom-6 right-6 z-[60] flex flex-col gap-2">
                {!isChatOpen && (
                    <button onClick={() => setIsChatOpen(true)} className="w-14 h-14 rounded-full bg-blue-600 text-white shadow-xl flex items-center justify-center hover:scale-110 transition-transform">
                        <LineIcon icon="chat" className="w-6 h-6" />
                    </button>
                )}
            </div>
            
            {/* Tax Banner Area (Top Notification) */}
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

                {/* Overdue Warning */}
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

            <Wallet onOpenStats={() => { loadAssetHistory(); setIsAssetModalOpen(true); }} />

            <div className="flex overflow-x-auto gap-8 mb-8 scrollbar-hide border-b border-gray-800 px-2">
                {tabs.map(t => (
                    <button key={t} onClick={() => setActiveTab(t)} className={`pb-3 text-sm font-black whitespace-nowrap border-b-2 transition-all ${activeTab === t ? 'border-green-500 text-green-500' : 'border-transparent text-gray-500'}`}>{t}</button>
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
            </div>

            <Modal isOpen={isProfileOpen} onClose={() => setIsProfileOpen(false)} title="설정" wide><ProfileSettingsTab /></Modal>
            
            {/* Tax Detail Modal */}
            <Modal isOpen={!!taxDetail} onClose={() => setTaxDetail(null)} title="세금 상세 내역">
                {taxDetail && (
                    <div className="space-y-4">
                        <div className="text-center p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
                            <p className="text-sm text-gray-500">{getTaxName(taxDetail.type)}</p>
                            <p className="text-3xl font-black mt-2">₩{taxDetail.amount.toLocaleString()}</p>
                        </div>
                        <div className="p-4 border rounded-xl">
                            <h5 className="font-bold mb-2">산출 근거</h5>
                            <p className="text-sm whitespace-pre-wrap leading-relaxed text-gray-600 dark:text-gray-300">
                                {taxDetail.breakdown}
                            </p>
                        </div>
                        {taxDetail.status === 'pending' && (
                            <Button className="w-full py-3" onClick={() => { payTax(taxDetail); setTaxDetail(null); }}>지금 납부하기</Button>
                        )}
                    </div>
                )}
            </Modal>
            
            <Modal isOpen={isAssetModalOpen} onClose={() => setIsAssetModalOpen(false)} title="자산 분석 및 통계" wide zIndex={5000}>
                 <div className="space-y-8 p-4">
                     <div className="bg-gray-50 dark:bg-gray-900 p-6 rounded-3xl text-center border border-gray-100 dark:border-gray-800 relative overflow-hidden">
                        <p className="text-sm font-bold text-gray-500 mb-1 uppercase">나의 자산 랭킹</p>
                        <h4 className="text-4xl font-black text-green-600 mb-4 relative z-10">상위 {myPercentile.toFixed(1)}%</h4>
                        
                        <div className="w-full max-w-md mx-auto h-4 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden relative border border-gray-100 dark:border-gray-700">
                             <div 
                                className="h-full bg-gradient-to-r from-green-600 to-green-400 transition-all duration-1000 ease-out" 
                                style={{ width: `${100 - myPercentile}%` }}
                             />
                             <div className="absolute top-0 bottom-0 w-1 bg-white shadow-xl z-20" style={{ left: `${100 - myPercentile}%` }} />
                        </div>
                        <div className="flex justify-between w-full max-w-md mx-auto mt-1 text-[10px] font-bold text-gray-400 uppercase">
                            <span>최저</span>
                            <span>현재 순위</span>
                            <span>최상위</span>
                        </div>
                        <p className="text-xs text-gray-400 mt-4">전체 성화국 시민 자산 총액 비교 기준</p>
                     </div>

                     <Card>
                         <h4 className="font-bold mb-6 text-sm text-gray-500 uppercase text-center">나의 재산 비율</h4>
                         <PieChart data={assetComposition} centerText={`₩${formatSmartMoney(totalAssets, true)}`} />
                         <div className="mt-6 space-y-4 grid grid-cols-1 md:grid-cols-2 gap-x-12">
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

                     <Card>
                        <h4 className="font-bold mb-6 text-sm text-gray-500 uppercase">자산 변동 내역</h4>
                        {currentAssetHistory.length === 0 ? (
                            <p className="text-center py-10 text-gray-400 text-sm italic">변동 기록이 충분하지 않습니다.</p>
                        ) : (
                            <div className="space-y-3">
                                {[...currentAssetHistory].reverse().slice(0, 7).map((h, i) => (
                                    <div key={i} className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
                                        <span className="text-sm font-bold text-gray-600">{new Date(h.date).toLocaleDateString()}</span>
                                        <span className="text-sm font-black">₩ {formatSmartMoney(h.totalValue, true)}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                     </Card>
                 </div>
            </Modal>
        </div>
    );
};
