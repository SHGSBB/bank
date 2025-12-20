
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useGame } from '../context/GameContext';
import { chatService, fetchAllUsers } from '../services/firebase'; 
import { Button, Input, LineIcon, Modal, Toggle, formatName, FileInput, Card } from './Shared';
import { Chat, ChatMessage, User } from '../types';

export const ChatSystem: React.FC<{ isOpen: boolean; onClose: () => void; onAttachTab?: (tab: string) => void }> = ({ isOpen, onClose, onAttachTab }) => {
    const { currentUser, db, isAdminMode, notify, showModal, showConfirm } = useGame();
    const [view, setView] = useState<'list' | 'chat'>('list');
    const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
    const [inputText, setInputText] = useState('');
    const [chats, setChats] = useState<Record<string, Chat>>({});
    const [activeMessages, setActiveMessages] = useState<Record<string, ChatMessage>>({});
    const [searchChat, setSearchChat] = useState('');
    const [searchInRoom, setSearchInRoom] = useState('');
    const [userCache, setUserCache] = useState<Record<string, User>>({});

    // UI States
    const [showAttachMenu, setShowAttachMenu] = useState(false);
    const [showDrawer, setShowDrawer] = useState(false);
    const [longPressMenu, setLongPressMenu] = useState<{ x: number, y: number, item: any, type: 'message' | 'chat', align: 'top' | 'bottom' } | null>(null);
    const [categoryFilter, setCategoryFilter] = useState<'all' | 'friend' | 'group'>('all');
    const [showNewChatModal, setShowNewChatModal] = useState(false);
    const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
    const [selectedUserForShare, setSelectedUserForShare] = useState<User | null>(null);
    const [showUserShareModal, setShowUserShareModal] = useState(false);
    const [transferAmount, setTransferAmount] = useState('');
    const [showTransferModal, setShowTransferModal] = useState<'send'|'request'|null>(null);

    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isOpen) return;
        chatService.subscribeToChatList(setChats);
        fetchAllUsers().then(users => setUserCache(users));
    }, [isOpen]);

    useEffect(() => {
        if (view === 'chat' && selectedChatId) {
            return chatService.subscribeToMessages(selectedChatId, 200, setActiveMessages);
        }
    }, [view, selectedChatId]);

    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [activeMessages, view, showAttachMenu, replyingTo]);

    // Admin & BOK Color Logic
    const getBubbleColor = (sender: string, isMine: boolean) => {
        if (isMine) return 'bg-[#FEE500] text-black';
        if (sender === '한국은행') return 'bg-blue-600 text-white';
        // Check if admin
        const u = userCache[sender];
        if (u?.type === 'admin' || u?.type === 'root') return 'bg-red-600 text-white';
        return 'bg-white dark:bg-[#2D2D2D] text-black dark:text-white';
    };

    const handleSendMessage = async (text: string = inputText, attachment?: any) => {
        if (!selectedChatId || (!text.trim() && !attachment)) return;
        const myIdentity = (currentUser?.name === '한국은행' || currentUser?.govtRole === '한국은행장') ? '한국은행' : currentUser!.name;
        
        let isNotice = false;
        if (currentUser?.type === 'admin' || currentUser?.type === 'root') isNotice = true;

        const msg: ChatMessage = { 
            id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, 
            sender: myIdentity, 
            text, 
            timestamp: Date.now(),
            attachment,
            isNotice,
            threadId: replyingTo?.threadId || replyingTo?.id 
        };
        
        await chatService.sendMessage(selectedChatId, msg);
        setInputText('');
        setReplyingTo(null);
        setShowAttachMenu(false);
        setSearchInRoom('');
    };

    const handleCreateThread = async () => {
        if (!selectedChatId) return;
        // Start a new thread by sending a root message
        handleSendMessage("새로운 스레드(주제)를 시작합니다.", { type: 'proposal', value: '스레드 시작', data: { type: 'thread_start' } });
    };

    const handleFileUpload = (base64: string | null) => {
        if(base64) handleSendMessage("사진을 보냈습니다.", { type: 'image', value: '사진', data: { image: base64 } });
    };

    const handleThreadAction = async (msg: ChatMessage, action: 'accept' | 'reject') => {
        if (!selectedChatId) return;
        const newMsg = { ...msg }; // In real app, update logic via DB
        
        // Update local status visual first (optimistic) then DB
        // In real app, update via specific API to handle logic
        // For simulation:
        await chatService.sendMessage(selectedChatId, {
            id: `sys_${Date.now()}`,
            sender: 'system',
            text: `${currentUser?.name}님이 제안을 ${action === 'accept' ? '수락' : '거절'}했습니다.`,
            timestamp: Date.now(),
            threadId: msg.threadId || msg.id
        });

        if (action === 'accept') {
             // Logic to auto-execute if applicable (e.g. loan approved)
             if (msg.attachment?.data?.appType === 'loan') {
                 // Trigger server action or mark
                 showModal("대출 조건이 수락되었습니다. (자동 승인 처리)");
             }
        }
    };

    const handleContextMenu = (e: React.MouseEvent, item: any, type: 'message' | 'chat') => {
        e.preventDefault();
        e.stopPropagation();
        const y = e.clientY;
        const winH = window.innerHeight;
        // If click is in lower 40% of screen, align bottom
        const align = y > winH * 0.6 ? 'bottom' : 'top';
        setLongPressMenu({ x: e.clientX, y: e.clientY, item, type, align });
    };

    const renderMessage = (msg: ChatMessage) => {
        const myName = (currentUser?.name === '한국은행' || currentUser?.govtRole === '한국은행장') ? "한국은행" : currentUser?.name;
        const isMine = msg.sender === myName;
        const senderInfo = userCache[msg.sender] || { name: msg.sender };
        const isImage = msg.attachment?.type === 'image';
        const bubbleColor = getBubbleColor(msg.sender, isMine);
        
        const isConclusion = msg.type === 'conclusion';
        
        if (searchInRoom && !msg.text.includes(searchInRoom)) return null;

        return (
            <div key={msg.id} className={`flex flex-col mb-4 animate-fade-in ${isMine ? 'items-end' : 'items-start'} ${msg.threadId ? 'ml-8 relative' : ''}`}
                onContextMenu={(e) => handleContextMenu(e, msg, 'message')}
            >
                {/* Thread Connector Line - Only for threaded messages */}
                {msg.threadId && (
                    <div className="absolute -left-4 -top-4 w-4 h-full border-l-2 border-b-2 border-gray-300 dark:border-gray-600 rounded-bl-xl pointer-events-none"></div>
                )}
                
                <div className={`flex ${isMine ? 'flex-row-reverse' : 'flex-row'} max-w-[85%]`}>
                    {!isMine && (
                        <div className="flex flex-col items-center mr-2">
                            <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-200 border border-gray-300 shadow-sm">
                                {senderInfo.profilePic ? <img src={senderInfo.profilePic} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center font-bold text-gray-500">{msg.sender[0]}</div>}
                            </div>
                        </div>
                    )}
                    
                    <div className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
                        {!isMine && <span className="text-xs text-gray-500 mb-1 ml-1 font-medium">{msg.sender}</span>}
                        
                        <div className={`px-4 py-2 rounded-[20px] text-sm relative shadow-sm ${bubbleColor} ${isMine ? 'rounded-tr-none' : 'rounded-tl-none'} ${isConclusion ? 'bg-red-100 border-2 border-red-500 text-red-800' : ''}`}>
                            {msg.type === 'conclusion' && <span className="text-[10px] font-bold text-red-600 block mb-1">📌 결론 도출</span>}
                            
                            {isImage ? (
                                <div className="rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 mt-1 cursor-pointer" onClick={() => showModal(<img src={msg.attachment!.data.image} className="w-full"/>)}>
                                    <img src={msg.attachment.data.image} className="max-w-full max-h-60 object-cover" />
                                </div>
                            ) : (
                                <p className="whitespace-pre-wrap break-all">{msg.text}</p>
                            )}

                            {/* Attachments */}
                            {msg.attachment?.type === 'share_user' && (
                                <div className="mt-2 p-2 bg-gray-100 dark:bg-black/20 rounded-xl flex items-center gap-2 cursor-pointer border border-transparent hover:border-gray-300" onClick={() => showModal(`${msg.attachment?.data.name}님 프로필\n직업: ${msg.attachment?.data.job}`)}>
                                    <div className="w-8 h-8 rounded-full bg-gray-300 overflow-hidden">
                                        {msg.attachment.data.pic && <img src={msg.attachment.data.pic} className="w-full h-full object-cover"/>}
                                    </div>
                                    <div>
                                        <p className="font-bold text-xs">{msg.attachment.data.name}</p>
                                        <p className="text-[10px]">{msg.attachment.data.job}</p>
                                    </div>
                                </div>
                            )}
                            
                            {msg.attachment?.type === 'share_id' && (
                                <div className="mt-2 p-2 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 cursor-pointer" onClick={() => showModal("신분증 상세 보기 (보안)")}>
                                    <div className="flex items-center gap-2">
                                        <LineIcon icon="id_card" className="w-4 h-4" />
                                        <span className="font-bold text-xs">신분증 공유</span>
                                    </div>
                                </div>
                            )}

                            {msg.attachment?.type === 'transfer_request' && (
                                <div className="mt-2 p-3 bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-200">
                                    <p className="font-bold text-xs">💸 송금 {msg.attachment.data.isRequest ? '요청' : ''}</p>
                                    <p className="text-lg font-bold my-1">₩ {msg.attachment.data.amount.toLocaleString()}</p>
                                    {!msg.attachment.data.isRequest && <p className="text-[10px]">보낸 사람: {msg.sender}</p>}
                                    {msg.attachment.data.isRequest && !isMine && (
                                        <Button className="w-full mt-2 text-xs py-2 bg-green-600" onClick={() => onAttachTab?.('이체')}>송금하기</Button>
                                    )}
                                </div>
                            )}

                            {/* Negotiation Buttons */}
                            {msg.negotiationStatus === 'pending' && !isMine && (
                                <div className="flex gap-2 mt-2 pt-2 border-t border-black/10">
                                    <button onClick={() => handleThreadAction(msg, 'accept')} className="flex-1 bg-green-500 text-white text-xs py-2 rounded-lg font-bold">수락</button>
                                    <button onClick={() => handleThreadAction(msg, 'reject')} className="flex-1 bg-red-500 text-white text-xs py-2 rounded-lg font-bold">거절</button>
                                </div>
                            )}
                        </div>
                        
                        <div className="flex items-center gap-1 mt-1 mx-1">
                            <span className="text-[9px] text-gray-400">{new Date(msg.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                            {/* Reactions */}
                            {msg.reactions && (
                                <div className="flex gap-0.5 bg-gray-100 dark:bg-gray-800 rounded-full px-1.5 py-0.5">
                                    {Object.values(msg.reactions).map((r, i) => <span key={i} className="text-[10px]">{r}</span>)}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    const filteredChats = useMemo(() => {
        const list = (Object.values(chats) as Chat[]).sort((a,b) => {
            if (a.isPinned && !b.isPinned) return -1;
            if (!a.isPinned && b.isPinned) return 1;
            return (b.lastTimestamp||0) - (a.lastTimestamp||0);
        });
        return list.filter(c => {
            const hasMe = c.participants.includes(currentUser!.name);
            if (!hasMe && !isAdminMode) return false;
            
            // Integrated Search (Name, Participants, Content)
            const name = c.groupName || c.participants.filter(p=>p!==currentUser?.name).join(', ');
            const contentMatch = (Object.values(c.messages || {}) as ChatMessage[]).some(m => m.text.includes(searchChat));
            if (searchChat && !name.includes(searchChat) && !contentMatch) return false;

            if (categoryFilter === 'friend' && c.type !== 'private') return false;
            if (categoryFilter === 'group' && c.type !== 'group') return false;
            
            return true;
        });
    }, [chats, searchChat, categoryFilter, currentUser, isAdminMode]);

    const activeChat = chats[selectedChatId || ''];
    const currentNotices = useMemo(() => {
        if(!selectedChatId) return [];
        return (Object.values(activeMessages) as ChatMessage[]).filter(m => m.isNotice).reverse();
    }, [activeMessages, selectedChatId]);

    const handleMenuAction = async (action: string) => {
        if (!longPressMenu) return;
        const { item, type } = longPressMenu;
        setLongPressMenu(null);

        if (type === 'message') {
            const msg = item as ChatMessage;
            if (action === 'copy') navigator.clipboard.writeText(msg.text);
            if (action === 'reply') setReplyingTo(msg);
            if (action === 'delete') {
                // Delete logic: update msg text to deleted
                if (currentUser?.type === 'admin' || msg.sender === currentUser?.name) {
                    await chatService.sendMessage(selectedChatId!, { ...msg, text: "(삭제된 메시지입니다)", attachment: undefined });
                } else {
                    showModal("삭제 권한이 없습니다.");
                }
            }
            if (action === 'notice') {
                if(isAdminMode || activeChat.type === 'group') {
                    // Update Notice in Chat Meta or send Notice Message
                    // Simplified: Just update this message as notice
                    // Real DB should likely have a 'notices' node or mark message
                    const newMsg = { ...msg, isNotice: true };
                    await chatService.sendMessage(selectedChatId!, newMsg);
                    showModal("공지로 등록되었습니다.");
                } else {
                    showModal("권한이 없습니다.");
                }
            }
            if (['👍','❤️','😂'].includes(action)) {
                // Add reaction (Optimistic UI would be better, but simple update here)
                const newReactions = { ...(msg.reactions || {}), [currentUser!.name]: action };
                await chatService.sendMessage(selectedChatId!, { ...msg, reactions: newReactions });
            }
        } else {
            const chat = item as Chat;
            if (action === 'leave') {
                if (await showConfirm("정말 나가시겠습니까?")) {
                    // Remove current user from participants
                    const newParticipants = chat.participants.filter(p => p !== currentUser?.name);
                    // Update DB manually via custom helper or generic update
                    // chatService doesn't have updateChat, so imply logic or add it
                    // Assuming we can update chatRooms ref
                    // For now, alert
                    showModal("채팅방 나가기 처리됨 (기능 구현 필요)");
                }
            }
        }
    };

    return (
        <div className="fixed inset-y-0 right-0 z-[5000] w-full sm:w-[400px] bg-[#121212] flex flex-col shadow-2xl border-l border-gray-800 overflow-hidden animate-slide-left font-sans text-white">
            {/* Header */}
            <div className="h-14 bg-[#1C1C1E] flex items-center px-4 justify-between border-b border-gray-800 shrink-0 z-20 relative">
                {view === 'chat' ? (
                    <div className="flex items-center gap-3 w-full">
                        <button onClick={() => setView('list')} className="p-1"><LineIcon icon="arrow-left" className="w-6 h-6" /></button>
                        <div className="flex-1 min-w-0">
                            <h2 className="font-bold text-base truncate">
                                {activeChat?.groupName || activeChat?.participants.filter(p=>p!==currentUser?.name).join(', ')}
                            </h2>
                            <p className="text-[10px] text-gray-400">{activeChat?.participants.length}명 참여중</p>
                        </div>
                        <button onClick={() => setSearchInRoom(prev => prev ? '' : ' ')} className="p-2"><LineIcon icon="search" /></button>
                        <button onClick={() => setShowDrawer(true)} className="p-2"><LineIcon icon="menu" /></button>
                    </div>
                ) : (
                    <div className="flex items-center justify-between w-full">
                        <h2 className="font-bold text-xl">채팅</h2>
                        <div className="flex gap-4">
                            <button><LineIcon icon="search" /></button>
                            <button onClick={() => setShowNewChatModal(true)}><LineIcon icon="plus" /></button>
                            <button onClick={onClose}><LineIcon icon="close" /></button>
                        </div>
                    </div>
                )}
            </div>

            {/* List View */}
            {view === 'list' && (
                <div className="flex-1 flex flex-col overflow-hidden bg-[#121212]">
                    <div className="px-4 py-2 bg-[#1C1C1E]">
                        <Input placeholder="대화, 친구 검색" value={searchChat} onChange={e => setSearchChat(e.target.value)} className="h-10 text-sm bg-[#2D2D2D] border-none" />
                    </div>
                    <div className="flex px-4 py-2 gap-2 border-b border-gray-800">
                        {['all', 'friend', 'group'].map(c => (
                            <button key={c} onClick={() => setCategoryFilter(c as any)} className={`px-3 py-1 rounded-full text-xs font-bold ${categoryFilter===c ? 'bg-white text-black' : 'bg-[#2D2D2D] text-gray-400'}`}>
                                {c === 'all' ? '전체' : (c === 'friend' ? '개인' : '단체')}
                            </button>
                        ))}
                    </div>
                    <div className="flex-1 overflow-y-auto">
                        {filteredChats.map(c => {
                            const name = c.groupName || c.participants.find(p=>p!==currentUser?.name) || '알 수 없음';
                            return (
                                <div key={c.id} onClick={() => { setSelectedChatId(c.id); setView('chat'); }} 
                                     onContextMenu={(e) => handleContextMenu(e, c, 'chat')}
                                     className="flex items-center gap-4 p-4 hover:bg-[#1C1C1E] cursor-pointer">
                                    <div className="w-12 h-12 rounded-full overflow-hidden bg-gray-700 flex items-center justify-center font-bold text-lg border border-gray-600">
                                        {c.coverImage ? <img src={c.coverImage} className="w-full h-full object-cover"/> : name[0]}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex justify-between mb-1">
                                            <div className="flex items-center gap-1 min-w-0">
                                                <span className="font-bold text-sm truncate">{name}</span>
                                                {c.isPinned && <LineIcon icon="star" className="w-3 h-3 text-yellow-500 flex-shrink-0" />}
                                                {c.isMuted && <LineIcon icon="lock" className="w-3 h-3 text-gray-500 flex-shrink-0" />} 
                                            </div>
                                            <span className="text-[10px] text-gray-500 flex-shrink-0">{new Date(c.lastTimestamp||0).toLocaleDateString()}</span>
                                        </div>
                                        <p className="text-xs text-gray-400 truncate">{c.lastMessage}</p>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>
            )}

            {/* Chat Room View */}
            {view === 'chat' && (
                <>
                    {/* Notice Banner */}
                    {currentNotices.length > 0 && (
                        <div className="bg-white/10 backdrop-blur-md p-2 flex items-center justify-between text-xs px-4 absolute top-14 left-0 right-0 z-10 border-b border-white/5 cursor-pointer shadow-lg" onClick={() => showModal(currentNotices[0].text)}>
                            <span className="font-bold truncate text-white">📢 {currentNotices[0].text}</span>
                            <button className="text-gray-400">▼</button>
                        </div>
                    )}
                    
                    {/* Search Bar */}
                    {searchInRoom !== '' && (
                        <div className="absolute top-14 left-0 right-0 bg-[#2D2D2D] p-2 z-20 flex gap-2">
                            <Input autoFocus placeholder="대화 내용 검색..." value={searchInRoom} onChange={e => setSearchInRoom(e.target.value)} className="text-sm h-8" />
                            <button onClick={() => setSearchInRoom('')}>닫기</button>
                        </div>
                    )}

                    <div className="flex-1 overflow-y-auto p-4 bg-[#0F0F0F] scroll-smooth pt-10" ref={scrollRef}>
                        {Object.values(activeMessages).sort((a: ChatMessage, b: ChatMessage)=>a.timestamp-b.timestamp).map(renderMessage)}
                    </div>
                    
                    <div className="bg-[#1C1C1E] border-t border-gray-800 shrink-0 relative">
                        {replyingTo && (
                            <div className="p-2 bg-gray-800 border-l-4 border-green-500 text-xs text-gray-300 flex justify-between items-center">
                                <div className="truncate">
                                    <span className="font-bold block">{replyingTo.sender}에게 답장</span>
                                    {replyingTo.text}
                                </div>
                                <button onClick={() => setReplyingTo(null)}>✕</button>
                            </div>
                        )}

                        <div className="p-3 flex items-center gap-2">
                            <button onClick={() => setShowAttachMenu(!showAttachMenu)} className={`p-2 rounded-full transition-transform ${showAttachMenu ? 'rotate-45' : ''}`}>
                                <LineIcon icon="plus" className="w-6 h-6 text-gray-400" />
                            </button>
                            <input 
                                className="flex-1 bg-[#2D2D2D] rounded-full px-4 py-2 text-sm text-white outline-none"
                                placeholder="메시지 입력"
                                value={inputText}
                                onChange={e => setInputText(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
                            />
                            <button onClick={() => handleSendMessage()} className={`p-2 rounded-full ${inputText ? 'bg-[#FEE500] text-black' : 'text-gray-500'}`}>
                                <LineIcon icon="send" />
                            </button>
                        </div>
                        
                        {/* Corrected Attachment Grid */}
                        {showAttachMenu && (
                            <div className="grid grid-cols-4 gap-4 p-6 bg-[#1C1C1E] border-t border-gray-800 animate-slide-up">
                                {[
                                    { label: '사진', icon: 'image', action: () => document.getElementById('chat-file-input')?.click() },
                                    { label: '파일', icon: 'folder', action: () => alert('파일 전송은 준비중입니다.') },
                                    { label: '송금', icon: 'finance', action: () => setShowTransferModal('send') },
                                    { label: '송금요청', icon: 'finance', action: () => setShowTransferModal('request') },
                                    { label: '사용자', icon: 'profile', action: () => setShowUserShareModal(true) },
                                    { label: '신분증', icon: 'id_card', action: () => handleSendMessage("신분증을 공유합니다.", { type: 'share_id', value: 'ID' }) },
                                    { label: '스레드', icon: 'menu', action: handleCreateThread },
                                ].map((item, i) => (
                                    <button key={i} onClick={() => { item.action(); setShowAttachMenu(false); }} className="flex flex-col items-center gap-2">
                                        <div className="w-12 h-12 rounded-full bg-[#2D2D2D] flex items-center justify-center text-white hover:bg-[#3D3D3D]">
                                            <LineIcon icon={item.icon} className="w-6 h-6" />
                                        </div>
                                        <span className="text-xs text-gray-400">{item.label}</span>
                                    </button>
                                ))}
                                <input type="file" id="chat-file-input" className="hidden" accept="image/*" onChange={e => {
                                    if(e.target.files?.[0]) {
                                        const reader = new FileReader();
                                        reader.onload = (ev) => handleFileUpload(ev.target?.result as string);
                                        reader.readAsDataURL(e.target.files[0]);
                                    }
                                }} />
                            </div>
                        )}
                    </div>
                </>
            )}

            {/* Blurred Context Menu (Long Press) */}
            {longPressMenu && (
                <div className="fixed inset-0 z-[6000] bg-black/60 backdrop-blur-sm flex flex-col" onClick={() => setLongPressMenu(null)}>
                    {/* Message Preview aligned above/below menu */}
                    <div className="absolute w-full px-8" style={{ [longPressMenu.align === 'bottom' ? 'bottom' : 'top']: longPressMenu.align === 'bottom' ? window.innerHeight - longPressMenu.y + 20 : longPressMenu.y + 20 }}>
                         {longPressMenu.type === 'message' && (
                            <div className="bg-[#2D2D2D] p-4 rounded-xl mb-4 max-w-[80%] mx-auto text-center border border-gray-600">
                                <p className="text-sm">{(longPressMenu.item as ChatMessage).text}</p>
                            </div>
                        )}
                        
                        <div className="bg-[#2D2D2D] rounded-xl shadow-2xl overflow-hidden max-w-[280px] mx-auto text-sm animate-scale-in border border-gray-700">
                            {longPressMenu.type === 'message' ? (
                                <>
                                    <div className="flex justify-around p-3 border-b border-gray-700">
                                        {['👍','❤️','😂','😲','😢','😡'].map(emoji => (
                                            <button key={emoji} onClick={(e) => { e.stopPropagation(); handleMenuAction(emoji); }} className="text-xl hover:scale-125 transition-transform">{emoji}</button>
                                        ))}
                                    </div>
                                    <button className="w-full text-left px-4 py-3 hover:bg-[#3D3D3D]" onClick={() => handleMenuAction('copy')}>복사</button>
                                    <button className="w-full text-left px-4 py-3 hover:bg-[#3D3D3D]" onClick={() => handleMenuAction('reply')}>답장</button>
                                    {isAdminMode && <button className="w-full text-left px-4 py-3 hover:bg-[#3D3D3D]" onClick={() => handleMenuAction('notice')}>공지 등록</button>}
                                    <button className="w-full text-left px-4 py-3 hover:bg-[#3D3D3D] text-red-500" onClick={() => handleMenuAction('delete')}>삭제</button>
                                </>
                            ) : (
                                <>
                                    <button className="w-full text-left px-4 py-3 hover:bg-[#3D3D3D]" onClick={() => handleMenuAction('pin')}>상단 고정 {longPressMenu.item.isPinned && '(해제)'}</button>
                                    <button className="w-full text-left px-4 py-3 hover:bg-[#3D3D3D]" onClick={() => handleMenuAction('mute')}>알림 끄기 {longPressMenu.item.isMuted && '(해제)'}</button>
                                    <button className="w-full text-left px-4 py-3 hover:bg-[#3D3D3D] text-red-500" onClick={() => handleMenuAction('leave')}>채팅방 나가기</button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Drawer */}
            {showDrawer && (
                <div className="absolute inset-0 z-50 flex">
                    <div className="flex-1 bg-black/50" onClick={() => setShowDrawer(false)}></div>
                    <div className="w-[80%] bg-[#1C1C1E] h-full shadow-2xl p-6 overflow-y-auto animate-slide-left">
                        <h3 className="font-bold text-lg mb-6">채팅방 서랍</h3>
                        <div className="space-y-6">
                            <div>
                                <h4 className="text-sm text-gray-500 font-bold mb-2">공지사항</h4>
                                <div className="space-y-1">
                                    {currentNotices.map(n => <p key={n.id} className="text-xs bg-gray-800 p-2 rounded cursor-pointer" onClick={() => showModal(n.text)}>{n.text}</p>)}
                                    {currentNotices.length === 0 && <p className="text-xs text-gray-600">등록된 공지가 없습니다.</p>}
                                </div>
                            </div>
                            <div>
                                <h4 className="text-sm text-gray-500 font-bold mb-2">대화상대 ({activeChat?.participants.length})</h4>
                                <div className="space-y-2">
                                    {activeChat?.participants.map(p => {
                                        const u = userCache[p];
                                        return (
                                            <div key={p} className="flex items-center gap-2">
                                                <div className="w-8 h-8 rounded-full bg-gray-600 overflow-hidden flex items-center justify-center text-xs">
                                                    {u?.profilePic ? <img src={u.profilePic} className="w-full h-full object-cover"/> : p[0]}
                                                </div>
                                                <span className="text-sm">{p} {p === currentUser?.name && '(나)'}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                            <div className="pt-6 border-t border-gray-800">
                                <button onClick={() => { setShowDrawer(false); handleMenuAction('leave'); }} className="w-full py-3 bg-[#2D2D2D] rounded-xl mb-2 flex items-center justify-center gap-2 text-red-500">
                                    <LineIcon icon="logout" className="w-4 h-4" /> 채팅방 나가기
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Modals for Attachments */}
            <Modal isOpen={showUserShareModal} onClose={() => setShowUserShareModal(false)} title="사용자 공유">
                <div className="max-h-60 overflow-y-auto space-y-2">
                    {(Object.values(userCache) as User[]).filter(u => u.name !== currentUser?.name).map(u => (
                        <div key={u.name} className="flex items-center p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded cursor-pointer" 
                             onClick={() => {
                                 handleSendMessage("", { type: 'share_user', value: 'User', data: { name: u.name, job: u.customJob || u.type, pic: u.profilePic } });
                                 setShowUserShareModal(false);
                             }}>
                            <div className="w-8 h-8 rounded-full bg-gray-300 mr-2 overflow-hidden">
                                {u.profilePic && <img src={u.profilePic} className="w-full h-full object-cover"/>}
                            </div>
                            <span>{u.name}</span>
                        </div>
                    ))}
                </div>
            </Modal>

            <Modal isOpen={!!showTransferModal} onClose={() => setShowTransferModal(null)} title={showTransferModal === 'send' ? "간편 송금" : "송금 요청"}>
                <div className="space-y-4">
                    <Input type="number" placeholder="금액 입력" value={transferAmount} onChange={e => setTransferAmount(e.target.value)} />
                    <Button onClick={() => {
                        const amt = parseInt(transferAmount);
                        if (amt > 0) {
                            handleSendMessage("", { type: 'transfer_request', value: 'Transfer', data: { amount: amt, isRequest: showTransferModal === 'request' } });
                            setShowTransferModal(null);
                            setTransferAmount('');
                        }
                    }}>{showTransferModal === 'send' ? '보내기' : '요청하기'}</Button>
                </div>
            </Modal>
        </div>
    );
};
