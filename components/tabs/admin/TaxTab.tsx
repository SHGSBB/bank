
import React, { useState } from 'react';
import { useGame } from '../../../context/GameContext';
import { Card, Button, Input, Modal, Toggle } from '../../Shared';
import { User, TaxSession, PendingTax, ProgressiveRule, TermDeposit } from '../../../types';

export const TaxTab: React.FC = () => {
    const { db, saveDb, notify, showModal, showConfirm, serverAction } = useGame();
    const [subTab, setSubTab] = useState<'collect' | 'manage' | 'vat'>('collect');
    const [sessionType, setSessionType] = useState<'real_estate'|'income'|'asset'>('real_estate');
    const [useProgressive, setUseProgressive] = useState(true);
    
    const getDefaultDueDate = () => {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        d.setHours(23, 59, 0, 0);
        return d.toISOString().slice(0, 16); 
    };
    const [dueDateInput, setDueDateInput] = useState(getDefaultDueDate());
    const [vatRate, setVatRate] = useState(db.settings.vat?.rate?.toString() || '10');
    const [vatTargetStr, setVatTargetStr] = useState(db.settings.vat?.targetMarts?.join(', ') || 'all');
    
    const [penaltyAmount, setPenaltyAmount] = useState('');
    const [selectedUnpaidUser, setSelectedUnpaidUser] = useState<string | null>(null);

    const standards = db.settings.standards || { taxRateProperty: 1, taxRateIncome: 10, progressivePropertyRules: [], progressiveIncomeRules: [] };

    // Tax Calculation Logic (Preview)
    const applyProgressive = (baseAmount: number, rules: ProgressiveRule[]) => {
        let tax = 0;
        let breakdown = '';
        const sortedRules = [...rules].sort((a, b) => a.threshold - b.threshold);
        for (const rule of sortedRules) {
            if (baseAmount >= rule.threshold) {
                if (rule.type === 'percent') {
                    const extra = Math.floor(baseAmount * (rule.value / 100));
                    tax += extra;
                    breakdown += `\n[누진세] ₩${rule.threshold.toLocaleString()} 이상: +${rule.value}% (₩${extra.toLocaleString()})`;
                } else {
                    tax += rule.value;
                    breakdown += `\n[누진세] ₩${rule.threshold.toLocaleString()} 이상: +₩${rule.value.toLocaleString()}`;
                }
            }
        }
        return { tax, breakdown };
    };

    const calculateTax = (user: User, type: 'real_estate' | 'income' | 'asset') => {
        let taxableAmount = 0;
        let baseRate = 0;
        let baseTax = 0;
        let breakdown = '';
        let rules: ProgressiveRule[] = [];

        if (type === 'real_estate') {
            taxableAmount = (db.realEstate.grid || []).filter(p => p.owner === user.name).reduce((sum, p) => sum + p.price, 0);
            baseRate = standards.taxRateProperty;
            breakdown = `[종합부동산세] 보유 부동산 총액: ₩${taxableAmount.toLocaleString()}\n기본 세율: ${baseRate}%`;
            rules = standards.progressivePropertyRules || [];
        } else if (type === 'asset') {
            const cash = user.balanceKRW + (user.balanceUSD * (db.settings.exchangeRate.KRW_USD || 1350));
            taxableAmount = cash; // Simplified for preview
            baseRate = standards.taxRateIncome; 
            breakdown = `[재산세(자산)] 총 자산: ₩${taxableAmount.toLocaleString()}\n기본 세율: ${baseRate}%`;
            rules = standards.progressiveIncomeRules || []; 
        } else {
            // Income Tax based on recent week transactions
            const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
            taxableAmount = (user.transactions || [])
                .filter(t => t.type === 'income' && new Date(t.date).getTime() > oneWeekAgo)
                .reduce((sum, t) => sum + t.amount, 0);
            baseRate = standards.taxRateIncome;
            breakdown = `[소득세] 주간 소득: ₩${taxableAmount.toLocaleString()}\n기본 세율: ${baseRate}%`;
            rules = standards.progressiveIncomeRules || [];
        }

        baseTax = Math.floor(taxableAmount * (baseRate / 100));
        breakdown += ` -> 기본 세액: ₩${baseTax.toLocaleString()}`;

        if (useProgressive) {
            const prog = applyProgressive(taxableAmount, rules);
            baseTax += prog.tax;
            breakdown += prog.breakdown;
        }

        return { amount: baseTax, breakdown };
    };

    const handleStartCollection = async () => {
        const citizens = (Object.values(db.users) as User[]).filter(u => u.type === 'citizen');
        if (citizens.length === 0) return showModal('징수 대상 시민이 없습니다.');

        const valDueDate = new Date(dueDateInput).getTime();
        if (isNaN(valDueDate) || valDueDate <= Date.now()) return showModal("유효한 납부 기한(미래 시간)을 선택하세요.");

        if (!await showConfirm(`${citizens.length}명의 시민에게 세금 고지서를 발송하시겠습니까?`)) return;

        const sessionId = `tax_${Date.now()}`;
        const finalDueDate = new Date(dueDateInput).toISOString();
        const taxesToCollect: any[] = [];

        citizens.forEach(user => {
            const result = calculateTax(user, sessionType);
            if (result.amount > 0) {
                taxesToCollect.push({
                    userId: user.name,
                    amount: result.amount,
                    breakdown: result.breakdown,
                    type: sessionType
                });
            }
        });

        if (taxesToCollect.length === 0) return showModal("징수할 세금이 없습니다.");

        try {
            await serverAction('collect_tax', {
                taxSessionId: sessionId,
                taxes: taxesToCollect,
                dueDate: finalDueDate
            });
            showModal("고지서가 발송되었습니다.");
        } catch (e) {
            showModal("징수 시작 실패");
        }
    };

    const handleSaveVAT = async () => {
        const rate = parseFloat(vatRate);
        if (isNaN(rate)) return showModal("올바른 세율을 입력하세요.");
        
        const targets = vatTargetStr.split(',').map(s => s.trim()).filter(Boolean);
        
        const newDb = { ...db };
        newDb.settings.vat = { rate, targetMarts: targets.length > 0 ? targets : ['all'] };
        await saveDb(newDb);
        showModal("부가세 설정이 저장되었습니다. 마트 거래 시 자동 징수됩니다.");
    };

    return (
        <Card>
            <div className="flex border-b border-gray-200 dark:border-gray-700 mb-4 overflow-x-auto">
                <button onClick={() => setSubTab('collect')} className={`px-4 py-2 border-b-2 font-bold ${subTab === 'collect' ? 'border-green-500 text-green-500' : 'border-transparent text-gray-500'}`}>징수 시작</button>
                <button onClick={() => setSubTab('vat')} className={`px-4 py-2 border-b-2 font-bold ${subTab === 'vat' ? 'border-green-500 text-green-500' : 'border-transparent text-gray-500'}`}>부가세 설정</button>
            </div>
            
            {subTab === 'collect' && (
                <div className="space-y-6">
                    <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                        <h4 className="font-bold mb-4">세금 종류 선택</h4>
                        <div className="flex flex-col gap-3 mb-4">
                            <label className="flex items-center gap-2 cursor-pointer p-3 border rounded-lg bg-white dark:bg-gray-700 w-full"><input type="radio" name="stype" checked={sessionType === 'asset'} onChange={() => setSessionType('asset')} className="accent-green-600 w-5 h-5"/><div><span className="block font-bold">재산세 (Asset Tax)</span><span className="text-xs text-gray-500">부동산 제외 총 자산</span></div></label>
                            <label className="flex items-center gap-2 cursor-pointer p-3 border rounded-lg bg-white dark:bg-gray-700 w-full"><input type="radio" name="stype" checked={sessionType === 'real_estate'} onChange={() => setSessionType('real_estate')} className="accent-green-600 w-5 h-5"/><div><span className="block font-bold">종합부동산세</span><span className="text-xs text-gray-500">부동산 총액 기준</span></div></label>
                            <label className="flex items-center gap-2 cursor-pointer p-3 border rounded-lg bg-white dark:bg-gray-700 w-full"><input type="radio" name="stype" checked={sessionType === 'income'} onChange={() => setSessionType('income')} className="accent-green-600 w-5 h-5"/><div><span className="block font-bold">소득세</span><span className="text-xs text-gray-500">주간 소득 기준</span></div></label>
                        </div>
                        <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/20 rounded border border-blue-100 mb-4"><span className="font-bold text-sm text-blue-800 dark:text-blue-300">누진세 적용</span><Toggle checked={useProgressive} onChange={setUseProgressive} /></div>
                        <div><label className="font-bold text-sm block mb-1">납부 마감 기한</label><Input type="datetime-local" value={dueDateInput} onChange={e => setDueDateInput(e.target.value)} className="w-full p-2" /></div>
                    </div>
                    <Button onClick={handleStartCollection} className="w-full py-3 text-lg">고지서 발송</Button>
                </div>
            )}

            {subTab === 'vat' && (
                <div className="space-y-6">
                    <p className="text-sm text-gray-500 mb-4">
                        사업자(마트)의 판매 수익에 대해 부가세를 설정합니다.<br/>
                        설정된 세율만큼 판매 시 자동으로 징수되어 한국은행으로 입금됩니다.
                    </p>
                    <div>
                        <label className="font-bold text-sm block mb-1">부가세율 (%)</label>
                        <Input type="number" value={vatRate} onChange={e => setVatRate(e.target.value)} className="w-full" />
                    </div>
                    <div>
                        <label className="font-bold text-sm block mb-1">대상 사업자</label>
                        <Input value={vatTargetStr} onChange={e => setVatTargetStr(e.target.value)} placeholder="사업자명 입력 (쉼표로 구분, 'all' 입력시 전체)" className="w-full" />
                        <p className="text-xs text-gray-400 mt-1">예: 이마트, 편의점 (all 입력 시 모든 마트 적용)</p>
                    </div>
                    <Button onClick={handleSaveVAT} className="w-full mt-4">설정 저장</Button>
                </div>
            )}
        </Card>
    );
};
