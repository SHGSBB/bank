
import React, { useState, useMemo, useEffect } from 'react';
import { useGame } from '../../../context/GameContext';
import { Card, Button, Modal, Input, Toggle, formatName } from '../../Shared';
import { User, SignupSession, TermDeposit, Loan } from '../../../types';
import { ref, update, remove } from 'firebase/database';
import { database, generateId } from '../../../services/firebase';

export const UserManagementTab: React.FC = () => {
    const { db, saveDb, showModal, showConfirm, notify, updateUser, currentUser, loadAllUsers } = useGame();
    
    useEffect(() => { loadAllUsers(); }, []);

    const [selectedUser, setSelectedUser] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'citizen'|'mart'|'gov'|'teacher'|'pending'>('citizen');

    const users = useMemo(() => Object.values(db.users || {}) as User[], [db.users]);
    const pendingUsers = useMemo(() => users.filter(u => u.approvalStatus === 'pending'), [users]);
    const activeUsers = useMemo(() => users.filter(u => u.approvalStatus !== 'pending'), [users]);

    const groupedUsers = useMemo(() => {
        const sorted = [...activeUsers].sort((a, b) => a.name.localeCompare(b.name, 'ko-KR'));
        return {
            citizen: sorted.filter(u => u.subType === 'personal' || u.type === 'citizen'),
            mart: sorted.filter(u => u.type === 'mart'),
            gov: sorted.filter(u => u.type === 'government' || u.subType === 'govt'),
            teacher: sorted.filter(u => u.type === 'admin' || u.subType === 'teacher' || u.type === 'root'),
            pending: pendingUsers
        };
    }, [activeUsers, pendingUsers]);

    const handleApproval = async (user: User, approve: boolean) => {
        if (!approve && !(await showConfirm(`${user.name} 님의 가입을 거절하시겠습니까?`))) return;
        
        if (approve) {
            await updateUser(user.name, { approvalStatus: 'approved' });
            notify(user.name, '회원가입이 승인되었습니다.', true);
        } else {
            await remove(ref(database, `users/${user.name}`));
        }
        
        showModal('처리되었습니다.');
        loadAllUsers();
    };

    return (
        <div className="space-y-6 w-full">
            <div className="flex justify-between items-center px-1">
                <h3 className="text-2xl font-bold">사용자 및 승인 관리</h3>
            </div>
            
            <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700 overflow-x-auto pb-1">
                {[
                    {id: 'citizen', label: '시민'},
                    {id: 'mart', label: '마트'},
                    {id: 'gov', label: '공무원'},
                    {id: 'teacher', label: '교사/관리자'},
                    {id: 'pending', label: `승인 대기 (${pendingUsers.length})`}
                ].map(tab => (
                    <button 
                        key={tab.id} 
                        onClick={() => setActiveTab(tab.id as any)}
                        className={`px-4 py-2 text-sm font-bold whitespace-nowrap border-b-2 transition-colors ${activeTab === tab.id ? 'border-green-500 text-green-600' : 'border-transparent text-gray-500'}`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full">
                {groupedUsers[activeTab].map(u => (
                    <Card key={u.name} className={`flex flex-col justify-between p-6 ${activeTab === 'pending' ? 'border-2 border-orange-400 bg-orange-50 dark:bg-orange-900/10' : ''}`}>
                        <div>
                            <div className="flex justify-between items-start">
                                <p className="font-bold text-lg">{formatName(u.name)}</p>
                                <span className="text-xs bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded">{u.customJob || u.type}</span>
                            </div>
                            <p className="text-xs text-gray-500 mt-1">{u.email}</p>
                            <p className="text-[10px] text-gray-400 mt-2">ID: {u.id}</p>
                        </div>
                        <div className="mt-4 flex gap-2">
                            {activeTab === 'pending' ? (
                                <>
                                    <Button onClick={() => handleApproval(u, true)} className="flex-1 text-xs py-2">승인</Button>
                                    <Button variant="danger" onClick={() => handleApproval(u, false)} className="flex-1 text-xs py-2">거절</Button>
                                </>
                            ) : (
                                <Button variant="secondary" className="text-xs py-2 px-4 w-full" onClick={() => setSelectedUser(u.name)}>관리</Button>
                            )}
                        </div>
                    </Card>
                ))}
                {groupedUsers[activeTab].length === 0 && <p className="col-span-full text-center py-10 text-gray-500">표시할 사용자가 없습니다.</p>}
            </div>
        </div>
    );
};
