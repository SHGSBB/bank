
import React, { useEffect, useRef, useState } from 'react';
import { useGame } from '../context/GameContext';
import { ToastNotification, User } from '../types';
import { loginBiometrics } from '../services/biometric';

export const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'danger' | 'secondary' }> = ({ className = '', variant = 'primary', onClick, ...props }) => {
    const { triggerHaptic } = useGame();
    
    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
        triggerHaptic();
        if (onClick) {
            onClick(e);
        }
    };

    const baseClass = "px-6 py-3 rounded-2xl font-bold transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base active:scale-95 shadow-sm flex items-center justify-center gap-2";
    const variants = {
        primary: "bg-green-600 text-white hover:bg-green-500 shadow-green-200 dark:shadow-none",
        danger: "bg-red-600 text-white hover:bg-red-500 shadow-red-200 dark:shadow-none",
        secondary: "bg-gray-600 text-white hover:bg-gray-500"
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
                className={`w-full p-4 rounded-2xl bg-[#F0F0F0] text-black dark:bg-[#2D2D2D] dark:text-white outline-none border border-transparent dark:border-gray-600 focus:ring-2 focus:ring-green-500 transition-all font-medium select-text ${className}`} 
                {...props} 
            />
            {isPassword && (
                <button 
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 focus:outline-none text-xs font-bold"
                    tabIndex={-1}
                >
                    {showPassword ? "숨김" : "보기"}
                </button>
            )}
        </div>
    );
};

export const FileInput: React.FC<{ onChange: (base64: string | null) => void }> = ({ onChange }) => {
    const [preview, setPreview] = useState<string | null>(null);
    const ref = useRef<HTMLInputElement>(null);

    const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const reader = new FileReader();
            reader.onload = (ev) => {
                const res = ev.target?.result as string;
                setPreview(res);
                onChange(res);
            };
            reader.readAsDataURL(e.target.files[0]);
        }
    };

    const clear = () => {
        setPreview(null);
        onChange(null);
        if (ref.current) ref.current.value = '';
    };

    return (
        <div className="flex items-center gap-3">
            <label className="cursor-pointer bg-gray-200 dark:bg-gray-700 px-4 py-2 rounded-xl text-sm font-bold hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors flex items-center gap-2">
                <LineIcon icon="image" className="w-4 h-4" />
                파일 선택
                <input type="file" ref={ref} accept="image/*" className="hidden" onChange={handleFile} />
            </label>
            {preview && (
                <div className="relative w-12 h-12 rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden group">
                    <img src={preview} className="w-full h-full object-cover" />
                    <button 
                        onClick={clear}
                        className="absolute inset-0 bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity font-bold"
                    >
                        X
                    </button>
                </div>
            )}
        </div>
    );
};

export const Toggle: React.FC<{ checked: boolean; onChange: (checked: boolean) => void }> = ({ checked, onChange }) => {
    return (
        <div 
            className={`w-12 h-7 flex items-center rounded-full p-1 cursor-pointer duration-300 ease-in-out ${checked ? 'bg-yellow-400' : 'bg-gray-300 dark:bg-gray-600'}`}
            onClick={() => onChange(!checked)}
        >
            <div className={`bg-white w-5 h-5 rounded-full shadow-md transform duration-300 ease-in-out ${checked ? 'translate-x-5' : ''}`}></div>
        </div>
    );
};

export const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => {
    return (
        <div className={`bg-white dark:bg-[#1E1E1E] rounded-[28px] shadow-sm p-6 sm:p-8 border border-gray-100 dark:border-gray-800 ${className}`}>
            {children}
        </div>
    );
};

export const Modal: React.FC<{ isOpen: boolean; onClose: () => void; title?: string; children: React.ReactNode; zIndex?: number; parentSelector?: string }> = ({ isOpen, onClose, title, children, zIndex = 3000, parentSelector }) => {
    if (!isOpen) return null;
    
    // Ensure higher Z-index than floating elements like bottom nav
    const finalZIndex = zIndex || 3000;

    const content = (
        <div className={`fixed inset-0 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in`} style={{ zIndex: finalZIndex }}>
            <div className="bg-white dark:bg-[#2C2C2C] rounded-[24px] w-[98%] max-w-5xl max-h-[90vh] overflow-hidden shadow-2xl animate-scale-in border border-transparent dark:border-gray-700 relative flex flex-col">
                <div className="p-5 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-white dark:bg-[#2C2C2C] shrink-0">
                    <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 truncate pr-4">{title || ''}</h3>
                    {onClose && (
                        <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors shrink-0">
                            <LineIcon icon="close" className="w-6 h-6 text-gray-500 dark:text-gray-400" />
                        </button>
                    )}
                </div>
                <div className="p-6 flex-1 overflow-y-auto text-black dark:text-gray-200">
                    {children}
                </div>
            </div>
        </div>
    );

    return content;
};

export const SwipeableListItem: React.FC<{
    children: React.ReactNode;
    swipeLeftContent?: React.ReactNode;  
    swipeRightContent?: React.ReactNode; 
    leftThreshold?: number;
    rightThreshold?: number;
}> = ({ 
    children, 
    swipeLeftContent,
    swipeRightContent,
    leftThreshold = 80, 
    rightThreshold = 80
}) => {
    const [offsetX, setOffsetX] = useState(0);
    const startX = useRef(0);
    const isTouch = useRef(false);
    
    const handleTouchStart = (e: React.TouchEvent) => {
        isTouch.current = true;
        startX.current = e.touches[0].clientX;
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (!isTouch.current) return;
        const currentX = e.touches[0].clientX;
        const diff = currentX - startX.current;
        
        let newOffset = diff;
        if (!swipeLeftContent && diff < 0) newOffset = diff * 0.2;
        if (!swipeRightContent && diff > 0) newOffset = diff * 0.2;
        
        if (newOffset > 150) newOffset = 150 + (newOffset - 150) * 0.2;
        if (newOffset < -150) newOffset = -150 + (newOffset + 150) * 0.2;

        setOffsetX(newOffset);
    };

    const handleTouchEnd = () => {
        isTouch.current = false;
        
        if (swipeRightContent && offsetX > rightThreshold) {
            setOffsetX(rightThreshold + 20); 
        } else if (swipeLeftContent && offsetX < -leftThreshold) {
            setOffsetX(-(leftThreshold + 20)); 
        } else {
            setOffsetX(0); 
        }
    };

    const reset = () => {
        setOffsetX(0);
    };

    return (
        <div className="relative overflow-hidden mb-0 bg-white dark:bg-[#121212] group border-b border-gray-100 dark:border-gray-800">
            <div className="absolute inset-0 flex justify-between items-center w-full h-full">
                <div className="h-full absolute left-0 top-0 flex" style={{ width: Math.max(0, offsetX) }}>
                    {swipeRightContent}
                </div>
                <div className="h-full absolute right-0 top-0 flex justify-end" style={{ width: Math.max(0, -offsetX) }}>
                    {swipeLeftContent}
                </div>
            </div>

            <div
                className="relative bg-white dark:bg-[#1E1E1E] transition-transform duration-300 ease-out z-10 w-full"
                style={{ transform: `translateX(${offsetX}px)` }}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onClick={reset}
            >
                {children}
            </div>
        </div>
    );
};

const formatKoreanNumber = (num: number): string => {
    if (num === 0) return '영';
    const units = ['', '만', '억', '조', '경', '해'];
    const smallUnits = ['', '십', '백', '천'];
    const numbers = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
    const strNum = Math.floor(num).toString();
    const result: string[] = [];
    let unitIndex = 0;
    for (let i = strNum.length; i > 0; i -= 4) {
        const chunk = strNum.substring(Math.max(0, i - 4), i);
        let chunkStr = '';
        for (let j = 0; j < chunk.length; j++) {
            const digit = parseInt(chunk[chunk.length - 1 - j]);
            if (digit !== 0) chunkStr = numbers[digit] + smallUnits[j] + chunkStr;
        }
        if (chunkStr !== '') result.unshift(chunkStr + units[unitIndex]);
        unitIndex++;
    }
    return result.join(' ');
};

export const formatSmartMoney = (amount: number | null | undefined, forceRounded: boolean = false) => {
    const safeAmount = amount || 0;
    if (!forceRounded) return safeAmount.toLocaleString(); 
    if (safeAmount < 10000) return safeAmount.toLocaleString();
    if (safeAmount < 100000000) return `${(safeAmount / 10000).toFixed(1)} 만`;
    if (safeAmount < 1000000000000) return `${(safeAmount / 100000000).toFixed(2)} 억`;
    return `${(safeAmount / 1000000000000).toFixed(2)} 조`;
};

export const formatShortPrice = (price: number | null | undefined): string => {
    const val = price || 0;
    if (val >= 100000000) {
        return `${(val / 100000000).toFixed(1)}억`;
    }
    if (val >= 10000) {
        return `${(val / 10000).toFixed(0)}만`;
    }
    return val.toLocaleString();
};

export const formatName = (fullName: string | null | undefined, userObject?: User): string => {
    if (!fullName) return "알 수 없음";
    if (userObject && userObject.nickname) return userObject.nickname;
    return fullName.replace(/_[a-zA-Z0-9]+$/, '');
};

export const MoneyInput: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = (props) => {
    const val = parseInt(props.value as string || '0');
    return (
        <div className="w-full flex flex-col">
            <Input {...props} />
            <div className="h-4 mt-1">
                {val > 0 && <p className="text-xs text-blue-600 dark:text-blue-400 font-bold px-1 text-right truncate">금 {formatKoreanNumber(val)} 원</p>}
            </div>
        </div>
    );
};

export const NoPasteInput: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = (props) => {
    return <Input {...props} onPaste={(e) => { e.preventDefault(); return false; }} onCopy={(e) => { e.preventDefault(); return false; }} />;
};

export const PieChart: React.FC<{ data: { label: string, value: number, color: string }[] }> = ({ data }) => {
    const safeData = data || [];
    const total = safeData.reduce((sum, item) => sum + (item.value || 0), 0);
    if (total === 0) return <div className="w-32 h-32 rounded-full bg-gray-200 mx-auto"></div>;
    let gradientString = '';
    let accumulatedDeg = 0;
    safeData.forEach((item, index) => {
        const val = item.value || 0;
        const deg = (val / total) * 360;
        gradientString += `${item.color} ${accumulatedDeg}deg ${accumulatedDeg + deg}deg${index < safeData.length - 1 ? ', ' : ''}`;
        accumulatedDeg += deg;
    });
    return <div className="w-48 h-48 rounded-full mx-auto shadow-inner border-4 border-white dark:border-[#333]" style={{ background: `conic-gradient(${gradientString})` }}></div>;
};

export const LineIcon: React.FC<{ icon: string, className?: string }> = ({ icon, className = "w-6 h-6" }) => {
    const paths: Record<string, string> = {
        'finance': 'M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
        'assets': 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
        'chat': 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z',
        'gov': 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4',
        'close': 'M6 18L18 6M6 6l12 12',
        'plus': 'M12 4v16m8-8H4',
        'send': 'M13 5l7 7-7 7M5 5l7 7-7 7',
        'menu': 'M4 6h16M4 12h16M4 18h16',
        'dots-vertical': 'M12 6v.01M12 12v.01M12 18v.01',
        'arrow-left': 'M15 19l-7-7 7-7',
        'arrow-right': 'M9 5l7 7-7 7',
        'attach': 'M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13',
        'reply': 'M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6',
        'copy': 'M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3',
        'trash': 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16',
        'edit': 'M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z',
        'leave': 'M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1',
        'love': 'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z',
        'like': 'M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5',
        'clock': 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
        'bell-off': 'M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z',
        'id_card': 'M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0c0 .884.336 1.334.884 1.334h2.232c.548 0 .884-.45.884-1.334M9 13h6',
        'face': 'M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
        'image': 'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z',
        'file': 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
        'profile': 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
        'security': 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z',
        'display': 'M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
        'star': 'M11.049 2.927c.3-.921 1.603-.921 1.603 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z',
        'mail': 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2-2v10a2 2 0 002 2z',
        'plus_dashed': 'M12 4v16m8-8H4',
        'switch': 'M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4',
        'check': 'M5 13l4 4L19 7',
        'lock': 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z',
        'sun': 'M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z',
        'moon': 'M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z',
        'monitor': 'M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
        'logout': 'M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1',
        'activity': 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6',
        'chart': 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
        'pie-chart': 'M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z',
        'arrow-up': 'M5 15l7-7 7 7',
        'arrow-down': 'M19 9l-7 7-7-7',
        'block': 'M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636',
        'search': 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z',
        'fingerprint': 'M12 11c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm6 2c0-3.31-2.69-6-6-6s-6 2.69-6 6c0 2.22 1.21 4.15 3 5.19l1-1.74c-1.19-.7-2-1.97-2-3.45 0-2.21 1.79-4 4-4s4 1.79 4 4c0 1.48-.81 2.75-2 3.45l1 1.74c1.79-1.04 3-2.97 3-5.19zM12 3C6.48 3 2 7.48 2 13c0 3.7 2.01 6.92 4.99 8.65l1-1.73C5.61 18.53 4 15.96 4 13c0-4.42 3.58-8 8-8s8 3.58 8 8c0 2.96-1.61 5.53-4 6.92l1 1.73c2.99-1.73 5-4.95 5-8.65 0-5.52-4.48-10-10-10z',
        'drawer': 'M4 6h16M4 12h16M4 18h16', // Hamburger menu
        'archive': 'M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4',
        'calendar': 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
        'settings': 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z'
    };

    return (
        <svg 
            xmlns="http://www.w3.org/2000/svg" 
            className={className} 
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor" 
            strokeWidth={2}
        >
            <path strokeLinecap="round" strokeLinejoin="round" d={paths[icon] || ''} />
        </svg>
    );
};

export const MobileTabIcon: React.FC<{ icon: string }> = ({ icon }) => {
    return <LineIcon icon={icon} />;
}

export const NotificationCenter: React.FC = () => {
    const { toasts, removeToast } = useGame();
    const [isHovered, setIsHovered] = useState(false);
    
    // Check Notification Permission status
    const isNativeAllowed = 'Notification' in window && Notification.permission === 'granted';

    const activeToasts = toasts.sort((a, b) => {
        if (a.isPersistent && !b.isPersistent) return 1;
        if (!a.isPersistent && b.isPersistent) return -1;
        return a.timestamp - b.timestamp;
    });

    useEffect(() => {
        const timer = setInterval(() => {
            if(isHovered) return; 
            const now = Date.now();
            toasts.forEach(t => {
                if (!t.isPersistent && (now - t.timestamp > 3500)) {
                    // Logic handled in render for hiding
                }
            });
        }, 1000);
        return () => clearInterval(timer);
    }, [toasts, isHovered]);

    const bgMap: Record<string, string> = {
        info: 'bg-white/90 dark:bg-gray-800/90',
        success: 'bg-green-100/90 dark:bg-green-900/90',
        warning: 'bg-yellow-100/90 dark:bg-yellow-900/90',
        error: 'bg-red-100/90 dark:bg-red-900/90',
        tax: 'bg-red-100/90 dark:bg-red-900/90 border-red-500'
    };

    // If native notifications are allowed, do not show ephemeral in-app toasts
    // Only show persistent/actionable toasts
    const visibleToasts = activeToasts.filter(t => {
        if (isNativeAllowed && !t.isPersistent) return false;
        return true;
    });

    // Z-Index 9999 ensures toasts are above all modals
    return (
        <div 
            className="fixed bottom-2 left-2 z-[9999] flex flex-col-reverse items-start gap-2 group"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            <div className="absolute bottom-0 left-0 w-12 h-12 group-hover:w-96 group-hover:h-auto min-h-[300px] transition-all duration-300 z-0" />
            {visibleToasts.map((t, index) => {
                const isExpired = !t.isPersistent && (Date.now() - t.timestamp > 3000);
                const isHidden = !isHovered && isExpired;
                const finalBg = t.isPaid ? 'bg-gray-100/90 dark:bg-gray-800/90 border-gray-300' : (bgMap[t.type] || bgMap.info);

                return (
                    <div 
                        key={t.id} 
                        className={`
                            z-10 pointer-events-auto transition-all duration-300 ease-in-out transform origin-bottom-left
                            ${isHidden ? 'scale-0 opacity-0 h-0 w-0 overflow-hidden m-0 p-0' : 'scale-100 opacity-100 w-80 mb-2'}
                            ${!isHovered && !isHidden ? 'translate-y-4 scale-90 opacity-0 group-hover:translate-y-0 group-hover:scale-100 group-hover:opacity-100' : ''}
                            p-4 rounded-2xl shadow-xl backdrop-blur-md border border-white/20 flex justify-between items-start gap-3 ${finalBg}
                        `}
                    >
                        <div className="flex-1">
                            <p className="font-bold text-sm mb-1">{t.title || '알림'}</p>
                            <p className="text-xs">{t.message}</p>
                        </div>
                        <button onClick={() => removeToast(t.id)} className="text-gray-500 hover:text-black dark:hover:text-white">✕</button>
                    </div>
                );
            })}
        </div>
    );
};

export const ToastContainer = NotificationCenter;

export const PinModal: React.FC<{ resolver: any; setResolver: any }> = ({ resolver, setResolver }) => {
    const [pin, setPin] = useState('');
    const [isError, setIsError] = useState(false);
    
    // Auto-resolve check or Error Shake
    useEffect(() => {
        if (pin.length === (resolver.pinLength || 4)) {
            if (resolver.expectedPin && pin !== resolver.expectedPin) {
                // Wrong PIN logic
                setIsError(true);
                if (navigator.vibrate) navigator.vibrate([100, 50, 100]); // Stronger vibration
                setTimeout(() => {
                    setPin('');
                    setIsError(false);
                }, 500); // Wait for shake
            } else {
                // Correct PIN or no expected pin (setting new one)
                resolver.resolve(pin);
                setResolver(null);
            }
        }
    }, [pin, resolver, setResolver]);

    // Keyboard support for PIN entry
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key >= '0' && e.key <= '9') {
                if (pin.length < (resolver.pinLength || 4)) {
                    setPin(prev => prev + e.key);
                }
            } else if (e.key === 'Backspace') {
                setPin(prev => prev.slice(0, -1));
            } else if (e.key === 'Escape') {
                // Do not close on Escape if error to enforce action, but generally Escape cancels
                if(!isError) {
                    resolver.resolve(null); 
                    setResolver(null);
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [pin, resolver, setResolver, isError]);

    // Biometric Logic Hook
    useEffect(() => {
        if (resolver.allowBiometric) {
            const tryBio = async () => {
                const success = await loginBiometrics('temp'); 
                if (success && resolver.expectedPin) {
                    resolver.resolve(resolver.expectedPin); // Auto-fill correct PIN on success
                    setResolver(null);
                }
            };
            // Automatically prompt for bio if available
            tryBio(); 
        }
    }, []);

    const handleNumClick = (num: number) => {
        if (pin.length < (resolver.pinLength || 4)) setPin(pin + num);
    };

    const handleBioClick = async () => {
        const success = await loginBiometrics('temp');
        if (success && resolver.expectedPin) {
            resolver.resolve(resolver.expectedPin);
            setResolver(null);
        }
    };

    // Z-Index 4000 to overlay standard Modals (z-3000)
    return (
        <div className="fixed inset-0 z-[4000] flex items-center justify-center bg-black/60 backdrop-blur-xl animate-fade-in p-4">
            <div className={`bg-white dark:bg-[#1E1E1E] rounded-[32px] p-8 w-full max-w-[340px] shadow-2xl animate-slide-up border border-white/10 relative transition-transform ${isError ? 'animate-shake border-red-500' : ''}`}>
                <button onClick={() => { resolver.resolve(null); setResolver(null); }} className="absolute top-4 right-4 text-gray-400 p-2 hover:text-black dark:hover:text-white">✕</button>
                
                <h3 className="text-xl font-bold text-center mb-2 text-black dark:text-white">간편 비밀번호 입력</h3>
                <p className={`text-sm text-center mb-8 ${isError ? 'text-red-500 font-bold' : 'text-gray-500'}`}>
                    {isError ? "비밀번호가 일치하지 않습니다" : resolver.message}
                </p>
                
                <div className="flex justify-center gap-4 mb-8">
                    {Array.from({ length: resolver.pinLength || 4 }).map((_, i) => (
                        <div key={i} className={`w-4 h-4 rounded-full transition-all duration-200 ${i < pin.length ? (isError ? 'bg-red-500' : 'bg-green-500 scale-110') : 'bg-gray-200 dark:bg-gray-700'}`}></div>
                    ))}
                </div>

                <div className="grid grid-cols-3 gap-4 mb-4">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                        <button key={num} onClick={() => handleNumClick(num)} className="h-16 rounded-2xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-2xl font-bold transition-colors active:scale-95 text-black dark:text-white">
                            {num}
                        </button>
                    ))}
                    <div className="flex items-center justify-center">
                        {resolver.allowBiometric && (
                            <button onClick={handleBioClick} className="p-4 rounded-full text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20">
                                <LineIcon icon="fingerprint" className="w-8 h-8" />
                            </button>
                        )}
                    </div>
                    <button onClick={() => handleNumClick(0)} className="h-16 rounded-2xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-2xl font-bold transition-colors active:scale-95 text-black dark:text-white">0</button>
                    <button onClick={() => setPin(pin.slice(0, -1))} className="h-16 rounded-2xl flex items-center justify-center text-gray-500 hover:text-black dark:hover:text-white active:scale-95">
                        <LineIcon icon="arrow-left" className="w-6 h-6" />
                    </button>
                </div>
            </div>
        </div>
    );
};
