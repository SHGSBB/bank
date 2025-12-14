
import React, { useState, useMemo } from 'react';
import { useGame } from '../../../../context/GameContext';
import { Card, Button, Input, Modal } from '../../../Shared';
import { User, Chat, ChatMessage, PendingTax } from '../../../../types';

export const EnforcementTab: React.FC = () => {
    const { db, showModal, serverAction, currentUser } = useGame();
    const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
    const [userSearch, setUserSearch] = useState('');
    const [fineAmount, setFineAmount] = useState('');
    const [fineReason, setFineReason] = useState('');

    const citizens = (Object.values(db.users) as User[]).filter(u => u.type === 'citizen');
    const filteredCitizens = citizens.filter(u => u.name.includes(userSearch));
    
    // Fix unpaidTaxUsers filter to handle non-array pendingTaxes
    const unpaidTaxUsers = citizens.filter(c => {
        const taxes = (c.pendingTaxes ? (Array.isArray(c.pendingTaxes) ? c.pendingTaxes : Object.values(c.pendingTaxes)) : []) as PendingTax[];
        return taxes.some(t => t.status !== 'paid');
    });

    // Fetch pending sentences from chat messages
    const pendingSentences = useMemo(() => {
        const chats = Object.values(db.chatRooms || {}) as Chat[];
        const myChats = chats.filter(c => c.participants.includes(currentUser!.name));
        const proposals: { msg: ChatMessage, chat: Chat }[] = [];
        
        myChats.forEach(c => {
            const msgs = Object.values(db.chatMessages?.[c.id] || {}) as ChatMessage[];
            msgs.forEach(m => {
                if (m.attachment?.type === 'proposal' && m.attachment.data?.type === 'sentence') {
                    proposals.push({ msg: m, chat: c });
                }
            });
        });
        return proposals.sort((a,b) => b.msg.timestamp - a.msg.timestamp);
    }, [db.chatRooms, db.chatMessages, currentUser]);

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

            <Card className="border-l-4 border-indigo-500">
                <h4 className="text-xl font-bold mb-4 text-indigo-700">⚖️ 판결 집행 요청 (판사 발송)</h4>
                <div className="space-y-3">
                    {pendingSentences.map(({ msg, chat }) => (
                        <div key={msg.id} className="p-3 bg-gray-50 dark:bg-gray-800 rounded border border-indigo-200">
                            <div className="flex justify-between text-xs text-gray-500 mb-1">
                                <span>From: {msg.sender}</span>
                                <span>{new Date(msg.timestamp).toLocaleString()}</span>
                            </div>
                            <p className="font-bold text-sm mb-1">대상: {msg.attachment?.data?.targets?.join(', ')}</p>
                            <p className="text-sm whitespace-pre-wrap">{msg.attachment?.data?.text}</p>
                            {msg.attachment?.data?.probation && <p className="text-xs text-blue-600 mt-1">집행유예: {msg.attachment.data.probation}</p>}
                            <div className="mt-2 flex gap-2">
                                <Button className="text-xs py-1 px-3 bg-indigo-600">형 집행</Button>
                                <Button className="text-xs py-1 px-3" variant="secondary">감형/반려</Button>
                            </div>
                        </div>
                    ))}
                    {pendingSentences.length === 0 && <p className="text-gray-500 text-center py-4">대기 중인 판결문이 없습니다.</p>}
                </div>
            </Card>
        </div>
    );
};
