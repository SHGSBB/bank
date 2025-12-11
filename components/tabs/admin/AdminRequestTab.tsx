
import React, { useMemo, useState } from 'react';
import { LoanManagementTab } from './LoanManagementTab';
import { SavingsManagementTab } from './SavingsManagementTab';
import { useGame } from '../../../context/GameContext';
import { Card } from '../../Shared';
import { Loan, TermDeposit, User } from '../../../types';

const AdminSummary: React.FC = () => {
    const { db } = useGame();

    const summary = useMemo(() => {
        const allUsers = Object.values(db.users) as User[];
        const allDeposits = Object.values(db.termDeposits || {}) as TermDeposit[];
        
        let totalLoanPrincipal = 0;
        let totalLoanRepayment = 0;
        let activeLoanCount = 0;

        allUsers.forEach(user => {
            const userLoans = user.loans ? (Array.isArray(user.loans) ? user.loans : Object.values(user.loans)) : [];
            userLoans.forEach((loan: Loan) => {
                if (loan.status === 'approved') {
                    totalLoanPrincipal += loan.amount;
                    totalLoanRepayment += Math.floor(loan.amount * (1 + loan.interestRate.rate / 100));
                    activeLoanCount++;
                }
            });
        });

        const activeDeposits = allDeposits.filter(d => d.status === 'active');
        const totalSavingsPrincipal = activeDeposits.reduce((sum, d) => sum + d.amount, 0);
        const totalSavingsPayout = activeDeposits.reduce((sum, d) => sum + (d.amount * (1 + d.interestRate / 100)), 0);

        return {
            totalLoanPrincipal,
            totalLoanRepayment,
            activeLoanCount,
            totalSavingsPrincipal,
            totalSavingsPayout,
            activeSavingsCount: activeDeposits.length
        };

    }, [db]);

    return (
        <Card className="mb-6 bg-gray-50 dark:bg-gray-800">
            <h3 className="text-xl font-bold mb-4 border-b pb-2">은행 총괄 현황</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
                    <h4 className="font-bold text-red-700 dark:text-red-300">총 대출 현황 ({summary.activeLoanCount}건)</h4>
                    <p className="text-sm">총 대출 원금: <span className="font-bold">₩{summary.totalLoanPrincipal.toLocaleString()}</span></p>
                    <p className="text-sm">예상 총 상환액: <span className="font-bold">₩{summary.totalLoanRepayment.toLocaleString()}</span></p>
                </div>
                <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                    <h4 className="font-bold text-green-700 dark:text-green-300">총 예금 현황 ({summary.activeSavingsCount}건)</h4>
                    <p className="text-sm">총 예금 원금: <span className="font-bold">₩{summary.totalSavingsPrincipal.toLocaleString()}</span></p>
                    <p className="text-sm">예상 총 지급액: <span className="font-bold">₩{Math.floor(summary.totalSavingsPayout).toLocaleString()}</span></p>
                </div>
            </div>
        </Card>
    );
}


export const AdminRequestTab: React.FC = () => {
    // FIX: Added useState import to resolve 'Cannot find name useState' error.
    const [subTab, setSubTab] = useState('대출관리');
    const tabs = ['대출관리', '저금관리'];

    return (
        <div className="w-full">
            <AdminSummary />
             <div className="flex gap-2 mb-6 border-b border-gray-200 dark:border-gray-700">
                {tabs.map(t => (
                    <button key={t} onClick={() => setSubTab(t)} className={`px-4 py-2 text-sm font-medium transition-colors border-b-[3px] ${subTab === t ? 'border-green-500 text-green-600 dark:text-green-400' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>{t}</button>
                ))}
            </div>
            {subTab === '대출관리' && <LoanManagementTab />}
            {subTab === '저금관리' && <SavingsManagementTab />}
        </div>
    );
};
