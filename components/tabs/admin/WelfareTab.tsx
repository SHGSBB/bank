import React, { useState } from 'react';
import { useGame } from '../../../context/GameContext';
import { Card, Button, Input } from '../../Shared';
import { User } from '../../../types';

export const WelfareTab: React.FC = () => {
    const { db, saveDb, showModal, showConfirm, notify, serverAction } = useGame();
    const [tiers, setTiers] = useState(db.settings.welfareTiers || []);
    const citizens = (Object.values(db.users) as User[]).filter(u => u.type === 'citizen');

    const calculateTotalAsset = (user: User) => {
        const krw = user.balanceKRW;
        const usdVal = user.balanceUSD * (db.settings.exchangeRate?.KRW_USD || 1350);
        const propVal = (db.realEstate.grid || []).filter(p => p.owner === user.name).reduce((sum, p) => sum + p.price, 0);
        return krw + usdVal + propVal;
    };

    const handlePayWelfare = async (user: User, amount: number) => {
        const bank = (Object.values(db.users) as User[]).find(u => u.name === '한국은행');
        if ((bank?.balanceKRW || 0) < amount) return showModal('은행 잔고가 부족합니다.');

        const confirmed = await showConfirm(`${user.name}님에게 복지금 ₩${amount.toLocaleString()}을 지급하시겠습니까?`);
        if (!confirmed) return;

        try {
            await serverAction('distribute_welfare', {
                targetUser: user.email, // Use Email/ID for safety
                amount
            });
            notify(user.name, `복지 지원금 ₩${amount.toLocaleString()}를 받았습니다.`, true);
            showModal('지급 완료');
        } catch(e) {
            showModal("지급 실패: 서버 오류");
        }
    };

    const handleSaveSettings = async () => {
        const newDb = { ...db };
        newDb.settings.welfareTiers = tiers.filter(t => t.threshold > 0 && t.amount > 0).sort((a,b) => a.threshold - b.threshold);
        await saveDb(newDb);
        showModal('복지 기준이 저장되었습니다.');
    };

    const updateTier = (index: number, field: 'threshold' | 'amount', value: string) => {
        const val = parseInt(value);
        const newTiers = [...tiers];
        if (!newTiers[index]) newTiers[index] = { threshold: 0, amount: 0 };
        newTiers[index] = { ...newTiers[index], [field]: isNaN(val) ? 0 : val };
        setTiers(newTiers);
    };

    const addTier = () => setTiers([...tiers, { threshold: 0, amount: 0 }]);
    const removeTier = (index: number) => setTiers(tiers.filter((_, i) => i !== index));

    const sortedTiers = (db.settings.welfareTiers || []).sort((a, b) => a.threshold - b.threshold);
    const tierBuckets = sortedTiers.map(t => ({ ...t, citizens: citizens.filter(c => calculateTotalAsset(c) <= t.threshold) }));

    return (
        <div className="w-full">
            <h3 className="text-2xl font-bold mb-6">복지 지원금 지급</h3>
            <div className="space-y-6 mb-8 w-full">
                {tierBuckets.map((bucket, idx) => (
                    <Card key={idx}>
                        <h4 className="font-bold mb-3 border-b pb-2">자산 ₩{bucket.threshold.toLocaleString()} 이하 (지급액: ₩{bucket.amount.toLocaleString()})</h4>
                        {bucket.citizens.length === 0 ? <p className="text-sm text-gray-500">해당 시민이 없습니다.</p> : <ul className="space-y-2 max-h-40 overflow-y-auto pr-2">{bucket.citizens.map(c => (<li key={c.name} className="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-800 rounded"><span className="text-sm">{c.name} <span className="text-gray-500 text-xs ml-1">(자산: ₩{calculateTotalAsset(c).toLocaleString()})</span></span><Button className="text-xs py-1 px-3" onClick={() => handlePayWelfare(c, bucket.amount)}>지급</Button></li>))}</ul>}
                    </Card>
                ))}
            </div>
            <Card className="border-t-4 border-gray-500 w-full"><h4 className="font-bold text-lg mb-4">복지 기준 설정</h4><div className="space-y-3 mb-4">{tiers.map((tier, i) => (<div key={i} className="flex gap-2 items-center"><span className="text-sm font-bold w-6">{i+1}.</span><div className="flex-1 flex items-center gap-2"><span className="text-sm whitespace-nowrap">자산</span><Input type="number" value={tier.threshold} onChange={e => updateTier(i, 'threshold', e.target.value)} className="py-1 px-2 text-sm w-full" /><span className="text-sm whitespace-nowrap">이하, 지급</span><Input type="number" value={tier.amount} onChange={e => updateTier(i, 'amount', e.target.value)} className="py-1 px-2 text-sm w-full" /><Button variant="danger" className="py-1 px-2 text-xs" onClick={() => removeTier(i)}>X</Button></div></div>))}</div><div className="flex gap-2"><Button variant="secondary" className="w-full text-sm" onClick={addTier}>+ 구간 추가</Button><Button className="w-full text-sm" onClick={handleSaveSettings}>설정 저장</Button></div></Card>
        </div>
    );
};