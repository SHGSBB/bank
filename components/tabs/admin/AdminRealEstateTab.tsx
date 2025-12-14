
import React, { useState, useEffect } from 'react';
import { useGame } from '../../../context/GameContext';
import { Card, Button, Input } from '../../Shared';

export const AdminRealEstateTab: React.FC = () => {
    const { db, saveDb, showModal, showConfirm } = useGame();
    
    // Selection States
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [mousePos, setMousePos] = useState<{x: number, y: number} | null>(null);

    // Edit Form States
    const [editOwner, setEditOwner] = useState('');
    const [editTenant, setEditTenant] = useState('');
    const [editPrice, setEditPrice] = useState('');
    const [isJoint, setIsJoint] = useState(false);
    const [jointOwners, setJointOwners] = useState('');
    const [bulkPrice, setBulkPrice] = useState('');

    // Grid Settings
    const [cols, setCols] = useState(6);

    // Grid 1 to 18
    const grid = db.realEstate.grid || [];
    const indices = Array.from({ length: 18 }, (_, i) => i + 1);
    
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            setMousePos({ x: e.clientX, y: e.clientY });
        };
        window.addEventListener('mousemove', handleMouseMove);
        return () => window.removeEventListener('mousemove', handleMouseMove);
    }, []);

    const handleCellClick = (id: number) => {
        const prop = grid.find(p => p.id === id);
        if (prop) {
            setSelectedId(id);
            setEditOwner(prop.owner || '');
            setEditTenant(prop.tenant || '');
            setEditPrice(prop.price.toString());
            setIsJoint(prop.isJointOwnership);
            setJointOwners(prop.jointOwners ? prop.jointOwners.join(', ') : '');
        } else {
            setSelectedId(id);
            setEditOwner('');
            setEditTenant('');
            setEditPrice('10000000');
            setIsJoint(false);
            setJointOwners('');
        }
    };

    const handleSaveProperty = async () => {
        if (selectedId === null) return;
        const newDb = { ...db };
        const newGrid = [...(newDb.realEstate.grid || [])];
        let index = newGrid.findIndex(p => p.id === selectedId);
        
        if (index === -1) {
             newGrid.push({ id: selectedId, owner: null, tenant: null, price: 10000000, isJointOwnership: false, isMerged: false });
             index = newGrid.length - 1;
        }

        const ownerName = editOwner.trim();
        if (ownerName && !db.users[ownerName]) return showModal('존재하지 않는 소유주입니다.');
        
        const tenantName = editTenant.trim();
        if (tenantName && !db.users[tenantName]) return showModal('존재하지 않는 임대인입니다.');

        const price = parseInt(editPrice);
        if (isNaN(price) || price <= 0) return showModal('올바른 가격을 입력하세요.');

        newGrid[index] = {
            ...newGrid[index],
            owner: ownerName || null,
            tenant: tenantName || null,
            price: price,
            isJointOwnership: isJoint,
            jointOwners: isJoint ? jointOwners.split(',').map(s => s.trim()).filter(Boolean) : []
        };
        newDb.realEstate.grid = newGrid;

        await saveDb(newDb);
        showModal('부동산 정보가 업데이트되었습니다.');
    };

    const handleBulkPriceUpdate = async () => {
        const price = parseInt(bulkPrice);
        if (isNaN(price) || price <= 0) return showModal('올바른 공시지가를 입력하세요.');

        const confirmed = await showConfirm(`모든 집의 가격을 ₩${price.toLocaleString()}으로 일괄 조정하시겠습니까?`);
        if (!confirmed) return;

        const newDb = { ...db };
        const newGrid = (newDb.realEstate.grid || []).map(cell => ({ ...cell, price }));
        newDb.realEstate.grid = newGrid;

        await saveDb(newDb);
        showModal('공시지가가 일괄 조정되었습니다.');
        setBulkPrice('');
    };

    return (
        <div>
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-2xl font-bold">부동산 관리 (관리자)</h3>
                <div className="flex gap-2">
                    <div className="flex items-center gap-2">
                        <span className="text-sm">열(Cols):</span>
                        <Input 
                            type="number" 
                            value={cols} 
                            onChange={e => setCols(parseInt(e.target.value) || 6)} 
                            className="w-16 py-1"
                        />
                    </div>
                </div>
            </div>
            
            {/* Grid Visualization */}
            <div 
                className="grid gap-2 mb-6 select-none relative" 
                style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
            >
                {indices.map((id) => {
                    const cell = grid.find(c => c.id === id) || { id, owner: null, tenant: null, price: 0, isJointOwnership: false, isMerged: false };
                    
                    const isMall1 = id === 1;
                    const isMall2 = id === 7;
                    const isMall3 = id === 13;

                    if (isMall2) return null; // Hidden

                    const isRedZone = isMall1 || isMall3;
                    const isSelected = selectedId === id;

                    let rowSpan = 'row-span-1';
                    if (isMall1) rowSpan = 'row-span-2';

                    return (
                        <div 
                            key={id}
                            onClick={() => handleCellClick(id)}
                            className={`
                                col-span-1 ${rowSpan}
                                min-h-[6rem] rounded-3xl p-1 flex flex-col items-center justify-center cursor-pointer border-2 transition-all text-xs relative
                                ${isRedZone ? 'bg-green-100 dark:bg-green-900/30 border-green-200 dark:border-green-800' : 'bg-[#F0F0F0] dark:bg-[#2D2D2D] border-transparent'}
                                ${isSelected ? 'ring-2 ring-green-500' : ''}
                            `}
                        >
                            <span className="font-bold truncate w-full text-center">
                                {cell.owner ? (cell.isJointOwnership ? `${cell.owner} 외` : `${cell.owner}`) : '빈 집'} #{id}
                            </span>
                            <span className="mt-1">₩{(cell.price || 0).toLocaleString()}</span>
                            {isRedZone && <span className="absolute top-1 right-1 text-[10px] text-green-600 font-bold">상가</span>}
                        </div>
                    );
                })}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
                <Card className="w-full">
                    {selectedId === null ? (
                        <p className="text-center text-gray-500 py-10">집을 클릭하여 관리하세요.</p>
                    ) : (
                        <div className="space-y-3 w-full">
                            <h4 className="font-bold text-lg">집 #{selectedId} 관리</h4>
                            <div>
                                <label className="text-xs font-bold block mb-1">소유주</label>
                                <Input value={editOwner} onChange={e => setEditOwner(e.target.value)} placeholder="(공백시 소유주 없음)" className="w-full" />
                            </div>
                            <div>
                                <label className="text-xs font-bold block mb-1">임대인</label>
                                <Input value={editTenant} onChange={e => setEditTenant(e.target.value)} placeholder="(공백시 임대인 없음)" className="w-full" />
                            </div>
                            <div>
                                <label className="text-xs font-bold block mb-1">가격 (₩)</label>
                                <Input type="number" value={editPrice} onChange={e => setEditPrice(e.target.value)} className="w-full" />
                            </div>
                            <div className="flex items-center gap-2">
                                <input type="checkbox" checked={isJoint} onChange={e => setIsJoint(e.target.checked)} className="accent-green-600" />
                                <label className="text-sm">공동 소유</label>
                            </div>
                            {isJoint && (
                                <div>
                                    <label className="text-xs font-bold block mb-1">공동 소유주 (쉼표 구분)</label>
                                    <Input value={jointOwners} onChange={e => setJointOwners(e.target.value)} placeholder="예: user1, user2" className="w-full" />
                                </div>
                            )}
                            <Button className="w-full mt-2" onClick={handleSaveProperty}>개별 저장</Button>
                        </div>
                    )}
                </Card>

                <div className="space-y-6 w-full">
                    <Card className="w-full">
                        <h4 className="font-bold text-lg mb-3">전체 공시지가 조정</h4>
                        <div className="flex gap-2 w-full">
                            <Input type="number" placeholder="새 가격 (₩)" value={bulkPrice} onChange={e => setBulkPrice(e.target.value)} className="w-full" />
                            <Button onClick={handleBulkPriceUpdate} className="whitespace-nowrap">일괄 적용</Button>
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
};
