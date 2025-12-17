
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useGame } from '../context/GameContext';
import { chatService, uploadImage, searchUsersByName, fetchUserListLite, searchMessages } from '../services/firebase'; 
import { Button, Input, formatName, LineIcon, Modal, FileInput, SwipeableListItem, Toggle } from './Shared';
import { User, Chat, ChatMessage, ChatReaction } from '../types';

interface ChatSystemProps {
    isOpen: boolean;
    onClose: () => void;
    onAttachTab: (tabName: string) => void;
}

const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    return isToday ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : date.toLocaleDateString();
};

export const ChatSystem: React.FC<ChatSystemProps> = ({ isOpen, onClose, onAttachTab }) => {
    const { db, currentUser, sendMessage, createChat, markChatRead, markChatManualUnread, toggleChatPin, updatePinnedOrder, deleteChat, restoreChat, hardDeleteChat, muteChat, serverAction, showModal, showConfirm, notify, updateUser } = useGame();
    
    // Navigation
    const [view, setView] = useState<'list' | 'chat' | 'new'>('list');
    const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
    
    // Filter & Selection State
    const [filter, setFilter] = useState<'all' | 'unread' | 'deleted'>('all');
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [selectedChatIds, setSelectedChatIds] = useState<Set<string>>(new Set());
    const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);

    // Data
    const [chats, setChats] = useState<Record<string, Chat>>({});
    const [activeMessages, setActiveMessages] = useState<Record<string, ChatMessage>>({});
    
    // Message Search
    const [inputText, setInputText] = useState('');
    const [msgSearchTerm, setMsgSearchTerm] = useState('');
    
    // New Chat (User Selection)
    const [userCategory, setUserCategory] = useState<'all' | 'citizen' | 'mart' | 'gov' | 'teacher'>('all');
    const [userList, setUserList] = useState<{name:string, type:string}[]>([]);
    const [selectedUsersForChat, setSelectedUsersForChat] = useState<Set<string>>(new Set());
    const [isTeamChatCreation, setIsTeamChatCreation] = useState(false);
    
    // Actions
    const [attachMenuOpen, setAttachMenuOpen] = useState(false);
    
    // Chat Settings Drawer
    const [isSettingsDrawerOpen, setIsSettingsDrawerOpen] = useState(false);

    // Edit Chat Info (Settings Modal State)
    const [editChatName, setEditChatName] = useState('');
    const [editChatProfile, setEditChatProfile] = useState<string | null>(null);

    const scrollRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Subscriptions
    useEffect(() => {
        if (!isOpen) return;
        const unsubscribe = chatService.subscribeToChatList(setChats);
        return () => unsubscribe();
    }, [isOpen]);

    useEffect(() => {
        if (view === 'chat' && selectedChatId) {
            setActiveMessages({});
            const unsubscribe = chatService.subscribeToMessages(selectedChatId, 50, setActiveMessages);
            return () => unsubscribe();
        }
    }, [view, selectedChatId]);

    // Load User List for New Chat
    useEffect(() => {
        if (view === 'new') {
            const loadUsers = async () => {
                const users = await fetchUserListLite(userCategory);
                setUserList(users);
            };
            loadUsers();
        }
    }, [view, userCategory]);

    const myChats = useMemo(() => {
        if (!currentUser) return [];
        let list = (Object.values(chats) as Chat[])
            .filter((c: Chat) => c.participants && c.participants.includes(currentUser.name) && c.type !== 'feedback');
        
        // Client-side search for preview (Last Message)
        if (msgSearchTerm.trim()) {
            list = list.filter(c => c.lastMessage && c.lastMessage.includes(msgSearchTerm));
        }

        return list.sort((a, b) => (b.lastTimestamp || 0) - (a.lastTimestamp || 0));
    }, [chats, currentUser, msgSearchTerm]);

    const pinnedChats = useMemo(() => {
        return myChats.filter(c => c.pinnedBy?.[currentUser!.name] !== undefined)
            .sort((a, b) => (a.pinnedBy![currentUser!.name] || 0) - (b.pinnedBy![currentUser!.name] || 0));
    }, [myChats, currentUser]);

    const unpinnedChats = useMemo(() => {
        return myChats.filter(c => c.pinnedBy?.[currentUser!.name] === undefined);
    }, [myChats, currentUser]);

    const filteredChats = useMemo(() => {
        let list = [...unpinnedChats]; 
        
        if (filter === 'unread') {
            list = list.filter(c => {
                const readTime = c.readStatus?.[currentUser!.name] || 0;
                const isUnread = (c.lastTimestamp || 0) > readTime;
                const manualUnread = c.manualUnread?.[currentUser!.name];
                return isUnread || manualUnread;
            });
        } else if (filter === 'deleted') {
            list = myChats.filter(c => c.deletedBy && c.deletedBy[currentUser!.name]); 
        } else {
            list = list.filter(c => !(c.deletedBy && c.deletedBy[currentUser!.name]));
        }
        return list;
    }, [unpinnedChats, myChats, filter, currentUser]);

    const messages = useMemo(() => {
        return (Object.values(activeMessages) as ChatMessage[]).sort((a,b) => a.timestamp - b.timestamp);
    }, [activeMessages]);

    const activeChat = selectedChatId ? chats[selectedChatId] : null;
    
    // Name Logic
    const getChatName = (chat: Chat) => {
        if (!chat || !currentUser) return '';
        if (chat.localGroupNames?.[currentUser.name]) return chat.localGroupNames[currentUser.name];
        if (chat.groupName) return chat.groupName;
        // Generate name from participants
        const otherNames = chat.participants.filter(p => p !== currentUser.name);
        if (otherNames.length === 0) return `${currentUser.name} (나)`;
        return otherNames.map(n => formatName(n)).join(', ');
    };

    const displayChatName = activeChat ? getChatName(activeChat) : '';
    const isMuted = activeChat?.mutedBy?.includes(currentUser?.name || '');

    // Is current user owner or admin of this team chat?
    const isTeamAdmin = useMemo(() => {
        if (!activeChat || !currentUser) return false;
        if (!activeChat.isTeamChat) return true; // Normal chat - anyone can edit local settings
        return activeChat.ownerId === currentUser.name || activeChat.adminIds?.includes(currentUser.name);
    }, [activeChat, currentUser]);

    // Partner Info for 1:1 Chat
    const partnerInfo = useMemo(() => {
        if (!activeChat || activeChat.participants.length !== 2 || !currentUser) return null;
        const partnerId = activeChat.participants.find(p => p !== currentUser.name);
        if (!partnerId) return null;
        return db.users[partnerId];
    }, [activeChat, currentUser, db.users]);

    // Clear notifications related to this chat when opening
    const clearRelatedNotifications = async (chatId: string) => {
        if (!currentUser) return;
        const notifs = currentUser.notifications ? (Array.isArray(currentUser.notifications) ? currentUser.notifications : Object.values(currentUser.notifications)) : [];
        // Filter out notifications that have data.chatId === chatId OR check ephemeral logic
        const newNotifs = notifs.filter(n => {
            // Check if actionData has chatId or if it's a message notification
            // This logic depends on how notifications are structured. Assuming standard structure:
            if (n.actionData && n.actionData.chatId === chatId) return false;
            return true;
        });
        
        if (newNotifs.length !== notifs.length) {
            await updateUser(currentUser.name, { notifications: newNotifs });
        }
    };

    useEffect(() => {
        if (scrollRef.current && view === 'chat') scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        if (selectedChatId && view === 'chat') {
            markChatRead(selectedChatId);
            clearRelatedNotifications(selectedChatId);
        }
    }, [messages.length, view, selectedChatId]);

    // --- Actions ---

    const handleStartChat = async () => {
        if (selectedUsersForChat.size === 0) return;
        const participants = Array.from(selectedUsersForChat);
        
        let targetId = null;
        // 1:1 or Self
        if (participants.length === 1 && !isTeamChatCreation) {
            const target = participants[0];
            const pList = target === currentUser?.name ? [target] : [target, currentUser!.name];
            targetId = await chatService.findExistingPrivateChat(pList);
        }

        if (!targetId) {
            const type = participants.length > 1 || isTeamChatCreation ? 'group' : 'private';
            const name = type === 'group' ? `${currentUser?.name}, ${participants.join(', ')}` : undefined;
            // Create
            targetId = await createChat(participants, type, name, isTeamChatCreation);
        }

        setSelectedChatId(targetId);
        setView('chat');
        setSelectedUsersForChat(new Set());
        setMsgSearchTerm('');
        setIsTeamChatCreation(false);
    };

    const toggleUserSelection = (name: string) => {
        const newSet = new Set(selectedUsersForChat);
        if (newSet.has(name)) newSet.delete(name);
        else newSet.add(name);
        setSelectedUsersForChat(newSet);
    };

    const handleLeaveChat = async () => {
        if (!selectedChatId) return;
        if (await showConfirm("채팅방을 나가시겠습니까? (목록에서 숨김)")) {
            await deleteChat(selectedChatId);
            setView('list');
            setIsSettingsDrawerOpen(false);
        }
    };

    const handleRestoreSelected = async () => {
        for(const id of Array.from(selectedChatIds)) await restoreChat(id);
        setIsSelectionMode(false);
        setSelectedChatIds(new Set());
        showModal("선택한 채팅방이 복원되었습니다.");
    };

    const handleHardDeleteSelected = async () => {
        if(await showConfirm("정말 영구 삭제하시겠습니까? 복구할 수 없습니다.")) {
            for(const id of Array.from(selectedChatIds)) await hardDeleteChat(id);
            setIsSelectionMode(false);
            setSelectedChatIds(new Set());
            showModal("선택한 채팅방이 영구 삭제되었습니다.");
        }
    };

    const handleInputKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter') {
            if (!e.shiftKey) {
                e.preventDefault();
                if (!e.nativeEvent.isComposing) {
                    handleSendMessage();
                }
            }
        }
    };

    const handleSendMessage = async () => {
        if (selectedChatId && inputText.trim()) {
            // Keep text in temp var before clearing to avoid race condition with state
            const textToSend = inputText;
            setInputText(''); // Clear immediately
            
            // Reset height
            const textarea = document.querySelector('textarea');
            if(textarea) textarea.style.height = 'auto';

            await sendMessage(selectedChatId, textToSend);
        }
    };

    const renderChatItem = (chat: Chat, isPinnedSection = false) => {
        const chatName = getChatName(chat);
        const readTime = chat.readStatus?.[currentUser!.name] || 0;
        const isUnreadSystem = (chat.lastTimestamp || 0) > readTime;
        const isManualUnread = chat.manualUnread?.[currentUser!.name];
        const showBlueDot = isUnreadSystem || isManualUnread;
        const isSelected = selectedChatIds.has(chat.id);
        const isMuted = chat.mutedBy?.includes(currentUser!.name);
        
        // Check if self-chat for visual
        const isSelfChat = chat.participants.length === 1 && chat.participants[0] === currentUser?.name;

        const content = (
            <div 
                className={`flex items-center gap-4 p-4 transition-colors h-[88px] ${isSelected ? 'bg-blue-50 dark:bg-blue-900/30' : 'bg-white dark:bg-[#1E1E1E]'}`}
                onClick={() => {
                    if (isSelectionMode) {
                        const newSet = new Set(selectedChatIds);
                        if (newSet.has(chat.id)) newSet.delete(chat.id);
                        else newSet.add(chat.id);
                        setSelectedChatIds(newSet);
                        if (newSet.size === 0) setIsSelectionMode(false);
                    } else { 
                        setSelectedChatId(chat.id); setView('chat'); 
                    }
                }}
                onContextMenu={(e) => {
                    e.preventDefault();
                    setIsSelectionMode(true);
                    const newSet = new Set(selectedChatIds);
                    newSet.add(chat.id);
                    setSelectedChatIds(newSet);
                }}
            >
                {isSelectionMode && (
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${isSelected ? 'bg-blue-500 border-blue-500' : 'border-gray-300'}`}>
                        {isSelected && <LineIcon icon="check" className="w-3 h-3 text-white" />}
                    </div>
                )}
                
                <div className="relative">
                    <div className="w-14 h-14 rounded-[20px] bg-gray-200 dark:bg-gray-700 flex items-center justify-center font-bold text-xl text-gray-600 dark:text-gray-300 flex-shrink-0 overflow-hidden border border-gray-100 dark:border-gray-600 shadow-sm">
                        {chat.groupProfilePic ? (
                            <img src={chat.groupProfilePic} className="w-full h-full object-cover" />
                        ) : (
                            formatName(chatName)[0]
                        )}
                    </div>
                    {showBlueDot && (
                        <div className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded-full border-2 border-white dark:border-black shadow-sm">
                            {chat.unreadCount?.[currentUser!.name] || 'N'}
                        </div>
                    )}
                </div>
                
                <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
                    <div className="flex justify-between items-center">
                        <h4 className="font-bold truncate text-base flex items-center gap-2 text-gray-900 dark:text-gray-100">
                            {chatName} 
                            {isSelfChat && <div className="w-2 h-2 bg-gray-400 rounded-full" title="나와의 채팅"></div>}
                            {chat.isTeamChat && <span className="text-[9px] bg-black text-white px-1 rounded font-bold">TEAM</span>}
                            {isMuted && <LineIcon icon="bell-off" className="w-3 h-3 text-gray-400" />}
                        </h4>
                        <span className="text-[11px] text-gray-400 whitespace-nowrap">{formatTime(chat.lastTimestamp || 0)}</span>
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400 truncate leading-tight">{chat.lastMessage}</p>
                </div>
            </div>
        );

        if (isSelectionMode || filter === 'deleted') return <div key={chat.id}>{content}</div>;

        // Native-like Swipe Actions
        const swipeRightButtons = (
            <div className="flex h-full w-full">
                <div 
                    className="h-full bg-blue-500 flex items-center justify-center text-white cursor-pointer px-4 flex-1 font-bold text-xs"
                    onClick={async () => {
                        const isUnread = (chat.lastTimestamp || 0) > (chat.readStatus?.[currentUser!.name] || 0) || chat.manualUnread?.[currentUser!.name];
                        if (isUnread) await markChatRead(chat.id); else await markChatManualUnread(chat.id);
                    }}
                >
                    읽음
                </div>
                <div 
                    className="h-full bg-yellow-500 flex items-center justify-center text-white cursor-pointer px-4 flex-1 font-bold text-xs"
                    onClick={async () => {
                        const isPinned = !!chat.pinnedBy?.[currentUser!.name];
                        await toggleChatPin(chat.id, !isPinned);
                    }}
                >
                    고정
                </div>
            </div>
        );

        const swipeLeftButtons = (
            <div className="flex h-full w-full justify-end">
                <div 
                    className="h-full bg-gray-400 flex items-center justify-center text-white cursor-pointer px-4 flex-1 font-bold text-xs"
                    onClick={async () => {
                        await muteChat(chat.id, !chat.mutedBy?.includes(currentUser!.name));
                    }}
                >
                    알림
                </div>
                <div 
                    className="h-full bg-red-600 flex items-center justify-center text-white cursor-pointer px-4 flex-1 font-bold text-xs"
                    onClick={async () => {
                        if (await showConfirm("채팅방을 나가시겠습니까?")) await deleteChat(chat.id);
                    }}
                >
                    나가기
                </div>
            </div>
        );

        return (
            <div key={chat.id}>
                <SwipeableListItem
                    swipeRightContent={swipeRightButtons}
                    swipeLeftContent={swipeLeftButtons}
                    leftThreshold={140}
                    rightThreshold={140}
                >
                    {content}
                </SwipeableListItem>
            </div>
        );
    };

    const handleAttachAction = async (type: 'image' | 'file' | 'id_card' | 'thread') => {
        setAttachMenuOpen(false);
        if (type === 'thread') {
            const title = prompt("스레드 주제:");
            if (title) await sendMessage(selectedChatId!, title, { type: 'proposal', value: title, data: { isThreadStart: true } });
        } else if (type === 'id_card') {
            if (currentUser?.idCard) await sendMessage(selectedChatId!, "[신분증]", { type: 'id_card', value: '신분증', data: currentUser.idCard });
        } else {
            fileInputRef.current?.click();
        }
    };

    const openChatSettings = () => {
        if (!activeChat) return;
        setEditChatName(getChatName(activeChat));
        setEditChatProfile(activeChat.groupProfilePic || null);
        setIsSettingsDrawerOpen(true);
    };

    const saveChatSettings = async () => {
        if (!activeChat || !currentUser) return;
        
        let updates: any = {};
        
        if (editChatProfile && editChatProfile.startsWith('data:')) {
            const url = await uploadImage(`chat_profiles/${activeChat.id}`, editChatProfile);
            updates.groupProfilePic = url;
        } else if (editChatProfile === null) {
            updates.groupProfilePic = null;
        }

        if (activeChat.isTeamChat) {
            if (activeChat.ownerId === currentUser.name || activeChat.adminIds?.includes(currentUser.name)) {
                updates.groupName = editChatName;
            } else {
                if (!updates.localGroupNames) updates[`localGroupNames/${currentUser.name}`] = editChatName;
            }
        } else {
            updates[`localGroupNames/${currentUser.name}`] = editChatName;
        }

        await chatService.updateChatMetadata(activeChat.id, updates);
        setIsSettingsDrawerOpen(false);
        showModal("저장되었습니다.");
    };

    const renderMessage = (msg: ChatMessage) => {
        const isMine = msg.sender === currentUser?.name;
        const isSystem = msg.sender === 'system' || (msg.sender === '한국은행' && msg.attachment?.type === 'application');
        return (
            <div key={msg.id} className={`flex flex-col mb-4 ${isMine ? 'items-end' : 'items-start'}`}>
                <div className={`max-w-[80%] p-3 rounded-2xl text-sm relative shadow-sm ${
                        isSystem ? 'bg-gray-100 text-gray-800 border border-gray-300 w-full text-center' :
                        isMine ? 'bg-[#FAE100] text-black rounded-tr-none' : 
                        'bg-white dark:bg-gray-800 dark:text-white border border-transparent rounded-tl-none'
                    }`}>
                        <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                        {msg.attachment?.type === 'image' && msg.attachment.data?.image && (
                            <img src={msg.attachment.data.image} alt="첨부 이미지" className="mt-2 rounded-lg max-w-full max-h-60 object-contain" />
                        )}
                        <div className={`text-[10px] opacity-50 text-right mt-1`}>
                            {new Date(msg.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
                        </div>
                </div>
            </div>
        );
    };

    // Z-Index 100 ensures it covers the Mobile Tabs (z-40)
    return (
        <div className={`fixed inset-0 z-[100] w-full sm:w-[450px] sm:left-auto sm:right-0 bg-[#F5F5F5] dark:bg-[#121212] flex flex-col transition-transform duration-300 transform ${isOpen ? 'translate-x-0' : 'translate-x-full'} font-sans shadow-2xl`}>
            
            {/* HEADER */}
            <div className="h-14 bg-white dark:bg-[#1E1E1E] flex items-center justify-between px-4 z-20 relative shadow-sm shrink-0">
                {view === 'list' ? (
                    <>
                        <h2 className="font-bold text-xl">
                            {filter === 'all' ? '채팅' : (filter === 'unread' ? '안 읽은 메시지' : '휴지통')}
                        </h2>
                        <div className="flex gap-4 items-center shrink-0">
                            <button onClick={() => setView('new')}><LineIcon icon="search" className="w-6 h-6"/></button>
                            <button onClick={() => setView('new')}><LineIcon icon="plus" className="w-6 h-6"/></button>
                            
                            <div className="relative shrink-0">
                                <button onClick={() => setIsFilterMenuOpen(!isFilterMenuOpen)}><LineIcon icon="dots-vertical" className="w-6 h-6"/></button>
                                {isFilterMenuOpen && (
                                    <div className="absolute top-10 right-0 bg-white dark:bg-gray-800 shadow-xl border border-gray-200 dark:border-gray-700 rounded-xl w-40 overflow-hidden animate-scale-in z-50">
                                        <button onClick={() => { setFilter('all'); setIsFilterMenuOpen(false); }} className="w-full text-left p-3 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm flex justify-between">전체 {filter==='all' && '✓'}</button>
                                        <button onClick={() => { setFilter('unread'); setIsFilterMenuOpen(false); }} className="w-full text-left p-3 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm flex justify-between">안 읽음 {filter==='unread' && '✓'}</button>
                                        <button onClick={() => { setFilter('deleted'); setIsFilterMenuOpen(false); }} className="w-full text-left p-3 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm text-red-500 flex justify-between">휴지통 {filter==='deleted' && '✓'}</button>
                                        <div className="h-px bg-gray-200 dark:bg-gray-700 my-1"></div>
                                        <button onClick={onClose} className="w-full text-left p-3 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm">닫기</button>
                                    </div>
                                )}
                            </div>
                            <button onClick={onClose} className="shrink-0"><LineIcon icon="close" className="w-6 h-6"/></button>
                        </div>
                    </>
                ) : (
                    <>
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                            <button onClick={() => { setView('list'); setMsgSearchTerm(''); }}><LineIcon icon="arrow-left" className="w-6 h-6"/></button>
                            {view === 'chat' && (
                                <div className="flex flex-col cursor-pointer hover:opacity-70" onClick={openChatSettings}>
                                    <span className="font-bold text-base truncate flex items-center gap-2">
                                        {formatName(displayChatName)} 
                                        {activeChat?.participants.length > 2 && <span className="text-gray-400 text-sm">{activeChat.participants.length}</span>}
                                    </span>
                                </div>
                            )}
                            {view === 'new' && <span className="font-bold text-lg">새로운 채팅</span>}
                        </div>
                        {view === 'chat' && (
                            <div className="flex gap-4 items-center shrink-0">
                                <button onClick={() => setView('new')}><LineIcon icon="search" className="w-6 h-6"/></button>
                                <button onClick={openChatSettings}><LineIcon icon="menu" className="w-6 h-6"/></button>
                                <button onClick={onClose}><LineIcon icon="close" className="w-6 h-6"/></button>
                            </div>
                        )}
                        {view === 'new' && (
                             <button onClick={() => setView('list')}><LineIcon icon="close" className="w-6 h-6"/></button>
                        )}
                    </>
                )}
            </div>

            {/* LIST VIEW */}
            {view === 'list' && (
                <div className="flex-1 overflow-y-auto relative pb-20 bg-white dark:bg-black">
                    {/* Notice Banner Removed */}

                    {pinnedChats.length > 0 && filter === 'all' && (
                        <div className="border-b-4 border-gray-100 dark:border-gray-800">
                            {pinnedChats.map(c => renderChatItem(c, true))}
                        </div>
                    )}

                    {filteredChats.length === 0 && pinnedChats.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                            <LineIcon icon="chat" className="w-12 h-12 mb-2 opacity-50" />
                            <p>대화 내역이 없습니다.</p>
                        </div>
                    ) : (
                        filteredChats.map(c => renderChatItem(c, false))
                    )}
                </div>
            )}

            {/* NEW CHAT VIEW */}
            {view === 'new' && (
                <div className="flex-1 flex flex-col h-full bg-white dark:bg-black">
                    <div className="flex border-b border-gray-100 dark:border-gray-800 overflow-x-auto scrollbar-hide p-2 gap-2">
                        {['all', 'citizen', 'mart', 'gov', 'teacher'].map(cat => (
                            <button 
                                key={cat} 
                                onClick={() => setUserCategory(cat as any)} 
                                className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all ${userCategory === cat ? 'bg-black dark:bg-white text-white dark:text-black' : 'bg-gray-100 dark:bg-gray-800 text-gray-500'}`}
                            >
                                {cat === 'all' ? '전체' : (cat === 'citizen' ? '친구' : (cat === 'mart' ? '가게' : (cat === 'gov' ? '기관' : '선생님')))}
                            </button>
                        ))}
                    </div>

                    <div className="flex-1 overflow-y-auto">
                        {userList.map(u => (
                            <div key={u.name} className="flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-900 cursor-pointer" onClick={() => toggleUserSelection(u.name)}>
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-[14px] bg-gray-200 dark:bg-gray-700 flex items-center justify-center font-bold text-gray-500">
                                        {u.name[0]}
                                    </div>
                                    <div>
                                        <p className="font-bold text-sm text-gray-900 dark:text-white">
                                            {u.name}
                                            {u.name === currentUser?.name && <span className="ml-1 text-[10px] bg-gray-200 px-1 rounded">나</span>}
                                        </p>
                                        <p className="text-xs text-gray-500">{u.type}</p>
                                    </div>
                                </div>
                                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${selectedUsersForChat.has(u.name) ? 'bg-yellow-400 border-yellow-400' : 'border-gray-300'}`}>
                                    {selectedUsersForChat.has(u.name) && <LineIcon icon="check" className="w-4 h-4 text-white" />}
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="p-4 border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-black">
                        {selectedUsersForChat.size > 1 && (
                            <div className="flex items-center gap-2 mb-4 bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
                                <Toggle checked={isTeamChatCreation} onChange={setIsTeamChatCreation} />
                                <div className="text-sm">
                                    <span className="font-bold block">팀 프로젝트 그룹 생성</span>
                                </div>
                            </div>
                        )}
                        <Button onClick={handleStartChat} disabled={selectedUsersForChat.size === 0} className="w-full py-4 rounded-xl bg-yellow-400 hover:bg-yellow-500 text-black border-none">
                            {selectedUsersForChat.size}명과 대화 시작
                        </Button>
                    </div>
                </div>
            )}

            {/* CHAT VIEW */}
            {view === 'chat' && (
                <>
                    <div className="flex-1 overflow-y-auto p-4 bg-[#b2c7d9] dark:bg-[#1b2026] relative" ref={scrollRef}>
                        {messages.map(renderMessage)}
                    </div>
                    {/* Input Area */}
                    <div className="p-2 bg-white dark:bg-[#1E1E1E] flex items-end gap-2 relative">
                        <button onClick={() => setAttachMenuOpen(!attachMenuOpen)} className="p-3 text-gray-400 hover:text-black dark:hover:text-white">
                            <LineIcon icon="plus" className="w-6 h-6" />
                        </button>
                        
                        <div className="flex-1 bg-gray-100 dark:bg-gray-800 rounded-2xl px-4 py-2 flex items-center min-h-[44px] mb-1">
                            <textarea 
                                className="bg-transparent w-full border-none focus:ring-0 text-sm resize-none h-auto max-h-32 outline-none text-black dark:text-white" 
                                placeholder="메시지 입력"
                                value={inputText}
                                onChange={e => {
                                    setInputText(e.target.value);
                                    e.target.style.height = 'auto';
                                    e.target.style.height = `${e.target.scrollHeight}px`;
                                }}
                                onKeyDown={handleInputKeyDown}
                                rows={1}
                            />
                        </div>
                        <button type="button" onClick={handleSendMessage} className={`p-3 rounded-md mb-1 ${inputText ? 'bg-yellow-400 text-black' : 'bg-gray-200 text-gray-400'}`}>
                            <LineIcon icon="send" className="w-5 h-5"/>
                        </button>
                        <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={e => { if(e.target.files?.[0]) { const r = new FileReader(); r.onload=ev=>sendMessage(selectedChatId!, "사진", {type:'image', value:'사진', data:{image: ev.target?.result}}); r.readAsDataURL(e.target.files[0]); } }} />
                        
                        {attachMenuOpen && (
                            <div className="absolute bottom-16 left-2 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 p-4 grid grid-cols-3 gap-4 w-64 animate-scale-in z-50">
                                <button onClick={() => handleAttachAction('image')} className="flex flex-col items-center gap-2">
                                    <div className="w-12 h-12 rounded-full bg-green-100 text-green-600 flex items-center justify-center text-xl">🖼️</div>
                                    <span className="text-xs">앨범</span>
                                </button>
                                <button onClick={() => handleAttachAction('thread')} className="flex flex-col items-center gap-2">
                                    <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xl">📝</div>
                                    <span className="text-xs">투표/공지</span>
                                </button>
                                <button onClick={() => handleAttachAction('id_card')} className="flex flex-col items-center gap-2">
                                    <div className="w-12 h-12 rounded-full bg-yellow-100 text-yellow-600 flex items-center justify-center text-xl">🪪</div>
                                    <span className="text-xs">신분증</span>
                                </button>
                            </div>
                        )}
                    </div>
                </>
            )}

            {/* Chat Settings Drawer (Right Side) */}
            <div className={`absolute inset-0 z-50 transition-transform duration-300 transform ${isSettingsDrawerOpen ? 'translate-x-0' : 'translate-x-full'} bg-white dark:bg-[#1E1E1E]`}>
                <div className="h-14 flex items-center justify-between px-4 border-b border-gray-100 dark:border-gray-800">
                    <h3 className="font-bold text-lg">채팅방 설정</h3>
                    <button onClick={() => setIsSettingsDrawerOpen(false)}><LineIcon icon="close" className="w-6 h-6"/></button>
                </div>
                
                <div className="p-6 overflow-y-auto h-[calc(100%-56px)]">
                    <div className="flex flex-col items-center gap-4 mb-8">
                        <div className="relative group cursor-pointer">
                            <div className="w-24 h-24 rounded-[30px] bg-gray-200 dark:bg-gray-700 flex items-center justify-center overflow-hidden border border-gray-200 dark:border-gray-600 shadow-sm">
                                {editChatProfile ? (
                                    <img src={editChatProfile} className="w-full h-full object-cover" />
                                ) : (
                                    formatName(editChatName)[0]
                                )}
                            </div>
                            <div className="absolute bottom-0 right-0 bg-white dark:bg-black p-2 rounded-full shadow border cursor-pointer hover:bg-gray-100">
                                <LineIcon icon="image" className="w-4 h-4" />
                                <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => {
                                    if (e.target.files?.[0]) {
                                        const r = new FileReader();
                                        r.onload = ev => setEditChatProfile(ev.target?.result as string);
                                        r.readAsDataURL(e.target.files[0]);
                                    }
                                }} />
                            </div>
                        </div>
                        <div className="w-full text-center">
                            <Input value={editChatName} onChange={e => setEditChatName(e.target.value)} className="w-full text-center font-bold text-lg bg-transparent border-b border-gray-300 dark:border-gray-700 rounded-none px-0" placeholder="채팅방 이름 설정" />
                        </div>
                    </div>

                    <div className="space-y-6">
                        <div>
                            <h4 className="font-bold mb-3 text-sm text-gray-500">대화상대 ({activeChat?.participants.length})</h4>
                            <div className="space-y-3">
                                {activeChat?.participants.map(p => (
                                    <div key={p} className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-[14px] bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-500">{p[0]}</div>
                                        <span className="text-sm font-bold">{p}</span>
                                        {activeChat.ownerId === p && <span className="text-[10px] border border-yellow-400 text-yellow-600 px-1 rounded font-bold">방장</span>}
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="border-t border-gray-100 dark:border-gray-800 pt-4 space-y-2">
                            <Button onClick={saveChatSettings} className="w-full py-3 bg-gray-100 dark:bg-gray-800 text-black dark:text-white hover:bg-gray-200 dark:hover:bg-gray-700">설정 저장</Button>
                            <Button onClick={handleLeaveChat} variant="danger" className="w-full py-3 bg-transparent text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 border-none shadow-none">채팅방 나가기</Button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
