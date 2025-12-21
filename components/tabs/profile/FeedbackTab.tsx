
import React, { useState } from 'react';
import { useGame } from '../../../context/GameContext';
import { Button, Input, FileInput } from '../../Shared';
import { uploadImage } from '../../../services/firebase';

export const FeedbackTab: React.FC = () => {
    const { currentUser, createChat, sendMessage, notify, showModal } = useGame();
    
    const [fbTitle, setFbTitle] = useState('');
    const [fbContent, setFbContent] = useState('');
    const [fbLink, setFbLink] = useState('');
    const [fbImage, setFbImage] = useState<string | null>(null);

    const handleSendFeedback = async () => {
        if (!fbTitle.trim() || !fbContent.trim()) return showModal("제목과 내용을 입력해주세요.");
        
        let imageUrl = null;
        if (fbImage) {
            try {
                // Ensure unique path and Cloudinary upload
                imageUrl = await uploadImage(`feedback/${Date.now()}_${currentUser!.name}`, fbImage);
            } catch (e) {
                console.error("Upload failed", e);
                return showModal("이미지 업로드에 실패했습니다.");
            }
        }

        const chatId = await createChat(['한국은행'], 'feedback', `[피드백] ${fbTitle}`);
        await sendMessage(chatId, `[피드백 내용]\n${fbContent}\n\n[첨부 링크]\n${fbLink || '없음'}`, imageUrl ? { type: 'image', value: '이미지 첨부', data: { image: imageUrl } } : undefined);

        notify('한국은행', `[피드백] ${fbTitle} 접수되었습니다.`, true);
        showModal("관리자에게 피드백을 전송했습니다.");
        setFbTitle(''); setFbContent(''); setFbLink(''); setFbImage(null);
    };

    return (
        <div className="space-y-4">
            <Input placeholder="제목" value={fbTitle} onChange={e => setFbTitle(e.target.value)} className="w-full" />
            <textarea 
                className="w-full p-4 rounded-2xl bg-[#F0F0F0] text-[#121212] dark:bg-[#2D2D2D] dark:text-[#E0E0E0] outline-none focus:ring-2 focus:ring-green-500 border border-transparent dark:border-gray-600"
                rows={5}
                placeholder="건의사항이나 버그 신고 내용을 자세히 적어주세요."
                value={fbContent}
                onChange={e => setFbContent(e.target.value)}
            />
            <Input placeholder="관련 링크 (선택)" value={fbLink} onChange={e => setFbLink(e.target.value)} className="w-full" />
            
            <div className="flex items-center gap-4">
                <span className="text-sm font-bold">사진 첨부</span>
                <FileInput onChange={setFbImage} />
            </div>

            <Button onClick={handleSendFeedback} className="w-full py-4 text-lg">피드백 전송</Button>
        </div>
    );
};
