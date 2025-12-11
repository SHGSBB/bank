import React, { useMemo } from 'react';
import { useGame } from '../../../context/GameContext';
import { Card, Button } from '../../Shared';
import { Chat, ChatMessage } from '../../../types';

export const AdminFeedbackTab: React.FC = () => {
    const { db, notify } = useGame();

    const feedbacks = useMemo(() => {
        const chats = Object.values(db.chats || {}) as Chat[];
        // Filter chats that are explicitly 'feedback' type or sent to '한국은행' with specific tag
        const feedbackChats = chats.filter(c => c.type === 'feedback' && c.participants.includes('한국은행'));
        
        const allMessages: { msg: ChatMessage, chat: Chat }[] = [];
        
        feedbackChats.forEach(c => {
            const msgs = Object.values(c.messages || {}) as ChatMessage[];
            msgs.forEach(m => {
                if (m.sender !== '한국은행') {
                    allMessages.push({ msg: m, chat: c });
                }
            });
        });
        
        return allMessages.sort((a,b) => b.msg.timestamp - a.msg.timestamp);
    }, [db.chats]);

    const handleReply = (chat: Chat) => {
        // Just notify user that admin will reply in chat
        // In a real app, this would open the chat window for the admin
        // For now, let's assume the admin can go to the chat tab to reply
        alert("메시지 탭에서 해당 사용자와 대화하여 답변해주세요.");
    };

    return (
        <Card>
            <h3 className="text-2xl font-bold mb-4">피드백 수신함</h3>
            {feedbacks.length === 0 ? <p className="text-gray-500 py-10 text-center">수신된 피드백이 없습니다.</p> :
            <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
                {feedbacks.map(({ msg, chat }) => (
                    <div key={msg.id} className="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
                        <div className="flex justify-between items-start mb-2">
                            <span className="font-bold text-lg">{msg.sender} <span className="text-xs font-normal text-gray-500">({chat.groupName})</span></span>
                            <span className="text-xs text-gray-500">{new Date(msg.timestamp).toLocaleString()}</span>
                        </div>
                        <p className="text-sm whitespace-pre-wrap mb-3">{msg.text}</p>
                        
                        {msg.attachment?.data?.image && (
                            <img src={msg.attachment.data.image} alt="Feedback" className="w-full h-32 object-contain mb-2 border rounded bg-white" />
                        )}

                        {msg.attachment?.data?.link && (
                            <a href={msg.attachment.data.link} target="_blank" rel="noreferrer" className="text-blue-500 text-xs mt-2 block underline">
                                첨부 링크: {msg.attachment.data.link}
                            </a>
                        )}
                        <Button className="text-xs w-full mt-2" onClick={() => handleReply(chat)}>채팅으로 답변하기</Button>
                    </div>
                ))}
            </div>}
        </Card>
    );
};