
import React, { useState, useMemo } from 'react';
import { useGame } from '../../../context/GameContext';
import { Card, Button, Input, Modal } from '../../Shared';
import { User, PolicyRequest, Judgement, PendingTax } from '../../../types';

// Simple Stats Chart
const SimpleBarChart: React.FC<{ data: number[] }> = ({ data }) => {
    const max = Math.max(...data, 1);
    return (
        <div className="flex items-end gap-1 h-32 w-full border-b border-gray-400 pb-1">
            {data.map((val, i) => (
                <div key={i} className="flex-1 bg-blue-500 hover:bg-blue-400 transition-all rounded-t relative group" style={{ height: `${(val / max) * 100}%` }}>
                    <div className="absolute bottom-full mb-1 hidden group-hover:block bg-black text-white text-[10px] p-1 rounded z-10 whitespace-nowrap">
                        {i+1}분위: {val}명
                    </div>
                </div>
            ))}
        </div>
    );
};

interface Props {
    role: string;
    isPresident: boolean;
    isJusticeMinister: boolean;
    isProsecutor: boolean;
    isJudge: boolean;
    isCongressman: boolean;
}

export const GovernmentRoleViews: React.FC<Props> = ({ role, isPresident, isJusticeMinister, isProsecutor, isJudge, isCongressman }) => {
    const { db, showModal, approvePolicyChange, rejectPolicyChange, sendMessage, createChat, serverAction, currentUser } = useGame();
    
    // --- Shared State ---
    const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
    const [userSearch, setUserSearch] = useState('');
    const citizens = (Object.values(db.users) as User[]).filter(u => u.type === 'citizen');
    const filteredCitizens = citizens.filter(u => u.name.includes(userSearch));

    // --- President Logic ---
    const pendingPolicies = useMemo(() => {
        return (Object.values(db.policyRequests || {}) as PolicyRequest[]).filter(p => p.status === 'pending').sort((a,b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime());
    }, [db.policyRequests]);

    // --- Judge Logic ---
    const [sentenceText, setSentenceText] = useState('');
    const handleSendSentence = async () => {
        if (selectedUsers.length === 0) return showModal("대상 시민을 선택하세요.");
        if (!sentenceText.trim()) return showModal("형량/판결 내용을 입력하세요.");

        // Find Minister of Justice
        const minister = (Object.values(db.users) as User[]).find(u => u.govtRole === '법무부장관');
        if (!minister) return showModal("법무부장관을 찾을 수 없습니다.");

        const chatId = await createChat([minister.name], 'private');
        const msg = `[판결문 송달]\n대상: ${selectedUsers.join(', ')}\n내용: ${sentenceText}`;
        
        await sendMessage(chatId, msg, {
            type: 'proposal', 
            value: '판결 집행 요청', 
            data: { type: 'sentence', targets: selectedUsers, text: sentenceText } 
        });

        showModal("법무부장관에게 판결문을 전송했습니다.");
        setSentenceText('');
        setSelectedUsers([]);
    };

    // --- Minister Logic ---
    const [fineAmount, setFineAmount] = useState('');
    const [fineReason, setFineReason] = useState('');
    // Fix unpaidTaxUsers
    const unpaidTaxUsers = citizens.filter(c => {
        const taxes = (c.pendingTaxes ? (Array.isArray(c.pendingTaxes) ? c.pendingTaxes : Object.values(c.pendingTaxes)) : []) as PendingTax[];
        return taxes.some(t => t.status !== 'paid');
    });

    const handleImposeFine = async () => {
        if (selectedUsers.length === 0) return showModal("대상 시민을 선택하세요.");
        const amount = parseInt(fineAmount);
        if (isNaN(amount) || amount <= 0) return showModal("올바른 과태료 금액을 입력하세요.");
        if (!fineReason.trim()) return showModal("부과 사유를 입력하세요.");

        const fines = selectedUsers.map(uid => ({
            userId: uid,
            amount: amount,
            breakdown: `[과태료] ${fineReason}`,
            type: 'fine'
        }));

        try {
            await serverAction('collect_tax', {
                taxSessionId: `fine_${Date.now()}`,
                taxes: fines,
                dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
            });
            showModal(`${selectedUsers.length}명에게 과태료 부과를 완료했습니다.`);
            setFineAmount(''); setFineReason(''); setSelectedUsers([]);
        } catch(e) {
            showModal("부과 실패");
        }
    };

    // --- Congressman Logic ---
    const wealthDistribution = useMemo(() => {
        const assets = citizens.map(c => c.balanceKRW + (c.balanceUSD * 1350) + ((db.realEstate.grid||[]).filter(p=>p.owner===c.name).reduce((s,p)=>s+p.price,0)));
        assets.sort((a,b) => a-b);
        const buckets = [0,0,0,0,0];
        if (assets.length === 0) return buckets;
        const maxVal = Math.max(...assets) || 1;
        assets.forEach(val => {
            const idx = Math.min(4, Math.floor((val / (maxVal * 1.01)) * 5));
            buckets[idx]++;
        });
        return buckets;
    }, [citizens, db.realEstate]);

    if (isPresident) {
        return (
            <Card className="border-l-4 border-purple-500">
                <h4 className="text-xl font-bold mb-4 text-purple-700 flex items-center gap-2">
                    <span>✍️ 국정 운영 승인 (대통령)</span>
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
        );
    }

    if (isJudge) {
        return (
            <Card className="border-l-4 border-indigo-500">
                <h4 className="text-xl font-bold mb-4 text-indigo-700">⚖️ 판결 및 형량 선고 (판사)</h4>
                <div className="space-y-4">
                    <div>
                        <label className="text-sm font-bold block mb-2">대상 시민 선택 ({selectedUsers.length}명)</label>
                        <Input placeholder="이름 검색" value={userSearch} onChange={e => setUserSearch(e.target.value)} className="mb-2 w-full text-sm" />
                        <div className="max-h-40 overflow-y-auto border rounded p-2 bg-white dark:bg-gray-800 space-y-1">
                            {filteredCitizens.map(c => (
                                <div key={c.name} onClick={() => {
                                    if(selectedUsers.includes(c.name)) setSelectedUsers(selectedUsers.filter(u=>u!==c.name));
                                    else setSelectedUsers([...selectedUsers, c.name]);
                                }} className={`p-2 rounded cursor-pointer flex justify-between ${selectedUsers.includes(c.name) ? 'bg-indigo-100 dark:bg-indigo-900' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
                                    <span>{c.name}</span>
                                    {selectedUsers.includes(c.name) && <span>✅</span>}
                                </div>
                            ))}
                        </div>
                    </div>
                    <div>
                        <label className="text-sm font-bold block mb-2">판결 내용 (형량/집행유예)</label>
                        <textarea 
                            className="w-full p-3 rounded-2xl border bg-gray-50 dark:bg-gray-900 focus:ring-2 focus:ring-indigo-500 outline-none" 
                            rows={4}
                            placeholder="예: 징역 10분, 집행유예 1일. (벌금은 법무부 소관)"
                            value={sentenceText}
                            onChange={e => setSentenceText(e.target.value)}
                        />
                    </div>
                    <Button onClick={handleSendSentence} className="w-full bg-indigo-600 hover:bg-indigo-500">법무부장관에게 판결문 전송</Button>
                </div>
            </Card>
        );
    }

    if (isJusticeMinister) {
        return (
            <div className="space-y-6">
                <Card className="border-l-4 border-red-500">
                    <h4 className="text-xl font-bold mb-4 text-red-700">🛡️ 법무부 집행 (과태료/벌금)</h4>
                    
                    <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
                        <h5 className="font-bold text-sm mb-2 text-red-800 dark:text-red-300">🚨 세금 미납자 명단 (한국은행 공유)</h5>
                        <div className="max-h-32 overflow-y-auto space-y-1 text-xs">
                            {unpaidTaxUsers.map(u => {
                                const taxes = (u.pendingTaxes ? (Array.isArray(u.pendingTaxes) ? u.pendingTaxes : Object.values(u.pendingTaxes)) : []) as PendingTax[];
                                return (
                                    <div key={u.name} className="flex justify-between">
                                        <span>{u.name}</span>
                                        <span className="text-red-500">미납 {taxes.filter(t=>t.status!=='paid').length}건</span>
                                    </div>
                                );
                            })}
                            {unpaidTaxUsers.length === 0 && <p className="text-gray-500">미납자가 없습니다.</p>}
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <label className="text-sm font-bold block mb-2">과태료 부과 대상 ({selectedUsers.length}명)</label>
                            <Input placeholder="이름 검색" value={userSearch} onChange={e => setUserSearch(e.target.value)} className="mb-2 w-full text-sm" />
                            <div className="max-h-40 overflow-y-auto border rounded p-2 bg-white dark:bg-gray-800 space-y-1">
                                {filteredCitizens.map(c => {
                                    const taxes = (c.pendingTaxes ? (Array.isArray(c.pendingTaxes) ? c.pendingTaxes : Object.values(c.pendingTaxes)) : []) as PendingTax[];
                                    const hasUnpaid = taxes.some(t => t.status !== 'paid');
                                    return (
                                        <div key={c.name} onClick={() => {
                                            if(selectedUsers.includes(c.name)) setSelectedUsers(selectedUsers.filter(u=>u!==c.name));
                                            else setSelectedUsers([...selectedUsers, c.name]);
                                        }} className={`p-2 rounded cursor-pointer flex justify-between ${selectedUsers.includes(c.name) ? 'bg-red-100 dark:bg-red-900' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
                                            <div className="flex flex-col">
                                                <span>{c.name}</span>
                                                {hasUnpaid && <span className="text-[10px] text-red-500">미납 세금 있음</span>}
                                            </div>
                                            {selectedUsers.includes(c.name) && <span>✅</span>}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-sm font-bold block mb-1">금액 (₩)</label>
                                <Input type="number" value={fineAmount} onChange={e => setFineAmount(e.target.value)} className="w-full" />
                            </div>
                            <div>
                                <label className="text-sm font-bold block mb-1">사유</label>
                                <Input value={fineReason} onChange={e => setFineReason(e.target.value)} className="w-full" placeholder="예: 세금 미납" />
                            </div>
                        </div>
                        <Button onClick={handleImposeFine} className="w-full bg-red-600 hover:bg-red-500">과태료 고지서 발송</Button>
                    </div>
                </Card>
            </div>
        );
    }

    if (isProsecutor) {
        return (
            <Card className="border-l-4 border-gray-500">
                <h4 className="text-xl font-bold mb-4 text-gray-700">🔍 검찰 조회 (벌금/납세 현황)</h4>
                <div className="space-y-4">
                    <Input placeholder="시민 검색..." value={userSearch} onChange={e => setUserSearch(e.target.value)} />
                    <div className="max-h-96 overflow-y-auto space-y-2">
                        {filteredCitizens.map(c => {
                            const rawTaxes = (c.pendingTaxes ? (Array.isArray(c.pendingTaxes) ? c.pendingTaxes : Object.values(c.pendingTaxes)) : []) as PendingTax[];
                            const fines = rawTaxes.filter(t => t.type === 'fine');
                            // Prosecutor sees all tax info as well for investigation
                            const taxes = rawTaxes.filter(t => t.type !== 'fine');
                            
                            return (
                                <div key={c.name} className="p-3 border rounded-xl bg-white dark:bg-gray-800 text-sm shadow-sm">
                                    <p className="font-bold text-lg mb-1">{c.name}</p>
                                    
                                    {fines.length > 0 && (
                                        <div className="mb-2">
                                            <p className="text-xs font-bold text-red-600">벌금/과태료 내역</p>
                                            {fines.map(f => (
                                                <p key={f.id} className="text-xs ml-2">- {f.breakdown} (₩{f.amount.toLocaleString()}) {f.status === 'paid' ? '✅' : '❌'}</p>
                                            ))}
                                        </div>
                                    )}
                                    
                                    {taxes.length > 0 && (
                                        <div>
                                            <p className="text-xs font-bold text-blue-600">세금 내역</p>
                                            {taxes.map(t => (
                                                <p key={t.id} className="text-xs ml-2">- {t.type} (₩{t.amount.toLocaleString()}) {t.status === 'paid' ? '✅' : '❌'}</p>
                                            ))}
                                        </div>
                                    )}
                                    
                                    {fines.length === 0 && taxes.length === 0 && <p className="text-xs text-gray-400">특이사항 없음</p>}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </Card>
        );
    }

    if (isCongressman) {
        return (
            <Card className="border-l-4 border-green-500">
                <h4 className="text-xl font-bold mb-4 text-green-700">📊 국민 재산 실태 (통계)</h4>
                <div className="p-4 bg-white dark:bg-gray-800 rounded-lg">
                    <p className="text-sm text-gray-500 mb-4 font-bold">전체 시민 자산 분포 (5구간)</p>
                    <SimpleBarChart data={wealthDistribution} />
                    <div className="flex justify-between text-xs text-gray-400 mt-2">
                        <span>저소득층</span>
                        <span>고소득층</span>
                    </div>
                    <div className="mt-4 p-3 bg-gray-100 dark:bg-gray-900 rounded text-sm">
                        <p>총 시민 수: {citizens.length}명</p>
                        <p className="mt-2 text-xs text-gray-500">
                            이 데이터는 금융법 제정을 위한 익명 통계 자료입니다.<br/>
                            개별 시민의 자산 정보는 조회할 수 없습니다.
                        </p>
                    </div>
                </div>
            </Card>
        );
    }

    return null;
};
