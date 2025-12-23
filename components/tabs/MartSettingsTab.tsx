
import React, { useState, useMemo } from 'react';
import { useGame } from '../../context/GameContext';
import { Card, Button, Input } from '../Shared';
import { generateId } from '../../services/firebase';
import { Application } from '../../types';
import { ref, update } from 'firebase/database';
import { database } from '../../services/firebase';

export const MartSettingsTab: React.FC = () => {
    const { currentUser, db, updateUser, saveDb, showModal, notify } = useGame();
    const [storeName, setStoreName] = useState(currentUser?.customJob || '');
    const [description, setDescription] = useState(currentUser?.statusMessage || '');

    const salesData = useMemo(() => {
        const incomeTx = (currentUser?.transactions || []).filter(t => t.type === 'income' && t.description.includes('판매'));
        return incomeTx.slice(0, 20).reverse();
    }, [currentUser]);

    const handleSaveInfo = () => {
        updateUser(currentUser!.name, { 
            customJob: storeName,
            statusMessage: description
        });
        showModal('가게 정보가 수정되었습니다.');
    };

    const handleRequestIPO = async () => {
        if (!storeName.trim()) return showModal("상호명(Store Name)을 먼저 설정해주세요.");
        
        // Check if already applied
        const pending = (Object.values(db.pendingApplications || {}) as Application[]).find(a => a.type === 'ipo' && a.applicantName === currentUser!.name);
        if (pending) return showModal("이미 상장 심사 대기 중입니다.");
        if (db.stocks?.[currentUser!.id!]) return showModal("이미 상장된 기업입니다.");

        const appId = generateId();
        const app: Application = {
            id: appId,
            type: 'ipo',
            applicantName: currentUser!.name,
            amount: 0, // Placeholder
            requestedDate: new Date().toISOString(),
            status: 'pending'
        };
        
        // Directly update DB node for immediate visibility
        await update(ref(database, `pendingApplications/${appId}`), app);

        notify('한국은행', `${currentUser!.name} (${storeName}) 님이 기업 상장 심사를 요청했습니다.`, true);
        showModal("한국은행에 상장 심사 요청서를 제출했습니다.");
    };

    return (
        <div className="w-full space-y-6">
            <h3 className="text-2xl font-bold mb-4">가게 대시보드</h3>
            
            <Card>
                <h4 className="text-lg font-bold mb-4">가게 정보 수정</h4>
                <div className="space-y-4">
                    <div>
                        <label className="text-sm font-bold block mb-1">상호명 (Store Name)</label>
                        <Input value={storeName} onChange={e => setStoreName(e.target.value)} placeholder="가게 이름 입력" />
                        <p className="text-xs text-gray-500 mt-1">사용자 직업 란에 표시되며, 상장 시 기업명으로 사용됩니다.</p>
                    </div>
                    <div>
                        <label className="text-sm font-bold block mb-1">가게 소개 (Description)</label>
                        <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="가게 한줄 소개" />
                        <p className="text-xs text-gray-500 mt-1">상태 메시지에 표시됩니다.</p>
                    </div>
                    <Button onClick={handleSaveInfo} className="w-full">저장</Button>
                </div>
            </Card>

            <Card>
                <h4 className="text-lg font-bold mb-4">기업 상장 (IPO)</h4>
                <div className="space-y-3">
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                        사업자로 등록되어 있어 주식 시장 상장이 가능합니다.<br/>
                        상장을 원하시면 한국은행에 요청하세요.
                    </p>
                    <Button onClick={handleRequestIPO} className="w-full bg-purple-600 hover:bg-purple-500">상장 심사 요청</Button>
                    <p className="text-xs text-gray-500 text-center">
                        * 심사 요청 후 한국은행 관리자가 직접 정보를 입력하고 승인해야 완료됩니다.
                    </p>
                </div>
            </Card>

            <Card>
                <h4 className="text-lg font-bold mb-4">매출 변동 추이 (최근 20건)</h4>
                <div className="w-full h-64 flex items-end justify-between gap-1 border-b border-l border-gray-400 p-2 relative">
                    {salesData.length === 0 ? (
                        <div className="absolute inset-0 flex items-center justify-center text-gray-500">
                            매출 데이터가 없습니다.
                        </div>
                    ) : (
                        salesData.map((tx, i) => {
                            const maxVal = Math.max(...salesData.map(t => t.amount));
                            const height = maxVal > 0 ? (tx.amount / maxVal) * 100 : 0;
                            return (
                                <div key={i} className="flex flex-col items-center flex-1 group relative">
                                    <div 
                                        style={{ height: `${height}%` }} 
                                        className="w-full bg-green-500 hover:bg-green-400 rounded-t transition-all min-w-[10px]"
                                    ></div>
                                    <div className="absolute bottom-full mb-1 hidden group-hover:block bg-black text-white text-xs p-1 rounded z-10 whitespace-nowrap">
                                        ₩{(tx.amount || 0).toLocaleString()}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </Card>
        </div>
    );
};
