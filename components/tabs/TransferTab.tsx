
import React, { useState } from 'react';
import { useGame } from '../../context/GameContext';
import { Card, Button, Input, MoneyInput } from '../Shared';
import { User } from '../../types';

export const TransferTab: React.FC = () => {
    const { currentUser, db, notify, showModal, showPinModal, serverAction } = useGame();
    const [recipientSearch, setRecipientSearch] = useState('');
    const [selectedRecipient, setSelectedRecipient] = useState<string | null>(null);
    const [amount, setAmount] = useState<string>('');
    const [senderMemo, setSenderMemo] = useState('');
    const [recipientMemo, setRecipientMemo] = useState('');

    const handleRecipientSelect = (name: string) => {
        setSelectedRecipient(name);
        setRecipientSearch(name);
    };

    const handleTransfer = async () => {
        if (db.settings.isFrozen) return showModal('현재 모든 금융 거래가 중지되었습니다.');

        if (!selectedRecipient || !db.users[selectedRecipient]) return showModal('유효한 수신자를 선택해주세요.');
        const valAmount = parseFloat(amount);
        if (isNaN(valAmount) || valAmount <= 0) return showModal('올바른 금액을 입력해주세요.');
        if (!senderMemo || !recipientMemo) return showModal('계좌 표시 내용을 모두 입력해주세요.');
        if (currentUser!.balanceKRW < valAmount) return showModal('잔액이 부족합니다.');

        const pin = await showPinModal('간편번호를 입력하세요.', currentUser!.pin!, currentUser?.pinLength || 4, false);
        if (pin !== currentUser!.pin) return; 

        // USE SERVER ACTION
        try {
            await serverAction('transfer', {
                senderId: currentUser!.name,
                receiverId: selectedRecipient,
                amount: valAmount,
                senderMemo,
                receiverMemo: recipientMemo
            });
            
            showModal('이체가 완료되었습니다.');
            setAmount('');
            setRecipientSearch('');
            setSelectedRecipient(null);
            setSenderMemo('');
            setRecipientMemo('');
        } catch (e) {
            showModal('이체 실패: 서버 오류가 발생했습니다.');
        }
    };

    const filteredUsers = Object.values(db.users)
        .filter((u: User) => 
            u.name !== currentUser?.name && 
            u.name.toLowerCase().includes(recipientSearch.toLowerCase()) && 
            u.id &&
            (u.type === 'citizen' || u.type === 'government' || u.type === 'official' || u.type === 'admin')
        )
        .slice(0, 5);

    return (
        <Card>
            <h3 className="text-2xl font-bold mb-6">이체</h3>
            <div className="space-y-4 w-full">
                <div className="relative">
                    <label className="text-sm font-medium mb-1 block">수신자 선택</label>
                    <Input 
                        placeholder="이름 검색" 
                        value={recipientSearch} 
                        onChange={e => {
                            setRecipientSearch(e.target.value);
                            setSelectedRecipient(null); 
                        }} 
                        className="w-full"
                    />
                    {recipientSearch && !selectedRecipient && (
                        <div className="absolute z-10 w-full bg-white dark:bg-[#2D2D2D] border dark:border-gray-600 rounded-md mt-1 shadow-lg max-h-40 overflow-y-auto">
                            {filteredUsers.map((u: User) => (
                                <div 
                                    key={u.name} 
                                    className="p-3 hover:bg-gray-100 dark:hover:bg-gray-600 cursor-pointer"
                                    onClick={() => handleRecipientSelect(u.name)}
                                >
                                    {u.name}
                                </div>
                            ))}
                            {filteredUsers.length === 0 && <div className="p-3 text-gray-500">검색 결과 없음</div>}
                        </div>
                    )}
                </div>

                <div>
                    <label className="text-sm font-medium mb-1 block">금액 (₩)</label>
                    <MoneyInput 
                        type="number" 
                        placeholder="0" 
                        value={amount} 
                        onChange={e => setAmount(e.target.value)} 
                        className="w-full"
                    />
                    <p className="text-xs text-gray-500 mt-1">1일 한도: ₩{(db.settings.transferLimit || 1000000).toLocaleString()}</p>
                </div>

                <div>
                    <label className="text-sm font-medium mb-1 block">내 계좌 표시</label>
                    <Input placeholder="내 통장에 표시될 내용" value={senderMemo} onChange={e => setSenderMemo(e.target.value)} className="w-full" />
                </div>

                <div>
                    <label className="text-sm font-medium mb-1 block">상대방 계좌 표시</label>
                    <Input placeholder="받는 사람 통장에 표시될 내용" value={recipientMemo} onChange={e => setRecipientMemo(e.target.value)} className="w-full" />
                </div>

                <Button className="w-full mt-4" onClick={handleTransfer}>이체하기</Button>
            </div>
        </Card>
    );
};
