import React, { useState, useEffect } from 'react';
import { useGame } from '../../../context/GameContext';
import { Card, Button, Input } from '../../Shared';
import { Standards, ProgressiveRule } from '../../../types';

export const StandardTableTab: React.FC = () => {
    const { db, saveDb, showModal, requestPolicyChange, currentUser, notify } = useGame();
    
    const defaultStandards: Standards = {
        taxRateProperty: 1,
        taxRateIncome: 10,
        weeklyWage: 50000,
        cleanerWage: 30000,
        progressivePropertyRules: [],
        progressiveIncomeRules: []
    };

    const [stds, setStds] = useState<Standards>(db.settings.standards || defaultStandards);
    const [importLink, setImportLink] = useState('');
    const [isSimulatingImport, setIsSimulatingImport] = useState(false);

    // New Rule State
    const [newRuleThreshold, setNewRuleThreshold] = useState('');
    const [newRuleType, setNewRuleType] = useState<'percent'|'fixed'>('percent');
    const [newRuleValue, setNewRuleValue] = useState('');
    const [newRuleCategory, setNewRuleCategory] = useState<'property'|'income'>('property');

    const isAdminOrPresident = currentUser?.type === 'admin' || currentUser?.isPresident;

    useEffect(() => {
        setStds(db.settings.standards || defaultStandards);
    }, [db.settings.standards]);

    const handleChange = (field: keyof Standards, val: string) => {
        setStds(prev => ({ ...prev, [field]: parseFloat(val) || 0 }));
    };

    const handleSave = async () => {
        if (currentUser?.type === 'admin') {
             const newDb = { ...db };
             newDb.settings.standards = stds;
             await saveDb(newDb);
             notify('ALL', `[중요] 국가 기준표(세율/임금)가 변경되었습니다. 확인해주세요.`, true);
             showModal("기준표가 업데이트되고 전 국민에게 알림이 발송되었습니다.");
        } else {
             await requestPolicyChange('standard', stds, "기준표(세율/임금) 변경");
        }
    };

    const handleAddRule = () => {
        const threshold = parseInt(newRuleThreshold);
        const value = parseFloat(newRuleValue);
        
        if (isNaN(threshold) || isNaN(value)) return showModal("올바른 값을 입력하세요.");
        
        const newRule: ProgressiveRule = { threshold, type: newRuleType, value };
        
        if (newRuleCategory === 'property') {
            setStds(prev => ({ ...prev, progressivePropertyRules: [...(prev.progressivePropertyRules || []), newRule].sort((a,b) => a.threshold - b.threshold) }));
        } else {
            setStds(prev => ({ ...prev, progressiveIncomeRules: [...(prev.progressiveIncomeRules || []), newRule].sort((a,b) => a.threshold - b.threshold) }));
        }
        
        setNewRuleThreshold('');
        setNewRuleValue('');
    };

    const handleRemoveRule = (category: 'property'|'income', index: number) => {
        if (category === 'property') {
            setStds(prev => ({ ...prev, progressivePropertyRules: prev.progressivePropertyRules?.filter((_, i) => i !== index) }));
        } else {
            setStds(prev => ({ ...prev, progressiveIncomeRules: prev.progressiveIncomeRules?.filter((_, i) => i !== index) }));
        }
    };

    const handleImportSimulate = () => {
        if (!importLink.trim()) return showModal("링크 또는 텍스트를 입력하세요.");
        setIsSimulatingImport(true);
        setTimeout(() => {
            setIsSimulatingImport(false);
            let changes: string[] = [];
            const newStds = { ...stds };
            if (importLink.includes("wage") || importLink.includes("주급") || importLink.includes("50000")) {
                const randomWage = Math.floor(Math.random() * 50) * 1000 + 40000; 
                newStds.weeklyWage = randomWage;
                changes.push(`- 주급: ₩${randomWage.toLocaleString()}`);
            }
            if (importLink.includes("tax") || importLink.includes("세금")) {
                const randomTax = Math.floor(Math.random() * 15) + 5;
                newStds.taxRateIncome = randomTax;
                changes.push(`- 소득세율: ${randomTax}%`);
            }
            if (changes.length === 0) {
                newStds.cleanerWage += 5000;
                changes.push("- 환경미화원 일당: ₩5,000 인상");
            }
            setStds(newStds);
            showModal(`[자동 인식 완료]\n${changes.join('\n')}`);
        }, 1500);
    };

    return (
        <Card>
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-bold">기준표 (Standards)</h3>
                {!isAdminOrPresident && <span className="text-xs bg-gray-200 px-2 py-1 rounded">읽기 전용</span>}
            </div>
            
            {isAdminOrPresident && (
                <div className="mb-8 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-dashed border-gray-300 dark:border-gray-700">
                    <h4 className="text-sm font-bold mb-3 text-gray-600 dark:text-gray-300">외부 데이터 불러오기</h4>
                    <div className="flex gap-2">
                        <Input placeholder="링크 또는 텍스트" value={importLink} onChange={e => setImportLink(e.target.value)} />
                        <Button onClick={handleImportSimulate} disabled={isSimulatingImport}>
                            {isSimulatingImport ? '...' : '가져오기'}
                        </Button>
                    </div>
                </div>
            )}

            <div className="overflow-x-auto w-full mb-6">
                <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
                    <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400">
                        <tr>
                            <th className="px-6 py-3">항목</th>
                            <th className="px-6 py-3">현재 값</th>
                            <th className="px-6 py-3">단위</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr className="bg-white border-b dark:bg-gray-800 dark:border-gray-700">
                            <td className="px-6 py-4 font-bold">기본 재산세율</td>
                            <td className="px-6 py-4">
                                <Input type="number" disabled={!isAdminOrPresident} value={stds.taxRateProperty} onChange={e => handleChange('taxRateProperty', e.target.value)} className="w-32 py-1" />
                            </td>
                            <td className="px-6 py-4">%</td>
                        </tr>
                        <tr className="bg-white border-b dark:bg-gray-800 dark:border-gray-700">
                            <td className="px-6 py-4 font-bold">기본 소득/자산세율</td>
                            <td className="px-6 py-4">
                                <Input type="number" disabled={!isAdminOrPresident} value={stds.taxRateIncome} onChange={e => handleChange('taxRateIncome', e.target.value)} className="w-32 py-1" />
                            </td>
                            <td className="px-6 py-4">%</td>
                        </tr>
                        <tr className="bg-white border-b dark:bg-gray-800 dark:border-gray-700">
                            <td className="px-6 py-4 font-bold">기본 주급</td>
                            <td className="px-6 py-4">
                                <Input type="number" disabled={!isAdminOrPresident} value={stds.weeklyWage} onChange={e => handleChange('weeklyWage', e.target.value)} className="w-32 py-1" />
                            </td>
                            <td className="px-6 py-4">KRW</td>
                        </tr>
                        <tr className="bg-white border-b dark:bg-gray-800 dark:border-gray-700">
                            <td className="px-6 py-4 font-bold">환경미화원 일당</td>
                            <td className="px-6 py-4">
                                <Input type="number" disabled={!isAdminOrPresident} value={stds.cleanerWage} onChange={e => handleChange('cleanerWage', e.target.value)} className="w-32 py-1" />
                            </td>
                            <td className="px-6 py-4">KRW</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            {/* Progressive Tax Rules */}
            <div className="mb-6 border-t pt-4">
                <h4 className="font-bold mb-4">누진세 규칙 설정</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded">
                        <h5 className="font-bold text-sm mb-2 text-blue-600">재산세/종부세 누진 규칙</h5>
                        <ul className="space-y-1 mb-2 text-xs">
                            {stds.progressivePropertyRules?.map((r, i) => (
                                <li key={i} className="flex justify-between items-center bg-white dark:bg-gray-700 p-1 rounded">
                                    <span>{r.threshold.toLocaleString()} 이상: +{r.value.toLocaleString()}{r.type === 'percent' ? '%' : '원'}</span>
                                    {isAdminOrPresident && <button onClick={() => handleRemoveRule('property', i)} className="text-red-500 px-2">x</button>}
                                </li>
                            ))}
                        </ul>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded">
                        <h5 className="font-bold text-sm mb-2 text-green-600">소득/자산세 누진 규칙</h5>
                        <ul className="space-y-1 mb-2 text-xs">
                            {stds.progressiveIncomeRules?.map((r, i) => (
                                <li key={i} className="flex justify-between items-center bg-white dark:bg-gray-700 p-1 rounded">
                                    <span>{r.threshold.toLocaleString()} 이상: +{r.value.toLocaleString()}{r.type === 'percent' ? '%' : '원'}</span>
                                    {isAdminOrPresident && <button onClick={() => handleRemoveRule('income', i)} className="text-red-500 px-2">x</button>}
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>

                {isAdminOrPresident && (
                    <div className="mt-4 p-3 border rounded bg-gray-50 dark:bg-gray-900 flex flex-wrap gap-2 items-end">
                        <div>
                            <label className="text-xs block mb-1">대상</label>
                            <select value={newRuleCategory} onChange={e => setNewRuleCategory(e.target.value as any)} className="text-xs p-2 rounded border">
                                <option value="property">재산세/종부세</option>
                                <option value="income">소득/자산세</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-xs block mb-1">기준 금액 (이상)</label>
                            <Input type="number" value={newRuleThreshold} onChange={e => setNewRuleThreshold(e.target.value)} className="w-24 py-1 text-xs" />
                        </div>
                        <div>
                            <label className="text-xs block mb-1">방식</label>
                            <select value={newRuleType} onChange={e => setNewRuleType(e.target.value as any)} className="text-xs p-2 rounded border">
                                <option value="percent">퍼센트(%) 추가</option>
                                <option value="fixed">고정금액(+) 추가</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-xs block mb-1">값</label>
                            <Input type="number" value={newRuleValue} onChange={e => setNewRuleValue(e.target.value)} className="w-20 py-1 text-xs" />
                        </div>
                        <Button onClick={handleAddRule} className="text-xs py-2 px-3 h-9">추가</Button>
                    </div>
                )}
            </div>

            {isAdminOrPresident && (
                <Button className="w-full" onClick={handleSave}>
                    {currentUser?.type === 'admin' ? '저장 및 알림 발송' : '기준표 변경 요청 (대통령 승인 필요)'}
                </Button>
            )}
        </Card>
    );
};