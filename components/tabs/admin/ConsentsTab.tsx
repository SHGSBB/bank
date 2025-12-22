
import React, { useState, useEffect } from 'react';
import { useGame } from '../../../context/GameContext';
import { Card, Button, Input, RichText } from '../../Shared';

export const ConsentsTab: React.FC = () => {
    const { db, saveDb, showModal } = useGame();
    const consents = db.settings.consents || {};
    
    // Helper to decode <br> to \n for editing
    const decodeContent = (html: string) => {
        return html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/?p>/gi, '').trim();
    };

    // Helper to encode \n to <br> for saving
    const encodeContent = (text: string) => {
        return text.split('\n').map(line => line.trim() ? `<p>${line}</p>` : '<br>').join('');
    };

    const [localConsents, setLocalConsents] = useState(
        Object.entries(consents).reduce((acc, [k, v]: [string, any]) => {
            acc[k] = { ...v, content: decodeContent(v.content) };
            return acc;
        }, {} as any)
    );

    // Ensure general provisions exists in local state
    if (!localConsents['general']) {
        localConsents['general'] = { title: '서비스 이용 약관 (총칙)', content: '총칙 내용을 입력하세요.', isMandatory: true };
    }

    const handleUpdate = (key: string, field: 'title' | 'content' | 'isMandatory', val: any) => {
        setLocalConsents((prev: any) => ({
            ...prev,
            [key]: { ...prev[key], [field]: val }
        }));
    };

    const handleSaveAll = async () => {
        const newDb = { ...db };
        const encodedConsents = Object.entries(localConsents).reduce((acc, [k, v]: [string, any]) => {
            acc[k] = { ...v, content: encodeContent(v.content) };
            return acc;
        }, {} as any);

        newDb.settings.consents = encodedConsents;
        await saveDb(newDb);
        showModal('모든 약관이 저장되었습니다. (줄바꿈이 자동으로 HTML로 변환됨)');
    };

    const handleAdd = () => {
        const id = `custom_${Date.now()}`;
        setLocalConsents((prev: any) => ({
            ...prev,
            [id]: { title: '새 약관', content: '내용을 입력하세요.', isMandatory: true }
        }));
    };

    const handleDelete = (key: string) => {
        if (key === 'general') return showModal("총칙은 삭제할 수 없습니다.");
        const newC = { ...localConsents };
        delete newC[key];
        setLocalConsents(newC);
    };

    return (
        <div className="space-y-6 w-full">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-2xl font-bold px-1">약관 관리</h3>
                <Button onClick={handleAdd} className="text-sm py-1">약관 추가</Button>
            </div>
            
            {/* General Provisions First */}
            {localConsents['general'] && (
                <Card className="border-l-4 border-blue-500 bg-blue-50/20 dark:bg-blue-900/10">
                    <div className="flex justify-between items-center mb-3">
                        <h4 className="font-bold text-lg text-blue-600">📜 서비스 이용 약관 (총칙)</h4>
                        <span className="text-xs text-gray-500">필수 항목 (삭제 불가)</span>
                    </div>
                    <div className="space-y-2 w-full">
                        <div>
                            <label className="text-sm font-medium mb-1 block">내용 (30초 강제 열람 적용됨)</label>
                            <textarea 
                                className="w-full p-3 rounded-xl bg-white dark:bg-[#2D2D2D] dark:text-[#E0E0E0] outline-none focus:ring-2 focus:ring-blue-500 border border-gray-200 dark:border-gray-700"
                                rows={10}
                                value={localConsents['general'].content} 
                                onChange={e => handleUpdate('general', 'content', e.target.value)}
                                placeholder="총칙 내용을 입력하세요."
                            />
                            <div className="mt-2 p-3 bg-white dark:bg-black rounded border border-gray-200 dark:border-gray-700 max-h-40 overflow-y-auto">
                                <p className="text-xs font-bold text-gray-500 mb-1">미리보기 (스타일 확인)</p>
                                <RichText text={localConsents['general'].content} className="text-sm" />
                            </div>
                        </div>
                    </div>
                </Card>
            )}

            {Object.keys(localConsents).filter(k => k !== 'general').map(key => (
                <Card key={key}>
                    <div className="flex justify-between items-center mb-3">
                        <h4 className="font-bold uppercase text-xs text-gray-500">{key}</h4>
                        <Button variant="danger" className="text-xs py-1 px-2" onClick={() => handleDelete(key)}>삭제</Button>
                    </div>
                    <div className="space-y-2 w-full">
                         <div>
                            <label className="text-sm font-medium mb-1 block">제목</label>
                            <Input 
                                value={localConsents[key].title} 
                                onChange={e => handleUpdate(key, 'title', e.target.value)}
                                className="w-full"
                            />
                        </div>
                        <div className="flex items-center gap-2 py-2">
                            <input 
                                type="checkbox" 
                                checked={localConsents[key].isMandatory !== false}
                                onChange={e => handleUpdate(key, 'isMandatory', e.target.checked)}
                                className="accent-green-600 w-4 h-4"
                            />
                            <label className="text-sm font-bold">회원가입 시 필수 동의</label>
                        </div>
                        <div>
                            <label className="text-sm font-medium mb-1 block">내용</label>
                            <textarea 
                                className="w-full p-2 rounded-md bg-[#F0F0F0] text-[#121212] dark:bg-[#2D2D2D] dark:text-[#E0E0E0] outline-none focus:ring-2 focus:ring-green-500"
                                rows={5}
                                value={localConsents[key].content} 
                                onChange={e => handleUpdate(key, 'content', e.target.value)}
                                placeholder="약관 내용을 입력하세요."
                            />
                        </div>
                    </div>
                </Card>
            ))}
            <Button className="w-full py-4 text-lg" onClick={handleSaveAll}>모든 약관 저장</Button>
        </div>
    );
};
