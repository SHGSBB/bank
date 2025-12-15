
import React, { useState } from 'react';
import { useGame } from '../../../context/GameContext';
import { Card, Button, Input } from '../../Shared';
import { User } from '../../../types';

export const BondIssuanceTab: React.FC = () => {
    const { db, saveDb, showModal, notify } = useGame();
    const [search, setSearch] = useState('');
    const [selectedUser, setSelectedUser] = useState<string | null>(null);
    const [amount, setAmount] = useState('');
    const [maturity, setMaturity] = useState('4');
    const [interest, setInterest] = useState('3');

    const filteredUsers = (Object.values(db.users) as User[])
        .filter(u => u.type === 'citizen' && u.name.toLowerCase().includes(search.toLowerCase()))
        .slice(0, 5);

    const handleIssue = async () => {
        if (!selectedUser) return showModal('국채를 발행할 시민을 선택해주세요.');
        const valAmount = parseInt(amount);
        const valMaturity = parseInt(maturity);
        const valInterest = parseFloat(interest);

        if (isNaN(valAmount) || valAmount <= 0) return showModal('올바른 금액을 입력하세요.');
        if (isNaN(valMaturity) || valMaturity <= 0) return showModal('올바른 만기 기간을 입력하세요.');
        if (isNaN(valInterest) || valInterest <= 0) return showModal('올바른 이자율을 입력하세요.');

        const newDb = { ...db };
        const newBond = {
            id: Date.now(),
            citizenName: selectedUser,
            amount: valAmount,
            interestRate: valInterest,
            maturityWeeks: valMaturity,
            issueDate: new Date().toISOString(),
            status: 'pending' // User needs to accept in a real scenario, or just force for now? Assuming notification offer.
        };
        
        newDb.bonds = [...(newDb.bonds || []), newBond];
        await saveDb(newDb);

        notify(selectedUser, `한국은행에서 ₩${valAmount.toLocaleString()} 국채 발행을 제안했습니다. (만기 ${valMaturity}주, 이자율 ${valInterest}%)`, true);
        showModal(`${selectedUser}님에게 국채 발행 요청을 보냈습니다.`);
        
        setAmount('');
        setSelectedUser(null);
        setSearch('');
    };

    return (
        <Card>
            <h3 className="text-2xl font-bold mb-6">국채 발행</h3>
            <div className="space-y-4 w-full">
                <div className="relative">
                    <label className="text-sm font-medium mb-1 block">시민 검색</label>
                    <Input 
                        placeholder="이름 검색..." 
                        value={search} 
                        onChange={e => { setSearch(e.target.value); setSelectedUser(null); }}
                        className="w-full"
                    />
                    {search && !selectedUser && (
                        <div className="absolute z-10 w-full bg-white dark:bg-[#2D2D2D] border dark:border-gray-600 rounded-md mt-1 shadow-lg max-h-40 overflow-y-auto">
                            {filteredUsers.map(u => (
                                <div 
                                    key={u.name} 
                                    className="p-3 hover:bg-gray-100 dark:hover:bg-gray-600 cursor-pointer"
                                    onClick={() => { setSelectedUser(u.name); setSearch(u.name); }}
                                >
                                    {u.name}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {selectedUser && (
                    <div className="p-3 bg-green-50 dark:bg-green-900/30 rounded border border-green-200 dark:border-green-800">
                        <span className="font-bold text-green-700 dark:text-green-400">선택됨: {selectedUser}</span>
                    </div>
                )}

                <div>
                    <label className="text-sm font-medium mb-1 block">발행 금액 (₩)</label>
                    <Input type="number" value={amount} onChange={e => setAmount(e.target.value)} className="w-full" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="text-sm font-medium mb-1 block">만기 (주)</label>
                        <Input type="number" value={maturity} onChange={e => setMaturity(e.target.value)} className="w-full" />
                    </div>
                    <div>
                        <label className="text-sm font-medium mb-1 block">이자율 (%)</label>
                        <Input type="number" value={interest} onChange={e => setInterest(e.target.value)} className="w-full" />
                    </div>
                </div>

                <Button className="w-full mt-4" onClick={handleIssue}>발행 요청 보내기</Button>
            </div>
        </Card>
    );
};
