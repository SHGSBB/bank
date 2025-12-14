
import React from 'react';
import { useGame } from '../../../context/GameContext';
import { Toggle } from '../../Shared';
import { UserPreferences } from '../../../types';

export const FeaturesTab: React.FC = () => {
    const { currentUser, updateUser } = useGame();
    const preferences = currentUser?.preferences || {};

    const handleUpdatePrefs = (key: keyof UserPreferences, value: any) => {
        const newPrefs = { ...preferences, [key]: value };
        updateUser(currentUser!.name, { preferences: newPrefs });
    };

    return (
        <div className="space-y-6">
            <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-2xl border border-gray-100 dark:border-gray-700">
                <h5 className="font-bold mb-4 text-sm text-gray-500 uppercase">편의 기능</h5>
                
                <div className="space-y-4">
                    <div className="flex justify-between items-center">
                        <div>
                            <span className="block font-bold">간편번호 입력 최소화</span>
                            <span className="text-xs text-gray-500">소액 이체/결제 시 PIN 입력을 건너뜁니다.</span>
                        </div>
                        <Toggle checked={preferences.skipPinForCommonActions || false} onChange={v => handleUpdatePrefs('skipPinForCommonActions', v)} />
                    </div>

                    <div className="flex justify-between items-center">
                        <div>
                            <span className="block font-bold">진동 피드백</span>
                            <span className="text-xs text-gray-500">버튼 클릭 및 알림 시 진동을 사용합니다.</span>
                        </div>
                        <Toggle checked={preferences.vibration || false} onChange={v => handleUpdatePrefs('vibration', v)} />
                    </div>
                </div>
            </div>

            {currentUser?.type === 'citizen' && (
                <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-2xl border border-green-200 dark:border-green-800">
                    <div className="flex justify-between items-center">
                        <div>
                            <span className="block font-bold text-green-700 dark:text-green-400">쉬운 모드 (Easy Mode)</span>
                            <span className="text-xs text-green-600 dark:text-green-500">
                                복잡한 기능을 숨기고, 핵심 금융 기능(이체, 구매, 저금, 대출)만 간편하게 표시합니다.
                            </span>
                        </div>
                        <Toggle checked={preferences.isEasyMode || false} onChange={v => handleUpdatePrefs('isEasyMode', v)} />
                    </div>
                </div>
            )}

            <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-2xl border border-gray-100 dark:border-gray-700">
                <h5 className="font-bold mb-4 text-sm text-gray-500 uppercase">자산 표시 방식</h5>
                <div className="flex bg-gray-200 dark:bg-gray-700 p-1 rounded-xl">
                    <button 
                        onClick={() => handleUpdatePrefs('assetDisplayMode', 'full')}
                        className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${preferences.assetDisplayMode === 'full' ? 'bg-white dark:bg-gray-600 shadow' : 'text-gray-500'}`}
                    >
                        전체 표시
                    </button>
                    <button 
                        onClick={() => handleUpdatePrefs('assetDisplayMode', 'rounded')}
                        className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${preferences.assetDisplayMode === 'rounded' ? 'bg-white dark:bg-gray-600 shadow' : 'text-gray-500'}`}
                    >
                        단위 표시 (만/억)
                    </button>
                </div>
                <div className="mt-4 p-3 bg-white dark:bg-black rounded-lg text-center border border-gray-200 dark:border-gray-700">
                    <p className="text-xs text-gray-500 mb-1">미리보기</p>
                    <p className="text-2xl font-bold">
                        {preferences.assetDisplayMode === 'rounded' ? '12.5억' : '1,250,000,000'}
                    </p>
                </div>
            </div>
        </div>
    );
};
