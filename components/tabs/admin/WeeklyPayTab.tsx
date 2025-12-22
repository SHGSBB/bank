
import React, { useState, useEffect } from 'react';
import { useGame } from '../../../context/GameContext';
import { Card, Button, Input } from '../../Shared';
import { User } from '../../../types';

export const WeeklyPayTab: React.FC = () => {
    const { db, showModal, showConfirm, serverAction, loadAllUsers } = useGame();
    const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
    const [payAmount, setPayAmount] = useState('');

    // Ensure we load all users when entering this tab, as lightweight fetch might have missed details
    useEffect(() => {
        loadAllUsers();
    }, []);

    // Ensure we have a unique identifier. Email is preferred for DB keys.
    const citizens = (Object.values(db.users) as User[]).filter(u => u.type === 'citizen' && u.email);

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            // Use Email as ID
            setSelectedUsers(new Set(citizens.map(c => c.email!)));
        } else {
            setSelectedUsers(new Set());
        }
    };

    const handleCheck = (email: string) => {
        const newSet = new Set(selectedUsers);
        if (newSet.has(email)) newSet.delete(email);
        else newSet.add(email);
        setSelectedUsers(newSet);
    };

    const handlePay = async () => {
        const amount = parseInt(payAmount);
        if (isNaN(amount) || amount <= 0) return showModal('올바른 지급 금액을 입력하세요.');
        if (selectedUsers.size === 0) return showModal('지급할 시민을 선택하세요.');

        const totalPayment = amount * selectedUsers.size;
        
        // Robust Bank Lookup
        const bank = (Object.values(db.users) as User[]).find(u => 
            u.govtRole === '한국은행장' || 
            (u.type === 'admin' && u.subType === 'govt') || 
            u.name === '한국은행'
        );

        if ((bank?.balanceKRW || 0) < totalPayment) return showModal('은행 잔고가 부족합니다.');

        const confirmed = await showConfirm(`${selectedUsers.size}명의 시민에게 주급 ₩${amount.toLocaleString()}를 지급하시겠습니까? (총액: ₩${totalPayment.toLocaleString()})`);
        if (!confirmed) return;

        try {
            await serverAction('weekly_pay', {
                amount: amount,
                userIds: Array.from(selectedUsers) // Sending Emails/IDs
            });
            showModal(`${selectedUsers.size}명에게 주급 지급이 완료되었습니다.`);
            setPayAmount('');
            setSelectedUsers(new Set());
        } catch (e) {
            showModal('지급 실패: 서버 오류');
        }
    };

    return (
        <Card>
            <h3 className="text-2xl font-bold mb-4">주급 지급</h3>
            <div className="flex justify-between items-center mb-4">
                <p className="text-sm text-gray-500">시민 목록</p>
                <label className="text-sm flex items-center gap-2 cursor-pointer select-none">
                    <input type="checkbox" onChange={handleSelectAll} checked={citizens.length > 0 && selectedUsers.size === citizens.length} className="accent-green-600 w-4 h-4" /> 
                    전체 선택
                </label>
            </div>

            <div className="max-h-80 overflow-y-auto space-y-2 mb-6 pr-2">
                {citizens.length === 0 && <p className="text-center text-gray-500 py-4">등록된 시민이 없습니다.</p>}
                {citizens.map(c => (
                    <div key={c.email} className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                        <div className="flex items-center gap-3">
                            <input 
                                type="checkbox" 
                                checked={selectedUsers.has(c.email!)} 
                                onChange={() => handleCheck(c.email!)}
                                className="accent-green-600 w-5 h-5"
                            />
                            <div>
                                <p className="font-medium">{c.name}</p>
                                <p className="text-[10px] text-gray-400">{c.email}</p>
                            </div>
                        </div>
                        <span className="text-sm text-gray-500">현금: ₩ {c.balanceKRW.toLocaleString()}</span>
                    </div>
                ))}
            </div>

            <div className="flex gap-4">
                <Input type="number" placeholder="지급할 주급 (₩)" value={payAmount} onChange={e => setPayAmount(e.target.value)} className="flex-grow" />
                <Button onClick={handlePay} className="whitespace-nowrap">선택 지급</Button>
            </div>
        </Card>
    );
};
