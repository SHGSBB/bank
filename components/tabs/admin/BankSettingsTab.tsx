import React, { useState } from 'react';
import { useGame } from '../../../context/GameContext';
import { Card, Button, Input, Toggle } from '../../Shared';
import { ExchangeConfig } from '../../../types';

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
    const [savingsWeeks, setSavingsWeeks] = useState(db.settings.savingsInterest.periodWeeks.toString());
    const [savingsRate, setSavingsRate] = useState(db.settings.savingsInterest.rate.toString());
    
    const [isFrozen, setIsFrozen] = useState(db.settings.isFrozen || false);
    const [signupRestricted, setSignupRestricted] = useState(db.settings.signupRestricted || false);
    const [bypassPin, setBypassPin] = useState(db.settings.bypassPin || false);
    const [transferLimit, setTransferLimit] = useState(db.settings.transferLimit?.toString() || '1000000');
    
    const [taxSeparation, setTaxSeparation] = useState(db.settings.taxSeparation || false);
    
    // Delays
    const [delayLight, setDelayLight] = useState(db.settings.loadingDelays?.light?.toString() || '0.4');
    const [delayHeavy, setDelayHeavy] = useState(db.settings.loadingDelays?.heavy?.toString() || '1.2');

    // Locking Features
    const features = ['이체', '구매', '환전', '저금', '대출', '부동산', '물품관리'];
    const [lockedFeatures, setLockedFeatures] = useState<Record<string, boolean>>(db.settings.lockedFeatures || {});

    const handleLockToggle = (feature: string) => {
        setLockedFeatures(prev => ({ ...prev, [feature]: !prev[feature] }));
    };

    const handleSave = async () => {
        const newDb = { ...db };
        const newRate = parseFloat(rateUSD);
        
        // Push History if changed
        const oldRate = db.settings.exchangeRate.KRW_USD;
        if (oldRate !== newRate) {
             const history = newDb.settings.exchangeRateHistory || [];
             history.push({ date: new Date().toISOString(), rate: newRate });
             newDb.settings.exchangeRateHistory = history;
        }

        // Sync legacy rate
        newDb.settings.exchangeRate.KRW_USD = newRate;

        // Sync Config
        newDb.settings.exchangeConfig = exConfig;

        // Save Loan/Savings directly (No Policy Request)
        newDb.settings.loanInterestRate = { periodWeeks: parseInt(loanWeeks), rate: parseFloat(loanRate) };
        newDb.settings.savingsInterest = { periodWeeks: parseInt(savingsWeeks), rate: parseFloat(savingsRate) };
        
        newDb.settings.isFrozen = isFrozen;
        newDb.settings.signupRestricted = signupRestricted;
        newDb.settings.bypassPin = bypassPin;
        newDb.settings.transferLimit = parseInt(transferLimit);
        newDb.settings.lockedFeatures = lockedFeatures;
        
        newDb.settings.taxSeparation = taxSeparation;
        
        newDb.settings.loadingDelays = {
            light: parseFloat(delayLight) || 0.4,
            heavy: parseFloat(delayHeavy) || 1.2
        };

        await saveDb(newDb);
        showModal('은행 설정이 저장되었습니다.');
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
                            <p className="text-xs text-gray-500">부동산세(RealEstate)와 자산세(Asset: 현금+금융)를 분리합니다.</p>
                        </div>
                        <Toggle checked={taxSeparation} onChange={setTaxSeparation} />
                    </div>
                </div>

                {/* Exchange Config */}
                <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg w-full border border-gray-200 dark:border-gray-700">
                    <h4 className="font-bold mb-3 text-sm text-gray-500 uppercase">환전 설정</h4>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div>
                            <label className="text-sm font-bold mb-1 block">환율 (1 단위 기준)</label>
                            <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                    <span className="text-xs w-16">USD → KRW</span>
                                    <Input type="number" value={rateUSD} onChange={e => { setRateUSD(e.target.value); setExConfig({...exConfig, rates: {...exConfig.rates, KRW_USD: parseFloat(e.target.value)}}); }} className="py-1 text-sm"/>
                                </div>
                            </div>
                        </div>

                        <div>
                            <label className="text-sm font-bold mb-1 block">환전 허용 (Check to Allow)</label>
                            <div className="space-y-2">
                                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={exConfig.pairs.KRW_USD} onChange={e => setExConfig({...exConfig, pairs: {...exConfig.pairs, KRW_USD: e.target.checked}})} /> 원화 ↔ 달러</label>
                            </div>
                        </div>
                    </div>

                    <div className="border-t pt-4">
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-sm font-bold">자동 환전 중지 (보유량 부족 시)</span>
                            <Toggle checked={exConfig.isAutoStopEnabled || false} onChange={v => setExConfig({...exConfig, isAutoStopEnabled: v})} />
                        </div>
                        {exConfig.isAutoStopEnabled && (
                            <div className="flex gap-4 mb-2">
                                <div className="flex-1">
                                    <label className="text-xs">Min USD</label>
                                    <Input type="number" value={exConfig.autoStopThresholdUSD} onChange={e => setExConfig({...exConfig, autoStopThresholdUSD: parseInt(e.target.value)})} className="py-1" />
                                </div>
                            </div>
                        )}
                        <div className="flex gap-4">
                            <div className="flex-1">
                                <label className="text-xs font-bold block mb-1">자동 발권 상한선 (Auto Mint Limit)</label>
                                <Input type="number" value={exConfig.autoMintLimit} onChange={e => setExConfig({...exConfig, autoMintLimit: parseInt(e.target.value)})} className="py-1" placeholder="제한 없음" />
                                <p className="text-[10px] text-gray-500 mt-1">은행 잔고 부족 시 자동 발권하여 충당할 최대 금액</p>
                            </div>
                        </div>
                    </div>
                </div>


                <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg w-full">
                    <h4 className="font-bold mb-3 text-sm text-gray-500 uppercase">기본 제한 설정</h4>
                    <div className="flex items-center gap-4">
                        <label className="font-medium whitespace-nowrap">1일 이체 한도 (KRW)</label>
                        <Input type="number" value={transferLimit} onChange={e => setTransferLimit(e.target.value)} className="w-full" />
                    </div>
                </div>
                
                <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg w-full">
                    <h4 className="font-bold mb-3 text-sm text-gray-500 uppercase">시스템 처리 속도 (Simulated Delay)</h4>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs font-bold block mb-1">가벼운 작업 (초)</label>
                            <Input type="number" value={delayLight} onChange={e => setDelayLight(e.target.value)} step="0.1" className="w-full" />
                        </div>
                        <div>
                            <label className="text-xs font-bold block mb-1">무거운 작업 (초)</label>
                            <Input type="number" value={delayHeavy} onChange={e => setDelayHeavy(e.target.value)} step="0.1" className="w-full" />
                        </div>
                    </div>
                </div>

                <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg w-full">
                    <h4 className="font-bold mb-3 text-sm text-gray-500 uppercase">기능 잠금 (개별 탭 비활성화)</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {features.map(f => (
                            <label key={f} className="flex items-center gap-2 cursor-pointer bg-white dark:bg-[#1E1E1E] p-2 rounded border border-gray-200 dark:border-gray-700">
                                <input type="checkbox" checked={!!lockedFeatures[f]} onChange={() => handleLockToggle(f)} className="accent-red-500 w-4 h-4" />
                                <span className={lockedFeatures[f] ? 'text-red-500 font-bold' : ''}>{f}</span>
                            </label>
                        ))}
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg w-full border border-yellow-200">
                        <h4 className="font-bold mb-3 text-sm text-gray-500 uppercase">대출 설정</h4>
                        <div className="flex justify-between items-center mb-2 w-full">
                            <label className="font-medium">기간/이자</label>
                            <div className="flex items-center gap-2 text-sm">
                                <Input type="number" value={loanWeeks} onChange={e => setLoanWeeks(e.target.value)} className="text-center w-16" />
                                <span>주마다</span>
                                <Input type="number" value={loanRate} onChange={e => setLoanRate(e.target.value)} className="text-center w-16" />
                                <span>%</span>
                            </div>
                        </div>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg w-full border border-yellow-200">
                        <h4 className="font-bold mb-3 text-sm text-gray-500 uppercase">예금 설정</h4>
                        <div className="flex justify-between items-center mb-2 w-full">
                            <label className="font-medium">기간/이자</label>
                            <div className="flex items-center gap-2 text-sm">
                                <Input type="number" value={savingsWeeks} onChange={e => setSavingsWeeks(e.target.value)} className="text-center w-16" />
                                <span>주마다</span>
                                <Input type="number" value={savingsRate} onChange={e => setSavingsRate(e.target.value)} className="text-center w-16" />
                                <span>%</span>
                            </div>
                        </div>
                    </div>
                </div>

                <Button className="w-full" onClick={handleSave}>설정 저장</Button>
            </div>
        </Card>
    );
};