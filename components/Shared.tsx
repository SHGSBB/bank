import React, { useEffect, useRef, useState } from 'react';
import { useGame } from '../context/GameContext';
import { ToastNotification, User } from '../types';

export const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'danger' | 'secondary' }> = ({ className = '', variant = 'primary', ...props }) => {
    const baseClass = "px-6 py-3 rounded-2xl font-bold transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base active:scale-95 shadow-sm";
    const variants = {
        primary: "bg-green-600 text-white hover:bg-green-500 shadow-green-200 dark:shadow-none",
        danger: "bg-red-600 text-white hover:bg-red-500 shadow-red-200 dark:shadow-none",
        secondary: "bg-gray-600 text-white hover:bg-gray-500"
    };
    return <button className={`${baseClass} ${variants[variant]} ${className}`} {...props} />;
};

export const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = ({ className = '', type = 'text', ...props }) => {
    const [showPassword, setShowPassword] = useState(false);
    const isPassword = type === 'password';
    const inputType = isPassword && showPassword ? 'text' : type;

    return (
        <div className="relative w-full">
            <input 
                type={inputType}
                className={`w-full p-4 rounded-2xl bg-[#F0F0F0] text-[#121212] dark:bg-[#2D2D2D] dark:text-[#E0E0E0] outline-none focus:ring-2 focus:ring-green-500 transition-shadow font-medium select-text ${className}`} 
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
            <label className="cursor-pointer bg-gray-200 dark:bg-gray-700 px-4 py-2 rounded-xl text-sm font-bold hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">
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
            className={`w-12 h-7 flex items-center rounded-full p-1 cursor-pointer duration-300 ease-in-out ${checked ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`}
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

export const Modal: React.FC<{ isOpen: boolean; onClose: () => void; title?: string; children: React.ReactNode }> = ({ isOpen, onClose, title, children }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 flex items-center justify-center z-[60] p-4 bg-black/20 backdrop-blur-xl animate-fade-in">
            <div className="bg-white dark:bg-[#1E1E1E] rounded-[32px] w-full max-w-5xl max-h-[90vh] overflow-y-auto shadow-2xl animate-scale-in border border-white/40 dark:border-white/10">
                {(title || onClose) && (
                    <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center sticky top-0 bg-white/80 dark:bg-[#1E1E1E]/80 backdrop-blur-md z-10 rounded-t-[32px]">
                        {title && <h3 className="text-xl font-bold">{title}</h3>}
                        <button onClick={onClose} className="text-3xl leading-none text-gray-400 hover:text-gray-600">&times;</button>
                    </div>
                )}
                <div className="p-6 sm:p-8">
                    {children}
                </div>
            </div>
        </div>
    );
};

// --- New Components ---

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
            if (digit !== 0) {
                chunkStr = numbers[digit] + smallUnits[j] + chunkStr;
            }
        }
        
        if (chunkStr !== '') {
            result.unshift(chunkStr + units[unitIndex]);
        }
        unitIndex++;
    }
    
    return result.join(' ');
};

export const formatSmartMoney = (amount: number, forceRounded: boolean = false) => {
    if (!forceRounded) {
        return amount.toLocaleString(); 
    }
    if (amount < 10000) return amount.toLocaleString();
    if (amount < 100000000) { 
        return `${(amount / 10000).toFixed(1)} 만`;
    }
    if (amount < 1000000000000) {
        return `${(amount / 100000000).toFixed(2)} 억`;
    }
    if (amount < 10000000000000000) {
        return `${(amount / 1000000000000).toFixed(2)} 조`;
    }
    return `${(amount / 10000000000000000).toFixed(2)} 경`;
};

export const formatShortPrice = (price: number) => {
    if (price >= 100000000) {
        return `${(price / 100000000).toFixed(1)}억`;
    }
    if (price >= 10000) {
        return `${(price / 10000).toFixed(0)}만`;
    }
    return price.toLocaleString();
};

// Helper to display user name or nickname
export const formatName = (fullName: string | null | undefined, userObject?: User): string => {
    if (!fullName) return "알 수 없음";
    if (userObject && userObject.nickname) {
        return userObject.nickname;
    }
    const parts = fullName.split('_');
    if (parts.length > 1 && !isNaN(parseInt(parts[parts.length-1]))) {
        return parts.slice(0, -1).join('_');
    }
    return fullName;
};

export const MoneyInput: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = (props) => {
    const val = parseInt(props.value as string || '0');
    return (
        <div className="w-full flex flex-col">
            <Input {...props} />
            <div className="h-4 mt-1">
                {val > 0 && (
                    <p className="text-xs text-blue-600 dark:text-blue-400 font-bold px-1 text-right truncate">
                        금 {formatKoreanNumber(val)} 원
                    </p>
                )}
            </div>
        </div>
    );
};

export const NoPasteInput: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = (props) => {
    return (
        <Input 
            {...props} 
            onPaste={(e) => { e.preventDefault(); return false; }} 
            onCopy={(e) => { e.preventDefault(); return false; }}
        />
    );
};

export const MobileTabIcon: React.FC<{ icon: string }> = ({ icon }) => {
    // Simple mapping for line icons (SVG paths)
    const icons: Record<string, React.ReactNode> = {
        'finance': <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />, // Dollar Sign
        'assets': <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />, // Box
        'chat': <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />, // Message
        'gov': <path d="M3 21h18M5 21v-7M19 21v-7M4 10a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v3H4v-3zM12 2L4 6v2h16V6l-8-4z" />, // Capitol
    };

    return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {icons[icon] || <circle cx="12" cy="12" r="10" />}
        </svg>
    );
}

// --- Notification Center (Stack Style) ---

export const NotificationCenter: React.FC = () => {
    const { toasts, removeToast } = useGame();
    const [isHovered, setIsHovered] = useState(false);
    
    // Sort toasts: persistent/tax on top, then by timestamp
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

    const bgMap = {
        info: 'bg-white/90 dark:bg-gray-800/90',
        success: 'bg-green-100/90 dark:bg-green-900/90',
        warning: 'bg-yellow-100/90 dark:bg-yellow-900/90',
        error: 'bg-red-100/90 dark:bg-red-900/90',
        tax: 'bg-red-100/90 dark:bg-red-900/90 border-red-500'
    };

    return (
        <div 
            className="fixed bottom-2 left-2 z-[120] flex flex-col-reverse items-start gap-2 group"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            {/* Hover Trigger Area */}
            <div className="absolute bottom-0 left-0 w-12 h-12 group-hover:w-96 group-hover:h-auto min-h-[300px] transition-all duration-300 z-0" />

            {activeToasts.map((t, index) => {
                const isExpired = !t.isPersistent && (Date.now() - t.timestamp > 3000);
                const isHidden = !isHovered && isExpired;
                const finalBg = t.isPaid ? 'bg-gray-100/90 dark:bg-gray-800/90 border-gray-300' : bgMap[t.type];

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
                            <h4 className="font-bold text-sm mb-1">{t.title}</h4>
                            <p className="text-xs opacity-90">{t.message}</p>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                            {(t.isPaid || !t.isPersistent) && (
                                <button onClick={(e) => { e.stopPropagation(); removeToast(t.id); }} className="text-gray-500 hover:text-black dark:hover:text-white font-bold p-1 leading-none text-lg">×</button>
                            )}
                            {t.action && !t.isPaid && (
                                <button 
                                    onClick={(e) => { e.stopPropagation(); t.action?.onClick(); }}
                                    className="px-3 py-1.5 bg-black/10 hover:bg-black/20 dark:bg-white/10 dark:hover:bg-white/20 rounded-lg text-xs font-bold whitespace-nowrap transition-colors"
                                >
                                    {t.action.label}
                                </button>
                            )}
                        </div>
                    </div>
                );
            })}
            
            {/* Persistent Indicator if hidden */}
            {!isHovered && activeToasts.some(t => !t.isPaid) && (
                <div className="w-10 h-10 rounded-full bg-red-500 text-white flex items-center justify-center font-bold shadow-lg animate-pulse z-20 pointer-events-none">
                    !
                </div>
            )}
        </div>
    );
};

export const ToastContainer: React.FC = () => {
    return <NotificationCenter />;
};

export const PinModal: React.FC<{ 
    resolver: { resolve: (s: string | null) => void, message: string, expectedPin?: string, pinLength?: number }, 
    setResolver: (v: any) => void 
}> = ({ resolver, setResolver }) => {
    const length = resolver.pinLength || (resolver.expectedPin ? resolver.expectedPin.length : 4);
    const [digits, setDigits] = useState(Array(length).fill(''));
    const [status, setStatus] = useState<'normal' | 'error' | 'success'>('normal');
    const [shake, setShake] = useState(false);
    const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

    useEffect(() => { inputRefs.current[0]?.focus(); }, []);
    useEffect(() => { if (shake) { const timer = setTimeout(() => setShake(false), 500); return () => clearTimeout(timer); } }, [shake]);

    const handleChange = (index: number, value: string) => {
        if (!/^\d*$/.test(value)) return;
        const newDigits = [...digits];
        newDigits[index] = value.slice(-1);
        setDigits(newDigits);
        if (value && index < length - 1) inputRefs.current[index + 1]?.focus();

        if (newDigits.every(d => d !== '')) {
            const pin = newDigits.join('');
            if (resolver.expectedPin) {
                if (pin === resolver.expectedPin) {
                    setStatus('success');
                    setTimeout(() => { resolver.resolve(pin); setResolver(null); }, 500);
                } else {
                    setStatus('error'); setShake(true);
                    setTimeout(() => { setDigits(Array(length).fill('')); setStatus('normal'); inputRefs.current[0]?.focus(); }, 1000);
                }
            } else {
                setStatus('success');
                setTimeout(() => { resolver.resolve(pin); setResolver(null); }, 300);
            }
        }
    };
    const handleKeyDown = (index: number, e: React.KeyboardEvent) => { if (e.key === 'Backspace' && !digits[index] && index > 0) inputRefs.current[index - 1]?.focus(); };
    const handleCancel = () => { resolver.resolve(null); setResolver(null); };

    return (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 backdrop-blur-xl animate-fade-in">
            <div className={`bg-white dark:bg-[#1E1E1E] p-8 rounded-[32px] max-w-lg w-full text-center shadow-2xl animate-scale-in border border-white/20 dark:border-white/10 ${shake ? 'animate-shake' : ''}`}>
                <p className="mb-8 text-xl font-bold text-gray-900 dark:text-gray-100">{resolver.message}</p>
                <div className="flex justify-center gap-3 mb-4 flex-wrap">
                    {digits.map((digit, i) => (
                        <input key={i} ref={(el) => { if (el) inputRefs.current[i] = el; }} type="password" inputMode="numeric" maxLength={1} value={digit} onChange={(e) => handleChange(i, e.target.value)} onKeyDown={(e) => handleKeyDown(i, e)} className={`w-14 h-14 text-center text-3xl border-2 rounded-2xl bg-gray-50 dark:bg-gray-800 outline-none transition-all duration-200 text-gray-900 dark:text-white ${status === 'success' ? 'border-green-500 bg-green-100 dark:bg-green-900' : ''} ${status === 'error' ? 'border-red-500 bg-red-100 dark:bg-red-900' : 'focus:border-green-500 border-gray-300 dark:border-gray-600 focus:shadow-md'}`} />
                    ))}
                </div>
                {status === 'error' && <p className="text-red-500 text-sm mb-4 font-bold">재시도하십시오</p>}
                <div className={`mt-8 ${status === 'error' ? 'mt-2' : ''}`}><button onClick={handleCancel} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 font-medium text-sm px-4 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">취소</button></div>
            </div>
        </div>
    );
};