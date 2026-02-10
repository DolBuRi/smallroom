'use client';

import React from 'react';
import PartyApply from '@/components/party-apply';
import { Sword } from 'lucide-react';

export default function MobileApplyPage() {
    const [isMounted, setIsMounted] = React.useState(false);

    React.useEffect(() => {
        console.log("MobileApplyPage Mounted");
        setIsMounted(true);
    }, []);

    if (!isMounted) return (
        <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center font-bold">
            로딩 중... (클라이언트 마운트 대기)
        </div>
    );

    return (
        <main className="min-h-screen relative bg-slate-50 overflow-y-auto">
            {/* Soft Premium Light Gradients */}
            <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-indigo-100/40 blur-[100px] rounded-full" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-purple-100/30 blur-[100px] rounded-full" />

            <div className="relative z-10 max-w-md mx-auto px-4 py-8 space-y-6 animate-in fade-in slide-in-from-bottom-8 duration-1000">
                {/* Modern App-Style Header */}
                <header className="flex flex-col items-center text-center">
                    <div className="relative group w-full">
                        <div className="absolute -inset-1 bg-gradient-to-r from-indigo-100 to-purple-100 rounded-[2.5rem] blur opacity-40"></div>
                        <div className="relative bg-white/95 backdrop-blur-2xl px-10 py-10 rounded-[2.8rem] border border-white shadow-[0_20px_50px_-12px_rgba(0,0,0,0.05)] flex flex-col items-center w-full">
                            <span className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.3em] mb-4 opacity-80">모바일 전용 신청 페이지</span>
                            <h1 className="text-3xl font-black text-slate-900 tracking-tight mb-2">
                                성역 파티 신청
                            </h1>
                            <p className="text-sm font-bold text-slate-400 tracking-tight">
                                (2월 2주차)
                            </p>
                        </div>
                    </div>
                </header>

                {/* Main Component (Title Hidden Internally, Custom Flow for Mobile) */}
                <div className="bg-white/70 backdrop-blur-2xl rounded-[2.5rem] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.08)] border border-white/60 p-2">
                    <div className="pt-2">
                        <PartyApply
                            showTitle={false}
                            hideDelete={true}
                            saveButtonPosition="bottom"
                            forceSingleColumn={true}
                        />
                    </div>
                </div>

                {/* Brand Footer */}
                <footer className="flex flex-col items-center space-y-4 pt-2 pb-8">
                    <div className="h-px w-12 bg-slate-200" />
                    <div className="text-center space-y-1">
                        <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.3em]">
                            AION2 GUILD MANAGER
                        </p>
                    </div>
                </footer>
            </div>
        </main>
    );
}
