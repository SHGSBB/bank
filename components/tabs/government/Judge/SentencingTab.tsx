
import React, { useState } from 'react';
import { useGame } from '../../../../context/GameContext';
import { Card, Button, Input, Modal } from '../../../Shared';
import { User } from '../../../../types';

export const SentencingTab: React.FC = () => {
    const { db, showModal, createChat, sendMessage } = useGame();
    const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
    const [userSearch, setUserSearch] = useState('');
    const [sentenceText, setSentenceText] = useState('');
    const [probation, setProbation] = useState('');

    const citizens = (Object.values(db.users) as User[]).filter(u => u.type === 'citizen');
    const filteredCitizens = citizens.filter(u => u.name.includes(userSearch));

    const handleSendSentence = async () => {
        if (selectedUsers.length === 0) return showModal("대상 시민을 선택하세요.");
        if (!sentenceText.trim()) return showModal("형량/판결 내용을 입력하세요.");

        // Find Minister of Justice
        const minister = (Object.values(db.users) as User[]).find(u => u.govtRole === '법무부장관');
        if (!minister) return showModal("법무부장관을 찾을 수 없습니다.");

        const chatId = await createChat([minister.name], 'private');
        const msg = `[판결문 송달]\n대상: ${selectedUsers.join(', ')}\n내용: ${sentenceText}\n집행유예: ${probation || '없음'}`;
        
        await sendMessage(chatId, msg, {
            type: 'proposal', 
            value: '판결 집행 요청', 
            data: { type: 'sentence', targets: selectedUsers, text: sentenceText, probation } 
        });

        showModal("법무부장관에게 판결문을 전송했습니다.");
        setSentenceText('');
        setProbation('');
        setSelectedUsers([]);
    };

    return (
        <Card className="border-l-4 border-indigo-500">
            <h4 className="text-xl font-bold mb-4 text-indigo-700">⚖️ 판결 및 형량 선고</h4>
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
                    <label className="text-sm font-bold block mb-2">판결 내용 (형량)</label>
                    <textarea 
                        className="w-full p-3 rounded-2xl border bg-gray-50 dark:bg-gray-900 focus:ring-2 focus:ring-indigo-500 outline-none" 
                        rows={3}
                        placeholder="예: 징역 10분. (벌금은 법무부 소관)"
                        value={sentenceText}
                        onChange={e => setSentenceText(e.target.value)}
                    />
                </div>
                <div>
                    <label className="text-sm font-bold block mb-2">집행유예 기간 (선택)</label>
                    <Input 
                        placeholder="예: 1일" 
                        value={probation}
                        onChange={e => setProbation(e.target.value)}
                    />
                </div>
                <Button onClick={handleSendSentence} className="w-full bg-indigo-600 hover:bg-indigo-500">법무부장관에게 판결문 전송</Button>
            </div>
        </Card>
    );
};
