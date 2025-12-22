
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

    // UI States
    const [showAttachMenu, setShowAttachMenu] = useState(false);
    const [showDrawer, setShowDrawer] = useState(false);
    const [showNewChatModal, setShowNewChatModal] = useState(false);
    const [selectedUsersForChat, setSelectedUsersForChat] = useState<string[]>([]);
    
    // Transfer Options Modal
    const [showTransferOptions, setShowTransferOptions] = useState(false);
    
    // Context Menus
    const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
    const [msgContextMenu, setMsgContextMenu] = useState<{ x: number, y: number, target: ChatMessage | null } | null>(null);
    const [listContextMenu, setListContextMenu] = useState<{ x: number, y: number, target: Chat | null } | null>(null);

    // Transfer & ID
    const [showTransferModal, setShowTransferModal] = useState(false);
    const [transferAmount, setTransferAmount] = useState('');
    const [directTransferAmount, setDirectTransferAmount] = useState('');
    const [showDirectTransferModal, setShowDirectTransferModal] = useState(false);
    
    // ID Share States
    const [showIdChoiceModal, setShowIdChoiceModal] = useState(false);
    const [idTargetUser, setIdTargetUser] = useState<string | null>(null);

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
        if (selectedUsersForChat.length === 0) return showModal("대화 상대를 선택하세요.");
        
        // Prevent 1:1 with Admin/Teacher/Gov for non-privileged users
        if (selectedUsersForChat.length === 1 && !hasAdminPrivilege) {
            const targetName = selectedUsersForChat[0];
            const targetUser = userCache[Object.keys(userCache).find(k => userCache[k].name === targetName) || ''];
            
            if (targetUser && (targetUser.type === 'admin' || targetUser.type === 'root' || targetUser.subType === 'teacher')) {
                return showModal("관리자 또는 교사와는 1:1 채팅을 시작할 수 없습니다. 필요한 경우 피드백 기능을 이용하세요.");
            }
        }

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
        if (attachment?.data?.image && String(attachment.data.image).startsWith('data:image')) {
             return showModal("이미지 처리 오류: URL이 아닌 Base64가 감지되었습니다. 전송을 중단합니다.");
        }

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
            if (!url || !url.startsWith('http')) throw new Error("Invalid URL from server");
            
            await handleSendMessage("", {
                type: 'image',
                value: '사진',
                data: { image: url } 
            });
        } catch(e) {
            console.error(e);
            showModal("사진 업로드 및 전송에 실패했습니다.");
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

    const handleDirectTransfer = async () => {
        if (!selectedChatId) return;
        const amt = parseInt(directTransferAmount);
        if (isNaN(amt) || amt <= 0) return showModal("금액을 입력하세요.");
        if (currentUser!.balanceKRW < amt) return showModal("잔액이 부족합니다.");

        // Identify receiver
        const chat = chats[selectedChatId];
        const receiverName = chat.participants.find(p => p !== currentUser!.name);
        
        if (!receiverName) return showModal("받는 사람을 찾을 수 없습니다.");

        try {
            await serverAction('transfer', {
                senderId: currentUser!.name,
                receiverId: receiverName,
                amount: amt,
                senderMemo: "채팅 송금", 
                receiverMemo: "채팅 송금"
            });
            
            handleSendMessage("송금 완료", {
                type: 'transfer_request',
                value: '송금 완료',
                data: { amount: amt, currency: 'KRW', isRequest: false }
            });
            setShowDirectTransferModal(false);
            setDirectTransferAmount('');
        } catch(e) {
            showModal("송금 실패");
        }
    };

    const handleShareIDTrigger = () => {
        if (!selectedChatId || !currentUser?.profilePic) return showModal("프로필 사진이 없습니다. 설정에서 등록해주세요.");
        
        const chat = chats[selectedChatId];
        // 1:1 check
        if (chat.participants.length === 2) {
            const otherName = chat.participants.find(p => p !== currentUser.name);
            if (otherName) {
                // Find user info for logic
                // We might not have user info if not cached. 
                const targetUserKey = Object.keys(userCache).find(k => userCache[k].name === otherName);
                const targetUser = targetUserKey ? userCache[targetUserKey] : null;

                if (targetUser) {
                    if (targetUser.name === '한국은행' || targetUser.govtRole === '한국은행장') {
                        // Full ID
                        sendIDCard(false);
                    } else if (targetUser.type === 'government') {
                        // Choice
                        setIdTargetUser(targetUser.name);
                        setShowIdChoiceModal(true);
                    } else {
                        // Masked
                        sendIDCard(true);
                    }
                } else {
                    // Default to masked if info unknown
                    sendIDCard(true);
                }
            } else {
                sendIDCard(true);
            }
        } else {
            // Group chat -> Masked default
            sendIDCard(true);
        }
        setShowAttachMenu(false);
    };

    const sendIDCard = (masked: boolean) => {
        if (!currentUser) return;
        const resNum = currentUser.idCard?.residentNumber || `${currentUser.birthDate}-*******`;
        // Logic: if masked is true, ensure it's masked. if false, ensure it's full (if available)
        let finalResNum = resNum;
        
        if (masked) {
            if (finalResNum.length > 8 && !finalResNum.includes('*')) {
                // Manually mask: YYMMDD-G******
                finalResNum = finalResNum.substring(0, 8) + "******";
            }
        } else {
            // Unmask logic requires storing the full number securely?
            // In current simple implementation, 'residentNumber' might already be masked in currentUser state if not stored fully.
            // If the user entered it fully in Profile, it is stored.
            // Assuming currentUser holds the source of truth. 
            // If masked locally, we can't unmask. But let's assume it's available.
        }

        handleSendMessage("신분증 공유", {
            type: 'image',
            value: '신분증',
            data: { 
                image: currentUser.profilePic, 
                isIdCard: true, 
                name: currentUser.name, 
                birthDate: currentUser.birthDate, 
                gender: currentUser.gender, 
                address: currentUser.idCard?.address,
                residentNumber: finalResNum
            }
        });
        setShowIdChoiceModal(false);
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
        
        // Find sender details
        const senderInfo = userCache[msg.sender] || { name: msg.sender, profilePic: null, type: 'citizen', govtRole: '', subType: 'personal' };
        
        // --- Bubble Color Logic ---
        let bubbleColor = '';
        if (isMine) {
            bubbleColor = 'bg-[#FEE500] text-black'; // Kakao Yellow style for me
        } else {
            // Colors for others
            if (senderInfo.type === 'admin' || senderInfo.type === 'root' || senderInfo.subType === 'teacher') {
                bubbleColor = 'bg-red-100 text-red-900 border border-red-200 dark:bg-red-900 dark:text-red-100 dark:border-red-800'; // Admin/Teacher
            } else if (senderInfo.name === '한국은행' || senderInfo.govtRole === '한국은행장') {
                bubbleColor = 'bg-blue-100 text-blue-900 border border-blue-200 dark:bg-blue-900 dark:text-blue-100 dark:border-blue-800'; // Bank
            } else if (senderInfo.type === 'government') {
                bubbleColor = 'bg-green-100 text-green-900 border border-green-200 dark:bg-green-900 dark:text-green-100 dark:border-green-800'; // Gov
            } else {
                bubbleColor = 'bg-white text-black border border-gray-200 dark:bg-[#333] dark:text-white dark:border-gray-700'; // Normal
            }
        }

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
                                {senderInfo.profilePic ? <img src={senderInfo.profilePic} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center font-bold text-gray-500 text-xs">{(msg.sender || '?')[0]}</div>}
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
                        <div className={`px-3 py-2 rounded-[18px] text-sm relative shadow-sm group ${bubbleColor} ${isMine ? 'rounded-tr-none' : 'rounded-tl-none'}`}>
                            {msg.attachment?.type === 'image' && msg.attachment.data.isIdCard ? (
                                // ID CARD RENDERING
                                <div className="w-48 aspect-[1.58/1] bg-white text-black rounded-lg border border-gray-300 overflow-hidden shadow-sm relative p-2 flex flex-col justify-between select-none">
                                    <div className="flex items-center gap-1">
                                        <div className="w-3 h-3 rounded-full border border-gray-400 bg-gradient-to-br from-red-500 to-blue-500"></div>
                                        <span className="text-xs font-black">주민등록증</span>
                                    </div>
                                    <div className="flex gap-2">
                                        <div className="flex-1 space-y-0.5">
                                            <p className="font-bold text-sm">{msg.attachment.data.name}</p>
                                            <p className="text-[9px]">{msg.attachment.data.residentNumber}</p>
                                            <p className="text-[8px] text-gray-600">{msg.attachment.data.address || '성화국'}</p>
                                        </div>
                                        <div className="w-10 h-12 bg-gray-100 border overflow-hidden">
                                            <img src={msg.attachment.data.image} className="w-full h-full object-cover"/>
                                        </div>
                                    </div>
                                    <p className="text-[8px] text-center font-serif font-bold opacity-80">성화국 정부</p>
                                </div>
                            ) : msg.attachment?.type === 'image' ? (
                                <div className="rounded-xl overflow-hidden mt-1 cursor-pointer" onClick={() => showModal(<img src={msg.attachment!.data.image} className="w-full"/>)}>
                                    <img src={msg.attachment.data.image} className="max-w-full max-h-60 object-cover" loading="lazy" />
                                </div>
                            ) : msg.attachment?.type === 'transfer_request' ? (
                                <div className="flex flex-col gap-2 min-w-[180px]">
                                    <div className="flex items-center gap-2 border-b border-black/10 dark:border-white/10 pb-2 mb-1">
                                        <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">💸</div>
                                        <div>
                                            <p className="font-bold text-xs">{msg.attachment.data.isRequest ? '송금 요청' : '송금 완료'}</p>
                                            <p className="font-black text-lg">{msg.attachment.data.currency === 'USD' ? '$' : '₩'} {msg.attachment.data.amount.toLocaleString()}</p>
                                        </div>
                                    </div>
                                    {!isMine && msg.attachment.data.isRequest && (
                                        <Button className="py-2 text-xs bg-white text-black hover:bg-gray-100 font-bold border border-gray-300" onClick={() => {
                                            if (onAttachTab) {
                                                onAttachTab('이체'); 
                                                notify(msg.sender, "이체 탭으로 이동합니다.", false);
                                                onClose();
                                            } else {
                                                showModal("이체 탭으로 이동하여 송금해주세요.");
                                            }
                                        }}>송금하러 가기</Button>
                                    )}
                                </div>
                            ) : (<RichText text={msg.text} />)}
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

                {/* Chat Room View */}
                {view === 'chat' && activeChat && (
                    <div className="flex-1 flex flex-col h-full bg-[#E9E9EB] dark:bg-[#0F0F0F] relative w-full text-black dark:text-white">
                        {/* Header */}
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

                        {/* Messages */}
                        <div className="flex-1 overflow-y-auto p-4 scroll-smooth min-h-0" ref={scrollRef} style={myPrefs.backgroundImage ? { backgroundImage: `url(${myPrefs.backgroundImage})`, backgroundSize: 'cover' } : {}}>
                            {Object.values(activeMessages).length === 0 && <p className="text-center text-gray-500 mt-10 text-sm">대화 내용이 없습니다.</p>}
                            {(Object.values(activeMessages) as ChatMessage[]).sort((a: ChatMessage, b: ChatMessage)=>a.timestamp-b.timestamp).map(renderMessage)}
                        </div>

                        {/* Input Area */}
                        <div className="bg-white dark:bg-[#1C1C1E] border-t border-gray-200 dark:border-gray-800 shrink-0 relative p-2 pb-6 sm:pb-2 z-20 w-full">
                            {/* Attach Menu Above Input */}
                            {showAttachMenu && !isAuctionChat && (
                                <div className="absolute bottom-full left-0 right-0 p-4 bg-white dark:bg-[#1C1C1E] border-t border-gray-200 dark:border-gray-800 animate-slide-up grid grid-cols-4 gap-4 z-50 shadow-lg rounded-t-2xl mx-2 mb-2">
                                    <button onClick={() => document.getElementById('chat-file-input')?.click()} className="flex flex-col items-center gap-2">
                                        <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-[#2D2D2D] flex items-center justify-center text-black dark:text-white hover:opacity-80"><LineIcon icon="image" /></div>
                                        <span className="text-xs text-gray-500">사진</span>
                                    </button>
                                    <button onClick={() => setShowTransferOptions(true)} className="flex flex-col items-center gap-2">
                                        <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-[#2D2D2D] flex items-center justify-center text-black dark:text-white hover:opacity-80"><LineIcon icon="finance" /></div>
                                        <span className="text-xs text-gray-500">송금</span>
                                    </button>
                                    <button onClick={handleShareIDTrigger} className="flex flex-col items-center gap-2">
                                        <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-[#2D2D2D] flex items-center justify-center text-black dark:text-white hover:opacity-80"><LineIcon icon="id_card" /></div>
                                        <span className="text-xs text-gray-500">신분증</span>
                                    </button>
                                    <input type="file" id="chat-file-input" className="hidden" accept="image/*" onChange={e => {
                                        if(e.target.files?.[0]) {
                                            const reader = new FileReader();
                                            reader.onload = (ev) => handleFileUpload(ev.target?.result as string);
                                            reader.readAsDataURL(e.target.files[0]);
                                        }
                                        setShowAttachMenu(false);
                                    }} />
                                </div>
                            )}

                            {replyingTo && (
                                <div className="p-2 bg-gray-100 dark:bg-gray-800 border-l-4 border-green-500 text-xs text-gray-600 dark:text-gray-300 flex justify-between items-center mb-2 rounded">
                                    <div className="truncate max-w-[200px]"><span className="font-bold block text-[10px]">{replyingTo.sender}에게 답장</span>{replyingTo.text}</div>
                                    <button onClick={() => setReplyingTo(null)} className="p-2">✕</button>
                                </div>
                            )}

                            <div className="flex items-center gap-2">
                                {!isAuctionChat && (
                                    <button onClick={() => setShowAttachMenu(!showAttachMenu)} className={`p-2 rounded-full transition-transform ${showAttachMenu ? 'rotate-45' : ''}`}>
                                        <LineIcon icon="plus" className="w-6 h-6 text-gray-400" />
                                    </button>
                                )}
                                
                                <textarea 
                                    className="flex-1 bg-gray-100 dark:bg-[#2D2D2D] rounded-xl px-4 py-3 text-sm text-black dark:text-white outline-none resize-none max-h-24 scrollbar-hide"
                                    placeholder={isAuctionChat ? "입찰가 (숫자만)" : "메시지 입력"}
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
                        </div>
                    </div>
                )}

                {/* Drawer */}
                {showDrawer && activeChat && (
                    <div className="absolute inset-0 z-[6000] bg-black/50 flex justify-end animate-fade-in" onClick={() => setShowDrawer(false)}>
                        <div className="w-64 h-full bg-white dark:bg-[#1C1C1E] shadow-2xl flex flex-col animate-slide-left text-black dark:text-white" onClick={e => e.stopPropagation()}>
                            <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center">
                                <h3 className="font-bold text-lg">채팅방 설정</h3>
                                <button onClick={() => setShowDrawer(false)}><LineIcon icon="close" /></button>
                            </div>
                            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                                <div>
                                    <p className="text-xs text-gray-500 mb-2 uppercase font-bold">대화상대</p>
                                    <div className="space-y-2">
                                        {activeChat.participants.map(p => (
                                            <div key={p} className="flex items-center gap-2 text-sm">
                                                <div className="w-6 h-6 rounded-full bg-gray-300 dark:bg-gray-700 flex items-center justify-center text-xs">{(p || '?')[0]}</div>
                                                <span>{p}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <button onClick={() => handleLeaveChatAction(activeChat.id)} className="w-full py-2 bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-500 rounded font-bold text-sm hover:opacity-80 mt-auto">나가기</button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Transfer Options Modal */}
                <Modal isOpen={showTransferOptions} onClose={() => setShowTransferOptions(false)} title="송금 옵션">
                    <div className="space-y-3">
                        <Button onClick={() => { setShowTransferOptions(false); setShowDirectTransferModal(true); }} className="w-full py-4 text-lg bg-green-600 hover:bg-green-500">
                            직접 송금
                        </Button>
                        <Button onClick={() => { setShowTransferOptions(false); setShowTransferModal(true); }} className="w-full py-4 text-lg bg-blue-600 hover:bg-blue-500">
                            송금 요청
                        </Button>
                    </div>
                </Modal>

                {/* Direct Transfer Modal */}
                <Modal isOpen={showDirectTransferModal} onClose={() => setShowDirectTransferModal(false)} title="직접 송금">
                    <div className="space-y-4">
                        <MoneyInput value={directTransferAmount} onChange={e => setDirectTransferAmount(e.target.value)} placeholder="보낼 금액 (₩)" />
                        <Button onClick={handleDirectTransfer} className="w-full">보내기</Button>
                    </div>
                </Modal>

                {/* Transfer Request Modal */}
                <Modal isOpen={showTransferModal} onClose={() => setShowTransferModal(false)} title="송금 요청">
                    <div className="space-y-4">
                        <MoneyInput value={transferAmount} onChange={e => setTransferAmount(e.target.value)} placeholder="요청 금액 (₩)" />
                        <Button onClick={handleSendTransferRequest} className="w-full">요청 보내기</Button>
                    </div>
                </Modal>

                {/* ID Choice Modal (For Officials) */}
                <Modal isOpen={showIdChoiceModal} onClose={() => setShowIdChoiceModal(false)} title="신분증 전송 선택">
                    <div className="space-y-4 text-center">
                        <p className="text-sm text-gray-500">
                            <b>{idTargetUser}</b>님은 공무원입니다.<br/>
                            주민등록번호 전체를 공개하시겠습니까?
                        </p>
                        <div className="flex gap-2">
                            <Button onClick={() => sendIDCard(true)} variant="secondary" className="flex-1">마스킹 전송</Button>
                            <Button onClick={() => sendIDCard(false)} className="flex-1 bg-red-600 hover:bg-red-500">전체 공개</Button>
                        </div>
                    </div>
                </Modal>
                
                {/* New Chat Modal (User List) */}
                <Modal isOpen={showNewChatModal} onClose={() => setShowNewChatModal(false)} title="새 채팅">
                    <div className="space-y-4">
                        <Input placeholder="이름 검색" className="w-full mb-2" onChange={e => { /* Local filter logic could be added here */ }} />
                        <div className="max-h-80 overflow-y-auto space-y-2 grid grid-cols-1">
                            {Object.values(userCache)
                                .filter((u: User) => u.name !== currentUser?.name && u.type !== 'admin' && u.type !== 'root' && u.subType !== 'teacher')
                                .sort((a,b) => (a.name || '').localeCompare(b.name || ''))
                                .map((u: User) => (
                                <div key={u.name} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${selectedUsersForChat.includes(u.name) ? 'bg-green-50 border-green-500 dark:bg-green-900/30' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:shadow-md'}`} 
                                    onClick={() => {
                                        if(selectedUsersForChat.includes(u.name)) setSelectedUsersForChat(selectedUsersForChat.filter(n=>n!==u.name));
                                        else setSelectedUsersForChat([...selectedUsersForChat, u.name]);
                                    }}
                                >
                                    <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-600 overflow-hidden flex items-center justify-center">
                                        {u.profilePic ? <img src={u.profilePic} className="w-full h-full object-cover"/> : <span className="font-bold text-gray-500">{(u.name || '?')[0]}</span>}
                                    </div>
                                    <div className="flex-1">
                                        <p className="font-bold text-sm text-black dark:text-white">{formatName(u.name)}</p>
                                        <p className="text-xs text-gray-500">{u.customJob || u.type}</p>
                                    </div>
                                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${selectedUsersForChat.includes(u.name) ? 'bg-green-500 border-green-500' : 'border-gray-300'}`}>
                                        {selectedUsersForChat.includes(u.name) && <LineIcon icon="check" className="w-3 h-3 text-white" />}
                                    </div>
                                </div>
                            ))}
                        </div>
                        <Button onClick={handleCreateChat} className="w-full py-3" disabled={selectedUsersForChat.length === 0}>
                            {selectedUsersForChat.length}명과 채팅하기
                        </Button>
                    </div>
                </Modal>
            </div>

            {/* Context Menus */}
            {msgContextMenu && createPortal(
                <div 
                    className="fixed z-[9999] bg-white dark:bg-[#2D2D2D] border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl overflow-hidden min-w-[150px] animate-scale-in"
                    style={{ top: Math.min(msgContextMenu.y, window.innerHeight - 200), left: Math.min(msgContextMenu.x, window.innerWidth - 160) }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <button className="w-full text-left px-4 py-3 hover:bg-gray-100 dark:hover:bg-white/10 text-sm text-black dark:text-white" onClick={() => { setReplyingTo(msgContextMenu.target); setMsgContextMenu(null); }}>답장</button>
                    <button className="w-full text-left px-4 py-3 hover:bg-gray-100 dark:hover:bg-white/10 text-sm text-black dark:text-white" onClick={() => { navigator.clipboard.writeText(msgContextMenu.target?.text || ''); setMsgContextMenu(null); }}>복사</button>
                    {(msgContextMenu.target?.sender === currentUser?.name || hasAdminPrivilege) && (
                        <button className="w-full text-left px-4 py-3 text-red-500 hover:bg-gray-100 dark:hover:bg-white/10 text-sm" onClick={() => { handleDeleteMessage(msgContextMenu.target!); }}>삭제 (모두에게)</button>
                    )}
                    <button className="w-full text-left px-4 py-3 text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10 text-sm" onClick={() => { setHiddenMessages([...hiddenMessages, msgContextMenu.target!.id]); setMsgContextMenu(null); }}>삭제 (나에게만)</button>
                </div>,
                document.body
            )}

            {listContextMenu && createPortal(
                <div 
                    className="fixed z-[9999] bg-white dark:bg-[#2D2D2D] border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl overflow-hidden min-w-[150px] animate-scale-in"
                    style={{ top: Math.min(listContextMenu.y, window.innerHeight - 200), left: Math.min(listContextMenu.x, window.innerWidth - 160) }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <button className="w-full text-left px-4 py-3 hover:bg-gray-100 dark:hover:bg-white/10 text-sm text-black dark:text-white" onClick={() => handleTogglePin(listContextMenu.target!)}>
                        {currentUser?.chatPreferences?.[listContextMenu.target!.id]?.isPinned ? '상단 고정 해제' : '상단 고정'}
                    </button>
                    <button className="w-full text-left px-4 py-3 hover:bg-gray-100 dark:hover:bg-white/10 text-sm text-black dark:text-white" onClick={() => handleToggleMute(listContextMenu.target!)}>
                        {currentUser?.chatPreferences?.[listContextMenu.target!.id]?.isMuted ? '알림 켜기' : '알림 끄기'}
                    </button>
                    <button className="w-full text-left px-4 py-3 text-red-500 hover:bg-gray-100 dark:hover:bg-white/10 text-sm font-bold" onClick={() => handleLeaveChatAction(listContextMenu.target!.id)}>
                        채팅방 나가기
                    </button>
                </div>,
                document.body
            )}
        </>
    );
};
