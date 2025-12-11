
import React, { useState } from 'react';
import { useGame } from '../../../context/GameContext';
import { Card, Button, Input } from '../../Shared';
import { Announcement, AnnouncementCategory } from '../../../types';

export const AnnouncementsTab: React.FC = () => {
    const { db, saveDb, showModal, showConfirm } = useGame();
    const [editId, setEditId] = useState<number | null>(null);
    const [content, setContent] = useState('');
    const [category, setCategory] = useState<AnnouncementCategory>('general');
    const [isImportant, setIsImportant] = useState(false);
    const [showOnStartup, setShowOnStartup] = useState(false);
    const [period, setPeriod] = useState('7');

    const categories: { val: AnnouncementCategory, label: string }[] = [
        { val: 'general', label: '일반 공지' },
        { val: 'service_stop', label: '서비스 중지 (점검)' },
        { val: 'service_end', label: '서비스 종료' },
        { val: 'terms_update', label: '약관 변경' },
        { val: 'standard_update', label: '기준 변경' }
    ];

    const handleSave = async () => {
        if (!content.trim()) return showModal('내용을 입력하세요.');
        const periodDays = parseInt(period);
        if (isNaN(periodDays) || periodDays < 1) return showModal('올바른 게시 기간을 입력하세요.');

        const newDb = { ...db };
        const newAnnounce: Announcement = {
            id: editId || Date.now(),
            content,
            category,
            isImportant: category !== 'general' ? true : isImportant, // Special cats force important
            showOnStartup,
            displayPeriodDays: periodDays,
            date: new Date().toISOString()
        };

        if (editId) {
            const idx = (newDb.announcements || []).findIndex(a => a.id === editId);
            if (idx !== -1) newDb.announcements[idx] = newAnnounce;
        } else {
            newDb.announcements = [newAnnounce, ...(newDb.announcements || [])];
        }

        await saveDb(newDb);
        resetForm();
    };

    const handleDelete = async (id: number) => {
        if (!(await showConfirm('정말 삭제하시겠습니까?'))) return;
        const newDb = { ...db };
        newDb.announcements = newDb.announcements.filter(a => a.id !== id);
        await saveDb(newDb);
    };

    const handleEdit = (a: Announcement) => {
        setEditId(a.id);
        setContent(a.content);
        setCategory(a.category || 'general');
        setIsImportant(a.isImportant);
        setShowOnStartup(a.showOnStartup || false);
        setPeriod(a.displayPeriodDays.toString());
    };

    const resetForm = () => {
        setEditId(null);
        setContent('');
        setCategory('general');
        setIsImportant(false);
        setShowOnStartup(false);
        setPeriod('7');
    };

    return (
        <Card>
            <h3 className="text-2xl font-bold mb-6">공지사항 관리</h3>
            
            <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg mb-8 border border-gray-200 dark:border-gray-700 w-full">
                <h4 className="font-bold mb-3">{editId ? '공지 수정' : '새 공지사항 등록'}</h4>
                <div className="mb-3">
                    <label className="text-sm font-bold block mb-1">분류</label>
                    <select value={category} onChange={e => setCategory(e.target.value as any)} className="w-full p-2 rounded bg-white dark:bg-[#2D2D2D] border dark:border-gray-600">
                        {categories.map(c => <option key={c.val} value={c.val}>{c.label}</option>)}
                    </select>
                </div>
                <textarea 
                    className="w-full p-3 rounded-md bg-white dark:bg-[#2D2D2D] mb-3 outline-none focus:ring-2 focus:ring-green-500"
                    rows={3} 
                    placeholder="공지 내용을 입력하세요."
                    value={content}
                    onChange={e => setContent(e.target.value)}
                />
                <div className="flex flex-wrap gap-4 items-center mb-4 text-sm">
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={isImportant} onChange={e => setIsImportant(e.target.checked)} className="accent-green-600 w-4 h-4" />
                        중요 (팝업)
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={showOnStartup} onChange={e => setShowOnStartup(e.target.checked)} className="accent-green-600 w-4 h-4" />
                        맨 처음 페이지 접속 시 표시
                    </label>
                    <div className="flex items-center gap-2">
                        <span>배너 게시 기간(일):</span>
                        <Input type="number" value={period} onChange={e => setPeriod(e.target.value)} className="w-20 py-1" />
                    </div>
                </div>
                <div className="flex gap-2">
                    <Button onClick={handleSave}>{editId ? '수정 저장' : '등록'}</Button>
                    {editId && <Button variant="secondary" onClick={resetForm}>취소</Button>}
                </div>
            </div>

            <ul className="space-y-3 w-full">
                {(db.announcements || []).map(a => (
                    <li key={a.id} className="border border-gray-200 dark:border-gray-700 p-3 rounded bg-white dark:bg-[#2D2D2D] flex justify-between items-start w-full">
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <span className={`text-xs px-2 py-0.5 rounded text-white ${a.category === 'service_end' ? 'bg-red-600' : a.category === 'service_stop' ? 'bg-orange-500' : 'bg-green-600'}`}>
                                    {categories.find(c => c.val === a.category)?.label}
                                </span>
                                {a.showOnStartup && <span className="text-xs bg-blue-500 text-white px-2 py-0.5 rounded">시작 시 표시</span>}
                            </div>
                            <p className={a.isImportant ? 'font-bold' : ''}>{a.content}</p>
                            <p className="text-xs text-gray-500 mt-1">
                                {new Date(a.date).toLocaleDateString()} | {a.displayPeriodDays}일간
                            </p>
                        </div>
                        <div className="flex gap-2">
                            <Button className="text-xs py-1 px-3" variant="secondary" onClick={() => handleEdit(a)}>수정</Button>
                            <Button className="text-xs py-1 px-3" variant="danger" onClick={() => handleDelete(a.id)}>삭제</Button>
                        </div>
                    </li>
                ))}
            </ul>
        </Card>
    );
};
