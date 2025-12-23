
import React, { useState, useEffect, useRef } from 'react';
import { useGame } from '../../context/GameContext';
import { Button, Input, Modal, MoneyInput, Card } from '../Shared';
import { AuctionBid, User, Auction } from '../../types';

export const AuctionModal: React.FC = () => {
    const { db, currentUser, saveDb, notify, respondToAuctionInvite, showModal, showConfirm } = useGame();
    const auction = db.auction;
    const history = db.auctionHistory || [];
    
    // View Mode: 'active' (popup/widget logic) or 'history'
    const [viewMode, setViewMode] = useState<'popup' | 'widget' | 'minimized'>('widget');
    
    // Drag Logic
    const [pos, setPos] = useState({ x: 20, y: window.innerHeight - 200 });
    const [isDragging, setIsDragging] = useState(false);
    const dragStartRef = useRef<{ x: number, y: number } | null>(null);
    const posStartRef = useRef<{ x: number, y: number } | null>(null);

    // Form / Interaction State
    const [bidAmount, setBidAmount] = useState('');
    const [manualPriceInput, setManualPriceInput] = useState('');
    const [timeLeft, setTimeLeft] = useState(60);

    const scrollRef = useRef<HTMLDivElement>(null);
    const bids = auction?.bids || [];

    // Notifications
    const pendingInvite = currentUser?.notifications 
        ? (Array.isArray(currentUser.notifications) ? currentUser.notifications : Object.values(currentUser.notifications))
            .find(n => n.action === 'auction_invite')
        : null;

    // Timer & Auto End Logic
    useEffect(() => {
        if (!auction?.isActive || !auction.endTime || auction.isPaused) return;
        const interval = setInterval(() => {
            const now = Date.now();
            const remaining = Math.max(0, Math.ceil((auction.endTime! - now) / 1000));
            setTimeLeft(remaining);
            if (remaining <= 0 && auction.status === 'active') handleAutoEnd();
        }, 1000);
        return () => clearInterval(interval);
    }, [auction?.endTime, auction?.isActive, auction?.status, auction?.isPaused]);

    const handleAutoEnd = async () => {
        const isHost = currentUser?.type === 'admin' || currentUser?.subType === 'teacher' || currentUser?.type === 'root';
        if (!isHost) return; 

        const newDb = { ...db };
        if (!newDb.auction || newDb.auction.status === 'ended') return;
        
        newDb.auction.isActive = false;
        newDb.auction.status = 'ended';
        
        const winnerBid = newDb.auction.bids.length > 0 ? newDb.auction.bids[newDb.auction.bids.length - 1] : null;
        
        if (winnerBid) {
            newDb.auction.winner = winnerBid.bidder;
            newDb.auction.winningBid = winnerBid.amount;
            const user = newDb.users[Object.keys(newDb.users).find(k => (newDb.users[k] as User).name === winnerBid.bidder) || ''];
            if (user) {
                user.balanceKRW -= winnerBid.amount;
                user.transactions = [...(user.transactions || []), {
                    id: Date.now(), type: 'auction', amount: -winnerBid.amount, currency: 'KRW', description: `경매 낙찰: ${newDb.auction.item.name}`, date: new Date().toISOString()
                }];
                notify(winnerBid.bidder, `경매 낙찰! ₩${winnerBid.amount.toLocaleString()} 차감.`, true);
            }
            notify('ALL', `경매 종료! 낙찰자: ${winnerBid.bidder}`, true);
        } else {
            newDb.auction.status = 'unsold'; // Yuchal
            notify('ALL', `경매가 유찰되었습니다.`, true);
        }
        
        // Add to history
        newDb.auctionHistory = [newDb.auction, ...(newDb.auctionHistory || [])].slice(0, 10);
        newDb.auction = undefined; // Clear active

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
        
        setPos({ x: posStartRef.current.x + (clientX - dragStartRef.current.x), y: posStartRef.current.y + (clientY - dragStartRef.current.y) });
    };

    const handleDragEnd = () => setIsDragging(false);

    const isHost = currentUser?.subType === 'teacher' || currentUser?.type === 'root' || currentUser?.type === 'admin';

    const handleBidClick = async () => {
        if(!auction || auction.isPaused) return;
        const amount = parseInt(bidAmount);
        if (isNaN(amount) || amount <= auction.currentPrice) return notify(currentUser!.name, "현재가보다 높은 금액을 입찰하세요.");
        if (currentUser!.balanceKRW < amount) return notify(currentUser!.name, "잔액이 부족합니다.");

        const newDb = { ...db };
        if (!newDb.auction) return;
        
        const bid: AuctionBid = { bidder: currentUser!.name, amount, timestamp: Date.now() };
        newDb.auction.bids.push(bid);
        newDb.auction.currentPrice = amount;
        
        if (newDb.auction.endTime) newDb.auction.endTime = Math.max(newDb.auction.endTime, Date.now() + 30000); // 30s Extension

        await saveDb(newDb);
        setBidAmount('');
    };

    const handleAddBidAmount = (amountToAdd: number) => {
        let currentVal = parseInt(bidAmount);
        if (isNaN(currentVal)) currentVal = auction?.currentPrice ?? 0;
        setBidAmount((currentVal + amountToAdd).toString());
    };

    const extendTime = async (seconds: number) => {
        const newDb = { ...db };
        if (newDb.auction?.endTime) {
            newDb.auction.endTime += seconds * 1000;
            await saveDb(newDb);
        }
    };

    const handleForceEnd = async (type: 'nakchal' | 'yuchal' | 'defer') => {
        if (!await showConfirm(type === 'nakchal' ? "현재가로 낙찰?" : type === 'yuchal' ? "유찰(취소)?" : "연기?")) return;
        
        const newDb = { ...db };
        if (!newDb.auction) return;
        
        newDb.auction.isActive = false;
        
        if (type === 'yuchal') {
            newDb.auction.status = 'unsold';
            newDb.auction.bids = [];
        } else if (type === 'defer') {
            newDb.auction.status = 'deferred';
        } else {
            newDb.auction.status = 'ended'; // Nakchal -> AutoEnd logic will pick winner
        }
        
        // Save to History first, then run logic
        newDb.auctionHistory = [newDb.auction, ...(newDb.auctionHistory || [])].slice(0, 10);
        
        if (type === 'nakchal') {
             // Logic mostly handled in AutoEnd, but here we force trigger
             // Manual trigger similar to auto end
             const winnerBid = newDb.auction.bids.length > 0 ? newDb.auction.bids[newDb.auction.bids.length - 1] : null;
             if (winnerBid) {
                 newDb.auction.winner = winnerBid.bidder;
                 newDb.auction.winningBid = winnerBid.amount;
                 const user = (Object.values(newDb.users) as User[]).find(u=>u.name===winnerBid.bidder);
                 if(user) user.balanceKRW -= winnerBid.amount;
                 notify('ALL', `관리자에 의해 낙찰되었습니다. 낙찰자: ${winnerBid.bidder}`, true);
             }
        } else {
             notify('ALL', `경매가 ${type === 'yuchal' ? '유찰' : '연기'}되었습니다.`, true);
        }
        
        newDb.auction = undefined;
        await saveDb(newDb);
    };

    // --- RENDER ---
    if (!auction?.isActive && history.length === 0) return null;

    // Show History Viewer if no active auction
    if (!auction?.isActive) {
        // Simple minimized toggle for history
        return null; // For now hidden if not active, or could be a tab in Teacher Dashboard
    }

    const commonStyle: React.CSSProperties = { position: 'fixed', left: pos.x, top: pos.y, zIndex: 50, touchAction: 'none' };
    const lastBid = bids.length > 0 ? bids[bids.length - 1] : null;

    if (viewMode === 'widget' || viewMode === 'popup') {
        return (
            <div style={{...commonStyle, width: '320px'}} className="bg-white/95 dark:bg-[#1E1E1E]/95 backdrop-blur-xl rounded-[28px] shadow-2xl border border-white/20 flex flex-col">
                <div {...{ onMouseDown: handleDragStart, onTouchStart: handleDragStart, onMouseMove: handleDragMove, onTouchMove: handleDragMove, onMouseUp: handleDragEnd, onTouchEnd: handleDragEnd }} className="bg-red-600 text-white p-3 px-4 flex justify-between items-center rounded-t-[28px] cursor-grab">
                    <span className="font-bold text-sm truncate max-w-[150px]">🔴 {auction.item.name}</span>
                    <button onClick={() => setViewMode('minimized')} className="text-xs font-bold border border-white/30 px-2 rounded">MIN</button>
                </div>

                <div className="p-4 space-y-4">
                    {viewMode === 'popup' && auction.item.image && <img src={auction.item.image} className="w-full h-32 object-contain bg-white rounded-lg"/>}
                    
                    <div className="flex justify-between items-center">
                         <div>
                             <p className="text-xs text-gray-500">현재가</p>
                             <p className="text-2xl font-black text-red-600">₩{auction.currentPrice.toLocaleString()}</p>
                         </div>
                         <div className={`text-3xl font-mono font-bold ${timeLeft <= 10 ? 'text-red-500 animate-pulse' : ''}`}>{timeLeft}s</div>
                    </div>

                    <div className="space-y-2">
                        <div className="flex gap-2">
                            <Button onClick={() => handleAddBidAmount(10000)} className="flex-1 py-2 text-xs bg-gray-200 text-black">+1만</Button>
                            <Button onClick={() => handleAddBidAmount(50000)} className="flex-1 py-2 text-xs bg-gray-200 text-black">+5만</Button>
                        </div>
                        <div className="flex gap-2">
                            <Input type="number" value={bidAmount} onChange={e => setBidAmount(e.target.value)} placeholder="입찰금" className="flex-1 text-right" />
                            <Button onClick={handleBidClick} className="bg-red-600">입찰</Button>
                        </div>
                    </div>

                    {isHost && (
                        <div className="pt-2 border-t mt-2">
                            <p className="text-xs font-bold text-gray-500 mb-2">관리자 제어</p>
                            <div className="grid grid-cols-3 gap-2">
                                <Button onClick={() => handleForceEnd('nakchal')} className="text-[10px] bg-green-600">낙찰</Button>
                                <Button onClick={() => handleForceEnd('yuchal')} className="text-[10px] bg-orange-500">유찰</Button>
                                <Button onClick={() => handleForceEnd('defer')} className="text-[10px] bg-gray-500">연기</Button>
                            </div>
                            <div className="flex gap-2 mt-2">
                                <Button onClick={() => extendTime(30)} className="text-[10px] flex-1">+30초</Button>
                                <Button onClick={() => extendTime(60)} className="text-[10px] flex-1">+1분</Button>
                            </div>
                        </div>
                    )}
                    
                    {viewMode === 'widget' && <button onClick={() => setViewMode('popup')} className="w-full text-xs text-center text-gray-400 mt-2">상세 보기 ▼</button>}
                    {viewMode === 'popup' && <button onClick={() => setViewMode('widget')} className="w-full text-xs text-center text-gray-400 mt-2">간략히 보기 ▲</button>}
                </div>
            </div>
        );
    }

    return (
        <div style={commonStyle} {...{ onMouseDown: handleDragStart, onTouchStart: handleDragStart, onMouseMove: handleDragMove, onTouchMove: handleDragMove, onMouseUp: handleDragEnd, onTouchEnd: handleDragEnd }} className="bg-red-600 text-white rounded-full px-4 py-2 shadow-xl flex items-center gap-3 cursor-grab animate-pulse" onClick={() => setViewMode('widget')}>
            <span className="font-bold text-xs">🔴 경매 중</span>
            <span className="font-mono text-sm">₩{auction.currentPrice.toLocaleString()}</span>
        </div>
    );
};
