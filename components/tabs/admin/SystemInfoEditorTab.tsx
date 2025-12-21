
import React, { useState } from 'react';
import { useGame } from '../../../context/GameContext';
import { Card, Button, Input } from '../../Shared';
import { DEFAULT_DB } from '../../../types';

export const SystemInfoEditorTab: React.FC = () => {
    const { db, saveDb, showModal } = useGame();
    const info = db.settings.appInfo || DEFAULT_DB.settings.appInfo!;
    
    const [editInfo, setEditInfo] = useState(info);
    const [newLabel, setNewLabel] = useState('');
    const [newValue, setNewValue] = useState('');

    const handleSave = async () => {
        const newDb = { ...db };
        newDb.settings.appInfo = { ...editInfo, lastUpdate: new Date().toISOString() };
        await saveDb(newDb);
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

    const updateField = (idx: number, field: 'label'|'value', val: string) => {
        const newFields = [...(editInfo.customFields || [])];
        newFields[idx] = { ...newFields[idx], [field]: val };
        setEditInfo({ ...editInfo, customFields: newFields });
    };

    return (
        <Card>
            <h3 className="text-2xl font-bold mb-6">시스템 정보 및 크레딧 설정</h3>
            <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="text-xs font-bold block mb-1">버전</label>
                        <Input value={editInfo.version} onChange={e => setEditInfo({...editInfo, version: e.target.value})} />
                    </div>
                    <div>
                        <label className="text-xs font-bold block mb-1">총괄 개발자</label>
                        <Input value={editInfo.developer} onChange={e => setEditInfo({...editInfo, developer: e.target.value})} />
                    </div>
                    <div>
                        <label className="text-xs font-bold block mb-1">시스템 아키텍처 (프로그램명)</label>
                        <Input value={editInfo.program} onChange={e => setEditInfo({...editInfo, program: e.target.value})} />
                    </div>
                    <div>
                        <label className="text-xs font-bold block mb-1">기술 지원 연락처</label>
                        <Input value={editInfo.support} onChange={e => setEditInfo({...editInfo, support: e.target.value})} />
                    </div>
                </div>

                <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                    <h5 className="font-bold text-sm mb-3">엔딩 크레딧 추가 정보 (Custom Fields)</h5>
                    <div className="space-y-2">
                        {(editInfo.customFields || []).map((f, i) => (
                            <div key={i} className="flex gap-2 items-center">
                                <Input value={f.label} onChange={e => updateField(i, 'label', e.target.value)} className="flex-1 py-1 text-sm" placeholder="항목명" />
                                <Input value={f.value} onChange={e => updateField(i, 'value', e.target.value)} className="flex-[2] py-1 text-sm" placeholder="내용" />
                                <button onClick={() => removeField(i)} className="text-red-500 font-bold px-2">✕</button>
                            </div>
                        ))}
                    </div>
                    <div className="flex gap-2 mt-4 items-end bg-gray-50 dark:bg-gray-800 p-2 rounded">
                        <div className="flex-1">
                            <label className="text-[10px] text-gray-500">새 항목명</label>
                            <Input value={newLabel} onChange={e => setNewLabel(e.target.value)} className="w-full py-1 text-sm" />
                        </div>
                        <div className="flex-[2]">
                            <label className="text-[10px] text-gray-500">내용</label>
                            <Input value={newValue} onChange={e => setNewValue(e.target.value)} className="w-full py-1 text-sm" />
                        </div>
                        <Button onClick={addField} className="text-xs py-1.5 px-3 h-full">+</Button>
                    </div>
                </div>

                <Button onClick={handleSave} className="w-full mt-6 py-3">저장하기</Button>
            </div>
        </Card>
    );
};
