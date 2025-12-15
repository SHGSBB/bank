
import React, { useState, useMemo, useEffect } from 'react';
import { useGame } from '../../../context/GameContext';
import { Card, Button, Modal, Input, Toggle, formatName } from '../../Shared';
import { User, Country, SignupSession } from '../../../types';
import { ref, update, remove } from 'firebase/database';
import { database } from '../../../services/firebase';

export const UserManagementTab: React.FC = () => {
    const { db, saveDb, showModal, showConfirm, notify, updateUser, showPinModal, currentUser, loadAllUsers } = useGame();
    
    // Load users on mount to ensure we have the full list
    useEffect(() => {
        loadAllUsers();
    }, []);

    const [selectedUser, setSelectedUser] = useState<string | null>(null);
    const [editKRW, setEditKRW] = useState('');
    const [editUSD, setEditUSD] = useState('');
    const [editType, setEditType] = useState<string>('citizen');
    const [isCustomType, setIsCustomType] = useState(false);
    
    const [activeTab, setActiveTab] = useState<'citizen'|'mart'|'gov'|'teacher'|'country'|'signup'>('citizen');

    // Create User State
    const [isCreating, setIsCreating] = useState(false);
    const [newName, setNewName] = useState('');
    const [newId, setNewId] = useState('');
    const [newPw, setNewPw] = useState('');

    // Country Management State
    const [newCountryName, setNewCountryName] = useState('');
    const [newCountryCurrency, setNewCountryCurrency] = useState<'KRW'|'USD'>('KRW');
    
    // Secure Code Viewing
    const [revealedCodes, setRevealedCodes] = useState<Set<string>>(new Set());

    const users = useMemo(() => Object.values(db.users || {}) as User[], [db.users]);
    const countries = useMemo(() => Object.values(db.countries || {}) as Country[], [db.countries]);
    const signupSessions = useMemo(() => Object.values(db.signupSessions || {}) as SignupSession[], [db.signupSessions]);

    // Ensure pending users are updated correctly
    const pendingUsers = useMemo(() => users.filter(u => u.approvalStatus === 'pending'), [users]);
    const activeUsers = useMemo(() => users.filter(u => u.approvalStatus !== 'pending'), [users]);

    const calculateTotalAsset = (user: User) => {
        const krw = user.balanceKRW;
        const usdVal = user.balanceUSD * (db.settings.exchangeRate?.KRW_USD || 1350);
        const propVal = (db.realEstate.grid || []).filter(p => p.owner === user.name).reduce((sum, p) => sum + p.price, 0);
        return krw + usdVal + propVal;
    };

    const groupedUsers = useMemo(() => {
        const sorted = [...activeUsers].sort((a, b) => a.name.localeCompare(b.name, 'ko-KR'));
        return {
            citizen: sorted.filter(u => u.type === 'citizen' || u.type === 'government' || u.type === 'official' || u.subType === 'govt' || u.subType === 'personal'),
            mart: sorted.filter(u => u.type === 'mart'),
            gov: sorted.filter(u => u.type === 'government' || u.type === 'official' || u.subType === 'govt'),
            teacher: sorted.filter(u => u.type === 'admin' || u.subType === 'teacher' || u.type === 'teacher' || u.type === 'root')
        };
    }, [activeUsers]);

    const openEdit = (user: User) => {
        setSelectedUser(user.name);
        setEditKRW(user.balanceKRW.toString());
        setEditUSD(user.balanceUSD.toString());
        
        if (['citizen', 'mart', 'admin', 'government'].includes(user.type)) {
            setEditType(user.type);
            setIsCustomType(false);
        } else {
            setEditType(user.type);
            setIsCustomType(true);
        }
    };

    const handleCreateUser = async () => {
        if (!newName.trim()) return showModal('이름을 입력하세요.');
        if (/[.#$/\[\]]/.test(newName)) return showModal("이름에 특수문자(., #, $, /, [, ])를 포함할 수 없습니다.");
        if (!newId || !newPw) return showModal('모든 필드를 입력하세요.');
        if (db.users[newName]) return showModal('이미 존재하는 이름입니다.');
        if (Object.values(db.users).some((u: any) => u.id === newId)) return showModal('이미 존재하는 아이디입니다.');

        const finalName = newName.trim();
        const newUser: User = {
            name: finalName,
            id: newId,
            password: newPw,
            balanceKRW: 0,
            balanceUSD: 0,
            type: 'citizen',
            pin: null,
            transactions: [],
            notifications: {},
            approvalStatus: 'approved'
        };

        // Direct DB update to prevent stale state overwrites
        await update(ref(database, `users/${finalName}`), newUser);
        
        showModal('사용자가 생성되었습니다.');
        setIsCreating(false);
        setNewName(''); setNewId(''); setNewPw('');
        loadAllUsers(); // Refresh list explicitly
    };

    const handleSave = async () => {
        if (!selectedUser) return;
        const krw = parseInt(editKRW);
        const usd = parseFloat(editUSD);

        if (isNaN(krw)) return showModal('올바른 현금 금액을 입력하세요.');
        if (isNaN(usd)) return showModal('올바른 달러 금액을 입력하세요.');

        // Use context method which handles partial updates safely
        await updateUser(selectedUser, {
            balanceKRW: krw,
            balanceUSD: usd,
            type: editType as any
        });

        showModal(`${selectedUser}님의 정보가 수정되었습니다.`);
        setSelectedUser(null);
        loadAllUsers();
    };

    const handleDeleteUser = async () => {
        if (!selectedUser) return;
        if (await showConfirm('정말 이 사용자를 삭제하시겠습니까?')) {
            // Direct remove
            await remove(ref(database, `users/${selectedUser}`));
            showModal('삭제되었습니다.');
            setSelectedUser(null);
            loadAllUsers();
        }
    };

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

    const handleViewCode = async (sessionId: string) => {
        const pin = await showPinModal("코드를 확인하려면 PIN을 입력하세요.", currentUser?.pin!, (currentUser?.pinLength as 4 | 6) || 4);
        if (pin === currentUser?.pin) {
            const pw = prompt("관리자 비밀번호를 입력하세요:");
            if (pw === currentUser?.password) {
                setRevealedCodes(prev => new Set(prev).add(sessionId));
            } else {
                showModal("비밀번호가 일치하지 않습니다.");
            }
        }
    };

    const handleCopyCode = (code: string) => {
        navigator.clipboard.writeText(code);
        showModal(`코드 [${code}]가 복사되었습니다.`);
    };

    // Country Functions
    const handleAddCountry = async () => {
        if(!newCountryName) return showModal("나라 이름을 입력하세요.");
        const id = `country_${Date.now()}`;
        const newDb = JSON.parse(JSON.stringify(db));
        newDb.countries = { ...(newDb.countries || {}), [id]: { id, name: newCountryName, currency: newCountryCurrency } };
        await saveDb(newDb);
        setNewCountryName('');
    };

    const handleMoveUserToCountry = async (userName: string, countryId: string | undefined) => {
        await updateUser(userName, { countryId: countryId || null });
        loadAllUsers();
    };

    const handleDeleteCountry = async (countryId: string) => {
        if(!await showConfirm("나라를 삭제하면 소속된 시민들은 '소속 없음'이 됩니다.")) return;
        // This requires complex transaction, defaulting to saveDb for now as country list is small
        const newDb = JSON.parse(JSON.stringify(db));
        delete newDb.countries![countryId];
        // Reset users in local snapshot before saving, though direct update is better for users
        Object.keys(newDb.users).forEach(k => {
            if(newDb.users[k].countryId === countryId) delete newDb.users[k].countryId;
        });
        await saveDb(newDb);
        loadAllUsers();
    };

    const handleToggleSuspension = async () => {
        if (!selectedUser) return;
        const user = db.users[selectedUser];
        if (!user) return;

        const newState = !user.isSuspended;
        await updateUser(selectedUser, { 
            isSuspended: newState, 
            failedLoginAttempts: 0,
            lockoutUntil: 0
        });
        showModal(newState ? '계정이 정지되었습니다.' : '계정 정지가 해제되었습니다.');
        loadAllUsers();
    };

    return (
        <div className="space-y-6 w-full">
            <div className="flex justify-between items-center px-1">
                <h3 className="text-2xl font-bold">사용자 관리</h3>
                <Button onClick={() => setIsCreating(true)}>+ 사용자 추가</Button>
            </div>
            
            {/* Pending Users */}
            {pendingUsers.length > 0 && (
                <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 p-4 rounded-xl mb-6 animate-fade-in">
                    <h4 className="font-bold text-orange-600 mb-4 flex items-center gap-2">
                        <span>⚠️ 가입 승인 대기 ({pendingUsers.length})</span>
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {pendingUsers.map(u => (
                            <div key={u.name} className="bg-white dark:bg-gray-800 p-3 rounded shadow-sm flex justify-between items-center">
                                <div>
                                    <p className="font-bold">{formatName(u.name)}</p>
                                    <p className="text-xs text-gray-500">{u.type} | ID: {u.id}</p>
                                </div>
                                <div className="flex gap-2">
                                    <Button className="text-xs py-1 px-3" onClick={() => handleApproval(u, true)}>승인</Button>
                                    <Button variant="danger" className="text-xs py-1 px-3" onClick={() => handleApproval(u, false)}>거절</Button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Filter Tabs */}
            <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700 overflow-x-auto pb-1">
                {[
                    {id: 'citizen', label: '개인/공무원'},
                    {id: 'mart', label: '사업자 (마트)'},
                    {id: 'gov', label: '공무원 전용'},
                    {id: 'teacher', label: '교사/관리자'},
                    {id: 'country', label: '나라 관리'},
                    {id: 'signup', label: '가입 모니터링'}
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
            
            {activeTab === 'signup' ? (
                <Card>
                    <h4 className="font-bold mb-4">실시간 가입 인증 요청 (6자리 코드)</h4>
                    <p className="text-sm text-gray-500 mb-4">가입 진행 중인 사용자의 코드를 확인하고 알려주세요.</p>
                    {signupSessions.length === 0 ? <p className="text-gray-500 text-center py-8">진행 중인 가입 시도가 없습니다.</p> : 
                    <div className="space-y-3">
                        {signupSessions.map(s => (
                            <div key={s.id} className="flex justify-between items-center p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 shadow-sm animate-fade-in">
                                <div>
                                    <p className="font-bold text-lg">{s.name} ({s.phone})</p>
                                    <p className="text-xs text-gray-500">ID: {s.id} | 시도: {s.attempts} | {new Date(s.createdAt).toLocaleTimeString()}</p>
                                </div>
                                <div className="flex items-center gap-3">
                                    {revealedCodes.has(s.id) ? (
                                        <>
                                            <span className="font-mono font-bold text-2xl tracking-wider bg-white dark:bg-black px-4 py-2 rounded border">{s.code}</span>
                                            <Button className="text-sm py-2" onClick={() => handleCopyCode(s.code)}>복사</Button>
                                        </>
                                    ) : (
                                        <Button className="text-sm py-2 bg-gray-600" onClick={() => handleViewCode(s.id)}>코드 보기 (보안)</Button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>}
                </Card>
            ) : activeTab === 'country' ? (
                <div className="space-y-6">
                    <Card>
                        <h4 className="font-bold mb-4">나라 추가</h4>
                        <div className="flex gap-2">
                            <Input placeholder="나라 이름" value={newCountryName} onChange={e => setNewCountryName(e.target.value)} />
                            <select value={newCountryCurrency} onChange={e => setNewCountryCurrency(e.target.value as any)} className="p-3 bg-gray-100 dark:bg-gray-700 rounded-md">
                                <option value="KRW">원화</option>
                                <option value="USD">달러</option>
                            </select>
                            <Button onClick={handleAddCountry}>추가</Button>
                        </div>
                    </Card>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {countries.map(c => (
                            <Card key={c.id} className="relative">
                                <div className="flex justify-between items-start mb-2">
                                    <h5 className="font-bold text-lg">{c.name}</h5>
                                    <Button variant="danger" className="text-xs py-1 px-2" onClick={() => handleDeleteCountry(c.id)}>삭제</Button>
                                </div>
                                <p className="text-xs text-gray-500 mb-4">기본 화폐: {c.currency}</p>
                                
                                <h6 className="font-bold text-xs mb-2">소속 시민 (선택하여 이동)</h6>
                                <div className="max-h-40 overflow-y-auto space-y-1 bg-gray-50 dark:bg-gray-800 p-2 rounded">
                                    {users.filter(u => u.countryId === c.id).map(u => (
                                        <div key={u.name} className="flex justify-between items-center text-sm">
                                            <span>{formatName(u.name)}</span>
                                            <button onClick={() => handleMoveUserToCountry(u.name, undefined)} className="text-red-500 text-xs">제외</button>
                                        </div>
                                    ))}
                                    {users.filter(u => u.countryId === c.id).length === 0 && <span className="text-xs text-gray-400">시민 없음</span>}
                                </div>
                                <div className="mt-4">
                                    <select 
                                        className="w-full p-2 text-xs border rounded bg-white dark:bg-gray-700"
                                        onChange={(e) => {
                                            if(e.target.value) handleMoveUserToCountry(e.target.value, c.id);
                                            e.target.value = '';
                                        }}
                                    >
                                        <option value="">+ 시민 추가</option>
                                        {users.filter(u => !u.countryId && u.type === 'citizen').map(u => (
                                            <option key={u.name} value={u.name}>{formatName(u.name)}</option>
                                        ))}
                                    </select>
                                </div>
                            </Card>
                        ))}
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full">
                    {groupedUsers[activeTab].map(u => (
                        <Card key={u.name} className={`flex flex-col justify-between p-6 hover:shadow-lg transition-shadow h-44 ${u.isSuspended ? 'border-2 border-red-500 bg-red-50 dark:bg-red-900/10' : ''}`}>
                            <div>
                                <div className="flex justify-between items-start">
                                    <p className="font-bold text-lg flex items-center gap-2">
                                        {formatName(u.name)}
                                        {u.isOnline && <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" title="온라인"></span>}
                                        {u.isSuspended && <span className="text-xs bg-red-500 text-white px-2 py-0.5 rounded">정지됨</span>}
                                    </p>
                                    <span className="text-xs bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded">{u.customJob || u.type}</span>
                                </div>
                                <p className="text-xs text-gray-500 mt-1">ID: {u.id || '미가입'}</p>
                                <p className="text-sm text-blue-500 mt-2 font-bold">총 자산: ₩ {calculateTotalAsset(u).toLocaleString()}</p>
                            </div>
                            <div className="mt-4 flex justify-end">
                                <Button variant="secondary" className="text-xs py-2 px-4" onClick={() => openEdit(u)}>
                                    관리
                                </Button>
                            </div>
                        </Card>
                    ))}
                    {groupedUsers[activeTab].length === 0 && <p className="text-gray-500 py-10 col-span-full text-center">해당 분류의 사용자가 없습니다.</p>}
                </div>
            )}

            {/* Create Modal */}
            <Modal isOpen={isCreating} onClose={() => setIsCreating(false)} title="새 사용자 추가">
                <div className="space-y-4">
                    <Input placeholder="이름" value={newName} onChange={e => setNewName(e.target.value)} />
                    <Input placeholder="아이디" value={newId} onChange={e => setNewId(e.target.value)} />
                    <Input placeholder="비밀번호" value={newPw} onChange={e => setNewPw(e.target.value)} />
                    <Button className="w-full" onClick={handleCreateUser}>생성</Button>
                </div>
            </Modal>

            {/* Edit Modal */}
            <Modal isOpen={!!selectedUser} onClose={() => setSelectedUser(null)} title={`${formatName(selectedUser)} 정보 수정`}>
                <div className="space-y-4 w-full">
                    <div>
                        <div className="flex justify-between items-center mb-1">
                            <label className="text-sm font-medium">직업 (Type)</label>
                            <button onClick={() => setIsCustomType(!isCustomType)} className="text-xs text-blue-500 underline">
                                {isCustomType ? '기본 목록 선택' : '직접 입력'}
                            </button>
                        </div>
                        {isCustomType ? (
                            <Input value={editType} onChange={e => setEditType(e.target.value)} placeholder="직업 직접 입력" />
                        ) : (
                            <select value={editType} onChange={e => setEditType(e.target.value)} className="w-full p-3 rounded-md bg-[#F0F0F0] text-[#121212] dark:bg-[#2D2D2D] dark:text-[#E0E0E0] outline-none">
                                <option value="citizen">시민</option>
                                <option value="mart">마트</option>
                                <option value="government">정부</option>
                                <option value="admin">관리자</option>
                                <option value="teacher">교사</option>
                            </select>
                        )}
                    </div>
                    <div><label className="text-sm font-medium block mb-1">현금 (KRW)</label><Input type="number" value={editKRW} onChange={e => setEditKRW(e.target.value)} /></div>
                    <div><label className="text-sm font-medium block mb-1">달러 (USD)</label><Input type="number" value={editUSD} onChange={e => setEditUSD(e.target.value)} /></div>
                    
                    <div className="border-t pt-4 mt-2">
                        <div className="flex justify-between items-center mb-2">
                            <span className="font-bold text-sm">계정 상태 관리</span>
                        </div>
                         <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded">
                            <span className="text-sm text-red-600 font-bold">계정 정지</span>
                            <Toggle checked={selectedUser ? !!db.users?.[selectedUser]?.isSuspended : false} onChange={handleToggleSuspension} />
                        </div>
                    </div>

                    <div className="flex gap-2 pt-4">
                        <Button variant="danger" className="flex-1" onClick={handleDeleteUser}>삭제</Button>
                        <Button className="flex-1" onClick={handleSave}>저장</Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};
