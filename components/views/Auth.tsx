
import React, { useState } from 'react';
import { useGame } from '../../context/GameContext';
import { Button, Input, Card } from '../Shared';
import { fetchUserByLoginId } from '../../services/firebase';

export const AuthView: React.FC = () => {
    const { login, showPinModal, showModal, updateUser } = useGame();
    const [loginId, setLoginId] = useState('');
    const [loginPass, setLoginPass] = useState('');
    const [rememberMe, setRememberMe] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const handleLogin = async () => {
        const id = loginId.trim();
        const pw = loginPass.trim();
        
        if (!id || !pw) {
            showModal("아이디와 비밀번호를 입력하세요.");
            return;
        }
        
        setIsLoading(true);
        try {
            // Pre-fetch DB record if possible to check PIN status
            const dbUser = await fetchUserByLoginId(id);
            
            const success = await login(id, pw, rememberMe);
            if (success) {
                // If login successful, check for missing PIN
                const hasPin = dbUser && dbUser.pin !== null && dbUser.pin !== undefined && dbUser.pin !== "";
                
                if (!hasPin && dbUser) {
                    const newPin = await showPinModal("보안을 위해 새로운 간편번호 4자리를 등록하세요.", undefined, 4);
                    if (newPin && newPin.length >= 4) {
                        await updateUser(dbUser.name, { pin: newPin, pinLength: newPin.length as any });
                        showModal("간편번호가 성공적으로 등록되었습니다.");
                    }
                }
            }
        } catch (e) {
            console.error("Login component error:", e);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-[#E9E9EB] dark:bg-[#121212]">
            <Card className="w-full max-w-md text-center shadow-2xl rounded-[32px] p-8 sm:p-12 border-none">
                <div className="flex flex-col items-center mb-8">
                    <div className="w-20 h-20 bg-green-500 rounded-3xl flex items-center justify-center text-white shadow-lg mb-4">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                    <h2 className="text-3xl font-black tracking-tighter">성화 은행</h2>
                    <p className="text-sm text-gray-500 font-medium mt-1">SUNGHWA DIGITAL BANKING</p>
                </div>

                <div className="space-y-4">
                    <Input 
                        placeholder="아이디 또는 사용자명" 
                        value={loginId} 
                        onChange={e => setLoginId(e.target.value)} 
                        onKeyDown={(e) => e.key === 'Enter' && handleLogin()} 
                        disabled={isLoading}
                    />
                    <Input 
                        type="password" 
                        placeholder="비밀번호" 
                        value={loginPass} 
                        onChange={e => setLoginPass(e.target.value)} 
                        onKeyDown={(e) => e.key === 'Enter' && handleLogin()} 
                        disabled={isLoading}
                    />
                    
                    <div className="flex items-center justify-between px-2 py-1">
                        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                            <input 
                                type="checkbox" 
                                checked={rememberMe} 
                                onChange={e => setRememberMe(e.target.checked)} 
                                className="accent-green-600 w-4 h-4 rounded" 
                            /> 
                            <span className="text-gray-600 dark:text-gray-400 font-medium">자동 로그인</span>
                        </label>
                        <button className="text-xs text-gray-400 font-medium hover:text-green-500 transition-colors">아이디/비밀번호 찾기</button>
                    </div>

                    <Button 
                        className="w-full py-4 text-lg mt-4 shadow-xl" 
                        onClick={handleLogin}
                        disabled={isLoading}
                    >
                        {isLoading ? "로그인 중..." : "로그인"}
                    </Button>
                </div>

                <div className="mt-8 pt-6 border-t border-gray-100 dark:border-gray-800">
                    <p className="text-sm text-gray-500">
                        계정이 없으신가요? 
                        <button className="ml-2 text-green-600 font-bold hover:underline">회원가입</button>
                    </p>
                </div>
            </Card>
        </div>
    );
};
