'use client';

import React, { useState, useEffect } from 'react';
import { Users, Trophy, Sword, Calendar, LayoutDashboard, LogIn, LogOut, Calculator, Bell, Moon, Sun } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';
import RaidManager from '@/components/raid-manager';
import RaidManagerV2 from '@/components/raid-manager-v2';
import MemberList from '@/components/member-list';
import RankingBoard from '@/components/ranking-board';
import PartyApply from '@/components/party-apply';
import MarketCalculator from '@/components/market-calculator';
import AlerterIntegration from '@/components/alerter-integration';
import VisitorStats from '@/components/visitor-stats';
import RaidPartyMakerV3 from '@/components/raid-party-maker';

type Tab = 'dashboard' | 'members' | 'ranking' | 'raid' | 'raid_v2' | 'raid_apply' | 'calculator' | 'alerter_integration' | 'party_maker';

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>('members');
  const { user, logout, loading, loginWithCredentials } = useAuth();
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [loginId, setLoginId] = useState('');
  const [loginPw, setLoginPw] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [debugClicks, setDebugClicks] = useState(0);
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    // Initialize Dark Mode
    const saved = localStorage.getItem('darkMode');
    // Default to light if not set, or check system? User requested toggle so explicit is better.
    // Let's default to false (light) as per current look, unless saved.
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

  const [bunnyClicks, setBunnyClicks] = useState(0); // For disabling Dev Mode

  // Disable Dev Mode (5 clicks on Bunny Image)
  const handleBunnyClick = () => {
    const newClicks = bunnyClicks + 1;
    setBunnyClicks(newClicks);
    if (newClicks === 5) {
      if (debugClicks >= 5) {
        setDebugClicks(0); // Reset Dev Mode
        alert("개발자 모드 비활성화.");
      } else {
        alert("개발자 모드 상태가 아닙니다");
      }
      setBunnyClicks(0); // Reset Bunny Clicks
    }
  };

  const handleDebugClick = () => {
    const newClicks = debugClicks + 1;
    setDebugClicks(newClicks);
    if (newClicks === 5) {
      alert("개발자 모드 활성화.");
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    try {
      await loginWithCredentials(loginId, loginPw);
      setIsLoginModalOpen(false);
      setLoginId('');
      setLoginPw('');
    } catch (error: any) {
      alert("로그인 실패: 아이디 또는 비밀번호를 확인해주세요.");
      console.error(error);
    } finally {
      setIsLoggingIn(false);
    }
  };

  return (
    <main className="min-h-screen bg-transparent text-slate-700 font-sans selection:bg-purple-200">
      <div className="relative z-10 flex h-screen overflow-hidden">
        {/* Dark Mode Toggle - Global Top Right */}
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

        {/* Visitor Stats - Top Left (Overlaying Sidebar Header) - Visible only in Dev Mode */}
        {debugClicks >= 5 && (
          <div className="absolute top-6 left-6 z-[100] animate-in fade-in slide-in-from-left-4 duration-500">
            <VisitorStats />
          </div>
        )}

        {/* Sidebar Navigation */}
        <aside className="w-72 border-r border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-2xl flex flex-col m-4 rounded-[2.5rem] shadow-sm overflow-hidden">
          <div className="p-8">
            <h1 className="text-2xl font-black bg-gradient-to-r from-indigo-500 to-indigo-700 bg-clip-text text-transparent tracking-tight">
              AION2 <br />GUILD MANAGER
            </h1>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2 px-1">아이온2 길드 관리 매니저 v1.2</p>
          </div>

          <nav className="flex-1 px-4 space-y-2">
            <NavButton active={activeTab === 'members'} onClick={() => setActiveTab('members')} icon={<Users size={20} />}>
              레기온 멤버
            </NavButton>
            <NavButton active={activeTab === 'ranking'} onClick={() => setActiveTab('ranking')} icon={<Trophy size={20} />}>
              레기온 멤버 랭킹
            </NavButton>
            <NavButton active={activeTab === 'raid_apply'} onClick={() => setActiveTab('raid_apply')} icon={<Calendar size={20} />}>
              성역 파티 신청하기
            </NavButton>
            <NavButton active={activeTab === 'raid'} onClick={() => setActiveTab('raid')} icon={<Sword size={20} />}>
              성역 파티 도우미
            </NavButton>
            <NavButton active={activeTab === 'raid_v2'} onClick={() => setActiveTab('raid_v2')} icon={<Sword size={20} />}>
              성역 파티 도우미 VER2
            </NavButton>
            <NavButton active={activeTab === 'party_maker'} onClick={() => setActiveTab('party_maker')} icon={<Trophy size={20} />}>
              성역 파티 매칭
            </NavButton>

            <div className="w-full h-px bg-slate-100 dark:bg-slate-800 my-4" /> {/* Divider */}

            <NavButton active={activeTab === 'alerter_integration'} onClick={() => setActiveTab('alerter_integration')} icon={<Bell size={20} />}>
              아이온2 알리미 연동
            </NavButton>
            <NavButton active={activeTab === 'calculator'} onClick={() => setActiveTab('calculator')} icon={<Calculator size={20} />}>
              거래소 수수료 계산기
            </NavButton>
          </nav>

          <div className="w-full px-0 pb-0 flex justify-center mt-auto overflow-hidden relative cursor-pointer active:scale-95 transition-transform" onClick={handleBunnyClick}>
            <img
              src="/bunny_chu.png"
              alt="Chu Bunny"
              className="w-[200%] max-w-none h-auto drop-shadow-2xl animate-in fade-in zoom-in duration-700 hover:scale-105 transition-transform origin-bottom -translate-x-3 translate-y-14"
            />
          </div>

          <div className="py-4 border-t border-slate-100 dark:border-slate-800 flex flex-col items-center gap-2">
            <button onClick={handleDebugClick} className="text-[10px] text-slate-400 font-bold text-center uppercase tracking-widest hover:text-indigo-500 transition-colors cursor-default">
              Developed by 부트띠
            </button>
            {!loading && (
              user && !user.isAnonymous ? (
                <button onClick={logout} className="text-[10px] text-slate-300 hover:text-red-400 flex items-center gap-1 font-bold transition-colors">
                  <LogOut size={10} /> Logout
                </button>
              ) : (
                <button onClick={() => setIsLoginModalOpen(true)} className="text-[10px] text-slate-300 dark:text-slate-600 hover:text-indigo-500 flex items-center gap-1 font-bold transition-colors">
                  <LogIn size={10} /> Admin Login
                </button>
              )
            )}
          </div>
        </aside>

        {/* Main Content Area */}
        <section className="flex-1 overflow-y-auto custom-scrollbar p-10">
          <div className="max-w-7xl mx-auto">
            {activeTab === 'raid_apply' && <PartyApply />}
            {activeTab === 'raid' && <RaidManager />}
            {activeTab === 'raid_v2' && <RaidManagerV2 />}
            {activeTab === 'party_maker' && <RaidPartyMakerV3 testMode={debugClicks >= 5} />}
            {activeTab === 'members' && <MemberList />}
            {activeTab === 'ranking' && <RankingBoard />}
            {/* Alerter Always Mounted (Hidden when inactive) to keep Alarm running */}
            <div className={activeTab === 'alerter_integration' ? 'block' : 'hidden'}>
              <AlerterIntegration showDiagnostics={debugClicks >= 5} />
            </div>
            {activeTab === 'calculator' && <MarketCalculator />}
          </div>
        </section>
      </div>

      {/* Login Modal */}
      {isLoginModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200 p-8">
            <h3 className="text-2xl font-black text-slate-900 mb-6 text-center">관리자 로그인</h3>
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1 pl-1">아이디</label>
                <input
                  type="text"
                  value={loginId}
                  onChange={(e) => setLoginId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                  placeholder="아이디를 입력하세요"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1 pl-1">비밀번호</label>
                <input
                  type="password"
                  value={loginPw}
                  onChange={(e) => setLoginPw(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-mono"
                  placeholder="비밀번호를 입력하세요"
                />
              </div>
              <button
                type="submit"
                disabled={isLoggingIn || !loginId || !loginPw}
                className="w-full bg-indigo-500 text-white font-black py-4 rounded-xl shadow-lg shadow-indigo-200 hover:bg-indigo-600 active:scale-95 transition-all disabled:opacity-50 disabled:active:scale-100 mt-4"
              >
                {isLoggingIn ? '로그인 중...' : '로그인'}
              </button>
            </form>
            <button
              onClick={() => setIsLoginModalOpen(false)}
              className="w-full text-slate-400 text-xs font-bold mt-4 hover:text-slate-600 transition-colors"
            >
              닫기
            </button>
          </div>
        </div>
      )}
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
          ? "bg-indigo-500 text-white shadow-lg shadow-indigo-100 dark:shadow-none"
          : "text-slate-400 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-200"
      )}
    >
      <span className={cn("transition-colors", active ? "text-white" : "text-slate-300 dark:text-slate-600")}>
        {icon}
      </span>
      {children}
    </button>
  )
}
