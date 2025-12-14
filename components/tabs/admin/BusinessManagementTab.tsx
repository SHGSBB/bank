

import React, { useState } from 'react';
import { useGame } from '../../../context/GameContext';
import { Card, Button, Input } from '../../Shared';
import { User } from '../../../types';

export const BusinessManagementTab: React.FC = () => {
    const { db, saveDb, showModal, showConfirm, notify } = useGame();
    const businesses = (Object.values(db.users) as User[]).filter(u => u.type === 'mart');
    const pendingBusinesses = businesses.filter(u => u.approvalStatus === 'pending');
    const activeBusinesses = businesses.filter(u => u.approvalStatus !== 'pending');

    const handleApprove = async (user: User, approve: boolean) => {
        const newDb = { ...db };
        const target = newDb.users[user.name];
        target.approvalStatus = approve ? 'approved' : 'rejected';
        
        await saveDb(newDb);
        notify(user.name, `사업자 계정 승인이 ${approve ? '완료' : '거절'}되었습니다.`, true);
        showModal(`처리되었습니다.`);
    };

    return (
        <Card>
            <h3 className="text-2xl font-bold mb-6">사업체 관리</h3>
            
            {pendingBusinesses.length > 0 && (
                <div className="mb-8">
                    <h4 className="text-lg font-bold text-orange-500 mb-4">승인 대기 중인 사업자</h4>
                    <div className="space-y-2">
                        {pendingBusinesses.map(b => (
                            <div key={b.name} className="flex justify-between items-center p-3 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 rounded">
                                <div>
                                    <p className="font-bold flex items-center gap-2">
                                        {b.name} (ID: {b.id})
                                        {b.isCorporation && <span className="text-[10px] bg-blue-600 text-white px-1.5 py-0.5 rounded">주식회사</span>}
                                    </p>
                                    <p className="text-xs">공동대표: {b.jointOwners?.join(', ') || '없음'}</p>
                                </div>
                                <div className="flex gap-2">
                                    <Button onClick={() => handleApprove(b, true)} className="text-xs py-1">승인</Button>
                                    <Button variant="danger" onClick={() => handleApprove(b, false)} className="text-xs py-1">거절</Button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <h4 className="text-lg font-bold mb-4">등록된 사업체 목록</h4>
            <ul className="space-y-2">
                {activeBusinesses.map(b => (
                    <li key={b.name} className="p-3 bg-gray-50 dark:bg-gray-800 rounded flex justify-between items-center">
                        <span className="flex items-center gap-2">
                            {b.name}
                            {b.isCorporation && <span className="text-[10px] bg-blue-100 text-blue-800 border border-blue-200 px-1 rounded">주식회사</span>}
                        </span>
                        <span className="text-sm">자본금: ₩{b.balanceKRW.toLocaleString()}</span>
                    </li>
                ))}
            </ul>
        </Card>
    );
};
