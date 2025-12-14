
import React, { useState, useEffect } from 'react';
import { useGame } from '../../../context/GameContext';
import { Button, Input, LineIcon, Toggle } from '../../Shared';
import { checkBiometricSupport, registerBiometrics } from '../../../services/biometric';

export const SecurityTab: React.FC = () => {
    const { currentUser, updateUser, showPinModal, showModal } = useGame();
    
    const [newId, setNewId] = useState('');
    const [currentPwForId, setCurrentPwForId] = useState('');
    const [oldPw, setOldPw] = useState('');
    const [newPw, setNewPw] = useState('');
    const [newPwConfirm, setNewPwConfirm] = useState('');
    const [newPinSimple, setNewPinSimple] = useState('');
    
    const [showCredentials, setShowCredentials] = useState(false);
    
    // Biometric State
    const [isBioSupported, setIsBioSupported] = useState(false);
    const [bioEnabled, setBioEnabled] = useState(currentUser?.preferences?.biometricEnabled || false);

    useEffect(() => {
        const check = async () => {
            const supported = await checkBiometricSupport();
            setIsBioSupported(supported);
        };
        check();
    }, []);

    const handleIdChange = async () => {
        if (!newId.trim()) return showModal("새 아이디를 입력하세요.");
        if (currentPwForId !== currentUser?.password) return showModal("현재 비밀번호가 일치하지 않습니다.");
        updateUser(currentUser!.name, { id: newId.trim() });
        showModal('아이디가 변경되었습니다.');
        setNewId(''); setCurrentPwForId('');
    };
    
    const handlePasswordChange = async () => {
        if (oldPw !== currentUser?.password) return showModal('현재 비밀번호가 일치하지 않습니다.');
        if (newPw !== newPwConfirm) return showModal('새 비밀번호가 일치하지 않습니다.');
        updateUser(currentUser!.name, { password: newPw });
        showModal('비밀번호가 변경되었습니다.');
        setOldPw(''); setNewPw(''); setNewPwConfirm('');
    };

    const handlePinChangeSimple = async () => {
        if (!newPinSimple || (newPinSimple.length !== 4 && newPinSimple.length !== 6)) return showModal("PIN은 4자리 또는 6자리 숫자여야 합니다.");
        
        // Re-verify current PIN before changing
        const current = await showPinModal("변경 확인을 위해 현재 PIN을 입력하세요.", currentUser?.pin!, (currentUser?.pinLength as 4 | 6) || 4);
        if(current !== currentUser?.pin) return;
        
        // Update user state immediately
        const updates = { pin: newPinSimple, pinLength: newPinSimple.length as any };
        await updateUser(currentUser!.name, updates);
        
        showModal('간편번호가 변경되었습니다.');
        setNewPinSimple('');
    };

    const handleViewCredentials = async () => {
        const pin = await showPinModal("정보를 확인하려면 PIN을 입력하세요.", currentUser?.pin!, (currentUser?.pinLength as 4 | 6) || 4);
        if (pin === currentUser?.pin) {
            setShowCredentials(true);
        }
    };

    const handleToggleBiometric = async (val: boolean) => {
        if (val) {
            // Registering
            const pin = await showPinModal("생체 인식을 등록하려면 PIN을 입력하세요.", currentUser?.pin!, (currentUser?.pinLength as 4 | 6) || 4, false);
            if (pin !== currentUser?.pin) return;

            const success = await registerBiometrics(currentUser!.id!, currentUser!.name);
            if (success) {
                const prefs = currentUser?.preferences || {};
                await updateUser(currentUser!.name, { preferences: { ...prefs, biometricEnabled: true } });
                setBioEnabled(true);
                showModal("✅ 생체 정보가 등록되었습니다.");
            } else {
                showModal("❌ 생체 정보 등록에 실패했습니다.");
            }
        } else {
            // Disabling
            const prefs = currentUser?.preferences || {};
            await updateUser(currentUser!.name, { preferences: { ...prefs, biometricEnabled: false } });
            setBioEnabled(false);
            showModal("생체 인증 사용이 해제되었습니다.");
        }
    };

    return (
        <div className="space-y-6">
            {/* View Credentials Section */}
            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-2xl border border-blue-200 dark:border-blue-800">
                <h5 className="font-bold mb-2 text-sm text-blue-700 dark:text-blue-300 uppercase">내 계정 정보</h5>
                {showCredentials ? (
                    <div className="space-y-2">
                        <div className="flex justify-between items-center p-2 bg-white dark:bg-black rounded">
                            <span className="text-sm text-gray-500">아이디</span>
                            <span className="font-mono font-bold">{currentUser?.id}</span>
                        </div>
                        <div className="flex justify-between items-center p-2 bg-white dark:bg-black rounded">
                            <span className="text-sm text-gray-500">비밀번호</span>
                            <span className="font-mono font-bold">{currentUser?.password}</span>
                        </div>
                        <div className="flex justify-between items-center p-2 bg-white dark:bg-black rounded">
                            <span className="text-sm text-gray-500">PIN</span>
                            <span className="font-mono font-bold">{currentUser?.pin}</span>
                        </div>
                        <Button onClick={() => setShowCredentials(false)} variant="secondary" className="w-full mt-2 py-2 text-xs">숨기기</Button>
                    </div>
                ) : (
                    <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600 dark:text-gray-400">아이디 및 비밀번호 확인</span>
                        <button onClick={handleViewCredentials} className="text-blue-600 dark:text-blue-400 p-2 rounded-full hover:bg-blue-100 dark:hover:bg-blue-900/50">
                            <LineIcon icon="lock" className="w-5 h-5" />
                        </button>
                    </div>
                )}
            </div>

            {/* Biometric Section */}
            {isBioSupported && (
                <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-2xl border border-green-200 dark:border-green-800">
                    <div className="flex justify-between items-center">
                        <div>
                            <h5 className="font-bold text-sm text-green-700 dark:text-green-300 uppercase mb-1">생체 인증 (지문/Face ID)</h5>
                            <p className="text-xs text-gray-500">간편번호 대신 생체 인식을 사용합니다.</p>
                        </div>
                        <Toggle checked={bioEnabled} onChange={handleToggleBiometric} />
                    </div>
                </div>
            )}

            <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-2xl border border-gray-100 dark:border-gray-700">
                <h5 className="font-bold mb-4 text-sm text-gray-500 uppercase">아이디 변경</h5>
                <Input placeholder="새 아이디" value={newId} onChange={e => setNewId(e.target.value)} className="mb-3 w-full p-4" />
                <Input type="password" placeholder="현재 비밀번호" value={currentPwForId} onChange={e => setCurrentPwForId(e.target.value)} className="mb-3 w-full p-4" />
                <Button onClick={handleIdChange} className="w-full py-3">변경</Button>
            </div>

            <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-2xl border border-gray-100 dark:border-gray-700">
                <h5 className="font-bold mb-4 text-sm text-gray-500 uppercase">비밀번호 변경</h5>
                <Input type="password" placeholder="현재 비밀번호" value={oldPw} onChange={e => setOldPw(e.target.value)} className="mb-3 w-full p-4" />
                <Input type="password" placeholder="새 비밀번호" value={newPw} onChange={e => setNewPw(e.target.value)} className="mb-3 w-full p-4" />
                <Input type="password" placeholder="새 비밀번호 확인" value={newPwConfirm} onChange={e => setNewPwConfirm(e.target.value)} className="mb-3 w-full p-4" />
                <Button onClick={handlePasswordChange} className="w-full py-3">변경</Button>
            </div>

            <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-2xl border border-gray-100 dark:border-gray-700">
                <h5 className="font-bold mb-4 text-sm text-gray-500 uppercase">간편번호(PIN) 재설정</h5>
                <Input type="password" placeholder="새로운 PIN 입력 (4~6자리)" value={newPinSimple} onChange={e => setNewPinSimple(e.target.value)} className="mb-3 w-full p-4 text-center text-lg tracking-widest" maxLength={6} inputMode="numeric" />
                <Button onClick={handlePinChangeSimple} className="w-full py-3">설정 저장</Button>
            </div>
        </div>
    );
};
