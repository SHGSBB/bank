
import React, { useState } from 'react';
import { useGame } from '../../context/GameContext';
import { LineIcon } from '../Shared';
import { ProfileInfoTab } from './profile/ProfileInfoTab';
import { AccountTab } from './profile/AccountTab';
import { SecurityTab } from './profile/SecurityTab';
import { DisplayTab } from './profile/DisplayTab';
import { FeaturesTab } from './profile/FeaturesTab';
import { FeedbackTab } from './profile/FeedbackTab';
import { InfoTab } from './profile/InfoTab';

export const ProfileSettingsTab: React.FC = () => {
    const { showPinModal, currentUser } = useGame();
    const [subTab, setSubTab] = useState<'profile' | 'account' | 'security' | 'display' | 'features' | 'feedback' | 'info'>('profile');

    const handleTabChange = async (tab: 'profile' | 'account' | 'security' | 'display' | 'features' | 'feedback' | 'info') => {
        if (tab === 'security') {
            const pin = await showPinModal("보안 설정 인증", currentUser?.pin!, (currentUser?.pinLength as any) || 4);
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
            case 'info': return <InfoTab />;
            default: return null;
        }
    };

    return (
        <div className="w-full h-full flex flex-col max-h-[75vh]">
            <div className="flex border-b border-gray-200 dark:border-gray-700 mb-4 overflow-x-auto scrollbar-hide pb-1 shrink-0">
                {[
                    { id: 'profile', label: '프로필', icon: 'profile' },
                    { id: 'account', label: '계정', icon: 'id_card' },
                    { id: 'security', label: '보안', icon: 'security' },
                    { id: 'display', label: '화면', icon: 'display' },
                    { id: 'features', label: '기능', icon: 'star' },
                    { id: 'feedback', label: '피드백', icon: 'mail' },
                    { id: 'info', label: '정보', icon: 'finance' }
                ].map(tab => (
                    <button 
                        key={tab.id}
                        onClick={() => handleTabChange(tab.id as any)} 
                        className={`flex-1 min-w-fit px-5 py-3 text-xs font-bold border-b-2 transition-colors flex flex-col items-center gap-2 justify-center ${subTab === tab.id ? 'border-green-500 text-green-600 dark:text-green-400' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                    >
                        <LineIcon icon={tab.icon} className="w-5 h-5" />
                        <span>{tab.label}</span>
                    </button>
                ))}
            </div>

            <div className="flex-1 overflow-y-auto pb-4 px-1">
                {renderContent()}
            </div>
        </div>
    );
};
