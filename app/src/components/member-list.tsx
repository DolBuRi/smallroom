'use client';

import React, { useState, useEffect } from 'react';
import { RefreshCw, Users, UserCheck, UserX, Search, Plus, Trash2, Settings, X, Check, Loader2, Save, Clock, AlertCircle, ChevronDown, Sheet } from 'lucide-react';
import { cn, formatRelativeTime } from '@/lib/utils';

// Data Type
export interface GuildMember {
    id: string;
    name: string;
    rank: '군단장' | '엘리트 장교' | '군단병';
    class: string;
    power: number;
    guild: string;
    isActive: boolean;
    clearCount: string;
    score?: number;
    lastUpdated?: string;
}

const SERVER_LIST = [
    { id: 'all', name: '전체 서버' },
    { id: '1006', name: '아리엘' },
    { id: '2001', name: '이스라펠' },
    { id: '1001', name: '시엘' },
    { id: '1002', name: '네자칸' },
    { id: '2002', name: '지켈' },
    { id: '2003', name: '트리니엘' },
];

import { db } from '@/lib/firebase';
import { ref, onValue, set } from 'firebase/database';
import { useAuth } from '@/context/AuthContext';

// ... (GuildMember interface and SERVER_LIST remain the same)

export default function MemberList() {
    const { isAdmin, user, loading } = useAuth();
    const [members, setMembers] = useState<GuildMember[]>([]);
    const [isLoadingData, setIsLoadingData] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [permissionError, setPermissionError] = useState(false);

    // Global Settings State
    const [appSettings, setAppSettings] = useState({
        guildName: '츄',
        serverId: '1006',
        serverName: '아리엘',
        adminPassword: '1234'
    });

    // Batch Progress State
    const [progress, setProgress] = useState({ current: 0, total: 0, status: '' });
    const [isBatchRunning, setIsBatchRunning] = useState(false);

    // Management Mode State
    const [isManageMode, setIsManageMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);

    // Add Member Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [searchName, setSearchName] = useState('');
    const [searchServer, setSearchServer] = useState('1006');
    const [searchResult, setSearchResult] = useState<GuildMember | null | 'not-found' | 'blocked'>(null);
    const [isSearching, setIsSearching] = useState(false);

    // Individual Manual Update State
    const [manualUpdateName, setManualUpdateName] = useState('');
    const [isManualUpdating, setIsManualUpdating] = useState(false);

    const [lastFullRefresh, setLastFullRefresh] = useState<string | null>(null);

    useEffect(() => {
        if (loading) return; // Wait for Auth to initialize

        // If after loading we still have no user (and no anonymous user), we can't read.
        if (!user) {
            console.log("No user authenticated yet (waiting for anonymous or google sign-in).");
            // Ideally AuthContext handles this, but if it fails:
            setPermissionError(true);
            setIsLoadingData(false);
            return;
        }

        const membersRef = ref(db, 'members');
        const unsubscribe = onValue(membersRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                const normalized = (Object.values(data) as any[]).map((m: any) => ({
                    ...m,
                    clearCount: m.clearCount || '0회',
                    score: m.score || 0
                }));
                // Sort by default on load (optional, but good for consistency)
                setMembers(normalized);
            } else {
                setMembers([]);
            }
            setIsLoadingData(false);
        }, (error) => {
            console.error("Firebase read failed:", error);
            if (error.message.includes("permission_denied")) {
                setPermissionError(true);
            }
            setIsLoadingData(false);
        });

        // Listen for Last Full Refresh Timestamp
        const metadataRef = ref(db, 'metadata/lastFullRefresh');
        const unsubscribeMeta = onValue(metadataRef, (snapshot) => {
            setLastFullRefresh(snapshot.val());
        });

        return () => {
            unsubscribe();
            unsubscribeMeta();
        };
    }, [user, loading]);

    const saveMembers = async (newMembers: GuildMember[]) => {
        // if (!isAdmin) {
        //     alert("관리자만 변경할 수 있습니다.");
        //     return;
        // }
        setIsSaving(true);
        try {
            await set(ref(db, 'members'), newMembers);
        } catch (e) {
            console.error("Save failed:", e);
            alert("저장 실패! (Firebase 오류)");
        } finally {
            setIsSaving(false);
        }
    };

    const updateMembers = (newList: GuildMember[]) => {
        // Optimistic update
        setMembers(newList);
        saveMembers(newList);
    };

    const scrapeMember = async (name: string, server: string = '아리엘') => {
        // [Hybrid Strategy]
        // 1. Try Server-Side Proxy first (for Headless Server users)
        try {
            const res = await fetch('/api/proxy/scrape', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name })
            });
            if (res.ok) {
                const data = await res.json();
                if (data.success) return data;
            }
        } catch (e) {
            console.warn("Server scraping failed, falling back to extension:", e);
        }

        // 2. Fallback to Extension (for Client-Side users)
        return new Promise<any>((resolve) => {
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
            window.postMessage({ type: 'AONI_SEARCH_REQUEST', name, server }, "*");
        });
    };

    const handleRefreshAll = async () => {
        if (isBatchRunning) return;

        // 5분 쿨타임 체크 (관리자는 무시)
        if (!isAdmin) {
            const lastUpdateDate = lastFullRefresh ? new Date(lastFullRefresh) : new Date(0);
            const diffMinutes = (Date.now() - lastUpdateDate.getTime()) / 60000;

            if (diffMinutes < 5) {
                const remaining = Math.ceil(5 - diffMinutes);
                alert(`마지막 갱신으로부터 5분간 갱신이 제한됩니다.\n(${remaining}분 후에 다시 시도해주세요)`);
                return;
            }
        }

        if (!confirm(`총 ${members.length}명의 소속 길드원 정보를 갱신합니다.\n시간이 다소 소요될 수 있습니다. 진행하시겠습니까?`)) return;

        setIsBatchRunning(true);
        setProgress({ current: 0, total: members.length, status: '시작 중...' });

        let updatedList = [...members];
        let successCount = 0;

        // [Optimized: Parallel] 3 concurrent requests + 4s delay
        const CONCURRENT_LIMIT = 3;
        const DELAY_MS = 4000;

        for (let i = 0; i < members.length; i += CONCURRENT_LIMIT) {
            const chunk = members.slice(i, i + CONCURRENT_LIMIT);

            // Process chunk in parallel
            await Promise.all(chunk.map(async (member, chunkIdx) => {
                const currentIdx = i + chunkIdx;
                setProgress({ current: currentIdx + 1, total: members.length, status: `갱신 중...` });

                try {
                    const res = await scrapeMember(member.name, appSettings.serverName);
                    if (res.success && res.data) {
                        updatedList[currentIdx] = {
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
            }));

            // Delay between chunks (not after the last one)
            if (i + CONCURRENT_LIMIT < members.length) {
                await new Promise(r => setTimeout(r, DELAY_MS));
            }
        }

        updateMembers(updatedList);

        // [New] Update Last Full Refresh Timestamp
        try {
            await set(ref(db, 'metadata/lastFullRefresh'), new Date().toISOString());
        } catch (e) {
            console.error("Failed to update lastFullRefresh timestamp:", e);
        }

        setIsBatchRunning(false);
        alert(`갱신 완료! (성공: ${successCount}/${members.length})`);
    };

    const handleSearch = async () => {
        if (!searchName.trim()) return;
        setIsSearching(true);
        setSearchResult(null);
        try {
            const targetServer = SERVER_LIST.find(s => s.id === searchServer)?.name || appSettings.serverName;
            const result = await scrapeMember(searchName, targetServer);
            if (result.success && result.data) {
                setSearchResult({
                    id: String(Date.now()),
                    name: result.data.name,
                    rank: '군단병',
                    class: result.data.class,
                    power: parseInt(result.data.power),
                    score: parseInt(result.data.score) || 0,
                    guild: result.data.guild,
                    isActive: result.data.guild === appSettings.guildName,
                    clearCount: '0회',
                    lastUpdated: new Date().toISOString()
                });
            } else { setSearchResult('not-found'); }
        } catch (e) { alert("검색 중 오류 발생"); }
        finally { setIsSearching(false); }
    };

    const handleManualUpdate = async () => {
        if (!manualUpdateName.trim()) return;

        const targetMember = members.find(m => m.name === manualUpdateName.trim());
        if (!targetMember) {
            alert("리스트에 없는 멤버입니다. '추가' 버튼을 통해 먼저 등록해주세요.");
            return;
        }

        setIsManualUpdating(true);
        try {
            const res = await scrapeMember(manualUpdateName, appSettings.serverName);
            if (res.success && res.data) {
                const updatedList = members.map(m => m.name === manualUpdateName.trim() ? {
                    ...m,
                    power: parseInt(res.data.power),
                    score: parseInt(res.data.score) || 0,
                    class: res.data.class,
                    guild: res.data.guild,
                    isActive: (res.data.guild === appSettings.guildName),
                    lastUpdated: new Date().toISOString()
                } : m);

                updateMembers(updatedList);
                alert(`${manualUpdateName} 갱신 완료!`);
                setManualUpdateName(''); // Clear input on success
            } else {
                alert(`갱신 실패: ${res.error || '데이터를 찾을 수 없습니다.'}`);
            }
        } catch (e) {
            console.error(e);
            alert("삭제된 캐릭터거나 일시적인 오류입니다.");
        } finally {
            setIsManualUpdating(false);
        }
    };

    const confirmAdd = () => {
        if (searchResult && typeof searchResult !== 'string') {
            if (members.some(m => m.name === searchResult.name)) {
                alert("이미 등록된 멤버입니다.");
                return;
            }
            updateMembers([...members, searchResult]);
            closeModal();
        } else if (searchResult === 'not-found') {
            const cls = (document.getElementById('manual-class') as HTMLSelectElement).value;
            const pwr = parseInt((document.getElementById('manual-power') as HTMLInputElement).value) || 0;
            updateMembers([...members, {
                id: Date.now().toString(),
                name: searchName,
                rank: '군단병',
                class: cls as any,
                power: pwr,
                score: 0,
                guild: '-',
                isActive: false,
                clearCount: '0회',
                lastUpdated: new Date().toISOString()
            }]);
            closeModal();
        }
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setSearchName('');
        setSearchServer(appSettings.serverId);
        setSearchResult(null);
    };

    const updateRank = (id: string, newRank: GuildMember['rank']) => {
        if (!isAdmin) {
            alert("관리자 권한이 필요합니다.");
            return;
        }
        const newList = members.map(m => m.id === id ? { ...m, rank: newRank } : m);
        updateMembers(newList);
    };

    const updateClearCount = (id: string, newCount: string) => {
        if (!isAdmin) {
            alert("관리자 권한이 필요합니다.");
            return;
        }
        const newList = members.map(m => m.id === id ? { ...m, clearCount: newCount } : m);
        updateMembers(newList);
    };

    const toggleSelection = (id: string) => {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    };

    const deleteSelected = () => {
        if (confirm(`${selectedIds.length}명을 삭제하시겠습니까?`)) {
            const newList = members.filter(m => !selectedIds.includes(m.id));
            updateMembers(newList);
            setSelectedIds([]);
            setIsManageMode(false);
        }
    };

    const getSortedMembers = () => {
        const rankPriority: Record<string, number> = { '군단장': 0, '엘리트 장교': 1, '군단병': 2 };
        return [...members].sort((a, b) => {
            const rankDiff = rankPriority[a.rank] - rankPriority[b.rank];
            if (rankDiff !== 0) return rankDiff;
            const powerDiff = b.power - a.power;
            if (powerDiff !== 0) return powerDiff;
            return a.name.localeCompare(b.name, 'ko');
        });
    };

    const sortedMembers = getSortedMembers();
    // Removed legacy calculation logic
    // const lastUpdateItem = members...

    return (
        <div className="space-y-8 animate-in fade-in duration-700 min-w-[1050px]">
            <div className="flex justify-between items-center gap-6">
                <div>
                    <h2 className="text-4xl font-black text-slate-900 dark:text-white flex items-center gap-3 tracking-tight">
                        <Users className="text-indigo-500 dark:text-indigo-400" size={36} />
                        레기온 멤버
                        {isSaving && <Loader2 size={24} className="text-slate-300 animate-spin ml-2" />}
                    </h2>
                    <div className="flex items-center gap-4 mt-3 font-medium">
                        <div className="text-slate-500 dark:text-slate-300 text-sm flex items-center gap-2">
                            총 {members.length}명의 멤버가 존재합니다.
                            <div className="group relative flex items-center">
                                <AlertCircle size={14} className="text-slate-400 cursor-help" />
                                <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-3 py-1.5 bg-slate-800 text-white text-xs rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-lg z-10">
                                    정각마다 자동 갱신됩니다.
                                    <div className="absolute left-1/2 -translate-x-1/2 top-full border-4 border-transparent border-t-slate-800"></div>
                                </div>
                            </div>
                        </div>
                        {lastFullRefresh && (
                            <span className="text-[11px] bg-slate-100/80 dark:bg-slate-800/80 text-slate-400 dark:text-slate-300 px-3 py-1 rounded-full flex items-center gap-1.5 border border-slate-200 dark:border-slate-700">
                                <Clock size={12} />
                                마지막 전체 갱신: {formatRelativeTime(lastFullRefresh)}
                            </span>
                        )}
                        {isBatchRunning && (
                            <span className="text-indigo-500 font-black animate-pulse text-sm">
                                [{progress.current}/{progress.total}] {progress.status}
                            </span>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={() => window.open('https://docs.google.com/spreadsheets/d/1L3XMo2hOd9drdGPT25S3kNdajxfVCeHf6k0Oznz3K70/edit?gid=0#gid=0', '_blank')}
                        className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 transition-all px-4 py-3 rounded-2xl flex items-center gap-2 text-sm font-bold border border-emerald-100 shadow-sm dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800"
                    >
                        <Sheet size={18} /> 구글 시트
                    </button>

                    {!isManageMode ? (
                        <button
                            onClick={() => {
                                if (!isAdmin) {
                                    alert("관리자 권한이 필요합니다.\n(좌측 하단에서 로그인을 진행해주세요)");
                                    return;
                                }
                                setIsManageMode(true);
                            }}
                            disabled={isBatchRunning}
                            className="text-slate-500 hover:text-indigo-600 hover:bg-white transition-all px-4 py-3 rounded-2xl flex items-center gap-2 text-sm font-bold border border-transparent hover:border-indigo-100 shadow-sm dark:text-slate-400"
                        >
                            <Settings size={18} /> 관리하기
                        </button>
                    ) : (
                        <div className="flex items-center gap-2 bg-white/80 dark:bg-slate-800/80 backdrop-blur-md p-1.5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
                            <button onClick={() => setIsModalOpen(true)} className="px-4 py-2 text-sm font-bold text-indigo-500 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-xl transition-all flex items-center gap-2">
                                <Plus size={16} /> 추가
                            </button>
                            <div className="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-1" />
                            {selectedIds.length > 0 && (
                                <button onClick={deleteSelected} className="px-4 py-2 text-sm font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-xl transition-all flex items-center gap-2">
                                    <Trash2 size={16} /> 삭제 ({selectedIds.length})
                                </button>
                            )}
                            <button onClick={() => { setIsManageMode(false); setSelectedIds([]); }} className="px-4 py-2 text-sm font-black text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-all">닫기</button>
                        </div>
                    )}

                    {/* Standard Toolbar - Always Visible now, but shrunk in Manage Mode */}
                    <div className="w-px h-8 bg-slate-200 dark:bg-slate-700 mx-0 hidden md:block" />

                    {/* Individual Update Input */}
                    <div className="hidden md:flex items-center gap-1 bg-white/80 dark:bg-slate-800/80 backdrop-blur-md p-1 pr-1.5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm h-12 transition-all">
                        <input
                            type="text"
                            placeholder="닉네임 갱신"
                            className={cn(
                                "h-full bg-transparent text-sm font-black px-3 outline-none text-slate-700 dark:text-slate-200 placeholder:text-slate-400 transition-all duration-300",
                                isManageMode ? "w-28" : "w-48"
                            )}
                            value={manualUpdateName}
                            onChange={(e) => setManualUpdateName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleManualUpdate()}
                        />
                        <button
                            onClick={handleManualUpdate}
                            disabled={isManualUpdating || !manualUpdateName}
                            className="h-full aspect-square rounded-xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500 hover:text-white border border-indigo-100/50 dark:border-indigo-500/30 flex items-center justify-center transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            title="개별 갱신"
                        >
                            {isManualUpdating ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
                        </button>
                    </div>

                    <div className="w-px h-8 bg-slate-200 dark:bg-slate-700 mx-0 hidden md:block" />
                    <button onClick={handleRefreshAll} disabled={isBatchRunning} className="glass-btn flex items-center gap-3 h-12 px-6">
                        {isBatchRunning ? `갱신 중...` : "전체 정보 갱신"}
                        <RefreshCw className={cn("w-5 h-5", isBatchRunning && "animate-spin")} />
                    </button>
                </div>
            </div>

            <div className="glass-panel overflow-hidden relative">
                {isBatchRunning && (
                    <div className="absolute top-0 left-0 w-full h-1 z-50">
                        <div className="h-full bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)] transition-all duration-300" style={{ width: `${(progress.current / progress.total) * 100}%` }} />
                    </div>
                )}
                {permissionError && (
                    <div className="flex flex-col items-center justify-center min-h-[400px] text-red-500 gap-4 p-8 text-center bg-red-50/50 rounded-xl mb-4">
                        <AlertCircle className="w-12 h-12" />
                        <h3 className="font-black text-lg">데이터 접근 권한이 없습니다.</h3>
                        <p className="text-sm font-bold text-slate-600 max-w-sm">
                            Firebase 콘솔에서 [Authentication] - [Sign-in method] 탭의 <br />
                            <span className="text-red-600 underline">익명(Anonymous) 로그인</span>이 활성화되어 있는지 확인해주세요.
                        </p>
                        <p className="text-xs text-slate-400">또는 관리자 로그인을 시도해주세요.</p>
                    </div>
                )}

                {isLoadingData && !permissionError ? (
                    <div className="flex flex-col items-center justify-center min-h-[400px] text-slate-400 gap-4">
                        <Loader2 className="animate-spin text-indigo-500" size={40} />
                        <p className="font-bold text-sm">데이터를 불러오는 중입니다...</p>
                    </div>
                ) : !permissionError && (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm text-slate-500 dark:text-slate-300 border-collapse">
                            <thead className="bg-slate-50/50 dark:bg-slate-800/50 text-slate-400 uppercase font-black tracking-widest text-[13px] border-b border-slate-100 dark:border-slate-700">
                                <tr>
                                    {isManageMode && (
                                        <th className="w-16 px-2 py-5 text-center">
                                            <div
                                                onClick={() => setSelectedIds(selectedIds.length === members.length ? [] : members.map(m => m.id))}
                                                className="w-6 h-6 mx-auto rounded-lg border-2 border-slate-300 dark:border-slate-600 hover:border-indigo-400 cursor-pointer flex items-center justify-center transition-all"
                                            >
                                                {selectedIds.length === members.length && <Check size={14} className="text-indigo-500" strokeWidth={4} />}
                                            </div>
                                        </th>
                                    )}
                                    <th className="px-8 py-5">닉네임</th>
                                    <th className="px-8 py-5 text-center">계급</th>
                                    <th className="px-8 py-5 text-center">직업</th>
                                    <th className="px-8 py-5 text-center">전투력</th>
                                    <th className="px-8 py-5 text-center">아툴 점수</th>
                                    <th className="px-8 py-5 text-center">성역 클리어</th>
                                    <th className="px-8 py-5 text-center">레기온 소속 여부</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                                {sortedMembers.length === 0 ? (
                                    <tr><td colSpan={6} className="text-center py-20 text-slate-400 font-medium">등록된 멤버가 없습니다.</td></tr>
                                ) : sortedMembers.map(m => (
                                    <tr key={m.id} className={cn("transition-all duration-200", isManageMode && selectedIds.includes(m.id) ? "bg-indigo-50/50 dark:bg-indigo-900/20" : "hover:bg-slate-50/30 dark:hover:bg-slate-800/30")}>
                                        {isManageMode && (
                                            <td className="px-2 py-5 text-center">
                                                <div onClick={() => toggleSelection(m.id)} className={cn("w-6 h-6 mx-auto rounded-lg border-2 flex items-center justify-center cursor-pointer transition-all", selectedIds.includes(m.id) ? "bg-indigo-500 border-indigo-500 text-white" : "border-slate-200 dark:border-slate-700 hover:border-indigo-200")}>
                                                    {selectedIds.includes(m.id) && <Check size={16} strokeWidth={3} />}
                                                </div>
                                            </td>
                                        )}
                                        <td className="px-8 py-5 font-black text-slate-700 dark:text-slate-200">{m.name}</td>
                                        <td className="px-8 py-5 text-center">
                                            <div className="relative w-[130px] mx-auto flex items-center justify-center">
                                                <span className={cn("absolute left-0 pointer-events-none z-10", m.rank === '군단장' ? "text-amber-500" : m.rank === '엘리트 장교' ? "text-indigo-400" : "text-slate-400")}>
                                                    {m.rank === '군단장' ? '👑' : m.rank === '엘리트 장교' ? '🎖️' : '🛡️'}
                                                </span>
                                                <select
                                                    value={m.rank}
                                                    onChange={(e) => updateRank(m.id, e.target.value as any)}
                                                    className={cn(
                                                        "bg-transparent border-none outline-none font-bold cursor-pointer rounded px-2 py-1 transition-all hover:bg-white/50 dark:hover:bg-slate-700/50 text-center w-full appearance-none pl-6",
                                                        m.rank === '군단장' ? "text-amber-500 text-sm" : m.rank === '엘리트 장교' ? "text-indigo-400 text-sm" : "text-slate-400 text-[13px]"
                                                    )}
                                                    style={{ textAlignLast: 'center' }}
                                                >
                                                    <option value="군단장">군 단 장</option>
                                                    <option value="엘리트 장교">엘리트 장교</option>
                                                    <option value="군단병">군 단 병</option>
                                                </select>
                                                <div className="absolute right-0 pointer-events-none text-slate-400">
                                                    <ChevronDown size={14} strokeWidth={3} />
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-8 py-5 text-center font-bold">{m.class}</td>
                                        <td className="px-8 py-5 text-center font-black text-indigo-600 dark:text-indigo-300">{m.power.toLocaleString()}</td>
                                        <td className="px-8 py-5 text-center font-bold text-amber-500">{m.score?.toLocaleString() || 0}</td>
                                        <td className="px-8 py-5 text-center">
                                            <select
                                                value={m.clearCount}
                                                onChange={(e) => updateClearCount(m.id, e.target.value)}
                                                className={cn(
                                                    "bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 outline-none font-bold cursor-pointer rounded-lg px-3 py-1.5 transition-all hover:bg-white dark:hover:bg-slate-700 hover:border-indigo-200 text-xs",
                                                    m.clearCount === '숙련' ? "text-indigo-400 bg-slate-100 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700" : "text-slate-500 dark:text-slate-300"
                                                )}
                                            >
                                                {['0회', '1회', '2회', '3회', '4회', '숙련'].map(c => (
                                                    <option key={c} value={c}>{c}</option>
                                                ))}
                                            </select>
                                        </td>
                                        <td className="px-8 py-5 text-center">
                                            {m.isActive ?
                                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-600 text-xs font-black border border-emerald-100"><Check size={12} strokeWidth={3} /> 확인됨</span> :
                                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-50 text-slate-300 text-xs font-bold border border-slate-100">미확인</span>
                                            }
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300">
                    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-300">
                        <div className="flex justify-between items-center p-6 border-b border-slate-50 dark:border-slate-700">
                            <h3 className="text-xl font-black text-slate-900 dark:text-white">신규 멤버 추가</h3>
                            <button onClick={closeModal} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"><X size={24} /></button>
                        </div>
                        <div className="p-8 space-y-6">
                            <div className="flex gap-3">
                                <div className="flex-1 relative">
                                    <input type="text" placeholder="닉네임 입력 (엔터)" className="glass-input w-full pl-4 pr-12 font-bold focus:ring-4 focus:ring-indigo-100" value={searchName} onChange={(e) => setSearchName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearch()} />
                                    <button onClick={handleSearch} disabled={isSearching || !searchName} className="absolute right-2 top-2 h-8 w-8 flex items-center justify-center bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-all disabled:opacity-50">
                                        {isSearching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                                    </button>
                                </div>
                            </div>
                            <div className="min-h-[140px] flex items-center justify-center bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                                {isSearching ? (
                                    <div className="text-center space-y-2">
                                        <div className="text-indigo-500 font-black animate-pulse">조회 중...</div>
                                        <div className="text-[10px] text-slate-400">데이터를 가져오고 있습니다</div>
                                    </div>
                                ) : searchResult ? (
                                    searchResult === 'not-found' ? (
                                        <div className="text-center p-4">
                                            <p className="text-red-400 font-bold mb-3 text-sm">정보를 찾을 수 없습니다.</p>
                                            <div className="flex gap-2">
                                                <select id="manual-class" className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold outline-none">
                                                    {['수호성', '검성', '살성', '궁성', '마도성', '정령성', '치유성', '호법성'].map(c => <option key={c} value={c}>{c}</option>)}
                                                </select>
                                                <input id="manual-power" type="number" placeholder="전투력" className="w-24 bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold outline-none" />
                                            </div>
                                        </div>
                                    ) : searchResult !== 'blocked' && (
                                        <div className="w-full max-w-[280px] bg-white rounded-2xl shadow-xl shadow-indigo-100/50 border border-white p-5 relative overflow-hidden ring-1 ring-slate-100">
                                            <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />
                                            <div className="flex flex-col items-center mt-2">
                                                <div className="bg-indigo-50 text-indigo-600 text-[11px] font-black px-3 py-1 rounded-full mb-3 tracking-widest uppercase border border-indigo-100">
                                                    {searchResult.guild}
                                                </div>
                                                <div className="text-3xl font-black text-slate-800 mb-5 tracking-tight relative">
                                                    {searchResult.name}
                                                    <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-8 h-1 bg-slate-100 rounded-full"></div>
                                                </div>
                                                <div className="grid grid-cols-2 gap-2 w-full">
                                                    <div className="bg-slate-50 py-2.5 rounded-xl border border-slate-100 flex flex-col items-center">
                                                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">Class</span>
                                                        <span className="text-sm font-black text-slate-700">{searchResult.class}</span>
                                                    </div>
                                                    <div className="bg-indigo-50 py-2.5 rounded-xl border border-indigo-100 flex flex-col items-center">
                                                        <span className="text-[10px] text-indigo-300 font-bold uppercase tracking-wider mb-0.5">Power</span>
                                                        <span className="text-sm font-black text-indigo-600">{searchResult.power.toLocaleString()}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )
                                ) : <div className="text-slate-300 font-bold text-sm">닉네임을 검색해주세요</div>}
                            </div>
                            <button onClick={confirmAdd} disabled={!searchResult} className="glass-btn w-full h-14 text-lg">추가하기</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
