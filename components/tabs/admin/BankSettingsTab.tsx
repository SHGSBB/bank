
import React, { useState } from 'react';
import { useGame } from '../../../context/GameContext';
import { Card, Button, Input, Toggle } from '../../Shared';

export const BankSettingsTab: React.FC = () => {
    const { db, saveDb, showModal } = useGame();
    
    // Core Settings with safety checks
    const [rateUSD, setRateUSD] = useState(db.settings?.exchangeRate?.KRW_USD?.toString() || '1350');
    const [isFrozen, setIsFrozen] = useState(db.settings?.isFrozen || false);
    const [signupRestricted, setSignupRestricted] = useState(db.settings?.signupRestricted || false);
    const [requireApproval, setRequireApproval] = useState(db.settings?.requireSignupApproval !== false);
    const [bypassPin, setBypassPin] = useState(db.settings?.bypassPin || false);
    const [taxSeparation, setTaxSeparation] = useState(db.settings?.taxSeparation || false);
    const [transferLimit, setTransferLimit] = useState(db.settings?.transferLimit?.toString() || '1000000');

    // Minting Control
    const [krwMintDisabled, setKrwMintDisabled] = useState(db.settings?.mintingRestriction?.krwDisabled || false);
    const [usdMintDisabled, setUsdMintDisabled] = useState(db.settings?.mintingRestriction?.usdDisabled || false);

    // Stock Settings
    const [stockModeOriginal, setStockModeOriginal] = useState(db.settings.stockMarket?.mode === 'original');

    // Interest Rates
    const [loanRate, setLoanRate] = useState(db.settings?.loanInterestRate?.rate?.toString() || '5');
    const [loanWeeks, setLoanWeeks] = useState(db.settings?.loanInterestRate?.periodWeeks?.toString() || '4');
    
    const [savRegRate, setSavRegRate] = useState(db.settings?.savingsInterest?.regular?.rate?.toString() || '1');
    const [savTermRate, setSavTermRate] = useState(db.settings?.savingsInterest?.term?.rate?.toString() || '3');
    const [savTermWeeks, setSavTermWeeks] = useState(db.settings?.savingsInterest?.term?.periodWeeks?.toString() || '4');
    const [savInstRate, setSavInstRate] = useState(db.settings?.savingsInterest?.installment?.rate?.toString() || '5');
    const [savInstWeeks, setSavInstWeeks] = useState(db.settings?.savingsInterest?.installment?.periodWeeks?.toString() || '8');

    const handleSave = async () => {
        const newDb = { ...db };
        
        if (!newDb.settings) newDb.settings = {} as any;
        if (!newDb.settings.exchangeRate) newDb.settings.exchangeRate = { KRW_USD: 1350 };
        
        newDb.settings.exchangeRate.KRW_USD = parseFloat(rateUSD) || 1350;
        newDb.settings.isFrozen = isFrozen;
        newDb.settings.signupRestricted = signupRestricted;
        newDb.settings.requireSignupApproval = requireApproval;
        newDb.settings.bypassPin = bypassPin;
        newDb.settings.taxSeparation = taxSeparation;
        newDb.settings.transferLimit = parseInt(transferLimit) || 1000000;
        newDb.settings.mintingRestriction = { krwDisabled: krwMintDisabled, usdDisabled: usdMintDisabled };

        if (!newDb.settings.stockMarket) newDb.settings.stockMarket = { isOpen: true, openTime: "09:00", closeTime: "15:30", isManualOverride: false, sungSpiEnabled: true, sungSpiBasePoint: 1000 };
        newDb.settings.stockMarket.mode = stockModeOriginal ? 'original' : 'simple';

        newDb.settings.loanInterestRate = { rate: parseFloat(loanRate) || 5, periodWeeks: parseInt(loanWeeks) || 4 };
        newDb.settings.savingsInterest = {
            regular: { rate: parseFloat(savRegRate) || 1, periodWeeks: 0 },
            term: { rate: parseFloat(savTermRate) || 3, periodWeeks: parseInt(savTermWeeks) || 4 },
            installment: { rate: parseFloat(savInstRate) || 5, periodWeeks: parseInt(savInstWeeks) || 8 }
        };

        await saveDb(newDb);
        showModal('은행 통합 운영 설정이 저장되었습니다.');
    };

    return (
        <Card className="space-y-8">
            <h3 className="text-2xl font-bold mb-6">한국은행 통합 제어</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-xl border flex justify-between items-center">
                    <div><h4 className="font-bold text-red-600">금융 거래 동결</h4><p className="text-[10px] opacity-50">모든 이체/환전/결제 중단</p></div>
                    <Toggle checked={isFrozen} onChange={setIsFrozen} />
                </div>
                <div className="p-4 bg-orange-50 dark:bg-orange-900/20 rounded-xl border flex justify-between items-center">
                    <div><h4 className="font-bold text-orange-600">회원가입 제한</h4><p className="text-[10px] opacity-50">신규 계정 생성 차단</p></div>
                    <Toggle checked={signupRestricted} onChange={setSignupRestricted} />
                </div>
                <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-xl border flex justify-between items-center">
                    <div><h4 className="font-bold text-green-600">회원가입 인증제</h4><p className="text-[10px] opacity-50">관리자 승인 후 로그인 허용</p></div>
                    <Toggle checked={requireApproval} onChange={setRequireApproval} />
                </div>
                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border flex justify-between items-center">
                    <div><h4 className="font-bold text-blue-600">PIN 인증 강제 해제</h4><p className="text-[10px] opacity-50">중요 작업 시 PIN 입력 생략</p></div>
                    <Toggle checked={bypassPin} onChange={setBypassPin} />
                </div>
                <div className="p-4 bg-gray-100 dark:bg-gray-800 rounded-xl border flex justify-between items-center">
                    <div><h4 className="font-bold">주식 시장 오리지널 모드</h4><p className="text-[10px] opacity-50">호가창 기반 실시간 매칭 체결</p></div>
                    <Toggle checked={stockModeOriginal} onChange={setStockModeOriginal} />
                </div>
            </div>

            <div className="space-y-4">
                <h4 className="font-bold border-b pb-2">기본 경제 설정</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className="text-xs font-bold block mb-1">KRW/USD 환율</label>
                        <Input type="number" value={rateUSD} onChange={e => setRateUSD(e.target.value)} />
                    </div>
                    <div>
                        <label className="text-xs font-bold block mb-1">1일 이체 한도 (₩)</label>
                        <Input type="number" value={transferLimit} onChange={e => setTransferLimit(e.target.value)} />
                    </div>
                </div>
            </div>

            <div className="space-y-4">
                <h4 className="font-bold border-b pb-2 text-red-600">대출 이자율 (Loan Rates)</h4>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="text-xs font-bold block mb-1">이자율 (%)</label>
                        <Input type="number" value={loanRate} onChange={e => setLoanRate(e.target.value)} />
                    </div>
                    <div>
                        <label className="text-xs font-bold block mb-1">기준 기간 (주)</label>
                        <Input type="number" value={loanWeeks} onChange={e => setLoanWeeks(e.target.value)} />
                    </div>
                </div>
            </div>

            <div className="space-y-4">
                <h4 className="font-bold border-b pb-2 text-blue-600">저금 이자율 (Savings Rates)</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Card className="p-4 bg-gray-50 dark:bg-gray-800">
                        <p className="text-sm font-bold mb-2 underline">보통예금</p>
                        <label className="text-[10px] block mb-1">연 이자율 (%)</label>
                        <Input type="number" value={savRegRate} onChange={e => setSavRegRate(e.target.value)} />
                    </Card>
                    <Card className="p-4 bg-gray-50 dark:bg-gray-800">
                        <p className="text-sm font-bold mb-2 underline">정기예금</p>
                        <div className="flex gap-2">
                            <div className="flex-1">
                                <label className="text-[10px] block mb-1">이자율 (%)</label>
                                <Input type="number" value={savTermRate} onChange={e => setSavTermRate(e.target.value)} />
                            </div>
                            <div className="flex-1">
                                <label className="text-[10px] block mb-1">기간(주)</label>
                                <Input type="number" value={savTermWeeks} onChange={e => setSavTermWeeks(e.target.value)} />
                            </div>
                        </div>
                    </Card>
                    <Card className="p-4 bg-gray-50 dark:bg-gray-800">
                        <p className="text-sm font-bold mb-2 underline">정기적금</p>
                        <div className="flex gap-2">
                            <div className="flex-1">
                                <label className="text-[10px] block mb-1">이자율 (%)</label>
                                <Input type="number" value={savInstRate} onChange={e => setSavInstRate(e.target.value)} />
                            </div>
                            <div className="flex-1">
                                <label className="text-[10px] block mb-1">기간(주)</label>
                                <Input type="number" value={savInstWeeks} onChange={e => setSavInstWeeks(e.target.value)} />
                            </div>
                        </div>
                    </Card>
                </div>
            </div>

            <Button className="w-full py-4 text-lg" onClick={handleSave}>설정 저장 및 즉시 적용</Button>
        </Card>
    );
};
