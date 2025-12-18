
import React, { useState, useEffect, useRef } from 'react';
import { useGame } from '../../../context/GameContext';
import { Button, Input, Modal, formatName, LineIcon, Card } from '../../Shared';

export const AccountTab: React.FC = () => {
    const { currentUser, switchAccount, showPinModal, setAdminMode, showModal, logout, serverAction, cachedLinkedUsers, setCachedLinkedUsers, showConfirm, refreshData } = useGame();
    const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
    const [linkId, setLinkId] = useState('');
    const [linkPw, setLinkPw] = useState('');
    const [isInternalLoading, setIsInternalLoading] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    
    // 무한 로딩 방지를 위한 상태 관리 레퍼런스
    const fetchStatusRef = useRef<'idle' | 'loading' | 'success' | 'error'>('idle');

    const loadLinked = async () => {
        // 이미 로딩 중이거나 성공했다면 다시 호출하지 않음
        if (fetchStatusRef.current === 'loading' || !currentUser) return;

        const linkedIds = currentUser.linkedAccounts || [];
        if (linkedIds.length === 0) {
            setCachedLinkedUsers([]);
            fetchStatusRef.current = 'success';
            return;
        }

        // 캐시된 데이터와 실제 데이터 개수가 같고 내용이 같다면 로딩 스킵
        const cachedIds = cachedLinkedUsers.map(u => u.name);
        const isAlreadyMatched = linkedIds.length === cachedIds.length && 
                               linkedIds.every(id => cachedIds.includes(id));
        
        if (isAlreadyMatched && fetchStatusRef.current === 'success') {
            return;
        }

        fetchStatusRef.current = 'loading';
        setIsInternalLoading(true);
        setLoadError(null);

        try {
            const res = await serverAction('fetch_linked_accounts', { linkedIds });
            if (res && res.accounts) {
                setCachedLinkedUsers(res.accounts);
                fetchStatusRef.current = 'success';
            } else {
                throw new Error("Invalid response");
            }
        } catch (e) {
            console.error("Linked accounts load failed", e);
            setLoadError("계정 정보를 불러오지 못했습니다.");
            fetchStatusRef.current = 'error';
        } finally {
            setIsInternalLoading(false);
        }
    };

    useEffect(() => {
        // 컴포넌트 마운트 시 혹은 연동 계정 목록이 바뀌었을 때만 실행
        fetchStatusRef.current = 'idle';
        loadLinked();
    }, [currentUser?.linkedAccounts?.join(',')]);

    const handleSwitch = async (targetName: string | undefined) => {
        if (!targetName) return;
        const pin = await showPinModal("계정 전환 인증", currentUser?.pin!, (currentUser?.pinLength as any) || 4);
        if (pin !== currentUser?.pin) return;

        const success = await switchAccount(targetName);
        if (success) {
            showModal("계정이 전환되었습니다.");
            // 전환 후에는 새로운 사용자 기준으로 다시 로드해야 하므로 idle 상태로 변경
            fetchStatusRef.current = 'idle';
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
            fetchStatusRef.current = 'idle'; // 새로운 연동이 생겼으므로 다시 불러오기 유도
            await refreshData(); 
        } catch (e: any) {
            showModal("연동 실패: 정보가 일치하지 않거나 이미 연동된 계정입니다.");
        } finally {
            setIsInternalLoading(false);
        }
    };

    const handleUnlink = async (targetName: string) => {
        if (!await showConfirm("정말 연동을 해제하시겠습니까?")) return;
        setIsInternalLoading(true);
        try {
            await serverAction('unlink_account', { myName: currentUser!.name, targetName });
            showModal("연동이 해제되었습니다.");
            fetchStatusRef.current = 'idle';
            await refreshData();
        } catch (e) {
            showModal("해제 실패");
        } finally {
            setIsInternalLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <Card className="bg-gray-50 dark:bg-gray-800 border-none shadow-none">
                <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-full bg-green-500 overflow-hidden border-2 border-white dark:border-gray-700 shadow-md">
                        {currentUser?.profilePic ? <img src={currentUser.profilePic} className="w-full h-full object-cover" alt="Profile"/> : <span className="text-2xl text-white font-bold flex items-center justify-center h-full">{formatName(currentUser?.name)[0]}</span>}
                    </div>
                    <div>
                        <p className="font-bold text-lg">{formatName(currentUser?.name, currentUser)}</p>
                        <p className="text-sm text-gray-500">ID: {currentUser?.id}</p>
                    </div>
                </div>
            </Card>

            <div>
                <div className="flex justify-between items-center mb-3 px-1">
                    <h4 className="font-bold text-sm text-gray-400 uppercase tracking-wider">연동된 계정</h4>
                    {isInternalLoading && <div className="animate-spin h-4 w-4 border-2 border-green-500 border-t-transparent rounded-full"></div>}
                </div>
                
                <div className="space-y-3">
                    {loadError && (
                        <div className="p-4 bg-red-50 text-red-600 rounded-xl text-xs text-center border border-red-100">
                            {loadError} <button onClick={() => { fetchStatusRef.current = 'idle'; loadLinked(); }} className="ml-2 underline font-bold">재시도</button>
                        </div>
                    )}
                    {cachedLinkedUsers.length === 0 && !isInternalLoading && !loadError && (
                        <p className="text-center text-gray-400 py-6 text-sm bg-white dark:bg-gray-900 rounded-2xl border border-dashed border-gray-200 dark:border-gray-800">연동된 계정이 없습니다.</p>
                    )}
                    {cachedLinkedUsers.map((acc: any) => (
                        <div key={acc.name} className="flex items-center justify-between p-4 bg-white dark:bg-[#1E1E1E] border border-gray-100 dark:border-gray-800 rounded-2xl shadow-sm">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-800 overflow-hidden">
                                    {acc.profilePic ? <img src={acc.profilePic} className="w-full h-full object-cover" /> : <span className="flex items-center justify-center h-full font-bold text-gray-400">{acc.name?.[0]}</span>}
                                </div>
                                <div>
                                    <p className="font-bold text-sm">{formatName(acc.name, acc)}</p>
                                    <p className="text-[10px] text-gray-400">@{acc.id}</p>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <Button onClick={() => handleSwitch(acc.name)} variant="secondary" className="text-[10px] py-1 px-3 rounded-lg">전환</Button>
                                <button onClick={() => handleUnlink(acc.name)} className="text-[10px] text-red-500 font-bold px-2">해제</button>
                            </div>
                        </div>
                    ))}
                    <button onClick={() => setIsLinkModalOpen(true)} className="w-full py-4 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-2xl text-gray-400 hover:text-green-500 hover:border-green-500 transition-all flex items-center justify-center gap-2 font-bold text-sm">
                        <LineIcon icon="plus_dashed" className="w-5 h-5" /> 새 계정 연동하기
                    </button>
                </div>
            </div>

            <div className="pt-6 space-y-4">
                {(currentUser?.type === 'admin' || currentUser?.subType === 'teacher' || currentUser?.isPresident) && (
                    <button onClick={async () => { const pin = await showPinModal("관리자 인증", currentUser?.pin!, (currentUser?.pinLength as any)||4); if(pin === currentUser?.pin) setAdminMode(true); }} className="w-full py-2 text-gray-400 text-xs underline text-center">관리자 대시보드 진입</button>
                )}
                <button onClick={logout} className="w-full py-4 bg-red-50 dark:bg-red-900/10 text-red-600 rounded-2xl font-bold flex items-center justify-center gap-2 shadow-sm"><LineIcon icon="logout" className="w-5 h-5" /> 로그아웃</button>
            </div>

            <Modal isOpen={isLinkModalOpen} onClose={() => setIsLinkModalOpen(false)} title="계정 연동">
                <div className="space-y-4">
                    <p className="text-xs text-gray-500">연동할 계정의 아이디와 비밀번호를 입력하세요. 연동 후에는 PIN 인증만으로 계정을 즉시 전환할 수 있습니다.</p>
                    <Input placeholder="연동할 아이디" value={linkId} onChange={e => setLinkId(e.target.value)} />
                    <Input type="password" placeholder="해당 계정 비밀번호" value={linkPw} onChange={e => setLinkPw(e.target.value)} />
                    <Button onClick={handleLinkExisting} className="w-full py-4" disabled={isInternalLoading}>{isInternalLoading ? "확인 중..." : "연동하기"}</Button>
                </div>
            </Modal>
        </div>
    );
};
