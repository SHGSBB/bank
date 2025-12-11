
import React, { useState, useRef, useEffect } from 'react';
import { useGame } from '../../context/GameContext';
import { Card, Button, MoneyInput } from '../Shared';
import { User } from '../../types';

export const SimplePayTab: React.FC = () => {
    const { currentUser, notify, saveDb, db, showModal } = useGame();
    const [amount, setAmount] = useState('');
    const [status, setStatus] = useState("대기중...");
    const [isScanning, setIsScanning] = useState(false);
    const [mode, setMode] = useState<'send' | 'receive' | 'setup'>('send');
    const scanController = useRef<AbortController | null>(null);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (scanController.current) {
                scanController.current.abort();
            }
        };
    }, []);

    const startScan = async () => {
        if (!('NDEFReader' in window)) {
            return showModal("이 기기는 NFC를 지원하지 않거나 브라우저 권한이 없습니다.");
        }

        const valAmount = parseInt(amount);
        // Validate amount only if sending or charging
        if (mode !== 'setup') {
            if (isNaN(valAmount) || valAmount <= 0) {
                return showModal(mode === 'send' ? "이체할 금액을 입력하세요." : "결제 청구할 금액을 입력하세요.");
            }
            if (mode === 'send' && currentUser!.balanceKRW < valAmount) {
                return showModal("잔액이 부족합니다.");
            }
        }

        try {
            if (scanController.current) scanController.current.abort();
            scanController.current = new AbortController();

            // @ts-ignore
            const ndef = new NDEFReader();
            await ndef.scan({ signal: scanController.current.signal });
            
            setIsScanning(true);
            setStatus(mode === 'send' ? "받는 사람의 휴대폰(태그)을 스캔하세요..." : "손님의 휴대폰(태그)을 스캔하세요...");

            // @ts-ignore
            ndef.onreading = async (event: any) => {
                const decoder = new TextDecoder();
                for (const record of event.message.records) {
                    if (record.recordType === "text") {
                        const phoneNumber = decoder.decode(record.data);
                        if (mode === 'send') {
                            await processTransfer(phoneNumber, valAmount);
                        } else if (mode === 'receive') {
                            await processCharge(phoneNumber, valAmount);
                        }
                        return; // Stop after first valid read
                    }
                }
            };
        } catch (error) {
            console.error(error);
            setStatus("NFC 스캔 시작 실패. 다시 시도하세요.");
            setIsScanning(false);
        }
    };

    // Mode 1: Send Money (Scan Receiver)
    const processTransfer = async (phoneNumber: string, valAmount: number) => {
        const users = Object.values(db.users) as User[];
        const targetUser = users.find(u => u.phoneNumber === phoneNumber);

        if (targetUser) {
            if (targetUser.name === currentUser!.name) {
                setStatus("본인에게는 이체할 수 없습니다.");
                vibrate([100, 50, 100]);
                return;
            }

            stopScan();
            
            // Execute Transfer
            const newDb = { ...db };
            const sender = newDb.users[currentUser!.name];
            const receiver = newDb.users[targetUser.name];

            sender.balanceKRW -= valAmount;
            receiver.balanceKRW += valAmount;

            const date = new Date().toISOString();
            sender.transactions = [...(sender.transactions || []), {
                id: Date.now(), type: 'expense', amount: -valAmount, currency: 'KRW', description: `NFC 이체 (${receiver.name})`, date
            }];
            receiver.transactions = [...(receiver.transactions || []), {
                id: Date.now() + 1, type: 'income', amount: valAmount, currency: 'KRW', description: `NFC 수신 (${sender.name})`, date
            }];

            await saveDb(newDb);
            notify(targetUser.name, `${currentUser!.name}님이 NFC로 ₩${valAmount.toLocaleString()}을 보냈습니다.`);
            
            setStatus(`송금 완료! (${targetUser.name})`);
            vibrate([200]);
            showModal(`${targetUser.name}님에게 ₩${valAmount.toLocaleString()} 송금을 완료했습니다.`);
            setAmount('');
        } else {
            handleError(`등록되지 않은 번호입니다: ${phoneNumber}`);
        }
    };

    // Mode 2: Receive Payment (Scan Customer to Charge them)
    const processCharge = async (phoneNumber: string, valAmount: number) => {
        const users = Object.values(db.users) as User[];
        const customer = users.find(u => u.phoneNumber === phoneNumber);

        if (customer) {
            if (customer.name === currentUser!.name) {
                setStatus("본인에게 결제할 수 없습니다.");
                vibrate([100, 50, 100]);
                return;
            }

            stopScan();

            // Check Customer Balance
            if (customer.balanceKRW < valAmount) {
                setStatus("잔액 부족 (손님)");
                vibrate([100, 50, 100]);
                return showModal(`${customer.name}님의 잔액이 부족하여 결제할 수 없습니다.`);
            }

            // Execute Charge
            const newDb = { ...db };
            const payer = newDb.users[customer.name]; // Customer
            const payee = newDb.users[currentUser!.name]; // Me (Merchant)

            payer.balanceKRW -= valAmount;
            payee.balanceKRW += valAmount;

            const date = new Date().toISOString();
            payer.transactions = [...(payer.transactions || []), {
                id: Date.now(), type: 'expense', amount: -valAmount, currency: 'KRW', description: `NFC 결제 (${payee.name})`, date
            }];
            payee.transactions = [...(payee.transactions || []), {
                id: Date.now() + 1, type: 'income', amount: valAmount, currency: 'KRW', description: `NFC 매출 (${payer.name})`, date
            }];

            await saveDb(newDb);
            notify(customer.name, `${currentUser!.name}에서 NFC로 ₩${valAmount.toLocaleString()}이 결제되었습니다.`);
            
            setStatus(`결제 완료! (${customer.name})`);
            vibrate([200]);
            showModal(`${customer.name}님으로부터 ₩${valAmount.toLocaleString()} 결제 완료.`);
            setAmount('');
        } else {
            handleError(`등록되지 않은 번호입니다: ${phoneNumber}`);
        }
    };

    // Mode 3: Setup (Write Tag)
    const handleWriteTag = async () => {
        if (!('NDEFReader' in window)) return showModal("이 기기는 NFC를 지원하지 않습니다.");
        if (!currentUser?.phoneNumber) return showModal("내 프로필에 전화번호가 등록되지 않았습니다.");

        try {
            setStatus("태그를 뒷면에 대주세요 (정보 입력 중)...");
            // @ts-ignore
            const ndef = new NDEFReader();
            await ndef.write({
                records: [{ recordType: "text", data: currentUser.phoneNumber }]
            });
            setStatus("정보 입력 완료!");
            vibrate([200]);
            showModal("태그에 내 정보가 입력되었습니다.");
        } catch (error) {
            console.error(error);
            setStatus("쓰기 실패. 다시 시도하세요.");
        }
    };

    const stopScan = () => {
        if (scanController.current) {
            scanController.current.abort();
            scanController.current = null;
        }
        setIsScanning(false);
    };

    const handleError = (msg: string) => {
        setStatus(msg);
        vibrate([100, 50, 100]);
    };

    const vibrate = (pattern: number[]) => {
        if (navigator.vibrate) navigator.vibrate(pattern);
    };

    return (
        <Card className="min-h-[400px] flex flex-col items-center justify-between text-center relative overflow-hidden">
            <div className="w-full flex justify-center mb-6 border-b pb-2 gap-2 overflow-x-auto">
                <button onClick={() => { setMode('send'); stopScan(); setStatus("대기중..."); }} className={`px-4 py-2 font-bold whitespace-nowrap rounded-lg transition-colors ${mode === 'send' ? 'bg-green-100 text-green-700' : 'text-gray-400'}`}>보내기</button>
                <button onClick={() => { setMode('receive'); stopScan(); setStatus("대기중..."); }} className={`px-4 py-2 font-bold whitespace-nowrap rounded-lg transition-colors ${mode === 'receive' ? 'bg-blue-100 text-blue-700' : 'text-gray-400'}`}>결제 받기</button>
                <button onClick={() => { setMode('setup'); stopScan(); setStatus("대기중..."); }} className={`px-4 py-2 font-bold whitespace-nowrap rounded-lg transition-colors ${mode === 'setup' ? 'bg-gray-200 text-gray-700' : 'text-gray-400'}`}>태그 설정</button>
            </div>

            {mode === 'setup' ? (
                <div className="w-full flex-1 flex flex-col items-center gap-6 animate-fade-in justify-center">
                    <div className="w-32 h-32 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center text-5xl border-4 border-gray-200">
                        🏷️
                    </div>
                    <div className="space-y-2">
                        <h4 className="text-lg font-bold">내 정보 입력하기</h4>
                        <p className="text-sm text-gray-500 break-keep">
                            NFC 태그(스티커, 카드)에 내 전화번호를 입력하여<br/>나만의 결제 태그를 만듭니다.
                        </p>
                        <p className="font-mono bg-gray-100 p-2 rounded text-lg font-bold">{currentUser?.phoneNumber || "번호 없음"}</p>
                    </div>
                    <Button onClick={handleWriteTag} className="w-full py-4 bg-gray-700 hover:bg-gray-600">
                        태그에 쓰기
                    </Button>
                </div>
            ) : (
                <div className="w-full flex-1 flex flex-col items-center gap-6 animate-fade-in justify-center">
                    <div className={`w-40 h-40 rounded-full flex items-center justify-center text-7xl transition-all duration-500 ${isScanning ? (mode==='send' ? 'bg-green-100 text-green-600 animate-pulse shadow-green-400' : 'bg-blue-100 text-blue-600 animate-pulse shadow-blue-400') : 'bg-gray-100 text-gray-400'}`}>
                        {mode === 'send' ? '💸' : '💳'}
                    </div>
                    
                    <div className="w-full space-y-4">
                        <p className="text-xl font-bold break-keep min-h-[3rem] flex items-center justify-center">{status}</p>
                        <MoneyInput 
                            type="number" 
                            value={amount} 
                            onChange={e => setAmount(e.target.value)} 
                            placeholder={mode === 'send' ? "보낼 금액 (₩)" : "받을 금액 (₩)"}
                            className="text-center text-xl py-3 font-bold"
                            disabled={isScanning}
                        />
                        <Button 
                            onClick={isScanning ? () => { stopScan(); setStatus("취소됨"); } : startScan} 
                            className={`w-full py-4 text-lg shadow-lg ${isScanning ? 'bg-red-500 hover:bg-red-400' : (mode === 'send' ? 'bg-green-600 hover:bg-green-500' : 'bg-blue-600 hover:bg-blue-500')}`}
                        >
                            {isScanning ? '스캔 취소' : (mode === 'send' ? '터치하여 보내기' : '터치하여 결제 받기')}
                        </Button>
                        <p className="text-xs text-gray-400">
                            {mode === 'send' ? "상대방의 태그를 스캔하여 송금합니다." : "손님의 태그를 스캔하여 금액을 청구합니다."}
                        </p>
                    </div>
                </div>
            )}
        </Card>
    );
};
