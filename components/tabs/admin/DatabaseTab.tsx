
import React, { useState } from 'react';
import { useGame } from '../../../context/GameContext';
import { Card, Button } from '../../Shared';

export const DatabaseTab: React.FC = () => {
    const { db, saveDb, showModal, showConfirm } = useGame();
    const [jsonInput, setJsonInput] = useState('');

    const handleDownload = () => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(db, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", "sunghwa_bank_db.json");
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    };

    const handleImport = async () => {
        if (!jsonInput) return showModal("JSON 데이터를 입력하세요.");
        if (!await showConfirm("데이터베이스를 덮어쓰시겠습니까? 이 작업은 되돌릴 수 없습니다.")) return;
        
        try {
            const parsed = JSON.parse(jsonInput);
            await saveDb(parsed);
            showModal("데이터베이스가 복원되었습니다.");
            setJsonInput('');
        } catch(e) {
            showModal("유효하지 않은 JSON 형식입니다.");
        }
    };

    return (
        <Card>
            <h3 className="text-2xl font-bold mb-6">데이터베이스 관리</h3>
            <div className="space-y-6">
                <div>
                    <h4 className="font-bold mb-2">백업 (내보내기)</h4>
                    <p className="text-sm text-gray-500 mb-2">현재 데이터베이스 상태를 JSON 파일로 다운로드합니다.</p>
                    <Button onClick={handleDownload}>DB 다운로드</Button>
                </div>
                <div className="border-t pt-4">
                    <h4 className="font-bold mb-2 text-red-600">복원 (가져오기)</h4>
                    <p className="text-sm text-gray-500 mb-2">JSON 데이터를 붙여넣어 데이터베이스를 덮어씁니다.</p>
                    <textarea 
                        className="w-full h-40 p-2 border rounded bg-gray-50 dark:bg-gray-800 text-xs font-mono mb-2 outline-none focus:ring-2 focus:ring-red-500" 
                        placeholder="Paste JSON here..."
                        value={jsonInput}
                        onChange={e => setJsonInput(e.target.value)}
                    />
                    <Button variant="danger" onClick={handleImport}>데이터베이스 덮어쓰기</Button>
                </div>
            </div>
        </Card>
    );
};
