
import React, { useState } from 'react';
import { useGame } from '../../context/GameContext';
import { LineIcon } from '../Shared';

// Imports from separate files (inline definition for this response to comply with constraints)
import { ProfileInfoTab } from './profile/ProfileInfoTab';
import { AccountTab } from './profile/AccountTab';
import { SecurityTab } from './profile/SecurityTab';
import { DisplayTab } from './profile/DisplayTab';
import { FeaturesTab } from './profile/FeaturesTab';
import { FeedbackTab } from './profile/FeedbackTab';

export const ProfileSettingsTab: React.FC = () => {
    const { showPinModal, currentUser } = useGame();
    const [subTab, setSubTab] = useState<'profile' | 'account' | 'security' | 'display' | 'features' | 'feedback'>('profile');

    const handleTabChange = async (tab: 'profile' | 'account' | 'security' | 'display' | 'features' | 'feedback') => {
        // Only require PIN for Security tab
        if (tab === 'security') {
            const pin = await showPinModal("보안 설정에 접근하려면 인증이 필요합니다.", currentUser?.pin!, (currentUser?.pinLength as 4 | 6) || 4);
            if (pin !== currentUser?.pin) return;
        }
        setSubTab(tab);
    };

    const renderContent = () => {
        switch (subTab) {
            case 'profile': return <ProfileInfoTab />;
            case 'account': return <AccountTab />;
            case 'security': return <SecurityTab />;
            case 'display': return <DisplayTab />;
            case 'features': return <FeaturesTab />;
            case 'feedback': return <FeedbackTab />;
            default: return null;
        }
    };

    return (
        <div className="w-full h-full flex flex-col max-h-[75vh]">
            <div className="flex border-b border-gray-200 dark:border-gray-700 mb-4 overflow-x-auto scrollbar-hide pb-1">
                {[
                    { id: 'profile', label: '프로필', icon: 'profile' },
                    { id: 'account', label: '계정', icon: 'id_card' },
                    { id: 'security', label: '보안', icon: 'security' },
                    { id: 'display', label: '화면', icon: 'display' },
                    { id: 'features', label: '부가기능', icon: 'star' },
                    { id: 'feedback', label: '피드백', icon: 'mail' }
                ].map(tab => (
                    <button 
                        key={tab.id}
                        onClick={() => handleTabChange(tab.id as any)} 
                        className={`flex-1 min-w-fit px-4 py-3 text-sm font-bold border-b-2 whitespace-nowrap transition-colors flex items-center gap-2 justify-center ${subTab === tab.id ? 'border-green-500 text-green-600 dark:text-green-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
                    >
                        <LineIcon icon={tab.icon} className="w-4 h-4" />
                        {tab.label}
                    </button>
                ))}
            </div>

            <div className="flex-1 overflow-y-auto pb-4 pr-1">
                {renderContent()}
            </div>
        </div>
    );
};
