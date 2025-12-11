import React, { useState, useEffect } from 'react';
import { useGame } from '../../context/GameContext';
import { Button, Input, Toggle, FileInput, formatName, Modal } from '../Shared';
import { User, UserPreferences, Chat, ChatMessage } from '../../types';
import { uploadImage } from '../../services/firebase';

export const ProfileSettingsTab: React.FC = () => {
    const { currentUser, db, updateUser, showModal, logout, showPinModal, showConfirm, deleteAccount, setAdminMode, notify, switchAccount, createChat, sendMessage } = useGame();
    // ... (Existing state variables kept same) ...
    const [subTab, setSubTab] = useState<'profile' | 'account' | 'security' | 'display' | 'features' | 'feedback'>('profile');
    const [customJob, setCustomJob] = useState(currentUser?.customJob || '');
    const [nickname, setNickname] = useState(currentUser?.nickname || '');
    const [newId, setNewId] = useState('');
    const [currentPwForId, setCurrentPwForId] = useState('');
    const [oldPw, setOldPw] = useState('');
    const [newPw, setNewPw] = useState('');
    const [newPwConfirm, setNewPwConfirm] = useState('');
    const [newPinSimple, setNewPinSimple] = useState('');
    const [preferences, setPreferences] = useState<UserPreferences>(currentUser?.preferences || { theme: 'system', assetDisplayMode: 'full', vibration: false, skipPinForCommonActions: false, saveLoginHistory: true });
    const [fbTitle, setFbTitle] = useState('');
    const [fbContent, setFbContent] = useState('');
    const [fbLink, setFbLink] = useState('');
    const [fbImage, setFbImage] = useState<string | null>(null);
    const [myFeedbackList, setMyFeedbackList] = useState<Chat[]>([]);
    const [isAddAccountModalOpen, setIsAddAccountModalOpen] = useState(false);
    const [linkId, setLinkId] = useState('');
    const [linkPw, setLinkPw] = useState('');
    const isAdminAccount = currentUser?.type === 'admin' || currentUser?.name === '한국은행';
    const [linkedAccounts, setLinkedAccounts] = useState<any[]>([]);

    useEffect(() => {
        if (currentUser?.preferences) setPreferences(currentUser.preferences);
        let accounts = [];
        if (currentUser?.linkedAccounts && currentUser.linkedAccounts.length > 0) {
             accounts = currentUser.linkedAccounts.map(id => {
                 const u = (Object.values(db.users) as User[]).find((user) => user.id === id);
                 return u ? { id: u.id, name: u.name, profilePic: u.profilePic } : null;
             }).filter(Boolean);
        } else {
             const history = JSON.parse(localStorage.getItem('sh_login_history') || '[]');
             accounts = history.filter((h: any) => h.id !== currentUser?.id);
        }
        setLinkedAccounts(accounts);
        const chats = Object.values(db.chats || {}) as Chat[];
        const feedbacks = chats.filter(c => c.type === 'feedback' && c.participants.includes(currentUser!.name)).sort((a,b) => (b.lastTimestamp || 0) - (a.lastTimestamp || 0));
        setMyFeedbackList(feedbacks);
    }, [currentUser, db.users, db.chats]);

    const handleUpdateProfile = () => {
        updateUser(currentUser!.name, { customJob: customJob, nickname: nickname });
        showModal('프로필 정보가 저장되었습니다.');
    };

    const handleUpdateProfilePic = async (base64: string | null) => {
        if (!base64) {
            updateUser(currentUser!.name, { profilePic: null });
            return;
        }
        try {
            // Upload to Storage
            const url = await uploadImage(`profiles/${currentUser!.name}_${Date.now()}`, base64);
            updateUser(currentUser!.name, { profilePic: url });
            showModal('프로필 사진이 업데이트되었습니다.');
        } catch (e) {
            showModal('사진 업로드 실패');
        }
    };

    // ... (Keep other handlers: handleBankruptcy, handleIdChange, handlePasswordChange, etc. exactly as is) ...
    // Shortened for brevity in response, assuming they remain unchanged
    
    // Update Feedback Image Upload
    const handleSendFeedback = async () => {
        if (!fbTitle.trim() || !fbContent.trim()) return showModal("제목과 내용을 입력해주세요.");
        
        let imageUrl = null;
        if (fbImage) {
            imageUrl = await uploadImage(`feedback/${Date.now()}`, fbImage);
        }

        const chatId = await createChat(['한국은행'], 'feedback', `[피드백] ${fbTitle}`);
        await sendMessage(chatId, `[피드백 내용]\n${fbContent}\n\n[첨부 링크]\n${fbLink || '없음'}`, imageUrl ? { type: 'ui_element', value: '이미지 첨부', data: { image: imageUrl } } : undefined);

        notify('한국은행', `[피드백] ${fbTitle} 접수되었습니다.`, true);
        showModal("관리자에게 피드백을 전송했습니다.");
        setFbTitle(''); setFbContent(''); setFbLink(''); setFbImage(null);
    };

    const handleBankruptcy = async () => {
        if (!await showConfirm("정말 파산 신청을 하시겠습니까?\n모든 자산이 압류되고 신용 등급이 하락할 수 있습니다.")) return;
        updateUser(currentUser!.name, { bankruptcyStatus: 'pending' });
        notify('한국은행', `${currentUser!.name}님이 파산 신청을 했습니다.`, true);
        showModal("파산 신청이 접수되었습니다. 법원의 판결을 기다려주세요.");
    };
    const handleIdChange = async () => {
        if (!newId.trim()) return showModal("새 아이디를 입력하세요.");
        if ((Object.values(db.users) as User[]).some(u => u.id === newId.trim())) return showModal("이미 사용 중인 아이디입니다.");
        if (currentPwForId !== currentUser?.password) return showModal("현재 비밀번호가 일치하지 않습니다.");
        updateUser(currentUser!.name, { id: newId.trim() });
        showModal('아이디가 변경되었습니다.');
        setNewId(''); setCurrentPwForId('');
    };
    const handlePasswordChange = async () => {
        if (oldPw !== currentUser?.password) return showModal('현재 비밀번호가 일치하지 않습니다.');
        if (!newPw) return showModal('새 비밀번호를 입력하세요.');
        if (newPw.length < 4) return showModal('비밀번호는 4자 이상이어야 합니다.');
        if (newPw !== newPwConfirm) return showModal('새 비밀번호가 일치하지 않습니다.');
        updateUser(currentUser!.name, { password: newPw });
        showModal('비밀번호가 변경되었습니다.');
        setOldPw(''); setNewPw(''); setNewPwConfirm('');
    };
    const handlePinChangeSimple = async () => {
        if (!newPinSimple || (newPinSimple.length !== 4 && newPinSimple.length !== 6)) return showModal("PIN은 4자리 또는 6자리 숫자여야 합니다.");
        await updateUser(currentUser!.name, { pin: newPinSimple, pinLength: newPinSimple.length as any });
        showModal('간편번호가 변경되었습니다.');
        setNewPinSimple('');
    };
    const handleSwitchAccount = () => setIsAddAccountModalOpen(true);
    const handleLinkExisting = async () => {
        if (!linkId || !linkPw) return showModal("아이디와 비밀번호를 입력하세요.");
        const targetUser = (Object.values(db.users) as User[]).find(u => u.id === linkId && u.password === linkPw);
        if (!targetUser) return showModal("아이디 또는 비밀번호가 잘못되었습니다.");
        if (targetUser.id === currentUser?.id) return showModal("현재 접속중인 계정입니다.");
        const newLinked = Array.from(new Set([...(currentUser?.linkedAccounts || []), targetUser.id!]));
        updateUser(currentUser!.name, { linkedAccounts: newLinked });
        showModal("계정이 연동되었습니다. 계정 목록에서 전환할 수 있습니다.");
        setIsAddAccountModalOpen(false);
        setLinkId(''); setLinkPw('');
    };
    const handleCreateNewAccount = () => { if(confirm("새 계정을 만들기 위해 현재 계정에서 로그아웃합니다.")) logout(); };
    const handleUnlink = (targetId: string) => {
        const newLinked = (currentUser?.linkedAccounts || []).filter(id => id !== targetId);
        updateUser(currentUser!.name, { linkedAccounts: newLinked });
        const history = JSON.parse(localStorage.getItem('sh_login_history') || '[]');
        const newHistory = history.filter((h: any) => h.id !== targetId);
        localStorage.setItem('sh_login_history', JSON.stringify(newHistory));
        setLinkedAccounts(prev => prev.filter(a => a.id !== targetId));
    };
    const handleDeleteAccount = async () => {
        if (!await showConfirm("정말로 계정을 삭제하시겠습니까? 모든 데이터가 영구적으로 삭제됩니다.")) return;
        const pin = await showPinModal("본인 확인을 위해 간편번호를 입력하세요.", currentUser!.pin!, currentUser!.pinLength || 4);
        if (pin !== currentUser!.pin) return;
        await deleteAccount(currentUser!.name);
        showModal("계정이 초기화되었습니다.");
        logout();
    };
    const handleUpdatePrefs = (key: keyof UserPreferences, value: any) => {
        const newPrefs = { ...preferences, [key]: value };
        setPreferences(newPrefs);
        updateUser(currentUser!.name, { preferences: newPrefs });
    };
    const handleThemeChange = (newTheme: 'light' | 'dark' | 'system') => handleUpdatePrefs('theme', newTheme);
    const handleAdminConsoleClick = async () => {
        const pin = await showPinModal("관리자 권한 진입", currentUser?.pin!, currentUser?.pinLength || 4);
        if (pin === currentUser?.pin) setAdminMode(true);
        else showModal("인증 실패");
    };
    const handleUpdateCheck = () => alert("이동, 수정 또는 삭제되었을 수 있습니다.");

    return (
        <div className="w-full h-full flex flex-col max-h-[75vh]">
            <div className="flex border-b border-gray-200 dark:border-gray-700 mb-4 overflow-x-auto scrollbar-hide pb-1">
                {['profile', 'account', 'security', 'display', 'features', 'feedback'].map(tab => (
                    <button 
                        key={tab}
                        onClick={() => setSubTab(tab as any)} 
                        className={`flex-1 min-w-fit px-3 py-2 text-sm font-bold border-b-2 whitespace-nowrap transition-colors ${subTab === tab ? 'border-green-500 text-green-600 dark:text-green-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
                    >
                        {tab === 'profile' ? '프로필' : tab === 'account' ? '계정' : tab === 'security' ? '보안' : tab === 'display' ? '화면' : tab === 'features' ? '부가기능' : '피드백'}
                    </button>
                ))}
            </div>

            <div className="flex-1 overflow-y-auto pb-4 pr-1">
                {subTab === 'profile' && (
                    <div className="space-y-6">
                        <div className="flex items-center gap-4">
                            <div className="w-20 h-20 rounded-full bg-green-500 flex items-center justify-center text-white text-3xl font-bold overflow-hidden border-4 border-white dark:border-gray-700 shadow-md shrink-0">
                                 {currentUser?.profilePic ? <img src={currentUser.profilePic} className="w-full h-full object-cover"/> : formatName(currentUser?.name)[0]}
                            </div>
                            <div className="flex-1">
                                 <FileInput onChange={handleUpdateProfilePic} />
                            </div>
                        </div>
                        {/* Rest of Profile UI */}
                        <div className="grid grid-cols-1 gap-4">
                            <div><label className="text-sm font-bold mb-2 block">이름 (별명) 변경</label><Input value={nickname} onChange={e => setNickname(e.target.value)} placeholder="표시될 이름" className="w-full p-4 text-lg"/></div>
                            <div><label className="text-sm font-bold mb-2 block">직업</label><Input value={customJob} onChange={e => setCustomJob(e.target.value)} placeholder="예: 학생" className="w-full p-4 text-lg"/></div>
                        </div>
                        <Button onClick={handleUpdateProfile} className="w-full py-4 text-lg">저장</Button>
                    </div>
                )}
                {/* ... other tabs (account, security, etc.) stay same ... */}
                {subTab === 'account' && (
                    <div className="space-y-6 pt-2">
                        {/* Account UI */}
                        <div><h4 className="font-bold text-sm text-gray-500 mb-2">현재 계정</h4><div className="bg-green-50 dark:bg-green-900/20 border-2 border-green-500 p-4 rounded-2xl flex items-center gap-4 shadow-sm"><div className="w-12 h-12 rounded-full bg-green-500 text-white flex items-center justify-center font-bold">{formatName(currentUser?.name)[0]}</div><div className="flex-1"><p className="font-bold text-lg">{formatName(currentUser?.name, currentUser)}</p><p className="text-sm opacity-70">ID: {currentUser?.id}</p></div><span className="text-xs bg-green-200 dark:bg-green-800 text-green-800 dark:text-green-200 px-2 py-1 rounded-full font-bold">접속중</span></div></div>
                        <div><h4 className="font-bold text-sm text-gray-500 mb-2">연동된 계정</h4><div className="flex gap-4 overflow-x-auto pb-2">{linkedAccounts.map(acc => (<div key={acc.id} className="min-w-[160px] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-4 rounded-2xl flex flex-col items-center gap-2 shadow-sm relative group cursor-pointer hover:shadow-md transition-all"><div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center font-bold text-gray-500">{formatName(acc.name)[0]}</div><p className="font-bold text-sm">{formatName(acc.name)}</p><button onClick={() => switchAccount(acc.id)} className="text-xs bg-gray-100 dark:bg-gray-700 px-3 py-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600">전환</button><button onClick={() => handleUnlink(acc.id)} className="absolute top-2 right-2 text-gray-300 hover:text-red-500 text-lg leading-none">&times;</button></div>))}<button onClick={handleSwitchAccount} className="min-w-[100px] border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-2xl flex flex-col items-center justify-center gap-2 hover:border-green-500 hover:text-green-500 transition-colors text-gray-400"><span className="text-2xl font-bold">+</span><span className="text-xs font-bold">계정 추가</span></button></div></div>
                        <div className="pt-4 border-t border-gray-200 dark:border-gray-700 space-y-3"><Button onClick={handleUpdateCheck} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 text-base mb-2">🔄 앱 업데이트 확인</Button>{isAdminAccount && (<button onClick={handleAdminConsoleClick} className="text-[10px] text-gray-400 hover:text-gray-600 block w-full text-center py-2">Admin Console</button>)}<Button onClick={logout} className="w-full bg-gray-600 hover:bg-gray-500 py-3 text-base">로그아웃</Button><button onClick={handleDeleteAccount} className="w-full text-sm text-red-500 hover:text-red-700 font-bold py-2">계정 삭제 (초기화)</button></div>
                    </div>
                )}
                {subTab === 'security' && (
                    <div className="space-y-6">
                        <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-2xl border border-gray-100 dark:border-gray-700"><h5 className="font-bold mb-4 text-sm text-gray-500 uppercase">아이디 변경</h5><Input placeholder="새 아이디" value={newId} onChange={e => setNewId(e.target.value)} className="mb-3 w-full p-4" /><Input type="password" placeholder="현재 비밀번호" value={currentPwForId} onChange={e => setCurrentPwForId(e.target.value)} className="mb-3 w-full p-4" /><Button onClick={handleIdChange} className="w-full py-3">변경</Button></div>
                        <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-2xl border border-gray-100 dark:border-gray-700"><h5 className="font-bold mb-4 text-sm text-gray-500 uppercase">비밀번호 변경</h5><Input type="password" placeholder="현재 비밀번호" value={oldPw} onChange={e => setOldPw(e.target.value)} className="mb-3 w-full p-4" /><Input type="password" placeholder="새 비밀번호" value={newPw} onChange={e => setNewPw(e.target.value)} className="mb-3 w-full p-4" /><Input type="password" placeholder="새 비밀번호 확인" value={newPwConfirm} onChange={e => setNewPwConfirm(e.target.value)} className="mb-3 w-full p-4" /><Button onClick={handlePasswordChange} className="w-full py-3">변경</Button></div>
                        <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-2xl border border-gray-100 dark:border-gray-700"><h5 className="font-bold mb-4 text-sm text-gray-500 uppercase">간편번호(PIN) 재설정</h5><Input type="password" placeholder="새로운 PIN 입력 (4~6자리)" value={newPinSimple} onChange={e => setNewPinSimple(e.target.value)} className="mb-3 w-full p-4 text-center text-lg tracking-widest" maxLength={6} inputMode="numeric" /><Button onClick={handlePinChangeSimple} className="w-full py-3">설정 저장</Button></div>
                    </div>
                )}
                {subTab === 'display' && (
                    <div className="space-y-4">
                        <div className="grid grid-cols-3 gap-3">
                            <button onClick={() => handleThemeChange('system')} className={`p-4 rounded-xl border flex flex-col items-center gap-2 transition-all ${preferences.theme === 'system' ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : 'border-gray-200 dark:border-gray-700'}`}><span className="text-3xl">📱</span><span className="text-sm font-bold">기기 설정</span></button>
                            <button onClick={() => handleThemeChange('light')} className={`p-4 rounded-xl border flex flex-col items-center gap-2 transition-all ${preferences.theme === 'light' ? 'border-green-500 bg-green-50' : 'border-gray-200 dark:border-gray-700 bg-white'}`}><span className="text-3xl">☀️</span><span className="text-sm font-bold text-black">라이트</span></button>
                            <button onClick={() => handleThemeChange('dark')} className={`p-4 rounded-xl border flex flex-col items-center gap-2 transition-all ${preferences.theme === 'dark' ? 'border-green-500 bg-gray-800' : 'border-gray-200 dark:border-gray-700 bg-gray-900'}`}><span className="text-3xl">🌙</span><span className="text-sm font-bold text-white">다크</span></button>
                        </div>
                    </div>
                )}
                {subTab === 'features' && (
                    <div className="space-y-3">
                        <div className="flex justify-between items-center p-4 bg-gray-50 dark:bg-gray-800 rounded-2xl"><div><p className="font-bold text-base">PIN 입력 최소화</p><p className="text-xs text-gray-500">소액 거래 시 PIN 입력 생략</p></div><Toggle checked={preferences.skipPinForCommonActions || false} onChange={v => handleUpdatePrefs('skipPinForCommonActions', v)} /></div>
                        <div className="flex justify-between items-center p-4 bg-gray-50 dark:bg-gray-800 rounded-2xl"><div><p className="font-bold text-base">진동 피드백</p><p className="text-xs text-gray-500">터치 시 진동 효과</p></div><Toggle checked={preferences.vibration || false} onChange={v => handleUpdatePrefs('vibration', v)} /></div>
                        <div className="flex justify-between items-center p-4 bg-gray-50 dark:bg-gray-800 rounded-2xl"><div><p className="font-bold text-base">프로필 기록 남기지 않기</p><p className="text-xs text-gray-500">로그인 시 기기에 프로필을 저장하지 않음</p></div><Toggle checked={!(preferences.saveLoginHistory !== false)} onChange={v => handleUpdatePrefs('saveLoginHistory', !v)} /></div>
                        <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-2xl"><p className="font-bold text-base mb-3">자산 표시 방식</p><div className="flex bg-white dark:bg-black rounded-xl p-1 shadow-sm"><button onClick={() => handleUpdatePrefs('assetDisplayMode', 'full')} className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors ${preferences.assetDisplayMode === 'full' ? 'bg-green-100 text-green-700 dark:bg-green-900' : 'text-gray-500'}`}>전체</button><button onClick={() => handleUpdatePrefs('assetDisplayMode', 'rounded')} className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors ${preferences.assetDisplayMode === 'rounded' ? 'bg-green-100 text-green-700 dark:bg-green-900' : 'text-gray-500'}`}>단축</button></div></div>
                    </div>
                )}
                {subTab === 'feedback' && (
                    <div className="space-y-6">
                        <div className="space-y-4">
                            <h4 className="font-bold text-lg">새 피드백 보내기</h4>
                            <Input placeholder="제목" value={fbTitle} onChange={e => setFbTitle(e.target.value)} className="w-full p-4" />
                            <textarea className="w-full p-4 rounded-2xl bg-[#F0F0F0] text-[#121212] dark:bg-[#2D2D2D] dark:text-[#E0E0E0] outline-none focus:ring-2 focus:ring-green-500 min-h-[150px] text-base resize-none select-text" placeholder="내용 입력..." value={fbContent} onChange={e => setFbContent(e.target.value)} />
                            <Input placeholder="링크 (선택)" value={fbLink} onChange={e => setFbLink(e.target.value)} className="w-full p-4" />
                            <div className="flex items-center gap-4 bg-gray-50 dark:bg-gray-800 p-3 rounded-xl"><span className="font-bold whitespace-nowrap">이미지 첨부</span><FileInput onChange={setFbImage} /></div>
                            <Button onClick={handleSendFeedback} className="w-full py-4 text-lg">보내기</Button>
                        </div>
                        <div><h4 className="font-bold text-lg mb-2">내 피드백 목록</h4>{myFeedbackList.length === 0 ? <p className="text-gray-500 text-sm">보낸 피드백이 없습니다.</p> : <div className="space-y-2">{myFeedbackList.map(chat => { const lastMsg = (Object.values(chat.messages || {}) as ChatMessage[]).sort((a,b) => b.timestamp - a.timestamp)[0]; return (<div key={chat.id} className="p-3 border rounded bg-gray-50 dark:bg-gray-800 flex justify-between items-center"><div><p className="font-bold text-sm truncate">{chat.groupName}</p><p className="text-xs text-gray-500 truncate max-w-[200px]">{lastMsg?.text || '내용 없음'}</p></div><div className="flex flex-col items-end"><span className="text-[10px] text-gray-400">{new Date(lastMsg?.timestamp || 0).toLocaleDateString()}</span>{lastMsg?.sender === '한국은행' && <span className="text-[10px] bg-red-100 text-red-600 px-1 rounded">답변완료</span>}</div></div>); })}</div>}</div>
                    </div>
                )}
            </div>
            <Modal isOpen={isAddAccountModalOpen} onClose={() => setIsAddAccountModalOpen(false)} title="계정 추가"><div className="space-y-6"><div className="p-4 bg-gray-100 dark:bg-gray-700 rounded-lg"><h4 className="font-bold mb-2">기존 계정 연동</h4><Input placeholder="아이디" value={linkId} onChange={e => setLinkId(e.target.value)} className="mb-2" /><Input type="password" placeholder="비밀번호" value={linkPw} onChange={e => setLinkPw(e.target.value)} className="mb-3" /><Button onClick={handleLinkExisting} className="w-full">연동하기</Button></div><div className="text-center"><p className="text-sm font-bold mb-2">또는</p><Button variant="secondary" onClick={handleCreateNewAccount} className="w-full">새 계정 만들기</Button></div></div></Modal>
        </div>
    );
};