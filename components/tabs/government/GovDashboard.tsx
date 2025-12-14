
import React from 'react';
import { useGame } from '../../../context/GameContext';
import { Card } from '../../Shared';
import { PresidentDashboard } from './President/PresidentDashboard';
import { MinisterDashboard } from './JusticeMinister/MinisterDashboard';
import { ProsecutorDashboard } from './Prosecutor/ProsecutorDashboard';
import { JudgeDashboard } from './Judge/JudgeDashboard';
import { CongressmanDashboard } from './Congressman/CongressmanDashboard';

export const GovDashboard: React.FC = () => {
    const { currentUser } = useGame();
    
    // Role Routing
    const role = currentUser?.govtRole || '';
    const branches = currentUser?.govtBranch || [];

    if (role === '대통령' || currentUser?.isPresident) {
        return <PresidentDashboard />;
    }
    
    if (role === '법무부장관') {
        return <MinisterDashboard />;
    }
    
    if (role === '검사') {
        return <ProsecutorDashboard />;
    }
    
    if (role === '판사') {
        return <JudgeDashboard />;
    }
    
    if (role === '국회의원') {
        return <CongressmanDashboard />;
    }

    // Default Fallback for generic officials
    return (
        <Card>
            <h3 className="text-2xl font-bold mb-4">공무원 대시보드</h3>
            <p className="text-gray-500">
                할당된 특수 권한이 없습니다.<br/>
                소속: {branches.join(', ') || '없음'}
            </p>
        </Card>
    );
};
