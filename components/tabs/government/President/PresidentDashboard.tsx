
import React, { useState, useMemo } from 'react';
import { useGame } from '../../../../context/GameContext';
import { Card, Button } from '../../../Shared';
import { TransactionHistoryTab } from '../../TransactionHistoryTab';
import { TransferTab } from '../../TransferTab';
import { User, PolicyRequest } from '../../../../types';

export const PresidentDashboard: React.FC = () => {
    const { db, createChat, sendMessage, currentUser, approvePolicyChange, rejectPolicyChange } = useGame();
    const [subTab, setSubTab] = useState('승인');

    const branchBudget = useMemo(() => {
        return (Object.values(db.users) as User[])
            .filter(u => u.govtBranch && u.govtBranch.includes('executive'))
            .reduce((sum, u) => sum + u.balanceKRW, 0);
    }, [db.users]);

    const pendingPolicies = useMemo(() => {
        return (Object.values(db.policyRequests || {}) as PolicyRequest[]).filter(p => p.status === 'pending').sort((a,b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime());
    }, [db.policyRequests]);

    const handleBudgetRequest = async () => {
        const amountStr = prompt("요청할 예산 금액을 입력하세요:");
        if (!amountStr) return;
        const amount = parseInt(amountStr);
        if (isNaN(amount)) return;

        const reason = prompt("예산 사용 목적/사유:");
        if (!reason) return;

        const chatId = await createChat(['한국은행'], 'private');
        await sendMessage(chatId, `[행정부(대통령) 예산 요청]\n금액: ₩${amount.toLocaleString()}\n사유: ${reason}`, {
            type: 'proposal',
            value: '예산 증액 요청',
            data: { type: 'budget', branch: ['executive'], amount }
        });
        alert("한국은행에 예산 요청 메시지를 보냈습니다.");
    };

    return (
        <div className="space-y-6">
            <Card>
                 <div className="flex justify-between items-start mb-4">
                    <div>
                        <h3 className="text-2xl font-bold text-purple-700">대통령 대시보드 (행정부)</h3>
                         <p className="text-sm text-gray-500">{currentUser?.name}</p>
                    </div>
                    <Button onClick={handleBudgetRequest} className="text-xs">예산 요청 (채팅)</Button>
                </div>
                
                <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200">
                    <p className="text-md font-bold mb-1 text-gray-700 dark:text-gray-300">행정부 예산 총액</p>
                    <p className="text-3xl font-bold">₩ {branchBudget.toLocaleString()}</p>
                </div>
            </Card>

            <div className="flex gap-2 overflow-x-auto pb-1 border-b border-gray-200 dark:border-gray-700">
                {['승인', '이체', '거래내역'].map(t => (
                    <button key={t} onClick={() => setSubTab(t)} className={`px-4 py-2 text-sm font-bold border-b-2 transition-colors whitespace-nowrap ${subTab === t ? 'border-purple-500 text-purple-600' : 'border-transparent text-gray-500'}`}>
                        {t}
                    </button>
                ))}
            </div>

            {subTab === '승인' && (
                <Card className="border-l-4 border-purple-500">
                    <h4 className="text-xl font-bold mb-4 text-purple-700 flex items-center gap-2">
                        <span>✍️ 국정 운영 승인</span>
                    </h4>
                    {pendingPolicies.length === 0 ? <p className="text-gray-500 py-4 text-center">승인 대기 중인 안건이 없습니다.</p> :
                    <div className="space-y-4">
                        {pendingPolicies.map(pol => (
                            <div key={pol.id} className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-purple-200 shadow-sm">
                                <div className="flex justify-between items-start mb-2">
                                    <span className="font-bold text-lg">{pol.description}</span>
                                    <span className="text-xs text-gray-400">{new Date(pol.requestedAt).toLocaleDateString()}</span>
                                </div>
                                <div className="flex gap-2">
                                    <Button onClick={() => approvePolicyChange(pol.id)} className="flex-1 bg-green-600">허가</Button>
                                    <Button onClick={() => rejectPolicyChange(pol.id)} className="flex-1 bg-red-600">거부</Button>
                                </div>
                            </div>
                        ))}
                    </div>}
                </Card>
            )}
            
            {subTab === '이체' && <TransferTab />}
            {subTab === '거래내역' && <TransactionHistoryTab />}
        </div>
    );
};
