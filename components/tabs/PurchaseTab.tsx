


import React, { useState, useMemo, useEffect } from 'react';
import { useGame } from '../../context/GameContext';
import { Card, Button, Modal, Input } from '../Shared';
import { Product, User, CartItem } from '../../types';

export const PurchaseTab: React.FC = () => {
    const { currentUser, db, saveDb, notify, showModal, showConfirm, showPinModal } = useGame();
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
    const [selectedMartName, setSelectedMartName] = useState<string | null>(null);
    
    // Cart State
    const [cart, setCart] = useState<CartItem[]>(() => {
        const saved = localStorage.getItem(`cart_${currentUser?.name}`);
        return saved ? JSON.parse(saved) : [];
    });
    const [isCartOpen, setIsCartOpen] = useState(false);
    const [qty, setQty] = useState(1);
    
    // Options Selection State
    const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});

    useEffect(() => {
        localStorage.setItem(`cart_${currentUser?.name}`, JSON.stringify(cart));
    }, [cart, currentUser?.name]);

    useEffect(() => {
        if (selectedProduct) {
            // Initialize default options
            const defaults: Record<string, string> = {};
            selectedProduct.options?.forEach(opt => {
                defaults[opt.name] = opt.values[0];
            });
            setSelectedOptions(defaults);
            setQty(1);
        }
    }, [selectedProduct]);

    const martUsers = (Object.values(db.users) as User[]).filter(u => u.type === 'mart' && u.id);
    const vatRate = db.settings.vat?.rate || 0;
    const vatTargets = db.settings.vat?.targetMarts || [];
    const exchangeRate = db.settings.exchangeRate.KRW_USD;

    const calculatePrice = (martName: string, product: Product, quantity: number = 1) => {
        let baseKRW = product.price || 0;
        if (product.priceUSD) {
            baseKRW = (product.priceUSD * exchangeRate) + (product.priceAdditionalKRW || 0);
        }
        if (product.isOnEvent && product.eventDiscountPercent) {
            baseKRW = baseKRW * (1 - product.eventDiscountPercent / 100);
        }
        baseKRW = Math.floor(baseKRW);

        const isTarget = vatTargets.includes('all') || vatTargets.includes(martName);
        const vat = isTarget ? Math.floor(baseKRW * (vatRate / 100)) : 0;
        
        return {
            base: baseKRW * quantity,
            vat: vat * quantity,
            total: (baseKRW + vat) * quantity,
            isUSD: !!product.priceUSD
        };
    };

    const handleAddToCart = () => {
        if (!selectedProduct || !selectedMartName) return;
        const newItem: CartItem = {
            ...selectedProduct,
            cartId: `${selectedProduct.id}_${Date.now()}`,
            quantity: qty,
            sellerName: selectedMartName,
            selectedOptions: selectedOptions
        };
        setCart([...cart, newItem]);
        setSelectedProduct(null);
        showModal("장바구니에 담았습니다.");
    };

    const handleBuyNow = async () => {
        if (!selectedProduct || !selectedMartName) return;
        if (db.settings.isFrozen) return showModal('현재 모든 금융 거래가 중지되었습니다.');

        const { total } = calculatePrice(selectedMartName, selectedProduct, qty);
        
        if (currentUser!.balanceKRW < total) return showModal('잔액이 부족합니다.');

        const pin = await showPinModal(`총 ₩${total.toLocaleString()} 결제 승인`, currentUser!.pin!, currentUser?.pinLength || 4, false);
        if (pin !== currentUser!.pin) return;

        const newDb = { ...db };
        const buyer = newDb.users[currentUser!.name];
        const bank = newDb.users['한국은행'];
        const mart = newDb.users[selectedMartName];
        
        const { base, vat } = calculatePrice(selectedMartName, selectedProduct, qty);

        buyer.balanceKRW -= total;
        mart.balanceKRW += base;
        
        if (vat > 0) {
            bank.balanceKRW += vat;
            bank.transactions = [...(bank.transactions || []), {
                id: Date.now() + Math.random(), type: 'tax', amount: vat, currency: 'KRW', description: `VAT 수입 (${mart.name})`, date: new Date().toISOString()
            }];
        }

        const date = new Date().toISOString();
        const desc = `구매: ${selectedProduct.name} (${qty}개)`;
        
        buyer.transactions = [...(buyer.transactions || []), {
            id: Date.now() + Math.random(), type: 'expense', amount: -total, currency: 'KRW', description: desc, date
        }];
        mart.transactions = [...(mart.transactions || []), {
            id: Date.now() + Math.random(), type: 'income', amount: base, currency: 'KRW', description: `판매: ${selectedProduct.name} (${qty}개)`, date
        }];

        await saveDb(newDb);
        notify(selectedMartName, `'${selectedProduct.name}' ${qty}개가 판매되었습니다.`);
        showModal('구매가 완료되었습니다.');
        setSelectedProduct(null);
    };

    const handleRemoveFromCart = (cartId: string) => {
        setCart(cart.filter(item => item.cartId !== cartId));
    };

    const handleCartCheckout = async () => {
        if (cart.length === 0) return;
        if (db.settings.isFrozen) return showModal('현재 모든 금융 거래가 중지되었습니다.');

        let grandTotal = 0;
        cart.forEach(item => {
            const { total } = calculatePrice(item.sellerName, item, item.quantity);
            grandTotal += total;
        });

        if (currentUser!.balanceKRW < grandTotal) return showModal('잔액이 부족합니다.');

        const pin = await showPinModal(`총 ₩${grandTotal.toLocaleString()} 결제 승인`, currentUser!.pin!, currentUser?.pinLength || 4, false);
        if (pin !== currentUser!.pin) return;

        const newDb = { ...db };
        const buyer = newDb.users[currentUser!.name];
        const bank = newDb.users['한국은행'];
        const date = new Date().toISOString();

        for (const item of cart) {
            const mart = newDb.users[item.sellerName];
            const { base, vat, total } = calculatePrice(item.sellerName, item, item.quantity);

            buyer.balanceKRW -= total;
            mart.balanceKRW += base;
            
            if (vat > 0) {
                bank.balanceKRW += vat;
                bank.transactions = [...(bank.transactions || []), {
                    id: Date.now() + Math.random(), type: 'tax', amount: vat, currency: 'KRW', description: `VAT 수입 (${mart.name})`, date
                }];
            }

            buyer.transactions = [...(buyer.transactions || []), {
                id: Date.now() + Math.random(), type: 'expense', amount: -total, currency: 'KRW', description: `구매: ${item.name} (${item.quantity}개)`, date
            }];
            mart.transactions = [...(mart.transactions || []), {
                id: Date.now() + Math.random(), type: 'income', amount: base, currency: 'KRW', description: `판매: ${item.name} (${item.quantity}개)`, date
            }];
            
            notify(item.sellerName, `'${item.name}' ${item.quantity}개가 판매되었습니다.`);
        }

        await saveDb(newDb);
        setCart([]);
        setIsCartOpen(false);
        showModal('결제가 완료되었습니다.');
    };

    return (
        <div className="w-full space-y-6">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-2xl font-bold">물품 구매</h3>
                <Button onClick={() => setIsCartOpen(true)} className="relative py-2 px-4">
                    🛒 장바구니
                    {cart.length > 0 && <span className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">{cart.length}</span>}
                </Button>
            </div>
            
            {martUsers.length === 0 ? <p className="text-gray-500 text-center py-10">등록된 상점이 없습니다.</p> : 
            martUsers.map(mart => (
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
                                            ₩ {total.toLocaleString()}
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
                        {/* Main Image */}
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

                        {/* Options Selector */}
                        {selectedProduct.options && selectedProduct.options.length > 0 && (
                            <div className="space-y-3 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                                {selectedProduct.options.map((opt) => (
                                    <div key={opt.name} className="flex justify-between items-center">
                                        <label className="font-bold text-sm">{opt.name}</label>
                                        <select 
                                            value={selectedOptions[opt.name] || ''} 
                                            onChange={(e) => setSelectedOptions({...selectedOptions, [opt.name]: e.target.value})}
                                            className="p-2 rounded bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-sm"
                                        >
                                            {opt.values.map(v => <option key={v} value={v}>{v}</option>)}
                                        </select>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Price & Quantity */}
                        <div className="flex justify-between items-center bg-gray-50 dark:bg-gray-800 p-4 rounded-xl">
                            <div className="flex items-center gap-2">
                                <label className="font-bold text-sm">수량</label>
                                <Input type="number" value={qty} onChange={e => setQty(Math.max(1, parseInt(e.target.value)||1))} className="w-16 text-center py-1" />
                            </div>
                            <div className="text-right">
                                <p className="text-xs text-gray-500">총 결제금액</p>
                                <p className="text-xl font-bold text-green-600">
                                    ₩ {calculatePrice(selectedMartName, selectedProduct, qty).total.toLocaleString()}
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
                    {cart.length === 0 ? <p className="text-center text-gray-500 py-10">장바구니가 비어있습니다.</p> : 
                    <div className="space-y-3 max-h-[50vh] overflow-y-auto">
                        {cart.map((item) => {
                            const { total } = calculatePrice(item.sellerName, item, item.quantity);
                            const opts = item.selectedOptions ? Object.values(item.selectedOptions).join(', ') : '';
                            return (
                                <div key={item.cartId} className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-800 rounded border">
                                    <div>
                                        <p className="font-bold">{item.name}</p>
                                        <p className="text-xs text-gray-500">{item.sellerName} | {item.quantity}개 {opts && `| ${opts}`}</p>
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
                                <span>총 결제금액</span>
                                <span>₩{cart.reduce((sum, item) => sum + calculatePrice(item.sellerName, item, item.quantity).total, 0).toLocaleString()}</span>
                            </div>
                            <Button className="w-full py-3" onClick={handleCartCheckout}>결제하기</Button>
                        </div>
                    )}
                </div>
            </Modal>
        </div>
    );
};
