
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useGame } from '../context/GameContext';
import { chatService, fetchAllUsers, uploadImage, toSafeId, database } from '../services/firebase'; 
import { Button, Input, LineIcon, Modal, Toggle, formatName, FileInput, Card, MoneyInput } from './Shared';
import { Chat, ChatMessage, User } from '../types';
import { ref, update, remove } from 'firebase/database';

// Helper for Link Parsing
const LinkText: React.FC<{ text: string }> = ({ text }) => {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = text.split(urlRegex);
    return (
        <>
            {parts.map((part, i) => {
                if (part.match(urlRegex)) {
                    return <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-blue-400 underline hover:text-blue-300 break-all">{part}</a>;
                }
                return part;
            })}
        </>
    );
};

export const ChatSystem: React.FC<{ isOpen: boolean; onClose: () => void; onAttachTab?: (tab: string) => void }> = ({ isOpen, onClose, onAttachTab }) => {
    const { currentUser, db, isAdminMode, notify, showModal, showConfirm, serverAction, saveDb, showPinModal, wait } = useGame();
    
    const [view, setView] = useState<'list' | 'chat'>('list');
    const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
    const [inputText, setInputText] = useState('');
    const [chats, setChats] = useState<Record<string, Chat>>({});
    const [activeMessages, setActiveMessages] = useState<Record<string, ChatMessage>>({});
    const [searchChat, setSearchChat] = useState('');
    const [userCache, setUserCache] = useState<Record<string, User>>({});

    // UI States
    const [showAttachMenu, setShowAttachMenu] = useState(false);
    const [showDrawer, setShowDrawer] = useState(false);
    const [showNewChatModal, setShowNewChatModal] = useState(false);
    const [selectedUsersForChat, setSelectedUsersForChat] = useState<string[]>([]);
    
    // Context Menus
    const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
    const [msgContextMenu, setMsgContextMenu] = useState<{ x: number, y: number, target: ChatMessage | null } | null>(null);
    const [listContextMenu, setListContextMenu] = useState<{ x: number, y: number, target: Chat | null } | null>(null);

    // Transfer & ID
    const [showTransferModal, setShowTransferModal] = useState(false);
    const [transferAmount, setTransferAmount] = useState('');

    // Local hide list
    const [hiddenMessages, setHiddenMessages] = useState<string[]>([]);

    const scrollRef = useRef<HTMLDivElement>(null);
    const longPressTimer = useRef<any>(null);

    // --- Dynamic Layout Styles (JS Way) ---
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
    const sidebarWidth = isMobile ? '100%' : '400px'; 
    
    const containerStyle: React.CSSProperties = {
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: sidebarWidth,
        backgroundColor: '#121212', 
        transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)', 
        zIndex: 5000,
        boxShadow: isOpen ? '-10px 0 30px rgba(0,0,0,0.5)' : 'none',
        display: 'flex',
        flexDirection: 'column',
        borderLeft: '1px solid rgba(255,255,255,0.1)'
    };

    useEffect(() => {
        chatService.subscribeToChatList(setChats);
        
        // OPTIMIZATION: If Admin (db.users populated), use cached data instead of heavy fetch
        if (db.users && Object.keys(db.users).length > 2) {
            setUserCache(db.users);
        } else {
            // For normal users, try not to fetch all users if possible, or use the stripped down version
            // For now, only load if explicitly needed (e.g. new chat) or settle for cached names
            // If chat needs user details, it will fetch on demand or use what's available
        }
    }, [db.users]);

    useEffect(() => {
        if (selectedChatId) {
            setView('chat');
            // Optimization: Reduce message limit to 20 to save bandwidth on images
            return chatService.subscribeToMessages(selectedChatId, 20, setActiveMessages);
        } else {
            setView('list');
            setActiveMessages({});
        }
    }, [selectedChatId]);

    // ... (rest of the file remains unchanged, keeping previous functionality)
    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [activeMessages, view, showAttachMenu, replyingTo]);

    useEffect(() => {
        const handleClick = () => {
            setMsgContextMenu(null);
            setListContextMenu(null);
        };
        window.addEventListener('click', handleClick);
        return () => window.removeEventListener('click', handleClick);
    }, []);

    const activeChat = chats[selectedChatId || ''];
    const myPrefs = currentUser?.chatPreferences?.[selectedChatId || ''] || {};
    const isAuctionChat = activeChat?.type === 'auction';
    
    const sortedChats = useMemo(() => {
        return (Object.values(chats || {}) as Chat[]).sort((a: Chat, b: Chat) => {
            if (a.type === 'auction' && b.type !== 'auction') return -1;
            if (a.type !== 'auction' && b.type === 'auction') return 1;
            const pinA = currentUser?.chatPreferences?.[a.id]?.isPinned;
            const pinB = currentUser?.chatPreferences?.[b.id]?.isPinned;
            if (pinA && !pinB) return -1;
            if (!pinA && pinB) return 1;
            return (b.lastTimestamp || 0) - (a.lastTimestamp || 0);
        });
    }, [chats, currentUser?.chatPreferences]);

    const isGovernor = currentUser?.govtRole === '한국은행장';
    const isBank = currentUser?.name === '한국은행';
    const hasAdminPrivilege = isAdminMode || isGovernor || isBank || currentUser?.type === 'root';

    // --- Handlers ---
    const handleMsgLongPress = (e: React.TouchEvent | React.MouseEvent, msg: ChatMessage) => {
        if (e.type === 'contextmenu') {
            e.preventDefault();
            e.stopPropagation();
            const mouseEvent = e as React.MouseEvent;
            setMsgContextMenu({ x: mouseEvent.clientX, y: mouseEvent.clientY, target: msg });
        } else if (e.type === 'touchstart') {
            longPressTimer.current = setTimeout(() => {
                const touchEvent = e as React.TouchEvent;
                const touch = touchEvent.touches[0];
                setMsgContextMenu({ x: touch.clientX, y: touch.clientY, target: msg });
            }, 600);
        }
    };

    const handleChatListLongPress = (e: React.TouchEvent | React.MouseEvent, chat: Chat) => {
        if (e.type === 'contextmenu') {
            e.preventDefault();
            e.stopPropagation();
            const mouseEvent = e as React.MouseEvent;
            setListContextMenu({ x: mouseEvent.clientX, y: mouseEvent.clientY, target: chat });
        } else if (e.type === 'touchstart') {
            longPressTimer.current = setTimeout(() => {
                const touchEvent = e as React.TouchEvent;
                const touch = touchEvent.touches[0];
                setListContextMenu({ x: touch.clientX, y: touch.clientY, target: chat });
            }, 600);
        }
    };

    const clearLongPress = () => { if (longPressTimer.current) clearTimeout(longPressTimer.current); };

    const handleDeleteMessage = async (msg: ChatMessage) => {
        if (!selectedChatId) return;
        if (!await showConfirm("메시지를 회수하시겠습니까? (상대방에게서도 삭제됩니다)")) return;
        try {
            await remove(ref(database, `chatMessages/${selectedChatId}/${msg.id}`));
            setMsgContextMenu(null);
        } catch(e) {
            showModal("삭제 실패");
        }
    };

    const handleTogglePin = async (chat: Chat) => {
        if (!currentUser) return;
        const currentPinned = currentUser.chatPreferences?.[chat.id]?.isPinned || false;
        await chatService.updateChatPreferences(currentUser.id || currentUser.email!, chat.id, { isPinned: !currentPinned });
        setListContextMenu(null);
    };

    const handleToggleMute = async (chat: Chat) => {
        if (!currentUser) return;
        const currentMuted = currentUser.chatPreferences?.[chat.id]?.isMuted || false;
        await chatService.updateChatPreferences(currentUser.id || currentUser.email!, chat.id, { isMuted: !currentMuted });
        setListContextMenu(null);
    };

    const handleLeaveChatAction = async (chatId: string) => {
        if (!await showConfirm("채팅방을 나가시겠습니까?")) return;
        const chat = chats[chatId];
        if (!chat) return;
        const newParticipants = chat.participants.filter(p => p !== currentUser?.name);
        const sysMsg: ChatMessage = { id: `sys_${Date.now()}`, sender: 'system', text: `${currentUser?.name}님이 퇴장했습니다.`, timestamp: Date.now(), type: 'system' };
        await chatService.sendMessage(chatId, sysMsg);
        if (newParticipants.length === 0) await remove(ref(database, `chatRooms/${chatId}`));
        else await chatService.updateChat(chatId, { participants: newParticipants });
        if (selectedChatId === chatId) setSelectedChatId(null);
        setListContextMenu(null);
    };

    const handleBlockUser = async (chat: Chat) => {
        if (!currentUser) return;
        const otherUser = chat.participants.find(p => p !== currentUser.name);
        if (!otherUser) return;
        if (!await showConfirm(`${otherUser}님을 차단하시겠습니까?`)) return;
        await chatService.updateChatPreferences(currentUser.id || currentUser.email!, chat.id, { isMuted: true });
        showModal(`${otherUser}님을 차단했습니다.`);
        setListContextMenu(null);
    };

    const handleCreateChat = async () => {
        // Load users on demand if not loaded
        if (Object.keys(userCache).length === 0) {
             const res = await serverAction('fetch_all_users_light', {});
             if (res && res.users) setUserCache(res.users);
        }

        if (selectedUsersForChat.length === 0) return showModal("대화 상대를 선택하세요.");
        const type = selectedUsersForChat.length > 1 ? 'group' : 'private';
        const participants = [currentUser!.name, ...selectedUsersForChat];
        try {
            const chatId = await chatService.createChat(participants, type);
            setSelectedChatId(chatId);
            setShowNewChatModal(false);
            setSelectedUsersForChat([]);
        } catch(e) { showModal("채팅방 생성 실패"); }
    };

    const handleSendMessage = async (text: string = inputText, attachment?: any) => {
        if (!selectedChatId) return;
        if (chats[selectedChatId]?.type === 'auction') {
            const bidAmount = parseInt(text);
            if (isNaN(bidAmount)) {
                if (!attachment && !hasAdminPrivilege) return showModal("입찰가(숫자)만 입력 가능합니다.");
            } else {
                try {
                    const res = await serverAction('place_bid', { amount: bidAmount, bidder: currentUser!.name });
                    if (res.error) throw new Error(res.error);
                    setInputText('');
                    return; 
                } catch(e: any) { return showModal(e.message === 'BID_TOO_LOW' ? "현재가보다 높게 입력하세요." : "입찰 실패"); }
            }
        }
        if ((!text.trim() && !attachment)) return;
        const myIdentity = (isBank || isGovernor) ? '한국은행' : currentUser!.name;
        const msg: ChatMessage = { 
            id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, 
            sender: myIdentity, text: (text || '').toString(), timestamp: Date.now(), attachment,
            threadId: replyingTo?.id,
            replyTo: replyingTo ? { id: replyingTo.id, text: replyingTo.text, sender: replyingTo.sender } : undefined
        };
        await chatService.sendMessage(selectedChatId, msg);
        setInputText(''); setReplyingTo(null); setShowAttachMenu(false);
    };

    const handleFileUpload = async (base64: string) => {
        if (!selectedChatId) return;
        try {
            const url = await uploadImage(`chat/${selectedChatId}/${Date.now()}`, base64);
            await handleSendMessage("", {
                type: 'image',
                value: '사진',
                data: { image: url }
            });
        } catch(e) {
            showModal("사진 전송 실패");
        }
    };

    const handleSendTransferRequest = () => {
        const amt = parseInt(transferAmount);
        if (isNaN(amt) || amt <= 0) return showModal("금액을 입력하세요.");
        handleSendMessage("송금 요청", {
            type: 'transfer_request',
            value: '송금 요청',
            data: { amount: amt, currency: 'KRW', isRequest: true }
        });
        setShowTransferModal(false);
        setTransferAmount('');
    };

    const handleShareID = () => {
        handleSendMessage("신분증 공유", {
            type: 'share_id',
            value: '신분증',
            data: { name: currentUser!.name }
        });
    };

    const handleInviteUser = async (userName: string) => {
        if (!selectedChatId) return;
        const chat = chats[selectedChatId];
        if (chat.participants.includes(userName)) return showModal("이미 참여 중입니다.");
        const newParticipants = [...chat.participants, userName];
        await chatService.updateChat(selectedChatId, { participants: newParticipants, type: 'group' });
        await chatService.sendMessage(selectedChatId, {
            id: `sys_${Date.now()}`, sender: 'system', text: `${userName}님이 초대되었습니다.`, timestamp: Date.now(), type: 'system'
        });
    };

    // --- Render ---
    const renderMessage = (msg: ChatMessage) => {
        if (hiddenMessages.includes(msg.id)) return null;
        if (msg.type === 'system' || msg.sender === 'system' || msg.text.includes('초대되었습니다') || msg.text.includes('퇴장했습니다')) {
            return (
                <div key={msg.id} className="flex justify-center my-4 animate-fade-in">
                    <span className="text-[10px] text-gray-500 bg-black/10 dark:bg-white/10 px-3 py-1 rounded-full">{msg.text}</span>
                </div>
            );
        }

        const myName = (isBank || isGovernor) ? "한국은행" : currentUser?.name;
        const isMine = msg.sender === myName;
        const senderInfo = userCache[msg.sender] || { name: msg.sender, profilePic: null, type: 'citizen' };
        
        let bubbleColor = isMine ? 'bg-[#FEE500] text-black border-none' : 'bg-white text-black border border-gray-200 dark:bg-[#2D2D2D] dark:text-white dark:border-gray-700';
        if (msg.sender === '한국은행') bubbleColor = 'bg-yellow-400 text-black border border-yellow-500 font-bold';
        else if (senderInfo.type === 'admin' || senderInfo.type === 'root') bubbleColor = 'bg-red-600 text-white border border-red-700 font-bold';

        return (
            <div 
                key={msg.id} id={`msg-${msg.id}`}
                className={`flex flex-col mb-4 animate-fade-in ${isMine ? 'items-end' : 'items-start'}`}
                onContextMenu={(e) => handleMsgLongPress(e, msg)}
                onTouchStart={(e) => handleMsgLongPress(e, msg)}
                onTouchEnd={clearLongPress}
            >
                <div className={`flex ${isMine ? 'flex-row-reverse' : 'flex-row'} max-w-[85%]`}>
                    {!isMine && (
                        <div className="flex flex-col items-center mr-2">
                            <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-200 border border-gray-300 shadow-sm">
                                {senderInfo.profilePic ? <img src={senderInfo.profilePic} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center font-bold text-gray-500 text-xs">{msg.sender[0]}</div>}
                            </div>
                        </div>
                    )}
                    <div className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
                        {!isMine && <span className="text-[10px] text-gray-500 mb-1 ml-1 font-medium">{msg.sender}</span>}
                        {msg.replyTo && (
                            <div className="mb-1 text-xs text-gray-400 bg-black/5 dark:bg-white/5 p-2 rounded-lg border-l-2 border-green-500 max-w-full truncate">
                                <span className="font-bold block text-[10px] opacity-70">{msg.replyTo.sender}에게 답장</span>
                                {msg.replyTo.text}
                            </div>
                        )}
                        <div className={`px-4 py-2 rounded-[18px] text-sm relative shadow-sm group ${bubbleColor} ${isMine ? 'rounded-tr-none' : 'rounded-tl-none'}`}>
                            {msg.attachment?.type === 'image' ? (
                                <div className="rounded-xl overflow-hidden mt-1 cursor-pointer" onClick={() => showModal(<img src={msg.attachment!.data.image} className="w-full"/>)}>
                                    <img src={msg.attachment.data.image} className="max-w-full max-h-60 object-cover" />
                                </div>
                            ) : msg.attachment?.type === 'transfer_request' ? (
                                <div className="flex flex-col gap-2 min-w-[150px]">
                                    <div className="flex items-center gap-2 border-b border-white/20 pb-2 mb-1">
                                        <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">💸</div>
                                        <div>
                                            <p className="font-bold text-xs">{msg.attachment.data.isRequest ? '송금 요청' : '송금 완료'}</p>
                                            <p className="font-black text-lg">{msg.attachment.data.currency === 'USD' ? '$' : '₩'} {msg.attachment.data.amount.toLocaleString()}</p>
                                        </div>
                                    </div>
                                    {!isMine && msg.attachment.data.isRequest && (
                                        <Button className="py-1 text-xs bg-white text-black hover:bg-gray-100" onClick={() => {
                                            if (onAttachTab) onAttachTab('이체'); // Navigate to transfer
                                            notify(msg.sender, "송금을 위해 이체 탭으로 이동합니다.", false);
                                        }}>보내기</Button>
                                    )}
                                </div>
                            ) : msg.attachment?.type === 'share_id' ? (
                                <div className="cursor-pointer">
                                    <div className="flex items-center gap-3 bg-black/10 dark:bg-white/10 p-2 rounded-lg">
                                        <LineIcon icon="id_card" className="w-8 h-8" />
                                        <div><p className="font-bold text-xs">모바일 신분증</p><p className="text-[10px] opacity-70">{msg.attachment.data.name}</p></div>
                                    </div>
                                </div>
                            ) : (<p className="whitespace-pre-wrap break-all"><LinkText text={msg.text} /></p>)}
                        </div>
                        <span className="text-[9px] text-gray-400 mt-1 mx-1">{new Date(msg.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                    </div>
                </div>
            </div>
        );
    };

    // --- MAIN RENDER ---
    return (
        <>
            <div style={containerStyle}>
                {/* List View */}
                {view === 'list' && (
                    <div className="flex-1 flex flex-col h-full w-full bg-[#121212]">
                        <div className="h-14 bg-[#1C1C1E] flex items-center justify-between px-4 border-b border-gray-800 shrink-0">
                            <h2 className="font-bold text-xl text-white">채팅</h2>
                            <div className="flex gap-2">
                                <button onClick={() => setShowNewChatModal(true)} className="p-2 hover:bg-white/10 rounded-full transition-colors"><LineIcon icon="plus" className="text-white w-6 h-6" /></button>
                                <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors"><LineIcon icon="close" className="text-white w-6 h-6" /></button>
                            </div>
                        </div>
                        <div className="px-4 py-2 bg-[#1C1C1E] shrink-0">
                            <Input placeholder="대화, 친구 검색" value={searchChat} onChange={e => setSearchChat(e.target.value)} className="h-10 text-sm bg-[#2D2D2D] border-none text-white" />
                        </div>
                        <div className="flex-1 overflow-y-auto">
                            {sortedChats.map((c: Chat) => {
                                const name = c.groupName || (c.participants || []).filter(p=>p!==currentUser?.name).join(', ') || '알 수 없음';
                                const isAuction = c.type === 'auction';
                                const prefs = currentUser?.chatPreferences?.[c.id] || {};
                                return (
                                    <div 
                                        key={c.id} 
                                        onClick={() => setSelectedChatId(c.id)} 
                                        onContextMenu={(e) => handleChatListLongPress(e, c)}
                                        onTouchStart={(e) => handleChatListLongPress(e, c)}
                                        onTouchEnd={clearLongPress}
                                        className={`flex items-center gap-4 p-4 hover:bg-[#1C1C1E] cursor-pointer border-b border-white/5 text-white ${prefs.isPinned ? 'bg-gray-800/50' : ''} ${isAuction ? 'bg-red-900/20 border-l-4 border-l-red-500' : ''}`}
                                    >
                                        <div className={`w-12 h-12 rounded-full overflow-hidden flex items-center justify-center font-bold text-lg border ${isAuction ? 'bg-red-700 border-red-500 text-white' : 'bg-gray-700 border-gray-600'}`}>
                                            {c.coverImage ? <img src={c.coverImage} className="w-full h-full object-cover"/> : name[0]}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex justify-between mb-1">
                                                <span className="font-bold text-sm truncate flex items-center gap-2">
                                                    {isAuction && <span className="text-[10px] bg-red-600 text-white px-1.5 rounded animate-pulse">LIVE</span>}
                                                    {prefs.isPinned && <span className="text-[10px]">📌</span>}
                                                    {prefs.isMuted && <span className="text-[10px]">🔕</span>}
                                                    {name}
                                                </span>
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
                {view === 'chat' && activeChat && (
                    <div className="flex-1 flex flex-col h-full bg-[#0F0F0F] relative w-full text-white">
                        {/* Header: Fixed */}
                        <div className="h-14 bg-[#1C1C1E] flex items-center px-4 justify-between border-b border-gray-800 shrink-0 z-20">
                            <div className="flex items-center gap-3 w-full">
                                <button onClick={() => setSelectedChatId(null)} className="p-1 text-white"><LineIcon icon="arrow-left" className="w-6 h-6" /></button>
                                <div className="flex-1 min-w-0">
                                    <h2 className="font-bold text-base truncate">
                                        {activeChat.groupName || (activeChat.participants || []).filter(p=>p!==currentUser?.name).join(', ')}
                                    </h2>
                                    <p className="text-[10px] text-gray-400">{(activeChat.participants || []).length}명 참여중</p>
                                </div>
                                <button onClick={() => setShowDrawer(true)} className="p-2 text-white"><LineIcon icon="menu" /></button>
                            </div>
                        </div>

                        {/* Messages Area: Grow */}
                        <div className="flex-1 overflow-y-auto p-4 bg-[#0F0F0F] scroll-smooth min-h-0" ref={scrollRef} style={myPrefs.backgroundImage ? { backgroundImage: `url(${myPrefs.backgroundImage})`, backgroundSize: 'cover' } : {}}>
                            {Object.values(activeMessages).length === 0 && <p className="text-center text-gray-500 mt-10 text-sm">대화 내용이 없습니다.</p>}
                            {(Object.values(activeMessages) as ChatMessage[]).sort((a: ChatMessage, b: ChatMessage)=>a.timestamp-b.timestamp).map(renderMessage)}
                        </div>

                        {/* Input Area: Fixed at Bottom */}
                        <div className="bg-[#1C1C1E] border-t border-gray-800 shrink-0 relative p-2 pb-6 sm:pb-2 z-20 w-full">
                            {replyingTo && (
                                <div className="p-2 bg-gray-800 border-l-4 border-green-500 text-xs text-gray-300 flex justify-between items-center mb-2 rounded">
                                    <div className="truncate max-w-[200px]"><span className="font-bold block text-[10px]">{replyingTo.sender}에게 답장</span>{replyingTo.text}</div>
                                    <button onClick={() => setReplyingTo(null)} className="p-2">✕</button>
                                </div>
                            )}

                            <div className="flex items-center gap-2">
                                <button onClick={() => setShowAttachMenu(!showAttachMenu)} className={`p-2 rounded-full transition-transform ${showAttachMenu ? 'rotate-45' : ''}`}>
                                    <LineIcon icon="plus" className="w-6 h-6 text-gray-400" />
                                </button>
                                
                                <textarea 
                                    className="flex-1 bg-[#2D2D2D] rounded-xl px-4 py-3 text-sm text-white outline-none resize-none max-h-24 scrollbar-hide"
                                    placeholder={isAuctionChat ? "입찰가 (숫자만)" : "메시지 입력 (Shift+Enter 줄바꿈)"}
                                    rows={1}
                                    value={inputText}
                                    onChange={e => setInputText(e.target.value)}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            handleSendMessage();
                                        }
                                    }}
                                    disabled={isAuctionChat && db.auction?.isPaused}
                                />
                                
                                <button onClick={() => handleSendMessage()} className={`p-2 rounded-full ${inputText ? 'bg-[#FEE500] text-black' : 'text-gray-500'}`}>
                                    <LineIcon icon="send" />
                                </button>
                            </div>
                            
                            {showAttachMenu && (
                                <div className="grid grid-cols-4 gap-4 p-4 mt-2 bg-[#1C1C1E] border-t border-gray-800 animate-slide-up">
                                    {/* Attach Menu Items */}
                                    <button onClick={() => document.getElementById('chat-file-input')?.click()} className="flex flex-col items-center gap-2">
                                        <div className="w-12 h-12 rounded-full bg-[#2D2D2D] flex items-center justify-center text-white hover:bg-[#3D3D3D]"><LineIcon icon="image" /></div>
                                        <span className="text-xs text-gray-400">사진</span>
                                    </button>
                                    <button onClick={() => setShowTransferModal(true)} className="flex flex-col items-center gap-2">
                                        <div className="w-12 h-12 rounded-full bg-[#2D2D2D] flex items-center justify-center text-white hover:bg-[#3D3D3D]"><LineIcon icon="finance" /></div>
                                        <span className="text-xs text-gray-400">송금</span>
                                    </button>
                                    <button onClick={handleShareID} className="flex flex-col items-center gap-2">
                                        <div className="w-12 h-12 rounded-full bg-[#2D2D2D] flex items-center justify-center text-white hover:bg-[#3D3D3D]"><LineIcon icon="id_card" /></div>
                                        <span className="text-xs text-gray-400">신분증</span>
                                    </button>
                                    {/* ... other items ... */}
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
                    </div>
                )}

                {/* Restore Drawer Code */}
                {showDrawer && activeChat && (
                    <div className="absolute inset-0 z-[6000] bg-black/50 flex justify-end animate-fade-in" onClick={() => setShowDrawer(false)}>
                        <div className="w-64 h-full bg-[#1C1C1E] shadow-2xl flex flex-col animate-slide-left" onClick={e => e.stopPropagation()}>
                            <div className="p-4 border-b border-gray-800 flex justify-between items-center text-white">
                                <h3 className="font-bold text-lg">채팅방 설정</h3>
                                <button onClick={() => setShowDrawer(false)}><LineIcon icon="close" /></button>
                            </div>
                            <div className="flex-1 overflow-y-auto p-4 space-y-4 text-white">
                                <div>
                                    <p className="text-xs text-gray-500 mb-2 uppercase font-bold">대화상대</p>
                                    <div className="space-y-2">
                                        {activeChat.participants.map(p => (
                                            <div key={p} className="flex items-center gap-2 text-sm">
                                                <div className="w-6 h-6 rounded-full bg-gray-700 flex items-center justify-center text-xs">{p[0]}</div>
                                                <span>{p}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                
                                <div className="border-t border-gray-800 pt-4">
                                    <p className="text-xs text-gray-500 mb-2 uppercase font-bold">초대</p>
                                    <div className="space-y-2 max-h-40 overflow-y-auto">
                                        {Object.values(userCache)
                                            .filter((u: User) => u.type === 'citizen' && !activeChat.participants.includes(u.name))
                                            .map((u: User) => (
                                                <button key={u.name} onClick={() => handleInviteUser(u.name)} className="w-full text-left text-sm py-1 hover:text-green-500 flex justify-between">
                                                    <span>{u.name}</span>
                                                    <span className="text-xs text-gray-500">+ 초대</span>
                                                </button>
                                            ))
                                        }
                                    </div>
                                </div>

                                <button onClick={() => handleLeaveChatAction(activeChat.id)} className="w-full py-2 bg-red-900/30 text-red-500 rounded font-bold text-sm hover:bg-red-900/50 mt-auto">나가기</button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Transfer Request Modal */}
                <Modal isOpen={showTransferModal} onClose={() => setShowTransferModal(false)} title="송금 요청">
                    <div className="space-y-4">
                        <MoneyInput value={transferAmount} onChange={e => setTransferAmount(e.target.value)} placeholder="요청 금액 (₩)" />
                        <Button onClick={handleSendTransferRequest} className="w-full">요청 보내기</Button>
                    </div>
                </Modal>
                
                {/* New Chat Modal */}
                <Modal isOpen={showNewChatModal} onClose={() => setShowNewChatModal(false)} title="새 채팅">
                    <div className="space-y-4">
                        <div className="max-h-60 overflow-y-auto space-y-1">
                            {Object.values(userCache).filter((u: User) => u.name !== currentUser?.name).map((u: User) => (
                                <div key={u.name} className="flex items-center gap-3 p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded cursor-pointer" onClick={() => {
                                    if(selectedUsersForChat.includes(u.name)) setSelectedUsersForChat(selectedUsersForChat.filter(n=>n!==u.name));
                                    else setSelectedUsersForChat([...selectedUsersForChat, u.name]);
                                }}>
                                    <input type="checkbox" checked={selectedUsersForChat.includes(u.name)} readOnly className="accent-green-600 w-5 h-5" />
                                    <span>{u.name} ({u.type})</span>
                                </div>
                            ))}
                        </div>
                        <Button onClick={handleCreateChat} className="w-full">채팅하기</Button>
                    </div>
                </Modal>
            </div>

            {/* Context Menu Rendered via Portal to escape transforms */}
            {msgContextMenu && createPortal(
                <div 
                    className="fixed z-[9999] bg-[#2D2D2D] border border-gray-700 rounded-lg shadow-xl overflow-hidden min-w-[150px] animate-scale-in"
                    style={{ top: msgContextMenu.y, left: Math.min(msgContextMenu.x, window.innerWidth - 160) }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <button className="w-full text-left px-4 py-3 text-white hover:bg-white/10 text-sm" onClick={() => { setReplyingTo(msgContextMenu.target); setMsgContextMenu(null); }}>답장</button>
                    <button className="w-full text-left px-4 py-3 text-white hover:bg-white/10 text-sm" onClick={() => { navigator.clipboard.writeText(msgContextMenu.target?.text || ''); setMsgContextMenu(null); }}>복사</button>
                    {(msgContextMenu.target?.sender === currentUser?.name || hasAdminPrivilege) && (
                        <>
                            <button className="w-full text-left px-4 py-3 text-red-500 hover:bg-white/10 text-sm" onClick={() => { handleDeleteMessage(msgContextMenu.target!); }}>회수 (모두 삭제)</button>
                            <button className="w-full text-left px-4 py-3 text-gray-400 hover:bg-white/10 text-sm" onClick={() => { setHiddenMessages([...hiddenMessages, msgContextMenu.target!.id]); setMsgContextMenu(null); }}>삭제 (나에게만)</button>
                        </>
                    )}
                </div>,
                document.body
            )}

            {listContextMenu && createPortal(
                <div 
                    className="fixed z-[9999] bg-[#2D2D2D] border border-gray-700 rounded-lg shadow-xl overflow-hidden min-w-[150px] animate-scale-in"
                    style={{ top: listContextMenu.y, left: Math.min(listContextMenu.x, window.innerWidth - 160) }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <button className="w-full text-left px-4 py-3 text-white hover:bg-white/10 text-sm" onClick={() => handleTogglePin(listContextMenu.target!)}>
                        {currentUser?.chatPreferences?.[listContextMenu.target!.id]?.isPinned ? '상단 고정 해제' : '상단 고정'}
                    </button>
                    <button className="w-full text-left px-4 py-3 text-white hover:bg-white/10 text-sm" onClick={() => handleToggleMute(listContextMenu.target!)}>
                        {currentUser?.chatPreferences?.[listContextMenu.target!.id]?.isMuted ? '알림 켜기' : '알림 끄기'}
                    </button>
                    {listContextMenu.target!.type === 'private' && (
                        <button className="w-full text-left px-4 py-3 text-red-400 hover:bg-white/10 text-sm" onClick={() => handleBlockUser(listContextMenu.target!)}>
                            상대방 차단
                        </button>
                    )}
                    <button className="w-full text-left px-4 py-3 text-red-500 hover:bg-white/10 text-sm font-bold" onClick={() => handleLeaveChatAction(listContextMenu.target!.id)}>
                        채팅방 나가기
                    </button>
                </div>,
                document.body
            )}
        </>
    );
};
