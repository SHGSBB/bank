
import React, { useState, useEffect } from 'react';
import { useGame } from '../../../context/GameContext';
import { Button, Input, FileInput, formatName, Modal, Card, LineIcon } from '../../Shared';
import { uploadImage } from '../../../services/firebase';

export const ProfileInfoTab: React.FC = () => {
    const { currentUser, updateUser, showModal, applyBankruptcy, db } = useGame();
    const [nickname, setNickname] = useState(currentUser?.nickname || '');
    const [customJob, setCustomJob] = useState(currentUser?.customJob || '');
    const [showIdCard, setShowIdCard] = useState(false);
    
    // ID Card State
    const [idPhoto, setIdPhoto] = useState(currentUser?.profilePic || null);
    const [genderSelect, setGenderSelect] = useState<'male' | 'female'>('male');
    const [isReissuing, setIsReissuing] = useState(false);

    useEffect(() => {
        if (currentUser?.profilePic) setIdPhoto(currentUser.profilePic);
    }, [currentUser?.profilePic]);

    const handleUpdateProfile = () => {
        updateUser(currentUser!.name, { customJob, nickname });
        showModal('프로필 정보가 저장되었습니다.');
    };

    const handleUpdateProfilePic = async (base64: string | null) => {
        if (!base64) {
            updateUser(currentUser!.name, { profilePic: null });
            setIdPhoto(null);
            return;
        }
        try {
            const url = await uploadImage(`profiles/${currentUser!.name}_${Date.now()}`, base64);
            updateUser(currentUser!.name, { profilePic: url });
            setIdPhoto(url);
            showModal('프로필 사진이 업데이트되었습니다.');
        } catch (e) {
            showModal('사진 업로드 실패. 다시 시도해주세요.');
        }
    };

    const handleUpdateIdPhoto = async (base64: string | null) => {
        // Also updates main profile pic for consistency as per common use case in this app
        await handleUpdateProfilePic(base64);
    };

    const generateResidentNumber = (birth: string, gender: string) => {
        // Assume 2000s birth for simplicity or just random based on gender
        const suffix = gender === 'male' ? '3' : '4'; 
        const random = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
        return `${birth}-${suffix}${random}`;
    };

    const handleReissueID = () => {
        if (!currentUser?.birthDate) {
            showModal("생년월일 정보가 없습니다. 관리자에게 문의하세요.");
            return;
        }
        const newResNum = generateResidentNumber(currentUser.birthDate, genderSelect);
        updateUser(currentUser!.name, { 
            gender: genderSelect,
            idCard: { ...currentUser!.idCard!, residentNumber: newResNum }
        });
        setIsReissuing(false);
        showModal("주민등록증이 재발급(갱신)되었습니다.");
    };

    const handlePresentID = () => {
        setShowIdCard(false);
        // Trigger global event to open chat
        window.dispatchEvent(new CustomEvent('open-chat'));
    };

    const residentNumber = currentUser?.idCard?.residentNumber || (currentUser?.birthDate ? `${currentUser.birthDate}-*******` : '******-*******');
    const needsReissue = !currentUser?.gender || !currentUser?.idCard?.residentNumber;

    // Address Logic
    // Only show if owner has a house with no tenant
    const myHouse = (db.realEstate.grid || []).find(p => p.owner === currentUser?.name && !p.tenant);
    let address = '주소 정보 없음';
    if (myHouse) {
        if (myHouse.id === 1) address = "성화국 상가 1호 (대형)";
        else if (myHouse.id === 13) address = "성화국 상가 2호 (소형)";
        else {
            // Calculate Row/Col for 18 grid items (6 cols)
            // 1-6 Row 1, 7-12 Row 2, 13-18 Row 3
            // Assuming simplified grid logic based on ID
            const row = Math.ceil(myHouse.id / 6);
            const col = (myHouse.id - 1) % 6 + 1;
            address = `성화국 ${row}행 ${col}열`;
        }
    }

    return (
        <div className="flex flex-col items-center space-y-6 pt-4 w-full">
            {/* Profile Image Area */}
            <div className="relative group">
                <div className="w-32 h-32 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-4xl font-bold overflow-hidden border-4 border-white dark:border-gray-800 shadow-lg">
                     {currentUser?.profilePic ? <img src={currentUser.profilePic} className="w-full h-full object-cover"/> : formatName(currentUser?.name)[0]}
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
                <div className="w-full">
                    <label className="text-sm font-bold text-gray-500 mb-1 block ml-1">이름 (표시명)</label>
                    <Input 
                        value={nickname} 
                        onChange={e => setNickname(e.target.value)} 
                        placeholder={currentUser?.name} 
                        className="w-full p-4 rounded-2xl bg-[#F0F0F0] text-[#121212] dark:bg-[#2D2D2D] dark:text-[#E0E0E0] font-bold text-lg" 
                    />
                </div>

                <div className="w-full">
                    <label className="text-sm font-bold text-gray-500 mb-1 block ml-1">직업</label>
                    <Input 
                        value={customJob} 
                        onChange={e => setCustomJob(e.target.value)} 
                        placeholder="직업을 입력하세요" 
                        className="w-full p-4 rounded-2xl bg-[#F0F0F0] text-[#121212] dark:bg-[#2D2D2D] dark:text-[#E0E0E0] text-lg" 
                    />
                </div>

                <Button onClick={handleUpdateProfile} className="w-full py-4 text-lg rounded-2xl shadow-lg bg-black dark:bg-white text-white dark:text-black hover:opacity-90">
                    변경사항 저장
                </Button>

                <div className="grid grid-cols-2 gap-4 pt-2">
                    <Button onClick={() => setShowIdCard(true)} variant="secondary" className="w-full py-3 text-sm rounded-xl flex items-center justify-center gap-2">
                        <LineIcon icon="id_card" className="w-4 h-4" /> 신분증 보기
                    </Button>
                    <Button onClick={applyBankruptcy} variant="danger" className="w-full py-3 text-sm rounded-xl flex items-center justify-center gap-2">
                        <LineIcon icon="trash" className="w-4 h-4" /> 파산 신청
                    </Button>
                </div>
                <p className="text-[10px] text-gray-400 text-center mt-2">파산 신청 시 모든 자산이 초기화됩니다.</p>
            </div>

            {/* Resident Registration Card Modal */}
            <Modal isOpen={showIdCard} onClose={() => setShowIdCard(false)} title="모바일 신분증">
                <div className="relative w-full max-w-[340px] aspect-[1.58/1] mx-auto rounded-xl overflow-hidden shadow-2xl bg-white text-black border border-gray-200 select-none">
                    {/* Background Pattern */}
                    <div className="absolute inset-0 pointer-events-none" 
                         style={{ 
                             background: `
                                radial-gradient(circle at 30% 50%, rgba(255,0,0,0.05) 0%, transparent 40%),
                                radial-gradient(circle at 70% 50%, rgba(0,0,255,0.05) 0%, transparent 40%),
                                repeating-linear-gradient(45deg, #f9fafb 0, #f9fafb 2px, transparent 2px, transparent 4px)
                             ` 
                         }}>
                         <div className="absolute top-4 left-4 w-12 h-12 rounded-full border-2 border-gray-300 opacity-20 flex items-center justify-center">
                             <div className="w-full h-1/2 bg-red-100 rounded-t-full"></div>
                             <div className="w-full h-1/2 bg-blue-100 rounded-b-full absolute bottom-0"></div>
                         </div>
                    </div>

                    <div className="relative p-5 h-full flex flex-col justify-between z-10">
                        {/* Header */}
                        <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full border border-gray-400 flex flex-col overflow-hidden opacity-80">
                                <div className="h-3 bg-red-500"></div>
                                <div className="h-3 bg-blue-500"></div>
                            </div>
                            <h2 className="text-xl font-black tracking-tighter" style={{ fontFamily: 'serif' }}>주민등록증</h2>
                        </div>

                        {/* Body */}
                        <div className="flex gap-4 mt-1">
                            {/* Info */}
                            <div className="flex-1 flex flex-col justify-start space-y-1 pt-2">
                                <div className="text-xl font-bold tracking-widest">{formatName(currentUser?.name)}</div>
                                <div className="text-sm font-medium tracking-wider mt-1">{residentNumber}</div>
                                <div className="text-xs leading-snug mt-2 break-keep text-gray-700 font-medium">
                                    {address}
                                </div>
                            </div>

                            {/* Photo Slot */}
                            <div className="w-24 h-32 bg-gray-100 border border-gray-300 flex-shrink-0 relative overflow-hidden group shadow-inner">
                                {idPhoto ? (
                                    <img src={idPhoto} className="w-full h-full object-cover" alt="ID Photo" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs bg-gray-200">사진 없음</div>
                                )}
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="mt-auto pt-1">
                            <div className="text-[10px] text-gray-500 mb-1">
                                {currentUser?.idCard?.issueDate || new Date().toLocaleDateString()}
                            </div>
                            <div className="flex justify-between items-end">
                                <div className="text-lg font-bold font-serif text-center w-full relative tracking-widest">
                                    성화국 정부
                                </div>
                                <div className="absolute bottom-4 right-4 w-12 h-12 border-2 border-red-500 opacity-30 rounded flex items-center justify-center transform rotate-[-15deg]">
                                    <span className="text-[8px] text-red-500 font-bold">관인</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Actions below card */}
                <div className="mt-6 flex flex-col gap-3">
                    <div className="flex gap-3">
                        <label className="flex-1">
                            <div className="w-full py-3 bg-gray-100 dark:bg-gray-700 rounded-xl text-center font-bold text-sm cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                                사진 등록/수정
                            </div>
                            <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                                if (e.target.files && e.target.files[0]) {
                                    const reader = new FileReader();
                                    reader.onload = (ev) => handleUpdateIdPhoto(ev.target?.result as string);
                                    reader.readAsDataURL(e.target.files[0]);
                                }
                            }} />
                        </label>
                        <Button onClick={handlePresentID} className="flex-1 bg-blue-600 hover:bg-blue-500">제시하기 (메시지)</Button>
                    </div>

                    {(needsReissue || isReissuing) && (
                        <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-xl border border-yellow-200 dark:border-yellow-800">
                            <p className="text-xs font-bold text-yellow-700 dark:text-yellow-400 mb-2">
                                * 주민등록번호 형식이 올바르지 않거나 성별 정보가 없습니다. 재발급이 필요합니다.
                            </p>
                            {!isReissuing ? (
                                <Button onClick={() => setIsReissuing(true)} className="w-full text-xs">재발급 신청</Button>
                            ) : (
                                <div className="flex gap-2 items-center">
                                    <select 
                                        value={genderSelect} 
                                        onChange={e => setGenderSelect(e.target.value as any)}
                                        className="p-2 rounded border bg-white dark:bg-black text-sm flex-1"
                                    >
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
