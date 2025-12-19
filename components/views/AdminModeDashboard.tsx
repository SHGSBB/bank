
import React, { useState, useMemo } from 'react';
import { useGame } from '../../context/GameContext';
import { Card } from '../Shared';

// Import Tabs
import { TeacherDashboard } from '../tabs/teacher/TeacherDashboard';
import { AdminFinanceTab } from '../tabs/admin/AdminFinanceTab';
import { AdminRequestTab } from '../tabs/admin/AdminRequestTab';
import { AdminOperationTab } from '../tabs/admin/AdminOperationTab';
import { StandardTableTab } from '../tabs/admin/StandardTableTab';
import { UserManagementTab } from '../tabs/admin/UserManagementTab';
import { GovDashboard } from '../tabs/government/GovDashboard';
import { AdminRealEstateTab } from '../tabs/admin/AdminRealEstateTab';
import { BusinessManagementTab } from '../tabs/admin/BusinessManagementTab';
import { AnnouncementsTab } from '../tabs/admin/AnnouncementsTab';
import { ConsentsTab } from '../tabs/admin/ConsentsTab';
import { DatabaseTab } from '../tabs/admin/DatabaseTab';
import { AdminFeedbackTab } from '../tabs/admin/AdminFeedbackTab';

export const AdminModeDashboard: React.FC<{ isDesignMode: boolean }> = ({ isDesignMode }) => {
    const { currentUser, db, saveDb } = useGame();
    
    // 한국은행 권한 체크
    const isBOK = currentUser?.name === '한국은행' || currentUser?.govtRole === '한국은행장' || currentUser?.customJob === '한국은행장';
    const isAuthorized = currentUser && (currentUser.type === 'admin' || isBOK || currentUser.subType === 'teacher');

    if (!isAuthorized) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 text-red-600 p-4">
                <h1 className="text-4xl font-bold mb-4">🚨 접근 거부</h1>
                <p className="text-lg font-bold">중앙은행 통제 권한이 없습니다.</p>
            </div>
        );
    }
    
    // 초기 탭 설정 (한국은행은 bank, 교사는 teacher)
    const [mainTab, setMainTab] = useState(isBOK ? 'bank' : (currentUser.subType === 'teacher' ? 'teacher' : 'bank'));
    const [systemSubTab, setSystemSubTab] = useState('사용자 관리');

    const handleChannelChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
        const val = e.target.value as any;
        const newDb = { ...db };
        newDb.settings.betaChannel = val;
        await saveDb(newDb);
    };

    const renderTabContent = () => {
        switch (mainTab) {
            case 'teacher': return <TeacherDashboard />;
            case 'bank':
                return (
                    <div className="space-y-6 animate-fade-in">
                        {/* 최우선 금융 관리 (Tax, WeeklyPay, Minting 등이 포함된 AdminFinanceTab) */}
                        <div className="grid grid-cols-1 gap-6">
                            <AdminFinanceTab />
                        </div>
                        
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <AdminRequestTab /> {/* 대출/저금 신청 관리 */}
                            <AdminRealEstateTab /> {/* 부동산 매물 관리 */}
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <BusinessManagementTab />
                            <StandardTableTab /> {/* 국가 기준표 */}
                        </div>
                        
                        <AdminOperationTab /> {/* 은행 기능 제어 */}
                    </div>
                );
            case 'system':
                return (
                    <div className="space-y-6">
                        <div className="flex overflow-x-auto gap-2 mb-2 scrollbar-hide border-b border-gray-200 dark:border-gray-700 pb-1">
                            {['사용자 관리', '공지사항 관리', '약관 관리', '피드백', '데이터베이스'].map(t => (
                                <button key={t} onClick={() => setSystemSubTab(t)} className={`px-3 py-1 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${systemSubTab === t ? 'border-green-500 text-green-600' : 'border-transparent text-gray-500'}`}>
                                    {t}
                                </button>
                            ))}
                        </div>
                        {systemSubTab === '사용자 관리' && <UserManagementTab />}
                        {systemSubTab === '공지사항 관리' && <AnnouncementsTab />}
                        {systemSubTab === '약관 관리' && <ConsentsTab />}
                        {systemSubTab === '피드백' && <AdminFeedbackTab />}
                        {systemSubTab === '데이터베이스' && <DatabaseTab />}
                    </div>
                );
            case 'gov': return <GovDashboard />;
            default: return null;
        }
    };

    return (
        <div className="w-full">
            <div className="bg-[#1C1C1E] text-white p-6 rounded-[28px] mb-6 shadow-2xl border border-white/5 flex justify-between items-center relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-600 via-green-500 to-blue-600"></div>
                <div className="relative z-10">
                    <h2 className="text-2xl font-black tracking-tighter flex items-center gap-2">
                        {isBOK ? '🏦 한국은행 중앙통제 시스템' : '🛠️ 통합 관리자 대시보드'}
                        <span className="text-[10px] bg-blue-600 px-2 py-0.5 rounded-full font-bold uppercase">Authorized</span>
                    </h2>
                    <div className="flex items-center gap-3 mt-2">
                         <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                            <span className="text-xs font-bold text-gray-400">System Live</span>
                         </div>
                        <select 
                            value={db.settings.betaChannel || 'Stable'} 
                            onChange={handleChannelChange}
                            className="bg-white/5 text-white text-[10px] border border-white/10 rounded-full px-3 py-0.5 font-bold outline-none"
                        >
                            <option value="Developer Beta">Dev Beta</option>
                            <option value="Public Beta">Public Beta</option>
                            <option value="Stable">Stable v1.0</option>
                        </select>
                    </div>
                </div>
                <div className="text-right shrink-0">
                    <p className="text-xs font-black text-blue-400">{currentUser?.name}</p>
                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">{currentUser?.govtRole || 'Administrator'}</p>
                </div>
            </div>

            <div className="flex overflow-x-auto gap-2 mb-8 scrollbar-hide">
                {[
                    { id: 'bank', label: isBOK ? '중앙은행 관리' : '금융/경제 관리', icon: 'finance' },
                    { id: 'system', label: '시스템/유저', icon: 'security' },
                    { id: 'gov', label: '정부기관', icon: 'id_card' },
                    { id: 'teacher', label: '교사/운영', icon: 'star' }
                ].map((t) => (
                    <button 
                        key={t.id} 
                        onClick={() => setMainTab(t.id as any)}
                        className={`px-6 py-4 rounded-2xl font-black transition-all shadow-sm whitespace-nowrap flex items-center gap-2 ${mainTab === t.id ? 'bg-white dark:bg-white text-black scale-105 shadow-xl' : 'bg-white/5 text-gray-500 hover:bg-white/10 border border-white/5'}`}
                    >
                        {t.label}
                    </button>
                ))}
            </div>
            
            <div className="min-h-[600px] animate-fade-in">
                {renderTabContent()}
            </div>
        </div>
    );
};
