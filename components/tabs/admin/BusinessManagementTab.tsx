
import React, { useState } from 'react';
import { useGame } from '../../../context/GameContext';
import { Card, Button, Input, Modal } from '../../Shared';
import { User, Ad } from '../../../types';

export const BusinessManagementTab: React.FC = () => {
    const { db, saveDb, showModal, showConfirm, notify } = useGame();
    const [viewMode, setViewMode] = useState<'businesses' | 'ads'>('businesses');
    const [selectedAd, setSelectedAd] = useState<Ad | null>(null);

    const businesses = (Object.values(db.users) as User[]).filter(u => u.type === 'mart');
    const pendingBusinesses = businesses.filter(u => u.approvalStatus === 'pending');
    const activeBusinesses = businesses.filter(u => u.approvalStatus !== 'pending');
    
    // Normalize db.ads to array for filtering
    const adsList = db.ads ? (Array.isArray(db.ads) ? db.ads : Object.values(db.ads)) : [];
    
    const pendingAds = adsList.filter(a => a.status === 'pending');
    const activeAds = adsList.filter(a => a.status === 'active');

    const handleApprove = async (user: User, approve: boolean) => {
        const newDb = { ...db };
        const target = newDb.users[user.name];
        target.approvalStatus = approve ? 'approved' : 'rejected';
        
        await saveDb(newDb);
        notify(user.name, `사업자 계정 승인이 ${approve ? '완료' : '거절'}되었습니다.`, true);
        showModal(`처리되었습니다.`);
    };

    const handleAdAction = async (ad: Ad, action: 'approve' | 'reject') => {
        const newDb = { ...db };
        
        // Ensure we are working with an array for finding/updating index
        // If db.ads comes as an object, convert it to an array for mutation and save back as array
        let currentAds = newDb.ads ? (Array.isArray(newDb.ads) ? newDb.ads : Object.values(newDb.ads)) : [];
        
        const adIndex = currentAds.findIndex(a => a.id === ad.id);
        if (adIndex === -1) return;

        if (action === 'approve') {
            const fee = ad.fee;
            const business = (Object.values(newDb.users) as User[]).find(u => u.type === 'mart' && (u.customJob === ad.businessName || u.name === ad.businessName));
            if (!business) return showModal("사업자를 찾을 수 없습니다.");
            if (business.balanceKRW < fee) return showModal("사업자 잔액 부족으로 승인 불가");

            // Deduct Fee
            const bankKey = Object.keys(newDb.users).find(k => (newDb.users[k] as User).govtRole === '한국은행장');
            const bank = bankKey ? newDb.users[bankKey] : undefined;
            
            business.balanceKRW -= fee;
            if (bank) bank.balanceKRW += fee;

            currentAds[adIndex].status = 'active';
            currentAds[adIndex].startDate = new Date().toISOString();
            
            notify(business.name, `광고가 승인되었습니다. 광고비 ₩${fee.toLocaleString()}가 차감되었습니다.`, true);
        } else {
            currentAds[adIndex].status = 'rejected';
            notify(ad.businessName, `광고 요청이 거절되었습니다.`);
        }
        
        // Save back the modified array
        newDb.ads = currentAds;
        
        await saveDb(newDb);
        setSelectedAd(null);
    };

    return (
        <Card>
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-bold">사업체 및 광고 관리</h3>
                <div className="flex gap-2">
                    <Button onClick={() => setViewMode('businesses')} variant={viewMode==='businesses'?'primary':'secondary'}>사업자</Button>
                    <Button onClick={() => setViewMode('ads')} variant={viewMode==='ads'?'primary':'secondary'}>광고 요청</Button>
                </div>
            </div>
            
            {viewMode === 'businesses' && (
                <>
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
                </>
            )}

            {viewMode === 'ads' && (
                <div className="space-y-6">
                    <div>
                        <h4 className="font-bold text-lg mb-2 text-blue-600">광고 승인 대기 ({pendingAds.length})</h4>
                        <div className="space-y-2">
                            {pendingAds.map(ad => (
                                <div key={ad.id} className="flex justify-between items-center p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 rounded">
                                    <div className="flex gap-3 items-center">
                                        <img src={ad.imageUrl} className="w-16 h-10 object-cover rounded" />
                                        <div>
                                            <p className="font-bold">{ad.businessName}</p>
                                            <p className="text-xs">{ad.content} | 제안가: ₩{ad.fee.toLocaleString()}</p>
                                        </div>
                                    </div>
                                    <Button onClick={() => setSelectedAd(ad)} className="text-xs">검토</Button>
                                </div>
                            ))}
                            {pendingAds.length === 0 && <p className="text-gray-500 text-sm">대기 중인 요청이 없습니다.</p>}
                        </div>
                    </div>

                    <div>
                        <h4 className="font-bold text-lg mb-2">진행 중인 광고 ({activeAds.length})</h4>
                        <div className="grid grid-cols-2 gap-2">
                            {activeAds.map(ad => (
                                <div key={ad.id} className="relative rounded overflow-hidden border">
                                    <img src={ad.imageUrl} className="w-full h-24 object-cover" />
                                    <div className="absolute bottom-0 bg-black/50 text-white w-full text-xs p-1">
                                        {ad.businessName}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            <Modal isOpen={!!selectedAd} onClose={() => setSelectedAd(null)} title="광고 승인 검토">
                {selectedAd && (
                    <div className="space-y-4 text-center">
                        <img src={selectedAd.imageUrl} className="w-full rounded-lg shadow-sm border" />
                        <div>
                            <p className="text-xl font-bold">{selectedAd.businessName}</p>
                            <p className="text-gray-500">{selectedAd.content}</p>
                        </div>
                        <div className="bg-gray-100 p-3 rounded">
                            <p className="text-sm font-bold">광고비 제안</p>
                            <p className="text-2xl font-black text-blue-600">₩{selectedAd.fee.toLocaleString()}</p>
                            <p className="text-xs text-gray-500">기간: {selectedAd.durationDays}일</p>
                        </div>
                        <div className="flex gap-2">
                            <Button onClick={() => handleAdAction(selectedAd, 'approve')} className="flex-1 bg-green-600">승인 및 과금</Button>
                            <Button onClick={() => handleAdAction(selectedAd, 'reject')} className="flex-1 bg-red-600">거절</Button>
                        </div>
                    </div>
                )}
            </Modal>
        </Card>
    );
};
