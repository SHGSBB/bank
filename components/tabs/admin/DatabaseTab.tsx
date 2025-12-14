
import React from 'react';
import { useGame } from '../../../context/GameContext';
import { Card } from '../../Shared';

export const DatabaseTab: React.FC = () => {
    const { db } = useGame();

    return (
        <Card>
            <h3 className="text-2xl font-bold mb-4">데이터베이스 뷰어</h3>
            <pre className="w-full h-[600px] overflow-auto bg-gray-100 dark:bg-gray-800 p-4 rounded-md text-xs whitespace-pre-wrap word-wrap-break-word font-mono">
                {JSON.stringify(db, null, 2)}
            </pre>
        </Card>
    );
};
