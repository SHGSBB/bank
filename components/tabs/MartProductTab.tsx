import React, { useState } from 'react';
import { useGame } from '../../context/GameContext';
import { Card, Button, Input, FileInput, Toggle } from '../Shared';
import { Product, ProductOption } from '../../types';
import { uploadImage } from '../../services/firebase';

export const MartProductTab: React.FC = () => {
    const { currentUser, db, saveDb, showModal, showConfirm } = useGame();
    // ... existing state ...
    const [isEditing, setIsEditing] = useState<string | null>(null);
    const [name, setName] = useState('');
    const [priceKRW, setPriceKRW] = useState(''); 
    const [priceUSD, setPriceUSD] = useState('');
    const [additionalKRW, setAdditionalKRW] = useState('');
    const [description, setDescription] = useState('');
    const [image, setImage] = useState<string | null>(null);
    const [stock, setStock] = useState('100');
    const [isOnEvent, setIsOnEvent] = useState(false);
    const [discountPercent, setDiscountPercent] = useState('');
    const [options, setOptions] = useState<ProductOption[]>([]);
    const [newOptName, setNewOptName] = useState('');
    const [newOptVals, setNewOptVals] = useState('');

    const products = currentUser?.products ? (Object.values(currentUser.products) as Product[]) : [];

    const handleSave = async () => {
        if (!name.trim()) return showModal('상품 이름을 입력하세요.');
        const pKRW = parseInt(priceKRW) || 0;
        const pUSD = parseFloat(priceUSD) || 0;
        const pAddKRW = parseInt(additionalKRW) || 0;
        const pStock = parseInt(stock) || 0;

        if (pKRW <= 0 && pUSD <= 0) return showModal('가격을 입력하세요.');

        let imageUrl = image;
        if (image && image.startsWith('data:')) {
            try {
                imageUrl = await uploadImage(`products/${currentUser!.name}/${Date.now()}`, image);
            } catch (e) {
                return showModal("이미지 업로드 실패");
            }
        }

        const newDb = { ...db };
        const user = newDb.users[currentUser!.name];
        const prodId = isEditing || `prod_${Date.now()}`;
        
        const product: Product = {
            id: prodId,
            name: name.trim(),
            price: pKRW,
            priceUSD: pUSD > 0 ? pUSD : undefined,
            priceAdditionalKRW: pAddKRW > 0 ? pAddKRW : undefined,
            description,
            image: imageUrl,
            stock: pStock,
            isOnEvent,
            eventDiscountPercent: isOnEvent ? (parseInt(discountPercent) || 0) : undefined,
            options: options
        };
        
        user.products = { ...(user.products || {}), [prodId]: product };

        await saveDb(newDb);
        resetForm();
        showModal(isEditing ? '상품이 수정되었습니다.' : '상품이 등록되었습니다.');
    };

    const handleEdit = (p: Product) => {
        setIsEditing(p.id);
        setName(p.name);
        setPriceKRW(p.price.toString());
        setPriceUSD(p.priceUSD?.toString() || '');
        setAdditionalKRW(p.priceAdditionalKRW?.toString() || '');
        setDescription(p.description || '');
        setImage(p.image || null);
        setStock(p.stock ? p.stock.toString() : '0');
        setIsOnEvent(!!p.isOnEvent);
        setDiscountPercent(p.eventDiscountPercent?.toString() || '');
        setOptions(p.options || []);
    };

    const handleDelete = async (id: string) => {
        if (!(await showConfirm('정말 삭제하시겠습니까?'))) return;
        const newDb = { ...db };
        const user = newDb.users[currentUser!.name];
        if (user.products) delete user.products[id];
        await saveDb(newDb);
    };

    const handleAddOption = () => {
        if (!newOptName.trim() || !newOptVals.trim()) return showModal("옵션 이름과 값을 입력하세요.");
        setOptions([...options, { name: newOptName.trim(), values: newOptVals.split(',').map(s => s.trim()).filter(Boolean) }]);
        setNewOptName(''); setNewOptVals('');
    };
    const handleRemoveOption = (index: number) => setOptions(options.filter((_, i) => i !== index));
    const resetForm = () => { setIsEditing(null); setName(''); setPriceKRW(''); setPriceUSD(''); setAdditionalKRW(''); setDescription(''); setImage(null); setStock('100'); setIsOnEvent(false); setDiscountPercent(''); setOptions([]); setNewOptName(''); setNewOptVals(''); };

    return (
        <div className="w-full space-y-6">
            <h3 className="text-2xl font-bold mb-4">물품 관리</h3>
            <Card>
                <h4 className="text-lg font-bold mb-4">{isEditing ? '상품 수정' : '새 상품 등록'}</h4>
                <div className="flex flex-col gap-4">
                    <Input placeholder="상품 이름" value={name} onChange={e => setName(e.target.value)} className="w-full" />
                    <div className="grid grid-cols-2 gap-4">
                        <div><label className="text-xs font-bold block mb-1">가격 (원화)</label><Input type="number" placeholder="₩" value={priceKRW} onChange={e => setPriceKRW(e.target.value)} className="w-full" /></div>
                        <div><label className="text-xs font-bold block mb-1">가격 (달러)</label><Input type="number" placeholder="$" value={priceUSD} onChange={e => setPriceUSD(e.target.value)} className="w-full" /></div>
                    </div>
                    {parseFloat(priceUSD) > 0 && (<div><label className="text-xs font-bold block mb-1">달러 결제 시 추가 원화 (옵션)</label><Input type="number" placeholder="+ ₩" value={additionalKRW} onChange={e => setAdditionalKRW(e.target.value)} className="w-full" /><p className="text-xs text-gray-500">예: $10 + 2000원</p></div>)}
                    <div><label className="text-xs font-bold block mb-1">재고 수량</label><Input type="number" placeholder="개수" value={stock} onChange={e => setStock(e.target.value)} className="w-full" /></div>
                    <div><label className="text-xs font-bold block mb-1">상세 설명</label><Input placeholder="상품 설명" value={description} onChange={e => setDescription(e.target.value)} className="w-full" /></div>
                    
                    <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">
                        <p className="font-bold text-sm mb-2">상품 옵션</p>
                        {options.map((opt, i) => (<div key={i} className="flex justify-between items-center bg-white dark:bg-black p-2 rounded mb-2 text-sm"><span>{opt.name}: {opt.values.join(', ')}</span><button onClick={() => handleRemoveOption(i)} className="text-red-500 font-bold">×</button></div>))}
                        <div className="flex gap-2 items-center"><Input placeholder="옵션명 (예: 색상)" value={newOptName} onChange={e => setNewOptName(e.target.value)} className="flex-1 text-sm py-1" /><Input placeholder="값 (콤마 구분)" value={newOptVals} onChange={e => setNewOptVals(e.target.value)} className="flex-1 text-sm py-1" /><Button onClick={handleAddOption} className="text-xs py-1">추가</Button></div>
                    </div>

                    <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">
                        <div className="flex justify-between items-center mb-2"><span className="font-bold text-sm">행사 등록 (할인)</span><Toggle checked={isOnEvent} onChange={setIsOnEvent} /></div>
                        {isOnEvent && (<div className="flex items-center gap-2"><span className="text-sm">할인율:</span><Input type="number" value={discountPercent} onChange={e => setDiscountPercent(e.target.value)} className="w-20 py-1" placeholder="%" /><span>%</span></div>)}
                    </div>

                    <div className="flex items-center gap-2"><label className="text-sm font-medium">상품 이미지:</label><FileInput onChange={setImage} /></div>
                    <div className="flex gap-2"><Button onClick={handleSave} className="flex-1">{isEditing ? '수정 저장' : '등록'}</Button>{isEditing && <Button onClick={resetForm} variant="secondary" className="flex-1">취소</Button>}</div>
                </div>
            </Card>
            {/* List ... (omitted, same as before) */}
        </div>
    );
};