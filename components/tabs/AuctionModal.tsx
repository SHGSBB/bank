
import React, { useState, useEffect, useRef } from 'react';
import { useGame } from '../../context/GameContext';
import { Button, Input, Modal, MoneyInput, Card } from '../Shared';
import { AuctionBid, User } from '../../types';

export const AuctionModal: React.FC = () => {
    const { db, currentUser, saveDb, notify, respondToAuctionInvite } = useGame();
    const auction = db.auction;
    
    // View Mode: 'popup' (full modal), 'widget' (floating card), 'minimized' (title bar only)
    const [viewMode, setViewMode] = useState<'popup' | 'widget' | 'minimized'>('widget');
    
    // Drag Logic
    const [pos, setPos] = useState({ x: 20, y: window.innerHeight - 150 });
    const [isDragging, setIsDragging] = useState(false);
    const dragStartRef = useRef<{ x: number, y: number } | null>(null);
    const posStartRef = useRef<{ x: number, y: number } | null>(null);

    // Form / Interaction State
    const [inviteSearch, setInviteSearch] = useState('');
    const [bidAmount, setBidAmount] = useState('');
    const [isSplitModalOpen, setIsSplitModalOpen] = useState(false);
    const [splitShares, setSplitShares] = useState<Record<string, string>>({}); 

    // Winner Modal State
    const [showWinnerModal, setShowWinnerModal] = useState(false);

    // Timer
    const [timeLeft, setTimeLeft] = useState(60);

    const scrollRef = useRef<HTMLDivElement>(null);
    const bids = auction?.bids || [];

    // Notifications
    const pendingInvite = currentUser?.notifications 
        ? (Array.isArray(currentUser.notifications) ? currentUser.notifications : Object.values(currentUser.notifications))
            .find(n => n.action === 'auction_invite')
        : null;

    useEffect(() => {
        if (scrollRef.current && (viewMode === 'popup' || viewMode === 'widget')) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [bids, viewMode]);

    // Timer & Auto End Logic
    useEffect(() => {
        if (!auction?.isActive || !auction.endTime || auction.isPaused) return;
        
        const interval = setInterval(() => {
            const now = Date.now();
            const remaining = Math.max(0, Math.ceil((auction.endTime! - now) / 1000));
            setTimeLeft(remaining);
            
            // Auto End Logic - 5s buffer
            const startTime = new Date(auction.startTime).getTime();
            const startBuffer = 5000; 

            if (remaining <= 0 && auction.status === 'active' && (now - startTime > startBuffer)) {
                // Only admin/host triggers the end to avoid conflicts, or use server-side logic (simulated here)
                const isHost = currentUser?.type === 'admin' || currentUser?.subType === 'teacher' || currentUser?.type === 'root';
                // Fallback: any user can trigger if it's way past time (e.g. 10s) to ensure it closes
                if (isHost || (now - auction.endTime! > 10000)) {
                    handleAutoEnd();
                }
            }
        }, 1000);
        return () => clearInterval(interval);
    }, [auction?.endTime, auction?.isActive, auction?.status, auction?.isPaused, auction?.startTime]);

    // Show Winner Modal Trigger (Once per auction end per device)
    useEffect(() => {
        if (auction?.status === 'ended' && auction.winner && auction.id) {
            const seenKey = `seen_auction_winner_${auction.id}`;
            const hasSeen = localStorage.getItem(seenKey);
            
            if (!hasSeen) {
                setShowWinnerModal(true);
            }
        }
    }, [auction?.status, auction?.winner, auction?.id]);

    const handleCloseWinnerModal = () => {
        if (auction?.id) {
            localStorage.setItem(`seen_auction_winner_${auction.id}`, 'true');
        }
        setShowWinnerModal(false);
    };

    const handleAutoEnd = async () => {
        const newDb = { ...db };
        if (!newDb.auction || newDb.auction.status === 'ended') return;
        
        newDb.auction.isActive = false;
        newDb.auction.status = 'ended';
        
        const winnerBid = newDb.auction.bids.length > 0 ? newDb.auction.bids[newDb.auction.bids.length - 1] : null;
        
        if (winnerBid) {
            newDb.auction.winner = winnerBid.bidder;
            newDb.auction.winningBid = winnerBid.amount;
            
            // Payment Logic
            if (winnerBid.contributors) {
                // Team
                for (const c of winnerBid.contributors) {
                    const user = newDb.users[c.name];
                    if (user) {
                        user.balanceKRW -= c.amount;
                        user.transactions = [...(user.transactions || []), {
                            id: Date.now(), type: 'auction', amount: -c.amount, currency: 'KRW', description: `경매 낙찰(팀): ${newDb.auction.item.name}`, date: new Date().toISOString()
                        }];
                        notify(c.name, `경매 낙찰! 분담금 ₩${c.amount.toLocaleString()} 차감.`, true);
                    }
                }
            } else {
                // Single
                const user = newDb.users[winnerBid.bidder];
                if (user && user.balanceKRW >= winnerBid.amount) {
                    user.balanceKRW -= winnerBid.amount;
                    user.transactions = [...(user.transactions || []), {
                        id: Date.now(), type: 'auction', amount: -winnerBid.amount, currency: 'KRW', description: `경매 낙찰: ${newDb.auction.item.name}`, date: new Date().toISOString()
                    }];
                    notify(winnerBid.bidder, `경매 낙찰! ₩${winnerBid.amount.toLocaleString()} 차감.`, true);
                }
            }
            notify('ALL', `경매 종료! 낙찰자: ${winnerBid.bidder}`, true);
        } else {
            notify('ALL', `경매가 유찰되었습니다.`, true);
        }
        await saveDb(newDb);
    };

    // Drag Handlers
    const handleDragStart = (e: React.MouseEvent | React.TouchEvent) => {
        setIsDragging(true);
        const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
        dragStartRef.current = { x: clientX, y: clientY };
        posStartRef.current = { x: pos.x, y: pos.y };
    };

    const handleDragMove = (e: React.MouseEvent | React.TouchEvent) => {
        if (!isDragging || !dragStartRef.current || !posStartRef.current) return;
        e.preventDefault(); 
        const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
        
        const dx = clientX - dragStartRef.current.x;
        const dy = clientY - dragStartRef.current.y;
        
        setPos({
            x: posStartRef.current.x + dx,
            y: posStartRef.current.y + dy
        });
    };

    const handleDragEnd = () => {
        setIsDragging(false);
        const winW = window.innerWidth;
        const winH = window.innerHeight;
        
        let finalX = Math.max(0, Math.min(winW - 50, pos.x));
        let finalY = Math.max(0, Math.min(winH - 50, pos.y));
        setPos({ x: finalX, y: finalY });
    };

    const isHost = currentUser?.subType === 'teacher' || currentUser?.type === 'root' || currentUser?.type === 'admin';

    // Team Logic
    const myTeam = currentUser ? (auction?.teams?.[currentUser.name] || []) : [];
    const acceptedMembers = myTeam.filter(m => m.status === 'accepted');

    const handleInvite = async (targetName: string) => {
        if (targetName === currentUser?.name) return;
        if (!auction) return;
        
        const target = db.users[targetName];
        if (!target) return notify(currentUser!.name, "존재하지 않는 사용자입니다.");
        
        if (myTeam.length >= 2) return notify(currentUser!.name, "최대 2명까지 초대 가능합니다.");
        if (myTeam.find(m => m.name === targetName)) return notify(currentUser!.name, "이미 초대한 사용자입니다.");

        const newDb = { ...db };
        if (!newDb.auction) return;
        if (!newDb.auction.teams) newDb.auction.teams = {};
        if (!newDb.auction.teams[currentUser!.name]) newDb.auction.teams[currentUser!.name] = [];
        
        newDb.auction.teams[currentUser!.name].push({ name: targetName, status: 'pending' });
        await saveDb(newDb);

        notify(targetName, `${currentUser!.name}님이 경매 팀에 초대했습니다.`, true, 'auction_invite', { from: currentUser!.name });
        setInviteSearch('');
    };

    const submitBid = async (totalAmount: number, contributors: { name: string, amount: number }[]) => {
        for (const c of contributors) {
            const user = db.users[c.name];
            if (user.balanceKRW < c.amount) {
                return notify(currentUser!.name, `${c.name}님의 잔액이 부족합니다.`);
            }
        }

        const newDb = { ...db };
        const bid: AuctionBid = {
            bidder: contributors.length > 1 ? `${currentUser!.name} 외 ${contributors.length - 1}명` : currentUser!.name,
            amount: totalAmount,
            timestamp: Date.now(),
            contributors
        };
        
        if (!newDb.auction) return;
        newDb.auction.bids = [...(newDb.auction.bids || []), bid].slice(-50);
        newDb.auction.currentPrice = totalAmount;
        
        const resetDuration = (newDb.auction.timerDuration || 10) * 1000;
        newDb.auction.endTime = Date.now() + resetDuration;

        await saveDb(newDb);
        setBidAmount('');
        setIsSplitModalOpen(false);
    };

    const handleBidClick = () => {
        if(!auction || auction.isPaused) return;
        const amount = parseInt(bidAmount);
        if (isNaN(amount) || amount <= auction.currentPrice) return notify(currentUser!.name, "현재가보다 높은 금액을 입찰하세요.");
        
        if (acceptedMembers.length > 0) {
            const initialShares: Record<string, string> = { [currentUser!.name]: '5' };
            acceptedMembers.forEach(m => initialShares[m.name] = '5');
            setSplitShares(initialShares);
            setIsSplitModalOpen(true);
        } else {
            submitBid(amount, [{ name: currentUser!.name, amount }]);
        }
    };

    const handleSplitSubmit = () => {
        const totalAmount = parseInt(bidAmount);
        const totalShares = (Object.values(splitShares) as string[]).reduce((sum, s) => sum + (parseInt(s) || 0), 0);
        if (totalShares !== 10) return notify(currentUser!.name, "지분의 합은 10이어야 합니다.");
        
        const contributors = (Object.entries(splitShares) as [string, string][]).map(([name, shareStr]) => {
            const share = parseInt(shareStr) || 0;
            return { name, amount: Math.floor(totalAmount * (share / 10)) };
        });

        const sumCalc = contributors.reduce((s, c) => s + c.amount, 0);
        const diff = totalAmount - sumCalc;
        if (diff !== 0) {
            const leader = contributors.find(c => c.name === currentUser!.name);
            if (leader) leader.amount += diff;
        }

        submitBid(totalAmount, contributors);
    };

    const handleAddBidAmount = (amountToAdd: number) => {
        let currentVal = parseInt(bidAmount);
        if (isNaN(currentVal)) {
            currentVal = auction?.currentPrice ?? 0;
        }
        setBidAmount((currentVal + amountToAdd).toString());
    };

    const extendTime = async (seconds: number) => {
        const newDb = { ...db };
        if (newDb.auction && newDb.auction.endTime) {
            newDb.auction.endTime += seconds * 1000;
            await saveDb(newDb);
        }
    };

    const renderBidControls = () => (
        <div className={`space-y-3 ${auction?.isPaused ? 'opacity-50 pointer-events-none' : ''}`}>
             <div className="flex gap-2 items-center min-h-[30px]">
                {myTeam.length > 0 && (
                    <div className="flex -space-x-2">
                        <div className="w-8 h-8 rounded-full bg-green-500 text-white text-xs flex items-center justify-center border-2 border-white z-10">
                            {currentUser?.profilePic ? <img src={currentUser.profilePic} className="w-full h-full object-cover rounded-full"/> : "나"}
                        </div>
                        {myTeam.map(m => (
                            <div key={m.name} className={`w-8 h-8 rounded-full text-white text-xs flex items-center justify-center border-2 border-white ${m.status === 'accepted' ? 'bg-blue-500' : 'bg-gray-400'}`}>
                                {m.name[0]}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="relative">
                <Input disabled={auction?.isPaused} placeholder="팀원 초대 (이름)" value={inviteSearch} onChange={e => setInviteSearch(e.target.value)} className="py-2 text-sm w-full" />
                {inviteSearch && !auction?.isPaused && (
                    <div className="absolute bottom-full bg-white dark:bg-gray-800 w-full border dark:border-gray-600 shadow-xl z-20 max-h-48 overflow-y-auto rounded-lg">
                        {(Object.values(db.users) as User[])
                            .filter(u => u.name.toLowerCase().includes(inviteSearch.toLowerCase()) && u.name !== currentUser?.name && u.type==='citizen')
                            .map(u => (
                                <div key={u.name} className="p-3 hover:bg-gray-100 dark:hover:bg-gray-700 flex justify-between items-center border-b dark:border-gray-700 last:border-0">
                                    <div className="flex items-center gap-2">
                                        <div className="w-6 h-6 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center text-xs">{u.name[0]}</div>
                                        <p className="text-sm font-bold">{u.name}</p>
                                    </div>
                                    <button onClick={() => handleInvite(u.name)} className="text-xs bg-blue-600 text-white px-2 py-1 rounded">초대</button>
                                </div>
                            ))
                        }
                    </div>
                )}
            </div>

            <div className="flex gap-2 items-end">
                <div className="flex-1">
                    <div className="flex justify-end gap-1 mb-1">
                        <button onClick={() => handleAddBidAmount(10000)} className="text-[10px] bg-gray-200 dark:bg-gray-700 px-2 rounded">+1만</button>
                        <button onClick={() => handleAddBidAmount(50000)} className="text-[10px] bg-gray-200 dark:bg-gray-700 px-2 rounded">+5만</button>
                    </div>
                    <MoneyInput value={bidAmount} onChange={e => setBidAmount(e.target.value)} className="py-2 text-sm" placeholder="입찰금 입력" />
                </div>
                <Button onClick={handleBidClick} className="h-auto whitespace-nowrap px-4 text-sm font-bold py-3">
                    {acceptedMembers.length > 0 ? '팀 입찰' : '입찰'}
                </Button>
            </div>
        </div>
    );

    // --- RENDER ---

    if (pendingInvite) {
        return (
            <Modal isOpen={true} onClose={() => {}} title="경매 팀 초대">
                <div className="text-center p-4">
                    <p className="mb-4">{pendingInvite.actionData.from}님이 경매 팀에 초대했습니다.</p>
                    <div className="flex gap-4">
                        <Button onClick={() => respondToAuctionInvite(pendingInvite.actionData.from, true, pendingInvite.id)}>수락</Button>
                        <Button variant="danger" onClick={() => respondToAuctionInvite(pendingInvite.actionData.from, false, pendingInvite.id)}>거절</Button>
                    </div>
                </div>
            </Modal>
        );
    }
    
    if (showWinnerModal && auction?.status === 'ended') {
        return (
            <Modal isOpen={true} onClose={handleCloseWinnerModal} title="낙찰 안내">
                <div className="text-center p-6 space-y-4">
                    {auction.item.image ? (
                        <img src={auction.item.image} alt={auction.item.name} className="w-32 h-32 object-contain mx-auto rounded-lg shadow-sm border" />
                    ) : (
                        <div className="w-32 h-32 bg-gray-100 rounded-lg mx-auto flex items-center justify-center text-gray-400">이미지 없음</div>
                    )}
                    
                    <p className="text-xl font-bold">{auction.item.name}</p>
                    <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
                        <p className="text-sm text-gray-500 mb-1">최종 낙찰자</p>
                        <p className="text-2xl font-bold text-blue-600">{auction.winner}</p>
                        <p className="text-sm text-gray-500 mt-3 mb-1">낙찰 금액</p>
                        <p className="text-3xl font-bold text-green-600">₩{(auction.winningBid || 0).toLocaleString()}</p>
                    </div>
                    <Button onClick={handleCloseWinnerModal} className="w-full text-lg py-3 mt-4">확인</Button>
                </div>
            </Modal>
        );
    }

    if (!auction?.isActive) return null;

    const dragHandlers = {
        onMouseDown: handleDragStart,
        onTouchStart: handleDragStart,
        onMouseMove: handleDragMove,
        onTouchMove: handleDragMove,
        onMouseUp: handleDragEnd,
        onTouchEnd: handleDragEnd,
        onMouseLeave: handleDragEnd
    };

    const commonStyle: React.CSSProperties = {
        position: 'fixed',
        left: pos.x,
        top: pos.y,
        zIndex: 50,
        touchAction: 'none',
    };
    
    const lastBid = bids.length > 0 ? bids[bids.length - 1] : null;

    // Minimized View
    if (viewMode === 'minimized') {
        return (
            <div 
                style={commonStyle}
                {...dragHandlers}
                className="bg-white/80 dark:bg-[#1E1E1E]/80 backdrop-blur-xl border border-white/20 rounded-[20px] shadow-xl px-4 py-2 flex items-center gap-3 cursor-grab active:cursor-grabbing max-w-[220px]"
            >
                <div className={`w-2 h-2 rounded-full ${auction.isPaused ? 'bg-gray-400' : 'bg-red-500 animate-pulse'} flex-shrink-0`}></div>
                <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold truncate">{auction.item.name}</p>
                    <p className="text-xs font-mono">₩{(auction.currentPrice || 0).toLocaleString()}</p>
                </div>
                <button onPointerDown={(e) => { e.stopPropagation(); setViewMode('widget'); }} className="text-gray-400 p-1 font-bold">↗</button>
            </div>
        );
    }

    // Widget View
    if (viewMode === 'widget') {
        return (
            <div 
                style={{...commonStyle, width: '300px'}}
                className="bg-white/90 dark:bg-[#1E1E1E]/90 backdrop-blur-xl rounded-[28px] shadow-2xl border border-white/20 dark:border-white/10 flex flex-col"
            >
                <div 
                    {...dragHandlers}
                    onClick={(e) => { if (!isDragging) setViewMode('popup'); }}
                    className={`${auction.isPaused ? 'bg-gray-500' : 'bg-green-600'} text-white p-3 px-4 flex justify-between items-center rounded-t-[28px] cursor-grab active:cursor-grabbing`}
                >
                    <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${auction.isPaused ? 'bg-gray-300' : 'bg-red-500 animate-pulse'}`}></div>
                        <span className="font-bold text-sm truncate max-w-[150px]">{auction.item.name}</span>
                    </div>
                    <div className="flex gap-3 text-xs font-bold">
                         <button onPointerDown={(e) => { e.stopPropagation(); setViewMode('popup'); }}>EXPAND</button>
                         <button onPointerDown={(e) => { e.stopPropagation(); setViewMode('minimized'); }}>MIN</button>
                    </div>
                </div>

                <div className="p-4 space-y-3 relative">
                    <div className="flex justify-between items-center" onClick={() => setViewMode('popup')}>
                         <div className="text-xl font-bold text-red-600">₩{(auction.currentPrice || 0).toLocaleString()}</div>
                         <div className={`text-xl font-mono font-bold ${timeLeft <= 5 && !auction.isPaused ? 'text-red-500 animate-pulse' : 'text-gray-700 dark:text-gray-300'}`}>{timeLeft}s</div>
                    </div>
                    
                    {/* Show last action in widget */}
                    {lastBid && (
                        <div className="text-xs text-gray-500 bg-gray-50 dark:bg-gray-800 p-2 rounded">
                            마지막: <span className="font-bold">{lastBid.bidder}</span> (₩{(lastBid.amount || 0).toLocaleString()})
                        </div>
                    )}

                    {renderBidControls()}
                </div>
            </div>
        );
    }

    // Popup View (Detailed)
    if (viewMode === 'popup') {
        return (
            <Modal isOpen={true} onClose={() => setViewMode('widget')} title="실시간 경매 상세">
                <div className="space-y-4 relative">
                    {auction.isPaused && (
                        <div className="absolute inset-0 bg-white/70 dark:bg-black/70 z-10 flex flex-col items-center justify-center font-bold text-gray-800 dark:text-gray-200 backdrop-blur-sm rounded-lg">
                            <span className="text-4xl mb-2">⏸</span>
                            경매가 일시 중지되었습니다.
                        </div>
                    )}
                    
                    <div className="flex flex-col gap-4">
                         {auction.item.image && (
                            <div className="w-full h-48 bg-gray-50 rounded-xl overflow-hidden border border-gray-100 flex items-center justify-center">
                                <img src={auction.item.image} className="h-full object-contain" />
                            </div>
                         )}
                         <div>
                             <h3 className="text-2xl font-bold mb-2">{auction.item.name}</h3>
                             <p className="text-gray-600 dark:text-gray-300 text-sm whitespace-pre-wrap p-4 bg-gray-50 dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700">{auction.item.description || "설명 없음"}</p>
                         </div>
                    </div>

                    <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-2xl border border-red-100 dark:border-red-900">
                         <div className="flex justify-between items-end">
                            <div>
                                <p className="text-sm text-red-600 font-bold mb-1">현재 최고가</p>
                                <div className="text-4xl font-bold text-red-600">₩{(auction.currentPrice || 0).toLocaleString()}</div>
                            </div>
                            <div className={`text-4xl font-mono font-bold ${timeLeft <= 10 && !auction.isPaused ? 'text-red-500 animate-pulse' : 'text-gray-700'}`}>{timeLeft}s</div>
                         </div>
                    </div>

                    {isHost && (
                         <div className="bg-yellow-50 dark:bg-yellow-900/10 p-3 rounded flex items-center justify-between relative z-20">
                            <span className="font-bold text-sm">시간 연장</span>
                            <div className="flex gap-2">
                                {[1, 3, 5, 10].map(s => <Button key={s} onClick={() => extendTime(s)} className="text-xs px-3 py-1">+{s}s</Button>)}
                            </div>
                        </div>
                    )}

                    <div className="bg-gray-100 dark:bg-gray-800 h-48 overflow-y-auto p-4 rounded-2xl space-y-2 border border-gray-200 dark:border-gray-700" ref={scrollRef}>
                        {bids.map((bid, i) => (
                             <div key={i} className={`flex ${bid.bidder === currentUser?.name ? 'justify-end' : 'justify-start'}`}>
                                <div className={`p-2 px-3 rounded-xl ${bid.bidder.includes(currentUser?.name||'') ? 'bg-green-100 dark:bg-green-900' : 'bg-white dark:bg-gray-700 shadow-sm'}`}>
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="font-bold text-sm">{bid.bidder}</span>
                                        <span className="text-xs text-gray-400">{new Date(bid.timestamp).toLocaleTimeString()}</span>
                                    </div>
                                    <span className="font-bold text-lg text-blue-600">₩{(bid.amount || 0).toLocaleString()}</span>
                                </div>
                             </div>
                        ))}
                    </div>
                    
                    {renderBidControls()}
                    <Button variant="secondary" onClick={() => setViewMode('widget')} className="w-full">창 줄이기</Button>
                </div>
            </Modal>
        );
    }

    return (
        <Modal isOpen={isSplitModalOpen} onClose={() => setIsSplitModalOpen(false)} title="팀 입찰 지분 설정">
             <div className="space-y-4">
                    <div className="text-center font-bold text-lg mb-2">총 입찰액: ₩{parseInt(bidAmount).toLocaleString()}</div>
                    <p className="text-xs text-center text-gray-500 mb-4">지분의 총합은 10이어야 합니다. (예: 1 : 3 : 6)</p>
                    {[currentUser!.name, ...acceptedMembers.map(m => m.name)].map(name => {
                         const share = parseInt(splitShares[name] || '0');
                         const amount = Math.floor(parseInt(bidAmount) * (share / 10));
                         return (
                            <div key={name} className="flex items-center gap-3">
                                <span className="w-20 text-sm font-bold truncate">{name}</span>
                                <input 
                                    type="range" min="0" max="10" step="1" 
                                    value={share} 
                                    onChange={e => setSplitShares({...splitShares, [name]: e.target.value})}
                                    className="flex-1 accent-green-600"
                                />
                                <input 
                                    type="number" 
                                    value={share} 
                                    onChange={e => setSplitShares({...splitShares, [name]: e.target.value})}
                                    className="w-12 text-center border rounded py-1 text-sm"
                                />
                                <span className="w-24 text-right text-xs text-gray-500">₩{amount.toLocaleString()}</span>
                            </div>
                         );
                    })}
                    <div className="flex justify-between items-center bg-gray-100 dark:bg-gray-800 p-2 rounded">
                        <span className="text-sm font-bold">합계</span>
                        <span className={`font-bold ${Object.values(splitShares).reduce((s: number, v: string) => s + (parseInt(v)||0), 0) === 10 ? 'text-green-600' : 'text-red-500'}`}>
                            {Object.values(splitShares).reduce((s: number, v: string) => s + (parseInt(v)||0), 0)} / 10
                        </span>
                    </div>
                    <Button onClick={handleSplitSubmit} className="w-full whitespace-nowrap">입찰 확정</Button>
            </div>
        </Modal>
    );
};
