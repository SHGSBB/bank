import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useGame } from '../../context/GameContext';
import { Card, Button, Modal, Input, formatSmartMoney, formatName, MobileTabIcon } from '../Shared';
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

import { AdminFinanceTab } from '../tabs/admin/AdminFinanceTab';
import { AdminRequestTab } from '../tabs/admin/AdminRequestTab';
import { AdminOperationTab } from '../tabs/admin/AdminOperationTab';
import { StandardTableTab } from '../tabs/admin/StandardTableTab';
import { AdminRealEstateTab } from '../tabs/admin/AdminRealEstateTab';
import { AdminModeDashboard } from './AdminModeDashboard';
import { ChatSystem } from '../ChatSystem';

import { Announcement, User, TermDeposit, Loan, PendingTax } from '../../types';

const AssetHistoryChart: React.FC<{ data: { date: string, totalValue: number }[] }> = ({ data }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [hoverData, setHoverData] = useState<{ value: number, date: string, x: number } | null>(null);

    const chartData = useMemo(() => {
        return data.length > 30 ? data.slice(-30) : data;
    }, [data]);

    if (!chartData || chartData.length === 0) return <div className="h-40 flex items-center justify-center text-gray-500">데이터 없음</div>;

    const values = chartData.map(d => d.totalValue);
    const minVal = Math.min(...values) * 0.95;
    const maxVal = Math.max(...values) * 1.05;
    const range = maxVal - minVal || 1;

    const width = 1000;
    const height = 200;

    let points = "";
    if (minVal === maxVal || values.every(v => v === values[0])) {
        points = chartData.map((d, i) => {
            const x = (i / (Math.max(1, chartData.length - 1))) * width;
            return `${x},${height/2}`;
        }).join(' ');
    } else {
        points = chartData.map((d, i) => {
            const x = (i / (chartData.length - 1)) * width;
            const y = height - ((d.totalValue - minVal) / range) * height;
            return `${x},${y}`;
        }).join(' ');
    }

    const handleMouseMove = (e: React.MouseEvent | React.TouchEvent) => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
        const x = clientX - rect.left;
        
        const index = Math.min(Math.floor((x / rect.width) * chartData.length), chartData.length - 1);
        if (index >= 0) {
            setHoverData({
                value: chartData[index].totalValue,
                date: chartData[index].date,
                x: (index / (chartData.length - 1)) * rect.width
            });
        }
    };

    return (
        <div 
            ref={containerRef}
            className="w-full h-40 relative cursor-crosshair touch-none select-none bg-white dark:bg-[#1E1E1E] rounded-xl overflow-hidden border border-gray-100 dark:border-gray-800"
            onMouseMove={handleMouseMove}
            onTouchMove={handleMouseMove}
            onMouseLeave={() => setHoverData(null)}
            onTouchEnd={() => setHoverData(null)}
        >
            <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full" preserveAspectRatio="none">
                <polyline points={points} fill="none" stroke="#10B981" strokeWidth="3" strokeLinejoin="round" />
                {chartData.map((d, i) => {
                    const x = (i / (chartData.length - 1)) * width;
                    let y = height/2;
                    if (!(minVal === maxVal || values.every(v => v === values[0]))) {
                        y = height - ((d.totalValue - minVal) / range) * height;
                    }
                    return <circle key={i} cx={x} cy={y} r="4" fill="#10B981" stroke="white" strokeWidth="1" />;
                })}
            </svg>
            {hoverData && (
                <div 
                    className="absolute top-2 left-2 bg-black/80 text-white p-2 rounded text-xs pointer-events-none"
                >
                    <p>{new Date(hoverData.date).toLocaleDateString()}</p>
                    <p className="font-bold">₩ {Math.floor(hoverData.value).toLocaleString()}</p>
                </div>
            )}
        </div>
    );
};

const PieChart: React.FC<{ data: { label: string, value: number, color: string }[] }> = ({ data }) => {
    const total = data.reduce((acc, item) => acc + item.value, 0);
    let currentAngle = 0;

    if (total === 0) return <div className="text-center text-gray-400 p-10">데이터 없음</div>;

    return (
        <div className="flex flex-col items-center">
            <svg viewBox="0 0 100 100" className="w-48 h-48 transform -rotate-90">
                {data.map((item, index) => {
                    if (item.value <= 0) return null;
                    const angle = (item.value / total) * 360;
                    const x1 = 50 + 50 * Math.cos(Math.PI * currentAngle / 180);
                    const y1 = 50 + 50 * Math.sin(Math.PI * currentAngle / 180);
                    const x2 = 50 + 50 * Math.cos(Math.PI * (currentAngle + angle) / 180);
                    const y2 = 50 + 50 * Math.sin(Math.PI * (currentAngle + angle) / 180);
                    
                    const largeArcFlag = angle > 180 ? 1 : 0;
                    const pathData = `M 50 50 L ${x1} ${y1} A 50 50 0 ${largeArcFlag} 1 ${x2} ${y2} Z`;
                    
                    currentAngle += angle;
                    
                    return <path key={index} d={pathData} fill={item.color} stroke="white" strokeWidth="1" />;
                })}
            </svg>
            <div className="mt-4 grid grid-cols-2 gap-2 w-full">
                {data.map((item, i) => (
                    item.value > 0 && (
                        <div key={i} className="flex items-center justify-between text-xs p-2 bg-gray-50 dark:bg-gray-800 rounded">
                            <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }}></div>
                                <span>{item.label}</span>
                            </div>
                            <div className="text-right">
                                <span className="font-bold block">{((item.value / total) * 100).toFixed(1)}%</span>
                                <span className="text-[10px] opacity-70">₩{formatSmartMoney(item.value, true)}</span>
                            </div>
                        </div>
                    )
                ))}
            </div>
        </div>
    );
};

const Wallet: React.FC = () => {
    const { currentUser, db, triggerHaptic, currentAssetHistory, loadAssetHistory } = useGame();
    const [isAssetModalOpen, setIsAssetModalOpen] = useState(false);
    const [expandedCard, setExpandedCard] = useState<string | null>(null);
    
    // Load history when modal opens
    useEffect(() => {
        if (isAssetModalOpen) {
            loadAssetHistory();
        }
    }, [isAssetModalOpen]);

    const fmt = (num: number, full: boolean = false) => {
        if (full) return num.toLocaleString();
        return formatSmartMoney(num, true); 
    };

    const propertyValue = useMemo(() => {
        if (!db.realEstate || !db.realEstate.grid) return 0;
        return (db.realEstate.grid || [])
            .filter(p => p.owner === currentUser?.name && !p.tenant) // Exclude if tenant exists (rented out)
            .reduce((sum, p) => sum + p.price, 0);
    }, [db.realEstate, currentUser]);

    const savingsTotal = useMemo(() => {
        return (Object.values(db.termDeposits || {}) as TermDeposit[])
            .filter(d => d.owner === currentUser?.name && d.status === 'active')
            .reduce((sum, d) => sum + d.amount, 0);
    }, [db.termDeposits, currentUser]);
        
    const loanTotal = useMemo(() => {
        const user = db.users[currentUser?.name || ''];
        if (!user || !user.loans) return 0;
        const loans = Array.isArray(user.loans) ? user.loans : Object.values(user.loans);
        return loans
            .filter((l: Loan) => l.status === 'approved')
            .reduce((sum: number, l: Loan) => sum + l.amount, 0);
    }, [db.users, currentUser?.name]);

    const stockTotal = useMemo(() => {
        if (!currentUser?.stockHoldings || !db.stocks) return 0;
        let total = 0;
        Object.entries(currentUser.stockHoldings).forEach(([stockId, h]) => {
            const stock = db.stocks![stockId];
            const holding = h as { quantity: number }; 
            if (stock && holding.quantity > 0) {
                total += Math.floor(holding.quantity * stock.currentPrice);
            }
        });
        return total;
    }, [currentUser, db.stocks]);

    const usdToKrw = db.settings.exchangeRate.KRW_USD || 1350;
    const usdInKrw = (currentUser?.balanceUSD || 0) * usdToKrw;
    
    const totalAssets = (currentUser?.balanceKRW || 0) + usdInKrw + propertyValue + savingsTotal + stockTotal;
    const netAssets = totalAssets - loanTotal;

    const percentileRank = useMemo(() => {
        const allUsers = Object.values(db.users) as User[];
        const userAssets = allUsers.map(u => {
            const pVal = (db.realEstate.grid || []).filter(p => p.owner === u.name).reduce((sum, p) => sum + p.price, 0);
            return u.balanceKRW + (u.balanceUSD * usdToKrw) + pVal; 
        }).sort((a, b) => b - a);

        const myIndex = userAssets.findIndex(val => val <= totalAssets);
        if (myIndex === -1) return 100;
        return ((myIndex + 1) / allUsers.length) * 100;
    }, [db.users, totalAssets, db.realEstate]);

    const assetCards = [
        { id: 'krw', label: '현금 (KRW)', val: currentUser?.balanceKRW || 0, isUSD: false, color: 'text-gray-900 dark:text-white', bg: 'bg-white dark:bg-[#1E1E1E] border-gray-100 dark:border-gray-800' },
        { id: 'usd', label: '외화 (USD)', val: currentUser?.balanceUSD || 0, isUSD: true, color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-900/10 border-purple-100 dark:border-purple-900' },
        { id: 'stock', label: '주식 평가금', val: stockTotal, isUSD: false, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/10 border-red-100 dark:border-red-900' },
        { id: 'savings', label: '예금', val: savingsTotal, isUSD: false, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/10 border-blue-100 dark:border-blue-900' },
        { id: 'realestate', label: '부동산', val: propertyValue, isUSD: false, color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-900/10 border-orange-100 dark:border-orange-900' },
    ].filter(a => a.val > 0);

    const handleCardClick = (id: string) => {
        triggerHaptic();
        setExpandedCard(expandedCard === id ? null : id);
    };

    const expandedCardData = assetCards.find(c => c.id === expandedCard);

    return (
        <div className="mb-8 relative">
             <div className="flex justify-between items-center mb-4 px-2">
                <h3 className="text-2xl font-bold flex items-center gap-2">
                    자산 대시보드
                </h3>
                <button onClick={() => setIsAssetModalOpen(true)} className="text-xs sm:text-sm bg-black dark:bg-white text-white dark:text-black px-4 py-2 rounded-full hover:opacity-80 transition-all shadow-md font-bold flex items-center gap-1">
                    📊 통계 보기
                </button>
            </div>
            
            {/* Asset Cards Grid Container */}
            <div className="relative min-h-[8rem]">
                <div className={`grid grid-cols-2 md:grid-cols-3 gap-3 transition-opacity duration-300 ${expandedCard ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
                    {assetCards.length > 0 ? assetCards.map((a) => (
                        <div 
                            key={a.id}
                            onClick={() => handleCardClick(a.id)}
                            className={`
                                rounded-[24px] p-4 cursor-pointer select-none border shadow-sm flex flex-col justify-center items-center text-center
                                h-32 hover:scale-[1.02] transition-transform
                                ${a.bg}
                            `}
                        >
                            <p className={`font-bold uppercase tracking-wide opacity-70 ${a.color} text-xs mb-2`}>{a.label}</p>
                            <div className="w-full flex items-center justify-center overflow-hidden">
                                <p className={`font-bold text-xl truncate ${a.color}`}>
                                    {a.isUSD ? '$' : '₩'} {fmt(a.val)}
                                </p>
                            </div>
                        </div>
                    )) : (
                        <div className="col-span-full w-full h-32 flex items-center justify-center bg-gray-100 dark:bg-gray-800 rounded-[20px] border-2 border-dashed border-gray-300 dark:border-gray-700">
                            <p className="text-gray-500 font-bold">보유 자산이 없습니다.</p>
                        </div>
                    )}
                </div>

                {/* Expanded Card Overlay */}
                {expandedCardData && (
                    <div 
                        className={`
                            absolute inset-0 z-20 w-full h-full
                            rounded-[24px] p-6 cursor-pointer select-none border shadow-xl flex flex-col justify-center items-center text-center
                            animate-scale-in origin-center bg-white dark:bg-[#1E1E1E]
                            ${expandedCardData.bg}
                        `}
                        onClick={() => setExpandedCard(null)}
                    >
                        <p className={`font-bold uppercase tracking-wide opacity-70 ${expandedCardData.color} text-lg mb-4`}>{expandedCardData.label}</p>
                        <div className="w-full flex items-center justify-center overflow-hidden">
                            <p className={`font-bold text-4xl sm:text-5xl ${expandedCardData.color}`}>
                                {expandedCardData.isUSD ? '$' : '₩'} {expandedCardData.val.toLocaleString()}
                            </p>
                        </div>
                        <p className="mt-6 text-sm text-gray-500 animate-pulse">
                            클릭하여 축소
                        </p>
                    </div>
                )}
            </div>

            <Modal isOpen={isAssetModalOpen} onClose={() => setIsAssetModalOpen(false)} title="자산 포트폴리오 분석">
                 <div className="space-y-8 p-4">
                     <div className="text-center py-8 bg-gray-900 text-white rounded-[32px] shadow-2xl relative overflow-hidden">
                         <p className="text-sm text-gray-400 font-bold mb-2 uppercase tracking-widest">Net Worth (순자산)</p>
                         <p className="text-5xl font-bold text-green-400">₩ {fmt(netAssets)}</p>
                         <div className="mt-4 inline-block px-4 py-1 bg-white/10 rounded-full">
                             <p className="text-xs text-yellow-400 font-bold">상위 {percentileRank.toFixed(1)}%</p>
                         </div>
                         <p className="text-xs text-gray-500 mt-2">총 자산 - 총 부채</p>
                     </div>
                     <Card>
                         <h4 className="font-bold mb-4 text-sm text-gray-500 uppercase">자산 변동 추이 (최근 30건)</h4>
                         <AssetHistoryChart data={currentAssetHistory || []} />
                     </Card>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                         <Card>
                             <h4 className="font-bold mb-4 text-sm text-gray-500 uppercase">자산 구성 비율</h4>
                             <PieChart data={[{ label: '현금', value: currentUser?.balanceKRW || 0, color: '#10B981' }, { label: '주식', value: stockTotal, color: '#EF4444' }, { label: '부동산', value: propertyValue, color: '#F59E0B' }, { label: '예금', value: savingsTotal, color: '#3B82F6' }, { label: '외화', value: usdInKrw, color: '#8B5CF6' }]} />
                         </Card>
                     </div>
                 </div>
            </Modal>
        </div>
    );
};

export const Dashboard: React.FC = () => {
    const { currentUser, db, showPinModal, isAdminMode, setAdminMode, saveDb, notify, showModal, markToastPaid, showConfirm, clearPaidTax, logout } = useGame();
    const [activeTab, setActiveTab] = useState<string>('');
    const [isProfileOpen, setIsProfileOpen] = useState(false);
    const [isDesignMode, setIsDesignMode] = useState(false);
    const [hiddenAnnouncements, setHiddenAnnouncements] = useState<number[]>([]);
    
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
    const [mobileTabGroup, setMobileTabGroup] = useState<'finance' | 'assets' | 'gov'>('finance');
    const [showTaxBreakdown, setShowTaxBreakdown] = useState<PendingTax | null>(null);

    const isTeacher = currentUser?.subType === 'teacher' || currentUser?.type === 'root';
    const isPresident = currentUser?.isPresident;
    const isSpecialUser = currentUser?.type === 'admin' || currentUser?.type === 'root' || currentUser?.name === '한국은행';

    const serviceStatus = db.settings.serviceStatus || 'active';

    // Collect all pending taxes
    const pendingTaxes = useMemo(() => {
        let taxes: PendingTax[] = [];
        if (currentUser?.pendingTaxes) {
            taxes = [...currentUser.pendingTaxes];
        }
        // Legacy Support
        if (currentUser?.pendingTax) {
            const exists = taxes.find(t => t.id === currentUser.pendingTax!.id || t.sessionId === currentUser.pendingTax!.sessionId);
            if (!exists) {
                // @ts-ignore
                taxes.push({ ...currentUser.pendingTax, id: currentUser.pendingTax.sessionId }); // Ensure ID
            }
        }
        return taxes;
    }, [currentUser?.pendingTaxes, currentUser?.pendingTax]);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        const handlePop = (e: PopStateEvent) => {
            if (isChatOpen) setIsChatOpen(false);
            else if (isProfileOpen) setIsProfileOpen(false);
            else if (activeTab !== '이체' && !isMobile) setActiveTab('이체'); 
        };
        window.addEventListener('popstate', handlePop);
        return () => {
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('popstate', handlePop);
        };
    }, [isChatOpen, isProfileOpen, activeTab, isMobile]);

    useEffect(() => {
        if (currentUser?.isPresident) setActiveTab('국정 운영');
        else if (currentUser?.type === 'citizen') setActiveTab('이체');
        else if (currentUser?.type === 'mart') setActiveTab('물품관리');
        else if (currentUser?.type === 'government') setActiveTab('정부');
        else if (isTeacher) setActiveTab('교사');
        else if (currentUser?.type === 'admin') setActiveTab('재정 관리');
        else setActiveTab('이체');
    }, [currentUser?.name, currentUser?.type, isPresident]);

    const tabs = useMemo(() => {
        if (isTeacher) return ['교사', '운영 관리', '이체', '거래 내역'];
        if (isPresident) return ['국정 운영', '정부', '이체', '거래 내역'];
        if (currentUser?.type === 'government') return ['정부', '이체', '거래 내역'];
        if (currentUser?.type === 'citizen') return ['이체', '구매', '환전', '주식', '저금', '대출', '부동산', '거래 내역', '기준표'];
        if (currentUser?.type === 'mart') return ['물품관리', '가게설정', '이체', '주식', '거래 내역'];
        return ['재정 관리', '신청 관리', '운영 관리', '기준표', '거래 내역', '환전']; 
    }, [currentUser, isTeacher, isPresident]);

    const getMobileTabs = (group: string) => {
        if (group === 'finance') return tabs.filter(t => ['이체', '환전', '주식', '거래 내역'].includes(t));
        if (group === 'assets') return tabs.filter(t => ['저금', '대출', '부동산', '구매'].includes(t));
        if (group === 'gov') return tabs.filter(t => ['국정 운영', '정부', '교사', '재정 관리', '신청 관리', '운영 관리', '기준표', '물품관리', '가게설정'].includes(t));
        return [];
    };

    const activeAnnouncements = useMemo(() => {
        if (!db.announcements) return [];
        const now = new Date();
        return db.announcements
            .filter(a => {
                if (hiddenAnnouncements.includes(a.id)) return false;
                const isPermClosed = localStorage.getItem(`closed_ann_perm_${a.id}`);
                if (isPermClosed) return false;
                const isSessionClosed = sessionStorage.getItem(`closed_ann_session_${a.id}`);
                if (isSessionClosed) return false;
                
                return a.date && a.displayPeriodDays && (now.getTime() - new Date(a.date).getTime()) < (a.displayPeriodDays * 24 * 60 * 60 * 1000);
            })
            .sort((a, b) => {
                if (a.isImportant && !b.isImportant) return -1;
                if (!a.isImportant && b.isImportant) return 1;
                return new Date(b.date).getTime() - new Date(a.date).getTime();
            });
    }, [db.announcements, hiddenAnnouncements]);

    const handleProfileOpen = async () => {
        window.history.pushState({ modal: 'profile' }, '', '');
        if (!currentUser?.pin) {
             return setIsProfileOpen(true);
        }
        const pin = await showPinModal('설정 메뉴에 접근하려면 간편번호를 입력하세요.', currentUser.pin, currentUser.pinLength || 4, true);
        if (pin === currentUser.pin) {
            setIsProfileOpen(true);
        }
    };

    const handlePayTax = async (tax: PendingTax) => {
        if (tax.status === 'paid') return;
        const isOverdue = new Date() > new Date(tax.dueDate);
        if (isOverdue) return showModal("납부 기한이 지났습니다. 관리자에게 문의하세요.");

        const penalty = tax.penalty || 0;
        const totalAmount = tax.amount + penalty;
        if (currentUser!.balanceKRW < totalAmount) return showModal("잔액이 부족하여 세금을 납부할 수 없습니다.");
        if (!await showConfirm(`세금 ₩${totalAmount.toLocaleString()}을 납부하시겠습니까?`)) return;

        const newDb = { ...db };
        const user = newDb.users[currentUser!.name];
        const bank = newDb.users['한국은행'];
        const session = newDb.taxSessions![tax.sessionId];

        user.balanceKRW -= totalAmount;
        bank.balanceKRW += totalAmount;
        
        // Update specific tax in array
        if (user.pendingTaxes) {
            const taxIdx = user.pendingTaxes.findIndex(t => t.id === tax.id);
            if (taxIdx > -1) {
                user.pendingTaxes[taxIdx].status = 'paid';
            }
        }
        // Legacy fallback
        if (user.pendingTax && user.pendingTax.id === tax.id) {
            user.pendingTax.status = 'paid';
        }
        
        user.transactions = [...(user.transactions || []), { 
            id: Date.now(), type: 'tax', amount: -totalAmount, currency: 'KRW', description: penalty > 0 ? '세금 및 과태료 납부' : '세금 납부', date: new Date().toISOString() 
        }];
        bank.transactions = [...(bank.transactions || []), { 
            id: Date.now()+1, type: 'income', amount: totalAmount, currency: 'KRW', description: `${user.name} 세금 납부`, date: new Date().toISOString() 
        }];

        if (session) {
            session.collectedAmount += totalAmount;
            if (!session.paidUsers) session.paidUsers = [];
            session.paidUsers.push(user.name);
        }

        await saveDb(newDb);
        markToastPaid(tax.sessionId);
        notify(currentUser!.name, `세금 ₩${totalAmount.toLocaleString()} 납부가 완료되었습니다.`);
        
        // Simple Popup as requested
        alert(`납부 완료!\n금액: ₩${totalAmount.toLocaleString()}`);
    };

    const handleDismissTax = async (tax: PendingTax) => {
        if(tax.status === 'paid') {
            await clearPaidTax(tax.id);
        }
    };

    const handleDismissAnnouncement = (id: number, type: 'session' | 'perm') => {
        setHiddenAnnouncements(prev => [...prev, id]);
        if (type === 'perm') {
            localStorage.setItem(`closed_ann_perm_${id}`, 'true');
        } else {
            sessionStorage.setItem(`closed_ann_session_${id}`, 'true');
        }
    };

    const [serviceStopAcknowledged, setServiceStopAcknowledged] = useState(false);

    if (isAdminMode) {
        return (
            <div className="container mx-auto max-w-7xl relative min-h-screen">
                <AuctionModal />
                <div className="fixed bottom-6 right-6 flex flex-col gap-2 z-[999]">
                    <button onClick={() => setAdminMode(false)} className="w-14 h-14 rounded-full shadow-xl flex items-center justify-center text-xs font-bold bg-red-600 text-white border-2 border-white hover:bg-red-700 mb-2 transition-transform transform hover:scale-110" title="관리자 모드 나가기">EXIT</button>
                </div>
                <AdminModeDashboard isDesignMode={isDesignMode} />
                <Modal isOpen={isProfileOpen} onClose={() => setIsProfileOpen(false)} title="설정"><ProfileSettingsTab /></Modal>
            </div>
        );
    }

    const isTabLocked = db.settings.lockedFeatures?.[activeTab];

    // Service Status Blocks
    if (serviceStatus === 'ended' && !isSpecialUser) {
        return (
            <div className="fixed inset-0 z-[1000] bg-black/90 backdrop-blur-md flex items-center justify-center text-white">
                <div className="text-center p-8 border border-gray-700 rounded-2xl max-w-md w-full">
                    <div className="text-5xl mb-6">👋</div>
                    <h2 className="text-3xl font-bold mb-4 text-red-500">서비스 종료</h2>
                    <p className="text-gray-300 mb-8 whitespace-pre-wrap leading-relaxed">
                        서비스가 종료되었습니다.<br/>
                        그동안 이용해주셔서 감사합니다.
                    </p>
                    <Button onClick={logout} className="w-full bg-red-600 hover:bg-red-500">로그아웃</Button>
                </div>
            </div>
        );
    }

    const isServiceStopped = serviceStatus === 'maintenance' && !isSpecialUser;

    return (
        <div className={`container mx-auto max-w-6xl pb-24 transition-all duration-300 ${isChatOpen ? 'pr-[450px] hidden sm:block' : ''}`}>
            {isServiceStopped && !serviceStopAcknowledged && (
                <div className="fixed inset-0 z-[1000] bg-yellow-900/90 backdrop-blur-md flex items-center justify-center text-white p-4">
                    <div className="text-center p-8 bg-black/50 border border-yellow-500/50 rounded-2xl max-w-md w-full">
                        <div className="text-5xl mb-6">⚠️</div>
                        <h2 className="text-3xl font-bold mb-4 text-yellow-400">서비스 점검 중</h2>
                        <p className="text-gray-200 mb-8 whitespace-pre-wrap leading-relaxed">
                            현재 시스템 점검으로 인해<br/>모든 서비스 이용이 일시 중지되었습니다.<br/>
                            잠시 후 다시 시도해주세요.
                        </p>
                        <Button onClick={() => setServiceStopAcknowledged(true)} className="w-full bg-yellow-600 hover:bg-yellow-500 text-black font-bold">확인 (기능 제한됨)</Button>
                    </div>
                </div>
            )}

            {isServiceStopped && serviceStopAcknowledged && (
                <div className="fixed inset-0 z-[999] pointer-events-none bg-gray-500/20 backdrop-grayscale-[50%] flex items-start justify-center pt-20">
                    <div className="bg-yellow-500 text-black px-4 py-2 rounded-full font-bold shadow-lg animate-pulse pointer-events-auto">
                        ⚠️ 서비스 점검 중 (기능 제한)
                    </div>
                </div>
            )}

            <AuctionModal />
            <ChatSystem isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} onAttachTab={(t) => setActiveTab(t)} />
            
            {!isChatOpen && (
                <div className="fixed bottom-6 right-6 z-[999] hidden sm:block">
                    <button 
                        onClick={() => { setIsChatOpen(true); window.history.pushState({modal: 'chat'},'',''); }} 
                        className="w-14 h-14 rounded-full bg-white/80 dark:bg-black/80 backdrop-blur-md text-blue-600 dark:text-blue-400 shadow-xl flex items-center justify-center text-2xl hover:scale-110 transition-transform relative border border-white/20"
                    >
                        💬
                        {currentUser?.unreadMessageCount && currentUser.unreadMessageCount > 0 ? (
                            <span className="absolute top-0 right-0 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full border-2 border-white dark:border-black">
                                {currentUser.unreadMessageCount}
                            </span>
                        ) : null}
                    </button>
                </div>
            )}

            <div className="flex justify-between items-center mb-8 px-2 relative">
                <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-full bg-green-500 text-white flex items-center justify-center overflow-hidden border-4 border-white dark:border-gray-800 text-2xl font-bold cursor-pointer transition-transform transform hover:scale-105 shadow-lg" onClick={handleProfileOpen}>
                        {currentUser?.profilePic ? 
                            <img src={currentUser.profilePic} alt="profile" className="w-full h-full object-cover" /> : 
                            <span>{formatName(currentUser?.name)[0]}</span>
                        }
                    </div>
                    <div className="cursor-pointer" onClick={handleProfileOpen}>
                        <h2 className="text-2xl font-bold flex items-center gap-2">
                            {formatName(currentUser?.name, currentUser)}
                            <span className="text-xs bg-gray-200 dark:bg-gray-700 px-2 py-0.5 rounded-full text-gray-600 dark:text-gray-300 font-bold">
                                {isTeacher ? '선생님(관리자)' : (currentUser?.type === 'admin' ? '한국은행' : currentUser?.customJob || currentUser?.type)}
                            </span>
                        </h2>
                    </div>
                </div>
            </div>

             {activeAnnouncements.length > 0 && (
                 <div className="mb-4 space-y-3 px-2">
                    {activeAnnouncements.map(a => {
                            // High transparency banner
                            const bgColor = 'bg-yellow-50/50 dark:bg-yellow-900/30 backdrop-blur-sm border-l-4 border-yellow-500 text-yellow-900 dark:text-yellow-100';
                            return (
                                <div key={a.id} className={`relative p-3 rounded-xl text-xs sm:text-sm shadow-sm animate-fade-in ${bgColor} flex justify-between items-start gap-3`}>
                                   <div className="flex-1 pr-2">
                                       {a.category !== 'general' && <span className="font-bold mr-2">[{a.category}]</span>}
                                       <span className="whitespace-pre-wrap leading-relaxed block font-bold">{a.content}</span>
                                   </div>
                                   <div className="flex flex-col items-end gap-2 shrink-0">
                                        <button onClick={() => handleDismissAnnouncement(a.id, 'session')} className="text-black/50 hover:text-black font-bold text-lg leading-none p-1">✕</button>
                                        <button onClick={() => handleDismissAnnouncement(a.id, 'perm')} className="text-black/40 hover:text-black font-bold text-[10px] underline whitespace-nowrap">다시 보지 않기</button>
                                   </div>
                                </div>
                            );
                        })}
                 </div>
             )}

            {/* Multiple Tax Banners */}
            {pendingTaxes.map(tax => {
                const isPaid = tax.status === 'paid';
                const isOverdue = new Date() > new Date(tax.dueDate);
                return (
                    <div key={tax.id} className={`mx-2 mb-4 p-6 rounded-2xl border-2 shadow-md animate-fade-in cursor-pointer relative ${isPaid ? 'bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600' : 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800'}`} onClick={() => !isPaid && setShowTaxBreakdown(tax)}>
                        {isPaid && (
                            <button 
                                onClick={(e) => { e.stopPropagation(); handleDismissTax(tax); }}
                                className="absolute top-2 right-2 text-gray-400 hover:text-gray-600 font-bold p-2"
                            >
                                ✕
                            </button>
                        )}
                        <div className="flex justify-between items-center">
                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    <h4 className={`text-xl font-bold ${isPaid ? 'text-gray-500' : 'text-red-700 dark:text-red-300'}`}>
                                        {isPaid ? '✅ 납부 완료' : '🧾 세금 고지서'}
                                    </h4>
                                    {isOverdue && !isPaid && <span className="bg-red-600 text-white text-[10px] px-2 py-0.5 rounded font-bold">미납 (Overdue)</span>}
                                </div>
                                <p className={`text-sm ${isPaid ? 'text-gray-400' : 'text-red-600 dark:text-red-400'}`}>
                                    {tax.type === 'property' ? '종합부동산세' : (tax.type === 'asset' ? '재산세(자산)' : '소득세')} (클릭하여 상세)
                                </p>
                                <div className="mt-2">
                                    <p className={`text-2xl font-bold ${isPaid ? 'text-gray-400 decoration-line-through' : 'text-red-800 dark:text-white'}`}>
                                        ₩ {(tax.amount + (tax.penalty || 0)).toLocaleString()}
                                    </p>
                                    {tax.penalty ? <p className="text-xs text-red-600 font-bold">+ 과태료: ₩{tax.penalty.toLocaleString()}</p> : null}
                                </div>
                                <p className="text-xs text-red-500 mt-1">기한: {new Date(tax.dueDate).toLocaleString([], {month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit'})}</p>
                            </div>
                            <Button 
                                onClick={(e) => { e.stopPropagation(); handlePayTax(tax); }} 
                                className={`border-none py-3 px-6 shadow-xl ${isPaid ? 'bg-gray-400 cursor-default hover:bg-gray-400' : (isOverdue ? 'bg-gray-500 cursor-not-allowed' : 'bg-red-600 hover:bg-red-500 text-white')}`}
                                disabled={isPaid || isOverdue}
                            >
                                {isPaid ? '완료' : (isOverdue ? '만료' : '납부')}
                            </Button>
                        </div>
                    </div>
                );
            })}
            
            <Wallet />

            {!isMobile ? (
                <div className="flex overflow-x-auto gap-4 mb-8 scrollbar-hide border-b border-gray-200 dark:border-gray-700 px-2 pb-1">
                    {tabs.map(t => (
                        <button key={t} onClick={() => setActiveTab(t)} className={`px-2 py-3 text-base font-bold transition-all border-b-[3px] whitespace-nowrap ${activeTab === t ? 'border-green-500 text-green-600 dark:text-green-400' : 'border-transparent text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'}`}>
                            {t}
                        </button>
                    ))}
                </div>
            ) : (
                <div className="flex overflow-x-auto gap-2 mb-6 scrollbar-hide px-2">
                    {getMobileTabs(mobileTabGroup).map(t => (
                        <button key={t} onClick={() => setActiveTab(t)} className={`px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all shadow-sm ${activeTab === t ? 'bg-green-600 text-white' : 'bg-white dark:bg-[#1E1E1E] text-gray-500'}`}>
                            {t}
                        </button>
                    ))}
                </div>
            )}

            <div className="min-h-[400px] animate-slide-up px-1 pb-20 relative">
                {isTabLocked && (
                    <div className="absolute inset-0 z-20 bg-gray-200/50 dark:bg-black/50 backdrop-blur-sm rounded-xl flex flex-col items-center justify-center text-center p-6 border-2 border-gray-300 dark:border-gray-700 border-dashed">
                        <div className="text-4xl mb-4">🔒</div>
                        <h3 className="text-xl font-bold text-gray-700 dark:text-gray-300 mb-2">현재 잠금 상태인 탭입니다.</h3>
                        <p className="text-gray-500 text-sm">관리자가 이 기능의 사용을 제한했습니다.</p>
                    </div>
                )}
                
                <div className={isTabLocked ? 'opacity-30 pointer-events-none filter blur-[2px]' : ''}>
                    {activeTab === '이체' && <TransferTab />}
                    {activeTab === '구매' && <PurchaseTab />}
                    {activeTab === '환전' && <ExchangeTab />}
                    {activeTab === '주식' && <StockTab />}
                    {activeTab === '저금' && <SavingsTab />}
                    {activeTab === '대출' && <LoanTab />}
                    {activeTab === '부동산' && (currentUser?.type === 'admin' && !isTeacher ? <AdminRealEstateTab /> : <RealEstateTab />) }
                    {activeTab === '거래 내역' && <TransactionHistoryTab />}
                    
                    {activeTab === '물품관리' && <MartProductTab />}
                    {activeTab === '가게설정' && <MartSettingsTab />}
                    {activeTab === '정부' && <GovDashboard />}
                    {(activeTab === '국정 운영' && isPresident) && <GovDashboard />}
                    {activeTab === '교사' && <TeacherDashboard />}
                    
                    {activeTab === '기준표' && <StandardTableTab />}

                    {((currentUser?.type === 'admin') || (isPresident && (activeTab === '재정 관리' || activeTab === '신청 관리' || activeTab === '운영 관리'))) && (
                        <>
                            {activeTab === '재정 관리' && <AdminFinanceTab restricted={isPresident} />}
                            {activeTab === '신청 관리' && <AdminRequestTab />}
                            {activeTab === '운영 관리' && <AdminOperationTab restricted={isPresident} />}
                        </>
                    )}
                </div>
            </div>

            {isMobile && (
                <div className="fixed bottom-0 left-0 w-full bg-white/90 dark:bg-[#1E1E1E]/90 backdrop-blur-md border-t dark:border-gray-800 py-3 px-6 flex justify-between items-center z-50 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
                    <button onClick={() => { setMobileTabGroup('finance'); setActiveTab('이체'); }} className={`flex flex-col items-center gap-1 ${mobileTabGroup==='finance' ? 'text-green-600' : 'text-gray-400'}`}>
                        <MobileTabIcon icon="finance" />
                        <span className="text-[10px] font-bold">금융</span>
                    </button>
                    <button onClick={() => { setMobileTabGroup('assets'); setActiveTab('부동산'); }} className={`flex flex-col items-center gap-1 ${mobileTabGroup==='assets' ? 'text-green-600' : 'text-gray-400'}`}>
                        <MobileTabIcon icon="assets" />
                        <span className="text-[10px] font-bold">자산</span>
                    </button>
                    <button onClick={() => { setIsChatOpen(true); }} className={`flex flex-col items-center gap-1 relative text-gray-400`}>
                        <MobileTabIcon icon="chat" />
                        <span className="text-[10px] font-bold">채팅</span>
                        {currentUser?.unreadMessageCount ? <span className="absolute -top-1 -right-1 bg-red-500 w-3 h-3 rounded-full border border-white"></span> : null}
                    </button>
                    {(currentUser?.type === 'government' || currentUser?.type === 'admin' || isTeacher || isPresident || currentUser?.type === 'mart') && (
                        <button onClick={() => { setMobileTabGroup('gov'); setActiveTab(isTeacher ? '교사' : (isPresident ? '국정 운영' : (currentUser?.type==='mart' ? '물품관리' : '정부'))); }} className={`flex flex-col items-center gap-1 ${mobileTabGroup==='gov' ? 'text-green-600' : 'text-gray-400'}`}>
                            <MobileTabIcon icon="gov" />
                            <span className="text-[10px] font-bold">{currentUser?.type === 'mart' ? '마트' : '공무'}</span>
                        </button>
                    )}
                </div>
            )}

            <Modal isOpen={isProfileOpen} onClose={() => setIsProfileOpen(false)} title="설정">
                <ProfileSettingsTab />
            </Modal>

            <Modal isOpen={!!showTaxBreakdown} onClose={() => setShowTaxBreakdown(null)} title="세금 상세 내역">
                <div className="space-y-4">
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 whitespace-pre-wrap leading-relaxed bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                        {showTaxBreakdown?.breakdown || "상세 내역이 없습니다."}
                    </p>
                    <div className="border-t pt-2 flex justify-between items-center font-bold text-lg">
                        <span>총 납부액</span>
                        <span className="text-red-600">₩ {(showTaxBreakdown ? (showTaxBreakdown.amount + (showTaxBreakdown.penalty||0)) : 0).toLocaleString()}</span>
                    </div>
                    <Button onClick={() => setShowTaxBreakdown(null)} className="w-full">닫기</Button>
                </div>
            </Modal>
        </div>
    );
};