
import React, { useState } from 'react';
import { useGame } from '../../context/GameContext';
import { Button, Input, Card } from '../Shared';
import { fetchUserByLoginId } from '../../services/firebase';

export const AuthView: React.FC = () => {
    const { login, showPinModal, showModal, updateUser } = useGame();
    const [loginId, setLoginId] = useState('');
    const [loginPass, setLoginPass] = useState('');
    const [rememberMe, setRememberMe] = useState(false);

    const handleLogin = async () => {
        if (!loginId || !loginPass) return showModal("정보를 입력하세요.");
        
        // Pre-fetch DB record to check the *real* PIN status to prevent setup loop
        const dbUser = await fetchUserByLoginId(loginId);
        
        const success = await login(loginId, loginPass, rememberMe);
        if (success) {
            // Check if DB record has a valid PIN
            const hasPin = dbUser && dbUser.pin !== null && dbUser.pin !== undefined && dbUser.pin !== "";
            
            if (!hasPin && dbUser) {
                const newPin = await showPinModal("보안을 위해 새로운 간편번호 4자리를 등록하세요.", undefined, 4);
                if (newPin) {
                    await updateUser(dbUser.name, { pin: newPin, pinLength: 4 });
                    showModal("간편번호가 성공적으로 등록되었습니다.");
                }
            }
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4">
            <Card className="w-full max-w-md text-center">
                <h2 className="text-3xl font-bold mb-8">성화 은행</h2>
                <div className="space-y-4">
                    <Input placeholder="아이디" value={loginId} onChange={e => setLoginId(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleLogin()} />
                    <Input type="password" placeholder="비밀번호" value={loginPass} onChange={e => setLoginPass(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleLogin()} />
                    <label className="flex items-center gap-2 text-sm justify-start cursor-pointer">
                        <input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} className="accent-green-600 w-4 h-4" /> 
                        로그인 상태 유지
                    </label>
                    <Button className="w-full py-4 text-lg" onClick={handleLogin}>로그인</Button>
                </div>
            </Card>
        </div>
    );
};
