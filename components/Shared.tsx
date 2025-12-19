import React, { useEffect, useRef, useState } from 'react';
import { useGame } from '../context/GameContext';
import { ToastNotification, User } from '../types';
import { loginBiometrics } from '../services/biometric';

const KOREAN_UNITS = [
    '', '만', '억', '조', '경', '해', '자', '양', '구', '간', '정', '재', '극', 
    '항하사', '아승기', '나유타', '불가사의', '무량대수'
];

export const formatSmartMoney = (amount: number | null | undefined, forceRounded: boolean = false) => {
    if (amount === null || amount === undefined || isNaN(amount)) return '0';
    if (amount === 0) return '0';
    const isNegative = amount < 0;
    const absVal = Math.abs(Math.floor(amount));
    const strAbs = absVal.toLocaleString('fullwide', {useGrouping:false});
    const len = strAbs.length;
    if (len <= 4) return (isNegative ? '-' : '') + absVal.toLocaleString();
    const unitIndex = Math.floor((len - 1) / 4);
    const unit = KOREAN_UNITS[unitIndex] || '...';
    if (!forceRounded) return (isNegative ? '-' : '') + absVal.toLocaleString();
    const slicePos = len % 4 || 4;
    const majorPart = strAbs.slice(0, slicePos);
    const minorPart = strAbs.slice(slicePos, slicePos + 2);
    return (isNegative ? '-' : '') + `${majorPart}${parseInt(minorPart) > 0 ? '.' + minorPart : ''}${unit}`;
};

export const formatShortPrice = (amount: number | null | undefined) => {
    if (amount === null || amount === undefined || isNaN(amount)) return '0';
    if (amount === 0) return '0';
    const absVal = Math.abs(Math.floor(amount));
    if (absVal >= 100000000) return (amount / 100000000).toFixed(1).replace(/\.0$/, '') + '억';
    if (absVal >= 10000) return (amount / 10000).toFixed(0) + '만';
    return amount.toLocaleString();
};

export const formatName = (name?: string, user?: User | null) => {
    if (!name) return '알 수 없음';
    if (user?.nickname) return user.nickname;
    return name.split('_')[0];
};

export const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'danger' | 'secondary' }> = ({ className = '', variant = 'primary', onClick, ...props }) => {
    const { triggerHaptic } = useGame();
    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
        triggerHaptic();
        if (onClick) onClick(e);
    };
    const baseClass = "px-6 py-3 rounded-[18px] font-bold transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base active:scale-95 shadow-sm flex items-center justify-center gap-2";
    const variants = {
        primary: "bg-green-600 text-white hover:bg-green-500",
        danger: "bg-red-600 text-white hover:bg-red-500",
        secondary: "bg-gray-200 text-gray-800 dark:bg-gray-800 dark:text-gray-200 hover:opacity-80"
    };
    return <button className={`${baseClass} ${variants[variant]} ${className}`} onClick={handleClick} {...props} />;
};

export const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = ({ className = '', type = 'text', ...props }) => {
    const [showPassword, setShowPassword] = useState(false);
    const isPassword = type === 'password';
    const inputType = isPassword && showPassword ? 'text' : type;
    return (
        <div className="relative w-full">
            <input 
                type={inputType}
                className={`w-full p-4 rounded-[18px] bg-gray-100 text-black dark:bg-[#252525] dark:text-white outline-none border border-transparent dark:border-gray-700 focus:ring-2 focus:ring-green-500 transition-all font-medium ${className}`} 
                {...props} 
            />
            {isPassword && (
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-xs font-bold" tabIndex={-1}>
                    {showPassword ? "숨김" : "보기"}
                </button>
            )}
        </div>
    );
};

export const MoneyInput: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = ({ className = '', ...props }) => {
    return <Input className={`font-bold ${className}`} {...props} />;
};

export const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => {
    return <div className={`bg-white dark:bg-[#1C1C1E] rounded-[24px] shadow-sm p-6 sm:p-8 border border-gray-100 dark:border-gray-800 ${className}`}>{children}</div>;
};

export const Modal: React.FC<{ isOpen: boolean; onClose: () => void; title?: string; children: React.ReactNode; zIndex?: number; wide?: boolean }> = ({ isOpen, onClose, title, children, zIndex = 3000, wide = false }) => {
    if (!isOpen) return null;
    return (
        <div className={`fixed inset-0 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in`} style={{ zIndex }}>
            <div className={`bg-white dark:bg-[#1C1C1E] rounded-[28px] w-full ${wide ? 'max-w-4xl' : 'max-w-lg'} max-h-[90vh] overflow-hidden shadow-2xl animate-scale-in border border-transparent dark:border-gray-800 relative flex flex-col`}>
                <div className="p-5 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center shrink-0">
                    <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 truncate pr-4">{title || ''}</h3>
                    {onClose && (
                        <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                            <LineIcon icon="close" className="w-6 h-6 text-gray-500 dark:text-gray-400" />
                        </button>
                    )}
                </div>
                <div className="p-6 flex-1 overflow-y-auto">{children}</div>
            </div>
        </div>
    );
};

export const Toggle: React.FC<{ checked: boolean; onChange: (val: boolean) => void }> = ({ checked, onChange }) => {
    return (
        <button 
            type="button"
            onClick={() => onChange(!checked)}
            className={`w-12 h-6 rounded-full transition-colors relative ${checked ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`}
        >
            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${checked ? 'left-7' : 'left-1'}`}></div>
        </button>
    );
};

export const LineIcon: React.FC<{ icon: string, className?: string }> = ({ icon, className = "w-6 h-6" }) => {
    const paths: Record<string, string> = {
        'finance': 'M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
        'close': 'M6 18L18 6M6 6l12 12',
        'lock': 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z',
        'logout': 'M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1',
        'arrow-left': 'M15 19l-7-7 7-7',
        'arrow-right': 'M9 5l7 7-7 7',
        'fingerprint': 'M12 11c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm6 2c0-3.31-2.69-6-6-6s-6 2.69-6 6c0 2.22 1.21 4.15 3 5.19l1-1.74c-1.19-.7-2-1.97-2-3.45 0-2.21 1.79-4 4-4s4 1.79 4 4c0 1.48-.81 2.75-2 3.45l1 1.74c1.79-1.04 3-2.97 3-5.19zM12 3C6.48 3 2 7.48 2 13c0 3.7 2.01 6.92 4.99 8.65l1-1.73C5.61 18.53 4 15.96 4 13c0-4.42 3.58-8 8-8s8 3.58 8 8c0 2.96-1.61 5.53-4 6.92l1 1.73c2.99-1.73 5-4.95 5-8.65 0-5.52-4.48-10-10-10z',
        'chat': 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z',
        'search': 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z',
        'plus': 'M12 4v16m8-8H4',
        'plus_dashed': 'M12 9v3m0 0v3m0-3h3m-3 0H9',
        'check': 'M5 13l4 4L19 7',
        'send': 'M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z',
        'image': 'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z',
        'trash': 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16',
        'monitor': 'M9.75 17L9 20h6l-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
        'display': 'M9.75 17L9 20h6l-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
        'sun': 'M12 3v1m0 16v1m9-9h-1M3 12H2',
        'moon': 'M20.354 15.354A9 9 0 018.646 3.646',
        'mail': 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5',
        'star': 'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.539-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z',
        'profile': 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
        'id_card': 'M3 10h18M7 15h1m4 0h1m-7 4h12a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
        'security': 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
        'menu': 'M4 6h16M4 12h16M4 18h16',
        'arrow-up': 'M5 15l7-7 7 7',
        'arrow-down': 'M19 9l-7 7-7-7'
    };
    return <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d={paths[icon] || ''} /></svg>;
};

export const PinModal: React.FC<{ resolver: any; setResolver: any }> = ({ resolver, setResolver }) => {
    const [pin, setPin] = useState('');
    const [isError, setIsError] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    
    const handleComplete = (finalPin: string) => {
        if (isProcessing) return;
        setIsProcessing(true);

        if (resolver.expectedPin && finalPin !== resolver.expectedPin) {
            setIsError(true);
            if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
            setTimeout(() => { 
                setPin(''); 
                setIsError(false);
                setIsProcessing(false);
            }, 600);
        } else {
            setIsSuccess(true);
            if (navigator.vibrate) navigator.vibrate(50);
            
            // Critical: Close modal first, then resolve the promise in the next tick
            // to prevent React state collision during unmounting.
            setTimeout(() => {
                const res = resolver.resolve;
                setResolver(null);
                res(finalPin);
            }, 500);
        }
    };

    useEffect(() => {
        if (pin.length === (resolver.pinLength || 4) && !isProcessing && !isError) {
            handleComplete(pin);
        }
    }, [pin, isProcessing, isError]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (isProcessing || isSuccess) return;
            if (e.key >= '0' && e.key <= '9') {
                if (pin.length < (resolver.pinLength || 4)) setPin(p => p + e.key);
            } else if (e.key === 'Backspace') {
                setPin(p => p.slice(0, -1));
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [pin, resolver.pinLength, isProcessing, isSuccess]);

    return (
        <div className="fixed inset-0 z-[6000] flex items-center justify-center bg-black/60 backdrop-blur-xl animate-fade-in p-4">
            <div className={`bg-white dark:bg-[#1C1C1E] rounded-[32px] p-8 w-full max-w-[340px] shadow-2xl animate-slide-up border border-white/10 relative ${isError ? 'animate-shake border-red-500' : ''} ${isSuccess ? 'border-green-500' : ''}`}>
                <button onClick={() => { resolver.resolve(null); setResolver(null); }} className="absolute top-4 right-4 text-gray-400 p-2" disabled={isProcessing}>✕</button>
                <h3 className="text-xl font-bold text-center mb-2">간편 비밀번호 입력</h3>
                <p className={`text-sm text-center mb-8 ${isError ? 'text-red-500 font-bold' : (isSuccess ? 'text-green-500 font-bold' : 'text-gray-500')}`}>
                    {isError ? "비밀번호가 일치하지 않습니다" : (isSuccess ? "확인되었습니다" : (resolver.message || "4자리 번호를 입력하세요"))}
                </p>
                <div className="flex justify-center gap-4 mb-8">
                    {Array.from({ length: resolver.pinLength || 4 }).map((_, i) => (
                        <div key={i} className={`w-4 h-4 rounded-full transition-all duration-200 ${i < pin.length ? (isError ? 'bg-red-500' : 'bg-green-500 scale-125 shadow-[0_0_8px_rgba(34,197,94,0.5)]') : 'bg-gray-200 dark:bg-gray-700'}`}></div>
                    ))}
                </div>
                <div className="grid grid-cols-3 gap-4">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                        <button key={num} onClick={() => !isProcessing && setPin(p => p + num)} disabled={isProcessing} className="h-16 rounded-[18px] bg-gray-100 dark:bg-gray-800 text-2xl font-bold active:scale-95 disabled:opacity-50 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                            {num}
                        </button>
                    ))}
                    <div className="flex items-center justify-center">
                        {resolver.allowBiometric && <button onClick={async () => { if(await loginBiometrics('temp') && resolver.expectedPin) handleComplete(resolver.expectedPin); }} className="p-4 rounded-full text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors" disabled={isProcessing}><LineIcon icon="fingerprint" className="w-8 h-8" /></button>}
                    </div>
                    <button onClick={() => !isProcessing && setPin(p => p + '0')} disabled={isProcessing} className="h-16 rounded-[18px] bg-gray-100 dark:bg-gray-800 text-2xl font-bold active:scale-95 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">0</button>
                    <button onClick={() => !isProcessing && setPin(p => p.slice(0, -1))} disabled={isProcessing} className="h-16 rounded-[18px] flex items-center justify-center text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                        <LineIcon icon="arrow-left" className="w-6 h-6" />
                    </button>
                </div>
            </div>
        </div>
    );
};

export const PieChart: React.FC<{ data: { label: string, value: number, color: string }[], centerText?: string }> = ({ data, centerText }) => {
    const total = data.reduce((sum, item) => sum + item.value, 0);
    let cumulativePercent = 0;
    const getCoordinatesForPercent = (percent: number) => [Math.cos(2 * Math.PI * percent), Math.sin(2 * Math.PI * percent)];
    return (
        <div className="relative w-48 h-48 mx-auto">
            <svg viewBox="-1 -1 2 2" className="w-full h-full -rotate-90">
                {data.map((item, i) => {
                    const [startX, startY] = getCoordinatesForPercent(cumulativePercent);
                    const percent = item.value / (total || 1);
                    cumulativePercent += percent;
                    const [endX, endY] = getCoordinatesForPercent(cumulativePercent);
                    return <path key={i} d={`M ${startX} ${startY} A 1 1 0 ${percent > 0.5 ? 1 : 0} 1 ${endX} ${endY} L 0 0`} fill={item.color} />;
                })}
            </svg>
            <div className="absolute inset-0 flex items-center justify-center flex-col">
                <div className="bg-white dark:bg-[#1C1C1E] rounded-full w-24 h-24 flex items-center justify-center flex-col shadow-inner">
                    <span className="text-[10px] text-gray-500 font-bold">TOTAL</span>
                    <span className="text-xs font-black truncate px-2">{centerText}</span>
                </div>
            </div>
        </div>
    );
};

export const FileInput: React.FC<{ onChange: (base64: string | null) => void }> = ({ onChange }) => {
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return onChange(null);
        const reader = new FileReader();
        reader.onload = (event) => onChange(event.target?.result as string);
        reader.readAsDataURL(file);
    };
    return (
        <input type="file" accept="image/*" onChange={handleFileChange} className="text-xs text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-green-50 file:text-green-700 hover:file:bg-green-100" />
    );
};

export const ToastContainer: React.FC = () => {
    const { toasts } = useGame();
    return (
        <div className="fixed top-6 right-6 z-[9999] flex flex-col gap-3 pointer-events-none max-w-sm w-full sm:w-auto">
            {(toasts || []).map((toast: ToastNotification) => (
                <div key={toast.id} className={`p-4 rounded-2xl shadow-2xl border backdrop-blur-md animate-fade-in pointer-events-auto flex items-center gap-3 ${
                    toast.type === 'error' ? 'bg-red-500 text-white border-red-400' :
                    toast.type === 'success' ? 'bg-green-600 text-white border-green-500' :
                    toast.type === 'warning' ? 'bg-orange-500 text-white border-orange-400' :
                    'bg-white dark:bg-[#1C1C1E] border-gray-100 dark:border-gray-800 text-black dark:text-white'
                }`}>
                    <div className="flex-1">
                        {toast.title && <p className="font-bold text-[10px] uppercase tracking-wider mb-0.5 opacity-80">{toast.title}</p>}
                        <p className="text-sm font-bold">{toast.message}</p>
                    </div>
                </div>
            ))}
        </div>
    );
};