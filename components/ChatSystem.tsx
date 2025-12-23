
// ... existing imports ...
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useGame } from '../context/GameContext';
import { chatService, uploadImage, database, toSafeId } from '../services/firebase'; 
import { Button, Input, LineIcon, Modal, RichText, formatName } from './Shared';
import { Chat, ChatMessage, User, ChatNotice } from '../types';
import { ref, update, remove, set } from 'firebase/database';

export const ChatSystem: React.FC<{ isOpen: boolean; onClose: () => void; onAttachTab?: (tab: string) => void }> = ({ isOpen, onClose, onAttachTab }) => {
    const { currentUser, db, isAdminMode, notify, showModal, showConfirm, saveDb } = useGame();
    
    // Core State
    const [view, setView] = useState<'list' | 'chat'>('list');
    const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
    const [chats, setChats] = useState<Record<string, Chat>>({});
    const [activeMessages, setActiveMessages] = useState<Record<string, ChatMessage>>({});
    const [userCache, setUserCache] = useState<Record<string, User>>({});
    
    // UI State
    const [inputText, setInputText] = useState('');
    const [searchChat, setSearchChat] = useState('');
    const [showAttachMenu, setShowAttachMenu] = useState(false);
    
    // Drawer & Features
    const [showDrawer, setShowDrawer] = useState(false);
    const [drawerTab, setDrawerTab] = useState<'members' | 'media' | 'links'>('members');
    const [showNewChatModal, setShowNewChatModal] = useState(false);
    const [selectedUsersForChat, setSelectedUsersForChat] = useState<string[]>([]);
    
    // Notice
    const [isNoticeExpanded, setIsNoticeExpanded] = useState(false);
    const [showNoticeDetail, setShowNoticeDetail] = useState(false);
    const [showSettingsModal, setShowSettingsModal] = useState(false);
    
    // Message Action State
    const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
    const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
    
    // Context Menus
    const [msgContextMenu, setMsgContextMenu] = useState<{ x: number, y: number, target: ChatMessage } | null>(null);
    const [listContextMenu, setListContextMenu] = useState<{ x: number, y: number, target: Chat } | null>(null);

    // References
    const scrollRef = useRef<HTMLDivElement>(null);
    const longPressTimer = useRef<any>(null);

    // Responsive Sidebar
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
    const sidebarWidth = isMobile ? '100%' : '420px';

    // --- Effects ---
    useEffect(() => {
        const unsubscribe = chatService.subscribeToChatList(setChats);
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        if (db.users) setUserCache(db.users);
    }, [db.users]);

    // Auto-Join Auction Chat when active
    useEffect(() => {
        if (isOpen && db.auction?.isActive && !selectedChatId) {
            // Find auction chat
            const auctionChat = (Object.values(chats) as Chat[]).find(c => c.type === 'auction');
            if (auctionChat) setSelectedChatId(auctionChat.id);
        }
    }, [isOpen, db.auction?.isActive, chats]);

    useEffect(() => {
        if (selectedChatId) {
            setView('chat');
            return chatService.subscribeToMessages(selectedChatId, 100, setActiveMessages);
        } else {
            setView('list');
            setActiveMessages({});
            setReplyingTo(null);
            setEditingMsgId(null);
            setShowDrawer(false);
        }
    }, [selectedChatId]);

    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [activeMessages, view, showAttachMenu, replyingTo]);

    useEffect(() => {
        const handleClick = () => { setMsgContextMenu(null); setListContextMenu(null); };
        window.addEventListener('click', handleClick);
        return () => window.removeEventListener('click', handleClick);
    }, []);

    // --- Helpers ---
    const activeChat = chats[selectedChatId || ''];
    const myPrefs = currentUser?.chatPreferences?.[selectedChatId || ''] || {};
    const isInputLocked = myPrefs.isInputLocked || false;
    const notice = activeChat?.notice;
    const isAuction = activeChat?.type === 'auction';

    const sortedChats = useMemo(() => {
        return (Object.values(chats) as Chat[])
            .filter(c => {
                // Hide auction chat if no auction is active
                if (c.type === 'auction' && !db.auction?.isActive) return false;
                return (c.participants || []).includes(currentUser!.name) || (c.participants || []).includes('ALL');
            })
            .sort((a, b) => {
                // Pin auction rooms always to top
                if (a.type === 'auction') return -1;
                if (b.type === 'auction') return 1;
                
                const pinA = currentUser?.chatPreferences?.[a.id]?.isPinned ? 1 : 0;
                const pinB = currentUser?.chatPreferences?.[b.id]?.isPinned ? 1 : 0;
                if (pinA !== pinB) return pinB - pinA;
                return (b.lastTimestamp || 0) - (a.lastTimestamp || 0);
            });
    }, [chats, currentUser?.chatPreferences, db.auction?.isActive]);

    const getBubbleClass = (msg: ChatMessage, isMine: boolean) => {
        if (isAuction) {
            if (msg.isWinningBid) return 'bg-green-600 text-white'; // Winning bid
            if (msg.type === 'system' || msg.type === 'notice') return 'bg-black/10 dark:bg-white/10 text-white dark:text-gray-300';
            return 'bg-red-600 text-white'; // Everyone in auction uses red (except winner/system)
        }

        const senderUser = userCache[toSafeId(msg.sender)] || (Object.values(userCache) as User[]).find(u => u.name === msg.sender);
        
        if (msg.sender === '한국은행' || senderUser?.govtRole === '한국은행장') return 'bg-blue-600 text-white';
        if (senderUser?.type === 'admin') return 'bg-red-600 text-white'; // High saturation red
        if (senderUser?.type === 'government') return 'bg-green-600 text-white';
        if (isMine) return 'bg-[#FEE500] text-black'; // Me (Citizen)
        return 'bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200'; // Other Citizens
    };

    // --- Actions ---
    const handleSendMessage = async () => {
        if (!selectedChatId || isInputLocked) return;
        if (!inputText.trim() && !replyingTo && !editingMsgId) return;

        if (isAuction) {
            // Auction Logic: Bid Update
            const price = parseInt(inputText);
            if (isNaN(price)) return showModal("경매에서는 가격(숫자)만 입력 가능합니다.");
            
            // Only update DB auction state if bid is valid
            const currentAuction = db.auction;
            if (!currentAuction || !currentAuction.isActive || currentAuction.status !== 'active') return showModal("진행 중인 경매가 없습니다.");
            if (price <= currentAuction.currentPrice) return showModal("현재가보다 높은 가격을 입력하세요.");

            // Update Auction State directly (Latency optimization)
            const newDb = { ...db };
            if (newDb.auction) {
                newDb.auction.currentPrice = price;
                newDb.auction.bids.push({
                    bidder: currentUser!.name,
                    amount: price,
                    timestamp: Date.now()
                });
                // Extension Rule: Add 30s if under threshold
                if (newDb.auction.endTime) newDb.auction.endTime = Math.max(newDb.auction.endTime, Date.now() + 30000); 
                await saveDb(newDb);
            }
        }

        if (editingMsgId) {
            await update(ref(database, `chatMessages/${selectedChatId}/${editingMsgId}`), {
                text: inputText,
                isEdited: true,
                editedAt: Date.now()
            });
            setEditingMsgId(null);
        } else {
            const msg: ChatMessage = {
                id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                sender: currentUser!.name,
                text: inputText,
                timestamp: Date.now(),
                replyTo: replyingTo ? { id: replyingTo.id, text: replyingTo.text, sender: replyingTo.sender } : undefined,
                type: isAuction ? 'auction_bid' : 'user'
            };
            await chatService.sendMessage(selectedChatId, msg);
        }
        setInputText('');
        setReplyingTo(null);
        setShowAttachMenu(false);
    };

    // ... (Other handlers preserved) ...
    // Note: Re-adding the missing handlers from previous file to ensure compilation
    const handleAdminNakchal = async (msg: ChatMessage) => {
        if (!isAuction) return;
        const isAdmin = currentUser?.type === 'admin' || currentUser?.subType === 'teacher' || currentUser?.type === 'root';
        if (!isAdmin) return;

        if (!await showConfirm(`${msg.sender}님의 입찰(₩${parseInt(msg.text).toLocaleString()})을 낙찰 처리하시겠습니까?`)) return;

        await update(ref(database, `chatMessages/${selectedChatId}/${msg.id}`), { isWinningBid: true });

        const newDb = { ...db };
        if (newDb.auction) {
            newDb.auction.isActive = false;
            newDb.auction.status = 'ended';
            newDb.auction.winner = msg.sender;
            newDb.auction.winningBid = parseInt(msg.text);
            
            const targetUserKey = Object.keys(newDb.users).find(k => (newDb.users[k] as User).name === msg.sender);
            
            if (targetUserKey && newDb.users[targetUserKey]) {
                (newDb.users[targetUserKey] as User).balanceKRW -= parseInt(msg.text);
                (newDb.users[targetUserKey] as User).transactions = [...((newDb.users[targetUserKey] as User).transactions || []), {
                    id: Date.now(), type: 'auction', amount: -parseInt(msg.text), currency: 'KRW', description: `경매 낙찰: ${newDb.auction.item.name}`, date: new Date().toISOString()
                }];
            }
            await saveDb(newDb);
        }
        
        await chatService.sendMessage(selectedChatId!, {
            id: `sys_${Date.now()}`, sender: 'system', text: `🎉 ${msg.sender}님이 ₩${parseInt(msg.text).toLocaleString()}에 낙찰되었습니다!`, timestamp: Date.now(), type: 'system'
        });
    };

    const handleReaction = async (msg: ChatMessage, emoji: string) => {
        const reactions = msg.reactions || {};
        if (reactions[currentUser!.name] === emoji) {
            delete reactions[currentUser!.name];
        } else {
            reactions[currentUser!.name] = emoji;
        }
        await update(ref(database, `chatMessages/${selectedChatId}/${msg.id}`), { reactions });
        setMsgContextMenu(null);
    };

    const handleUnsend = async (msg: ChatMessage) => {
        if (isAuction) return showModal("경매 입찰은 취소할 수 없습니다."); 
        if (Date.now() - msg.timestamp > 24 * 60 * 60 * 1000) return showModal("24시간이 지난 메시지는 회수할 수 없습니다.");
        if (msg.sender !== currentUser?.name) return;
        
        await update(ref(database, `chatMessages/${selectedChatId}/${msg.id}`), {
            text: "(메시지가 삭제되었습니다)",
            isUnsent: true,
            attachment: null
        });
        setMsgContextMenu(null);
    };

    const handleMsgLongPress = (e: React.TouchEvent | React.MouseEvent, msg: ChatMessage) => {
        if (isAuction && (currentUser?.type === 'admin' || currentUser?.subType === 'teacher')) {
             if (msg.type === 'auction_bid') {
                 handleAdminNakchal(msg);
                 return;
             }
        }

        if (e.type === 'contextmenu') { 
            e.preventDefault(); 
            setMsgContextMenu({ x: (e as React.MouseEvent).clientX, y: (e as React.MouseEvent).clientY, target: msg }); 
        } else {
            longPressTimer.current = setTimeout(() => {
                const t = (e as React.TouchEvent).touches[0];
                setMsgContextMenu({ x: t.clientX, y: t.clientY, target: msg });
            }, 500);
        }
    };

    const handleInvite = async () => {
        const name = prompt("초대할 사용자 이름을 입력하세요:");
        if (!name) return;
        const user = (Object.values(userCache) as User[]).find(u => u.name === name);
        if (!user) return showModal("사용자를 찾을 수 없습니다.");
        
        const participants = activeChat?.participants || [];
        if (participants.includes(name)) return showModal("이미 참여 중입니다.");
        
        await chatService.updateChat(selectedChatId!, { participants: [...participants, name] });
        await chatService.sendMessage(selectedChatId!, {
            id: `sys_${Date.now()}`, sender: 'system', text: `${currentUser!.name}님이 ${name}님을 초대했습니다.`, timestamp: Date.now(), type: 'system'
        });
    };

    const handleLeaveChat = async (chatId: string) => {
        if (!await showConfirm("채팅방을 나가시겠습니까? 대화 내용이 사라질 수 있습니다.")) return;
        const chat = chats[chatId];
        const newParticipants = (chat?.participants || []).filter(p => p !== currentUser?.name) || [];
        
        await chatService.sendMessage(chatId, { 
            id: `sys_${Date.now()}`, sender: 'system', text: `${currentUser?.name}님이 퇴장했습니다.`, timestamp: Date.now(), type: 'system' 
        });

        if (newParticipants.length === 0) {
            await remove(ref(database, `chatRooms/${chatId}`));
        } else {
            await chatService.updateChat(chatId, { participants: newParticipants });
        }
        setSelectedChatId(null);
        setListContextMenu(null);
    };

    const handleFileUpload = async (base64: string) => {
        try {
            const url = await uploadImage(`chat/${selectedChatId}/${Date.now()}`, base64);
            await chatService.sendMessage(selectedChatId!, {
                id: `msg_${Date.now()}_img`, sender: currentUser!.name, text: "사진을 보냈습니다.", timestamp: Date.now(),
                attachment: { type: 'image', value: '사진', data: { image: url } }
            });
        } catch(e) { showModal("업로드 실패"); }
        setShowAttachMenu(false);
    };

    // --- Renderers ---
    return (
        <div style={{
            position: 'fixed', top: 0, right: 0, bottom: 0, 
            width: sidebarWidth, transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
            transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)', zIndex: 5000,
            display: 'flex', flexDirection: 'column'
        }} className="bg-white dark:bg-[#121212] border-l border-gray-200 dark:border-gray-800 shadow-2xl font-sans">
            
            {/* List View */}
            {view === 'list' && (
                <div className="flex flex-col h-full bg-white dark:bg-[#121212]">
                    <div className="h-14 flex items-center justify-between px-4 border-b border-gray-100 dark:border-gray-800 shrink-0">
                        <h2 className="font-bold text-xl">채팅</h2>
                        <div className="flex gap-2">
                            <button onClick={() => setShowNewChatModal(true)} className="p-2 hover:bg-gray-100 dark:hover:bg-white/10 rounded-full"><LineIcon icon="plus" /></button>
                            <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-white/10 rounded-full"><LineIcon icon="close" /></button>
                        </div>
                    </div>
                    <div className="p-3 bg-white dark:bg-[#121212]">
                        <Input placeholder="검색 (친구, 채팅방)" value={searchChat} onChange={e => setSearchChat(e.target.value)} className="h-10 text-sm bg-gray-100 dark:bg-[#252525] border-none" />
                    </div>
                    <div className="flex-1 overflow-y-auto">
                        {sortedChats.map(chat => {
                            if (!chat.id) return null;
                            const title = chat.groupName || (chat.participants || []).filter(p => p !== currentUser?.name).join(', ') || '대화방';
                            const prefs = currentUser?.chatPreferences?.[chat.id];
                            const lastMsg = chat.lastMessage || "";
                            
                            const isAuc = chat.type === 'auction';
                            const bgClass = isAuc ? 'bg-red-50 dark:bg-red-900/10 border-l-4 border-red-500' : (prefs?.isPinned ? 'bg-gray-50 dark:bg-white/5' : '');

                            return (
                                <div 
                                    key={chat.id}
                                    onClick={() => setSelectedChatId(chat.id)}
                                    onContextMenu={(e) => { e.preventDefault(); setListContextMenu({ x: e.clientX, y: e.clientY, target: chat }); }}
                                    className={`flex items-center gap-3 p-3 px-4 hover:bg-gray-50 dark:hover:bg-white/5 cursor-pointer transition-colors ${bgClass}`}
                                >
                                    <div className={`w-12 h-12 rounded-[18px] flex items-center justify-center overflow-hidden border flex-shrink-0 ${isAuc ? 'bg-red-100 text-red-600 border-red-200' : 'bg-gray-200 dark:bg-gray-700 border-gray-100 dark:border-white/5'}`}>
                                        {chat.coverImage ? <img src={chat.coverImage} className="w-full h-full object-cover"/> : <span className="font-bold text-gray-500">{isAuc ? '경매' : title[0]}</span>}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex justify-between items-center mb-0.5">
                                            <p className={`font-bold text-sm truncate flex items-center gap-1 ${isAuc ? 'text-red-600' : ''}`}>
                                                {title}
                                                {(chat.participants || []).length > 2 && <span className="text-gray-400 font-normal">{(chat.participants || []).length}</span>}
                                                {prefs?.isMuted && <LineIcon icon="monitor" className="w-3 h-3 text-gray-400" />}
                                            </p>
                                            <span className="text-[10px] text-gray-400">{new Date(chat.lastTimestamp||0).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                                        </div>
                                        <p className="text-xs text-gray-500 truncate">{lastMsg}</p>
                                    </div>
                                    {(prefs?.isPinned || isAuc) && <span className="text-gray-400">📌</span>}
                                </div>
                            )
                        })}
                    </div>
                </div>
            )}

            {/* Chat Room View */}
            {view === 'chat' && activeChat && (
                <div className="flex flex-col h-full relative bg-[#b2c7d9] dark:bg-[#1b1b1b]" style={{ backgroundImage: myPrefs.backgroundImage ? `url(${myPrefs.backgroundImage})` : 'none', backgroundSize: 'cover' }}>
                    
                    {/* Auction Header */}
                    {isAuction && db.auction && db.auction.isActive && (
                        <div className="bg-red-600 text-white p-3 shadow-lg z-30 flex gap-3 items-center">
                            <div className="w-16 h-16 bg-white rounded-lg overflow-hidden shrink-0">
                                {db.auction.item.image ? <img src={db.auction.item.image} className="w-full h-full object-cover"/> : null}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="font-bold text-lg truncate">{db.auction.item.name}</p>
                                <div className="flex justify-between items-end">
                                    <span className="text-xs opacity-80">시작: ₩{db.auction.startingPrice.toLocaleString()}</p>
                                    <span className="text-xl font-black">₩{db.auction.currentPrice.toLocaleString()}</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Standard Header */}
                    {!isAuction && (
                        <div className="h-14 bg-white/95 dark:bg-[#1E1E1E]/95 backdrop-blur flex items-center px-3 justify-between border-b border-gray-100 dark:border-white/10 shrink-0 z-20 shadow-sm">
                            <div className="flex items-center gap-2 overflow-hidden">
                                <button onClick={() => setSelectedChatId(null)}><LineIcon icon="arrow-left" className="w-6 h-6" /></button>
                                <div className="flex-1 min-w-0 ml-1">
                                    <h3 className="font-bold text-base truncate flex items-center gap-1">
                                        {activeChat.groupName || (activeChat.participants || []).filter(p=>p!==currentUser?.name).join(', ')}
                                        {(activeChat.participants || []).length > 2 && <span className="text-gray-400 text-xs font-normal">{(activeChat.participants || []).length}</span>}
                                    </h3>
                                </div>
                            </div>
                            <div className="flex gap-4 pr-1">
                                <button onClick={() => setShowDrawer(true)}><LineIcon icon="menu" className="w-5 h-5 text-gray-600 dark:text-gray-400" /></button>
                            </div>
                        </div>
                    )}

                    {/* Message Area */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-2 scrollbar-hide" ref={scrollRef}>
                        {(Object.values(activeMessages) as ChatMessage[])
                            .filter(m => !(m.hiddenFor || []).includes(currentUser!.id!))
                            .sort((a,b) => a.timestamp - b.timestamp)
                            .map((msg, idx, arr) => {
                                const isMine = msg.sender === currentUser?.name;
                                const bubbleClass = getBubbleClass(msg, isMine);
                                const prevMsg = arr[idx - 1];
                                const showProfile = !isMine && (!prevMsg || prevMsg.sender !== msg.sender || (msg.timestamp - prevMsg.timestamp > 60000));
                                // Fix here: cast Object.values
                                const senderUser = userCache[toSafeId(msg.sender)] || (Object.values(userCache) as User[]).find(u => u.name === msg.sender);
                                
                                if (msg.type === 'system' || msg.type === 'notice') {
                                    return (
                                        <div key={msg.id} className="flex justify-center my-3">
                                            <span className="bg-black/10 dark:bg-white/10 text-white dark:text-gray-300 text-xs px-3 py-1 rounded-full whitespace-pre-wrap text-center">{msg.text}</span>
                                        </div>
                                    );
                                }

                                return (
                                    <div key={msg.id} className={`flex flex-col ${isMine ? 'items-end' : 'items-start'} group relative mb-1`}>
                                        <div className={`flex max-w-[80%] ${isMine ? 'flex-row-reverse' : 'flex-row'} items-start gap-2`}>
                                            {!isMine && showProfile ? (
                                                <div className="w-9 h-9 rounded-[14px] bg-gray-300 overflow-hidden flex-shrink-0 mt-1">
                                                    {senderUser?.profilePic ? <img src={senderUser.profilePic!} className="w-full h-full object-cover" /> : <span className="flex items-center justify-center h-full font-bold text-xs text-gray-500">{msg.sender[0]}</span>}
                                                </div>
                                            ) : !isMine && <div className="w-9 flex-shrink-0" />}
                                            
                                            <div className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
                                                {!isMine && showProfile && <p className="text-xs text-gray-500 mb-1 ml-1">{msg.sender}</p>}
                                                
                                                {/* Bubble */}
                                                <div 
                                                    className={`px-3 py-2 rounded-[14px] text-sm relative shadow-sm max-w-full break-words select-text ${bubbleClass} ${msg.isUnsent ? 'italic opacity-70' : ''}`}
                                                    onContextMenu={(e) => handleMsgLongPress(e, msg)}
                                                    onTouchStart={(e) => handleMsgLongPress(e, msg)}
                                                    onTouchEnd={() => { if (longPressTimer.current) clearTimeout(longPressTimer.current); }}
                                                >
                                                    {msg.isUnsent ? "삭제된 메시지입니다." : (
                                                        <>
                                                            <RichText text={msg.text} />
                                                            {msg.attachment?.type === 'image' && (
                                                                <img src={msg.attachment.data.image} className="mt-2 rounded-lg max-w-full max-h-60 object-contain cursor-pointer" onClick={() => window.open(msg.attachment?.data.image)} />
                                                            )}
                                                        </>
                                                    )}
                                                </div>
                                                
                                                <div className="flex items-center gap-1 mt-0.5 px-1">
                                                    <span className="text-[9px] text-gray-500 dark:text-gray-400 self-end min-w-fit">
                                                        {msg.isWinningBid && <span className="mr-1 font-bold text-green-600">낙찰됨</span>}
                                                        {new Date(msg.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        }
                    </div>

                    {/* Input Area */}
                    {!isInputLocked && (
                        <div className="bg-white dark:bg-[#1E1E1E] p-2 flex flex-col gap-2 border-t border-gray-100 dark:border-white/10 shrink-0 pb-safe">
                            {/* Auction restriction: No attachments */}
                            {showAttachMenu && !isAuction && (
                                <div className="grid grid-cols-4 gap-4 p-4 border-b border-gray-100 dark:border-white/10 animate-slide-up">
                                    <label className="flex flex-col items-center gap-2 cursor-pointer group">
                                        <div className="w-12 h-12 bg-yellow-100 dark:bg-yellow-900/30 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                                            <LineIcon icon="image" className="text-yellow-600 w-6 h-6" />
                                        </div>
                                        <span className="text-xs">앨범</span>
                                        <input type="file" accept="image/*" className="hidden" onChange={(e) => { if(e.target.files?.[0]) { const r=new FileReader(); r.onload=(v)=>handleFileUpload(v.target?.result as string); r.readAsDataURL(e.target.files[0]); } }} />
                                    </label>
                                </div>
                            )}

                            <div className="flex items-end gap-2">
                                {!isAuction && <button onClick={() => setShowAttachMenu(!showAttachMenu)} className="p-2 text-gray-400 hover:text-gray-600 transition-colors mb-1"><LineIcon icon="plus" className="w-6 h-6" /></button>}
                                <div className="flex-1 bg-gray-100 dark:bg-[#2D2D2D] rounded-[20px] px-4 py-2 min-h-[40px] flex items-center">
                                    <input
                                        type={isAuction ? "number" : "text"}
                                        className="w-full bg-transparent text-sm outline-none"
                                        placeholder={isAuction ? "입찰가 입력 (숫자만)" : "메시지 입력"}
                                        value={inputText}
                                        onChange={e => setInputText(e.target.value)}
                                        onKeyDown={e => { if(e.key === 'Enter') handleSendMessage(); }}
                                    />
                                </div>
                                <button onClick={handleSendMessage} className={`p-2 rounded-full mb-1 ${inputText ? 'bg-[#FEE500] text-black' : 'bg-gray-200 text-gray-400 dark:bg-gray-700'}`}><LineIcon icon="send" className="w-5 h-5" /></button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Context Menus */}
            {msgContextMenu && !isAuction && (
                <div className="fixed z-[6000] bg-white dark:bg-[#2D2D2D] rounded-xl shadow-2xl border border-gray-100 dark:border-white/10 overflow-hidden w-56 animate-scale-in" style={{ top: Math.min(window.innerHeight - 350, msgContextMenu.y), left: Math.min(window.innerWidth - 230, msgContextMenu.x) }}>
                    <div className="py-1">
                        {(msgContextMenu.target.sender === currentUser?.name) && (
                            <button onClick={() => handleUnsend(msgContextMenu.target)} className="w-full text-left px-4 py-3 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 text-sm flex items-center gap-3"><LineIcon icon="trash" className="w-4 h-4"/> 삭제 (회수)</button>
                        )}
                        <button onClick={() => setMsgContextMenu(null)} className="w-full text-left px-4 py-3 text-sm">닫기</button>
                    </div>
                </div>
            )}

            {/* Settings Modal (Name/Icon) */}
            <Modal isOpen={showSettingsModal} onClose={() => setShowSettingsModal(false)} title="채팅방 설정">
                <div className="space-y-6">
                    <div>
                        <label className="text-xs font-bold block mb-2 text-gray-500">채팅방 이름</label>
                        <div className="flex gap-2">
                            <Input placeholder={activeChat?.groupName || "이름 없음"} id="chatNameInput" className="py-2 text-sm flex-1" />
                            <Button onClick={() => { 
                                const val = (document.getElementById('chatNameInput') as HTMLInputElement).value;
                                if(val) chatService.updateChat(selectedChatId!, { groupName: val });
                                setShowSettingsModal(false);
                            }} className="text-xs whitespace-nowrap px-4">변경</Button>
                        </div>
                    </div>
                </div>
            </Modal>

            {showNewChatModal && <Modal isOpen={true} onClose={() => setShowNewChatModal(false)} title="새로운 채팅">
                <div className="space-y-4 h-[400px] flex flex-col">
                    <Input placeholder="이름 검색" className="w-full bg-gray-100 dark:bg-[#252525] border-none" onChange={e => { /* Local Filter Logic */ }} />
                    <div className="flex-1 overflow-y-auto space-y-1 pr-1">
                        {(Object.values(userCache) as User[])
                            .filter(u => u.name !== currentUser?.name && u.type !== 'admin')
                            .map(u => (
                            <div key={u.name} onClick={() => {
                                if (selectedUsersForChat.includes(u.name)) setSelectedUsersForChat(prev => prev.filter(p => p !== u.name));
                                else setSelectedUsersForChat(prev => [...prev, u.name]);
                            }} className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-colors ${selectedUsersForChat.includes(u.name) ? 'bg-yellow-100 dark:bg-yellow-900/30' : 'hover:bg-gray-50 dark:hover:bg-white/5'}`}>
                                <div className="flex items-center gap-3 flex-1 min-w-0">
                                    <div className="w-10 h-10 rounded-[14px] bg-gray-200 dark:bg-gray-700 overflow-hidden flex-shrink-0">
                                        {u.profilePic ? <img src={u.profilePic} className="w-full h-full object-cover"/> : <span className="flex items-center justify-center h-full font-bold text-gray-500">{u.name[0]}</span>}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-bold text-sm truncate text-black dark:text-white">{formatName(u.name)}</div>
                                        <div className="text-xs text-gray-400 truncate">{u.customJob || '시민'}</div>
                                    </div>
                                </div>
                                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${selectedUsersForChat.includes(u.name) ? 'bg-yellow-400 border-yellow-400' : 'border-gray-300'}`}>
                                    {selectedUsersForChat.includes(u.name) && <LineIcon icon="check" className="text-white w-3 h-3" />}
                                </div>
                            </div>
                        ))}
                    </div>
                    <Button onClick={async () => {
                        if (selectedUsersForChat.length === 0) return;
                        const newId = await chatService.createChat([currentUser!.name, ...selectedUsersForChat], selectedUsersForChat.length > 1 ? 'group' : 'private');
                        setSelectedChatId(newId);
                        setShowNewChatModal(false);
                        setSelectedUsersForChat([]);
                    }} className="w-full py-3 text-lg font-bold bg-[#FEE500] hover:bg-[#FEE500] text-black border-none shadow-none rounded-xl disabled:opacity-50" disabled={selectedUsersForChat.length === 0}>
                        {selectedUsersForChat.length}명 확인
                    </Button>
                </div>
            </Modal>}
        </div>
    );
};
