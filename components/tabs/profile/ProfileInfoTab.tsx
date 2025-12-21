
import React, { useState, useEffect } from 'react';
import { useGame } from '../../../context/GameContext';
import { Button, Input, FileInput, formatName, Modal, Card, LineIcon } from '../../Shared';
import { uploadImage, toSafeId } from '../../../services/firebase';

export const ProfileInfoTab: React.FC = () => {
    const { currentUser, updateUser, showModal, applyBankruptcy, db } = useGame();
    
    // Sync local state with currentUser whenever it updates
    const [nickname, setNickname] = useState('');
    const [customJob, setCustomJob] = useState('');
    const [idPhoto, setIdPhoto] = useState<string | null>(null);

    useEffect(() => {
        if (currentUser) {
            setNickname(currentUser.nickname || '');
            setCustomJob(currentUser.customJob || '');
            setIdPhoto(currentUser.profilePic || null);
        }
    }, [currentUser?.nickname, currentUser?.customJob, currentUser?.profilePic]);

    const [showIdCard, setShowIdCard] = useState(false);
    const [genderSelect, setGenderSelect] = useState<'male' | 'female'>('male');
    const [isReissuing, setIsReissuing] = useState(false);

    const handleUpdateProfile = async () => {
        if (!currentUser?.email) return;
        try {
            await updateUser(currentUser.email, { customJob, nickname });
            showModal('프로필 정보가 저장되었습니다.');
        } catch (e) {
            showModal('저장에 실패했습니다.');
        }
    };

    const handleUpdateProfilePic = async (base64: string | null) => {
        if (!currentUser?.email) return;
        
        if (!base64) {
            await updateUser(currentUser.email, { profilePic: null });
            setIdPhoto(null);
            return;
        }

        try {
            const safeEmail = toSafeId(currentUser.email);
            const path = `profiles/${safeEmail}_${Date.now()}.png`;
            const url = await uploadImage(path, base64);
            
            await updateUser(currentUser.email, { profilePic: url });
            setIdPhoto(url);
            showModal('프로필 사진이 업데이트되었습니다.');
        } catch (e: any) {
            console.error(e);
            showModal('사진 업로드 실패: ' + e.message);
        }
    };

    const handleUpdateIdPhoto = async (base64: string | null) => {
        await handleUpdateProfilePic(base64);
    };

    const generateResidentNumber = (birth: string, gender: string) => {
        const suffix = gender === 'male' ? '3' : '4'; 
        const random = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
        return `${birth}-${suffix}${random}`;
    };

    const handleReissueID = async () => {
        if (!currentUser?.birthDate || !currentUser?.email) {
            showModal("정보가 부족합니다. 관리자에게 문의하세요.");
            return;
        }
        const newResNum = generateResidentNumber(currentUser.birthDate, genderSelect);
        await updateUser(currentUser.email, { 
            gender: genderSelect,
            idCard: { ...currentUser.idCard!, residentNumber: newResNum, issueDate: new Date().toLocaleDateString(), address: address || '성화국' }
        });
        setIsReissuing(false);
        showModal("주민등록증이 재발급되었습니다.");
    };

    const handlePresentID = () => {
        setShowIdCard(false);
        window.dispatchEvent(new CustomEvent('open-chat'));
    };

    const residentNumber = currentUser?.idCard?.residentNumber || (currentUser?.birthDate ? `${currentUser.birthDate}-*******` : '******-*******');
    const needsReissue = !currentUser?.gender || !currentUser?.idCard?.residentNumber;

    const myHouse = (db.realEstate.grid || []).find(p => p.owner === currentUser?.name && !p.tenant);
    let address = '주소 정보 없음';
    if (myHouse) {
        if (myHouse.id === 1) address = "성화국 상가 1호 (대형)";
        else if (myHouse.id === 13) address = "성화국 상가 2호 (소형)";
        else {
            const row = Math.ceil(myHouse.id / 6);
            const col = (myHouse.id - 1) % 6 + 1;
            address = `성화국 ${row}행 ${col}열`;
        }
    }

    return (
        <div className="flex flex-col items-center space-y-6 pt-4 w-full">
            <div className="relative group">
                <div className="w-32 h-32 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-4xl font-bold overflow-hidden border-4 border-white dark:border-gray-800 shadow-lg">
                     {idPhoto ? (
                        <img src={idPhoto} className="w-full h-full object-cover" alt="Profile" onError={() => setIdPhoto(null)} />
                     ) : (
                        formatName(currentUser?.name)[0]
                     )}
                </div>
                <div className="absolute bottom-0 right-0">
                     <label className="cursor-pointer bg-white dark:bg-gray-800 p-2 rounded-full shadow-md border dark:border-gray-600 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                        <LineIcon icon="image" className="w-5 h-5 text-gray-600 dark:text-gray-300" />
                        <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                            if (e.target.files && e.target.files[0]) {
                                const reader = new FileReader();
                                reader.onload = (ev) => handleUpdateProfilePic(ev.target?.result as string);
                                reader.readAsDataURL(e.target.files[0]);
                            }
                        }} />
                     </label>
                </div>
            </div>
            
            <div className="w-full space-y-4 px-2">
                <div>
                    <label className="text-sm font-bold text-gray-500 mb-1 block ml-1">이름 (표시명)</label>
                    <Input value={nickname} onChange={e => setNickname(e.target.value)} placeholder={currentUser?.name} />
                </div>
                <div>
                    <label className="text-sm font-bold text-gray-500 mb-1 block ml-1">직업</label>
                    <Input value={customJob} onChange={e => setCustomJob(e.target.value)} placeholder="직업을 입력하세요" />
                </div>
                <Button onClick={handleUpdateProfile} className="w-full">저장</Button>
                <div className="grid grid-cols-2 gap-4">
                    <Button onClick={() => setShowIdCard(true)} variant="secondary" className="text-sm">신분증 보기</Button>
                    <Button onClick={applyBankruptcy} variant="danger" className="text-sm">파산 신청</Button>
                </div>
            </div>

            <Modal isOpen={showIdCard} onClose={() => setShowIdCard(false)} title="모바일 신분증">
                <div className="relative w-full max-w-[340px] aspect-[1.58/1] mx-auto rounded-xl overflow-hidden shadow-2xl bg-white text-black border border-gray-200">
                    <div className="relative p-5 h-full flex flex-col justify-between">
                        <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full border border-gray-400 flex flex-col overflow-hidden">
                                <div className="h-3 bg-red-500"></div>
                                <div className="h-3 bg-blue-500"></div>
                            </div>
                            <h2 className="text-xl font-black">주민등록증</h2>
                        </div>
                        <div className="flex gap-4 mt-1">
                            <div className="flex-1 space-y-1">
                                <div className="text-xl font-bold">{formatName(currentUser?.name)}</div>
                                <div className="text-sm font-medium">{residentNumber}</div>
                                <div className="text-xs text-gray-700">{address}</div>
                            </div>
                            <div className="w-24 h-32 bg-gray-100 border border-gray-300 overflow-hidden shadow-inner">
                                {idPhoto ? <img src={idPhoto} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">사진 없음</div>}
                            </div>
                        </div>
                        <div className="mt-auto text-center text-lg font-bold font-serif tracking-widest">성화국 정부</div>
                    </div>
                </div>
                <div className="mt-6 flex flex-col gap-3">
                    <div className="flex gap-3">
                        <label className="flex-1 py-3 bg-gray-100 dark:bg-gray-700 rounded-xl text-center font-bold text-sm cursor-pointer hover:opacity-80 transition-opacity">
                            사진 등록/수정
                            <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                                if (e.target.files && e.target.files[0]) {
                                    const reader = new FileReader();
                                    reader.onload = (ev) => handleUpdateIdPhoto(ev.target?.result as string);
                                    reader.readAsDataURL(e.target.files[0]);
                                }
                            }} />
                        </label>
                        <Button onClick={handlePresentID} className="flex-1">제시하기</Button>
                    </div>
                    {needsReissue && (
                        <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-xl border border-yellow-200">
                            <p className="text-xs font-bold text-yellow-700 mb-2">재발급이 필요합니다.</p>
                            {!isReissuing ? <Button onClick={() => setIsReissuing(true)} className="w-full text-xs">재발급 신청</Button> : (
                                <div className="flex gap-2">
                                    <select value={genderSelect} onChange={e => setGenderSelect(e.target.value as any)} className="p-2 rounded border bg-white text-sm flex-1">
                                        <option value="male">남성</option>
                                        <option value="female">여성</option>
                                    </select>
                                    <Button onClick={handleReissueID} className="text-xs">확인</Button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </Modal>
        </div>
    );
};
