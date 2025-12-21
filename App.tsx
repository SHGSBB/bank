
import React, { useEffect, useState, useRef } from 'react';
import { GameProvider, useGame } from './context/GameContext';
import { AuthView } from './components/tabs/Auth';
import { Dashboard } from './components/views/Dashboard';
import { PinModal, ToastContainer, LineIcon } from './components/Shared';

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
                        <div className="mb-6 text-gray-800 dark:text-gray-200 whitespace-pre-wrap font-bold">{alertMessage}</div>
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

const MobileTabBar: React.FC = () => {
    const { activeTab, setActiveTab, currentUser, isAdminMode } = useGame();
    
    // Determine which tabs to show based on user role (simplified for mobile bar)
    // We pick the most important 4-5 tabs for the bottom bar
    const tabs = [
        { id: '이체', icon: 'finance', label: '홈' },
        { id: '거래 내역', icon: 'menu', label: '내역' },
        { id: '주식', icon: 'chart', label: '주식' }, // Fallback icon, logic below
        { id: '전체', icon: 'dots', label: '전체' }
    ];

    if (!currentUser) return null;

    return (
        <div className="fixed bottom-0 left-0 right-0 h-20 bg-white/80 dark:bg-[#121212]/80 backdrop-blur-lg border-t border-gray-200 dark:border-gray-800 flex justify-around items-center px-2 pb-4 z-[100] sm:hidden">
            {tabs.map(t => {
                const isActive = activeTab === t.id || (t.id === '전체' && !['이체', '거래 내역', '주식'].includes(activeTab));
                return (
                    <button 
                        key={t.id}
                        onClick={() => {
                            if (t.id === '전체') {
                                // Logic to open a "More" menu or just default to a safe tab if needed, 
                                // or the user can scroll the top bar. 
                                // For now, let's set it to '설정' or something if it exists, or just keep as is.
                                // Actually, simpler: Just show the main tabs here.
                            } else {
                                setActiveTab(t.id);
                            }
                        }}
                        className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all active:scale-95 ${isActive ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}`}
                    >
                        <LineIcon icon={t.icon === 'chart' ? 'finance' : t.icon} className={`w-6 h-6 ${isActive ? 'stroke-[2.5px]' : 'stroke-2'}`} />
                        <span className="text-[10px] font-bold">{t.label}</span>
                    </button>
                )
            })}
        </div>
    );
};

const AppContent: React.FC = () => {
    const { currentUser, isLoading } = useGame();

    // Theme Application Logic
    useEffect(() => {
        const applyTheme = () => {
            const savedTheme = localStorage.getItem('theme');
            const currentUserTheme = currentUser?.preferences?.theme;
            
            // Priority: User Prefs > Local Storage > System
            const themeToApply = currentUserTheme || savedTheme || 'system';

            const root = window.document.documentElement;
            const isDark = themeToApply === 'dark' || (themeToApply === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

            if (isDark) {
                root.classList.add('dark');
            } else {
                root.classList.remove('dark');
            }
        };

        applyTheme();

        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        const handleChange = () => {
            const currentPref = currentUser?.preferences?.theme || localStorage.getItem('theme');
            if (currentPref === 'system' || !currentPref) applyTheme();
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
        <div className="min-h-screen p-4 sm:p-8 pb-24 sm:pb-8 font-sans">
            {currentUser ? (
                <>
                    <Dashboard />
                    <MobileTabBar />
                </>
            ) : (
                <AuthView />
            )}
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
