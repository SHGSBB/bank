
import React, { useState, useMemo } from 'react';
import { useGame } from '../../../context/GameContext';
import { Card, Button, Input, Modal } from '../../Shared';
import { User, PolicyRequest, Judgement } from '../../../types';

// Simple Stats Chart
const SimpleBarChart: React.FC<{ data: number[] }> = ({ data }) => {
    const max = Math.max(...data, 1);
    return (
        <div className="flex items-end gap-1 h-32 w-full border-b border-gray-400 pb-1">
            {data.map((val, i) => (
                <div key={i} className="flex-1 bg-blue-500 hover:bg-blue-400 transition-all rounded-t relative group" style={{ height: `${(val / max) * 100}%` }}>
                    <div className="absolute bottom-full mb-1 hidden group-hover:block bg-black text-white text-[10px] p-1 rounded z-10 whitespace-nowrap">
                        {i+1}분위: {val}명
                    </div>
                </div>
            ))}
        </div>
    );
};

interface Props {
    role: string;
    isPresident: boolean;
    isJusticeMinister: boolean;
    isProsecutor: boolean;
    isJudge: boolean;
    isCongressman: boolean;
}

export const GovernmentRoleViews: React.FC<Props> = ({ role, isPresident, isJusticeMinister, isProsecutor, isJudge, isCongressman }) => {
    // This wrapper component logic is now moved to individual dashboard files to handle tabs and layout cleanly.
    // However, we keep shared types or small helpers here if needed.
    return null; 
};
