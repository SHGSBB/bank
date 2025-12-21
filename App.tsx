
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
                <Dashboard />
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
