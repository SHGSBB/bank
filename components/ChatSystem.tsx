
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useGame } from '../context/GameContext';
import { chatService, uploadImage, database } from '../services/firebase'; 
import { Button, Input, LineIcon, Modal, Card, MoneyInput, RichText, formatName } from './Shared';
import { Chat, ChatMessage, User } from '../types';
import { ref, remove } from 'firebase/database';

export const ChatSystem: React.FC<{ isOpen: boolean; onClose: () => void; onAttachTab?: (tab: string) => void }> = ({ isOpen, onClose, onAttachTab }) => {
    const { currentUser, db, isAdminMode, notify, showModal, showConfirm, serverAction } = useGame();
    
    const [view, setView] = useState<'list' | 'chat'>('list');
    const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
    const [inputText, setInputText] = useState('');
    const [chats, setChats] = useState<Record<string, Chat>>({});
    const [activeMessages, setActiveMessages] = useState<Record<string, ChatMessage>>({});
    const [searchChat, setSearchChat] = useState('');
    const [userCache, setUserCache] = useState<Record<string, User>>({});

    const [showAttachMenu, setShowAttachMenu] = useState(false);
    const [showDrawer, setShowDrawer] = useState(false);
    const [showNewChatModal, setShowNewChatModal] = useState(false);
    const [selectedUsersForChat, setSelectedUsersForChat] = useState<string[]>([]);
    
    const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
    const [msgContextMenu, setMsgContextMenu] = useState<{ x: number, y: number, target: ChatMessage | null } | null>(null);
    const [listContextMenu, setListContextMenu] = useState<{ x: number, y: number, target: Chat | null } | null>(null);

    const [hiddenMessages, setHiddenMessages] = useState<string[]>([]);

    const scrollRef = useRef<HTMLDivElement>(null);
    const longPressTimer = useRef<any>(null);

    const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
    const sidebarWidth = isMobile ? '100%' : '400px'; 
    
    const containerStyle: React.CSSProperties = {
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: sidebarWidth,
        backgroundColor: 'rgba(18, 18, 18, 0.8)', 
        backdropFilter: 'blur(20px)',
        transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)', 
        zIndex: 5000,
        boxShadow: isOpen ? '-10px 0 30px rgba(0,0,0,0.5)' : 'none',
        display: 'flex',
        flexDirection: 'column',
        borderLeft: '1px solid rgba(255,255,255,0.1)'
    };

    useEffect(() => {
        const unsubscribe = chatService.subscribeToChatList(setChats);
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        if (db.users && Object.keys(db.users).length > 0) {
            setUserCache(db.users);
        } else if (Object.keys(userCache).length === 0) {
             serverAction('fetch_all_users_light', {}).then((res) => {
                 if (res && res.users) setUserCache(res.users);
             });
        }
    }, [db.users]);

    useEffect(() => {
        if (selectedChatId) {
            setView('chat');
            return chatService.subscribeToMessages(selectedChatId, 50, setActiveMessages);
        } else {
            setView('list');
            setActiveMessages({});
        }
    }, [selectedChatId]);

    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [activeMessages, view, showAttachMenu, replyingTo]);

    // Close context menu on outside click
    useEffect(() => {
        const handleClick = () => {
            setMsgContextMenu(null);
            setListContextMenu(null);
        };
        // Use capture to handle clicks before other elements if needed, 
        // but bubbling is usually fine. 'click' handles touches too.
        window.addEventListener('click', handleClick);
        return () => window.removeEventListener('click', handleClick);
    }, []);

    const activeChat = chats[selectedChatId || ''];
    const myPrefs = currentUser?.chatPreferences?.[selectedChatId || ''] || {};
    const isAuctionChat = activeChat?.type === 'auction';
    
    const sortedChats = useMemo(() => {
        const allChats = Object.values(chats || {}) as Chat[];
        const myName = currentUser?.name;
        
        const myChats = allChats.filter(c => 
            c.type === 'auction' || 
            (c.participants && (c.participants.includes(myName || '') || c.participants.includes('ALL')))
        );

        return myChats.sort((a: Chat, b: Chat) => {
            if (a.type === 'auction' && b.type !== 'auction') return -1;
            if (a.type !== 'auction' && b.type === 'auction') return 1;
            const pinA = currentUser?.chatPreferences?.[a.id]?.isPinned;
            const pinB = currentUser?.chatPreferences?.[b.id]?.isPinned;
            if (pinA && !pinB) return -1;
            if (!pinA && pinB) return 1;
            return (b.lastTimestamp || 0) - (a.lastTimestamp || 0);
        });
    }, [chats, currentUser?.chatPreferences, currentUser?.name]);

    const isGovernor = currentUser?.govtRole === '한국은행장';
    const isBank = currentUser?.name === '한국은행';
    
    const handleMsgLongPress = (e: React.TouchEvent | React.MouseEvent, msg: ChatMessage) => {
        if (e.type === 'contextmenu') { 
            e.preventDefault(); 
            e.stopPropagation(); 
            const mouseEvent = e as React.MouseEvent; 
            setMsgContextMenu({ x: mouseEvent.clientX, y: mouseEvent.clientY, target: msg }); 
        } else if (e.type === 'touchstart') { 
            const touchEvent = e as React.TouchEvent; 
            const touch = touchEvent.touches[0];
            const startX = touch.clientX;
            const startY = touch.clientY;
            
            longPressTimer.current = setTimeout(() => { 
                setMsgContextMenu({ x: startX, y: startY, target: msg }); 
            }, 500); 
        }
    };
    
    const clearLongPress = () => { 
        if (longPressTimer.current) clearTimeout(longPressTimer.current); 
    };

    const handleDeleteMessage = async (msg: ChatMessage) => { 
        if (await showConfirm("삭제하시겠습니까?")) await remove(ref(database, `chatMessages/${selectedChatId}/${msg.id}`)); 
        setMsgContextMenu(null); 
    };
    const handleTogglePin = async (chat: Chat) => { if (!currentUser) return; const currentPinned = currentUser.chatPreferences?.[chat.id]?.isPinned || false; await chatService.updateChatPreferences(currentUser.id || currentUser.email!, chat.id, { isPinned: !currentPinned }); setListContextMenu(null); };
    const handleToggleMute = async (chat: Chat) => { if (!currentUser) return; const currentMuted = currentUser.chatPreferences?.[chat.id]?.isMuted || false; await chatService.updateChatPreferences(currentUser.id || currentUser.email!, chat.id, { isMuted: !currentMuted }); setListContextMenu(null); };
    const handleLeaveChatAction = async (chatId: string) => { if (!await showConfirm("나가시겠습니까?")) return; const chat = chats[chatId]; const newParticipants = chat?.participants.filter(p => p !== currentUser?.name) || []; await chatService.sendMessage(chatId, { id: `sys_${Date.now()}`, sender: 'system', text: `${currentUser?.name}님이 퇴장했습니다.`, timestamp: Date.now(), type: 'system' }); if (newParticipants.length === 0) await remove(ref(database, `chatRooms/${chatId}`)); else await chatService.updateChat(chatId, { participants: newParticipants }); if (selectedChatId === chatId) setSelectedChatId(null); setListContextMenu(null); };
    const handleCreateChat = async () => { 
        if (selectedUsersForChat.length === 0) return showModal("대화 상대를 선택하세요."); 
        const participants = [currentUser!.name, ...selectedUsersForChat];
        try { const chatId = await chatService.createChat(participants, selectedUsersForChat.length > 1 ? 'group' : 'private'); setSelectedChatId(chatId); setShowNewChatModal(false); setSelectedUsersForChat([]); } catch(e) { showModal("생성 실패"); }
    };
    const handleSendMessage = async (text: string = inputText, attachment?: any) => { if (!selectedChatId) return; if ((!text.trim() && !attachment)) return; const myIdentity = (isBank || isGovernor) ? '한국은행' : currentUser!.name; const msg: ChatMessage = { id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, sender: myIdentity, text: (text || '').toString(), timestamp: Date.now(), attachment, threadId: replyingTo?.id, replyTo: replyingTo ? { id: replyingTo.id, text: replyingTo.text, sender: replyingTo.sender } : undefined }; await chatService.sendMessage(selectedChatId, msg); setInputText(''); setReplyingTo(null); setShowAttachMenu(false); };
    const handleFileUpload = async (base64: string) => { try { const url = await uploadImage(`chat/${selectedChatId}/${Date.now()}`, base64); await handleSendMessage("", { type: 'image', value: '사진', data: { image: url } }); } catch(e) { showModal("업로드 실패"); } };
    
    const handleChatListLongPress = (e: React.TouchEvent | React.MouseEvent, chat: Chat) => { 
        if (e.type === 'contextmenu') { 
            e.preventDefault(); 
            e.stopPropagation(); 
            const mouseEvent = e as React.MouseEvent; 
            setListContextMenu({ x: mouseEvent.clientX, y: mouseEvent.clientY, target: chat }); 
        } else if (e.type === 'touchstart') { 
            const touchEvent = e as React.TouchEvent; 
            const touch = touchEvent.touches[0];
            const startX = touch.clientX;
            const startY = touch.clientY;
            
            longPressTimer.current = setTimeout(() => { 
                setListContextMenu({ x: startX, y: startY, target: chat }); 
            }, 500); 
        } 
    };
    
    // --- Render ---
    const sortedMessages = (Object.values(activeMessages) as ChatMessage[]).sort((a,b) => a.timestamp - b.timestamp);
    let lastDate = '';

    return (
        <>
            <div style={containerStyle}>
                {view === 'list' && (
                    <div className="flex-1 flex flex-col h-full w-full">
                        <div className="h-14 flex items-center justify-between px-4 border-b border-white/10 shrink-0 bg-[#1C1C1E]/50 backdrop-blur-md">
                            <h2 className="font-bold text-xl text-white">채팅</h2>
                            <div className="flex gap-2">
                                <button onClick={() => setShowNewChatModal(true)} className="p-2 hover:bg-white/10 rounded-full transition-colors"><LineIcon icon="plus" className="text-white w-6 h-6" /></button>
                                <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors"><LineIcon icon="close" className="text-white w-6 h-6" /></button>
                            </div>
                        </div>
                        <div className="px-4 py-2 bg-[#1C1C1E]/50 shrink-0">
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
                                        onTouchMove={clearLongPress}
                                        className={`flex items-center gap-4 p-4 hover:bg-white/10 cursor-pointer border-b border-white/5 text-white transition-colors ${prefs.isPinned ? 'bg-gray-800/50' : ''} ${isAuction ? 'bg-red-900/20 border-l-4 border-l-red-500' : ''}`}
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

                {view === 'chat' && activeChat && (
                    <div className="flex-1 flex flex-col h-full bg-[#E9E9EB] dark:bg-[#0F0F0F] relative w-full text-black dark:text-white">
                        <div className="h-14 bg-white/80 dark:bg-[#1C1C1E]/80 backdrop-blur-md flex items-center px-4 justify-between border-b border-gray-200 dark:border-gray-800 shrink-0 z-20">
                            <div className="flex items-center gap-3 w-full">
                                <button onClick={() => setSelectedChatId(null)} className="p-1"><LineIcon icon="arrow-left" className="w-6 h-6" /></button>
                                <div className="flex-1 min-w-0">
                                    <h2 className="font-bold text-base truncate">
                                        {activeChat.groupName || (activeChat.participants || []).filter(p=>p!==currentUser?.name).join(', ')}
                                    </h2>
                                    <p className="text-[10px] text-gray-500">{(activeChat.participants || []).length}명 참여중</p>
                                </div>
                                <button onClick={() => setShowDrawer(true)} className="p-2"><LineIcon icon="menu" /></button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 scroll-smooth min-h-0" ref={scrollRef} style={myPrefs.backgroundImage ? { backgroundImage: `url(${myPrefs.backgroundImage})`, backgroundSize: 'cover' } : {}}>
                            {sortedMessages.length === 0 && <p className="text-center text-gray-500 mt-10 text-sm">대화 내용이 없습니다.</p>}
                            {sortedMessages.map((msg) => {
                                const msgDate = new Date(msg.timestamp).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
                                const showDate = msgDate !== lastDate;
                                if (showDate) lastDate = msgDate;

                                if (hiddenMessages.includes(msg.id)) return null;
                                
                                const myName = (isBank || isGovernor) ? "한국은행" : currentUser?.name;
                                const isMine = msg.sender === myName;
                                const senderInfo = userCache[msg.sender] || { name: msg.sender, profilePic: null, type: 'citizen', govtRole: '', subType: 'personal' };
                                let bubbleColor = isMine ? 'bg-[#FEE500] text-black' : (senderInfo.type === 'admin' ? 'bg-red-100 text-red-900 border-red-200 dark:bg-red-900 dark:text-red-100' : 'bg-white text-black border-gray-200 dark:bg-[#333] dark:text-white dark:border-gray-700');

                                return (
                                    <React.Fragment key={msg.id}>
                                        {showDate && (
                                            <div className="flex justify-center my-4 animate-fade-in">
                                                <span className="text-[10px] text-gray-500 bg-black/10 dark:bg-white/10 px-3 py-1 rounded-full backdrop-blur-sm shadow-sm">{msgDate}</span>
                                            </div>
                                        )}
                                        {msg.type === 'system' || msg.sender === 'system' ? (
                                            <div className="flex justify-center my-4 animate-fade-in">
                                                <span className="text-[10px] text-gray-500 bg-black/10 dark:bg-white/10 px-3 py-1 rounded-full">{msg.text}</span>
                                            </div>
                                        ) : (
                                            <div className={`flex flex-col mb-4 animate-fade-in ${isMine ? 'items-end' : 'items-start'}`} 
                                                 onContextMenu={(e) => handleMsgLongPress(e, msg)} 
                                                 onTouchStart={(e) => handleMsgLongPress(e, msg)} 
                                                 onTouchEnd={clearLongPress}
                                                 onTouchMove={clearLongPress}
                                            >
                                                <div className={`flex ${isMine ? 'flex-row-reverse' : 'flex-row'} max-w-[85%]`}>
                                                    {!isMine && (
                                                        <div className="flex flex-col items-center mr-2">
                                                            <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-200 border border-gray-300 shadow-sm">
                                                                {senderInfo.profilePic ? <img src={senderInfo.profilePic} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center font-bold text-gray-500 text-xs">{(msg.sender || '?')[0]}</div>}
                                                            </div>
                                                        </div>
                                                    )}
                                                    <div className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
                                                        {!isMine && <span className="text-[10px] text-gray-500 mb-1 ml-1 font-medium">{msg.sender}</span>}
                                                        <div className={`px-3 py-2 rounded-[18px] text-sm relative shadow-sm group border ${bubbleColor} ${isMine ? 'rounded-tr-none' : 'rounded-tl-none'}`}>
                                                            <RichText text={msg.text} />
                                                        </div>
                                                        <span className="text-[9px] text-gray-400 mt-1 mx-1">{new Date(msg.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </React.Fragment>
                                );
                            })}
                        </div>

                        <div className="bg-white dark:bg-[#1C1C1E] border-t border-gray-200 dark:border-gray-800 shrink-0 relative p-2 pb-6 sm:pb-2 z-20 w-full">
                            {showAttachMenu && !isAuctionChat && (
                                <div className="absolute bottom-full left-0 right-0 p-4 bg-white dark:bg-[#1C1C1E] border-t border-gray-200 dark:border-gray-800 animate-slide-up grid grid-cols-4 gap-4 z-50 shadow-lg rounded-t-2xl mx-2 mb-2">
                                    <button onClick={() => document.getElementById('chat-file-input')?.click()} className="flex flex-col items-center gap-2"><div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-[#2D2D2D] flex items-center justify-center text-black dark:text-white hover:opacity-80"><LineIcon icon="image" /></div><span className="text-xs text-gray-500">사진</span></button>
                                    <input type="file" id="chat-file-input" className="hidden" accept="image/*" onChange={e => { if(e.target.files?.[0]) { const reader = new FileReader(); reader.onload = (ev) => handleFileUpload(ev.target?.result as string); reader.readAsDataURL(e.target.files[0]); } setShowAttachMenu(false); }} />
                                </div>
                            )}
                            <div className="flex items-center gap-2">
                                {!isAuctionChat && <button onClick={() => setShowAttachMenu(!showAttachMenu)} className={`p-2 rounded-full transition-transform ${showAttachMenu ? 'rotate-45' : ''}`}><LineIcon icon="plus" className="w-6 h-6 text-gray-400" /></button>}
                                <textarea className="flex-1 bg-gray-100 dark:bg-[#2D2D2D] rounded-xl px-4 py-3 text-sm text-black dark:text-white outline-none resize-none max-h-24 scrollbar-hide" placeholder={isAuctionChat ? "입찰가 (숫자만)" : "메시지 입력"} rows={1} value={inputText} onChange={e => setInputText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); }}} disabled={isAuctionChat && db.auction?.isPaused} />
                                <button onClick={() => handleSendMessage()} className={`p-2 rounded-full ${inputText ? 'bg-[#FEE500] text-black' : 'text-gray-500'}`}><LineIcon icon="send" /></button>
                            </div>
                        </div>
                    </div>
                )}
                
                {/* Context Menus */}
                {msgContextMenu && (
                    <div 
                        className="fixed z-[6000] bg-white dark:bg-[#2D2D2D] rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 py-1 min-w-[150px] animate-scale-in overflow-hidden" 
                        style={{ top: Math.min(window.innerHeight - 150, msgContextMenu.y), left: Math.min(window.innerWidth - 160, msgContextMenu.x) }}
                    >
                        <button onClick={() => { navigator.clipboard.writeText(msgContextMenu.target!.text); setMsgContextMenu(null); }} className="w-full text-left px-4 py-3 hover:bg-gray-100 dark:hover:bg-white/10 text-sm flex items-center gap-2"><LineIcon icon="copy" className="w-4 h-4"/> 복사</button>
                        <button onClick={() => { setReplyingTo(msgContextMenu.target); setMsgContextMenu(null); }} className="w-full text-left px-4 py-3 hover:bg-gray-100 dark:hover:bg-white/10 text-sm flex items-center gap-2"><LineIcon icon="reply" className="w-4 h-4"/> 답장</button>
                        {(msgContextMenu.target?.sender === currentUser?.name || isAdminMode) && (
                            <button onClick={() => handleDeleteMessage(msgContextMenu.target!)} className="w-full text-left px-4 py-3 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 text-sm flex items-center gap-2 border-t border-gray-100 dark:border-gray-700"><LineIcon icon="trash" className="w-4 h-4"/> 삭제</button>
                        )}
                    </div>
                )}

                {listContextMenu && (
                    <div 
                        className="fixed z-[6000] bg-white dark:bg-[#2D2D2D] rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 py-1 min-w-[150px] animate-scale-in overflow-hidden" 
                        style={{ top: Math.min(window.innerHeight - 150, listContextMenu.y), left: Math.min(window.innerWidth - 160, listContextMenu.x) }}
                    >
                        <button onClick={() => handleTogglePin(listContextMenu.target!)} className="w-full text-left px-4 py-3 hover:bg-gray-100 dark:hover:bg-white/10 text-sm font-medium">
                            {currentUser?.chatPreferences?.[listContextMenu.target!.id]?.isPinned ? '고정 해제' : '상단 고정'}
                        </button>
                        <button onClick={() => handleToggleMute(listContextMenu.target!)} className="w-full text-left px-4 py-3 hover:bg-gray-100 dark:hover:bg-white/10 text-sm font-medium">
                            {currentUser?.chatPreferences?.[listContextMenu.target!.id]?.isMuted ? '알림 켜기' : '알림 끄기'}
                        </button>
                        <button onClick={() => handleLeaveChatAction(listContextMenu.target!.id)} className="w-full text-left px-4 py-3 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 text-sm font-medium border-t border-gray-100 dark:border-gray-700">나가기</button>
                    </div>
                )}

                {showNewChatModal && <Modal isOpen={true} onClose={() => setShowNewChatModal(false)} title="새 채팅"><div className="space-y-4"><Input placeholder="이름 검색" className="w-full mb-2" /><div className="max-h-80 overflow-y-auto space-y-2 grid grid-cols-1">{(Object.values(userCache) as User[]).filter((u: User) => u.name !== currentUser?.name && u.type !== 'admin' && u.type !== 'root' && u.subType !== 'teacher').sort((a,b)=>(a.name||'').localeCompare(b.name||'')).map((u: User) => (<div key={u.name} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${selectedUsersForChat.includes(u.name) ? 'bg-green-50 border-green-500 dark:bg-green-900/30' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:shadow-md'}`} onClick={() => { if(selectedUsersForChat.includes(u.name)) setSelectedUsersForChat(selectedUsersForChat.filter(n=>n!==u.name)); else setSelectedUsersForChat([...selectedUsersForChat, u.name]); }}><div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-600 overflow-hidden flex items-center justify-center">{u.profilePic ? <img src={u.profilePic} className="w-full h-full object-cover"/> : <span className="font-bold text-gray-500">{(u.name || '?')[0]}</span>}</div><div className="flex-1"><p className="font-bold text-sm text-black dark:text-white">{formatName(u.name)}</p><p className="text-xs text-gray-500">{u.customJob || u.type}</p></div><div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${selectedUsersForChat.includes(u.name) ? 'bg-green-500 border-green-500' : 'border-gray-300'}`}>{selectedUsersForChat.includes(u.name) && <LineIcon icon="check" className="w-3 h-3 text-white" />}</div></div>))}</div><Button onClick={handleCreateChat} className="w-full py-3" disabled={selectedUsersForChat.length === 0}>{selectedUsersForChat.length}명과 채팅하기</Button></div></Modal>}
            </div>
        </>
    );
};
