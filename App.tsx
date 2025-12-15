
import React, { useEffect, useState, useRef } from 'react';
import { GameProvider, useGame } from './context/GameContext';
import { AuthView } from './components/views/Auth';
import { Dashboard } from './components/views/Dashboard';
import { PinModal, ToastContainer } from './components/Shared';

const ElementPickerOverlay: React.FC = () => {
    const { isElementPicking, setElementPicking } = useGame();
    const [hoveredElement, setHoveredElement] = useState<{ rect: DOMRect, label: string, path: string } | null>(null);
    const [selectedElements, setSelectedElements] = useState<{ rect: DOMRect, label: string, path: string, value: string }[]>([]);

    useEffect(() => {
        if (!isElementPicking) {
            setHoveredElement(null);
            setSelectedElements([]);
            return;
        }

        const handleMouseMove = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            // Ignore overlay itself
            if (target.id === 'element-picker-overlay' || target.closest('#element-picker-ui')) return;

            const rect = target.getBoundingClientRect();
            
            // Generate Path: Mode > Tab > Section > Field
            const parents = [];
            let curr: HTMLElement | null = target;
            let foundMode = false;
            
            // Try to find contextual headings or labels
            while(curr && curr.tagName !== 'BODY' && parents.length < 3) {
                // Heuristic: Look for Headers or Labels
                if (curr.tagName === 'H3') { // Likely Mode/Tab title
                    parents.unshift(curr.innerText);
                    foundMode = true;
                } else if (curr.tagName === 'H4' || curr.tagName === 'H5') { // Section title
                    parents.unshift(curr.innerText);
                } else if (curr.tagName === 'LABEL') {
                    parents.unshift(curr.innerText);
                } else if (curr.getAttribute('title')) {
                    parents.unshift(curr.getAttribute('title'));
                }
                curr = curr.parentElement;
            }
            
            // Fallback for label
            let label = target.getAttribute('aria-label') || target.innerText || (target as HTMLInputElement).value || target.tagName;
            if (label.length > 20) label = label.substring(0, 20) + '...';
            
            // Default prefix if not found
            if(!foundMode) parents.unshift("App");
            
            const path = parents.join(' > ');

            setHoveredElement({ rect, label, path });
        };

        const handleClick = (e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            if (!hoveredElement) return;
            
            const target = e.target as HTMLElement;
            const value = (target as HTMLInputElement).value || target.innerText || '';

            // Toggle selection
            const exists = selectedElements.find(el => el.label === hoveredElement.label && el.rect.top === hoveredElement.rect.top);
            
            if (exists) {
                setSelectedElements(prev => prev.filter(p => p !== exists));
            } else {
                setSelectedElements(prev => [...prev, { ...hoveredElement, value }]);
            }
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('click', handleClick, true);

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('click', handleClick, true);
        };
    }, [isElementPicking, hoveredElement, selectedElements]);

    const handleShare = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (selectedElements.length === 0) return;
        
        // Construct share data
        const data = selectedElements.map(el => ({
            label: el.label,
            path: el.path,
            value: el.value
        }));

        const bridge = document.getElementById('element-picker-bridge');
        if (bridge) {
            bridge.dispatchEvent(new CustomEvent('picked', { detail: data }));
        }
    };

    const handleCancel = (e: React.MouseEvent) => {
        e.stopPropagation();
        setElementPicking(false);
    };

    if (!isElementPicking) return null;

    return (
        <div id="element-picker-overlay" className="fixed inset-0 z-[10000] cursor-crosshair bg-black/10 backdrop-blur-[1px]">
            {/* Hover Box */}
            {hoveredElement && (
                <div 
                    className="absolute border-2 border-green-400 pointer-events-none transition-all duration-75 bg-green-400/10"
                    style={{
                        top: hoveredElement.rect.top + window.scrollY,
                        left: hoveredElement.rect.left + window.scrollX,
                        width: hoveredElement.rect.width,
                        height: hoveredElement.rect.height
                    }}
                >
                    <div className="absolute -top-6 left-0 bg-green-600 text-white text-[10px] px-2 py-1 rounded font-bold whitespace-nowrap shadow-md">
                        {hoveredElement.path}
                    </div>
                </div>
            )}

            {/* Selected Boxes */}
            {selectedElements.map((el, i) => (
                <div 
                    key={i}
                    className="absolute border-4 border-green-600 pointer-events-none bg-green-600/20"
                    style={{
                        top: el.rect.top + window.scrollY,
                        left: el.rect.left + window.scrollX,
                        width: el.rect.width,
                        height: el.rect.height
                    }}
                >
                    <div className="absolute -top-6 left-0 bg-green-600 text-white text-xs px-2 py-1 rounded font-bold whitespace-nowrap">
                        ✅ {el.label}
                    </div>
                </div>
            ))}

            {/* UI Controls */}
            <div id="element-picker-ui" className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-black text-white p-4 rounded-full shadow-2xl flex items-center gap-4 animate-slide-up border border-gray-700 pointer-events-auto">
                <div className="text-sm font-bold pl-2">
                    {selectedElements.length}개 선택됨
                </div>
                <div className="h-6 w-px bg-gray-600"></div>
                <button onClick={handleCancel} className="px-4 py-2 hover:bg-gray-800 rounded-full text-sm">취소</button>
                <button 
                    onClick={handleShare} 
                    className={`px-6 py-2 rounded-full font-bold transition-all ${selectedElements.length > 0 ? 'bg-green-500 hover:bg-green-400 text-white shadow-[0_0_15px_rgba(34,197,94,0.5)]' : 'bg-gray-600 text-gray-400 cursor-not-allowed'}`}
                >
                    공유하기
                </button>
            </div>
        </div>
    );
};

const GlobalOverlays: React.FC = () => {
    const { pinResolver, setPinResolver, confirmResolver, setConfirmResolver, alertMessage, setAlertMessage } = useGame();

    return (
        <>
            <ToastContainer />
            {pinResolver && (
                <PinModal resolver={pinResolver} setResolver={setPinResolver} />
            )}
            {alertMessage && (
                <div className="fixed inset-0 z-[4000] flex items-center justify-center bg-black/40 backdrop-blur-xl animate-fade-in px-4">
                    <div className="bg-white dark:bg-[#1E1E1E] p-6 rounded-[28px] max-w-sm w-full shadow-2xl animate-scale-in text-center border border-white/20 dark:border-white/10">
                        <p className="mb-6 text-gray-800 dark:text-gray-200 whitespace-pre-wrap font-bold">{alertMessage}</p>
                        <button onClick={() => setAlertMessage(null)} className="w-full py-3 bg-green-600 hover:bg-green-500 text-white rounded-xl font-bold">확인</button>
                    </div>
                </div>
            )}
            {confirmResolver && (
                <div className="fixed inset-0 z-[4000] flex items-center justify-center bg-black/40 backdrop-blur-xl animate-fade-in px-4">
                    <div className="bg-white dark:bg-[#1E1E1E] p-6 rounded-[28px] max-w-sm w-full shadow-2xl animate-scale-in text-center border border-white/20 dark:border-white/10">
                        <p className="mb-6 text-lg font-bold text-gray-800 dark:text-gray-200 whitespace-pre-wrap">{confirmResolver.message}</p>
                        <div className="flex gap-3">
                            <button onClick={() => { confirmResolver.resolve(false); setConfirmResolver(null); }} className="flex-1 py-3 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 rounded-xl font-bold">취소</button>
                            <button onClick={() => { confirmResolver.resolve(true); setConfirmResolver(null); }} className="flex-1 py-3 bg-green-600 hover:bg-green-500 text-white rounded-xl font-bold">확인</button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

const AppContent: React.FC = () => {
    const { currentUser, isLoading } = useGame();

    useEffect(() => {
        // Theme Logic
        const applyTheme = () => {
            const savedTheme = localStorage.getItem('theme');
            const currentUserTheme = currentUser?.preferences?.theme;
            
            const themeToApply = currentUserTheme || savedTheme || 'system';

            if (themeToApply === 'dark') {
                document.documentElement.classList.add('dark');
            } else if (themeToApply === 'light') {
                document.documentElement.classList.remove('dark');
            } else {
                if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
                    document.documentElement.classList.add('dark');
                } else {
                    document.documentElement.classList.remove('dark');
                }
            }
        };

        applyTheme();

        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        const handleChange = () => {
            const savedTheme = localStorage.getItem('theme');
            const currentUserTheme = currentUser?.preferences?.theme;
            if ((!savedTheme && !currentUserTheme) || savedTheme === 'system' || currentUserTheme === 'system') {
                applyTheme();
            }
        };
        
        mediaQuery.addEventListener('change', handleChange);
        return () => mediaQuery.removeEventListener('change', handleChange);

    }, [currentUser?.preferences?.theme]);

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#E9E9EB] dark:bg-[#121212]">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen p-4 sm:p-8 pb-24 sm:pb-8">
            {currentUser ? <Dashboard /> : <AuthView />}
            <ElementPickerOverlay />
            <GlobalOverlays />
        </div>
    );
};

const App: React.FC = () => {
    return (
        <GameProvider>
            <AppContent />
        </GameProvider>
    );
};

export default App;
