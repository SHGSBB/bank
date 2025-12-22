
import React, { useState, useEffect } from 'react';
import { useGame } from '../../../context/GameContext';
import { Card, Button, Input } from '../../Shared';
import { User, ToastNotification } from '../../../types';
import { toSafeId } from '../../../services/firebase';

export const SupportFundTab: React.FC = () => {
    const { db, saveDb, showModal, showConfirm, loadAllUsers } = useGame();
    const [title, setTitle] = useState('');
    const [amount, setAmount] = useState('');
    const [restriction, setRestriction] = useState('');

    useEffect(() => {
        loadAllUsers();
    }, []);

    const handleDistribute = async () => {
        const valAmount = parseInt(amount);
        const citizens = (Object.values(db.users) as User[]).filter(u => u.type === 'citizen');

        if (!title) return showModal('지급명을 입력하세요.');
        if (isNaN(valAmount) || valAmount <= 0) return showModal('올바른 지급 금액을 입력하세요.');
        if (citizens.length === 0) return showModal('지급할 시민이 없습니다. (잠시 후 다시 시도하세요)');

        const totalAmount = valAmount * citizens.length;
        
        // Dynamic Bank Lookup
        const newDb = { ...db };
        const newBankEntry = (Object.entries(newDb.users) as [string, User][]).find(([k, u]) => 
            u.govtRole === '한국은행장' || 
            (u.type === 'admin' && u.subType === 'govt') || 
            u.name === '한국은행'
        );

        if (!newBankEntry) return showModal("한국은행(관리자) 계정을 찾을 수 없습니다.");
        const newBankUser = newBankEntry[1];

        if (newBankUser.balanceKRW < totalAmount) return showModal('은행 잔고가 부족합니다.');

        const confirmed = await showConfirm(`모든 시민(${citizens.length}명)에게 '${title}' ₩${valAmount.toLocaleString()}을 지급하시겠습니까? (총액: ₩${totalAmount.toLocaleString()})`);
        if (!confirmed) return;

        newBankUser.balanceKRW -= totalAmount;
        const description = restriction ? `${title} (${restriction})` : title;
        const date = new Date().toISOString();

        citizens.forEach(c => {
            // Find citizen safely using safe ID
            const cKey = toSafeId(c.email || c.id!);
            const user = newDb.users[cKey];
            
            if (user) {
                user.balanceKRW += valAmount;
                
                user.transactions = [...(user.transactions || []), {
                    id: Date.now() + Math.random(), type: 'income', amount: valAmount, currency: 'KRW', description, date
                }];
                newBankUser.transactions = [...(newBankUser.transactions || []), {
                    id: Date.now() + Math.random(), type: 'expense', amount: -valAmount, currency: 'KRW', description: `${c.name} ${title} 지급`, date
                }];

                const currentNotifs = user.notifications 
                    ? (Array.isArray(user.notifications) ? user.notifications : Object.values(user.notifications))
                    : [];

                const notif: ToastNotification = {
                    id: (Date.now() + Math.random()).toString(),
                    message: `'${title}' 지원금 ₩${valAmount.toLocaleString()}이 지급되었습니다.`,
                    read: false,
                    isPersistent: true,
                    date,
                    type: 'info',
                    timestamp: Date.now()
                };
                user.notifications = [notif, ...currentNotifs].slice(0, 20);
            }
        });

        await saveDb(newDb);
        showModal('지원금 지급이 완료되었습니다.');
        setTitle('');
        setAmount('');
        setRestriction('');
    };

    return (
        <Card>
            <h3 className="text-2xl font-bold mb-6">지원금 일괄 지급</h3>
            <div className="space-y-4 w-full">
                <div>
                    <label className="text-sm font-medium mb-1 block">지급명</label>
                    <Input 
                        placeholder="예: 재난지원금, 특별 장려금" 
                        value={title} 
                        onChange={e => setTitle(e.target.value)} 
                        className="w-full"
                    />
                </div>
                <div>
                    <label className="text-sm font-medium mb-1 block">지급 금액 (₩)</label>
                    <Input 
                        type="number" 
                        value={amount} 
                        onChange={e => setAmount(e.target.value)} 
                        className="w-full"
                    />
                </div>
                <div>
                    <label className="text-sm font-medium mb-1 block">사용처 제한 (비고)</label>
                    <Input 
                        placeholder="예: 전통시장 및 소상공인 업체에서만 사용 가능" 
                        value={restriction} 
                        onChange={e => setRestriction(e.target.value)} 
                        className="w-full"
                    />
                </div>
                <Button className="w-full mt-4" onClick={handleDistribute}>
                    모든 시민에게 지급
                </Button>
            </div>
        </Card>
    );
};
