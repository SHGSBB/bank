
import React, { useMemo, useState } from 'react';
import { useGame } from '../../context/GameContext';
import { Card, Button, Modal } from '../Shared';
import { PendingTax } from '../../types';

export const BillTab: React.FC = () => {
    const { currentUser, payTax, showModal, dismissTax } = useGame();
    const [filter, setFilter] = useState<'all' | 'unpaid' | 'paid'>('all');
    const [selectedTax, setSelectedTax] = useState<PendingTax | null>(null);

    const taxes = useMemo(() => {
        return (currentUser?.pendingTaxes || []).sort((a,b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime());
    }, [currentUser?.pendingTaxes]);

    const filteredTaxes = taxes.filter(t => {
        if (filter === 'unpaid') return t.status === 'pending';
        if (filter === 'paid') return t.status === 'paid';
        return true;
    });

    const isOverdue = (date: string) => new Date(date) < new Date();

    const getTaxName = (type: string) => {
        const map: Record<string, string> = {
            'real_estate': '종합부동산세',
            'income': '소득세',
            'asset': '재산세',
            'fine': '과태료',
            'acquisition': '취득세'
        };
        return map[type] || type;
    };

    return (
        <div className="space-y-6">
            <h3 className="text-2xl font-bold">고지서함</h3>
            
            <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700 pb-1">
                {[{id: 'all', label: '전체'}, {id: 'unpaid', label: '미납'}, {id: 'paid', label: '납부완료'}].map(tab => (
                    <button 
                        key={tab.id} 
                        onClick={() => setFilter(tab.id as any)}
                        className={`px-4 py-2 text-sm font-bold border-b-2 transition-colors ${filter === tab.id ? 'border-black dark:border-white text-black dark:text-white' : 'border-transparent text-gray-400'}`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {filteredTaxes.length === 0 ? (
                <div className="text-center py-10 text-gray-500">고지서가 없습니다.</div>
            ) : (
                <div className="space-y-4">
                    {filteredTaxes.map(tax => {
                        const overdue = tax.status === 'pending' && isOverdue(tax.dueDate);
                        return (
                            <Card key={tax.id} className={`flex flex-col gap-3 relative overflow-hidden ${tax.status === 'paid' ? 'opacity-70' : ''}`}>
                                {overdue && <div className="absolute top-0 left-0 w-1.5 h-full bg-red-500"></div>}
                                
                                <div className="flex justify-between items-start">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-lg">{getTaxName(tax.type)}</span>
                                            {overdue && <span className="bg-red-100 text-red-600 text-[10px] px-2 py-0.5 rounded-full font-bold">연체</span>}
                                            {tax.status === 'paid' && <span className="bg-gray-200 text-gray-600 text-[10px] px-2 py-0.5 rounded-full font-bold">납부완료</span>}
                                        </div>
                                        <p className="text-xs text-gray-500">납부기한: {new Date(tax.dueDate).toLocaleString()}</p>
                                    </div>
                                    <p className="font-black text-xl">₩{tax.amount.toLocaleString()}</p>
                                </div>

                                <div className="flex gap-2 mt-2">
                                    <Button variant="secondary" className="flex-1 text-xs py-2" onClick={() => setSelectedTax(tax)}>상세 내역</Button>
                                    {tax.status === 'pending' ? (
                                        <Button className={`flex-1 text-xs py-2 ${overdue ? 'bg-red-600' : 'bg-blue-600'}`} onClick={() => payTax(tax)}>
                                            {overdue ? '연체료 납부' : '납부하기'}
                                        </Button>
                                    ) : (
                                        <button onClick={() => dismissTax(tax.id)} className="text-xs text-gray-400 underline px-4">내역 삭제</button>
                                    )}
                                </div>
                            </Card>
                        );
                    })}
                </div>
            )}

            <Modal isOpen={!!selectedTax} onClose={() => setSelectedTax(null)} title="고지서 상세">
                {selectedTax && (
                    <div className="space-y-4">
                        <div className="text-center p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
                            <p className="text-sm text-gray-500">{getTaxName(selectedTax.type)}</p>
                            <p className="text-3xl font-black mt-2">₩{selectedTax.amount.toLocaleString()}</p>
                        </div>
                        <div className="p-4 border rounded-xl">
                            <h5 className="font-bold mb-2">산출 내역</h5>
                            <p className="text-sm whitespace-pre-wrap leading-relaxed text-gray-600 dark:text-gray-300">
                                {selectedTax.breakdown}
                            </p>
                        </div>
                        {selectedTax.status === 'pending' && (
                            <Button className="w-full py-3" onClick={() => { payTax(selectedTax); setSelectedTax(null); }}>지금 납부하기</Button>
                        )}
                    </div>
                )}
            </Modal>
        </div>
    );
};
