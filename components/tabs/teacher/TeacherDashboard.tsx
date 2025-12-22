
import React, { useState, useRef } from 'react';
import { useGame } from '../../../context/GameContext';
import { Card, Button, Input, Modal } from '../../Shared';
import { MintingTab } from '../admin/MintingTab';
import { User, Auction } from '../../../types';
import { chatService } from '../../../services/firebase';

export const TeacherDashboard: React.FC = () => {
    const { db, saveDb, notify, showModal, showConfirm, currentUser } = useGame();
    const [activeTab, setActiveTab] = useState('auction'); // auction, godmode

    // Auction State
    const [aucItemName, setAucItemName] = useState('');
    const [aucDesc, setAucDesc] = useState('');
    const [aucStartPrice, setAucStartPrice] = useState('');
    const [aucImage, setAucImage] = useState<string | null>(null);

    // God Mode State
    const [godTarget, setGodTarget] = useState<string | null>(null);
    const [bonusAmount, setBonusAmount] = useState('');

    const auction = db.auction;
    const deferredAuctions = db.deferredAuctions || [];

    // --- Auction Functions ---
    const startAuction = async () => {
        if (!aucItemName || !aucStartPrice) return showModal("필수 정보를 입력하세요.");
        const price = parseInt(aucStartPrice);
        const now = Date.now();
        
        const auctionId = now.toString();
        const chatId = 'auction_room'; // Fixed global auction room

        // 1. Create Auction State
        const newDb = { ...db };
        newDb.auction = {
            id: auctionId,
            isActive: true,
            status: 'active',
            startTime: new Date(now).toISOString(),
            endTime: now + 180 * 1000, // 3 minutes default
            timerDuration: 180, 
            item: { name: aucItemName, description: aucDesc, image: aucImage },
            startingPrice: price,
            currentPrice: price,
            bids: [],
            teams: {},
            isPaused: false
        };
        
        await saveDb(newDb);

        // 2. Setup/Reset Auction Chat Room
        // We use a fixed ID for simplicity, or we could generate one. 
        // Using fixed ID ensures everyone jumps to the same place easily.
        await chatService.createChat(['ALL'], 'auction', `[경매] ${aucItemName}`);
        
        // Post welcome message
        await chatService.sendMessage(chatId, {
            id: `sys_${now}`,
            sender: 'system',
            text: `📢 경매가 시작되었습니다!\n품목: ${aucItemName}\n시작가: ₩${price.toLocaleString()}\n\n입찰은 하단 입력창에 숫자를 입력하세요.`,
            timestamp: now,
            type: 'notice'
        });

        notify('ALL', `[긴급] ${aucItemName} 경매가 시작되었습니다! 채팅방으로 이동합니다.`, true, 'open_chat', { chatId });
        
        // Reset form
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
                    
                    {auction?.isActive ? (
                        <div className="p-6 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl text-center">
                            <p className="text-lg font-bold text-green-700 dark:text-green-400 animate-pulse">현재 경매 진행 중</p>
                            <p className="text-2xl font-black mt-2">{auction.item.name}</p>
                            <p className="text-gray-500 mt-1">현재가: ₩{auction.currentPrice.toLocaleString()}</p>
                            <p className="text-sm mt-4 text-gray-600 dark:text-gray-300">
                                관리 기능은 <b>채팅방(경매 방)</b> 내 상단 패널에서 제공됩니다.<br/>
                                (일시정지, 유찰, 강제 낙찰, 시간 추가 등)
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-6">
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
                                    <Button onClick={startAuction} className="w-full bg-indigo-600 hover:bg-indigo-500">
                                        경매 시작 & 채팅방 개설
                                    </Button>
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
                            {(Object.values(db.users) as User[])
                                .filter(u => u.type !== 'admin' && (u.name || '').includes(godTarget || ''))
                                .map(u => (
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
