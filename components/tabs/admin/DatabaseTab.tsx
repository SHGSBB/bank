
import React, { useState } from 'react';
import { useGame } from '../../../context/GameContext';
import { Card, Button } from '../../Shared';

export const DatabaseTab: React.FC = () => {
    const { db, saveDb, showModal, showConfirm, serverAction } = useGame();
    const [jsonInput, setJsonInput] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);

    const handleDownload = () => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(db, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", `sunghwa_db_${new Date().toISOString().slice(0,10)}.json`);
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    };

    const handleImport = async () => {
        if (!jsonInput) return showModal("JSON 데이터를 입력하세요.");
        if (!await showConfirm("경고: 데이터베이스를 덮어쓰시겠습니까? 이 작업은 되돌릴 수 없습니다.")) return;
        
        setIsProcessing(true);
        try {
            const parsed = JSON.parse(jsonInput);
            await saveDb(parsed);
            showModal("데이터베이스가 성공적으로 복원되었습니다.");
            setJsonInput('');
        } catch(e) {
            showModal("유효하지 않은 JSON 형식입니다.");
        } finally {
            setIsProcessing(false);
        }
    };

    const handleFixDatabase = async () => {
        if (!await showConfirm("DB 구조를 복구하시겠습니까? \n\n1. 이메일을 기준으로 중복된 계정을 하나로 통합합니다.\n2. 잔고와 거래 내역을 합칩니다.\n3. 불필요한 'ID 전용' 노드를 제거합니다.")) return;
        
        setIsProcessing(true);
        try {
            const res = await serverAction('fix_database_structure', {});
            showModal(res.message || "DB 복구가 완료되었습니다.");
            window.location.reload(); // Refresh to see changes
        } catch (e: any) {
            showModal("복구 실패: " + e.message);
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <Card>
            <h3 className="text-2xl font-bold mb-6">데이터베이스 관리</h3>
            <div className="space-y-8">
                
                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800">
                    <h4 className="font-bold mb-2 text-blue-600 dark:text-blue-400">🔧 데이터 구조 복구 (계정 통합)</h4>
                    <p className="text-sm text-gray-600 dark:text-gray-300 mb-4 leading-relaxed">
                        계정이 분리되어 승인이 안 되거나, 잔고가 갈라지는 문제를 해결합니다.<br/>
                        동일한 이메일/ID를 가진 여러 데이터 노드를 하나로 합칩니다.
                    </p>
                    <Button onClick={handleFixDatabase} className="bg-blue-600 hover:bg-blue-500 w-full py-4 shadow-lg" disabled={isProcessing}>
                        {isProcessing ? '처리 중...' : '데이터 구조 복구 실행'}
                    </Button>
                </div>

                <div>
                    <h4 className="font-bold mb-2">백업 (내보내기)</h4>
                    <p className="text-sm text-gray-500 mb-2">현재 데이터베이스 상태를 JSON 파일로 다운로드합니다.</p>
                    <Button onClick={handleDownload} variant="secondary" className="w-full">DB 다운로드</Button>
                </div>

                <div className="border-t pt-4">
                    <h4 className="font-bold mb-2 text-red-600">복원 (가져오기)</h4>
                    <p className="text-sm text-gray-500 mb-2">JSON 데이터를 붙여넣어 데이터베이스를 덮어씁니다.</p>
                    <textarea 
                        className="w-full h-40 p-3 border rounded-xl bg-gray-50 dark:bg-gray-800 text-xs font-mono mb-2 outline-none focus:ring-2 focus:ring-red-500" 
                        placeholder="Paste JSON here..."
                        value={jsonInput}
                        onChange={e => setJsonInput(e.target.value)}
                    />
                    <Button variant="danger" onClick={handleImport} className="w-full" disabled={isProcessing}>데이터베이스 덮어쓰기</Button>
                </div>
            </div>
        </Card>
    );
};
