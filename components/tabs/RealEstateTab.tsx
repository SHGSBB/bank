import React, { useState, useMemo, useRef } from 'react';
import { useGame } from '../../context/GameContext';
import { Card, Button, Modal, Input, formatShortPrice } from '../Shared';
import { RealEstateOffer, RealEstateCell, RentRequest } from '../../types';
import { generateId } from '../../services/firebase';

const TransactionChart: React.FC<{ data: { price: number, date: string }[] }> = ({ data }) => {
    const [hoverInfo, setHoverInfo] = useState<{ x: number, price: number, date: string, svgX: number, svgY: number } | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const chartData = useMemo(() => [...data].reverse().slice(-50), [data]); 

    if (chartData.length === 0) return <div className="h-full flex items-center justify-center text-gray-400">거래 데이터 없음</div>;

    const width = 1000;
    const height = 150;
    
    const prices = chartData.map(d => d.price);
    const minPrice = Math.min(...prices) * 0.9;
    const maxPrice = Math.max(...prices) * 1.1;
    const range = maxPrice - minPrice || 1;

    const isSinglePoint = chartData.length === 1;

    const handleInteraction = (e: React.MouseEvent | React.TouchEvent) => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
        const x = clientX - rect.left;
        
        if (x < 0 || x > rect.width) return;

        if (isSinglePoint) {
             const point = chartData[0];
             setHoverInfo({
                x: rect.width / 2,
                price: point.price,
                date: point.date,
                svgX: width / 2,
                svgY: height / 2
             });
             return;
        }

        const index = Math.min(Math.floor((x / rect.width) * chartData.length), chartData.length - 1);
        const point = chartData[index];
        
        const svgX = (index / (chartData.length - 1)) * width;
        const svgY = height - ((point.price - minPrice) / range) * height;

        setHoverInfo({
            x,
            price: point.price,
            date: point.date,
            svgX,
            svgY
        });
    };

    const handleLeave = () => setHoverInfo(null);

    let points = "";
    if (isSinglePoint) {
        points = `0,${height/2} ${width},${height/2}`;
    } else {
        points = chartData.map((d, i) => {
            const x = (i / (chartData.length - 1)) * width;
            const y = height - ((d.price - minPrice) / range) * height;
            return `${x},${y}`;
        }).join(' ');
    }

    return (
        <div 
            ref={containerRef}
            className="w-full h-full relative cursor-crosshair touch-none"
            onMouseMove={handleInteraction}
            onMouseLeave={handleLeave}
            onTouchStart={handleInteraction}
            onTouchMove={handleInteraction}
            onTouchEnd={handleLeave}
        >
            <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible" preserveAspectRatio="none">
                <polyline fill="none" stroke="#eab308" strokeWidth="3" points={points} vectorEffect="non-scaling-stroke" />
                {chartData.map((d, i) => {
                    const x = (i / (chartData.length - 1)) * width;
                    const y = height - ((d.price - minPrice) / range) * height;
                    return <circle key={i} cx={x} cy={y} r="3" fill="#eab308" stroke="white" strokeWidth="1" />;
                })}
            </svg>
            {hoverInfo && (
                <div 
                    className="absolute bg-black/80 text-white text-xs p-2 rounded pointer-events-none z-10 whitespace-nowrap shadow-xl border border-white/20"
                    style={{ left: hoverInfo.x, top: 10, transform: 'translateX(-50%)' }}
                >
                    <p className="font-bold mb-1 text-gray-300">{new Date(hoverInfo.date).toLocaleDateString()}</p>
                    <p className="text-lg font-bold">₩ {hoverInfo.price.toLocaleString()}</p>
                </div>
            )}
        </div>
    );
};

export const RealEstateTab: React.FC = () => {
    const { db, currentUser, notify, saveDb, showModal, showConfirm } = useGame();
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [rentAmount, setRentAmount] = useState('');

    const grid = useMemo(() => db.realEstate.grid || [], [db.realEstate.grid]);
    const pendingRent = currentUser?.pendingRent;

    const myProperties = useMemo(() => grid.filter(p => p.owner === currentUser?.name), [grid, currentUser]);
    
    const rentedProperties = useMemo(() => grid.filter(p => p.tenant === currentUser?.name), [grid, currentUser]);
    
    const allOffers = useMemo(() => {
        return db.realEstate.offers ? Object.values(db.realEstate.offers) as RealEstateOffer[] : [];
    }, [db.realEstate.offers]);

    const receivedOffers = useMemo(() => allOffers.filter(o => o.to === currentUser?.name && o.status === 'pending'), [allOffers, currentUser]);
    const sentOffers = useMemo(() => allOffers.filter(o => o.from === currentUser?.name && o.status === 'pending'), [allOffers, currentUser]);

    const selectedCell = selectedId !== null ? grid.find(c => c.id === selectedId) : null;
    const transactions = useMemo(() => db.realEstate.recentTransactions || [], [db.realEstate.recentTransactions]);

    const handleProposeBuy = async () => {
        if (!selectedCell || !selectedCell.owner || selectedCell.owner === currentUser?.name) return;
        const priceStr = prompt(`제안할 가격을 입력하세요 (현재가: ₩${selectedCell.price.toLocaleString()}):`, selectedCell.price.toString());
        if (!priceStr) return;
        const price = parseInt(priceStr);
        if (isNaN(price) || price <= 0) return showModal("올바른 가격을 입력하세요.");
        if (currentUser!.balanceKRW < price) return showModal('잔액이 부족합니다.');
        
        const offerId = generateId();
        const newDb = { ...db };
        const offer: RealEstateOffer = { 
            id: offerId, propertyId: selectedCell.id, from: currentUser!.name, to: selectedCell.owner, price, status: 'pending' 
        };
        newDb.realEstate.offers = { ...(newDb.realEstate.offers || {}), [offerId]: offer };
        await saveDb(newDb);
        notify(selectedCell.owner, `${currentUser!.name}님이 집 #${selectedCell.id}을(를) ₩${price.toLocaleString()}에 구매 제안했습니다.`, true);
        showModal("구매 제안을 보냈습니다.");
    };
    
    const handleOfferResponse = async (offerId: string, accept: boolean) => {
        const newDb = { ...db };
        const offer = (newDb.realEstate.offers || {})[offerId];
        if (!offer) return;

        if (accept) {
            const buyer = newDb.users[offer.from];
            const seller = newDb.users[offer.to];
            const prop = newDb.realEstate.grid.find(p => p.id === offer.propertyId);

            if (!prop) return showModal('부동산 정보를 찾을 수 없습니다.');
            if (buyer.balanceKRW < offer.price) {
                showModal('구매자의 잔액이 부족합니다.');
                notify(buyer.name, `집 #${offer.propertyId} 구매 제안이 잔액 부족으로 거절되었습니다.`);
                offer.status = 'rejected';
            } else {
                const confirmed = await showConfirm(`정말 제안을 수락하시겠습니까?`);
                if (!confirmed) return;

                buyer.balanceKRW -= offer.price;
                seller.balanceKRW += offer.price;
                
                const date = new Date().toISOString();
                buyer.transactions = [...(buyer.transactions || []), {id: Date.now(), type: 'expense', amount: -offer.price, currency: 'KRW', description: `집 #${prop.id} 구매`, date}];
                seller.transactions = [...(seller.transactions || []), {id: Date.now()+1, type: 'income', amount: offer.price, currency: 'KRW', description: `집 #${prop.id} 판매`, date}];
                
                prop.owner = buyer.name;
                prop.isJointOwnership = false;
                prop.jointOwners = [];
                prop.tenant = null; 
                
                newDb.realEstate.recentTransactions = [{ id: prop.id, seller: seller.name, buyer: buyer.name, price: offer.price, date }, ...(newDb.realEstate.recentTransactions || [])].slice(0, 20);
                
                notify(buyer.name, `집 #${prop.id} 구매 제안이 수락되었습니다.`);
                offer.status = 'accepted';
            }
        } else {
            offer.status = 'rejected';
            notify(offer.from, `집 #${offer.propertyId} 구매 제안이 거절되었습니다.`);
        }
        
        delete newDb.realEstate.offers[offerId]; 
        await saveDb(newDb);
        showModal('처리되었습니다.');
    };

    const handlePriceAdjust = async (prop: RealEstateCell) => {
        if(currentUser?.type !== 'admin') return showModal("가격 조정은 한국은행만 가능합니다.");
        const priceStr = prompt(`집 #${prop.id}의 새 가격을 입력하세요.`, prop.price.toString());
        const price = parseInt(priceStr || "");
        if (!isNaN(price) && price > 0) {
            const newDb = {...db};
            const gridProp = newDb.realEstate.grid.find(p => p.id === prop.id);
            if(gridProp) {
                gridProp.price = price;
                await saveDb(newDb);
                showModal("가격이 조정되었습니다.");
            }
        }
    };

    const handleRequestRent = async (prop: RealEstateCell) => {
        if (!prop.tenant) return showModal("세입자가 없습니다.");
        const amount = prompt(`세입자(${prop.tenant})에게 청구할 임대료(월세)를 입력하세요:`);
        const val = parseInt(amount || "");
        if (isNaN(val) || val <= 0) return showModal("올바른 금액을 입력하세요.");

        const newDb = { ...db };
        const tenant = newDb.users[prop.tenant];
        if (!tenant) return showModal("세입자 정보를 찾을 수 없습니다.");

        const rentReq: RentRequest = {
            id: `rent_${Date.now()}`,
            propertyId: prop.id,
            owner: currentUser!.name,
            tenant: prop.tenant,
            amount: val,
            dueDate: new Date().toISOString(),
            status: 'pending'
        };

        tenant.pendingRent = rentReq;
        await saveDb(newDb);
        notify(tenant.name, `집 #${prop.id} 임대료 ₩${val.toLocaleString()}가 청구되었습니다.`, true, 'rent_pay', rentReq);
        showModal("임대료 청구서가 발송되었습니다.");
    };

    const handlePayRent = async () => {
        if (!pendingRent) return;
        const newDb = { ...db };
        const tenant = newDb.users[currentUser!.name];
        const owner = newDb.users[pendingRent.owner];

        if (tenant.balanceKRW < pendingRent.amount) return showModal("잔액이 부족하여 임대료를 납부할 수 없습니다.");

        tenant.balanceKRW -= pendingRent.amount;
        owner.balanceKRW += pendingRent.amount;

        const date = new Date().toISOString();
        tenant.transactions = [...(tenant.transactions || []), { id: Date.now(), type: 'expense', amount: -pendingRent.amount, currency: 'KRW', description: `임대료 납부 (#${pendingRent.propertyId})`, date }];
        owner.transactions = [...(owner.transactions || []), { id: Date.now()+1, type: 'income', amount: pendingRent.amount, currency: 'KRW', description: `임대료 수입 (#${pendingRent.propertyId})`, date }];

        delete tenant.pendingRent;
        await saveDb(newDb);
        notify(owner.name, `${currentUser!.name}님이 임대료 ₩${pendingRent.amount.toLocaleString()}를 납부했습니다.`);
        showModal("임대료 납부가 완료되었습니다.");
    };
    
    const totalCells = 18;
    
    return (
        <div className="w-full">
            <h3 className="text-2xl font-bold mb-4">부동산</h3>

            {pendingRent && (
                <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex justify-between items-center animate-pulse">
                    <div>
                        <h4 className="text-red-700 font-bold">📢 임대료 납부 요청</h4>
                        <p className="text-sm text-red-600">
                            집 주인({pendingRent.owner})이 집 #{pendingRent.propertyId}의 임대료 
                            <span className="font-bold ml-1">₩{pendingRent.amount.toLocaleString()}</span>을 청구했습니다.
                        </p>
                    </div>
                    <Button onClick={handlePayRent} className="bg-red-600 hover:bg-red-500 whitespace-nowrap">즉시 납부</Button>
                </div>
            )}

            <div className="grid grid-cols-6 gap-2 mb-6 select-none">
                {Array.from({ length: totalCells }).map((_, i) => {
                    const id = i + 1; 
                    const cell = grid.find(c => c.id === id) || { id, owner: null, tenant: null, price: 0, isMerged: false };
                    
                    const isMall1 = id === 1;
                    const isMall2 = id === 7;
                    const isMall3 = id === 13;
                    
                    if (isMall2) return null; 
                    
                    const isRedZone = isMall1 || isMall3;
                    
                    let cellClasses = 'min-h-[6rem] rounded-3xl p-1 flex flex-col items-center justify-center cursor-pointer border-2 transition-all text-xs ';
                    if (isRedZone) {
                        cellClasses += 'bg-green-100 dark:bg-green-900/30 border-green-300 dark:border-green-700 ';
                    } else {
                        cellClasses += 'bg-gray-100 dark:bg-gray-800/50 border-transparent ';
                    }
                    if (selectedId === id) {
                        cellClasses += 'ring-2 ring-green-500 ';
                    }
                    if (isMall1) {
                        cellClasses += 'row-span-2 ';
                    }

                    const isTenant = cell.tenant === currentUser?.name;
                    const isOwner = cell.owner === currentUser?.name;

                    return (
                        <div key={id} onClick={() => setSelectedId(id)} className={cellClasses}>
                            <span className="font-bold truncate w-full text-center break-words whitespace-normal leading-tight px-1">
                                {isOwner ? '내 집' : (isTenant ? '임대 중' : (cell.owner || '빈 집'))} #{id}
                            </span>
                            <span className="mt-1 font-mono text-[10px] sm:text-xs">₩{formatShortPrice(cell.price)}</span>
                            {isRedZone && <span className="text-xs text-green-600 mt-1 font-bold">상가</span>}
                            {isTenant && <span className="text-[10px] bg-blue-100 text-blue-800 px-1 rounded mt-1">세입자</span>}
                        </div>
                    );
                })}
            </div>

            {selectedCell && (
                <Card className="mb-6 animate-fade-in">
                    <h4 className="font-bold mb-2 text-lg">선택된 부동산: #{selectedId}</h4>
                    <p>소유주: <span className="font-medium">{selectedCell.owner || '없음'}</span></p>
                    <p>세입자(임대): <span className="font-medium">{selectedCell.tenant || '없음'}</span></p>
                    <p>현재가: <span className="font-medium">₩{selectedCell.price.toLocaleString()}</span></p>
                    <div className="mt-4">
                        {selectedCell.owner && selectedCell.owner !== currentUser?.name && (
                            <Button onClick={handleProposeBuy}>구매 제안하기</Button>
                        )}
                         {selectedCell.owner === null && (
                            <Button onClick={() => showModal("구매 기능은 구현 예정입니다.")} disabled>구매하기 (구현 예정)</Button>
                        )}
                    </div>
                </Card>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
                <Card>
                    <h4 className="text-lg font-bold mb-2">나의 부동산 (소유)</h4>
                    {myProperties.length === 0 ? <p className="text-gray-500 text-sm">보유한 집이 없습니다.</p> :
                    <ul className="space-y-2 max-h-60 overflow-auto">
                        {myProperties.map(p => (
                            <li key={p.id} className="p-3 bg-gray-50 dark:bg-gray-800 rounded flex flex-col gap-2 border">
                                <div className="flex justify-between items-center">
                                    <span className="font-bold">집 #{p.id}</span>
                                    <span className="text-xs text-gray-500">₩{p.price.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                    <span>세입자: {p.tenant || '없음'}</span>
                                    <div className="flex gap-2">
                                        {p.tenant && <Button className="text-xs py-1 px-2 bg-purple-600" onClick={() => handleRequestRent(p)}>임대료 청구</Button>}
                                        {currentUser?.type === 'admin' && <Button className="text-xs py-1 px-2" onClick={() => handlePriceAdjust(p)}>가격 조정</Button>}
                                    </div>
                                </div>
                            </li>
                        ))}
                    </ul>}
                </Card>
                <Card>
                     <h4 className="text-lg font-bold mb-2">임대 중인 부동산 (세입자)</h4>
                     {rentedProperties.length === 0 ? <p className="text-gray-500 text-sm">임대 중인 집이 없습니다.</p> :
                     <ul className="space-y-2 max-h-60 overflow-auto">
                        {rentedProperties.map(p => (
                            <li key={p.id} className="p-2 bg-blue-50 dark:bg-blue-900/10 rounded flex justify-between items-center border border-blue-100 dark:border-blue-900">
                                <span className="text-sm">집 #{p.id} (주인: {p.owner})</span>
                                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">거주중</span>
                            </li>
                        ))}
                     </ul>}
                </Card>
            </div>
            
            <Card className="mt-6 h-64 flex flex-col">
                <h4 className="font-bold mb-4">최근 거래 가격 변동</h4>
                <div className="flex-1 w-full min-h-0 border-b border-l border-gray-300 dark:border-gray-600">
                    <TransactionChart data={transactions} />
                </div>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                <Card>
                    <h4 className="text-lg font-bold mb-2">받은 제안</h4>
                    {receivedOffers.length === 0 ? <p className="text-xs text-gray-400">없음</p> :
                    <ul className="space-y-2 max-h-40 overflow-auto">
                        {receivedOffers.map(o => (
                            <li key={o.id} className="p-3 bg-green-50 dark:bg-green-900/10 rounded border border-green-100 dark:border-green-900">
                                <p className="text-sm"><b>{o.from}</b> 님이 <b>집 #{o.propertyId}</b> 구매 희망</p>
                                <p className="font-bold my-1 text-green-600">제안가: ₩{o.price.toLocaleString()}</p>
                                <div className="flex gap-2 mt-1">
                                    <Button className="text-xs flex-1 py-1" onClick={() => handleOfferResponse(o.id, true)}>수락</Button>
                                    <Button variant="danger" className="text-xs flex-1 py-1" onClick={() => handleOfferResponse(o.id, false)}>거절</Button>
                                </div>
                            </li>
                        ))}
                    </ul>}
                </Card>
                <Card>
                     <h4 className="text-lg font-bold mb-2">보낸 제안</h4>
                     {sentOffers.length === 0 ? <p className="text-xs text-gray-400">없음</p> :
                     <ul className="space-y-2 max-h-40 overflow-auto">
                        {sentOffers.map(o => (
                            <li key={o.id} className="p-2 bg-gray-50 dark:bg-gray-800 rounded flex justify-between items-center text-sm">
                                <span>집 #{o.propertyId} (to {o.to})</span>
                                <span className="font-bold">₩{o.price.toLocaleString()}</span>
                                <span className="text-xs text-yellow-500 bg-yellow-100 dark:bg-yellow-900 px-1 rounded">대기중</span>
                            </li>
                        ))}
                     </ul>}
                </Card>
            </div>
        </div>
    );
};