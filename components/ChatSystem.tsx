import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useGame } from '../context/GameContext';
import { chatService } from '../services/firebase'; 
import { Button, Input, formatName } from './Shared';
import { User, Chat, ChatMessage, ChatReaction } from '../types';

interface ChatSystemProps {
    isOpen: boolean;
    onClose: () => void;
    onAttachTab: (tabName: string) => void;
}

export const ChatSystem: React.FC<ChatSystemProps> = ({ isOpen, onClose, onAttachTab }) => {
    const { db, currentUser, sendMessage, createChat, markChatRead, acceptAd, addReaction, deleteMessage, editMessage, setElementPicking } = useGame();
    
    // Navigation
    const [view, setView] = useState<'list' | 'chat' | 'new'>('list');
    const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
    const [listFilter, setListFilter] = useState<'all' | 'private' | 'group' | 'official'>('all');
    
    // Data
    const [chats, setChats] = useState<Record<string, Chat>>({});
    const [activeMessages, setActiveMessages] = useState<Record<string, ChatMessage>>({});
    
    // New Chat State
    const [inputText, setInputText] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedUsersForGroup, setSelectedUsersForGroup] = useState<string[]>([]);
    
    const [attachMenuOpen, setAttachMenuOpen] = useState(false);
    
    // Translations & Context
    const [translations, setTranslations] = useState<Record<string, string>>({});
    const [contextMenuMsgId, setContextMenuMsgId] = useState<string | null>(null);
    const [contextMenuPos, setContextMenuPos] = useState<'top' | 'bottom'>('top');
    const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
    const [editingMsg, setEditingMsg] = useState<ChatMessage | null>(null);
    
    // Swipe
    const touchStart = useRef<number | null>(null);
    const [swipedMsgId, setSwipedMsgId] = useState<string | null>(null);

    const scrollRef = useRef<HTMLDivElement>(null);

    // 1. Subscribe to Chat ROOM List (Metadata Only)
    useEffect(() => {
        if (!isOpen) return;
        const unsubscribe = chatService.subscribeToChatList((data) => {
            setChats(data);
        });
        return () => unsubscribe();
    }, [isOpen]);

    // 2. Subscribe to Messages (Only for active chat, limited to last 20)
    useEffect(() => {
        if (view === 'chat' && selectedChatId) {
            setActiveMessages({}); // Clear prev
            const unsubscribe = chatService.subscribeToMessages(selectedChatId, 20, (msgs) => {
                setActiveMessages(msgs);
            });
            return () => unsubscribe();
        }
    }, [view, selectedChatId]);

    // Reset view when closed
    useEffect(() => {
        if (!isOpen) {
            setTimeout(() => {
                setView('list');
                setSelectedChatId(null);
                setSelectedUsersForGroup([]);
                setActiveMessages({});
            }, 300);
        }
    }, [isOpen]);

    const users = Object.values(db.users) as User[];
    
    const myChats = useMemo(() => {
        if (!currentUser) return [];
        return (Object.values(chats) as Chat[])
            .filter((c: Chat) => c.participants && c.participants.includes(currentUser.name) && c.type !== 'feedback')
            .sort((a, b) => (b.lastTimestamp || 0) - (a.lastTimestamp || 0));
    }, [chats, currentUser]);

    // Filtered Chats
    const filteredChats = useMemo(() => {
        return myChats.filter(c => {
            const pName = c.type === 'group' ? c.groupName : c.participants.find(p => p !== currentUser?.name);
            const matchesSearch = pName?.toLowerCase().includes(searchTerm.toLowerCase());
            
            if (!matchesSearch) return false;

            if (listFilter === 'all') return true;
            if (listFilter === 'private') return c.type === 'private';
            if (listFilter === 'group') return c.type === 'group';
            if (listFilter === 'official') return (c.participants.includes('한국은행') || c.type === 'group' && c.groupName?.includes('채널'));
            
            return true;
        });
    }, [myChats, listFilter, searchTerm, currentUser]);

    const activeChat = selectedChatId ? chats[selectedChatId] : null;
    // Messages from local state, sorted
    const messages = useMemo(() => {
        return (Object.values(activeMessages) as ChatMessage[]).sort((a,b) => a.timestamp - b.timestamp);
    }, [activeMessages]);

    const partnerName = activeChat?.type === 'group' ? activeChat.groupName : activeChat?.participants.find(p => p !== currentUser?.name);
    const partner = users.find(u => u.name === partnerName);

    useEffect(() => {
        if (scrollRef.current && view === 'chat') {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
        if (selectedChatId && view === 'chat') {
            markChatRead(selectedChatId);
        }
    }, [messages.length, view, selectedChatId]);

    const handleStartChat = async () => {
        if (selectedUsersForGroup.length === 0) return;
        
        let chatId;
        if (selectedUsersForGroup.length === 1) {
            chatId = await createChat(selectedUsersForGroup, 'private');
        } else {
            const groupName = prompt("그룹 채팅방 이름을 입력하세요:", "새로운 그룹");
            if (!groupName) return;
            chatId = await createChat(selectedUsersForGroup, 'group', groupName);
        }
        
        if(chatId) {
            setSelectedChatId(chatId);
            setView('chat');
            setSearchTerm('');
            setSelectedUsersForGroup([]);
        }
    };

    const toggleUserSelection = (userName: string) => {
        if (selectedUsersForGroup.includes(userName)) {
            setSelectedUsersForGroup(prev => prev.filter(u => u !== userName));
        } else {
            setSelectedUsersForGroup(prev => [...prev, userName]);
        }
    };

    const handleSend = async () => {
        if (!inputText.trim() || !selectedChatId) return;
        
        if (editingMsg) {
            await editMessage(selectedChatId, editingMsg.id, inputText);
            setEditingMsg(null);
        } else {
            await sendMessage(selectedChatId, inputText, undefined, replyingTo?.id);
        }
        setInputText('');
        setReplyingTo(null);
    };

    const handleSharedElementReply = async (elementData: any, newVal: string) => {
        if (!selectedChatId) return;
        await sendMessage(selectedChatId, `[입력] ${elementData.label}: ${newVal}`, {
            type: 'ui_element',
            value: elementData.label,
            data: [{ ...elementData, value: newVal }]
        });
    };

    const handleAttach = (type: 'tab' | 'id_card' | 'ui_element') => {
        if (!selectedChatId) return;
        if (type === 'tab') {
            const tab = prompt("첨부할 탭 이름을 입력하세요 (예: 환전, 대출):");
            if (tab) {
                sendMessage(selectedChatId, `${tab} 탭을 확인해주세요.`, { type: 'tab', value: tab });
            }
        } else if (type === 'id_card') {
            if (currentUser?.idCard?.status === 'active') {
                sendMessage(selectedChatId, "신분증을 제시합니다.", { type: 'id_card', value: currentUser.name, data: currentUser.idCard });
            } else {
                alert("유효한 신분증이 없습니다.");
            }
        } else if (type === 'ui_element') {
            setAttachMenuOpen(false);
            onClose(); // Close chat to pick
            setElementPicking(true, (data) => {
                if(data && data.length > 0) {
                    const preview = data[0].value;
                    if (selectedChatId) {
                        sendMessage(selectedChatId, `[공유] ${data[0].label}: ${preview}`, { 
                            type: 'ui_element', 
                            value: data[0].label, 
                            data: data 
                        });
                    }
                }
            });
            return;
        }
        setAttachMenuOpen(false);
    };

    const handleContextMenu = (e: React.MouseEvent, msgId: string) => {
        e.preventDefault();
        if (e.clientY < window.innerHeight / 2) {
            setContextMenuPos('bottom');
        } else {
            setContextMenuPos('top');
        }
        setContextMenuMsgId(msgId);
    };

    const handleReaction = (msgId: string, type: ChatReaction['type']) => {
        if(selectedChatId) {
            addReaction(selectedChatId, msgId, { type, sender: currentUser!.name });
            setContextMenuMsgId(null);
        }
    };

    const handleTranslate = (msg: ChatMessage) => {
        const result = `(번역) ${msg.text}`; 
        setTranslations(prev => ({ ...prev, [msg.id]: result }));
        setContextMenuMsgId(null);
    };

    const handleEditStart = (msg: ChatMessage) => {
        setEditingMsg(msg);
        setInputText(msg.text);
        setContextMenuMsgId(null);
    };

    const handleTouchStart = (e: React.TouchEvent, msgId: string) => {
        touchStart.current = e.targetTouches[0].clientX;
    };
    
    const handleTouchEnd = (e: React.TouchEvent, msgId: string) => {
        if (touchStart.current === null) return;
        const touchEnd = e.changedTouches[0].clientX;
        const diff = touchStart.current - touchEnd;

        if (diff > 50) { 
            setSwipedMsgId(prev => prev === msgId ? null : msgId);
        } else if (diff < -50) { 
            const msg = messages.find(m => m.id === msgId);
            if(msg) setReplyingTo(msg);
        }
        touchStart.current = null;
    };

    const formatTime = (ts: number) => {
        const date = new Date(ts);
        const now = new Date();
        const diff = now.getTime() - ts;
        const isToday = date.toDateString() === now.toDateString();
        
        if (isToday) {
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } else if (diff < 7 * 24 * 60 * 60 * 1000) {
            const days = ['일', '월', '화', '수', '목', '금', '토'];
            return days[date.getDay()] + '요일';
        } else {
            return date.toLocaleDateString();
        }
    };

    const renderMessageContent = (msg: ChatMessage, isLastInGroup: boolean, isMine: boolean) => {
        if (msg.isDeleted) {
            return (
                <div className="flex w-full mb-1 justify-center">
                    <span className="text-xs text-gray-500 italic">삭제된 메시지입니다.</span>
                </div>
            );
        }

        const isContextOpen = contextMenuMsgId === msg.id;
        const reactions = Object.values(msg.reactions || {});
        const replySource = msg.replyTo ? messages.find(m => m.id === msg.replyTo) : null;
        const translatedText = translations[msg.id];
        const isSwiped = swipedMsgId === msg.id;

        return (
            <div 
                className={`relative flex w-full mb-1 group ${isMine ? 'justify-end' : 'justify-start'}`}
                onContextMenu={(e) => handleContextMenu(e, msg.id)}
                onTouchStart={(e) => handleTouchStart(e, msg.id)}
                onTouchEnd={(e) => handleTouchEnd(e, msg.id)}
            >
                {!isMine && (
                    <div className="flex flex-col justify-end mr-2 w-8 h-full">
                        {isLastInGroup && (
                            <div className="w-8 h-8 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center overflow-hidden">
                                {partner?.profilePic ? <img src={partner.profilePic} className="w-full h-full object-cover" /> : <span className="text-white text-xs">{formatName(msg.sender)[0]}</span>}
                            </div>
                        )}
                    </div>
                )}

                <div className={`relative max-w-[75%] flex flex-col items-${isMine ? 'end' : 'start'} transition-transform duration-200 ${isSwiped ? '-translate-x-12' : ''}`}>
                    {replySource && (
                        <div className={`text-xs mb-1 px-2 opacity-70 ${isMine ? 'text-right' : 'text-left'}`}>
                            <span className="font-bold mr-1">{formatName(replySource.sender)}</span>
                            <span className="truncate">{replySource.text}</span>
                        </div>
                    )}

                    <div 
                        className={`
                            px-4 py-2 text-[15px] leading-snug break-words relative shadow-sm transition-all cursor-pointer
                            ${isMine 
                                ? 'bg-[#007AFF] text-white rounded-[20px] rounded-br-sm' 
                                : 'bg-[#E5E5EA] dark:bg-[#262626] text-black dark:text-white rounded-[20px] rounded-bl-sm'
                            }
                        `}
                        onClick={(e) => handleContextMenu(e, isContextOpen ? '' : msg.id)}
                    >
                        {msg.attachment && (
                            <div className="mb-2 p-2 bg-white/20 dark:bg-black/20 rounded text-sm">
                                {msg.attachment.type === 'tab' && (
                                    <button onClick={() => onAttachTab(msg.attachment!.value)} className="font-bold underline flex items-center gap-1">
                                        📎 {msg.attachment.value}
                                    </button>
                                )}
                                {msg.attachment.type === 'ad_proposal' && (
                                    <div className="space-y-2">
                                        <p className="font-bold">📢 광고 제안</p>
                                        <img src={msg.attachment.data.imageUrl} className="w-full h-24 object-cover rounded" />
                                        <p>₩{msg.attachment.data.fee.toLocaleString()}</p>
                                        {!isMine && (
                                            <Button onClick={() => acceptAd(msg.attachment!.data)} className="w-full text-xs py-1">수락</Button>
                                        )}
                                    </div>
                                )}
                                {msg.attachment.type === 'id_card' && (
                                    <div className="w-48 bg-white text-black p-2 rounded border border-gray-300">
                                        <div className="text-[10px] font-bold text-gray-500 mb-1">ID CARD</div>
                                        <div className="font-bold text-sm">{formatName(msg.attachment.value)}</div>
                                        <div className="text-[10px] truncate">{msg.attachment.data.address}</div>
                                    </div>
                                )}
                                {msg.attachment.type === 'ui_element' && (
                                    <div className="w-56 bg-white dark:bg-[#1C1C1E] p-3 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
                                        {msg.attachment.data.map((el: any, i: number) => (
                                            <div key={i} className="mb-3 last:mb-0">
                                                <div className="text-[10px] text-green-600 dark:text-green-400 font-mono mb-0.5 truncate bg-black/5 dark:bg-white/5 p-1 rounded">
                                                    {el.path}
                                                </div>
                                                <div className="text-xs font-bold text-gray-800 dark:text-gray-200 mt-1 mb-1">{el.label}</div>
                                                <div className="flex gap-1">
                                                    <input 
                                                        defaultValue={el.value} 
                                                        className="text-sm bg-gray-100 dark:bg-black p-1 rounded flex-1 border border-gray-200 dark:border-gray-800 w-full text-black dark:text-white min-w-0"
                                                        id={`shared-input-${msg.id}-${i}`}
                                                    />
                                                    <button 
                                                        className="text-[10px] bg-blue-500 text-white px-2 rounded hover:bg-blue-600 whitespace-nowrap"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            const val = (document.getElementById(`shared-input-${msg.id}-${i}`) as HTMLInputElement).value;
                                                            handleSharedElementReply(el, val);
                                                        }}
                                                    >
                                                        공유
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                        <p>{msg.text} {msg.isEdited && <span className="text-[10px] opacity-60">(edited)</span>}</p>
                        
                        {translatedText && (
                            <div className="mt-2 pt-2 border-t border-black/10 dark:border-white/10 text-sm opacity-90 italic">
                                {translatedText}
                            </div>
                        )}
                    </div>

                    {reactions.length > 0 && (
                        <div className={`absolute -bottom-2 ${isMine ? 'right-0' : 'left-0'} flex bg-white dark:bg-[#2C2C2E] rounded-full px-1 shadow-md border dark:border-[#3A3A3C] z-10`}>
                            {reactions.map((r, i) => {
                                const map: any = { love: '❤️', like: '👍', dislike: '👎', laugh: '😂', emphasize: '‼️', question: '❓' };
                                return <span key={i} className="text-xs">{map[r.type]}</span>;
                            })}
                        </div>
                    )}
                    
                    {isSwiped && (
                        <div className="absolute top-1/2 -right-16 -translate-y-1/2 text-xs text-gray-500 font-medium whitespace-nowrap">
                            {new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                        </div>
                    )}
                </div>

                {isContextOpen && (
                    <>
                        <div className="fixed inset-0 z-40 bg-black/10 backdrop-blur-[2px]" onClick={() => setContextMenuMsgId(null)}></div>
                        <div className={`absolute z-50 ${isMine ? 'right-0' : 'left-10'} ${contextMenuPos === 'top' ? 'bottom-full mb-2 origin-bottom' : 'top-full mt-2 origin-top'} flex flex-col gap-2 animate-scale-in`}>
                            <div className="bg-white dark:bg-[#2C2C2E] p-2 rounded-full shadow-xl flex gap-3 text-2xl">
                                <button onClick={() => handleReaction(msg.id, 'love')}>❤️</button>
                                <button onClick={() => handleReaction(msg.id, 'like')}>👍</button>
                                <button onClick={() => handleReaction(msg.id, 'dislike')}>👎</button>
                                <button onClick={() => handleReaction(msg.id, 'laugh')}>😂</button>
                                <button onClick={() => handleReaction(msg.id, 'emphasize')}>‼️</button>
                                <button onClick={() => handleReaction(msg.id, 'question')}>❓</button>
                            </div>

                            <div className="bg-white/90 dark:bg-[#252525]/90 backdrop-blur-xl rounded-xl overflow-hidden shadow-2xl border border-gray-200 dark:border-[#444] min-w-[200px]">
                                <button className="w-full text-left px-4 py-3 text-black dark:text-white hover:bg-gray-100 dark:hover:bg-[#3A3A3C] flex items-center justify-between border-b border-gray-200 dark:border-[#3A3A3C]" onClick={() => { setReplyingTo(msg); setContextMenuMsgId(null); }}>
                                    <span>답장</span> <span>↩️</span>
                                </button>
                                <button className="w-full text-left px-4 py-3 text-black dark:text-white hover:bg-gray-100 dark:hover:bg-[#3A3A3C] flex items-center justify-between border-b border-gray-200 dark:border-[#3A3A3C]" onClick={() => { navigator.clipboard.writeText(msg.text); setContextMenuMsgId(null); }}>
                                    <span>복사</span> <span>📋</span>
                                </button>
                                <button className="w-full text-left px-4 py-3 text-black dark:text-white hover:bg-gray-100 dark:hover:bg-[#3A3A3C] flex items-center justify-between border-b border-gray-200 dark:border-[#3A3A3C]" onClick={() => handleTranslate(msg)}>
                                    <span>번역</span> <span>文</span>
                                </button>
                                {isMine && (
                                    <>
                                        <button className="w-full text-left px-4 py-3 text-black dark:text-white hover:bg-gray-100 dark:hover:bg-[#3A3A3C] flex items-center justify-between border-b border-gray-200 dark:border-[#3A3A3C]" onClick={() => handleEditStart(msg)}>
                                            <span>수정</span> <span>✎</span>
                                        </button>
                                        <button className="w-full text-left px-4 py-3 text-red-500 hover:bg-gray-100 dark:hover:bg-[#3A3A3C] flex items-center justify-between" onClick={() => { if(selectedChatId) deleteMessage(selectedChatId, msg.id); setContextMenuMsgId(null); }}>
                                            <span>삭제</span> <span>🗑️</span>
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    </>
                )}
            </div>
        );
    };

    const groupedUsers = useMemo(() => {
        const filtered = users.filter(u => u.name !== currentUser?.name && formatName(u.name).toLowerCase().includes(searchTerm.toLowerCase()));
        return {
            '시민': filtered.filter(u => u.type === 'citizen' && !u.isPresident && !u.govtBranch),
            '정부/공무원': filtered.filter(u => u.type === 'government' || u.type === 'official' || u.subType === 'govt' || u.isPresident || u.govtBranch),
            '한국은행/관리자': filtered.filter(u => u.type === 'admin' || u.type === 'root'),
            '선생님': filtered.filter(u => u.subType === 'teacher' || u.type === 'teacher'),
            '마트/사업자': filtered.filter(u => u.type === 'mart')
        };
    }, [users, searchTerm, currentUser]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-y-0 right-0 w-full sm:w-[450px] bg-white dark:bg-black text-black dark:text-white shadow-2xl z-[100] border-l border-gray-200 dark:border-[#333] flex flex-col transition-transform transform translate-x-0 font-sans sm:bottom-0 bottom-[60px]">
            {/* VIEW 1: Chat List */}
            {view === 'list' && (
                <div className="flex flex-col h-full animate-fade-in">
                    <div className="p-4 border-b border-gray-200 dark:border-[#333] flex justify-between items-center bg-white/80 dark:bg-black/80 backdrop-blur-md sticky top-0 z-10">
                        <button onClick={onClose} className="text-blue-500 font-medium">닫기</button>
                        <h2 className="text-lg font-bold">메시지</h2>
                        <button onClick={() => setView('new')} className="w-8 h-8 flex items-center justify-center text-blue-500 rounded-full hover:bg-gray-100 dark:hover:bg-[#2C2C2E] transition-colors">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                        </button>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto">
                        <div className="px-4 py-2 space-y-2">
                            <Input placeholder="검색" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="bg-gray-100 dark:bg-[#1C1C1E] border-none text-center" />
                            <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
                                {['all', 'private', 'group', 'official'].map((f: any) => (
                                    <button 
                                        key={f} 
                                        onClick={() => setListFilter(f)}
                                        className={`px-3 py-1 text-xs rounded-full whitespace-nowrap transition-colors ${listFilter === f ? 'bg-black dark:bg-white text-white dark:text-black' : 'bg-gray-100 dark:bg-[#1C1C1E] text-gray-500'}`}
                                    >
                                        {f === 'all' ? '전체' : f === 'private' ? '개인' : f === 'group' ? '그룹' : '공식'}
                                    </button>
                                ))}
                            </div>
                        </div>
                        
                        {filteredChats.map(chat => {
                            const pName = chat.type === 'group' ? chat.groupName : chat.participants.find(p => p !== currentUser?.name);
                            const pUser = users.find(u => u.name === pName);
                            // Only use metadata, no deep message access
                            const lastMsgText = chat.lastMessage || '대화 내역이 없습니다.';
                            
                            return (
                                <div key={chat.id} onClick={() => { setSelectedChatId(chat.id); setView('chat'); }} className="flex items-center gap-3 p-4 border-b border-gray-100 dark:border-[#2C2C2E] cursor-pointer hover:bg-gray-50 dark:hover:bg-[#1C1C1E] active:bg-gray-200 dark:active:bg-[#2C2C2E] transition-colors">
                                    <div className="w-12 h-12 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center overflow-hidden flex-shrink-0">
                                        {chat.type === 'group' ? '🏛️' : (pUser?.profilePic ? <img src={pUser.profilePic} className="w-full h-full object-cover"/> : <span className="text-white font-bold">{formatName(pName)?.[0]}</span>)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex justify-between items-baseline mb-1">
                                            <h3 className="font-bold text-base truncate">{formatName(pName)}</h3>
                                            <span className={`text-xs text-gray-400`}>
                                                {chat.lastTimestamp ? formatTime(chat.lastTimestamp) : ''}
                                            </span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <p className={`text-sm truncate max-w-[90%] line-clamp-2 text-gray-500 dark:text-gray-400`}>
                                                {lastMsgText}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* VIEW 2: New Chat Selection - unchanged layout */}
            {view === 'new' && (
                <div className="flex flex-col h-full animate-slide-up bg-gray-50 dark:bg-black">
                    <div className="p-4 border-b border-gray-200 dark:border-[#333] flex justify-between items-center bg-white/80 dark:bg-black/80 backdrop-blur-md sticky top-0 z-10">
                        <h2 className="text-lg font-bold">새로운 메시지</h2>
                        <div className="flex gap-4">
                            {selectedUsersForGroup.length > 0 && (
                                <button onClick={handleStartChat} className="text-green-600 font-bold animate-fade-in">
                                    {selectedUsersForGroup.length > 1 ? '그룹 생성' : '채팅 시작'}
                                </button>
                            )}
                            <button onClick={() => setView('list')} className="text-blue-500 font-medium">취소</button>
                        </div>
                    </div>
                    <div className="p-2 bg-white dark:bg-black sticky top-[60px] z-10">
                        <div className="flex items-center gap-2 px-2 py-1 bg-gray-100 dark:bg-[#1C1C1E] rounded-lg">
                            <span className="text-gray-400">To:</span>
                            <input autoFocus placeholder="이름 검색" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="bg-transparent border-none outline-none flex-1 py-1" />
                        </div>
                        {selectedUsersForGroup.length > 0 && (
                            <div className="flex gap-2 mt-2 overflow-x-auto pb-2">
                                {selectedUsersForGroup.map(u => (
                                    <span key={u} className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs flex items-center gap-1">
                                        {formatName(u)} <button onClick={() => toggleUserSelection(u)}>×</button>
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="flex-1 overflow-y-auto px-4 py-2">
                        {Object.entries(groupedUsers).map(([role, list]) => (
                            <div key={role} className="mb-6">
                                <h4 className="text-xs font-bold text-gray-500 uppercase mb-2 ml-2">
                                    {role}
                                </h4>
                                <div className="bg-white dark:bg-[#1C1C1E] rounded-xl overflow-hidden">
                                    {/* @ts-ignore */}
                                    {list.map((u: User, i: number) => (
                                        <div key={u.name} onClick={() => toggleUserSelection(u.name)} className="flex items-center gap-3 p-3 hover:bg-gray-100 dark:hover:bg-[#2C2C2E] cursor-pointer border-b border-gray-100 dark:border-[#2C2C2E] last:border-0">
                                            <div className={`w-5 h-5 border-2 rounded-full flex items-center justify-center ${selectedUsersForGroup.includes(u.name) ? 'bg-blue-500 border-blue-500' : 'border-gray-400'}`}>
                                                {selectedUsersForGroup.includes(u.name) && <span className="text-white text-xs">✓</span>}
                                            </div>
                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold overflow-hidden bg-gray-500`}>
                                                {u.profilePic ? <img src={u.profilePic} className="w-full h-full object-cover" /> : formatName(u.name)[0]}
                                            </div>
                                            <span className="font-bold text-sm">{formatName(u.name)}</span>
                                            <span className="text-xs text-gray-400 ml-auto">{u.customJob || u.type}</span>
                                        </div>
                                    ))}
                                    {/* @ts-ignore */}
                                    {list.length === 0 && <div className="p-3 text-sm text-gray-400">사용자 없음</div>}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* VIEW 3: Conversation */}
            {view === 'chat' && selectedChatId && (
                <div className="flex flex-col h-full bg-white dark:bg-black relative animate-fade-in">
                    {/* Header */}
                    <div className="h-14 bg-white/80 dark:bg-[#121212]/80 backdrop-blur-md border-b border-gray-200 dark:border-[#333] flex items-center px-2 relative z-20 shrink-0">
                        <button onClick={() => setView('list')} className="flex items-center text-blue-500 pr-2">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
                            <span className="text-sm font-medium">메시지</span>
                        </button>
                        
                        <div className="flex flex-col items-center flex-1 pr-8">
                            <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-full bg-gray-300 dark:bg-gray-500 overflow-hidden flex items-center justify-center">
                                    {activeChat?.type === 'group' ? '🏛️' : (partner?.profilePic ? <img src={partner.profilePic} className="w-full h-full object-cover"/> : <span className="text-[10px]">{formatName(partnerName)?.[0]}</span>)}
                                </div>
                                <span className="text-sm font-bold text-black dark:text-white">
                                    {formatName(partnerName)} {activeChat?.type === 'group' && `(${activeChat.participants.length})`}
                                </span>
                            </div>
                        </div>
                    </div>
                    
                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-1 flex flex-col scrollbar-hide bg-white dark:bg-black" ref={scrollRef}>
                        {messages.map((msg, i) => {
                            const isMine = msg.sender === currentUser?.name;
                            const prevMsg = messages[i - 1];
                            const isSequence = prevMsg && prevMsg.sender === msg.sender;
                            const nextMsg = messages[i + 1];
                            const isLastInGroup = !nextMsg || nextMsg.sender !== msg.sender;
                            
                            return (
                                <React.Fragment key={msg.id}>
                                    {!isSequence && <div className="mt-3"></div>}
                                    {renderMessageContent(msg, isLastInGroup, isMine)}
                                </React.Fragment>
                            );
                        })}
                    </div>

                    {/* Reply/Edit Banner */}
                    {(replyingTo || editingMsg) && (
                        <div className="bg-gray-100 dark:bg-[#1C1C1E] p-2 flex justify-between items-center border-t border-gray-200 dark:border-[#333] shrink-0">
                            <div className="text-sm truncate max-w-[80%]">
                                <span className="font-bold mr-2 text-[#007AFF]">{editingMsg ? 'Editing:' : `Reply to ${formatName(replyingTo?.sender)}:`}</span>
                                <span className="text-gray-500">{editingMsg ? editingMsg.text : replyingTo?.text}</span>
                            </div>
                            <button onClick={() => { setReplyingTo(null); setEditingMsg(null); setInputText(''); }} className="text-gray-500 hover:text-red-500">✕</button>
                        </div>
                    )}

                    {/* Input Area */}
                    <div className="p-3 bg-white dark:bg-black flex items-end gap-3 z-20 pb-6 border-t border-gray-200 dark:border-none shrink-0">
                        <button onClick={() => setAttachMenuOpen(!attachMenuOpen)} className="w-8 h-8 rounded-full bg-gray-200 dark:bg-[#3A3A3C] text-gray-500 dark:text-[#8E8E93] flex items-center justify-center text-xl mb-1 shrink-0 transition-colors">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                        </button>
                        
                        {attachMenuOpen && (
                            <div className="absolute bottom-20 left-4 bg-white/90 dark:bg-[#252525]/90 backdrop-blur-xl rounded-xl overflow-hidden shadow-2xl border border-gray-200 dark:border-[#444] animate-scale-in flex flex-col min-w-[200px]">
                                <button onClick={() => handleAttach('tab')} className="text-left px-4 py-3 hover:bg-gray-100 dark:hover:bg-[#3A3A3C] flex items-center gap-3 border-b border-gray-200 dark:border-[#3A3A3C] text-black dark:text-white">
                                    <span>📑</span> 기능 탭 공유
                                </button>
                                <button onClick={() => handleAttach('id_card')} className="text-left px-4 py-3 hover:bg-gray-100 dark:hover:bg-[#3A3A3C] flex items-center gap-3 text-black dark:text-white border-b border-gray-200 dark:border-[#3A3A3C">
                                    <span>🪪</span> 신분증 보내기
                                </button>
                                <button onClick={() => handleAttach('ui_element')} className="text-left px-4 py-3 hover:bg-gray-100 dark:hover:bg-[#3A3A3C] flex items-center gap-3 text-black dark:text-white">
                                    <span>👆</span> 화면 요소 선택 공유
                                </button>
                            </div>
                        )}

                        <div className="flex-1 min-h-[36px] bg-gray-100 dark:bg-[#1C1C1E] rounded-[18px] flex items-center px-4 border border-gray-200 dark:border-[#333]">
                            <input 
                                value={inputText} 
                                onChange={e => setInputText(e.target.value)} 
                                onKeyDown={e => e.key === 'Enter' && handleSend()}
                                placeholder="메시지 보내기" 
                                className="bg-transparent border-none outline-none text-black dark:text-white w-full text-[15px] placeholder-gray-400 dark:placeholder-[#666]"
                            />
                        </div>
                        
                        {inputText && (
                            <button onClick={handleSend} className="w-8 h-8 rounded-full bg-[#007AFF] flex items-center justify-center mb-1 shrink-0 animate-scale-in">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};