
import React, { useState } from 'react';
import { useGame } from '../../../context/GameContext';
import { Toggle, LineIcon } from '../../Shared';
import { UserPreferences } from '../../../types';

export const DisplayTab: React.FC = () => {
    const { currentUser, updateUser } = useGame();
    const preferences = currentUser?.preferences || {};

    const handleUpdatePrefs = (key: keyof UserPreferences, value: any) => {
        // Deep merge preferences to avoid overwriting other keys if update is shallow
        const newPrefs = { ...preferences, [key]: value };
        // IMPORTANT: Use ID or Email as key to ensure optimistic update works in GameContext
        updateUser(currentUser!.id || currentUser!.email!, { preferences: newPrefs });
    };

    return (
        <div className="space-y-6">
            <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-2xl border border-gray-100 dark:border-gray-700">
                <h5 className="font-bold mb-4 text-sm text-gray-500 uppercase">테마 설정</h5>
                <div className="flex bg-gray-200 dark:bg-gray-700 p-1 rounded-xl">
                    {[
                        { id: 'system', label: '시스템', icon: 'monitor' },
                        { id: 'light', label: '라이트', icon: 'sun' },
                        { id: 'dark', label: '다크', icon: 'moon' }
                    ].map(t => (
                        <button 
                            key={t.id}
                            onClick={() => handleUpdatePrefs('theme', t.id)}
                            className={`flex-1 py-3 rounded-lg flex items-center justify-center gap-2 text-sm font-bold transition-all ${preferences.theme === t.id ? 'bg-white dark:bg-gray-600 shadow text-black dark:text-white' : 'text-gray-500'}`}
                        >
                            <LineIcon icon={t.icon} className="w-4 h-4" />
                            {t.label}
                        </button>
                    ))}
                </div>
            </div>

            {currentUser?.type === 'citizen' && (
                <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-2xl border border-green-200 dark:border-green-800">
                    <h5 className="font-bold mb-2 text-sm text-green-700 dark:text-green-300 uppercase">간편 모드 (Easy Mode)</h5>
                    <div className="flex justify-between items-center">
                        <span className="text-sm">핵심 기능만 간편하게 표시합니다.</span>
                        <Toggle checked={preferences.isEasyMode || false} onChange={v => handleUpdatePrefs('isEasyMode', v)} />
                    </div>
                </div>
            )}
        </div>
    );
};
