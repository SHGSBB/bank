
import React, { useState, useMemo, useEffect } from 'react';
import { useGame } from '../../context/GameContext';
import { Card, Button, Input, Modal, MoneyInput, Spinner } from '../Shared';
import { Transaction, LedgerItem } from '../../types';
import { generateId } from '../../services/firebase';

export const TransactionHistoryTab: React.FC = () => {
    const { currentUser, updateUser, serverAction } = useGame();
    const [activeTab, setActiveTab] = useState<'history' | 'ledger'>('history');
    
    // Ledger View Mode
    const [calendarMonth, setCalendarMonth] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState<string | null>(null); // YYYY-MM-DD
    
    // Ledger Input
    const [ledgerType, setLedgerType] = useState<'income' | 'expense'>('expense');
    const [ledgerCategory, setLedgerCategory] = useState('');
    const [ledgerDesc, setLedgerDesc] = useState('');
    const [ledgerAmount, setLedgerAmount] = useState('');
    const [isScheduled, setIsScheduled] = useState(false);

    // List View Filters
    const [startDate, setStartDate] = useState(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
    const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
    const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
    
    // Transaction Data from Server
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [isLoadingTx, setIsLoadingTx] = useState(false);

    useEffect(() => {
        const fetchTx = async () => {
            if (!currentUser) return;
            setIsLoadingTx(true);
            try {
                const res = await serverAction('fetch_my_transactions', { userId: currentUser.id || currentUser.email, limit: 100 });
                if (res && res.transactions) {
                    setTransactions(res.transactions);
                }
            } catch(e) {
                console.error("Failed to load transactions", e);
            } finally {
                setIsLoadingTx(false);
            }
        };
        if (activeTab === 'history') fetchTx();
    }, [currentUser, activeTab]);

    const ledgerItems = useMemo(() => Object.values(currentUser?.ledger || {}), [currentUser]);

    const typeLabels: Record<string, string> = {
        income: '수입', expense: '지출', transfer: '이체', exchange: '환전', tax: '세금', 
        loan: '대출', savings: '예금', vat: '부가세', seize: '압수', auction: '경매', 
        stock_buy: '주식 매수', stock_sell: '주식 매도', dividend: '배당금', fine: '과태료', cashback: '캐시백'
    };

    // Calendar Helpers
    const daysInMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    const firstDayOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1).getDay();
    
    const handleMonthChange = (offset: number) => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + offset, 1));

    const getDailyItems = (day: number) => {
        const year = calendarMonth.getFullYear();
        const month = calendarMonth.getMonth();
        const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        return ledgerItems.filter(l => l.date === dateStr);
    };

    const handleAddLedgerItem = async () => {
        if (!selectedDate || !ledgerCategory || !ledgerDesc || !ledgerAmount) return alert("모든 정보를 입력하세요.");
        const amount = parseInt(ledgerAmount);
        if (isNaN(amount)) return alert("올바른 금액을 입력하세요.");

        const newItem: LedgerItem = {
            id: generateId(),
            date: selectedDate,
            type: ledgerType,
            category: ledgerCategory,
            description: ledgerDesc,
            amount: amount,
            isScheduled: isScheduled
        };

        const newLedger = { ...(currentUser?.ledger || {}), [newItem.id]: newItem };
        await updateUser(currentUser!.name, { ledger: newLedger });
        
        setLedgerCategory(''); setLedgerDesc(''); setLedgerAmount(''); setIsScheduled(false);
    };

    const renderCalendar = () => {
        const days = daysInMonth(calendarMonth);
        const startDay = firstDayOfMonth(calendarMonth);
        const grid = [];

        for (let i = 0; i < startDay; i++) grid.push(<div key={`empty-${i}`} className="h-24 bg-transparent"></div>);

        for (let day = 1; day <= days; day++) {
            const items = getDailyItems(day);
            const dateStr = `${calendarMonth.getFullYear()}-${String(calendarMonth.getMonth()+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
            const income = items.filter(i => i.type === 'income').reduce((s, i) => s + i.amount, 0);
            const expense = items.filter(i => i.type === 'expense').reduce((s, i) => s + i.amount, 0);

            grid.push(
                <div 
                    key={day} 
                    onClick={() => setSelectedDate(dateStr)}
                    className={`h-24 p-2 border border-gray-100 dark:border-gray-800 relative cursor-pointer hover:scale-105 transition-transform bg-white dark:bg-[#1E1E1E] rounded-3xl shadow-sm flex flex-col justify-between`}
                >
                    <span className="text-xs font-bold text-gray-700 dark:text-gray-400 ml-1 mt-1">{day}</span>
                    <div className="flex flex-col gap-0.5 text-[9px] text-right">
                        {income > 0 && <span className="text-blue-500 font-bold">+{income.toLocaleString()}</span>}
                        {expense > 0 && <span className="text-red-500 font-bold">-{expense.toLocaleString()}</span>}
                    </div>
                </div>
            );
        }
        return grid;
    };

    const renderHistoryList = () => {
        if (isLoadingTx) return <Spinner />;

        const start = new Date(startDate);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);

        const filtered = transactions.filter(tx => {
            const d = new Date(tx.date);
            return d >= start && d <= end && tx.type !== 'exchange';
        }).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        if (filtered.length === 0) {
            return (
                <div className="text-center py-10 text-gray-500">
                    <p className="mb-2">표시할 거래 내역이 없습니다.</p>
                    <div className="flex justify-center gap-2 mt-4">
                        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="p-2 border rounded text-xs" />
                        <span className="self-center">~</span>
                        <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="p-2 border rounded text-xs" />
                    </div>
                </div>
            );
        }

        return (
            <div className="space-y-2">
                <div className="flex gap-2 mb-4 justify-end items-center">
                    <span className="text-xs text-gray-500">조회 기간:</span>
                    <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="p-2 border rounded text-xs" />
                    <span className="text-xs">~</span>
                    <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="p-2 border rounded text-xs" />
                </div>
                {filtered.map(tx => (
                    <div key={tx.id} onClick={() => setSelectedTx(tx)} className="flex justify-between items-center p-3 bg-white dark:bg-[#2D2D2D] rounded-2xl shadow-sm cursor-pointer border border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700">
                        <div>
                            <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${tx.amount > 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{typeLabels[tx.type] || tx.type}</span>
                            <p className="font-bold text-sm mt-1">{tx.description}</p>
                            <p className="text-[10px] text-gray-400">{new Date(tx.date).toLocaleString()}</p>
                        </div>
                        <span className={`font-bold ${tx.amount > 0 ? 'text-green-600' : 'text-red-600'}`}>{tx.amount > 0 ? '+' : ''}{tx.amount.toLocaleString()}</span>
                    </div>
                ))}
            </div>
        );
    };

    return (
        <div className="space-y-4">
            <div className="flex gap-4 border-b border-gray-200 dark:border-gray-700 pb-2">
                <button onClick={() => setActiveTab('history')} className={`text-lg font-bold pb-2 border-b-2 transition-colors ${activeTab === 'history' ? 'border-black dark:border-white' : 'border-transparent text-gray-400'}`}>거래 기록</button>
                <button onClick={() => setActiveTab('ledger')} className={`text-lg font-bold pb-2 border-b-2 transition-colors ${activeTab === 'ledger' ? 'border-black dark:border-white' : 'border-transparent text-gray-400'}`}>가계부</button>
            </div>

            {activeTab === 'history' && renderHistoryList()}

            {activeTab === 'ledger' && (
                <Card>
                    <div className="flex justify-between items-center mb-4">
                        <button onClick={() => handleMonthChange(-1)} className="p-2">&lt;</button>
                        <h4 className="font-bold">{calendarMonth.getFullYear()}년 {calendarMonth.getMonth() + 1}월</h4>
                        <button onClick={() => handleMonthChange(1)} className="p-2">&gt;</button>
                    </div>
                    <div className="grid grid-cols-7 text-center text-xs font-bold mb-2">
                        <span className="text-red-500">일</span><span>월</span><span>화</span><span>수</span><span>목</span><span>금</span><span className="text-blue-500">토</span>
                    </div>
                    <div className="grid grid-cols-7 gap-2">
                        {renderCalendar()}
                    </div>
                    <div className="mt-6">
                        <h5 className="font-bold mb-2">가계부 기록 목록</h5>
                        <div className="space-y-2 max-h-40 overflow-y-auto">
                            {ledgerItems.sort((a,b) => b.date.localeCompare(a.date)).map(item => (
                                <div key={item.id} className="flex justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 text-xs items-center">
                                    <div>
                                        <span className="font-bold block">{item.date} [{item.category}]</span>
                                        <span className="text-gray-500">{item.description} {item.isScheduled && '(예정)'}</span>
                                    </div>
                                    <span className={`font-bold ${item.type === 'income' ? 'text-blue-500' : 'text-red-500'}`}>{item.amount.toLocaleString()}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </Card>
            )}

            <Modal isOpen={!!selectedDate} onClose={() => setSelectedDate(null)} title={`${selectedDate} 가계부 작성`}>
                <div className="space-y-3">
                    <div className="flex gap-2">
                        <button onClick={() => setLedgerType('income')} className={`flex-1 py-3 rounded-xl font-bold transition-colors ${ledgerType === 'income' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 dark:bg-gray-800'}`}>수입</button>
                        <button onClick={() => setLedgerType('expense')} className={`flex-1 py-3 rounded-xl font-bold transition-colors ${ledgerType === 'expense' ? 'bg-red-100 text-red-700' : 'bg-gray-100 dark:bg-gray-800'}`}>지출</button>
                    </div>
                    <Input placeholder="카테고리 (예: 식비, 용돈)" value={ledgerCategory} onChange={e => setLedgerCategory(e.target.value)} />
                    <Input placeholder="내용" value={ledgerDesc} onChange={e => setLedgerDesc(e.target.value)} />
                    <MoneyInput placeholder="금액" value={ledgerAmount} onChange={e => setLedgerAmount(e.target.value)} />
                    <label className="flex items-center gap-2 p-2">
                        <input type="checkbox" checked={isScheduled} onChange={e => setIsScheduled(e.target.checked)} className="accent-green-600 w-5 h-5"/>
                        <span className="text-sm font-bold">예정 내역 (아직 발생하지 않음)</span>
                    </label>
                    <Button onClick={handleAddLedgerItem} className="w-full">저장</Button>
                </div>
            </Modal>

            <Modal isOpen={!!selectedTx} onClose={() => setSelectedTx(null)} title="거래 상세">
                {selectedTx && (
                    <div className="space-y-4 text-center">
                        <div className="text-3xl font-bold mb-2">{selectedTx.amount > 0 ? '+' : ''}{selectedTx.amount.toLocaleString()}</div>
                        <div className="text-sm text-gray-500">{new Date(selectedTx.date).toLocaleString()}</div>
                        <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl text-left">
                            <p className="text-sm font-bold text-gray-500">내용</p>
                            <p className="font-bold">{selectedTx.description}</p>
                            <p className="text-sm font-bold text-gray-500 mt-3">유형</p>
                            <p>{typeLabels[selectedTx.type]}</p>
                            <p className="text-sm font-bold text-gray-500 mt-3">거래 ID</p>
                            <p className="text-xs font-mono break-all">{selectedTx.id}</p>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
};
