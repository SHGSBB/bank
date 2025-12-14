
import React, { useState, useMemo } from 'react';
import { useGame } from '../../../../context/GameContext';
import { Card, Button, Input } from '../../../Shared';
import { TransactionHistoryTab } from '../../TransactionHistoryTab';
import { TransferTab } from '../../TransferTab';
import { User, PendingTax } from '../../../../types';

export const ProsecutorDashboard: React.FC = () => {
    const { db, createChat, sendMessage, currentUser } = useGame();
    const [subTab, setSubTab] = useState('수사');
    const [userSearch, setUserSearch] = useState('');

    const branchBudget = useMemo(() => {
        return (Object.values(db.users) as User[])
            .filter(u => u.govtBranch && u.govtBranch.includes('executive'))
            .reduce((sum, u) => sum + u.balanceKRW, 0);
    }, [db.users]);

    const citizens = (Object.values(db.users) as User[]).filter(u => u.type === 'citizen');
    const filteredCitizens = citizens.filter(u => u.name.includes(userSearch));

    return (
        <div className="space-y-6">
            <Card>
                 <div className="flex justify-between items-start mb-4">
                    <div>
                        <h3 className="text-2xl font-bold text-gray-700 dark:text-gray-300">검사 대시보드 (행정부)</h3>
                         <p className="text-sm text-gray-500">{currentUser?.name}</p>
                    </div>
                </div>
                
                <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-300">
                    <p className="text-md font-bold mb-1 text-gray-700 dark:text-gray-300">행정부 예산 총액 (조회)</p>
                    <p className="text-3xl font-bold">₩ {branchBudget.toLocaleString()}</p>
                </div>
            </Card>

            <div className="flex gap-2 overflow-x-auto pb-1 border-b border-gray-200 dark:border-gray-700">
                {['수사', '이체', '거래내역'].map(t => (
                    <button key={t} onClick={() => setSubTab(t)} className={`px-4 py-2 text-sm font-bold border-b-2 transition-colors whitespace-nowrap ${subTab === t ? 'border-gray-500 text-gray-600' : 'border-transparent text-gray-500'}`}>
                        {t}
                    </button>
                ))}
            </div>

            {subTab === '수사' && (
                <Card className="border-l-4 border-gray-500">
                    <h4 className="text-xl font-bold mb-4 text-gray-700">🔍 시민 정보 조회 (벌금/납세 현황)</h4>
                    <div className="space-y-4">
                        <Input placeholder="시민 검색..." value={userSearch} onChange={e => setUserSearch(e.target.value)} />
                        <div className="max-h-96 overflow-y-auto space-y-2">
                            {filteredCitizens.map(c => {
                                const rawTaxes = (c.pendingTaxes ? (Array.isArray(c.pendingTaxes) ? c.pendingTaxes : Object.values(c.pendingTaxes)) : []) as PendingTax[];
                                const fines = rawTaxes.filter(t => t.type === 'fine');
                                const taxes = rawTaxes.filter(t => t.type !== 'fine');
                                
                                return (
                                    <div key={c.name} className="p-3 border rounded-xl bg-white dark:bg-gray-800 text-sm shadow-sm">
                                        <p className="font-bold text-lg mb-1">{c.name}</p>
                                        
                                        {fines.length > 0 && (
                                            <div className="mb-2">
                                                <p className="text-xs font-bold text-red-600">벌금/과태료 내역</p>
                                                {fines.map(f => (
                                                    <p key={f.id} className="text-xs ml-2">- {f.breakdown} (₩{f.amount.toLocaleString()}) {f.status === 'paid' ? '✅' : '❌'}</p>
                                                ))}
                                            </div>
                                        )}
                                        
                                        {taxes.length > 0 && (
                                            <div>
                                                <p className="text-xs font-bold text-blue-600">세금 내역</p>
                                                {taxes.map(t => (
                                                    <p key={t.id} className="text-xs ml-2">- {t.type} (₩{t.amount.toLocaleString()}) {t.status === 'paid' ? '✅' : '❌'}</p>
                                                ))}
                                            </div>
                                        )}
                                        
                                        {fines.length === 0 && taxes.length === 0 && <p className="text-xs text-gray-400">특이사항 없음</p>}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </Card>
            )}
            
            {subTab === '이체' && <TransferTab />}
            {subTab === '거래내역' && <TransactionHistoryTab />}
        </div>
    );
};
