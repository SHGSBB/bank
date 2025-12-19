
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useGame } from '../context/GameContext';
import { chatService, fetchAllUsers } from '../services/firebase'; 
import { Button, Input, LineIcon, Modal, Toggle, formatName, formatSmartMoney } from './Shared';
import { Chat, ChatMessage, User } from '../types';

export const ChatSystem: React.FC<{ isOpen: boolean; onClose: () => void; onAttachTab?: (tab: string) => void }> = ({ isOpen, onClose, onAttachTab }) => {
    const { currentUser, sendMessage, db, serverAction, showModal, showPinModal, notify, isAdminMode } = useGame();
    const [view, setView] = useState<'list' | 'chat'>('list');
    const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
    const [threadRootId, setThreadRootId] = useState<string | null>(null);
    const [inputText, setInputText] = useState('');
    const [chats, setChats] = useState<Record<string, Chat>>({});
    const [activeMessages, setActiveMessages] = useState<Record<string, ChatMessage>>({});
    
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, msgId: string } | null>(null);
    const [searchChat, setSearchChat] = useState('');

    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isOpen) return;
        return chatService.subscribeToChatList(setChats);
    }, [isOpen]);

    const chatList = useMemo(() => {
        const all = (Object.values(chats) as Chat[]).sort((a,b) => (b.lastTimestamp || 0) - (a.lastTimestamp || 0));
        const filtered = isAdminMode 
            ? all 
            : all.filter(c => c.participants?.includes(currentUser?.name || ''));
        
        if (searchChat.trim()) {
            const term = searchChat.toLowerCase();
            return filtered.filter(c => 
                (c.groupName || "").toLowerCase().includes(term) || 
                c.participants?.some(p => p.toLowerCase().includes(term))
            );
        }
        return filtered;
    }, [chats, isAdminMode, currentUser, searchChat]);

    useEffect(() => {
        if (view === 'chat' && selectedChatId) {
            return chatService.subscribeToMessages(selectedChatId, 100, setActiveMessages);
        }
    }, [view, selectedChatId]);

    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [activeMessages, threadRootId]);

    const messages = useMemo(() => {
        const all = (Object.values(activeMessages) as ChatMessage[]).sort((a,b) => a.timestamp - b.timestamp);
        if (threadRootId) {
            return all.filter(m => m.id === threadRootId || m.threadId === threadRootId);
        }
        return all.filter(m => !m.threadId);
    }, [activeMessages, threadRootId]);

    const handleSendMessage = async () => {
        if (!selectedChatId || !inputText.trim()) return;
        const text = inputText; setInputText('');
        const senderName = isAdminMode ? "관리자" : currentUser!.name;
        const msg: ChatMessage = { 
            id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, 
            sender: senderName, 
            text, 
            timestamp: Date.now(),
            threadId: threadRootId || undefined
        };
        await chatService.sendMessage(selectedChatId, msg);
    };

    const renderMessage = (msg: ChatMessage, index: number) => {
        const myIdentity = isAdminMode ? "관리자" : currentUser?.name;
        const isMine = msg.sender === myIdentity;
        const isAdminMsg = msg.sender === '관리자';
        const hasLine = threadRootId && index > 0;

        return (
            <div key={msg.id} className={`flex flex-col mb-4 relative ${isMine ? 'items-end' : 'items-start'} ${hasLine ? 'ml-6' : ''}`}
                onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, msgId: msg.id }); }}>
                {hasLine && <div className="absolute left-[-16px] top-[-24px] bottom-[50%] w-4 border-l-2 border-b-2 border-gray-300 dark:border-gray-700 rounded-bl-xl"></div>}
                
                <div className="flex items-center gap-1 mb-1">
                    <div className={`w-6 h-6 rounded-lg overflow-hidden text-[10px] flex items-center justify-center font-bold ${isAdminMsg ? 'bg-red-600 text-white' : 'bg-gray-200 text-gray-600'}`}>
                        {isAdminMsg ? '管' : (db.users[msg.sender]?.profilePic ? <img src={db.users[msg.sender].profilePic} className="w-full h-full object-cover" alt="p"/> : msg.sender[0])}
                    </div>
                    <span className={`text-[11px] font-bold ${isAdminMsg ? 'text-red-500' : 'text-gray-500'}`}>{msg.sender}</span>
                </div>
                
                <div className="flex items-end gap-1">
                    {isMine && <span className="text-[9px] text-gray-400 mb-1">{new Date(msg.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>}
                    <div className={`max-w-[260px] px-4 py-3 rounded-[20px] text-sm shadow-sm ${
                        isMine ? 'bg-[#FEE500] text-black rounded-tr-none' : (isAdminMsg ? 'bg-red-50 dark:bg-red-900/20 border-red-200 text-red-700 rounded-tl-none border' : 'bg-[#2D2D2D] text-white border border-gray-800 rounded-tl-none')
                    }`}>
                        <p className="whitespace-pre-wrap leading-snug">{msg.text}</p>
                    </div>
                    {!isMine && <span className="text-[9px] text-gray-400 mb-1">{new Date(msg.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>}
                </div>
            </div>
        );
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-y-0 right-0 z-[5000] w-full sm:w-[400px] bg-[#121212] flex flex-col shadow-2xl border-l border-gray-800 overflow-hidden animate-slide-left">
            {/* Header */}
            <div className="h-16 bg-[#1C1C1E] flex items-center px-4 justify-between border-b border-gray-800 shrink-0">
                <div className="flex items-center gap-2">
                    {view === 'chat' && (
                        <button onClick={() => threadRootId ? setThreadRootId(null) : setView('list')} className="p-2 hover:bg-gray-800 rounded-full transition-colors">
                            <LineIcon icon="arrow-left" className="w-5 h-5 text-white" />
                        </button>
                    )}
                    <h2 className="font-black text-lg text-white">
                        {isAdminMode && view === 'list' ? "통합 관제" : (view === 'list' ? "메시지" : (chats[selectedChatId!]?.groupName || chats[selectedChatId!]?.participants.filter(p=>p!==currentUser?.name).join(', ') || "채팅"))}
                    </h2>
                </div>
                <button onClick={onClose} className="p-2 hover:bg-red-900/20 text-gray-500 hover:text-red-500 rounded-full transition-colors">
                    <LineIcon icon="close" className="w-6 h-6" />
                </button>
            </div>

            {view === 'list' ? (
                <div className="flex-1 flex flex-col bg-[#121212] overflow-hidden">
                    <div className="p-4 border-b border-gray-800">
                        <Input 
                            placeholder={isAdminMode ? "방 이름 또는 참여자 검색" : "대화방 검색"} 
                            value={searchChat} 
                            onChange={e => setSearchChat(e.target.value)} 
                            className="h-12 text-sm rounded-xl bg-[#1C1C1E] border-none"
                        />
                    </div>
                    <div className="flex-1 overflow-y-auto">
                        {chatList.map((chat: Chat) => (
                            <div key={chat.id} onClick={() => { setSelectedChatId(chat.id); setView('chat'); }} className="p-5 border-b border-gray-900 flex items-center gap-4 hover:bg-[#1C1C1E] cursor-pointer transition-colors">
                                <div className="w-14 h-14 rounded-[20px] bg-gray-800 flex items-center justify-center font-black text-2xl text-gray-400">
                                    {formatName(chat.groupName || chat.participants.find(p=>p!==currentUser?.name))[0]}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-start">
                                        <p className="font-bold text-white truncate">{chat.groupName || chat.participants.join(', ')}</p>
                                        <span className="text-[10px] text-gray-600 shrink-0">{chat.lastTimestamp ? new Date(chat.lastTimestamp).toLocaleDateString() : ''}</span>
                                    </div>
                                    <p className="text-xs text-gray-500 truncate mt-1">{chat.lastMessage || "대화가 없습니다."}</p>
                                </div>
                            </div>
                        ))}
                        {chatList.length === 0 && <div className="text-center py-20 text-gray-600 text-sm">참여 중인 대화방이 없습니다.</div>}
                    </div>
                </div>
            ) : (
                <>
                    <div className="flex-1 overflow-y-auto p-5 bg-[#121212] scroll-smooth" ref={scrollRef}>
                        {isAdminMode && <div className="bg-red-500/10 border border-red-500/20 p-2 rounded-lg text-[9px] font-bold text-red-500 text-center mb-4 uppercase tracking-widest">Global Monitoring Mode</div>}
                        {threadRootId && (
                            <div className="mb-6 p-4 bg-white/5 rounded-[22px] border border-white/5">
                                <p className="text-[10px] font-bold text-gray-600 mb-2 uppercase tracking-widest">Original Message</p>
                                {renderMessage(activeMessages[threadRootId], -1)}
                            </div>
                        )}
                        {messages.filter(m => m.id !== threadRootId).map((m, i) => renderMessage(m, i))}
                    </div>
                    
                    <div className="p-4 bg-[#1C1C1E] border-t border-gray-800 shrink-0">
                        <div className="flex items-center gap-2">
                            <div className="flex-1 flex items-center bg-[#2D2D2D] rounded-[22px] px-4 py-2">
                                <textarea 
                                    className="flex-1 bg-transparent border-none focus:ring-0 text-sm p-1 max-h-24 resize-none outline-none text-white"
                                    placeholder={isAdminMode ? "관리자로 메시지 전송..." : "메시지를 입력하세요..."}
                                    value={inputText}
                                    onChange={e => setInputText(e.target.value)}
                                    rows={1}
                                    onKeyDown={(e) => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
                                />
                                <button onClick={handleSendMessage} className={`p-2 rounded-full transition-all ${inputText.trim() ? (isAdminMode ? 'bg-red-600 text-white' : 'bg-[#FEE500] text-black') : 'text-gray-500'}`}>
                                    <LineIcon icon="send" className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                    </div>
                </>
            )}

            {contextMenu && (
                <div className="fixed inset-0 z-[6000]" onClick={() => setContextMenu(null)}>
                    <div className="absolute bg-[#252525] rounded-xl shadow-2xl border border-gray-800 p-2 min-w-[140px]" style={{ left: contextMenu.x, top: contextMenu.y }}>
                        <button onClick={() => { setThreadRootId(contextMenu.msgId); setContextMenu(null); }} className="w-full text-left px-4 py-3 text-sm font-bold text-white hover:bg-gray-800 rounded-lg transition-colors">스레드 답글</button>
                        {isAdminMode && <button className="w-full text-left px-4 py-3 text-sm font-bold hover:bg-red-900/20 text-red-500 rounded-lg">메시지 삭제</button>}
                    </div>
                </div>
            )}
            <style>{`
                @keyframes slide-left {
                    from { transform: translateX(100%); }
                    to { transform: translateX(0); }
                }
                .animate-slide-left {
                    animation: slide-left 0.3s ease-out;
                }
            `}</style>
        </div>
    );
};
