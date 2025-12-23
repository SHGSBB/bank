
import React, { useMemo, useState, useEffect } from 'react';
import { LoanManagementTab } from './LoanManagementTab';
import { SavingsManagementTab } from './SavingsManagementTab';
import { useGame } from '../../../context/GameContext';
import { Card } from '../../Shared';

export const AdminRequestTab: React.FC = () => {
    const { currentUser, refreshData } = useGame();
    const [subTab, setSubTab] = useState('대출관리');
    
    // Force refresh to ensure pending applications are up to date
    useEffect(() => {
        refreshData();
    }, []);

    const hasBankAuthority = 
        currentUser?.type === 'admin' || 
        currentUser?.govtRole === '한국은행장' || 
        currentUser?.name === '한국은행' || 
        currentUser?.type === 'root';

    if (!hasBankAuthority) {
        return <Card className="p-10 text-center text-gray-400 font-bold border-none bg-gray-50">금융 관리 권한이 없습니다.</Card>;
    }

    const tabs = ['대출관리', '저금관리'];

    return (
        <div className="w-full">
             <div className="flex gap-2 mb-6 border-b border-gray-200 dark:border-gray-700 overflow-x-auto scrollbar-hide">
                {tabs.map(t => (
                    <button key={t} onClick={() => setSubTab(t)} className={`px-4 py-2 text-sm font-bold border-b-2 transition-colors whitespace-nowrap ${subTab === t ? 'border-green-500 text-green-600' : 'border-transparent text-gray-500'}`}>
                        {t}
                    </button>
                ))}
            </div>
            {subTab === '대출관리' && <LoanManagementTab />}
            {subTab === '저금관리' && <SavingsManagementTab />}
        </div>
    );
};
