
import React, { useMemo } from 'react';
import { useGame } from '../../../context/GameContext';
import { Card, Button } from '../../Shared';
import { TransactionHistoryTab } from '../TransactionHistoryTab';
import { User, Application, PolicyRequest } from '../../../types';

export const GovDashboard: React.FC = () => {
    const { currentUser, db, showModal, saveDb, notify, approvePolicyChange, rejectPolicyChange } = useGame();
    
    const isHead = currentUser?.isHeadOfDept || false;
    const isJustice = currentUser?.customJob?.includes('법무부장관') || false;
    const isPresident = currentUser?.isPresident;
    const isAdminOrGov = currentUser?.type === 'admin' || currentUser?.type === 'government' || isPresident;

    const totalGovBudget = useMemo(() => {
        return (Object.values(db.users) as User[])
            .filter(u => u.type === 'government')
            .reduce((sum, u) => sum + u.balanceKRW, 0);
    }, [db.users]);

    const justiceIncome = useMemo(() => {
        if (!isJustice) return [];
        return (currentUser?.transactions || []).filter(t => t.type === 'income').slice(0, 20);
    }, [currentUser, isJustice]);

    // ID Card Requests
    const idCardRequests = useMemo(() => {
        if (!isAdminOrGov) return [];
        return (Object.values(db.pendingApplications || {}) as Application[]).filter(a => a.type === 'id_card');
    }, [db.pendingApplications, isAdminOrGov]);

    // Policy Requests (for President)
    const pendingPolicies = useMemo(() => {
        if (!isPresident) return [];
        return (Object.values(db.policyRequests || {}) as PolicyRequest[]).filter(p => p.status === 'pending').sort((a,b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime());
    }, [db.policyRequests, isPresident]);

    const handleApproveIDCard = async (app: Application) => {
        const newDb = { ...db };
        const user = newDb.users[app.applicantName];
        
        if (!user) return;

        // Generate Resident Number: Birth(6) + Random(7)
        const birth = user.birthDate || '000000';
        const randomSuffix = Math.floor(1000000 + Math.random() * 9000000);
        const residentNumber = `${birth}-${randomSuffix}`;
        
        // Find property address if any
        const prop = newDb.realEstate.grid.find(p => p.owner === user.name);
        const address = prop ? `성화시 ${prop.id}번지` : '성화시 무주택 거주';

        user.idCard = {
            status: 'active',
            issueDate: new Date().toISOString(),
            residentNumber,
            address
        };

        delete newDb.pendingApplications[app.id];
        await saveDb(newDb);
        notify(user.name, "디지털 신분증이 발급되었습니다.", true);
        showModal("발급 완료.");
    };

    return (
        <div className="space-y-6">
            <Card>
                 <div className="flex justify-between items-start mb-4">
                    <div>
                        <h3 className="text-2xl font-bold">
                            {currentUser?.customJob || currentUser?.name || '공무원'} 대시보드
                        </h3>
                         <p className="text-sm text-gray-500">{currentUser?.govtBranch} 소속</p>
                    </div>
                </div>
                
                <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border">
                    <p className="text-md font-bold mb-1 text-gray-700 dark:text-gray-300">내 부처(Department) 예산 현황</p>
                    <p className="text-3xl font-bold">₩ {currentUser?.balanceKRW.toLocaleString()}</p>
                    {isHead && <span className="mt-2 inline-block text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">기관장</span>}
                    {isPresident && <span className="mt-2 inline-block text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded ml-2">대통령</span>}
                    {!isHead && !isPresident && <p className="text-xs text-gray-500 mt-2">* 일반 부서원은 예산 조회 및 거래 내역 확인만 가능합니다.</p>}
                </div>
                
                <div className="mt-4 text-right">
                    <p className="text-xs font-bold text-gray-400">참고: 전체 정부 예산 합계</p>
                    <p className="text-sm text-gray-500">₩ {totalGovBudget.toLocaleString()}</p>
                </div>
            </Card>

            {isPresident && (
                <Card className="border-l-4 border-purple-500">
                    <h4 className="text-xl font-bold mb-4 text-purple-700 flex items-center gap-2">
                        <span>✍️ 국정 운영 승인 (대통령 전용)</span>
                    </h4>
                    {pendingPolicies.length === 0 ? <p className="text-gray-500 py-4 text-center">승인 대기 중인 재정 정책 요청이 없습니다.</p> :
                    <div className="space-y-4">
                        {pendingPolicies.map(pol => (
                            <div key={pol.id} className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-purple-200 shadow-sm animate-fade-in">
                                <div className="flex justify-between items-start mb-2">
                                    <span className="font-bold text-lg">{pol.description}</span>
                                    <span className="text-xs text-gray-400">{new Date(pol.requestedAt).toLocaleDateString()}</span>
                                </div>
                                <p className="text-sm text-gray-600 mb-3">요청자: {pol.requester} (한국은행)</p>
                                
                                <div className="p-3 bg-gray-100 dark:bg-gray-900 rounded text-xs font-mono mb-4 border overflow-x-auto">
                                    <pre>{JSON.stringify(pol.data, null, 2)}</pre>
                                </div>
                                
                                <div className="flex gap-2">
                                    <Button onClick={() => approvePolicyChange(pol.id)} className="flex-1 bg-green-600 hover:bg-green-500">허가 (승인)</Button>
                                    <Button onClick={() => rejectPolicyChange(pol.id)} className="flex-1 bg-red-600 hover:bg-red-500">거부 (반려)</Button>
                                </div>
                            </div>
                        ))}
                    </div>}
                </Card>
            )}

            {idCardRequests.length > 0 && (
                <Card>
                    <h4 className="text-lg font-bold mb-4 text-blue-600">신분증 발급 요청 ({idCardRequests.length})</h4>
                    <div className="space-y-2">
                        {idCardRequests.map(req => (
                            <div key={req.id} className="flex justify-between items-center p-3 bg-blue-50 dark:bg-blue-900/20 rounded border border-blue-200">
                                <div>
                                    <p className="font-bold">{req.applicantName}</p>
                                    <p className="text-xs text-gray-500">{new Date(req.requestedDate).toLocaleDateString()}</p>
                                </div>
                                <Button onClick={() => handleApproveIDCard(req)} className="text-xs py-1 px-3">발급 승인</Button>
                            </div>
                        ))}
                    </div>
                </Card>
            )}

            {isJustice && (
                <Card>
                    <h4 className="text-lg font-bold mb-4 text-red-600">법무부 수입 내역 (벌금 등)</h4>
                    <div className="max-h-60 overflow-y-auto space-y-2">
                        {justiceIncome.length === 0 ? <p className="text-gray-500">수입 내역이 없습니다.</p> : justiceIncome.map(tx => (
                            <div key={tx.id} className="flex justify-between items-center p-2 border-b dark:border-gray-700 text-sm">
                                <span>{tx.description}</span>
                                <span className="font-bold text-green-600">+ {tx.amount.toLocaleString()}</span>
                            </div>
                        ))}
                    </div>
                </Card>
            )}

            <Card>
                <h4 className="text-lg font-bold mb-4">최근 거래 내역</h4>
                <div className="max-h-80 overflow-y-auto">
                    <TransactionHistoryTab />
                </div>
            </Card>
        </div>
    );
};
