
import React, { useState, useMemo } from 'react';
import { useGame } from '../../../context/GameContext';
import { Button, Input, Modal, formatName, LineIcon, Card } from '../../Shared';
import { User } from '../../../types';
import { fetchUserByLoginId } from '../../../services/firebase';

export const AccountTab: React.FC = () => {
    return (
        <AccountTabContent />
    );
};

const AccountTabContent: React.FC = () => {
    const { currentUser, db, switchAccount, showPinModal, setAdminMode, showModal, logout, updateUser, cachedLinkedUsers, setCachedLinkedUsers } = useGame();
    const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
    
    const [linkId, setLinkId] = useState('');
    const [linkPw, setLinkPw] = useState('');
    const [newName, setNewName] = useState('');
    const [newId, setNewId] = useState('');
    const [newPw, setNewPw] = useState('');

    React.useEffect(() => {
        let isMounted = true;
        const loadLinked = async () => {
            if (!currentUser?.linkedAccounts) {
                if (isMounted && cachedLinkedUsers.length > 0) setCachedLinkedUsers([]);
                return;
            }
            // If already cached and count matches, don't refetch
            const uniqueIds = Array.from(new Set(currentUser.linkedAccounts as string[])).filter((uid: string) => uid !== currentUser.id);
            if (cachedLinkedUsers.length === uniqueIds.length) return;

            const loaded = [];
            for (const uid of uniqueIds) {
                if (!uid) continue;
                const u = await fetchUserByLoginId(uid);
                if (u) {
                    loaded.push({ id: u.id, name: u.name, profilePic: u.profilePic, type: u.type, customJob: u.customJob });
                } 
            }
            if (isMounted) setCachedLinkedUsers(loaded);
        };
        loadLinked();
        return () => { isMounted = false; };
    }, [currentUser?.linkedAccounts, currentUser?.id]);

    const handleSwitch = async (targetId: string | undefined) => {
        if (!targetId) return;
        try {
            const success = await switchAccount(targetId);
            if (success) {
                showModal("계정이 전환되었습니다.");
            } else {
                showModal("계정 전환에 실패했습니다.");
            }
        } catch(e) {
            showModal("오류가 발생했습니다.");
        }
    };

    const handleLinkExisting = async () => {
        const target = await fetchUserByLoginId(linkId);
        if (!target) return showModal("계정 정보를 찾을 수 없습니다.");
        if (target.password !== linkPw) return showModal("비밀번호가 일치하지 않습니다.");
        if (target.id === currentUser?.id) return showModal("현재 로그인된 계정입니다.");
        
        const currentLinked = currentUser?.linkedAccounts || [];
        if (currentLinked.includes(target.id!)) return showModal("이미 연동된 계정입니다.");
        
        const updatedLinked = [...currentLinked, target.id!];
        
        // Use updateUser to persist changes securely
        await updateUser(currentUser!.name, { linkedAccounts: updatedLinked });
        
        // Force refresh cache next render
        setCachedLinkedUsers([]);

        showModal("계정이 연동되었습니다.");
        setIsLinkModalOpen(false);
        setLinkId(''); setLinkPw('');
    };

    const handleUnlink = async (targetId: string) => {
        if (!await confirm("정말 연동을 해제하시겠습니까?")) return;
        const currentLinked = currentUser?.linkedAccounts || [];
        const updatedLinked = currentLinked.filter(id => id !== targetId);
        await updateUser(currentUser!.name, { linkedAccounts: updatedLinked });
        
        // Update local cache immediately
        setCachedLinkedUsers(cachedLinkedUsers.filter(u => u.id !== targetId));
        
        showModal("연동이 해제되었습니다.");
    };

    const handleCreateLinked = async () => {
        if (!newName || !newId || !newPw) return showModal("모든 정보를 입력하세요.");
        const exists = await fetchUserByLoginId(newId);
        if (exists) return showModal("이미 존재하는 아이디입니다.");
        
        showModal("새 계정 생성은 로그아웃 후 '회원가입'을 이용해주세요. (보안 정책)");
        setIsLinkModalOpen(false);
    };

    const handleAccessAdmin = async () => {
        const isAuthorized = currentUser?.type === 'admin' || currentUser?.type === 'root' || currentUser?.subType === 'teacher' || currentUser?.isPresident;
        const pin = await showPinModal(
            isAuthorized ? "관리자 모드 진입 (PIN)" : "관리자 권한이 없습니다. (PIN 확인)", 
            currentUser?.pin!, 
            (currentUser?.pinLength as 4 | 6) || 4
        );
        if (pin === currentUser?.pin) {
            if (isAuthorized) setAdminMode(true);
            else showModal("접근 권한이 없습니다.");
        }
    };

    return (
        <div className="space-y-6">
            <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-2xl border border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-4 mb-4">
                    <div className="w-16 h-16 rounded-full bg-green-500 flex items-center justify-center text-white text-2xl font-bold overflow-hidden">
                        {currentUser?.profilePic ? <img src={currentUser.profilePic} className="w-full h-full object-cover"/> : formatName(currentUser?.name)[0]}
                    </div>
                    <div>
                        <p className="font-bold text-lg">{formatName(currentUser?.name)}</p>
                        <p className="text-sm text-gray-500">@{currentUser?.id}</p>
                    </div>
                </div>
            </div>

            <div>
                <h4 className="font-bold mb-3 text-sm text-gray-500 uppercase">연동된 계정</h4>
                <div className="space-y-3">
                    {cachedLinkedUsers.map((acc: any) => (
                        <div key={acc.id} className="flex items-center justify-between p-3 bg-white dark:bg-black border border-gray-200 dark:border-gray-800 rounded-xl">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center overflow-hidden">
                                    {acc.profilePic ? <img src={acc.profilePic} className="w-full h-full object-cover"/> : acc.name?.[0]}
                                </div>
                                <div>
                                    <p className="font-bold text-sm">{formatName(acc.name)}</p>
                                    <p className="text-xs text-gray-500">{acc.customJob || acc.type}</p>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <Button onClick={() => handleSwitch(acc.id)} variant="secondary" className="text-xs py-1.5 px-3">전환</Button>
                                <button onClick={() => handleUnlink(acc.id)} className="text-xs text-red-500 px-2 font-bold">해제</button>
                            </div>
                        </div>
                    ))}
                    {cachedLinkedUsers.length === 0 && <p className="text-xs text-gray-400 text-center py-2">연동된 계정이 없습니다.</p>}
                    
                    <button 
                        onClick={() => setIsLinkModalOpen(true)}
                        className="w-full py-3 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl text-gray-400 hover:text-gray-600 hover:border-gray-400 transition-colors flex items-center justify-center gap-2"
                    >
                        <LineIcon icon="plus_dashed" className="w-5 h-5" />
                        계정 추가 / 연동
                    </button>
                </div>
            </div>

            <div className="pt-6 border-t border-gray-200 dark:border-gray-700 space-y-4">
                {(currentUser?.type === 'admin' || currentUser?.type === 'root' || currentUser?.subType === 'teacher' || currentUser?.isPresident) && (
                    <button onClick={handleAccessAdmin} className="w-full py-2 text-gray-500 text-xs hover:text-black dark:hover:text-white underline text-center">
                        Admin Console Access
                    </button>
                )}
                <button onClick={logout} className="w-full py-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors">
                    <LineIcon icon="logout" className="w-5 h-5" />
                    로그아웃
                </button>
            </div>

            <Modal isOpen={isLinkModalOpen} onClose={() => setIsLinkModalOpen(false)} title="계정 추가">
                <div className="space-y-6">
                    <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
                        <h5 className="font-bold mb-2">기존 계정 연동</h5>
                        <div className="flex gap-2 mb-2">
                            <Input placeholder="아이디" value={linkId} onChange={e => setLinkId(e.target.value)} className="flex-1" />
                            <Input type="password" placeholder="비밀번호" value={linkPw} onChange={e => setLinkPw(e.target.value)} className="flex-1" />
                        </div>
                        <Button onClick={handleLinkExisting} className="w-full">연동하기</Button>
                    </div>

                    <div className="relative flex py-2 items-center">
                        <div className="flex-grow border-t border-gray-300 dark:border-gray-600"></div>
                        <span className="flex-shrink-0 mx-4 text-gray-400 text-sm">OR</span>
                        <div className="flex-grow border-t border-gray-300 dark:border-gray-600"></div>
                    </div>

                    <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
                        <h5 className="font-bold mb-2">새 계정 만들기</h5>
                        <Button onClick={handleCreateLinked} variant="secondary" className="w-full">신규 가입 (로그아웃 후 진행)</Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};
