
import React, { useState } from 'react';
import { useGame } from '../../../context/GameContext';
import { Card, Button, Input, Toggle } from '../../Shared';
import { ExchangeConfig, SavingsConfig } from '../../../types';

export const BankSettingsTab: React.FC = () => {
    const { db, saveDb, showModal } = useGame();
    
    // Legacy Rates
    const [rateUSD, setRateUSD] = useState(db.settings.exchangeRate.KRW_USD.toString());
    
    // Exchange Config
    const defaultConfig: ExchangeConfig = {
        pairs: { KRW_USD: true },
        rates: { KRW_USD: 1350 },
        isAutoStopEnabled: false,
        autoStopThresholdUSD: 100,
        autoMintLimit: 1000000000
    };
    const [exConfig, setExConfig] = useState<ExchangeConfig>(db.settings.exchangeConfig || defaultConfig);

    const [loanWeeks, setLoanWeeks] = useState(db.settings.loanInterestRate.periodWeeks.toString());
    const [loanRate, setLoanRate] = useState(db.settings.loanInterestRate.rate.toString());
    
    // Granular Savings State
    const sInt = db.settings.savingsInterest;
    // Handle migration defaults
    // @ts-ignore
    const defaultSavings = typeof sInt.rate === 'number' ? {
        regular: { rate: 1, periodWeeks: 0 },
        // @ts-ignore
        term: { rate: sInt.rate, periodWeeks: sInt.periodWeeks || 52 },
        installment: { rate: 5, periodWeeks: 52 }
    } : sInt as SavingsConfig;

    const [savingsConfig, setSavingsConfig] = useState<SavingsConfig>(defaultSavings);
    
    const [isFrozen, setIsFrozen] = useState(db.settings.isFrozen || false);
    const [signupRestricted, setSignupRestricted] = useState(db.settings.signupRestricted || false);
    const [requireApproval, setRequireApproval] = useState(db.settings.requireSignupApproval !== false); // Default true if undefined
    const [bypassPin, setBypassPin] = useState(db.settings.bypassPin || false);
    const [transferLimit, setTransferLimit] = useState(db.settings.transferLimit?.toString() || '1000000');
    const [txLimit, setTxLimit] = useState(db.settings.transactionLimit?.toString() || '50');
    
    const [taxSeparation, setTaxSeparation] = useState(db.settings.taxSeparation || false);
    
    // Delays
    const [delayLight, setDelayLight] = useState(db.settings.loadingDelays?.light?.toString() || '0.4');
    const [delayHeavy, setDelayHeavy] = useState(db.settings.loadingDelays?.heavy?.toString() || '1.2');

    const handleSave = async () => {
        const newDb = { ...db };
        const newRate = parseFloat(rateUSD);
        
        const oldRate = db.settings.exchangeRate.KRW_USD;
        if (oldRate !== newRate) {
             const history = newDb.settings.exchangeRateHistory || [];
             history.push({ date: new Date().toISOString(), rate: newRate });
             newDb.settings.exchangeRateHistory = history;
        }

        newDb.settings.exchangeRate.KRW_USD = newRate;
        newDb.settings.exchangeConfig = exConfig;
        newDb.settings.loanInterestRate = { periodWeeks: parseInt(loanWeeks), rate: parseFloat(loanRate) };
        
        // Save full savings config structure
        newDb.settings.savingsInterest = savingsConfig;
        
        newDb.settings.isFrozen = isFrozen;
        newDb.settings.signupRestricted = signupRestricted;
        newDb.settings.requireSignupApproval = requireApproval;
        newDb.settings.bypassPin = bypassPin;
        newDb.settings.transferLimit = parseInt(transferLimit);
        newDb.settings.transactionLimit = parseInt(txLimit);
        
        newDb.settings.taxSeparation = taxSeparation;
        
        newDb.settings.loadingDelays = {
            light: parseFloat(delayLight) || 0.4,
            heavy: parseFloat(delayHeavy) || 1.2
        };

        await saveDb(newDb);
        showModal('은행 설정이 저장되었습니다.');
    };

    const updateSavings = (type: 'regular'|'term'|'installment', field: 'rate'|'periodWeeks', val: string) => {
        setSavingsConfig(prev => ({
            ...prev,
            [type]: {
                ...prev[type],
                [field]: field === 'rate' ? parseFloat(val) : parseInt(val)
            }
        }));
    };

    return (
        <Card>
            <h3 className="text-2xl font-bold mb-6">은행 설정</h3>
            
            <div className="space-y-6 w-full">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4 rounded-lg flex justify-between items-center">
                        <div>
                            <h4 className="font-bold text-red-600 dark:text-red-400">금융 거래 동결</h4>
                            <p className="text-xs text-gray-500">모든 이체, 거래, 대출, 저금을 중단합니다.</p>
                        </div>
                        <Toggle checked={isFrozen} onChange={setIsFrozen} />
                    </div>

                    <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 p-4 rounded-lg flex justify-between items-center">
                        <div>
                            <h4 className="font-bold text-orange-600 dark:text-orange-400">회원가입 제한</h4>
                            <p className="text-xs text-gray-500">신규 가입을 막습니다.</p>
                        </div>
                        <Toggle checked={signupRestricted} onChange={setSignupRestricted} />
                    </div>

                    <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-4 rounded-lg flex justify-between items-center">
                        <div>
                            <h4 className="font-bold text-green-600 dark:text-green-400">회원가입 승인 필요</h4>
                            <p className="text-xs text-gray-500">가입 시 관리자의 승인이 필요합니다.</p>
                        </div>
                        <Toggle checked={requireApproval} onChange={setRequireApproval} />
                    </div>

                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-4 rounded-lg flex justify-between items-center">
                        <div>
                            <h4 className="font-bold text-blue-600 dark:text-blue-400">PIN 인증 강제 해제</h4>
                            <p className="text-xs text-gray-500">모든 PIN 인증을 건너뜁니다.</p>
                        </div>
                        <Toggle checked={bypassPin} onChange={setBypassPin} />
                    </div>

                    <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 p-4 rounded-lg flex justify-between items-center">
                        <div>
                            <h4 className="font-bold text-purple-600 dark:text-purple-400">세금 종류 분리 (재산세/자산세)</h4>
                            <p className="text-xs text-gray-500">부동산세(RealEstate)와 자산세(Asset)를 분리합니다.</p>
                        </div>
                        <Toggle checked={taxSeparation} onChange={setTaxSeparation} />
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg w-full border border-yellow-200">
                        <h4 className="font-bold mb-3 text-sm text-gray-500 uppercase">대출 조건 (Loan)</h4>
                        <div className="flex justify-between items-center mb-2 w-full">
                            <label className="font-medium">최대 기간/이자</label>
                            <div className="flex items-center gap-2 text-sm">
                                <Input type="number" value={loanWeeks} onChange={e => setLoanWeeks(e.target.value)} className="text-center w-16" />
                                <span>주 /</span>
                                <Input type="number" value={loanRate} onChange={e => setLoanRate(e.target.value)} className="text-center w-16" />
                                <span>%</span>
                            </div>
                        </div>
                        <p className="text-xs text-gray-500 text-center">최대 {loanWeeks}주 동안 {loanRate}% 이자</p>
                    </div>
                    
                    <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg w-full border border-blue-200">
                        <h4 className="font-bold mb-3 text-sm text-gray-500 uppercase">예금 조건 (Savings)</h4>
                        <div className="space-y-3">
                            <div className="flex justify-between items-center text-sm">
                                <label className="w-20 font-bold">보통예금</label>
                                <Input type="number" value={savingsConfig.regular.rate} onChange={e => updateSavings('regular', 'rate', e.target.value)} className="w-16 text-center py-1" />
                                <span>% (수시)</span>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                                <label className="w-20 font-bold">정기예금</label>
                                <Input type="number" value={savingsConfig.term.periodWeeks} onChange={e => updateSavings('term', 'periodWeeks', e.target.value)} className="w-12 text-center py-1" />
                                <span>주(최대) /</span>
                                <Input type="number" value={savingsConfig.term.rate} onChange={e => updateSavings('term', 'rate', e.target.value)} className="w-12 text-center py-1" />
                                <span>%</span>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                                <label className="w-20 font-bold">정기적금</label>
                                <Input type="number" value={savingsConfig.installment.periodWeeks} onChange={e => updateSavings('installment', 'periodWeeks', e.target.value)} className="w-12 text-center py-1" />
                                <span>주(최대) /</span>
                                <Input type="number" value={savingsConfig.installment.rate} onChange={e => updateSavings('installment', 'rate', e.target.value)} className="w-12 text-center py-1" />
                                <span>%</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg w-full">
                    <h4 className="font-bold mb-3 text-sm text-gray-500 uppercase">기본 제한 설정</h4>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="font-medium whitespace-nowrap text-xs block mb-1">1일 이체 한도 (KRW)</label>
                            <Input type="number" value={transferLimit} onChange={e => setTransferLimit(e.target.value)} className="w-full" />
                        </div>
                        <div>
                            <label className="font-medium whitespace-nowrap text-xs block mb-1">거래기록 로드 제한 (개수)</label>
                            <Input type="number" value={txLimit} onChange={e => setTxLimit(e.target.value)} className="w-full" placeholder="50" />
                        </div>
                    </div>
                </div>

                <Button className="w-full" onClick={handleSave}>설정 저장</Button>
            </div>
        </Card>
    );
};
