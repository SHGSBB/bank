
import React, { useState } from 'react';
import { useGame } from '../../../context/GameContext';
import { Card, Button, Input, LineIcon, Modal } from '../../Shared';
import { DEFAULT_DB } from '../../../types';

const CreditsOverlay: React.FC<{ onClose: () => void, data: any }> = ({ onClose, data }) => {
    return (
        <div className="fixed inset-0 z-[7000] bg-black text-white flex flex-col items-center overflow-hidden">
            <div className="absolute top-10 right-10 z-[7001]">
                <button onClick={onClose} className="text-white text-2xl font-bold p-4 opacity-50 hover:opacity-100">✕</button>
            </div>
            <div className="flex-1 w-full animate-credits py-[100vh]">
                <div className="flex flex-col items-center gap-24 text-center px-10 max-w-4xl mx-auto">
                    <div className="space-y-6">
                        <div className="w-24 h-24 bg-green-500 rounded-3xl flex items-center justify-center text-white shadow-2xl mx-auto mb-6">
                            <LineIcon icon="finance" className="w-12 h-12" />
                        </div>
                        <h1 className="text-7xl font-black mb-4 tracking-tighter">성화 은행</h1>
                        <p className="text-2xl opacity-50 font-light tracking-widest">SUNGHWA BANK</p>
                        <p className="text-lg opacity-40">Digital Banking Simulation Platform</p>
                    </div>

                    <div className="space-y-16 w-full">
                        <div className="space-y-4">
                            <p className="text-xs text-gray-500 font-bold uppercase tracking-[0.3em] mb-2">CREATED BY</p>
                            <p className="text-4xl font-bold">{data.developer}</p>
                        </div>

                        <div className="grid grid-cols-2 gap-10 w-full">
                            <div className="text-right space-y-2">
                                <p className="text-xs text-gray-500 font-bold uppercase tracking-widest">SYSTEM VERSION</p>
                                <p className="text-2xl font-bold font-mono">v{data.version}</p>
                            </div>
                            <div className="text-left space-y-2">
                                <p className="text-xs text-gray-500 font-bold uppercase tracking-widest">LAST UPDATE</p>
                                <p className="text-2xl font-bold font-mono">{new Date(data.lastUpdate).toLocaleDateString()}</p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <p className="text-xs text-gray-500 font-bold uppercase tracking-[0.3em]">ARCHITECTURE</p>
                            <p className="text-3xl font-bold">{data.program}</p>
                        </div>
                        
                        {(data.customFields || []).map((f: any, i: number) => (
                            <div key={i} className="space-y-4">
                                <p className="text-xs text-gray-500 font-bold uppercase tracking-[0.3em]">{f.label}</p>
                                <p className="text-3xl font-bold">{f.value}</p>
                            </div>
                        ))}
                    </div>

                    {/* Filler Content for Richness */}
                    <div className="space-y-12 w-full mt-20 opacity-80">
                        <p className="text-sm font-bold uppercase tracking-widest mb-10">Special Thanks</p>
                        <div className="grid grid-cols-3 gap-8 text-sm">
                            <p>Core Infrastructure</p><p>Security Module</p><p>Database Systems</p>
                            <p>React</p><p>Firebase</p><p>Tailwind CSS</p>
                            <p>Vercel</p><p>Google GenAI</p><p>SimpleWebAuthn</p>
                        </div>
                    </div>

                    <div className="mt-40 space-y-8">
                        <p className="text-3xl font-bold italic font-serif">" 금융의 미래를 시뮬레이션하다 "</p>
                        <div className="w-20 h-1 bg-white/20 mx-auto rounded-full"></div>
                        <p className="opacity-60 text-base leading-relaxed max-w-lg mx-auto">
                            이 시스템은 교육 및 시뮬레이션 목적으로 제작되었습니다.<br/>
                            참여해주신 모든 시민 여러분, 그리고 시스템 발전을 위해 노력해주신<br/>
                            관리자 및 관계자 여러분께 진심으로 감사의 말씀을 전합니다.
                        </p>
                        <p className="opacity-30 text-xs mt-10">© 2025 SungHwa Bank Team. All rights reserved.</p>
                    </div>
                </div>
            </div>
            <style>{`
                @keyframes credits {
                    0% { transform: translateY(0); }
                    100% { transform: translateY(-100%); }
                }
                .animate-credits {
                    animation: credits 90s linear infinite; /* Slowed down to 90s */
                }
            `}</style>
        </div>
    );
};

export const InfoTab: React.FC = () => {
    const { db, saveDb, currentUser, showModal } = useGame();
    const isAdmin = currentUser?.type === 'admin' || currentUser?.type === 'root';
    const info = db.settings.appInfo || DEFAULT_DB.settings.appInfo!;
    const [showCredits, setShowCredits] = useState(false);

    const [isEditing, setIsEditing] = useState(false);
    const [editInfo, setEditInfo] = useState(info);
    const [newLabel, setNewLabel] = useState('');
    const [newValue, setNewValue] = useState('');

    const handleSave = async () => {
        const newDb = { ...db };
        newDb.settings.appInfo = { ...editInfo, lastUpdate: new Date().toISOString() };
        await saveDb(newDb);
        setIsEditing(false);
        showModal("시스템 정보가 업데이트되었습니다.");
    };

    const addField = () => {
        if(!newLabel || !newValue) return;
        setEditInfo({
            ...editInfo,
            customFields: [...(editInfo.customFields || []), { label: newLabel, value: newValue }]
        });
        setNewLabel(''); setNewValue('');
    };

    const removeField = (idx: number) => {
        setEditInfo({
            ...editInfo,
            customFields: (editInfo.customFields || []).filter((_, i) => i !== idx)
        });
    };

    return (
        <div className="space-y-6">
            <Card className="bg-gray-50 dark:bg-gray-800 border-none">
                <div className="flex flex-col items-center text-center gap-2">
                    <div className="w-20 h-20 bg-green-500 rounded-3xl flex items-center justify-center text-white shadow-lg mb-2">
                        <LineIcon icon="finance" className="w-10 h-10" />
                    </div>
                    <h4 className="text-2xl font-black tracking-tighter">성화 은행 (SUNGHWA BANK)</h4>
                    <p className="text-xs text-gray-500 font-bold uppercase tracking-widest">버전 {info.version}</p>
                </div>
            </Card>

            <div className="space-y-4">
                <div className="flex justify-between items-center text-sm border-b dark:border-gray-700 pb-2">
                    <span className="text-gray-500">총괄 개발자</span>
                    <span className="font-bold">{info.developer}</span>
                </div>
                <div className="flex justify-between items-center text-sm border-b dark:border-gray-700 pb-2">
                    <span className="text-gray-500">프로그램 명</span>
                    <span className="font-bold">{info.program}</span>
                </div>
                <div className="flex justify-between items-center text-sm border-b dark:border-gray-700 pb-2">
                    <span className="text-gray-500">기술 지원</span>
                    <span className="font-bold text-blue-500 underline">{info.support}</span>
                </div>
                <div className="flex justify-between items-center text-sm border-b dark:border-gray-700 pb-2">
                    <span className="text-gray-500">최종 업데이트</span>
                    <span className="font-bold">{new Date(info.lastUpdate).toLocaleDateString()}</span>
                </div>
                
                {(info.customFields || []).map((f, i) => (
                    <div key={i} className="flex justify-between items-center text-sm border-b dark:border-gray-700 pb-2">
                        <span className="text-gray-500">{f.label}</span>
                        <span className="font-bold">{f.value}</span>
                    </div>
                ))}
            </div>

            <div className="flex flex-col gap-2">
                <Button onClick={() => setShowCredits(true)} className="w-full bg-black text-white hover:bg-gray-800">엔딩 크레딧 보기</Button>
                {isAdmin && (
                    <Button onClick={() => setIsEditing(true)} variant="secondary" className="w-full">시스템 정보 편집</Button>
                )}
            </div>

            <Modal isOpen={isEditing} onClose={() => setIsEditing(false)} title="시스템 정보 편집">
                <div className="space-y-4">
                    <Input placeholder="버전" value={editInfo.version} onChange={e => setEditInfo({...editInfo, version: e.target.value})} />
                    <Input placeholder="개발자" value={editInfo.developer} onChange={e => setEditInfo({...editInfo, developer: e.target.value})} />
                    <Input placeholder="프로그램" value={editInfo.program} onChange={e => setEditInfo({...editInfo, program: e.target.value})} />
                    <Input placeholder="지원" value={editInfo.support} onChange={e => setEditInfo({...editInfo, support: e.target.value})} />
                    
                    <div className="pt-4 border-t">
                        <h5 className="font-bold text-sm mb-2">추가 필드</h5>
                        {(editInfo.customFields || []).map((f, i) => (
                            <div key={i} className="flex gap-2 mb-2 items-center">
                                <span className="flex-1 text-sm font-bold">{f.label}: {f.value}</span>
                                <button onClick={() => removeField(i)} className="text-red-500">✕</button>
                            </div>
                        ))}
                        <div className="flex gap-2">
                            <Input placeholder="라벨" value={newLabel} onChange={e => setNewLabel(e.target.value)} className="flex-1 py-1 text-sm" />
                            <Input placeholder="값" value={newValue} onChange={e => setNewValue(e.target.value)} className="flex-1 py-1 text-sm" />
                            <Button onClick={addField} className="text-xs py-1 px-3">+</Button>
                        </div>
                    </div>
                    <Button onClick={handleSave} className="w-full mt-4">저장하기</Button>
                </div>
            </Modal>

            {showCredits && <CreditsOverlay data={info} onClose={() => setShowCredits(false)} />}
        </div>
    );
};
