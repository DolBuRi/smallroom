'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { RefreshCw, Users, Search, Plus, Trash2, Settings, X, Check, Loader2, Clock, AlertCircle, ChevronDown, Sword } from 'lucide-react';
import { cn, formatRelativeTime, getClassColor, getJobShortName } from '@/lib/utils';
import { db } from '@/lib/firebase';
import { ref, onValue, set, remove } from 'firebase/database';
import { useAuth } from '@/context/AuthContext';
import { useAppMode } from '@/context/ModeContext';
import { SERVER_LIST, GuildMember } from './member-list';

interface SubCharacter extends Omit<GuildMember, 'rank' | 'clearCount' | 'isActive'> {
    ownerName: string;
}

const CLASSES = ['수호성', '검성', '살성', '궁성', '마도성', '정령성', '치유성', '호법성'];

export default function SubCharacterList() {
    const { isAdmin, user, loading } = useAuth();
    const { dbPath } = useAppMode();
    const [subChars, setSubChars] = useState<SubCharacter[]>([]);
    const [mainMembers, setMainMembers] = useState<any[]>([]);
    const [isLoadingData, setIsLoadingData] = useState(true);
    const [isManageMode, setIsManageMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [lastFullRefresh, setLastFullRefresh] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<'owner' | 'class'>('owner');

    // Add Modal state
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [ownerName, setOwnerName] = useState('');
    const [searchName, setSearchName] = useState('');
    const [searchServer, setSearchServer] = useState('1006');
    const [searchResult, setSearchResult] = useState<SubCharacter | null | 'not-found'>(null);
    const [isSearching, setIsSearching] = useState(false);
    const [isBatchRunning, setIsBatchRunning] = useState(false);

    useEffect(() => {
        if (loading) return;

        // Fetch Sub-characters
        const subCharsRef = ref(db, dbPath.subCharacters || 'sub_characters');
        const unsubscribeSub = onValue(subCharsRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                const list = Object.entries(data).map(([id, val]: [string, any]) => ({
                    id,
                    ...val
                }));
                setSubChars(list);
            } else {
                setSubChars([]);
            }
            if (!mainMembers.length) setIsLoadingData(false);
        });

        // Fetch Main Members for grouping/stats
        const mainMembersRef = ref(db, dbPath.members);
        const unsubscribeMain = onValue(mainMembersRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                const list = Object.values(data);
                setMainMembers(list);
            } else {
                setMainMembers([]);
            }
            setIsLoadingData(false);
        });

        const metadataRef = ref(db, dbPath.subCharsLastRefresh);
        const unsubscribeMeta = onValue(metadataRef, (snapshot) => {
            setLastFullRefresh(snapshot.val());
        });

        return () => {
            unsubscribeSub();
            unsubscribeMain();
            unsubscribeMeta();
        };
    }, [user, loading, dbPath]);

    const handleRefreshAll = async () => {
        if (isBatchRunning) return;
        if (!confirm(`전체 ${subChars.length}명의 정보를 갱신하시겠습니까?`)) return;

        setIsBatchRunning(true);
        for (let i = 0; i < subChars.length; i++) {
            const char = subChars[i];
            try {
                const res = await fetch('/api/proxy/scrape', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: char.name, serverId: '1006' }) // 서버 정보가 없으면 기본 아리엘
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data.success) {
                        await set(ref(db, `${dbPath.subCharacters}/${char.id}`), {
                            ...char,
                            power: data.data.power,
                            score: data.data.score,
                            class: data.data.class,
                            guild: data.data.guild,
                            lastUpdated: new Date().toISOString()
                        });
                    }
                }
            } catch (e) { }
            await new Promise(r => setTimeout(r, 2000));
        }
        setIsBatchRunning(false);
        try {
            await set(ref(db, dbPath.subCharsLastRefresh), new Date().toISOString());
        } catch (e) {
            console.error("Failed to save refresh timestamp:", e);
        }
        alert("갱신이 완료되었습니다.");
    };

    const scrapeMember = async (name: string, serverId: string = '1006') => {
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
        } catch (e) { }

        const serverName = SERVER_LIST.find(s => s.id === serverId)?.name || '아리엘';
        const faction = SERVER_LIST.find(s => s.id === serverId)?.faction;

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
            }, 20000);
            window.postMessage({ type: 'AONI_SEARCH_REQUEST', name, server: serverName, serverId, faction }, "*");
        });
    };

    const handleSearch = async () => {
        if (!searchName.trim()) return;
        setIsSearching(true);
        setSearchResult(null);
        try {
            const res = await scrapeMember(searchName, searchServer);
            if (res.success && res.data) {
                setSearchResult({
                    id: Date.now().toString(),
                    name: res.data.name,
                    class: res.data.class,
                    power: res.data.power,
                    score: res.data.score || 0,
                    guild: res.data.guild,
                    server: SERVER_LIST.find(s => s.id === searchServer)?.name || '아리엘',
                    ownerName: ownerName,
                    lastUpdated: new Date().toISOString()
                } as SubCharacter);
            } else {
                setSearchResult('not-found');
            }
        } catch (e) { }
        finally { setIsSearching(false); }
    };

    const confirmAdd = async () => {
        if (!ownerName.trim()) { alert("본캐 이름을 입력해주세요."); return; }
        if (searchResult && typeof searchResult !== 'string') {
            const newId = Date.now().toString();
            await set(ref(db, `${dbPath.subCharacters}/${newId}`), {
                ...searchResult,
                ownerName: ownerName.trim()
            });
            closeModal();
        } else if (searchResult === 'not-found') {
            const cls = (document.getElementById('manual-class') as HTMLSelectElement).value;
            const pwr = parseInt((document.getElementById('manual-power') as HTMLInputElement).value) || 0;
            const newId = Date.now().toString();
            await set(ref(db, `${dbPath.subCharacters}/${newId}`), {
                id: newId,
                name: searchName,
                class: cls,
                power: pwr,
                score: 0,
                guild: '-',
                server: SERVER_LIST.find(s => s.id === searchServer)?.name || '아리엘',
                ownerName: ownerName.trim(),
                lastUpdated: new Date().toISOString()
            });
            closeModal();
        }
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setOwnerName('');
        setSearchName('');
        setSearchResult(null);
    };

    const deleteSelected = async () => {
        if (!isAdmin) {
            alert("관리자 권한이 필요합니다.");
            return;
        }
        if (!confirm(`${selectedIds.length}명의 부캐를 삭제하시겠습니까?`)) return;
        for (const id of selectedIds) {
            await remove(ref(db, `${dbPath.subCharacters}/${id}`));
        }
        setSelectedIds([]);
    };

    const groupedChars = useMemo(() => {
        const groups: Record<string, SubCharacter[]> = {};
        subChars.forEach(c => {
            if (!groups[c.ownerName]) groups[c.ownerName] = [];
            groups[c.ownerName].push(c);
        });
        
        // 전투력 내림차순 정렬
        Object.values(groups).forEach(list => {
            list.sort((a, b) => b.power - a.power);
        });
        
        return groups;
    }, [subChars]);

    const groupedByClass = useMemo(() => {
        const groups: Record<string, SubCharacter[]> = {};
        CLASSES.forEach(cls => groups[cls] = []);
        subChars.forEach(c => {
            if (groups[c.class] && (c.power || 0) >= 2700) groups[c.class].push(c);
        });
        
        // 전투력 내림차순 정렬
        Object.values(groups).forEach(list => {
            list.sort((a, b) => b.power - a.power);
        });
        
        return groups;
    }, [subChars]);

    const classStats = useMemo(() => {
        const stats: Record<string, { main: number, sub: number }> = {};
        CLASSES.forEach(cls => stats[cls] = { main: 0, sub: 0 });

        mainMembers.forEach(m => {
            if (stats[m.class] && (m.power || 0) >= 2700) stats[m.class].main++;
        });
        subChars.forEach(c => {
            if (stats[c.class] && (c.power || 0) >= 2700) stats[c.class].sub++;
        });
        return stats;
    }, [mainMembers, subChars]);

    return (
        <div className="space-y-8 animate-in fade-in duration-700">
            <div className="flex justify-between items-center gap-6">
                <div>
                    <h2 className="text-4xl font-black text-slate-900 dark:text-white flex items-center gap-3 tracking-tight">
                        <Sword className="text-indigo-500" size={36} />
                        고정 멤버 부캐
                        {isBatchRunning && <Loader2 size={24} className="text-indigo-500 animate-spin ml-2" />}
                    </h2>
                    <div className="flex items-center gap-4 mt-3 font-medium">
                        <div className="text-slate-500 dark:text-slate-300 text-sm flex items-center gap-2">
                            <Users size={14} className="text-indigo-400" />
                            {subChars.length}명의 부캐릭터 목록입니다.
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
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-4">
                    <div className="flex bg-slate-100 dark:bg-slate-800 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-700">
                        <button 
                            onClick={() => setViewMode('owner')}
                            className={cn(
                                "px-6 py-2.5 rounded-xl text-sm font-black transition-all",
                                viewMode === 'owner' 
                                    ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-md transform scale-[1.02]" 
                                    : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                            )}
                        >
                            전체 부캐
                        </button>
                        <button 
                            onClick={() => setViewMode('class')}
                            className={cn(
                                "px-6 py-2.5 rounded-xl text-sm font-black transition-all",
                                viewMode === 'class' 
                                    ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-md transform scale-[1.02]" 
                                    : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                            )}
                        >
                            루드라 부캐
                        </button>
                    </div>

                    <div className="flex items-center gap-3">
                        {!isManageMode ? (
                            <button onClick={() => setIsManageMode(true)} className="glass-btn flex items-center gap-2 h-12 px-6">
                                <Settings size={18} /> 관리하기
                            </button>
                        ) : (
                            <div className="flex items-center gap-2 bg-white/80 dark:bg-slate-800/80 backdrop-blur-md p-1.5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
                                <button onClick={() => setIsModalOpen(true)} className="px-4 py-2 text-sm font-bold text-indigo-500 dark:text-indigo-400 hover:bg-indigo-50 rounded-xl transition-all flex items-center gap-2"><Plus size={16} /> 부캐 추가</button>
                                {isAdmin && selectedIds.length > 0 && <button onClick={deleteSelected} className="px-4 py-2 text-sm font-bold text-red-500 hover:bg-red-50 rounded-xl transition-all flex items-center gap-2"><Trash2 size={16} /> 삭제 ({selectedIds.length})</button>}
                                <button onClick={() => { setIsManageMode(false); setSelectedIds([]); }} className="px-4 py-2 text-sm font-black text-slate-400 hover:text-slate-600 transition-all">닫기</button>
                            </div>
                        )}
                        <button onClick={handleRefreshAll} disabled={isBatchRunning} className="glass-btn flex items-center gap-3 h-12 px-6">
                            {isBatchRunning ? `갱신 중...` : "전체 정보 갱신"}
                            <RefreshCw className={cn("w-5 h-5", isBatchRunning && "animate-spin")} />
                        </button>
                    </div>
                </div>
            </div>

            <div className="space-y-8">
                {isLoadingData ? (
                    <div className="glass-panel flex flex-col items-center justify-center min-h-[300px] text-slate-400 gap-4">
                        <Loader2 className="animate-spin text-indigo-500" size={40} />
                        <p className="font-bold">데이터를 불러오는 중입니다...</p>
                    </div>
                ) : subChars.length === 0 ? (
                    <div className="glass-panel py-20 text-center text-slate-400 font-bold">등록된 부캐 정보가 없습니다.</div>
                ) : viewMode === 'owner' ? (
                    /* Grouped by Owner */
                    Object.entries(groupedChars).map(([owner, chars]) => {
                        const ownerInfo = mainMembers.find(m => m.name === owner);
                        const ownerClass = ownerInfo?.class || '';
                        
                        return (
                            <div key={owner} className="glass-panel overflow-hidden">
                                <div className="px-8 py-5 bg-slate-50/50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm shadow-sm shrink-0", getClassColor(ownerClass))}>
                                            {getJobShortName(ownerClass)}
                                        </div>
                                        <div className="flex flex-col">
                                            <div className="flex items-center gap-2">
                                                <h3 className="text-xl font-black text-slate-800 dark:text-slate-200 tracking-tight">{owner}</h3>
                                                <span className="text-slate-400 font-bold text-sm">의 부캐 목록</span>
                                            </div>
                                        </div>
                                    </div>
                                    <span className="text-xs font-black text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-4 py-1.5 rounded-full uppercase tracking-widest">{chars.length} SUB-CHARS</span>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-sm text-slate-500 dark:text-slate-300 table-fixed">
                                        <thead className="text-[11px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-50 dark:border-slate-800">
                                            <tr>
                                                {isManageMode && isAdmin && <th className="w-16 px-5 py-4 text-center">선택</th>}
                                                <th className="w-40 px-8 py-4 text-left">닉네임</th>
                                                <th className="w-40 px-8 py-4 text-center">직업</th>
                                                <th className="w-32 px-8 py-4 text-center">전투력</th>
                                                <th className="w-32 px-8 py-4 text-center">아툴 점수</th>
                                                <th className="w-32 px-8 py-4 text-center">서버</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50 dark:divide-slate-800/50">
                                            {chars.map(c => (
                                                <tr key={c.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors group">
                                                    {isManageMode && isAdmin && (
                                                        <td className="px-5 py-4 text-center">
                                                            <div onClick={() => setSelectedIds(prev => prev.includes(c.id) ? prev.filter(x => x !== c.id) : [...prev, c.id])} className={cn("w-5 h-5 mx-auto rounded border-2 flex items-center justify-center cursor-pointer transition-all", selectedIds.includes(c.id) ? "bg-indigo-500 border-indigo-500 text-white" : "border-slate-200 dark:border-slate-700")}>
                                                                {selectedIds.includes(c.id) && <Check size={12} strokeWidth={3} />}
                                                            </div>
                                                        </td>
                                                    )}
                                                    <td className="w-40 px-8 py-5 font-black text-slate-700 dark:text-slate-200">
                                                        <div className="truncate" title={c.name}>{c.name}</div>
                                                    </td>
                                                    <td className="w-40 px-8 py-5 text-center font-bold text-slate-600 dark:text-slate-300">{c.class}</td>
                                                    <td className="w-32 px-8 py-5 text-center font-black text-indigo-500">{c.power.toLocaleString()}</td>
                                                    <td className="w-32 px-8 py-5 text-center font-bold text-amber-500">{(c.score || 0).toLocaleString()}</td>
                                                    <td className="w-32 px-8 py-5 text-center font-bold text-slate-400">{c.server}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        );
                    })
                ) : (
                    /* Grouped by Class */
                    <div className="space-y-8">
                        {/* Rudra Character Status Panel */}
                        <div className="glass-panel px-8 py-6 mb-4 border-l-4 border-l-indigo-500 bg-gradient-to-br from-white/80 to-slate-50/50 dark:from-slate-800/80 dark:to-slate-900/50">
                            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
                                <div>
                                    <div className="flex items-center gap-2 mb-1.5">
                                        <span className="text-[9px] font-black uppercase tracking-[0.2em] px-2 py-0.5 bg-indigo-50 dark:bg-indigo-900/40 text-indigo-500 dark:text-indigo-400 rounded-md">Rudra Content Ready</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <h2 className="text-xl font-black text-slate-800 dark:text-slate-100 tracking-tight">
                                            루드라 캐릭터 현황
                                        </h2>
                                        <div className="group relative flex items-center">
                                            <AlertCircle size={16} className="text-slate-300 cursor-help transition-colors group-hover:text-indigo-400" />
                                            <div className="absolute left-0 bottom-full mb-3 px-4 py-2 bg-slate-800/95 backdrop-blur-md text-white text-[11px] font-bold rounded-xl whitespace-nowrap opacity-0 group-hover:opacity-100 transition-all pointer-events-none shadow-xl z-50 transform translate-y-1 group-hover:translate-y-0">
                                                <div className="flex flex-col gap-0.5">
                                                    <span>전투력 2700 이상 기준</span>
                                                    <span className="text-indigo-300 font-black">성역 컨텐츠 참여 가능 캐릭터 집계</span>
                                                </div>
                                                <div className="absolute left-2 top-full border-[6px] border-transparent border-t-slate-800/95"></div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex gap-4">
                                    <div className="bg-white/50 dark:bg-slate-700/50 px-4 py-2 rounded-2xl border border-slate-100 dark:border-slate-600">
                                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Total Main</div>
                                        <div className="text-xl font-black text-slate-700 dark:text-slate-200">{Object.values(classStats).reduce((acc, curr) => acc + curr.main, 0)}</div>
                                    </div>
                                    <div className="bg-indigo-50/50 dark:bg-indigo-900/20 px-4 py-2 rounded-2xl border border-indigo-100/50 dark:border-indigo-800/30">
                                        <div className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-0.5">Total Sub</div>
                                        <div className="text-xl font-black text-indigo-500">{Object.values(classStats).reduce((acc, curr) => acc + curr.sub, 0)}</div>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4">
                                {CLASSES.map(cls => (
                                    <div key={cls} className="group/card relative bg-white/40 dark:bg-slate-800/40 border border-slate-100/50 dark:border-slate-700/50 rounded-2xl p-5 flex flex-col items-center transition-all hover:shadow-lg hover:shadow-indigo-500/5 hover:-translate-y-1 hover:bg-white dark:hover:bg-slate-800">
                                        <div className="text-[13px] font-black text-slate-700 dark:text-slate-200 uppercase tracking-tight mb-4">
                                            {cls} <span className="text-indigo-500 ml-1">({classStats[cls].main + classStats[cls].sub})</span>
                                        </div>
                                        
                                        <div className="w-full space-y-2">
                                            <div className="flex items-center justify-between bg-slate-50/50 dark:bg-slate-700/30 px-2.5 py-1.5 rounded-lg border border-slate-100/50 dark:border-slate-600/30">
                                                <span className="text-[10px] font-black text-slate-400">MAIN</span>
                                                <span className="text-sm font-black text-slate-700 dark:text-slate-200">{classStats[cls].main}</span>
                                            </div>
                                            <div className="flex items-center justify-between bg-indigo-50/30 dark:bg-indigo-900/10 px-2.5 py-1.5 rounded-lg border border-indigo-100/30 dark:border-indigo-800/20">
                                                <span className="text-[10px] font-black text-indigo-300">SUB</span>
                                                <span className="text-sm font-black text-indigo-500">{classStats[cls].sub}</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Class Detailed Lists */}
                        {CLASSES.filter(cls => groupedByClass[cls].length > 0).map(cls => (
                            <div key={cls} className="glass-panel overflow-hidden border-l-4 border-l-indigo-500">
                                <div className="px-8 py-5 bg-slate-50/50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm shadow-sm shrink-0", getClassColor(cls))}>
                                            {getJobShortName(cls)}
                                        </div>
                                        <h3 className="text-lg font-black text-slate-800 dark:text-slate-200 tracking-tight">{cls}</h3>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <span className="text-xs font-black text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-4 py-1.5 rounded-full uppercase tracking-widest">{groupedByClass[cls].length} SUB-CHARS</span>
                                    </div>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-sm text-slate-500 dark:text-slate-300 table-fixed">
                                        <thead className="text-[11px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-50 dark:border-slate-800">
                                            <tr>
                                                {isManageMode && isAdmin && <th className="w-16 px-5 py-4 text-center">선택</th>}
                                                <th className="w-40 px-8 py-4 text-left">닉네임</th>
                                                <th className="w-40 px-8 py-4 text-center">직업</th>
                                                <th className="w-32 px-8 py-4 text-center">전투력</th>
                                                <th className="w-32 px-8 py-4 text-center">아툴 점수</th>
                                                <th className="w-40 px-8 py-4 text-center">본캐</th>
                                                <th className="w-32 px-8 py-4 text-center">서버</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50 dark:divide-slate-800/50">
                                            {groupedByClass[cls].map(c => (
                                                <tr key={c.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors group">
                                                    {isManageMode && isAdmin && (
                                                        <td className="px-5 py-4 text-center">
                                                            <div onClick={() => setSelectedIds(prev => prev.includes(c.id) ? prev.filter(x => x !== c.id) : [...prev, c.id])} className={cn("w-5 h-5 mx-auto rounded border-2 flex items-center justify-center cursor-pointer transition-all", selectedIds.includes(c.id) ? "bg-indigo-500 border-indigo-500 text-white" : "border-slate-200 dark:border-slate-700")}>
                                                                {selectedIds.includes(c.id) && <Check size={12} strokeWidth={3} />}
                                                            </div>
                                                        </td>
                                                    )}
                                                    <td className="w-40 px-8 py-5 font-black text-slate-700 dark:text-slate-200">
                                                        <div className="truncate" title={c.name}>{c.name}</div>
                                                    </td>
                                                    <td className="w-40 px-8 py-5 text-center font-bold text-slate-600 dark:text-slate-300">{c.class}</td>
                                                    <td className="w-32 px-8 py-5 text-center font-black text-indigo-500">{c.power.toLocaleString()}</td>
                                                    <td className="w-32 px-8 py-5 text-center font-bold text-amber-500">{(c.score || 0).toLocaleString()}</td>
                                                    <td className="w-40 px-8 py-5 text-center font-bold text-slate-500">{c.ownerName}</td>
                                                    <td className="w-32 px-8 py-5 text-center font-bold text-slate-400">{c.server}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {isModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300">
                    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-300">
                        <div className="flex justify-between items-center p-6 border-b border-slate-50 dark:border-slate-700">
                            <h3 className="text-xl font-black text-slate-900 dark:text-white">부캐 정보 추가</h3>
                            <button onClick={closeModal} className="text-slate-400 hover:text-slate-600 transition-colors"><X size={24} /></button>
                        </div>
                        <div className="p-8 space-y-6">
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <label className="block text-xs font-bold text-slate-400 pl-1 uppercase tracking-widest">본캐 이름 (소유주 캐릭터)</label>
                                    <input type="text" placeholder="예: 부트띠" className="glass-input w-full px-4 font-bold h-12" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} />
                                </div>
                                <div className="space-y-2">
                                    <label className="block text-xs font-bold text-slate-400 pl-1 uppercase tracking-widest">부캐 닉네임</label>
                                    <div className="relative">
                                        <input type="text" placeholder="부캐 닉네임 입력" className="glass-input w-full pl-4 pr-12 font-bold h-12" value={searchName} onChange={(e) => setSearchName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearch()} />
                                        <button onClick={handleSearch} disabled={isSearching || !searchName} className="absolute right-2 top-2 h-8 w-8 flex items-center justify-center bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-all disabled:opacity-50">
                                            {isSearching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                                        </button>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="block text-xs font-bold text-slate-400 pl-1 uppercase tracking-widest">부캐 서버</label>
                                    <select value={searchServer} onChange={(e) => setSearchServer(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl px-4 h-12 text-sm font-black outline-none appearance-none cursor-pointer">
                                        {SERVER_LIST.filter(s => s.id !== 'all').map(s => <option key={s.id} value={s.id}>{s.faction} - {s.name}</option>)}
                                    </select>
                                </div>
                            </div>

                            <div className="min-h-[120px] flex items-center justify-center bg-slate-50 dark:bg-slate-800/50 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700">
                                {isSearching ? (
                                    <div className="text-center font-black text-indigo-500 animate-pulse">조회 중...</div>
                                ) : searchResult ? (
                                    searchResult === 'not-found' ? (
                                        <div className="text-center p-4">
                                            <p className="text-red-400 font-bold mb-3 text-xs">정보를 찾을 수 없습니다.</p>
                                            <div className="flex gap-2">
                                                <select id="manual-class" className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold outline-none">
                                                    {['수호성', '검성', '살성', '궁성', '마도성', '정령성', '치유성', '호법성'].map(c => <option key={c} value={c}>{c}</option>)}
                                                </select>
                                                <input id="manual-power" type="number" placeholder="전투력" className="w-24 bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold outline-none" />
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="text-center p-4 space-y-1">
                                            <div className="text-[10px] text-indigo-400 font-black uppercase tracking-widest">{searchResult.guild}</div>
                                            <div className="text-2xl font-black text-slate-800 dark:text-slate-200">{searchResult.name}</div>
                                            <div className="text-xs font-bold text-slate-400">{searchResult.class} | {searchResult.power.toLocaleString()} P</div>
                                        </div>
                                    )
                                ) : <div className="text-slate-300 font-bold text-xs uppercase tracking-widest">Search Character</div>}
                            </div>
                            <button onClick={confirmAdd} disabled={!searchResult} className="glass-btn w-full h-14 text-lg font-black">부캐 추가하기</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
