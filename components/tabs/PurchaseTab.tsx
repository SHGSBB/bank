
import React, { useState, useMemo, useEffect } from 'react';
import { useGame } from '../../context/GameContext';
import { Card, Button, Modal, Input } from '../Shared';
import { Product, User, CartItem, ProductVariant } from '../../types';
import { fetchMartUsers } from '../../services/firebase';

export const PurchaseTab: React.FC = () => {
    const { currentUser, db, notify, showModal, showPinModal, serverAction, cachedMarts, setCachedMarts } = useGame();
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
    const [selectedMartName, setSelectedMartName] = useState<string | null>(null);
    
    // Explicitly load marts only if cache is empty
    useEffect(() => {
        const loadMarts = async () => {
            if (cachedMarts.length === 0) {
                const marts = await fetchMartUsers();
                setCachedMarts(marts);
            }
        };
        loadMarts();
    }, []);
    
    // Cart State
    const [cart, setCart] = useState<CartItem[]>(() => {
        const saved = localStorage.getItem(`cart_${currentUser?.name}`);
        return saved ? JSON.parse(saved) : [];
    });
    const [isCartOpen, setIsCartOpen] = useState(false);
    const [qty, setQty] = useState(1);
    
    // Variant Selection
    const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(null);

    useEffect(() => {
        localStorage.setItem(`cart_${currentUser?.name}`, JSON.stringify(cart));
    }, [cart, currentUser?.name]);

    useEffect(() => {
        if (selectedProduct) {
            // Default to first variant
            if (selectedProduct.variants && selectedProduct.variants.length > 0) {
                setSelectedVariant(selectedProduct.variants[0]);
            } else {
                // Legacy support
                setSelectedVariant({
                    name: '기본',
                    priceKRW: selectedProduct.price,
                    priceUSD: selectedProduct.priceUSD || 0
                });
            }
            setQty(1);
        }
    }, [selectedProduct]);

    const vatRate = db.settings.vat?.rate || 0;
    const vatTargets = db.settings.vat?.targetMarts || [];
    const exchangeRate = db.settings.exchangeRate.KRW_USD;

    const calculatePrice = (martName: string, product: Product, quantity: number = 1, variant?: ProductVariant) => {
        // If variant passed, calculate exact price
        if (variant) {
            let baseKRW = variant.priceKRW;
            let usdPart = variant.priceUSD;
            if (usdPart > 0) baseKRW += (usdPart * exchangeRate);
            if (product.isOnEvent && product.eventDiscountPercent) {
                baseKRW = baseKRW * (1 - product.eventDiscountPercent / 100);
            }
            baseKRW = Math.floor(baseKRW);
            const isTarget = vatTargets.includes('all') || vatTargets.includes(martName);
            const vat = isTarget ? Math.floor(baseKRW * (vatRate / 100)) : 0;
            return { base: baseKRW * quantity, vat: vat * quantity, total: (baseKRW + vat) * quantity };
        }

        // Display Mode Calculation (configured by seller)
        let displayBase = 0;
        if (product.variants && product.variants.length > 0) {
            const prices = product.variants.map(v => {
                let p = v.priceKRW + (v.priceUSD * exchangeRate);
                if (product.isOnEvent && product.eventDiscountPercent) p = p * (1 - product.eventDiscountPercent / 100);
                return p;
            });
            
            // Use seller's preference (default to 'min' if not set)
            if (product.priceDisplayMethod === 'avg') {
                displayBase = prices.reduce((a,b) => a+b, 0) / prices.length;
            } else {
                displayBase = Math.min(...prices);
            }
        } else {
            // Legacy
            let p = product.price + ((product.priceUSD||0) * exchangeRate);
            if (product.isOnEvent && product.eventDiscountPercent) p = p * (1 - product.eventDiscountPercent / 100);
            displayBase = p;
        }
        
        displayBase = Math.floor(displayBase);
        const isTarget = vatTargets.includes('all') || vatTargets.includes(martName);
        const vat = isTarget ? Math.floor(displayBase * (vatRate / 100)) : 0;
        return { base: displayBase, vat, total: displayBase + vat };
    };

    const handleAddToCart = () => {
        if (!selectedProduct || !selectedMartName || !selectedVariant) return;
        const newItem: CartItem = {
            ...selectedProduct,
            cartId: `${selectedProduct.id}_${Date.now()}`,
            quantity: qty,
            sellerName: selectedMartName,
            selectedVariant: selectedVariant,
            selected: true // Default selected
        };
        setCart([...cart, newItem]);
        setSelectedProduct(null);
        showModal("장바구니에 담았습니다.");
    };

    const handleBuyNow = async () => {
        if (!selectedProduct || !selectedMartName || !selectedVariant) return;
        if (db.settings.isFrozen) return showModal('현재 모든 금융 거래가 중지되었습니다.');

        const { total, base } = calculatePrice(selectedMartName, selectedProduct, qty, selectedVariant);
        
        if (currentUser!.balanceKRW < total) return showModal('잔액이 부족합니다.');

        const pin = await showPinModal(`총 ₩${total.toLocaleString()} 결제 승인`, currentUser!.pin!, (currentUser?.pinLength as 4 | 6) || 4, false);
        if (pin !== currentUser!.pin) return;

        try {
            await serverAction('purchase', {
                buyerId: currentUser!.name,
                items: [{
                    id: selectedProduct.id,
                    sellerName: selectedMartName,
                    name: `${selectedProduct.name} (${selectedVariant.name})`,
                    quantity: qty,
                    price: Math.floor(base / qty) // Unit price before vat
                }]
            });
            notify(selectedMartName, `'${selectedProduct.name} - ${selectedVariant.name}' ${qty}개가 판매되었습니다.`);
            showModal('구매가 완료되었습니다.');
            setSelectedProduct(null);
        } catch(e) {
            console.error(e);
            showModal('구매 실패: 서버 오류');
        }
    };

    const handleRemoveFromCart = (cartId: string) => {
        setCart(cart.filter(item => item.cartId !== cartId));
    };

    const handleToggleSelect = (cartId: string) => {
        setCart(cart.map(item => item.cartId === cartId ? { ...item, selected: !item.selected } : item));
    };

    const handleToggleAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        setCart(cart.map(item => ({ ...item, selected: e.target.checked })));
    };

    const handleCartCheckout = async () => {
        const selectedItems = cart.filter(item => item.selected);
        if (selectedItems.length === 0) return showModal("선택된 상품이 없습니다.");
        if (db.settings.isFrozen) return showModal('현재 모든 금융 거래가 중지되었습니다.');

        let grandTotal = 0;
        selectedItems.forEach(item => {
            const { total } = calculatePrice(item.sellerName, item, item.quantity, item.selectedVariant);
            grandTotal += total;
        });

        if (currentUser!.balanceKRW < grandTotal) return showModal('잔액이 부족합니다.');

        const pin = await showPinModal(`총 ₩${grandTotal.toLocaleString()} 결제 승인`, currentUser!.pin!, (currentUser?.pinLength as 4 | 6) || 4, false);
        if (pin !== currentUser!.pin) return;

        // Prepare items for server
        const purchaseItems = selectedItems.map(item => {
            const { base } = calculatePrice(item.sellerName, item, item.quantity, item.selectedVariant);
            return {
                id: item.id,
                sellerName: item.sellerName,
                name: `${item.name} (${item.selectedVariant?.name})`,
                quantity: item.quantity,
                price: Math.floor(base / item.quantity)
            };
        });

        try {
            await serverAction('purchase', {
                buyerId: currentUser!.name,
                items: purchaseItems
            });
            
            // Remove bought items
            setCart(cart.filter(item => !item.selected));
            showModal('결제가 완료되었습니다.');
        } catch(e) {
            console.error(e);
            showModal('결제 실패: 서버 오류');
        }
    };

    const selectedTotal = cart.filter(item => item.selected).reduce((sum, item) => sum + calculatePrice(item.sellerName, item, item.quantity, item.selectedVariant).total, 0);

    return (
        <div className="w-full space-y-6">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-2xl font-bold">물품 구매</h3>
                <Button onClick={() => setIsCartOpen(true)} className="relative py-2 px-4 text-xs">
                    🛒 장바구니
                    {cart.length > 0 && <span className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">{cart.length}</span>}
                </Button>
            </div>
            
            {cachedMarts.length === 0 ? <p className="text-gray-500 text-center py-10">등록된 상점이 없습니다.</p> : 
            cachedMarts.map(mart => (
                <Card key={mart.name} className="mb-4">
                    <h4 className="font-bold text-lg mb-3 border-b pb-2 flex justify-between">
                        {mart.name}
                        {mart.customJob && <span className="text-sm font-normal text-gray-500">({mart.customJob})</span>}
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {mart.products && Object.values(mart.products).map((prod: Product) => {
                             const { total } = calculatePrice(mart.name, prod);
                             return (
                                <div key={prod.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 hover:shadow-md transition-shadow cursor-pointer bg-white dark:bg-gray-800 relative overflow-hidden"
                                     onClick={() => { setSelectedProduct(prod); setSelectedMartName(mart.name); }}>
                                    {prod.isOnEvent && (
                                        <div className="absolute top-0 right-0 bg-red-600 text-white text-[10px] font-bold px-2 py-1 rounded-bl-lg z-10">
                                            {prod.eventDiscountPercent}% SALE
                                        </div>
                                    )}
                                    {prod.image && (
                                        <div className="w-full h-32 mb-2 rounded bg-gray-100 dark:bg-gray-700 overflow-hidden">
                                            <img src={prod.image} alt={prod.name} className="w-full h-full object-cover" />
                                        </div>
                                    )}
                                    <h5 className="font-bold truncate">{prod.name}</h5>
                                    <div className="mt-1">
                                        <p className="text-green-600 font-bold">
                                            {prod.isOnEvent && <span className="text-gray-400 line-through text-xs mr-1">₩{prod.price.toLocaleString()}</span>}
                                            ₩ {total.toLocaleString()} {prod.priceDisplayMethod === 'avg' && <span className="text-[10px] text-gray-400 font-normal">(평균)</span>}
                                        </p>
                                    </div>
                                </div>
                             );
                        })}
                    </div>
                </Card>
            ))}

            {/* Detailed Product Modal */}
            <Modal isOpen={!!selectedProduct} onClose={() => setSelectedProduct(null)} title="상품 상세">
                {selectedProduct && selectedMartName && (
                    <div className="space-y-4">
                        <div className="w-full h-64 bg-gray-100 dark:bg-gray-700 rounded-xl overflow-hidden flex items-center justify-center border border-gray-200 dark:border-gray-600">
                            {selectedProduct.image ? (
                                <img src={selectedProduct.image} alt={selectedProduct.name} className="h-full w-full object-contain" />
                            ) : (
                                <span className="text-gray-400">이미지 없음</span>
                            )}
                        </div>
                        <div className="px-1">
                            <h3 className="text-2xl font-bold">{selectedProduct.name}</h3>
                            <p className="text-gray-500 text-sm mb-2">{selectedMartName}</p>
                            <p className="text-sm p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-100 dark:border-gray-700 leading-relaxed">
                                {selectedProduct.description || "상세 설명이 없습니다."}
                            </p>
                        </div>
                        
                        {/* Variant Selection */}
                        <div className="space-y-2 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                            <p className="font-bold text-sm">항목 선택</p>
                            <div className="space-y-1">
                                {selectedProduct.variants && selectedProduct.variants.map((v, i) => (
                                    <div 
                                        key={i}
                                        onClick={() => setSelectedVariant(v)}
                                        className={`p-3 rounded border cursor-pointer flex justify-between items-center ${selectedVariant?.name === v.name ? 'border-green-500 bg-green-50 dark:bg-green-900/30' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-black'}`}
                                    >
                                        <span className="text-sm font-bold">{v.name}</span>
                                        <span className="text-xs">
                                            {v.priceKRW > 0 && `₩${v.priceKRW.toLocaleString()}`}
                                            {v.priceKRW > 0 && v.priceUSD > 0 && ' + '}
                                            {v.priceUSD > 0 && `$${v.priceUSD}`}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="flex justify-between items-center bg-gray-50 dark:bg-gray-800 p-4 rounded-xl">
                            <div className="flex items-center gap-2">
                                <label className="font-bold text-sm">수량</label>
                                <Input type="number" value={qty} onChange={e => setQty(Math.max(1, parseInt(e.target.value)||1))} className="w-16 text-center py-1" />
                            </div>
                            <div className="text-right">
                                <p className="text-xs text-gray-500">총 결제금액</p>
                                <p className="text-xl font-bold text-green-600">
                                    ₩ {calculatePrice(selectedMartName, selectedProduct, qty, selectedVariant || undefined).total.toLocaleString()}
                                </p>
                            </div>
                        </div>
                        <div className="flex gap-3 pt-2">
                            <Button onClick={handleAddToCart} className="flex-1 bg-gray-200 dark:bg-gray-700 text-black dark:text-white hover:bg-gray-300 dark:hover:bg-gray-600">장바구니 담기</Button>
                            <Button onClick={handleBuyNow} className="flex-1 bg-green-600 hover:bg-green-500 text-white shadow-lg">바로 구매</Button>
                        </div>
                    </div>
                )}
            </Modal>

            {/* Cart Modal */}
            <Modal isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} title="장바구니">
                <div className="space-y-4">
                    {cart.length > 0 && (
                        <div className="flex items-center gap-2 border-b pb-2 mb-2">
                            <input 
                                type="checkbox" 
                                onChange={handleToggleAll} 
                                checked={cart.length > 0 && cart.every(i => i.selected)}
                                className="accent-green-600 w-5 h-5"
                            />
                            <span className="text-sm font-bold">전체 선택</span>
                        </div>
                    )}

                    {cart.length === 0 ? <p className="text-center text-gray-500 py-10">장바구니가 비어있습니다.</p> : 
                    <div className="space-y-3 max-h-[50vh] overflow-y-auto">
                        {cart.map((item) => {
                            const { total } = calculatePrice(item.sellerName, item, item.quantity, item.selectedVariant);
                            return (
                                <div key={item.cartId} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded border">
                                    <input 
                                        type="checkbox" 
                                        checked={!!item.selected} 
                                        onChange={() => handleToggleSelect(item.cartId)}
                                        className="accent-green-600 w-5 h-5"
                                    />
                                    <div className="flex-1">
                                        <p className="font-bold">{item.name}</p>
                                        <p className="text-xs text-gray-500">{item.sellerName} | {item.quantity}개 | {item.selectedVariant?.name}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="font-bold">₩{total.toLocaleString()}</p>
                                        <button onClick={() => handleRemoveFromCart(item.cartId)} className="text-xs text-red-500 underline">삭제</button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>}
                    
                    {cart.length > 0 && (
                        <div className="border-t pt-4">
                            <div className="flex justify-between items-center text-xl font-bold mb-4">
                                <span>선택 상품 결제금액</span>
                                <span>₩{selectedTotal.toLocaleString()}</span>
                            </div>
                            <Button className="w-full py-3" onClick={handleCartCheckout} disabled={selectedTotal === 0}>
                                {selectedTotal > 0 ? `${cart.filter(i => i.selected).length}개 결제하기` : '선택된 상품 없음'}
                            </Button>
                        </div>
                    )}
                </div>
            </Modal>
        </div>
    );
};
