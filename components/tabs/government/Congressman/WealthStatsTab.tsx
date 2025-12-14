
import React, { useMemo } from 'react';
import { useGame } from '../../../../context/GameContext';
import { Card } from '../../../Shared';
import { User } from '../../../../types';

// Simple Stats Chart
const SimpleBarChart: React.FC<{ data: number[] }> = ({ data }) => {
    const max = Math.max(...data, 1);
    return (
        <div className="flex items-end gap-1 h-32 w-full border-b border-gray-400 pb-1">
            {data.map((val, i) => (
                <div key={i} className="flex-1 bg-green-500 hover:bg-green-400 transition-all rounded-t relative group" style={{ height: `${(val / max) * 100}%` }}>
                    <div className="absolute bottom-full mb-1 hidden group-hover:block bg-black text-white text-[10px] p-1 rounded z-10 whitespace-nowrap">
                        {i+1}분위: {val}명
                    </div>
                </div>
            ))}
        </div>
    );
};

export const WealthStatsTab: React.FC = () => {
    const { db } = useGame();
    const citizens = (Object.values(db.users) as User[]).filter(u => u.type === 'citizen');

    const wealthDistribution = useMemo(() => {
        const assets = citizens.map(c => c.balanceKRW + (c.balanceUSD * 1350) + ((db.realEstate.grid||[]).filter(p=>p.owner===c.name).reduce((s,p)=>s+p.price,0)));
        assets.sort((a,b) => a-b);
        const buckets = [0,0,0,0,0];
        if (assets.length === 0) return buckets;
        const maxVal = Math.max(...assets) || 1;
        assets.forEach(val => {
            const idx = Math.min(4, Math.floor((val / (maxVal * 1.01)) * 5));
            buckets[idx]++;
        });
        return buckets;
    }, [citizens, db.realEstate]);

    return (
        <Card className="border-l-4 border-green-500">
            <h4 className="text-xl font-bold mb-4 text-green-700">📊 국민 재산 실태 (통계)</h4>
            <div className="p-4 bg-white dark:bg-gray-800 rounded-lg">
                <p className="text-sm text-gray-500 mb-4 font-bold">전체 시민 자산 분포 (5구간)</p>
                <SimpleBarChart data={wealthDistribution} />
                <div className="flex justify-between text-xs text-gray-400 mt-2">
                    <span>저소득층</span>
                    <span>고소득층</span>
                </div>
                <div className="mt-4 p-3 bg-gray-100 dark:bg-gray-900 rounded text-sm">
                    <p>총 시민 수: {citizens.length}명</p>
                    <p className="mt-2 text-xs text-gray-500">
                        이 데이터는 금융법 제정을 위한 익명 통계 자료입니다.<br/>
                        개별 시민의 자산 정보는 조회할 수 없습니다.
                    </p>
                </div>
            </div>
        </Card>
    );
};
