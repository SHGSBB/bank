
import React, { useState, useEffect } from 'react';
import { useGame } from '../../../context/GameContext';
import { Button, Input, Modal, formatName, LineIcon, Card } from '../../Shared';

export const AccountTab: React.FC = () => {
    const { currentUser, switchAccount, showPinModal, setAdminMode, showModal, logout, serverAction, cachedLinkedUsers, setCachedLinkedUsers, showConfirm, refreshData } = useGame();
    const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
    const [linkId, setLinkId] = useState('');
    const [linkPw, setLinkPw] = useState('');
    const [isInternalLoading, setIsInternalLoading] = useState(false);

    const loadLinked = async () => {
        if (!currentUser?.linkedAccounts || currentUser.linkedAccounts.length === 0) {
            setCachedLinkedUsers([]);
            return;
        }
        setIsInternalLoading(true);
        try {
            const res = await serverAction('fetch_linked_accounts', { linkedIds: currentUser.linkedAccounts });
            if (res && res.accounts) {
                setCachedLinkedUsers(res.accounts);
            }
        } catch (e) {
            console.error("Failed to load linked accounts", e);
        } finally {
            setIsInternalLoading(false);
        }
    };

    useEffect(() => {
        loadLinked();
    }, [currentUser?.linkedAccounts]);

    const handleSwitch = async (targetName: string | undefined) => {
        if (!targetName) return;
        const pin = await showPinModal("계정 전환 인증", currentUser?.pin!, (currentUser?.pinLength as any) || 4);
        if (pin !== currentUser?.pin) return;

        const success = await switchAccount(targetName);
        if (success) {
            showModal("계정이 전환되었습니다.");
            await refreshData();
        }
    };

    const handleLinkExisting = async () => {
        if (!linkId || !linkPw) return showModal("정보를 입력하세요.");
        
        setIsInternalLoading(true);
        try {
            await serverAction('link_account', {
                myName: currentUser!.name,
                targetId: linkId,
                targetPw: linkPw
            });
            
            showModal("계정이 성공적으로 연동되었습니다.");
            setIsLinkModalOpen(false);
            setLinkId(''); setLinkPw('');
            await refreshData(); // refresh linkedAccounts list
        } catch (e: any) {
            let msg = "연동에 실패했습니다.";
            if (e.message.includes("TARGET_NOT_FOUND")) msg = "해당 아이디의 계정을 찾을 수 없습니다.";
            if (e.message.includes("TARGET_PASSWORD_MISMATCH")) msg = "상대방의 비밀번호가 일치하지 않습니다.";
            if (e.message.includes("CANNOT_LINK_SELF")) msg = "자기 자신은 연동할 수 없습니다.";
            if (e.message.includes("ALREADY_LINKED")) msg = "이미 연동된 계정입니다.";
            showModal(msg);
        } finally {
            setIsInternalLoading(false);
        }
    };

    const handleUnlink = async (targetName: string) => {
        if (!await showConfirm("정말 연동을 해제하시겠습니까?")) return;
        
        setIsInternalLoading(true);
        try {
            await serverAction('unlink_account', {
                myName: currentUser!.name,
                targetName: targetName
            });
            showModal("연동이 해제되었습니다.");
            await refreshData();
        } catch (e) {
            showModal("해제 실패");
        } finally {
            setIsInternalLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <Card className="bg-gray-50 dark:bg-gray-800">
                <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-full bg-green-500 overflow-hidden border-2 border-white dark:border-gray-700">
                        {currentUser?.profilePic ? <img src={currentUser.profilePic} className="w-full h-full object-cover" alt="Profile"/> : <span className="text-2xl text-white font-bold flex items-center justify-center h-full">{formatName(currentUser?.name)[0]}</span>}
                    </div>
                    <div>
                        <p className="font-bold text-lg">{formatName(currentUser?.name, currentUser)}</p>
                        <p className="text-sm text-gray-500">ID: {currentUser?.id}</p>
                    </div>
                </div>
            </Card>

            <div>
                <div className="flex justify-between items-center mb-3">
                    <h4 className="font-bold text-sm text-gray-500 uppercase">연동된 계정</h4>
                    {isInternalLoading && <div className="animate-spin h-4 w-4 border-2 border-green-500 border-t-transparent rounded-full"></div>}
                </div>
                
                <div className="space-y-3">
                    {cachedLinkedUsers.length === 0 && !isInternalLoading && (
                        <p className="text-center text-gray-400 py-4 text-sm bg-white dark:bg-gray-900 rounded-xl border border-dashed border-gray-200 dark:border-gray-800">연동된 계정이 없습니다.</p>
                    )}
                    
                    {cachedLinkedUsers.map((acc: any) => (
                        <div key={acc.name} className="flex items-center justify-between p-3 bg-white dark:bg-[#1E1E1E] border border-gray-100 dark:border-gray-800 rounded-xl shadow-sm">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-gray-200 overflow-hidden">
                                    {acc.profilePic ? <img src={acc.profilePic} className="w-full h-full object-cover" alt="Linked Profile"/> : <span className="flex items-center justify-center h-full font-bold">{acc.name?.[0]}</span>}
                                </div>
                                <div>
                                    <p className="font-bold text-sm">{formatName(acc.name, acc)}</p>
                                    <p className="text-[10px] text-gray-400">@{acc.id}</p>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <Button onClick={() => handleSwitch(acc.name)} variant="secondary" className="text-xs py-1.5 px-3">전환</Button>
                                <button onClick={() => handleUnlink(acc.name)} className="text-xs text-red-500 font-bold px-2 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-lg transition-colors">해제</button>
                            </div>
                        </div>
                    ))}
                    <button 
                        onClick={() => setIsLinkModalOpen(true)} 
                        className="w-full py-3 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl text-gray-400 hover:text-green-500 hover:border-green-500 transition-all flex items-center justify-center gap-2 font-bold"
                    >
                        <LineIcon icon="plus_dashed" className="w-5 h-5" /> 계정 연동 추가
                    </button>
                </div>
            </div>

            <div className="pt-6 border-t border-gray-200 dark:border-gray-700 space-y-4">
                {(currentUser?.type === 'admin' || currentUser?.subType === 'teacher' || currentUser?.isPresident) && (
                    <button 
                        onClick={async () => { 
                            const pin = await showPinModal("관리자 모드 진입", currentUser?.pin!, (currentUser?.pinLength as any)||4);
                            if(pin === currentUser?.pin) setAdminMode(true); 
                        }} 
                        className="w-full py-2 text-gray-500 text-xs underline text-center hover:text-black dark:hover:text-white"
                    >
                        관리자 대시보드 진입
                    </button>
                )}
                <button onClick={logout} className="w-full py-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors hover:bg-red-100"><LineIcon icon="logout" className="w-5 h-5" /> 로그아웃</button>
            </div>

            <Modal isOpen={isLinkModalOpen} onClose={() => setIsLinkModalOpen(false)} title="새 계정 연동">
                <div className="space-y-4">
                    <p className="text-xs text-gray-500 leading-relaxed">
                        연동할 계정의 정보를 입력하세요. 연동된 계정은 PIN 인증 후 손쉽게 전환하여 사용할 수 있습니다.
                    </p>
                    <div>
                        <label className="text-xs font-bold text-gray-400 mb-1 block">연동할 아이디</label>
                        {/* Fix: setRecipientSearch changed to setLinkId */}
                        <Input placeholder="아이디 입력" value={linkId} onChange={e => setLinkId(e.target.value)} />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-gray-400 mb-1 block">해당 계정 비밀번호</label>
                        <Input type="password" placeholder="비밀번호 입력" value={linkPw} onChange={e => setLinkPw(e.target.value)} />
                    </div>
                    <Button onClick={handleLinkExisting} className="w-full py-4 text-lg" disabled={isInternalLoading}>
                        {isInternalLoading ? "확인 중..." : "계정 연동 확인"}
                    </Button>
                </div>
            </Modal>
        </div>
    );
};
