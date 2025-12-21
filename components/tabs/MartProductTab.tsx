
import React, { useState, useMemo } from 'react';
import { useGame } from '../../context/GameContext';
import { Card, Button, Input, FileInput, Toggle, LineIcon, Modal } from '../Shared';
import { Product, ProductVariant } from '../../types';
import { uploadImage } from '../../services/firebase';

export const MartProductTab: React.FC = () => {
    const { currentUser, updateUser, showModal, showConfirm } = useGame();
    
    const [isEditing, setIsEditing] = useState<string | null>(null);
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [image, setImage] = useState<string | null>(null);
    const [stock, setStock] = useState('100');
    const [isOnEvent, setIsOnEvent] = useState(false);
    const [discountPercent, setDiscountPercent] = useState('');
    const [priceDisplayMethod, setPriceDisplayMethod] = useState<'min' | 'avg'>('min');
    
    // Variant State (formerly options)
    const [variants, setVariants] = useState<ProductVariant[]>([]);
    const [newVarName, setNewVarName] = useState('');
    const [newVarKRW, setNewVarKRW] = useState('');
    const [newVarUSD, setNewVarUSD] = useState('');

    // Stock Detail Modal
    const [stockDetailProduct, setStockDetailProduct] = useState<Product | null>(null);

    const products = currentUser?.products ? (Object.values(currentUser.products) as Product[]) : [];

    const handleSave = async () => {
        if (!name.trim()) return showModal('상품 이름을 입력하세요.');
        if (variants.length === 0) return showModal("최소 1개 이상의 항목(옵션)을 추가해야 합니다.");
        
        const pStock = parseInt(stock) || 0;

        let imageUrl = image;
        if (image && image.startsWith('data:')) {
            try {
                // Ensure cloud upload
                imageUrl = await uploadImage(`products/${currentUser!.name}/${Date.now()}`, image);
            } catch (e) {
                return showModal("이미지 업로드 실패: " + e);
            }
        }

        const prodId = isEditing || `prod_${Date.now()}`;
        
        // Base price is the first variant's price
        const baseVariant = variants[0];

        const product: Product = {
            id: prodId,
            name: name.trim(),
            price: baseVariant.priceKRW,
            priceUSD: baseVariant.priceUSD > 0 ? baseVariant.priceUSD : undefined,
            description,
            image: imageUrl,
            stock: pStock,
            isOnEvent,
            eventDiscountPercent: isOnEvent ? (parseInt(discountPercent) || 0) : undefined,
            variants: variants, // Store full list
            priceDisplayMethod // Store display preference
        };
        
        const newProducts = { ...(currentUser!.products || {}), [prodId]: product };
        await updateUser(currentUser!.name, { products: newProducts });

        resetForm();
        showModal(isEditing ? '상품이 수정되었습니다.' : '상품이 등록되었습니다.');
    };

    const handleEdit = (p: Product) => {
        setIsEditing(p.id);
        setName(p.name);
        setDescription(p.description || '');
        setImage(p.image || null);
        setStock(p.stock ? p.stock.toString() : '0');
        setIsOnEvent(!!p.isOnEvent);
        setDiscountPercent(p.eventDiscountPercent?.toString() || '');
        setPriceDisplayMethod(p.priceDisplayMethod || 'min');
        
        if (p.variants && p.variants.length > 0) {
            setVariants(p.variants);
        } else {
            setVariants([{
                name: '기본',
                priceKRW: p.price,
                priceUSD: p.priceUSD || 0
            }]);
        }
    };

    const handleDelete = async (id: string) => {
        if (!(await showConfirm('정말 삭제하시겠습니까?'))) return;
        const newProducts = { ...(currentUser!.products || {}) };
        delete newProducts[id];
        await updateUser(currentUser!.name, { products: newProducts });
    };

    const handleAddVariant = () => {
        if (!newVarName.trim()) return showModal("항목 이름을 입력하세요.");
        const k = parseInt(newVarKRW) || 0;
        const u = parseFloat(newVarUSD) || 0;
        if (k <= 0 && u <= 0) return showModal("가격을 입력하세요.");

        setVariants([...variants, { name: newVarName.trim(), priceKRW: k, priceUSD: u }]);
        setNewVarName(''); setNewVarKRW(''); setNewVarUSD('');
    };

    const handleRemoveVariant = (index: number) => setVariants(variants.filter((_, i) => i !== index));
    
    const moveVariant = (index: number, direction: -1 | 1) => {
        const newVars = [...variants];
        const targetIndex = index + direction;
        if (targetIndex < 0 || targetIndex >= newVars.length) return;
        
        [newVars[index], newVars[targetIndex]] = [newVars[targetIndex], newVars[index]];
        setVariants(newVars);
    };

    const resetForm = () => { 
        setIsEditing(null); setName(''); setDescription(''); setImage(null); setStock('100'); setIsOnEvent(false); setDiscountPercent(''); 
        setVariants([]); setNewVarName(''); setNewVarKRW(''); setNewVarUSD(''); setPriceDisplayMethod('min');
    };

    return (
        <div className="w-full space-y-6">
            <h3 className="text-2xl font-bold mb-4">물품 관리</h3>
            <Card>
                <h4 className="text-lg font-bold mb-4">{isEditing ? '상품 수정' : '새 상품 등록'}</h4>
                <div className="flex flex-col gap-4">
                    <Input placeholder="상품 이름 (메뉴명)" value={name} onChange={e => setName(e.target.value)} className="w-full" />
                    
                    <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">
                        <div className="flex justify-between items-center mb-2">
                            <p className="font-bold text-sm text-black dark:text-white">항목 (옵션/메뉴) 구성</p>
                            <span className="text-xs text-gray-500">* 첫 번째 항목이 대표 가격이 됩니다.</span>
                        </div>
                        
                        <div className="space-y-2 mb-3">
                            {variants.map((v, i) => (
                                <div key={i} className="flex items-center gap-2 bg-white dark:bg-black p-2 rounded border border-gray-200 dark:border-gray-700">
                                    <div className="flex flex-col gap-1">
                                        <button onClick={() => moveVariant(i, -1)} disabled={i === 0} className="text-gray-400 hover:text-black disabled:opacity-30">▲</button>
                                        <button onClick={() => moveVariant(i, 1)} disabled={i === variants.length - 1} className="text-gray-400 hover:text-black disabled:opacity-30">▼</button>
                                    </div>
                                    <div className="flex-1">
                                        <span className="font-bold text-sm block">{v.name}</span>
                                        <span className="text-xs text-gray-500">
                                            {v.priceKRW > 0 && `₩${v.priceKRW.toLocaleString()}`}
                                            {v.priceKRW > 0 && v.priceUSD > 0 && ' + '}
                                            {v.priceUSD > 0 && `$${v.priceUSD}`}
                                        </span>
                                    </div>
                                    <button onClick={() => handleRemoveVariant(i)} className="text-red-500 font-bold p-2">×</button>
                                </div>
                            ))}
                            {variants.length === 0 && <p className="text-center text-xs text-gray-400 py-2">등록된 항목이 없습니다.</p>}
                        </div>

                        <div className="grid grid-cols-12 gap-2 items-end bg-gray-100 dark:bg-gray-900 p-2 rounded">
                            <div className="col-span-5">
                                <label className="text-[10px] font-bold block mb-1">항목명</label>
                                <Input value={newVarName} onChange={e => setNewVarName(e.target.value)} className="w-full text-sm py-1" placeholder="예: 기본, 곱배기" />
                            </div>
                            <div className="col-span-3">
                                <label className="text-[10px] font-bold block mb-1">가격(₩)</label>
                                <Input type="number" value={newVarKRW} onChange={e => setNewVarKRW(e.target.value)} className="w-full text-sm py-1" placeholder="0" />
                            </div>
                            <div className="col-span-2">
                                <label className="text-[10px] font-bold block mb-1">가격($)</label>
                                <Input type="number" value={newVarUSD} onChange={e => setNewVarUSD(e.target.value)} className="w-full text-sm py-1" placeholder="0" />
                            </div>
                            <div className="col-span-2">
                                <Button onClick={handleAddVariant} className="w-full text-xs py-1.5 h-full">추가</Button>
                            </div>
                        </div>
                    </div>

                    <div>
                        <label className="text-xs font-bold block mb-1">가격 표시 방식 (목록)</label>
                        <div className="flex gap-2">
                            <label className="flex items-center gap-2 cursor-pointer p-2 border rounded text-sm bg-gray-50 dark:bg-gray-800">
                                <input type="radio" name="pdm" checked={priceDisplayMethod === 'min'} onChange={() => setPriceDisplayMethod('min')} className="accent-green-600"/>
                                최저가 (Minimum)
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer p-2 border rounded text-sm bg-gray-50 dark:bg-gray-800">
                                <input type="radio" name="pdm" checked={priceDisplayMethod === 'avg'} onChange={() => setPriceDisplayMethod('avg')} className="accent-green-600"/>
                                평균가 (Average)
                            </label>
                        </div>
                    </div>

                    <div><label className="text-xs font-bold block mb-1">통합 재고 수량</label><Input type="number" placeholder="개수" value={stock} onChange={e => setStock(e.target.value)} className="w-full" /></div>
                    <div><label className="text-xs font-bold block mb-1">상세 설명</label><Input placeholder="상품 설명" value={description} onChange={e => setDescription(e.target.value)} className="w-full" /></div>
                    
                    <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">
                        <div className="flex justify-between items-center mb-2"><span className="font-bold text-sm">행사 등록 (할인)</span><Toggle checked={isOnEvent} onChange={setIsOnEvent} /></div>
                        {isOnEvent && (<div className="flex items-center gap-2"><span className="text-sm">할인율:</span><Input type="number" value={discountPercent} onChange={e => setDiscountPercent(e.target.value)} className="w-20 py-1" placeholder="%" /><span>%</span></div>)}
                    </div>

                    <div className="flex items-center gap-2"><label className="text-sm font-medium">상품 이미지:</label><FileInput onChange={setImage} /></div>
                    <div className="flex gap-2"><Button onClick={handleSave} className="flex-1">{isEditing ? '수정 저장' : '등록'}</Button>{isEditing && <Button onClick={resetForm} variant="secondary" className="flex-1">취소</Button>}</div>
                </div>
            </Card>
            
            <div className="space-y-3">
                <h4 className="text-lg font-bold">등록된 상품 목록</h4>
                {products.length === 0 ? <p className="text-gray-500">등록된 상품이 없습니다.</p> : products.map(p => (
                    <div key={p.id} className="flex justify-between items-center p-3 bg-white dark:bg-gray-800 border rounded shadow-sm">
                        <div className="flex items-center gap-3">
                            {p.image && <img src={p.image} className="w-12 h-12 object-cover rounded" />}
                            <div>
                                <p className="font-bold">{p.name}</p>
                                <div className="flex items-center gap-2 text-xs text-gray-500">
                                    <button onClick={() => setStockDetailProduct(p)} className="hover:text-green-500 hover:underline font-bold">
                                        재고: {p.stock}
                                    </button>
                                    <span>| 항목 {p.variants?.length || 0}개</span>
                                </div>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <Button onClick={() => handleEdit(p)} className="text-xs py-1 px-2" variant="secondary">수정</Button>
                            <Button onClick={() => handleDelete(p.id)} className="text-xs py-1 px-2" variant="danger">삭제</Button>
                        </div>
                    </div>
                ))}
            </div>

            {stockDetailProduct && (
                <Modal isOpen={true} onClose={() => setStockDetailProduct(null)} title={`${stockDetailProduct.name} 재고 상세`}>
                    <div className="space-y-4 text-center">
                        <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
                            <p className="text-sm text-gray-500 mb-1">통합 총 재고</p>
                            <p className="text-3xl font-black">{stockDetailProduct.stock?.toLocaleString()} 개</p>
                        </div>
                        <div className="text-left space-y-2">
                            <p className="font-bold text-sm">항목별 정보</p>
                            {stockDetailProduct.variants?.map((v, i) => (
                                <div key={i} className="flex justify-between p-2 bg-gray-100 dark:bg-gray-700 rounded text-sm">
                                    <span>{v.name}</span>
                                    <span>{v.priceKRW.toLocaleString()}원 {v.priceUSD > 0 && `+ $${v.priceUSD}`}</span>
                                </div>
                            ))}
                        </div>
                        <p className="text-xs text-gray-400">현재 시스템은 통합 재고만 관리합니다. 옵션별 재고 관리는 추후 업데이트 예정입니다.</p>
                        <Button onClick={() => setStockDetailProduct(null)} className="w-full">닫기</Button>
                    </div>
                </Modal>
            )}
        </div>
    );
};
