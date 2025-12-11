import React, { useState, useRef } from 'react';
import { useGame } from '../../../context/GameContext';
import { Card, Button, Input, Modal } from '../../Shared';
import { MintingTab } from '../admin/MintingTab';
import { User, Auction } from '../../../types';

export const TeacherDashboard: React.FC = () => {
    const { db, saveDb, notify, showModal, showConfirm, currentUser } = useGame();
    const [activeTab, setActiveTab] = useState('auction'); // auction, godmode

    // Auction State
    const [aucItemName, setAucItemName] = useState('');
    const [aucDesc, setAucDesc] = useState('');
    const [aucStartPrice, setAucStartPrice] = useState('');
    const [aucCurrentPrice, setAucCurrentPrice] = useState('');
    const [aucImage, setAucImage] = useState<string | null>(null);

    // God Mode State
    const [godTarget, setGodTarget] = useState<string | null>(null);
    const [bonusAmount, setBonusAmount] = useState('');

    const auction = db.auction;
    const bids = auction?.bids || [];
    const deferredAuctions = db.deferredAuctions || [];

    // --- Auction Functions ---
    const startAuction = async () => {
        if (!aucItemName || !aucStartPrice) return showModal("필수 정보를 입력하세요.");
        const price = parseInt(aucStartPrice);
        const now = Date.now();
        
        const newDb = { ...db };
        newDb.auction = {
            id: now.toString(),
            isActive: true,
            status: 'active',
            startTime: new Date(now).toISOString(),
            endTime: now + 60 * 1000, // Explicitly 60 seconds from now
            timerDuration: 10, 
            item: { name: aucItemName, description: aucDesc, image: aucImage },
            startingPrice: price,
            currentPrice: price,
            bids: [],
            teams: {},
            isPaused: false
        };
        await saveDb(newDb);
        notify('ALL', `[긴급] ${aucItemName} 경매가 시작되었습니다!`, true);
        setAucCurrentPrice(price.toString());
        setAucItemName(''); setAucDesc(''); setAucStartPrice(''); setAucImage(null);
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
             const reader = new FileReader();
             reader.onload = (ev) => {
                 setAucImage(ev.target?.result as string);
             };
             reader.readAsDataURL(e.target.files[0]);
        }
    };

    const updatePrice = async () => {
        const price = parseInt(aucCurrentPrice);
        if (isNaN(price)) return;
        const newDb = { ...db };
        if (newDb.auction) {
            newDb.auction.currentPrice = price;
            await saveDb(newDb);
        }
    };

    const endAuction = async (winner?: string, bidAmount?: number) => {
        const newDb = { ...db };
        if (!newDb.auction) return;
        
        newDb.auction.isActive = false;
        newDb.auction.status = 'ended';
        newDb.auction.isPaused = false;
        
        if (winner && bidAmount) {
            newDb.auction.winner = winner;
            newDb.auction.winningBid = bidAmount;
            
            // Handle Payment (Team or Single)
            const bid = newDb.auction.bids.find(b => b.bidder === winner && b.amount === bidAmount);
            if (bid && bid.contributors) {
                // Team Payment
                for (const c of bid.contributors) {
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
                // Single Payment fallback
                const user = newDb.users[winner];
                if (user && user.balanceKRW >= bidAmount) {
                    user.balanceKRW -= bidAmount;
                    user.transactions = [...(user.transactions || []), {
                        id: Date.now(), type: 'auction', amount: -bidAmount, currency: 'KRW', description: `경매 낙찰: ${newDb.auction.item.name}`, date: new Date().toISOString()
                    }];
                    notify(winner, `경매 낙찰! ₩${bidAmount.toLocaleString()} 차감.`, true);
                }
            }
        } else {
             notify('ALL', `경매가 유찰되었습니다.`, true);
        }

        await saveDb(newDb);
    };

    const deferAuction = async () => {
         const newDb = { ...db };
         if (newDb.auction) {
             const currentAuc = { ...newDb.auction, isActive: false, status: 'deferred' as const, isPaused: false };
             newDb.auction = {
                isActive: false, item: { name: '', description: '', image: null },
                startingPrice: 0, currentPrice: 0, startTime: '', status: 'ended', bids: []
            };
             // Add to deferred list
             if (!newDb.deferredAuctions) newDb.deferredAuctions = [];
             newDb.deferredAuctions.push(currentAuc);
             
             await saveDb(newDb);
             notify('ALL', `경매가 연기되었습니다.`, true);
         }
    };

    const pauseAuction = async () => {
        const newDb = { ...db };
        if (newDb.auction && newDb.auction.status === 'active') {
             newDb.auction.isPaused = true;
             await saveDb(newDb);
             notify('ALL', `경매가 일시 중지되었습니다.`, true);
        }
    };

    const resumeAuction = async () => {
        const newDb = { ...db };
        if (newDb.auction && newDb.auction.isPaused) {
             newDb.auction.isPaused = false;
             // Add 30 seconds to compensate pause
             newDb.auction.endTime = Date.now() + 30000;
             await saveDb(newDb);
             notify('ALL', `경매가 재개되었습니다.`, true);
        }
    };

    const resumeDeferredAuction = async (targetAuction: Auction) => {
        if (db.auction && db.auction.isActive) return showModal("현재 진행 중인 경매가 있습니다.");
        
        const newDb = { ...db };
        newDb.auction = {
            ...targetAuction,
            isActive: true,
            status: 'active',
            startTime: new Date().toISOString(),
            endTime: Date.now() + 60 * 1000,
            isPaused: false
        };
        // Remove from list
        newDb.deferredAuctions = newDb.deferredAuctions?.filter(a => a.id !== targetAuction.id) || [];
        
        await saveDb(newDb);
        notify('ALL', `연기된 경매(${targetAuction.item.name})가 재개되었습니다!`, true);
    };
    
    const deleteDeferredAuction = async (id: string) => {
        if (!await showConfirm("연기된 경매 항목을 삭제하시겠습니까?")) return;
        const newDb = { ...db };
        newDb.deferredAuctions = newDb.deferredAuctions?.filter(a => a.id !== id) || [];
        await saveDb(newDb);
    };

    // --- God Mode Functions ---
    const handleSeize = async (target: User) => {
        if (!await showConfirm(`${target.name}님의 전 재산을 몰수하시겠습니까?`)) return;
        const newDb = { ...db };
        const user = newDb.users[target.name];
        const teacher = newDb.users[currentUser!.name];
        
        const krw = user.balanceKRW;
        const usd = user.balanceUSD;

        user.balanceKRW = 0;
        user.balanceUSD = 0;
        
        teacher.balanceKRW += krw;
        teacher.balanceUSD += usd;

        await saveDb(newDb);
        notify(target.name, `모든 재산이 교사에 의해 압수되었습니다.`, true);
        showModal("압수 완료.");
    };

    const handleBonus = async (target: User) => {
        const amount = parseInt(bonusAmount);
        if (isNaN(amount)) return;
        const newDb = { ...db };
        const user = newDb.users[target.name];
        
        // Bonus doesn't come from teacher's pocket, it's printed (God Mode)
        user.balanceKRW += amount;
        user.transactions = [...(user.transactions || []), {
            id: Date.now(), type: 'income', amount: amount, currency: 'KRW', description: '교사 특별 보너스', date: new Date().toISOString()
        }];
        
        await saveDb(newDb);
        notify(target.name, `보너스 ₩${amount.toLocaleString()}를 받았습니다!`, true);
        setBonusAmount('');
        showModal("지급 완료.");
    };

    return (
        <div className="space-y-6">
            <div className="flex gap-2">
                <Button onClick={() => setActiveTab('auction')} variant={activeTab === 'auction' ? 'primary' : 'secondary'}>경매 관리</Button>
                <Button onClick={() => setActiveTab('godmode')} variant={activeTab === 'godmode' ? 'primary' : 'secondary'}>신(God) 모드</Button>
                <Button onClick={() => setActiveTab('mint')} variant={activeTab === 'mint' ? 'primary' : 'secondary'}>발권 승인</Button>
            </div>

            {activeTab === 'mint' && <MintingTab />}

            {activeTab === 'auction' && (
                <Card>
                    <h3 className="text-2xl font-bold mb-4">경매 시스템</h3>
                    
                    {auction?.status === 'active' || (auction?.isPaused && auction?.isActive) ? (
                        <div className="space-y-4">
                            <div className={`p-4 border rounded ${auction.isPaused ? 'bg-gray-200 border-gray-400' : 'bg-green-50 border-green-200'}`}>
                                <p className="font-bold text-lg">{auction.item.name} {auction.isPaused && "(일시 중지됨)"}</p>
                                <p className="text-sm text-gray-500 mb-2">관리자 제어는 우하단 경매 위젯을 사용하세요.</p>
                                
                                <div className="flex gap-2 mt-4">
                                    {auction.isPaused ? (
                                        <Button onClick={resumeAuction} className="bg-blue-600">재개</Button>
                                    ) : (
                                        <Button onClick={pauseAuction} className="bg-yellow-500">일시 중지</Button>
                                    )}
                                    <Button onClick={() => endAuction()} variant="danger">강제 종료 (유찰)</Button>
                                    <Button onClick={deferAuction} variant="secondary">연기 (보관)</Button>
                                </div>
                            </div>

                            <h4 className="font-bold">입찰 대상자 선택 (클릭하여 낙찰)</h4>
                            <div className="max-h-60 overflow-y-auto space-y-2 border p-2 rounded bg-gray-50 dark:bg-gray-800">
                                {[...bids].reverse().map((bid, i) => (
                                    <div key={i} className="flex justify-between items-center p-3 hover:bg-green-100 dark:hover:bg-green-900 cursor-pointer border-b dark:border-gray-700 bg-white dark:bg-gray-700 rounded transition-colors"
                                         onClick={async () => {
                                             if(await showConfirm(`${bid.bidder}님에게 ₩${bid.amount.toLocaleString()}에 낙찰하시겠습니까?`)) {
                                                 endAuction(bid.bidder, bid.amount);
                                             }
                                         }}>
                                        <span className="font-bold">{bid.bidder}</span>
                                        <span className="font-bold text-blue-600">₩{bid.amount.toLocaleString()}</span>
                                        <span className="text-xs text-gray-400">{new Date(bid.timestamp).toLocaleTimeString()}</span>
                                    </div>
                                ))}
                                {bids.length === 0 && <p className="text-gray-500 text-center text-sm py-4">입찰 내역이 없습니다.</p>}
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {/* Deferred Auctions Section */}
                            {deferredAuctions.length > 0 && (
                                <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg">
                                    <h4 className="font-bold text-orange-700 mb-2">연기된 경매 항목 ({deferredAuctions.length})</h4>
                                    <div className="space-y-2">
                                        {deferredAuctions.map((defAuc, idx) => (
                                            <div key={defAuc.id || idx} className="flex justify-between items-center p-2 bg-white rounded border border-orange-100">
                                                <div>
                                                    <span className="font-bold">{defAuc.item.name}</span>
                                                    <span className="text-xs text-gray-500 ml-2">마지막 가격: ₩{defAuc.currentPrice.toLocaleString()}</span>
                                                </div>
                                                <div className="flex gap-2">
                                                    <Button onClick={() => resumeDeferredAuction(defAuc)} className="text-xs py-1 px-3">재개</Button>
                                                    <Button onClick={() => deleteDeferredAuction(defAuc.id!)} variant="danger" className="text-xs py-1 px-3">삭제</Button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div>
                                <h4 className="font-bold mb-2">새 경매 시작</h4>
                                <div className="space-y-3">
                                    <Input placeholder="물품 이름" value={aucItemName} onChange={e => setAucItemName(e.target.value)} />
                                    <Input placeholder="설명" value={aucDesc} onChange={e => setAucDesc(e.target.value)} />
                                    <Input type="number" placeholder="시작 가격" value={aucStartPrice} onChange={e => setAucStartPrice(e.target.value)} />
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm">이미지:</span>
                                        <input type="file" accept="image/*" onChange={handleImageUpload} className="text-sm" />
                                    </div>
                                    <Button onClick={startAuction} className="w-full">경매 시작</Button>
                                </div>
                            </div>
                        </div>
                    )}
                </Card>
            )}

            {activeTab === 'godmode' && (
                <Card>
                    <h3 className="text-2xl font-bold mb-4 text-red-600">절대 권력 (God Mode)</h3>
                    <div className="space-y-4">
                        <Input placeholder="유저 검색..." onChange={e => setGodTarget(e.target.value)} />
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {(Object.values(db.users) as User[]).filter(u => u.type !== 'admin' && u.name.includes(godTarget || '')).map(u => (
                                <div key={u.name} className="border p-3 rounded flex flex-col gap-2">
                                    <div className="flex justify-between">
                                        <span className="font-bold">{u.name}</span>
                                        <span className="text-xs">₩{u.balanceKRW.toLocaleString()}</span>
                                    </div>
                                    <div className="flex gap-2">
                                        <Button className="text-xs flex-1" variant="danger" onClick={() => handleSeize(u)}>재산 몰수</Button>
                                        <div className="flex-1 flex gap-1">
                                            <Input className="text-xs py-1" placeholder="보너스" value={bonusAmount} onChange={e => setBonusAmount(e.target.value)} />
                                            <Button className="text-xs" onClick={() => handleBonus(u)}>지급</Button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </Card>
            )}
        </div>
    );
};