
import React, { useMemo, useEffect, useState } from 'react';
import { useGame } from '../../../../context/GameContext';
import { Card, Spinner } from '../../../Shared';

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
    const { serverAction } = useGame();
    const [statsData, setStatsData] = useState<number[]>([0,0,0,0,0]);
    const [totalCount, setTotalCount] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    
    // Optimized: Fetch only statistics numbers from server instead of all user data
    useEffect(() => {
        const fetchStats = async () => {
            try {
                const res = await serverAction('fetch_wealth_stats', {});
                if (res && res.buckets) {
                    setStatsData(res.buckets);
                    setTotalCount(res.totalCount || 0);
                }
            } catch (e) {
                console.error("Failed to fetch stats", e);
            } finally {
                setIsLoading(false);
            }
        };
        fetchStats();
    }, []);

    if (isLoading) return <Spinner />;

    return (
        <Card className="border-l-4 border-green-500">
            <h4 className="text-xl font-bold mb-4 text-green-700">📊 국민 재산 실태 (통계)</h4>
            <div className="p-4 bg-white dark:bg-gray-800 rounded-lg">
                <p className="text-sm text-gray-500 mb-4 font-bold">전체 시민 자산 분포 (5구간)</p>
                <SimpleBarChart data={statsData} />
                <div className="flex justify-between text-xs text-gray-400 mt-2">
                    <span>저소득층</span>
                    <span>고소득층</span>
                </div>
                <div className="mt-4 p-3 bg-gray-100 dark:bg-gray-900 rounded text-sm">
                    <p>총 시민 수: {totalCount}명</p>
                    <p className="mt-2 text-xs text-gray-500">
                        이 데이터는 금융법 제정을 위한 익명 통계 자료입니다.<br/>
                        데이터는 서버에서 안전하게 집계되어 전송되었습니다.
                    </p>
                </div>
            </div>
        </Card>
    );
};
