
import React, { useState, useMemo } from 'react';
import { useGame } from '../../context/GameContext';
import { Card, Button, Modal, Input, formatShortPrice } from '../Shared';
import { RealEstateCell } from '../../types';

export const RealEstateTab: React.FC = () => {
    const { db, currentUser, saveDb, showModal, showConfirm, serverAction, createChat, sendMessage } = useGame();
    const [selectedId, setSelectedId] = useState<number | null>(null);
    
    // Grid Setup
    const grid = useMemo(() => db.realEstate.grid || [], [db.realEstate.grid]);
    const pendingRent = currentUser?.pendingRent;
    const selectedCell = selectedId !== null ? grid.find(c => c.id === selectedId) : null;

    // Offer State
    const [offerPrice, setOfferPrice] = useState('');
    const [isOfferModalOpen, setIsOfferModalOpen] = useState(false);
    const [offerType, setOfferType] = useState<'buy' | 'lease'>('buy');

    // Rent Handling
    const handlePayRent = async () => {
        if (!pendingRent) return;
        if (currentUser!.balanceKRW < pendingRent.amount) return showModal("잔액이 부족합니다.");

        try {
            await serverAction('pay_rent', {
                userId: currentUser!.name,
                ownerId: pendingRent.owner,
                amount: pendingRent.amount,
                propertyId: pendingRent.propertyId
            });
            showModal(`임대료 ₩${pendingRent.amount.toLocaleString()} 납부 완료.`);
        } catch(e) {
            showModal("납부 실패");
        }
    };

    const handleBuyFromBank = async () => {
        if (!selectedCell) return;
        const price = selectedCell.price;
        if (currentUser!.balanceKRW < price) return showModal("잔액이 부족합니다.");

        if (!await showConfirm(`집 #${selectedCell.id}를 ₩${price.toLocaleString()}에 구매하시겠습니까?`)) return;

        const newDb = { ...db };
        const user = newDb.users[currentUser!.name];
        const bank = newDb.users['한국은행'];
        const prop = newDb.realEstate.grid.find(p => p.id === selectedCell.id);

        if (!prop || prop.owner) return showModal("이미 소유주가 있는 부동산입니다.");

        user.balanceKRW -= price;
        bank.balanceKRW += price;
        prop.owner = currentUser!.name;

        const now = Date.now();
        user.transactions = [...(user.transactions || []), { 
            id: now, type: 'expense', amount: -price, currency: 'KRW', description: `부동산 #${prop.id} 구매`, date: new Date().toISOString() 
        }];
        bank.transactions = [...(bank.transactions || []), { 
            id: now+1, type: 'income', amount: price, currency: 'KRW', description: `부동산 #${prop.id} 판매`, date: new Date().toISOString() 
        }];

        await saveDb(newDb);
        showModal(`집 #${prop.id} 구매 완료!`);
        setSelectedId(null);
    };

    const handleMakeOffer = async () => {
        if (!selectedCell || !selectedCell.owner) return;
        const price = parseInt(offerPrice);
        if (isNaN(price) || price <= 0) return showModal("제안 가격을 입력하세요.");
        
        const owner = selectedCell.owner;
        const chatId = await createChat([owner], 'private');
        
        if (offerType === 'buy') {
            await sendMessage(chatId, `[부동산 매수 제안]\n대상: 집 #${selectedCell.id}\n제안가: ₩${price.toLocaleString()}`, {
                type: 'proposal',
                value: '매수 제안',
                data: {
                    type: 'real_estate_offer',
                    propertyId: selectedCell.id,
                    price: price,
                    buyer: currentUser!.name
                }
            });
        } else {
            await sendMessage(chatId, `[임대 문의]\n대상: 집 #${selectedCell.id}\n제안 주세: ₩${price.toLocaleString()}/주\n\n계약이 성사되면 매주 자동으로 이체됩니다.`, {
                type: 'proposal',
                value: '임대 계약 제안',
                data: {
                    type: 'rent_contract',
                    propertyId: selectedCell.id,
                    weeklyRent: price,
                    tenantName: currentUser!.name,
                    ownerName: owner
                }
            });
        }

        showModal(`${owner}님에게 ${offerType === 'buy' ? '매수' : '임대'} 제안 메시지를 보냈습니다.`);
        setIsOfferModalOpen(false);
        setOfferPrice('');
    };

    const renderGrid = () => {
        const cols = 6;
        const indices = Array.from({ length: 18 }, (_, i) => i + 1);
        
        return (
            <div 
                className="grid gap-2 mb-6 select-none relative" 
                style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
            >
                {indices.map((id) => {
                    const cell = grid.find(c => c.id === id) || { id, owner: null, tenant: null, price: 10000000 } as RealEstateCell;
                    const isMall1 = id === 1;
                    const isMall2 = id === 7;
                    const isMall3 = id === 13;

                    if (isMall2) return null;

                    const isRedZone = isMall1 || isMall3;
                    const isOwnedByMe = cell.owner === currentUser?.name;
                    const isTenantMe = cell.tenant === currentUser?.name;
                    const isSelected = selectedId === id;
                    
                    let rowSpan = 'row-span-1';
                    if (isMall1) rowSpan = 'row-span-2';

                    // Determine Style Classes
                    let bgClass = 'bg-white dark:bg-[#2D2D2D]';
                    let borderClass = 'border-gray-200 dark:border-gray-700';
                    
                    if (isRedZone) {
                        bgClass = 'bg-red-50 dark:bg-red-900/40';
                        borderClass = 'border-red-400';
                    }
                    if (isOwnedByMe) {
                        bgClass = 'bg-green-100 dark:bg-green-900/40';
                        borderClass = 'border-green-500';
                    } else if (isTenantMe) {
                        bgClass = 'bg-blue-100 dark:bg-blue-900/40';
                        borderClass = 'border-blue-500';
                    }

                    if (isSelected) {
                        borderClass += ' ring-2 ring-yellow-400 z-10';
                    }

                    return (
                        <div 
                            key={id}
                            onClick={() => setSelectedId(id)}
                            className={`
                                col-span-1 ${rowSpan}
                                min-h-[6rem] rounded-xl p-1 flex flex-col items-center justify-center cursor-pointer border-2 transition-all text-[10px] sm:text-xs relative shadow-sm
                                ${bgClass} ${borderClass}
                                ${isSelected ? 'scale-105' : ''}
                            `}
                        >
                            <span className="font-bold truncate w-full text-center">
                                {cell.owner ? (cell.isJointOwnership ? '공동' : cell.owner) : `빈 집 ${id}`}
                            </span>
                            {cell.tenant && (
                                <span className="text-[9px] text-gray-500 truncate w-full text-center">
                                    임대: {cell.tenant}
                                </span>
                            )}
                            <span className="text-[9px] opacity-70 mt-1">{formatShortPrice(cell.price)}</span>
                            {isRedZone && <span className="absolute top-1 right-1 text-[9px] text-red-500 font-bold">상가</span>}
                        </div>
                    );
                })}
            </div>
        );
    };

    return (
        <div className="space-y-6">
            <h3 className="text-2xl font-bold">부동산</h3>

            {pendingRent && (
                <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl flex justify-between items-center animate-pulse">
                    <div>
                        <p className="font-bold text-red-600 dark:text-red-400">🚨 임대료 납부 알림</p>
                        <p className="text-xs">집 #{pendingRent.propertyId} (소유주: {pendingRent.owner})</p>
                    </div>
                    <Button onClick={handlePayRent} className="bg-red-600 hover:bg-red-500 text-xs py-2 px-4">
                        ₩{pendingRent.amount.toLocaleString()} 납부
                    </Button>
                </div>
            )}

            {renderGrid()}

            <Card>
                {selectedCell ? (
                    <div className="space-y-4">
                        <div className="flex justify-between items-start border-b pb-2">
                            <h4 className="font-bold text-lg">집 #{selectedCell.id} 정보</h4>
                            <span className="text-gray-500 text-xs">공시지가: ₩{selectedCell.price.toLocaleString()}</span>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <span className="block text-gray-500 text-xs">소유주</span>
                                <span className="font-bold">{selectedCell.owner || '없음 (국가 소유)'}</span>
                                {selectedCell.isJointOwnership && <span className="text-[10px] bg-blue-100 text-blue-800 px-1 rounded ml-1">공동</span>}
                            </div>
                            <div>
                                <span className="block text-gray-500 text-xs">세입자</span>
                                <span className="font-bold">{selectedCell.tenant || '없음'}</span>
                            </div>
                        </div>

                        <div className="pt-2">
                            {selectedCell.owner === currentUser?.name ? (
                                <p className="text-center text-sm text-green-600 font-bold">내 소유 부동산입니다.</p>
                            ) : !selectedCell.owner ? (
                                <Button onClick={handleBuyFromBank} className="w-full">
                                    구매하기 (₩{selectedCell.price.toLocaleString()})
                                </Button>
                            ) : (
                                <div className="flex gap-2">
                                    <Button onClick={() => { setOfferType('buy'); setIsOfferModalOpen(true); }} className="flex-1 bg-blue-600 hover:bg-blue-500">
                                        매수 제안
                                    </Button>
                                    <Button onClick={() => { setOfferType('lease'); setIsOfferModalOpen(true); }} className="flex-1 bg-green-600 hover:bg-green-500">
                                        임대 문의
                                    </Button>
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="text-center text-gray-500 py-8">
                        지도의 집을 선택하여 정보를 확인하세요.
                    </div>
                )}
            </Card>

            <Modal isOpen={isOfferModalOpen} onClose={() => setIsOfferModalOpen(false)} title={offerType === 'buy' ? "매수 제안" : "임대 문의"}>
                <div className="space-y-4">
                    <p className="text-sm">소유주 <b>{selectedCell?.owner}</b>님에게 {offerType === 'buy' ? '매수 제안' : '임대 문의'} 메시지를 보냅니다.</p>
                    <Input 
                        type="number" 
                        value={offerPrice} 
                        onChange={e => setOfferPrice(e.target.value)} 
                        placeholder={offerType === 'buy' ? "제안 가격 (₩)" : "제안 주세 (1주당 ₩)"} 
                    />
                    {offerType === 'lease' && <p className="text-xs text-gray-500">* 계약이 체결되면 매주 자동으로 이체됩니다.</p>}
                    <Button onClick={handleMakeOffer} className="w-full">제안 메시지 보내기</Button>
                </div>
            </Modal>
        </div>
    );
};
