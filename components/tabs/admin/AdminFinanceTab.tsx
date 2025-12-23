
import React, { useState } from 'react';
import { MintingTab } from './MintingTab';
import { TaxTab } from './TaxTab';
import { WeeklyPayTab } from './WeeklyPayTab';
import { WelfareTab } from './WelfareTab';
import { SupportFundTab } from './SupportFundTab';
import { BondIssuanceTab } from './BondIssuanceTab';
import { AdminStockTab } from './AdminStockTab';
import { BudgetDistributionTab } from './BudgetDistributionTab';
import { AdminRealEstateTab } from './AdminRealEstateTab';
import { BusinessManagementTab } from './BusinessManagementTab';

export const AdminFinanceTab: React.FC<{ restricted?: boolean }> = ({ restricted }) => {
    const [subTab, setSubTab] = useState('발권');
    
    // Updated tabs list
    const tabs = ['발권', '세금징수', '주급지급', '복지', '지원금 지급', '국채발행', '사업자관리(광고)', '주식관리', '부동산관리', '예산지급']
        .filter(t => !restricted || (t !== '발권' && t !== '예산지급'));

    return (
        <div className="w-full">
            <div className="flex overflow-x-auto gap-6 mb-6 scrollbar-hide border-b border-gray-800">
                {tabs.map(t => (
                    <button 
                        key={t} 
                        onClick={() => setSubTab(t)} 
                        className={`whitespace-nowrap pb-3 text-xs font-bold transition-all border-b-2 ${subTab === t ? 'border-green-500 text-green-500' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
                    >
                        {t}
                    </button>
                ))}
            </div>
            <div className="animate-fade-in bg-[#1C1C1E] rounded-[28px] p-6 border border-gray-800">
                {subTab === '발권' && <MintingTab />}
                {subTab === '세금징수' && <TaxTab />}
                {subTab === '주급지급' && <WeeklyPayTab />}
                {subTab === '복지' && <WelfareTab />}
                {subTab === '지원금 지급' && <SupportFundTab />}
                {subTab === '국채발행' && <BondIssuanceTab />}
                {subTab === '사업자관리(광고)' && <BusinessManagementTab />}
                {subTab === '주식관리' && <AdminStockTab />}
                {subTab === '예산지급' && <BudgetDistributionTab />}
                {subTab === '부동산관리' && <AdminRealEstateTab />}
            </div>
        </div>
    );
};
