
import React, { useState, useEffect } from 'react';
import { useGame } from '../../../context/GameContext';
import { Card, Button, Input, Toggle } from '../../Shared';
import { Standards, ProgressiveRule } from '../../../types';

export const StandardTableTab: React.FC = () => {
    const { db, saveDb, showModal, requestPolicyChange, currentUser, notify } = useGame();
    
    const defaultStandards: Standards = {
        taxRateProperty: 1,
        taxRateIncome: 10,
        taxRateAcquisition: 5,
        weeklyWage: 50000,
        cleanerWage: 30000,
        competencyWageEnabled: false,
        competencyWages: { prosecutor: 0, legislator: 0, speaker: 0, judge: 0, chiefJustice: 0 },
        welfare: { targetThreshold: 10000000, housingSupport: 50000, additionalRules: '' },
        progressivePropertyRules: [],
        progressiveIncomeRules: []
    };

    const [stds, setStds] = useState<Standards>(db.settings.standards || defaultStandards);
    
    // UI Helpers
    const isAdminOrPresident = currentUser?.type === 'admin' || currentUser?.isPresident;
    const isTaxSeparated = db.settings.taxSeparation;
    // Specific check for Bank of Korea Governor
    const isBankGovernor = currentUser?.customJob === '한국은행장' || currentUser?.govtRole === '한국은행장' || currentUser?.type === 'admin';

    // Temporary Rule State for Adder
    const [newRuleThreshold, setNewRuleThreshold] = useState('');
    const [newRuleType, setNewRuleType] = useState<'percent'|'fixed'>('percent');
    const [newRuleValue, setNewRuleValue] = useState('');
    const [newRuleCategory, setNewRuleCategory] = useState<'property'|'income'>('property');

    useEffect(() => {
        setStds(db.settings.standards || defaultStandards);
    }, [db.settings.standards]);

    const handleChange = (field: keyof Standards, val: any) => {
        setStds(prev => ({ ...prev, [field]: parseFloat(val) || 0 }));
    };

    const handleNestedChange = (parent: 'competencyWages' | 'welfare', field: string, val: any) => {
        setStds(prev => ({
            ...prev,
            [parent]: {
                ...prev[parent],
                [field]: field === 'additionalRules' ? val : (parseFloat(val) || 0)
            }
        }));
    };

    const handleSave = async () => {
        if (isAdminOrPresident) {
             const newDb = { ...db };
             newDb.settings.standards = stds;
             await saveDb(newDb);
             notify('ALL', `[중요] 국가 기준표가 변경되었습니다.`, true);
             showModal("기준표가 업데이트되었습니다.");
        } else {
             await requestPolicyChange('standard', stds, "기준표 변경 요청");
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
        setNewRuleThreshold(''); setNewRuleValue('');
    };

    const handleRemoveRule = (category: 'property'|'income', index: number) => {
        if (category === 'property') {
            setStds(prev => ({ ...prev, progressivePropertyRules: prev.progressivePropertyRules?.filter((_, i) => i !== index) }));
        } else {
            setStds(prev => ({ ...prev, progressiveIncomeRules: prev.progressiveIncomeRules?.filter((_, i) => i !== index) }));
        }
    };

    const renderField = (value: number | string, onChange: (val: string) => void) => {
        if (isAdminOrPresident) {
            return <Input type="number" value={value} onChange={e => onChange(e.target.value)} />;
        }
        return <span className="font-bold text-lg">{value.toLocaleString()}</span>;
    };

    return (
        <Card>
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-bold">국가 기준표 (Standards)</h3>
                {!isAdminOrPresident && <span className="text-xs bg-gray-200 px-2 py-1 rounded">읽기 전용</span>}
            </div>

            <div className="space-y-8">
                {/* 1. TAX SECTION */}
                <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                    <div className="bg-gray-100 dark:bg-gray-800 p-4 font-bold text-lg flex justify-between">
                        <span>세금 기준</span>
                        <span className="text-xs font-normal bg-white dark:bg-gray-700 px-2 py-1 rounded border">{isTaxSeparated ? "세금 분리 모드" : "통합 세금 모드"}</span>
                    </div>
                    <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-4">
                            <div>
                                <label className="font-bold text-sm block mb-1">
                                    {isTaxSeparated ? "종합부동산세 (누진세 대상)" : "기본 재산세 (누진세 대상)"}
                                </label>
                                <div className="flex items-center gap-2">
                                    {renderField(stds.taxRateProperty, v => handleChange('taxRateProperty', v))}
                                    <span>%</span>
                                </div>
                                {/* Progressive Rules Display for Property */}
                                <div className="mt-2 bg-gray-50 dark:bg-gray-900 p-2 rounded text-xs space-y-1">
                                    <p className="font-bold text-gray-500">누진세 기준 (밑)</p>
                                    {stds.progressivePropertyRules?.map((r, i) => (
                                        <div key={i} className="flex justify-between">
                                            <span>{r.threshold.toLocaleString()} 이상: +{r.value}{r.type==='percent'?'%':'원'}</span>
                                            {isAdminOrPresident && <button onClick={() => handleRemoveRule('property', i)} className="text-red-500">x</button>}
                                        </div>
                                    ))}
                                    {isAdminOrPresident && <button onClick={() => { setNewRuleCategory('property'); document.getElementById('ruleAdder')?.scrollIntoView(); }} className="text-blue-500 underline">+ 규칙 추가</button>}
                                </div>
                            </div>
                            
                            {isTaxSeparated && (
                                <div>
                                    <label className="font-bold text-sm block mb-1">기본 재산세 (자산)</label>
                                    <p className="text-xs text-gray-500 mb-1">부동산 제외 자산에 적용</p>
                                    <div className="flex items-center gap-2">
                                        {renderField(stds.taxRateIncome, v => handleChange('taxRateIncome', v))}
                                        <span>%</span>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="font-bold text-sm block mb-1">기본 소득세 (주간)</label>
                                <div className="flex items-center gap-2">
                                    {renderField(stds.taxRateIncome, v => handleChange('taxRateIncome', v))}
                                    <span>%</span>
                                </div>
                                <div className="mt-2 bg-gray-50 dark:bg-gray-900 p-2 rounded text-xs space-y-1">
                                    <p className="font-bold text-gray-500">누진세 기준 (밑)</p>
                                    {stds.progressiveIncomeRules?.map((r, i) => (
                                        <div key={i} className="flex justify-between">
                                            <span>{r.threshold.toLocaleString()} 이상: +{r.value}{r.type==='percent'?'%':'원'}</span>
                                            {isAdminOrPresident && <button onClick={() => handleRemoveRule('income', i)} className="text-red-500">x</button>}
                                        </div>
                                    ))}
                                    {isAdminOrPresident && <button onClick={() => { setNewRuleCategory('income'); document.getElementById('ruleAdder')?.scrollIntoView(); }} className="text-blue-500 underline">+ 규칙 추가</button>}
                                </div>
                            </div>

                            <div>
                                <label className="font-bold text-sm block mb-1">취득세 (부동산 거래 시)</label>
                                <div className="flex items-center gap-2">
                                    {renderField(stds.taxRateAcquisition || 0, v => handleChange('taxRateAcquisition', v))}
                                    <span>%</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 2. WAGE SECTION */}
                <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                    <div className="bg-gray-100 dark:bg-gray-800 p-4 font-bold text-lg flex justify-between items-center">
                        <span>주급 및 임금 기준</span>
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-normal">역량별 주급</span>
                            {isBankGovernor ? (
                                <Toggle checked={stds.competencyWageEnabled || false} onChange={v => setStds(prev => ({...prev, competencyWageEnabled: v}))} />
                            ) : (
                                <span className={`text-xs font-bold px-2 py-1 rounded ${stds.competencyWageEnabled ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'}`}>
                                    {stds.competencyWageEnabled ? "ON" : "OFF"}
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="p-4 space-y-4">
                        {!stds.competencyWageEnabled ? (
                            <div className="grid grid-cols-2 gap-6">
                                <div>
                                    <label className="font-bold text-sm block mb-1">기본 주급</label>
                                    {renderField(stds.weeklyWage, v => handleChange('weeklyWage', v))}
                                </div>
                                <div>
                                    <label className="font-bold text-sm block mb-1">환경미화원 주급</label>
                                    {renderField(stds.cleanerWage, v => handleChange('cleanerWage', v))}
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-4 animate-fade-in">
                                <p className="text-xs text-red-500 font-bold bg-red-50 p-2 rounded">* 역량별 주급 활성화 시, 자동 주급 지급이 비활성화됩니다 (수동/성과 지급).</p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    {['prosecutor', 'legislator', 'speaker', 'judge', 'chiefJustice'].map(role => (
                                        <div key={role}>
                                            <label className="font-bold text-sm block mb-1 capitalize">
                                                {role === 'prosecutor' ? '검사 (기소 시)' : 
                                                 role === 'legislator' ? '국회의원 (법 제정 시)' :
                                                 role === 'speaker' ? '국회의장 (법 제정 시)' :
                                                 role === 'judge' ? '법원 (재판 시)' : '대법원장 (재판 시)'}
                                            </label>
                                            {renderField(stds.competencyWages?.[role] || 0, v => handleNestedChange('competencyWages', role, v))}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* 3. WELFARE SECTION */}
                <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                    <div className="bg-gray-100 dark:bg-gray-800 p-4 font-bold text-lg">복지 기준</div>
                    <div className="p-4 space-y-4">
                        <div>
                            <label className="font-bold text-sm block mb-1">기본 복지 대상 (자산 이하)</label>
                            {renderField(stds.welfare?.targetThreshold || 0, v => handleNestedChange('welfare', 'targetThreshold', v))}
                        </div>
                        <div>
                            <label className="font-bold text-sm block mb-1">주세 지원금</label>
                            {renderField(stds.welfare?.housingSupport || 0, v => handleNestedChange('welfare', 'housingSupport', v))}
                        </div>
                        <div>
                            <label className="font-bold text-sm block mb-1">추가 기준 (텍스트)</label>
                            {isAdminOrPresident ? (
                                <textarea 
                                    className="w-full p-2 border rounded bg-white dark:bg-black text-sm"
                                    rows={3}
                                    value={stds.welfare?.additionalRules || ''}
                                    onChange={e => handleNestedChange('welfare', 'additionalRules', e.target.value)}
                                    placeholder="예: 다자녀 가구 추가 지원 10%, 장애인 가구 지원 등..."
                                />
                            ) : (
                                <p className="text-sm bg-gray-50 p-2 rounded">{stds.welfare?.additionalRules || "없음"}</p>
                            )}
                        </div>
                    </div>
                </div>

                {/* Rule Adder (Hidden mostly) */}
                {isAdminOrPresident && (
                    <div id="ruleAdder" className="p-4 border rounded-xl bg-blue-50 dark:bg-blue-900/10 flex flex-wrap gap-3 items-end">
                        <div>
                            <label className="text-xs block font-bold mb-1">누진세 규칙 추가</label>
                            <select value={newRuleCategory} onChange={e => setNewRuleCategory(e.target.value as any)} className="text-sm p-2 rounded border">
                                <option value="property">재산/종부세</option>
                                <option value="income">소득세</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-xs block mb-1">기준 금액 (이상)</label>
                            <Input type="number" value={newRuleThreshold} onChange={e => setNewRuleThreshold(e.target.value)} className="w-32 py-1 text-sm" placeholder="0" />
                        </div>
                        <div>
                            <label className="text-xs block mb-1">방식</label>
                            <select value={newRuleType} onChange={e => setNewRuleType(e.target.value as any)} className="text-sm p-2 rounded border">
                                <option value="percent">퍼센트(%) 추가</option>
                                <option value="fixed">고정금액(+) 추가</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-xs block mb-1">값</label>
                            <Input type="number" value={newRuleValue} onChange={e => setNewRuleValue(e.target.value)} className="w-24 py-1 text-sm" placeholder="0" />
                        </div>
                        <Button onClick={handleAddRule} className="text-sm py-2">추가</Button>
                    </div>
                )}

                {isAdminOrPresident && (
                    <Button className="w-full py-4 text-lg" onClick={handleSave}>
                        {currentUser?.type === 'admin' ? '저장 및 적용' : '변경 요청 (대통령)'}
                    </Button>
                )}
            </div>
        </Card>
    );
};
