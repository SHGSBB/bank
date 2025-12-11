
import React, { useState, useMemo } from 'react';
import { useGame } from '../../context/GameContext';
import { Card, Button, Input, Modal } from '../Shared';
import { Transaction } from '../../types';

export const TransactionHistoryTab: React.FC = () => {
    const { currentUser } = useGame();
    // Default to 'list' as per user request
    const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
    
    // List View State
    const [startDate, setStartDate] = useState(
        new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    );
    const [endDate, setEndDate] = useState(
        new Date().toISOString().split('T')[0]
    );

    // Details Modal State
    const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);

    // Calendar State
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [calendarMonth, setCalendarMonth] = useState(new Date());

    const transactions = useMemo(() => {
        return currentUser?.transactions || [];
    }, [currentUser]);

    // Translations
    const typeLabels: Record<string, string> = {
        income: '수입',
        expense: '지출',
        transfer: '이체',
        exchange: '환전',
        tax: '세금',
        loan: '대출',
        savings: '예금',
        vat: '부가세',
        seize: '압수',
        auction: '경매',
        stock_buy: '주식 매수',
        stock_sell: '주식 매도',
        dividend: '배당금'
    };

    // Calendar Helper
    const daysInMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    const firstDayOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1).getDay();

    const handleMonthChange = (offset: number) => {
        setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + offset, 1));
    };

    const getDailyTransactions = (day: number) => {
        const year = calendarMonth.getFullYear();
        const month = calendarMonth.getMonth();
        return transactions.filter(tx => {
            const d = new Date(tx.date);
            return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day && tx.type !== 'exchange';
        });
    };

    const renderCalendar = () => {
        const days = daysInMonth(calendarMonth);
        const startDay = firstDayOfMonth(calendarMonth);
        const grid = [];

        // Empty slots
        for (let i = 0; i < startDay; i++) {
            grid.push(<div key={`empty-${i}`} className="h-24 bg-gray-50 dark:bg-[#1a1a1a] border border-gray-100 dark:border-[#333]"></div>);
        }

        for (let day = 1; day <= days; day++) {
            const dailyTx = getDailyTransactions(day);
            grid.push(
                <div 
                    key={day} 
                    onClick={() => { if(dailyTx.length > 0) setSelectedDate(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), day).toDateString()) }}
                    className={`h-24 p-1 border border-gray-100 dark:border-[#333] relative overflow-hidden transition-colors ${dailyTx.length > 0 ? 'cursor-pointer hover:bg-gray-100 dark:hover:bg-[#2D2D2D]' : 'bg-white dark:bg-[#1E1E1E]'}`}
                >
                    <span className="text-sm font-bold ml-1 text-gray-700 dark:text-gray-400">{day}</span>
                    <div className="flex flex-col gap-1 mt-1">
                        {dailyTx.slice(0, 3).map((tx, i) => (
                            <div key={i} className={`text-[10px] px-1 rounded truncate ${tx.amount > 0 ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' : 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'}`}>
                                {tx.description}
                            </div>
                        ))}
                        {dailyTx.length > 3 && <div className="text-[10px] text-gray-500 text-center">+ {dailyTx.length - 3}건 더보기</div>}
                    </div>
                </div>
            );
        }
        return grid;
    };

    const renderListView = () => {
        const start = new Date(startDate);
        const end = new Date(endDate);
        // Set end date to end of day
        end.setHours(23, 59, 59, 999);

        const filteredTx = transactions.filter(tx => {
            const d = new Date(tx.date);
            // Filter out 'exchange' type
            return d >= start && d <= end && tx.type !== 'exchange';
        }).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        // Calculate Totals
        const totalIncome = filteredTx.reduce((sum, tx) => sum + (tx.amount > 0 ? tx.amount : 0), 0);
        const totalExpense = filteredTx.reduce((sum, tx) => sum + (tx.amount < 0 ? tx.amount : 0), 0);
        const totalSum = totalIncome + totalExpense;

        return (
            <div className="space-y-3">
                <div className="flex gap-4 mb-4 items-end">
                    <div>
                        <label className="text-xs font-bold block mb-1">시작 날짜</label>
                        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="p-2 border rounded text-sm bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                    </div>
                    <div>
                        <label className="text-xs font-bold block mb-1">종료 날짜</label>
                        <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="p-2 border rounded text-sm bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                    </div>
                </div>

                <div className="p-4 bg-gray-50 dark:bg-[#2D2D2D] rounded-lg mb-4 flex justify-between items-center text-sm shadow-sm">
                    <div>
                        <span className="text-gray-500 dark:text-gray-400">기간 합계</span>
                    </div>
                    <div className="text-right">
                        <span className="block font-bold text-green-600">+ {totalIncome.toLocaleString()}</span>
                        <span className="block font-bold text-red-600">- {Math.abs(totalExpense).toLocaleString()}</span>
                        <div className="border-t dark:border-gray-600 mt-1 pt-1 font-bold text-lg">
                            {totalSum > 0 ? '+' : ''}{totalSum.toLocaleString()}
                        </div>
                    </div>
                </div>
                
                {filteredTx.length === 0 ? <p className="text-center text-gray-500 py-10">해당 기간의 거래 내역이 없습니다.</p> : 
                filteredTx.map(tx => (
                    <div 
                        key={tx.id} 
                        onClick={() => setSelectedTx(tx)}
                        className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-3 bg-white dark:bg-[#2D2D2D] rounded-lg shadow-sm cursor-pointer hover:bg-gray-50 dark:hover:bg-[#3D3D3D] transition-colors"
                    >
                        <div className="mb-2 sm:mb-0">
                            <div className="flex items-center gap-2">
                                <span className={`text-xs px-2 py-0.5 rounded font-bold ${tx.amount > 0 ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'}`}>
                                    {typeLabels[tx.type] || tx.type}
                                </span>
                                <span className="text-xs text-gray-400">
                                    {new Date(tx.date).toLocaleDateString()} {new Date(tx.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                </span>
                            </div>
                            <p className="font-bold mt-1 text-gray-800 dark:text-gray-200">{tx.description}</p>
                        </div>
                        <p className={`font-bold text-lg ${tx.amount > 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {tx.amount > 0 ? '+' : ''}
                            {tx.currency === 'KRW' ? '₩' : '$'}
                            {Math.abs(tx.amount).toLocaleString()}
                        </p>
                    </div>
                ))}
            </div>
        );
    };

    return (
        <div className="w-full space-y-6">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-2xl font-bold">거래 내역</h3>
                <div className="flex bg-gray-200 dark:bg-gray-700 rounded-lg p-1">
                    <button onClick={() => setViewMode('list')} className={`px-4 py-1 rounded-md text-sm font-medium transition-all ${viewMode === 'list' ? 'bg-white dark:bg-[#2D2D2D] shadow text-green-600' : 'text-gray-500'}`}>목록</button>
                    <button onClick={() => setViewMode('calendar')} className={`px-4 py-1 rounded-md text-sm font-medium transition-all ${viewMode === 'calendar' ? 'bg-white dark:bg-[#2D2D2D] shadow text-green-600' : 'text-gray-500'}`}>달력</button>
                </div>
            </div>
            
            <Card>
                {viewMode === 'calendar' ? (
                    <div>
                        <div className="flex justify-between items-center mb-4">
                            <button onClick={() => handleMonthChange(-1)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full">&lt;</button>
                            <h4 className="text-lg font-bold">{calendarMonth.getFullYear()}년 {calendarMonth.getMonth() + 1}월</h4>
                            <button onClick={() => handleMonthChange(1)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full">&gt;</button>
                        </div>
                        <div className="grid grid-cols-7 gap-px bg-gray-200 dark:bg-[#333] border border-gray-200 dark:border-[#333] rounded-lg overflow-hidden">
                            {['일','월','화','수','목','금','토'].map(d => (
                                <div key={d} className="bg-gray-50 dark:bg-[#2D2D2D] p-2 text-center text-xs font-bold text-gray-600 dark:text-gray-400">{d}</div>
                            ))}
                            {renderCalendar()}
                        </div>
                    </div>
                ) : (
                    renderListView()
                )}
            </Card>

            {/* Daily Detail Modal */}
            <Modal isOpen={!!selectedDate} onClose={() => setSelectedDate(null)} title={`${selectedDate} 거래 상세`}>
                <div className="space-y-3">
                    {selectedDate && transactions.filter(t => new Date(t.date).toDateString() === new Date(selectedDate).toDateString() && t.type !== 'exchange').map(tx => (
                        <div key={tx.id} className="flex justify-between items-center p-3 bg-gray-50 dark:bg-[#2D2D2D] rounded-lg shadow-sm">
                             <div>
                                <p className="font-bold">{tx.description}</p>
                                <span className={`text-xs px-2 py-0.5 rounded ml-[-2px] mt-1 inline-block bg-gray-200 dark:bg-gray-600`}>{typeLabels[tx.type] || tx.type}</span>
                            </div>
                            <p className={`font-bold text-lg ${tx.amount > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {tx.amount > 0 ? '+' : ''}
                                {tx.currency === 'KRW' ? '₩' : '$'}
                                {Math.abs(tx.amount).toLocaleString()}
                            </p>
                        </div>
                    ))}
                    {selectedDate && transactions.filter(t => new Date(t.date).toDateString() === new Date(selectedDate).toDateString() && t.type !== 'exchange').length === 0 && (
                        <p className="text-center text-gray-500">거래 내역이 없습니다.</p>
                    )}
                </div>
            </Modal>

            {/* Transaction Detail Modal */}
            <Modal isOpen={!!selectedTx} onClose={() => setSelectedTx(null)} title="거래 상세 정보">
                {selectedTx && (
                    <div className="space-y-4">
                        <div className="text-center p-4 bg-gray-50 dark:bg-[#2D2D2D] rounded-xl">
                            <p className="text-sm text-gray-500 mb-1">{typeLabels[selectedTx.type]}</p>
                            <p className={`text-3xl font-bold ${selectedTx.amount > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {selectedTx.amount > 0 ? '+' : ''}
                                {selectedTx.currency === 'KRW' ? '₩' : '$'}
                                {Math.abs(selectedTx.amount).toLocaleString()}
                            </p>
                        </div>
                        <div className="space-y-2 text-sm text-gray-600 dark:text-gray-300">
                            <div className="flex justify-between border-b dark:border-gray-700 pb-2">
                                <span>내용</span>
                                <span className="font-bold">{selectedTx.description}</span>
                            </div>
                            <div className="flex justify-between border-b dark:border-gray-700 pb-2">
                                <span>거래 일시</span>
                                <span>{new Date(selectedTx.date).toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between border-b dark:border-gray-700 pb-2">
                                <span>거래 ID</span>
                                <span className="text-xs font-mono">{selectedTx.id}</span>
                            </div>
                        </div>
                        <Button onClick={() => setSelectedTx(null)} className="w-full">닫기</Button>
                    </div>
                )}
            </Modal>
        </div>
    );
};
