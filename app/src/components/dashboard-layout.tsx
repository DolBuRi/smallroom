'use client';

import React, { useState, useEffect } from 'react';
import { Users, Trophy, Sword, Calendar, LayoutDashboard, LogIn, LogOut, Calculator, Bell, Moon, Sun, Grid3X3, Shield } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useAppMode } from '@/context/ModeContext';
import { cn } from '@/lib/utils';
import { db } from '@/lib/firebase';
import { ref, onValue } from 'firebase/database';
import RaidManager from '@/components/raid-manager';
import RaidManagerV2 from '@/components/raid-manager-v2';
import MemberList from '@/components/member-list';
import RankingBoard from '@/components/ranking-board';
import SubCharacterList from '@/components/sub-character-list';
import PartyApply from '@/components/party-apply';
import MarketCalculator from '@/components/market-calculator';
import AlerterIntegration from '@/components/alerter-integration';
import VisitorStats from '@/components/visitor-stats';
import dynamic from 'next/dynamic';

const RaidPartyMakerV3 = dynamic(() => import('@/components/raid-party-maker'), { ssr: false });

type Tab = 'dashboard' | 'members' | 'ranking' | 'raid' | 'raid_v2' | 'raid_apply' | 'calculator' | 'alerter_integration' | 'party_maker' | 'sub_characters';

export default function DashboardLayout() {
  const [activeTab, setActiveTab] = useState<Tab>('members');
  const { user, logout, loading, loginWithCredentials } = useAuth();
  const { mode } = useAppMode();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [loginId, setLoginId] = useState('');
  const [loginPw, setLoginPw] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [debugClicks, setDebugClicks] = useState(0);
  const [darkMode, setDarkMode] = useState(false);
  const [isVerifyModalOpen, setIsVerifyModalOpen] = useState(false);
  const [verifyInput, setVerifyInput] = useState('');
  const [fixedMembersNames, setFixedMembersNames] = useState<string[]>([]);

  useEffect(() => {
    // Fetch fixed members for verification
    const fixedMembersRef = ref(db, 'fixed_members');
    const unsubscribe = onValue(fixedMembersRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const names = Object.values(data).map((m: any) => m.name);
        setFixedMembersNames(names.filter(n => n && n !== '부트띠'));
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    // Initialize Dark Mode
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

  const handleBunnyClick = () => {
    setIsVerifyModalOpen(true);
  };

  const handleVerify = () => {
    const trimmed = verifyInput.trim();
    if (!trimmed) return;

    if (trimmed === '부트띠') {
      alert("부트띠 외 다른 고정 멤버의 닉네임을 입력해 주세요.");
      return;
    }

    if (fixedMembersNames.includes(trimmed)) {
      setIsVerifyModalOpen(false);
      setVerifyInput('');
      window.location.href = '/fixed-party';
    } else {
      alert("검증에 실패했습니다. 올바른 닉네임을 입력해주세요.");
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

  if (!isMounted) {
    return (
      <main className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 animate-pulse">
          <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="font-black text-indigo-500 tracking-widest text-sm">LOADING ASSETS...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-transparent text-slate-700 font-sans selection:bg-purple-200">
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

        {/* Visitor Stats */}
        {debugClicks >= 5 && (
          <div className="absolute top-6 left-6 z-[100] animate-in fade-in slide-in-from-left-4 duration-500">
            <VisitorStats />
          </div>
        )}

        {/* Sidebar Navigation */}
        <aside className="w-72 border-r border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-2xl flex flex-col m-4 rounded-[2.5rem] shadow-sm overflow-hidden">
          <div className="p-8">
            <h1 className="text-2xl font-black bg-gradient-to-r from-indigo-500 to-indigo-700 bg-clip-text text-transparent tracking-tight leading-tight">
              {mode === 'fixed' ? 'FIXED PARTY' : 'AION2'}<br />MANAGER
            </h1>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2 px-1">
              {mode === 'fixed' ? '고정파티 전용 매니저 v1.0' : '아이온2 길드 관리 매니저 v1.3'}
            </p>
          </div>

            <nav className="flex-1 px-4 space-y-2">
            <NavButton active={activeTab === 'members'} onClick={() => setActiveTab('members')} icon={<Users size={20} />}>
              {mode === 'fixed' ? '고정 멤버' : '레기온 멤버'}
            </NavButton>
            <NavButton active={activeTab === 'ranking'} onClick={() => setActiveTab('ranking')} icon={<Trophy size={20} />}>
              {mode === 'fixed' ? '고정 멤버 랭킹' : '레기온 멤버 랭킹'}
            </NavButton>
            {mode !== 'fixed' && (
              <>
                <NavButton active={activeTab === 'raid_apply'} onClick={() => setActiveTab('raid_apply')} icon={<Calendar size={20} />}>
                  성역 파티 신청하기
                </NavButton>
                <NavButton active={activeTab === 'raid_v2'} onClick={() => setActiveTab('raid_v2')} icon={<Grid3X3 size={20} />}>
                  성역 신청 현황
                </NavButton>
              </>
            )}
            {mode === 'fixed' && (
              <NavButton active={activeTab === 'sub_characters'} onClick={() => setActiveTab('sub_characters')} icon={<Shield size={20} />}>
                고정 멤버 부캐
              </NavButton>
            )}
            <NavButton active={activeTab === 'party_maker'} onClick={() => setActiveTab('party_maker')} icon={<Sword size={20} />}>
              성역 파티 매칭
            </NavButton>

            <div className="w-full h-px bg-slate-100 dark:bg-slate-800 my-4" />

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
              className="w-[200%] max-w-none h-auto drop-shadow-2xl animate-in fade-in zoom-in duration-700 hover:scale-105 transition-transform origin-bottom -translate-x-3 translate-y-10"
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
            {activeTab === 'party_maker' && isMounted && <RaidPartyMakerV3 testMode={debugClicks >= 5} />}
            {activeTab === 'members' && <MemberList />}
            {activeTab === 'ranking' && <RankingBoard />}
            {activeTab === 'sub_characters' && <SubCharacterList />}
            <div className={activeTab === 'alerter_integration' ? 'block' : 'hidden'}>
              <AlerterIntegration showDiagnostics={debugClicks >= 5} />
            </div>
            {activeTab === 'calculator' && <MarketCalculator />}
          </div>
        </section>
      </div>

      {/* Verification Modal */}
      {isVerifyModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[2.5rem] shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-10 flex flex-col items-center text-center">
              <div className="w-20 h-20 bg-indigo-50 dark:bg-indigo-900/30 rounded-3xl flex items-center justify-center text-indigo-500 mb-6 shadow-sm">
                <Shield size={40} className="stroke-[2.5px]" />
              </div>
              <h3 className="text-xl font-black text-slate-900 dark:text-white mb-2">
                {mode === 'fixed' ? (
                  <>길드 사이트로 <br />이동하시겠습니까?</>
                ) : (
                  <>고정파티 관리 페이지로 <br />이동하시겠습니까?</>
                )}
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-8 font-medium">
                {mode === 'fixed' ? '길드원 전용 메인 페이지로 이동합니다.' : (
                  <>권한 확인을 위해 부트띠 파티 멤버 중 <br />한 명의 본캐 닉네임을 입력해 주세요.</>
                )}
              </p>

              <div className="w-full space-y-4">
                {mode !== 'fixed' && (
                  <input
                    type="text"
                    value={verifyInput}
                    onChange={(e) => setVerifyInput(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl px-6 py-4 font-black focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all text-center placeholder:font-bold"
                    placeholder="닉네임 입력"
                    onKeyDown={(e) => e.key === 'Enter' && handleVerify()}
                    autoFocus
                  />
                )}

                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setIsVerifyModalOpen(false);
                      setVerifyInput('');
                    }}
                    className="flex-1 py-4 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-300 font-black rounded-2xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-all active:scale-95"
                  >
                    취소
                  </button>
                  <button
                    onClick={mode === 'fixed' ? () => window.location.href = '/' : handleVerify}
                    disabled={mode !== 'fixed' && !verifyInput}
                    className="flex-1 py-4 bg-indigo-500 text-white font-black rounded-2xl shadow-xl shadow-indigo-500/20 hover:bg-indigo-600 active:scale-95 transition-all disabled:opacity-50"
                  >
                    확인
                  </button>
                </div>
              </div>
            </div>
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
