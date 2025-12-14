
import React, { useState } from 'react';
import { MintingTab } from './MintingTab';
import { TaxTab } from './TaxTab';
import { WeeklyPayTab } from './WeeklyPayTab';
import { WelfareTab } from './WelfareTab';
import { SupportFundTab } from './SupportFundTab';
import { BondIssuanceTab } from './BondIssuanceTab';
import { AdminStockTab } from './AdminStockTab';
import { BudgetDistributionTab } from './BudgetDistributionTab';

export const AdminFinanceTab: React.FC<{ restricted?: boolean }> = ({ restricted }) => {
    // If restricted (President), default to '세금징수' instead of '발권'
    const [subTab, setSubTab] = useState(restricted ? '세금징수' : '발권');
    
    // Remove '발권' (Minting) and '예산지급' if restricted
    const tabs = ['발권', '예산지급', '세금징수', '주급지급', '복지', '지원금 지급', '국채발행', '주식관리'].filter(t => !restricted || (t !== '발권' && t !== '예산지급'));

    return (
        <div className="w-full">
            <div className="flex overflow-x-auto gap-2 mb-6 scrollbar-hide border-b border-gray-200 dark:border-gray-700">
                {tabs.map(t => (
                    <button key={t} onClick={() => setSubTab(t)} className={`whitespace-nowrap px-4 py-2 text-sm font-medium transition-colors border-b-[3px] ${subTab === t ? 'border-green-500 text-green-600 dark:text-green-400' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>{t}</button>
                ))}
            </div>
            {subTab === '발권' && !restricted && <MintingTab />}
            {subTab === '예산지급' && !restricted && <BudgetDistributionTab />}
            {subTab === '세금징수' && <TaxTab />}
            {subTab === '주급지급' && <WeeklyPayTab />}
            {subTab === '복지' && <WelfareTab />}
            {subTab === '지원금 지급' && <SupportFundTab />}
            {subTab === '국채발행' && <BondIssuanceTab />}
            {subTab === '주식관리' && <AdminStockTab />}
        </div>
    );
};
