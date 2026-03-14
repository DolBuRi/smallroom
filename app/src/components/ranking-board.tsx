'use client';

import React, { useState, useEffect } from 'react';
import { Trophy, Clock, Filter, Loader2, Award, Zap, RefreshCw, AlertCircle, Users } from 'lucide-react';
import { cn, formatRelativeTime } from '@/lib/utils';
import { GuildMember, SERVER_LIST } from './member-list';

import { db } from '@/lib/firebase';
import { ref, onValue, set, remove } from 'firebase/database';
import { useAuth } from '@/context/AuthContext';
import { useAppMode } from '@/context/ModeContext';

export default function RankingBoard() {
    const [data, setData] = useState<GuildMember[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('All');
    const [lastUpdated, setLastUpdated] = useState<string | null>(null);
    const { isAdmin } = useAuth();
    const { dbPath, mode } = useAppMode();
    const [isBatchRunning, setIsBatchRunning] = useState(false);
    const [progress, setProgress] = useState({ current: 0, total: 0, status: '' });
    const [appSettings, setAppSettings] = useState({
        guildName: '츄',
        serverId: '1006',
        serverName: '아리엘',
        adminPassword: '1234'
    });

    // Individual Manual Update State
    const [manualUpdateName, setManualUpdateName] = useState('');
    const [isManualUpdating, setIsManualUpdating] = useState(false);

    const classes = ['All', '수호성', '검성', '살성', '궁성', '마도성', '정령성', '치유성', '호법성'];

    useEffect(() => {
        const membersRef = ref(db, dbPath.members);
        const unsubscribe = onValue(membersRef, (snapshot) => {
            const val = snapshot.val();
            if (val) {
                const members = (Object.values(val) as any[]).map((m: any) => {
                    // Legion page에서 등록된 경우 server/faction이 없을 수 있음. 
                    // 고정 멤버 랭킹에서는 기본 설정을 바탕으로 이를 보완하여 표시함.
                    const server = m.server || (mode === 'fixed' ? appSettings.serverName : undefined);
                    const faction = m.faction || (server ? (SERVER_LIST as any[]).find((s: any) => s.name === server)?.faction : undefined);
                    
                    return {
                        ...m,
                        server,
                        faction,
                        clearCount: m.clearCount || '0회'
                    };
                });
                setData(members);
            } else {
                setData([]);
            }
            setLoading(false);
        }, (error) => {
            console.error("Firebase read failed:", error);
            setLoading(false);
        });

        // [Fix] Listen to the dedicated Last Full Refresh timestamp instead of calculating it
        const metadataRef = ref(db, dbPath.lastFullRefresh);
        const unsubscribeMeta = onValue(metadataRef, (snapshot) => {
            setLastUpdated(snapshot.val());
        });

        return () => {
            unsubscribe();
            unsubscribeMeta();
        };
    }, [dbPath]);

    const scrapeMember = async (name: string, serverId: string = '1006') => {
        // [Hybrid Strategy]
        // 1. Try Server-Side Proxy first (for Headless Server users)
        try {
            const res = await fetch('/api/proxy/scrape', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, serverId })
            });
            if (res.ok) {
                const data = await res.json();
                if (data.success) return data;
            }
        } catch (e) {
            console.warn("Server scraping failed, falling back to extension:", e);
        }

        const serverName = (SERVER_LIST as any[]).find(s => s.id === serverId)?.name || '아리엘';
        const faction = (SERVER_LIST as any[]).find(s => s.id === serverId)?.faction;

        // 2. Fallback to Extension (for Client-Side users)
        return new Promise<{ success: boolean, data?: any, error?: string }>((resolve) => {
            const handleResponse = (event: MessageEvent) => {
                if (event.source !== window || event.data.type !== 'AONI_SEARCH_RESPONSE') return;
                window.removeEventListener('message', handleResponse);
                resolve(event.data);
            };
            window.addEventListener('message', handleResponse);
            setTimeout(() => {
                window.removeEventListener('message', handleResponse);
                resolve({ success: false, error: 'Timeout' });
            }, 20000); // 20초 대기
            window.postMessage({ type: 'AONI_SEARCH_REQUEST', name, server: serverName, serverId, faction }, "*");
        });
    };

    const handleRefreshAll = async () => {
        if (isBatchRunning) return;

        // 5분 쿨타임 체크 (관리자는 무시)
        if (!isAdmin) {
            const lastUpdateDate = lastUpdated ? new Date(lastUpdated) : new Date(0);
            const diffMinutes = (Date.now() - lastUpdateDate.getTime()) / 60000;

            if (diffMinutes < 5) {
                const remaining = Math.ceil(5 - diffMinutes);
                alert(`마지막 갱신으로부터 5분간 갱신이 제한됩니다.\n(${remaining}분 후에 다시 시도해주세요)`);
                return;
            }
        }

        if (!confirm(`총 ${data.length}명의 소속 길드원 정보를 갱신합니다.\n시간이 다소 소요될 수 있습니다. 진행하시겠습니까?`)) return;

        setIsBatchRunning(true);
        setProgress({ current: 0, total: data.length, status: '시작 중...' });

        let updatedList = [...data];
        let successCount = 0;

        for (let i = 0; i < data.length; i++) {
            const member = data[i];
            setProgress({ current: i + 1, total: data.length, status: `${member.name} 갱신 중...` });

            try {
                const targetServerId = member.server ? ((SERVER_LIST as any[]).find(s => s.name === member.server)?.id || '1006') : '1006';
                const res = await scrapeMember(member.name, targetServerId);
                if (res.success && res.data) {
                    updatedList[i] = {
                        ...member,
                        power: parseInt(res.data.power),
                        score: parseInt(res.data.score) || 0,
                        class: res.data.class,
                        guild: res.data.guild,
                        isActive: (res.data.guild === appSettings.guildName),
                        lastUpdated: new Date().toISOString()
                    };
                    successCount++;
                }
            } catch (e) { console.error(e); }
            await new Promise(r => setTimeout(r, 1000));
        }

        // Save back to server
        try {
            await set(ref(db, dbPath.members), updatedList);
            // [New] Update Last Full Refresh Timestamp
            await set(ref(db, dbPath.lastFullRefresh), new Date().toISOString());
        } catch (e) {
            console.error("Failed to save refreshed data:", e);
            alert("저장 실패! (Firebase 오류)");
        }

        setIsBatchRunning(false);
        alert(`갱신 완료! (성공: ${successCount}/${data.length})`);
    };

    const handleManualUpdate = async () => {
        if (!manualUpdateName.trim()) return;

        const targetMember = data.find(m => m.name === manualUpdateName.trim());
        if (!targetMember) {
            alert("랭킹 리스트에 없는 멤버입니다.");
            return;
        }

        setIsManualUpdating(true);
        try {
            const targetServerId = targetMember.server ? ((SERVER_LIST as any[]).find(s => s.name === targetMember.server)?.id || '1006') : '1006';
            const res = await scrapeMember(manualUpdateName, targetServerId);
            if (res.success && res.data) {
                const updatedList = data.map(m => m.name === manualUpdateName.trim() ? {
                    ...m,
                    power: parseInt(res.data.power),
                    score: parseInt(res.data.score) || 0,
                    class: res.data.class,
                    guild: res.data.guild,
                    isActive: (res.data.guild === appSettings.guildName),
                    lastUpdated: new Date().toISOString()
                } : m);

                // Optimistic update
                setData(updatedList);

                // Save to Firebase
                await set(ref(db, dbPath.members), updatedList);

                alert(`${manualUpdateName} 갱신 완료!`);
                setManualUpdateName(''); // Clear input on success
            } else {
                alert(`갱신 실패: ${res.error || '데이터를 찾을 수 없습니다.'}`);
            }
        } catch (e) {
            console.error(e);
            alert("오류가 발생했습니다.");
        } finally {
            setIsManualUpdating(false);
        }
    };

    // Sorting State
    const [sortBy, setSortBy] = useState<'power' | 'score'>('power');

    const filtered = data
        .filter(m => m && m.name && m.id) // 1. 유효한 데이터만 필터링
        .reduce((acc, current) => { // 2. 중복 ID 제거
            if (!acc.find(item => item.id === current.id)) {
                acc.push(current);
            }
            return acc;
        }, [] as GuildMember[])
        .filter(m => activeTab === 'All' ? true : m.class === activeTab)
        .sort((a, b) => {
            if (sortBy === 'power') return b.power - a.power;
            return (b.score || 0) - (a.score || 0);
        });

    return (
        <div className="space-y-4 animate-in fade-in duration-700">
            {/* ... Header and Refresh UI ... */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div>
                    <h2 className="text-4xl font-black text-slate-900 dark:text-white flex items-center gap-3 tracking-tight">
                        <Trophy className="text-amber-500" size={36} />
                        {mode === 'fixed' ? '고정 멤버 랭킹' : '레기온 멤버 랭킹'}
                    </h2>
                    <div className="flex items-center gap-4 mt-3 font-medium">
                        <div className="text-slate-500 dark:text-slate-300 text-sm flex items-center gap-2">
                            <Users size={14} className="text-amber-500" />
                            {data.length}명의 멤버 랭킹입니다.
                            <div className="group relative flex items-center">
                                <AlertCircle size={14} className="text-slate-400 cursor-help" />
                                <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-3 py-1.5 bg-slate-800 text-white text-xs rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-lg z-10">
                                    정각마다 자동 갱신됩니다.
                                    <div className="absolute left-1/2 -translate-x-1/2 top-full border-4 border-transparent border-t-slate-800"></div>
                                </div>
                            </div>
                        </div>
                        <span className="text-[11px] bg-slate-100/80 dark:bg-slate-800/80 text-slate-400 dark:text-slate-300 px-3 py-1 rounded-full flex items-center gap-1.5 border border-slate-200 dark:border-slate-700">
                            <Clock size={12} />
                            마지막 전체 갱신: {lastUpdated ? formatRelativeTime(lastUpdated) : '기록 없음'}
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {/* ... Refresh Controls ... */}
                    {isBatchRunning && (
                        <div className="flex flex-col items-end mr-2">
                            <span className="text-indigo-500 font-black animate-pulse text-[11px] uppercase tracking-widest">
                                [{progress.current}/{progress.total}] Refreshing...
                            </span>
                            <span className="text-[10px] text-slate-400 font-bold">{progress.status}</span>
                        </div>
                    )}

                    <div className="hidden md:flex items-center gap-1 bg-white/80 dark:bg-slate-800/80 backdrop-blur-md p-1 pr-1.5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm h-12">
                        <input
                            type="text"
                            placeholder="닉네임 갱신"
                            className="w-48 h-full bg-transparent text-sm font-black px-3 outline-none text-slate-700 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-400"
                            value={manualUpdateName}
                            onChange={(e) => setManualUpdateName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleManualUpdate()}
                        />
                        <button
                            onClick={handleManualUpdate}
                            disabled={isManualUpdating || !manualUpdateName}
                            className="h-full aspect-square rounded-xl bg-indigo-50 dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500 hover:text-white dark:hover:bg-indigo-500 border border-indigo-100/50 dark:border-slate-600 flex items-center justify-center transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            title="개별 갱신"
                        >
                            {isManualUpdating ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
                        </button>
                    </div>

                    <div className="w-px h-8 bg-slate-200 dark:bg-slate-700 mx-0 hidden md:block" />
                    <button
                        onClick={handleRefreshAll}
                        disabled={isBatchRunning}
                        className="glass-btn flex items-center gap-3 h-12 px-6"
                    >
                        {isBatchRunning ? `갱신 중...` : "전체 정보 갱신"}
                        <RefreshCw className={cn("w-5 h-5", isBatchRunning && "animate-spin")} />
                    </button>
                </div>
            </div>

            {/* Tabs and Sort Controls */}
            <div className="flex flex-col md:flex-row justify-between items-end md:items-center gap-4">
                <div className="flex gap-2 overflow-x-auto no-scrollbar w-full md:w-auto p-1 py-3">
                    {classes.map(c => <button
                        key={c}
                        onClick={() => setActiveTab(c)}
                        className={cn(
                            "px-6 py-2.5 rounded-2xl text-sm font-black transition-all border whitespace-nowrap",
                            activeTab === c
                                ? "bg-indigo-500 text-white border-indigo-500 shadow-lg shadow-indigo-100 dark:shadow-none scale-105"
                                : "bg-white dark:bg-slate-800 text-slate-400 dark:text-slate-300 border-slate-100 dark:border-slate-700 hover:border-indigo-200 dark:hover:border-indigo-500/50 hover:text-slate-600 dark:hover:text-slate-200 shadow-sm"
                        )}
                    >
                        {c}
                    </button>
                    )}
                </div>

                {/* Sort Buttons */}
                <div className="flex items-center gap-2 bg-white/50 dark:bg-slate-800 p-1 rounded-xl border border-slate-100 dark:border-slate-700">
                    <button
                        onClick={() => setSortBy('power')}
                        className={cn(
                            "px-4 py-1.5 rounded-lg text-[11px] font-black transition-all flex items-center gap-2 uppercase tracking-tight",
                            sortBy === 'power'
                                ? "bg-indigo-50 dark:bg-indigo-600 text-indigo-600 dark:text-white shadow-sm ring-1 ring-indigo-100 dark:ring-0"
                                : "text-slate-400 dark:text-slate-300 hover:text-slate-600 dark:hover:text-slate-200"
                        )}
                    >
                        <Zap size={12} />
                        전투력 순
                    </button>
                    <button
                        onClick={() => setSortBy('score')}
                        className={cn(
                            "px-4 py-1.5 rounded-lg text-[11px] font-black transition-all flex items-center gap-2 uppercase tracking-tight",
                            sortBy === 'score'
                                ? "bg-amber-50 dark:bg-amber-600 text-amber-600 dark:text-white shadow-sm ring-1 ring-amber-100 dark:ring-0"
                                : "text-slate-400 dark:text-slate-300 hover:text-slate-600 dark:hover:text-slate-200"
                        )}
                    >
                        <Trophy size={12} />
                        아툴 점수 순
                    </button>
                </div>
            </div>

            <div className="min-h-[400px]">
                {loading ? (
                    <div className="flex flex-col justify-center items-center h-60 text-slate-400 gap-4">
                        <Loader2 className="animate-spin text-indigo-500" size={40} />
                        <p className="font-bold">랭킹을 집계하고 있습니다...</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-4">
                        {filtered.length === 0 ? (
                            <div className="text-center py-20 text-slate-300 font-bold glass-panel">
                                아직 데이터가 없습니다. <br /> 멤버 정보에서 정보를 갱신해주세요.
                            </div>
                        ) : filtered.map((m, idx) => (
                            <div key={m.id} className="glass-panel p-6 flex items-center gap-6 hover:border-indigo-200 hover:shadow-xl hover:shadow-indigo-50/50 transition-all group relative overflow-hidden">
                                {idx < 3 && (
                                    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                                        <Award size={80} className={cn(idx === 0 ? "text-amber-500" : idx === 1 ? "text-slate-400" : "text-amber-700")} />
                                    </div>
                                )}

                                <div className={cn(
                                    "w-12 h-12 flex items-center justify-center rounded-2xl font-black text-xl shadow-inner transition-transform group-hover:scale-110",
                                    idx === 0 ? "bg-amber-100 dark:bg-amber-500 text-amber-600 dark:text-white shadow-amber-200/50 dark:shadow-amber-900/50 shadow-lg" :
                                        idx === 1 ? "bg-slate-100 dark:bg-slate-500 text-slate-500 dark:text-white shadow-slate-200/50 dark:shadow-slate-900/50 shadow-lg" :
                                            idx === 2 ? "bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-white shadow-orange-200/50 dark:shadow-orange-950/50 shadow-lg" : "bg-slate-50 dark:bg-slate-800 text-slate-300 dark:text-slate-300"
                                )}>
                                    {idx + 1}
                                </div>

                                <div className="flex-1">
                                    <div className="flex items-center gap-3">
                                        <span className="text-2xl font-black text-slate-800 dark:text-slate-200 tracking-tight">{m.name}</span>
                                        <span className="px-3 py-1 bg-slate-50 dark:bg-slate-700/50 text-slate-400 dark:text-indigo-200 text-[10px] font-black rounded-lg border border-slate-100 dark:border-slate-700 tracking-widest uppercase">{m.class}</span>
                                        {m.rank === '군단장' && <span className="text-[10px] bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-500 px-2 py-0.5 rounded-md font-black border border-amber-100 dark:border-amber-900/30 tracking-tight">군단장</span>}
                                        {(m.rank === '장교' || m.rank === '엘리트 장교') && <span className="text-[10px] bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded-md font-black border border-indigo-100 dark:border-indigo-900/30 tracking-tight">장교</span>}

                                    </div>
                                </div>

                                <div className="text-right flex items-center gap-8">
                                    <div className={cn("flex flex-col transition-opacity duration-300", sortBy === 'power' ? "opacity-100 scale-100" : "opacity-60 dark:opacity-80 scale-95")}>
                                        <span className="text-[10px] text-slate-400 dark:text-slate-300 font-black uppercase tracking-[0.2em] mb-1">Combat Power</span>
                                        <span className={cn("font-black tracking-tighter tabular-nums drop-shadow-sm transition-colors duration-300", sortBy === 'power' ? "text-3xl text-indigo-500" : "text-xl text-slate-500 dark:text-slate-300")}>
                                            {m.power.toLocaleString()}
                                        </span>
                                    </div>
                                    <div className={cn("flex flex-col transition-opacity duration-300", sortBy === 'score' ? "opacity-100 scale-100" : "opacity-60 dark:opacity-80 scale-95")}>
                                        <span className="text-[10px] text-slate-400 dark:text-slate-300 font-black uppercase tracking-[0.2em] mb-1">AT SCORE</span>
                                        <span className={cn("font-black tracking-tighter tabular-nums drop-shadow-sm transition-colors duration-300", sortBy === 'score' ? "text-3xl text-amber-500" : "text-xl text-slate-500 dark:text-slate-300")}>
                                            {(m.score || 0).toLocaleString()}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div >
    );
}
