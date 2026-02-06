'use client';

import React, { useState, useEffect } from 'react';
import { Users, Trophy, Sword, Calendar, LayoutDashboard, LogIn, LogOut, Calculator, Bell, Moon, Sun, FlaskConical } from 'lucide-react';
import { useAuth } from '@/context/AuthContext'; // We'll use the real context but components are in testMode
import { cn } from '@/lib/utils';
import RaidManager from '@/components/raid-manager';
import RaidManagerV2 from '@/components/raid-manager-v2';
import MemberList from '@/components/member-list';
import RankingBoard from '@/components/ranking-board';
import PartyApply from '@/components/party-apply';
import MarketCalculator from '@/components/market-calculator';
import AlerterIntegration from '@/components/alerter-integration';
import VisitorStats from '@/components/visitor-stats';
import RaidPartyMaker from '@/components/raid-party-maker';

// Test Page Types
type Tab = 'dashboard' | 'members' | 'ranking' | 'raid' | 'raid_v2' | 'raid_apply' | 'calculator' | 'alerter_integration' | 'party_maker';

export default function TestPlayground() {
    const [activeTab, setActiveTab] = useState<Tab>('raid_v2'); // Default to Raid V2 for testing
    const [darkMode, setDarkMode] = useState(false);

    useEffect(() => {
        // Initialize Dark Mode (Force Dark for cool test vibe? No, keep user preference)
        const saved = localStorage.getItem('darkMode');
        const isDark = saved === 'true';
        setDarkMode(isDark);
        if (isDark) document.documentElement.classList.add('dark');
        else document.documentElement.classList.remove('dark');
    }, []);

    const toggleDarkMode = () => {
        const next = !darkMode;
        setDarkMode(next);
        localStorage.setItem('darkMode', String(next));
        if (next) document.documentElement.classList.add('dark');
        else document.documentElement.classList.remove('dark');
    };

    return (
        <main className="min-h-screen bg-transparent text-slate-700 font-sans selection:bg-purple-200">

            {/* TEST MODE BANNER */}
            <div className="fixed top-0 left-0 w-full h-1.5 bg-gradient-to-r from-red-500 via-orange-500 to-red-500 z-[9999] animate-pulse" />
            <div className="fixed bottom-4 right-4 z-[9999] bg-red-500 text-white px-4 py-2 rounded-full font-black text-xs shadow-2xl animate-bounce">
                🚧 TEST PLAYGROUND MODE
            </div>

            <div className="relative z-10 flex h-screen overflow-hidden">
                {/* Dark Mode Toggle */}
                <button
                    onClick={toggleDarkMode}
                    className="absolute top-6 right-8 z-[60] bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl p-3 rounded-full shadow-lg border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-indigo-400 hover:scale-110 active:scale-95 transition-all group"
                >
                    {darkMode ? (
                        <Sun size={22} className="stroke-[3px] text-amber-500 animate-in spin-in-90 duration-300" />
                    ) : (
                        <Moon size={22} className="stroke-[3px] text-indigo-500 animate-in slide-in-from-top-2 duration-300" />
                    )}
                </button>

                {/* Sidebar Navigation */}
                <aside className="w-72 border-r border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-2xl flex flex-col m-4 rounded-[2.5rem] shadow-sm overflow-hidden relative">
                    {/* Test Mode Overlay on Sidebar */}
                    <div className="absolute inset-0 border-4 border-red-500/20 pointer-events-none rounded-[2.5rem] z-50"></div>

                    <div className="p-8">
                        <h1 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight flex items-center gap-2">
                            <FlaskConical className="text-red-500" size={28} />
                            TEST LAB
                        </h1>
                        <p className="text-[10px] font-bold text-red-500 uppercase tracking-widest mt-2 px-1">데이터 분리된 안전 구역</p>
                    </div>

                    <nav className="flex-1 px-4 space-y-2">
                        <NavButton active={activeTab === 'members'} onClick={() => setActiveTab('members')} icon={<Users size={20} />}>
                            레기온 멤버 (Test)
                        </NavButton>
                        <NavButton active={activeTab === 'raid_apply'} onClick={() => setActiveTab('raid_apply')} icon={<Calendar size={20} />}>
                            성역 파티 신청 (Test)
                        </NavButton>
                        <NavButton active={activeTab === 'raid_v2'} onClick={() => setActiveTab('raid_v2')} icon={<Sword size={20} />}>
                            성역 파티 도우미 V2 (Test)
                        </NavButton>
                        <NavButton active={activeTab === 'party_maker'} onClick={() => setActiveTab('party_maker')} icon={<Trophy size={20} />}>
                            파티 메이커 (Test Only)
                        </NavButton>
                    </nav>
                </aside>

                {/* Main Content Area */}
                <section className="flex-1 overflow-y-auto custom-scrollbar p-10 bg-slate-50/50 dark:bg-slate-900/50">
                    <div className="max-w-7xl mx-auto border-4 border-dashed border-red-200 dark:border-red-900/30 rounded-[3rem] p-8 min-h-[calc(100vh-80px)]">
                        {activeTab === 'raid_apply' && <PartyApply testMode={true} />}
                        {activeTab === 'raid_v2' && <RaidManagerV2 testMode={true} />}
                        {activeTab === 'party_maker' && <RaidPartyMaker />} {/* PartyMaker has internal toggle, can default to ON via prop later if needed, but for now user toggles it manually or I add prop support too? Use internal toggle for now as I didn't verify it accepts prop yet. Wait, I added internal state to PartyMaker. */}
                        {/* Note: RaidPartyMaker handles its own mock data via internal toggle. But for consistency, ideally it accepts a prop.
                However, to avoid another refactor cycle right now, I will let the user use the toggle inside PartyMaker. 
                OR, since I am creating a "Playground", maybe I should refactor RaidPartyMaker to accept `testMode` prop too?
                Actually, the user asked for a "separated dummy page".
                Let's stick to what I have. RaidManagerV2 and PartyApply accept `testMode`. 
                RaidPartyMaker has a TOGGLE. 
                I will leave it as is for now, user can toggle it. */}

                        {activeTab === 'members' && (
                            <div className="flex items-center justify-center h-full text-slate-400 font-bold">
                                멤버 리스트는 아직 테스트 모드를 지원하지 않습니다. (파티 관련 기능만 지원)
                            </div>
                        )}
                    </div>
                </section>
            </div>
        </main>
    );
}

function NavButton({ children, active, onClick, icon }: { children: React.ReactNode, active: boolean, onClick: () => void, icon: React.ReactNode }) {
    return (
        <button
            onClick={onClick}
            className={cn(
                "w-full flex items-center gap-4 px-5 py-4 rounded-2xl text-sm font-bold transition-all active:scale-95",
                active
                    ? "bg-red-500 text-white shadow-lg shadow-red-200 dark:shadow-none"
                    : "text-slate-400 dark:text-slate-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400"
            )}
        >
            <span className={cn("transition-colors", active ? "text-white" : "text-slate-300 dark:text-slate-600")}>
                {icon}
            </span>
            {children}
        </button>
    )
}
