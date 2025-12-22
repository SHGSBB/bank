
import React, { useState } from 'react';
import { useGame } from '../../context/GameContext';
import { Card, Button, Input, MoneyInput } from '../Shared';
import { User, ScheduledTransfer } from '../../types';
import { searchUsersByName, generateId } from '../../services/firebase';

export const TransferTab: React.FC = () => {
    const { currentUser, db, notify, showModal, showPinModal, serverAction, updateUser } = useGame();
    const [subTab, setSubTab] = useState<'immediate' | 'reserved' | 'recurring'>('immediate');
    
    // Shared State
    const [recipientSearch, setRecipientSearch] = useState('');
    const [selectedRecipient, setSelectedRecipient] = useState<string | null>(null);
    const [amount, setAmount] = useState<string>('');
    const [senderMemo, setSenderMemo] = useState('');
    const [recipientMemo, setRecipientMemo] = useState('');
    const [searchResults, setSearchResults] = useState<User[]>([]);
    
    // Reserved State
    const [reserveDate, setReserveDate] = useState('');
    const [reserveTime, setReserveTime] = useState('');

    // Recurring State
    const [recurRange, setRecurRange] = useState<'day'|'week'|'month'>('month');
    const [recurValue, setRecurValue] = useState(''); // Day of month, Day of week index, or interval days
    const [recurStart, setRecurStart] = useState('');
    const [recurEnd, setRecurEnd] = useState('');

    const handleSearch = async (val: string) => {
        setRecipientSearch(val);
        setSelectedRecipient(null);
        if (val.length < 1) { setSearchResults([]); return; }
        try {
            const results = await searchUsersByName(val);
            setSearchResults(results.filter(u => u.name !== currentUser?.name));
        } catch(e) {}
    };

    const handleTransfer = async () => {
        if (!selectedRecipient || !amount) return showModal("정보를 입력하세요.");
        const valAmount = parseInt(amount);
        if (currentUser!.balanceKRW < valAmount) return showModal("잔액 부족");
        
        const pin = await showPinModal("이체 인증", currentUser!.pin!, 4, false);
        if (pin !== currentUser!.pin) return;

        if (subTab === 'immediate') {
            await serverAction('transfer', {
                // Use email/ID for safe lookup, fallback to name if missing (but email is preferred)
                senderId: currentUser!.email || currentUser!.id, 
                receiverId: selectedRecipient, // Search returns name usually, but API can resolve name too. 
                amount: valAmount,
                senderMemo, 
                receiverMemo: recipientMemo
            });
            showModal("이체 완료");
        } else if (subTab === 'reserved') {
            if (!reserveDate || !reserveTime) return showModal("날짜와 시간을 입력하세요.");
            const scheduledTime = new Date(`${reserveDate}T${reserveTime}`).toISOString();
            const newItem: ScheduledTransfer = {
                id: generateId(),
                type: 'reserved',
                fromUser: currentUser!.name,
                toUser: selectedRecipient,
                amount: valAmount,
                description: senderMemo,
                status: 'active',
                scheduledTime
            };
            const newAuto = { ...(currentUser?.autoTransfers || {}), [newItem.id]: newItem };
            // Note: updateUser uses local currentUser key which handles email correctly in GameContext
            await updateUser(currentUser!.id || currentUser!.email!, { autoTransfers: newAuto });
            showModal("예약 이체가 등록되었습니다.");
        } else {
            // Recurring
            if (!recurStart || !recurEnd || !recurValue) return showModal("설정을 완료하세요.");
            const newItem: ScheduledTransfer = {
                id: generateId(),
                type: 'recurring',
                fromUser: currentUser!.name,
                toUser: selectedRecipient,
                amount: valAmount,
                description: senderMemo,
                status: 'active',
                recurringConfig: {
                    startDate: recurStart,
                    endDate: recurEnd,
                    frequencyType: recurRange === 'day' ? 'daily' : (recurRange === 'week' ? 'weekly' : 'monthly'),
                    frequencyValue: parseInt(recurValue),
                    nextRunTime: new Date().toISOString() // Logic needs to calculate next run
                }
            };
            const newAuto = { ...(currentUser?.autoTransfers || {}), [newItem.id]: newItem };
            await updateUser(currentUser!.id || currentUser!.email!, { autoTransfers: newAuto });
            showModal("정기 이체가 등록되었습니다.");
        }
        
        // Reset
        setAmount(''); setSelectedRecipient(null); setRecipientSearch(''); setSenderMemo(''); setRecipientMemo('');
    };

    return (
        <Card>
            <div className="flex gap-4 border-b border-gray-200 dark:border-gray-700 mb-4 pb-2">
                {[{id:'immediate', l:'즉시 이체'}, {id:'reserved', l:'예약 이체'}, {id:'recurring', l:'정기 이체'}].map(t => (
                    <button key={t.id} onClick={() => setSubTab(t.id as any)} className={`pb-2 font-bold ${subTab === t.id ? 'border-b-2 border-black dark:border-white text-black dark:text-white' : 'text-gray-400'}`}>{t.l}</button>
                ))}
            </div>

            <div className="space-y-4">
                <div className="relative">
                    <label className="text-xs font-bold block mb-1 text-gray-700 dark:text-gray-300">받는 사람</label>
                    <Input placeholder="이름 검색" value={recipientSearch} onChange={e => handleSearch(e.target.value)} />
                    {recipientSearch && !selectedRecipient && (
                        <div className="absolute z-10 w-full bg-white dark:bg-[#252525] border dark:border-gray-700 rounded max-h-40 overflow-y-auto shadow-lg">
                            {searchResults.map(u => (
                                <div key={u.name} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer" onClick={() => { setSelectedRecipient(u.name); setRecipientSearch(u.name); }}>
                                    {u.name} ({u.customJob || u.type})
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                <div><label className="text-xs font-bold block mb-1 text-gray-700 dark:text-gray-300">금액</label><MoneyInput value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" className="text-right" /></div>
                
                {subTab === 'reserved' && (
                    <div className="flex gap-2">
                        <div className="flex-1"><label className="text-xs font-bold text-gray-700 dark:text-gray-300">날짜</label><input type="date" value={reserveDate} onChange={e => setReserveDate(e.target.value)} className="w-full p-3 rounded-[18px] bg-white dark:bg-[#252525] text-black dark:text-white border border-gray-200 dark:border-gray-700" /></div>
                        <div className="flex-1"><label className="text-xs font-bold text-gray-700 dark:text-gray-300">시간</label><input type="time" value={reserveTime} onChange={e => setReserveTime(e.target.value)} className="w-full p-3 rounded-[18px] bg-white dark:bg-[#252525] text-black dark:text-white border border-gray-200 dark:border-gray-700" /></div>
                    </div>
                )}

                {subTab === 'recurring' && (
                    <div className="space-y-3 p-3 bg-gray-50 dark:bg-[#252525] rounded-xl border border-gray-200 dark:border-gray-700">
                        <div className="flex gap-2">
                            <button onClick={() => setRecurRange('day')} className={`flex-1 py-2 rounded-lg text-xs font-bold ${recurRange==='day' ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' : 'bg-white dark:bg-[#1E1E1E]'}`}>매일</button>
                            <button onClick={() => setRecurRange('week')} className={`flex-1 py-2 rounded-lg text-xs font-bold ${recurRange==='week' ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' : 'bg-white dark:bg-[#1E1E1E]'}`}>매주</button>
                            <button onClick={() => setRecurRange('month')} className={`flex-1 py-2 rounded-lg text-xs font-bold ${recurRange==='month' ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' : 'bg-white dark:bg-[#1E1E1E]'}`}>매월</button>
                        </div>
                        <div>
                            <label className="text-xs font-bold block mb-1 text-gray-700 dark:text-gray-300">
                                {recurRange === 'day' ? '간격 (일)' : (recurRange === 'week' ? '요일 (0=일 ~ 6=토)' : '날짜 (1~31)')}
                            </label>
                            <Input type="number" value={recurValue} onChange={e => setRecurValue(e.target.value)} placeholder="설정값" />
                        </div>
                        <div className="flex gap-2">
                            <div className="flex-1"><label className="text-xs font-bold text-gray-700 dark:text-gray-300">시작일</label><input type="date" value={recurStart} onChange={e => setRecurStart(e.target.value)} className="w-full p-3 rounded-[18px] bg-white dark:bg-[#1E1E1E] text-black dark:text-white text-xs border border-gray-200 dark:border-gray-700" /></div>
                            <div className="flex-1"><label className="text-xs font-bold text-gray-700 dark:text-gray-300">종료일</label><input type="date" value={recurEnd} onChange={e => setRecurEnd(e.target.value)} className="w-full p-3 rounded-[18px] bg-white dark:bg-[#1E1E1E] text-black dark:text-white text-xs border border-gray-200 dark:border-gray-700" /></div>
                        </div>
                    </div>
                )}

                <div>
                    <label className="text-xs font-bold block mb-1 text-gray-700 dark:text-gray-300">받는 분에게 표시</label>
                    <Input value={recipientMemo} onChange={e => setRecipientMemo(e.target.value)} placeholder="받는 통장 표시" />
                </div>
                <div>
                    <label className="text-xs font-bold block mb-1 text-gray-700 dark:text-gray-300">내 통장 표시</label>
                    <Input value={senderMemo} onChange={e => setSenderMemo(e.target.value)} placeholder="내 통장 표시" />
                </div>
                
                <Button onClick={handleTransfer} className="w-full mt-4">
                    {subTab === 'immediate' ? '보내기' : '등록하기'}
                </Button>
            </div>
        </Card>
    );
};
