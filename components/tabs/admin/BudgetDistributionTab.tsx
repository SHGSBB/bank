
import React, { useState } from 'react';
import { useGame } from '../../../context/GameContext';
import { Card, Button, Input } from '../../Shared';
import { User } from '../../../types';

export const BudgetDistributionTab: React.FC = () => {
    const { db, saveDb, showModal, showConfirm, notify } = useGame();
    const [targetBranch, setTargetBranch] = useState<'executive' | 'legislative' | 'judicial'>('executive');
    const [amount, setAmount] = useState('');

    const handleDistribute = async () => {
        const valAmount = parseInt(amount);
        if (isNaN(valAmount) || valAmount <= 0) return showModal("올바른 금액을 입력하세요.");

        const bank = db.users['한국은행'];
        if (bank.balanceKRW < valAmount) return showModal("은행 잔고가 부족합니다.");

        // Distribute to all members of the branch? Or just hold in a 'Department Account'?
        // The spec implies departments have budgets. In this simplified model, we will distribute to
        // the 'Head' of the department if exists, OR split among all members.
        // Let's implement split among all members for now as 'Department Wallet' isn't a separate entity type yet.
        
        const branchMembers = (Object.values(db.users) as User[]).filter(u => u.govtBranch?.includes(targetBranch));
        
        if (branchMembers.length === 0) return showModal("해당 부처에 소속된 공무원이 없습니다.");

        if (!await showConfirm(`${targetBranch === 'executive' ? '행정부' : (targetBranch === 'legislative' ? '입법부' : '사법부')} 소속 ${branchMembers.length}명에게 총 ₩${valAmount.toLocaleString()} 예산을 배분하시겠습니까?`)) return;

        const perPerson = Math.floor(valAmount / branchMembers.length);
        const newDb = { ...db };
        const newBank = newDb.users['한국은행'];
        
        newBank.balanceKRW -= (perPerson * branchMembers.length);
        const date = new Date().toISOString();

        branchMembers.forEach(m => {
            const user = newDb.users[m.name];
            user.balanceKRW += perPerson;
            user.transactions = [...(user.transactions || []), {
                id: Date.now() + Math.random(), type: 'income', amount: perPerson, currency: 'KRW', description: '부처 예산 배분', date
            }];
            notify(m.name, `[예산] ₩${perPerson.toLocaleString()}이 지급되었습니다.`, true);
        });

        newBank.transactions = [...(newBank.transactions || []), {
            id: Date.now(), type: 'expense', amount: -(perPerson * branchMembers.length), currency: 'KRW', description: `${targetBranch} 예산 지급`, date
        }];

        await saveDb(newDb);
        showModal("예산 지급이 완료되었습니다.");
        setAmount('');
    };

    return (
        <Card>
            <h3 className="text-2xl font-bold mb-6">정부 부처 예산 지급</h3>
            <div className="space-y-4">
                <div>
                    <label className="text-sm font-bold block mb-2">대상 부처</label>
                    <select 
                        value={targetBranch} 
                        onChange={e => setTargetBranch(e.target.value as any)} 
                        className="w-full p-4 rounded-2xl bg-gray-100 dark:bg-gray-800 border-none outline-none"
                    >
                        <option value="executive">행정부 (Executive)</option>
                        <option value="legislative">입법부 (Legislative)</option>
                        <option value="judicial">사법부 (Judicial)</option>
                    </select>
                </div>
                <div>
                    <label className="text-sm font-bold block mb-2">지급 총액 (₩)</label>
                    <Input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" />
                    <p className="text-xs text-gray-500 mt-1">* 소속 공무원들에게 1/N로 분배되어 지급됩니다.</p>
                </div>
                <Button onClick={handleDistribute} className="w-full py-4 text-lg bg-blue-600 hover:bg-blue-500">예산 집행</Button>
            </div>
        </Card>
    );
};
