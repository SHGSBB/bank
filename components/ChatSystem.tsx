
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useGame } from '../context/GameContext';
import { chatService } from '../services/firebase'; 
import { Button, Input, LineIcon, Modal, Toggle, formatName } from './Shared';
import { Chat, ChatMessage } from '../types';

export const ChatSystem: React.FC<{ isOpen: boolean; onClose: () => void; onAttachTab?: (tab: string) => void }> = ({ isOpen, onClose, onAttachTab }) => {
    const { currentUser, sendMessage } = useGame();
    const [view, setView] = useState<'list' | 'chat'>('list');
    const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
    const [threadRootId, setThreadRootId] = useState<string | null>(null);
    const [inputText, setInputText] = useState('');
    const [chats, setChats] = useState<Record<string, Chat>>({});
    const [activeMessages, setActiveMessages] = useState<Record<string, ChatMessage>>({});
    const [showSettings, setShowSettings] = useState(false);
    
    // Settings state
    const [isMuted, setIsMuted] = useState(false);
    const [isInputLocked, setIsInputLocked] = useState(false);

    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isOpen) return;
        return chatService.subscribeToChatList(setChats);
    }, [isOpen]);

    useEffect(() => {
        if (view === 'chat' && selectedChatId) {
            return chatService.subscribeToMessages(selectedChatId, 100, setActiveMessages);
        }
    }, [view, selectedChatId]);

    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [activeMessages, threadRootId]);

    const messages = useMemo(() => {
        // Fix: Cast Object.values(activeMessages) to ChatMessage[] to prevent 'unknown' errors
        const all = (Object.values(activeMessages) as ChatMessage[]).sort((a,b) => a.timestamp - b.timestamp);
        if (threadRootId) return all.filter(m => m.id === threadRootId || m.threadId === threadRootId);
        return all.filter(m => !m.threadId);
    }, [activeMessages, threadRootId]);

    const handleSendMessage = async () => {
        if (!selectedChatId || !inputText.trim() || isInputLocked) return;
        const text = inputText; setInputText('');
        await sendMessage(selectedChatId, text, threadRootId ? { type: 'file', value: 'thread_reply', data: { threadId: threadRootId } } : undefined);
    };

    const renderMessage = (msg: ChatMessage) => {
        const isMine = msg.sender === currentUser?.name;
        // Fix: Cast Object.values(activeMessages) to ChatMessage[] to prevent 'unknown' errors
        const replyCount = (Object.values(activeMessages) as ChatMessage[]).filter(m => m.threadId === msg.id).length;
        
        return (
            <div key={msg.id} className={`flex flex-col mb-4 ${isMine ? 'items-end' : 'items-start'}`}>
                {!isMine && <span className="text-[11px] text-gray-500 ml-3 mb-1 font-bold">{msg.sender}</span>}
                <div className="flex items-end gap-1">
                    {isMine && <span className="text-[9px] text-gray-400 mb-1">{new Date(msg.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>}
                    <div 
                        onClick={() => !threadRootId && setThreadRootId(msg.id)}
                        className={`group relative max-w-[240px] px-4 py-3 rounded-[18px] text-sm shadow-sm transition-all cursor-pointer ${
                        isMine ? 'bg-[#FEE500] text-black rounded-tr-none' : 'bg-white dark:bg-[#252525] dark:text-white border border-gray-100 dark:border-gray-800 rounded-tl-none'
                    }`}>
                        <p className="whitespace-pre-wrap leading-snug">{msg.text}</p>
                    </div>
                    {!isMine && <span className="text-[9px] text-gray-400 mb-1">{new Date(msg.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>}
                </div>
                {replyCount > 0 && !threadRootId && (
                    <button onClick={() => setThreadRootId(msg.id)} className="text-[10px] text-blue-500 font-bold mt-1 px-2">댓글 {replyCount}개 &gt;</button>
                )}
            </div>
        );
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 sm:inset-auto sm:right-0 sm:top-0 sm:bottom-0 z-[500] w-full sm:w-[380px] bg-[#B2C7DA] dark:bg-[#121212] flex flex-col shadow-2xl animate-slide-up">
            {/* Header */}
            <div className="h-14 bg-white dark:bg-[#1C1C1E] flex items-center px-4 justify-between border-b dark:border-gray-800 shrink-0">
                <div className="flex items-center gap-2">
                    {view === 'chat' && (
                        <button onClick={() => threadRootId ? setThreadRootId(null) : setView('list')} className="p-1">
                            <LineIcon icon="arrow-left" className="w-5 h-5 text-gray-700 dark:text-white" />
                        </button>
                    )}
                    <h2 className="font-bold text-lg">{threadRootId ? "스레드 답글" : (view === 'list' ? "채팅" : (chats[selectedChatId!]?.groupName || "대화"))}</h2>
                </div>
                <div className="flex items-center gap-2">
                    {view === 'chat' && !threadRootId && (
                        <button onClick={() => setShowSettings(!showSettings)}><LineIcon icon="menu" className="w-6 h-6 text-gray-600" /></button>
                    )}
                    <button onClick={onClose}><LineIcon icon="close" className="w-6 h-6 text-gray-600" /></button>
                </div>
            </div>

            {/* List or Chat */}
            {view === 'list' ? (
                <div className="flex-1 overflow-y-auto bg-white dark:bg-black">
                    {/* Fix: Cast Object.values(chats) to Chat[] to prevent 'unknown' errors */}
                    {(Object.values(chats) as Chat[]).map(chat => (
                        <div key={chat.id} onClick={() => { setSelectedChatId(chat.id); setView('chat'); }} className="p-4 border-b dark:border-gray-900 flex items-center gap-3 hover:bg-gray-50 active:bg-gray-100 cursor-pointer">
                            <div className="w-12 h-12 rounded-[16px] bg-gray-200 dark:bg-gray-800 flex items-center justify-center font-bold text-lg">{formatName(chat.groupName || chat.participants[0])[0]}</div>
                            <div className="flex-1 min-w-0">
                                <p className="font-bold text-sm truncate">{chat.groupName || chat.participants.join(', ')}</p>
                                <p className="text-xs text-gray-400 truncate mt-1">{chat.lastMessage}</p>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <>
                    <div className="flex-1 overflow-y-auto p-4 scroll-smooth" ref={scrollRef}>
                        {threadRootId && (
                            <div className="mb-6 p-4 bg-black/5 rounded-[22px] border border-black/5">
                                <p className="text-[10px] font-bold text-gray-500 mb-2 uppercase">원본 메시지</p>
                                {renderMessage(activeMessages[threadRootId])}
                                <div className="h-px bg-black/10 my-4" />
                            </div>
                        )}
                        {messages.filter(m => m.id !== threadRootId).map(renderMessage)}
                    </div>
                    
                    <div className="p-3 bg-white dark:bg-[#1C1C1E] border-t dark:border-gray-800 shrink-0">
                        <div className="flex items-center gap-2">
                            <button className="p-2 text-gray-400"><LineIcon icon="plus" className="w-6 h-6" /></button>
                            <div className="flex-1 flex items-center bg-gray-100 dark:bg-[#252525] rounded-[18px] px-3 py-2">
                                <textarea 
                                    className="flex-1 bg-transparent border-none focus:ring-0 text-sm p-1 max-h-24 resize-none outline-none dark:text-white"
                                    placeholder={isInputLocked ? "입력이 제한된 방입니다." : "메시지를 입력하세요..."}
                                    value={inputText}
                                    onChange={e => setInputText(e.target.value)}
                                    rows={1}
                                    disabled={isInputLocked}
                                />
                                <button onClick={handleSendMessage} className={`p-2 rounded-full ${inputText.trim() ? 'bg-[#FEE500] text-black' : 'text-gray-300'}`}>
                                    <LineIcon icon="send" className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* Sidebar Settings Menu */}
            {showSettings && (
                <div className="absolute inset-0 z-[510] flex justify-end">
                    <div className="absolute inset-0 bg-black/40" onClick={()=>setShowSettings(false)}></div>
                    <div className="w-[280px] h-full bg-white dark:bg-[#1C1C1E] z-[511] shadow-2xl animate-slide-left p-6">
                        <h3 className="font-bold text-lg mb-8">채팅방 설정</h3>
                        <div className="space-y-6">
                            <div className="flex justify-between items-center">
                                <span className="text-sm font-bold">알림 끄기</span>
                                <Toggle checked={isMuted} onChange={setIsMuted} />
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-sm font-bold">입력창 잠금</span>
                                <Toggle checked={isInputLocked} onChange={setIsInputLocked} />
                            </div>
                            <button className="w-full text-left py-3 text-sm font-bold border-t dark:border-gray-800 mt-4">채팅방 배경화면 설정</button>
                            <button className="w-full text-left py-3 text-sm font-bold border-t dark:border-gray-800">채팅 데이터 관리 (372.1MB)</button>
                            <button className="w-full text-left py-3 text-sm font-bold border-t dark:border-gray-800 text-red-500">채팅방 나가기</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
