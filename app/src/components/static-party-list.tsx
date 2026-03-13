'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { RefreshCw, Search, Plus, Trash2, X, Loader2, Shield, Zap, Trophy, Award } from 'lucide-react';
import { cn, formatRelativeTime, getClassColor, getJobShortName } from '@/lib/utils';
import { db } from '@/lib/firebase';
import { ref, onValue, set, remove } from 'firebase/database';
import { useAuth } from '@/context/AuthContext';
import { GuildMember as BaseGuildMember } from './member-list';

// 기존 타입을 확장하여 서버 정보 추가
export interface StaticGuildMember extends BaseGuildMember {
    serverId?: string;
    serverName?: string;
}

const SERVER_LIST = [
    { id: 'all', name: '전체 서버' },
    // 천족 서버 (Elyos)
    { id: '1001', name: '시엘' }, { id: '1002', name: '네자칸' }, { id: '1003', name: '바이젤' },
    { id: '1004', name: '카이시넬' }, { id: '1005', name: '유스티엘' }, { id: '1006', name: '아리엘' },
    { id: '1007', name: '프레기온' }, { id: '1008', name: '메스람타에다' }, { id: '1009', name: '히타니에' },
    { id: '1010', name: '나니아' }, { id: '1011', name: '타하바타' }, { id: '1012', name: '루터스' },
    { id: '1013', name: '페르노스' }, { id: '1014', name: '다미누' }, { id: '1015', name: '카사카' },
    { id: '1016', name: '바카르마' }, { id: '1017', name: '챈가룽' }, { id: '1018', name: '코치룽' },
    { id: '1019', name: '이슈타르' }, { id: '1020', name: '티아마트' }, { id: '1021', name: '포에타' },
    // 마족 서버 (Asmodian)
    { id: '2001', name: '이스라펠' }, { id: '2002', name: '지켈' }, { id: '2003', name: '트리니엘' },
    { id: '2004', name: '루미엘' }, { id: '2005', name: '마르쿠탄' }, { id: '2006', name: '아스펠' },
    { id: '2007', name: '에레슈키갈' }, { id: '2008', name: '브리트라' }, { id: '2009', name: '네몬' },
    { id: '2010', name: '하달' }, { id: '2011', name: '루드라' }, { id: '2012', name: '울고른' },
    { id: '2013', name: '무닌' }, { id: '2014', name: '오다르' }, { id: '2015', name: '젠카카' },
    { id: '2016', name: '크로메데' }, { id: '2017', name: '콰이링' }, { id: '2018', name: '바바룽' },
    { id: '2019', name: '파프니르' }, { id: '2020', name: '인드나흐' }, { id: '2021', name: '이스할겐' },
];

export default function StaticPartyList() {
    const { isAdmin, user, loading } = useAuth();
    const [members, setMembers] = useState<StaticGuildMember[]>([]);
    const [isLoadingData, setIsLoadingData] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    // Custom List용 상태
    const [progress, setProgress] = useState({ current: 0, total: 0, status: '' });
    const [isBatchRunning, setIsBatchRunning] = useState(false);
    const [isManageMode, setIsManageMode] = useState(true); // 커스텀 리스트는 기본적으로 관리 모드 활성화
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [searchName, setSearchName] = useState('');
    const [searchServer, setSearchServer] = useState('1006');
    const [searchResult, setSearchResult] = useState<any | null | 'not-found'>(null);
    const [isSearching, setIsSearching] = useState(false);
    const [isManualUpdating, setIsManualUpdating] = useState(false);

    useEffect(() => {
        if (loading) return;

        // 독립된 공간 'static_party' 사용
        const membersRef = ref(db, 'static_party');
        const unsubscribe = onValue(membersRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                const normalized = (Object.values(data) as any[])
                    .filter(m => m && (m.name || m.id))
                    .map((m: any) => ({
                        ...m,
                        clearCount: m.clearCount || '0회',
                        score: m.score || 0
                    }));
                setMembers(normalized);
            } else {
                setMembers([]);
            }
            setIsLoadingData(false);
        });

        return () => unsubscribe();
    }, [user, loading]);

    const saveMembers = async (newMembers: StaticGuildMember[]) => {
        setIsSaving(true);
        try {
            await set(ref(db, 'static_party'), newMembers);
        } catch (e) {
            console.error("저장 실패:", e);
        } finally {
            setIsSaving(false);
        }
    };

    const updateMembers = (newList: StaticGuildMember[]) => {
        setMembers(newList);
        saveMembers(newList);
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
        return { success: false, error: 'Failed' };
    };

    const handleRefreshAll = async () => {
        if (isBatchRunning) return;
        if (!confirm(`리스트에 있는 ${members.length}명의 정보를 최신화하시겠습니까?`)) return;

        setIsBatchRunning(true);
        let updatedList = [...members];
        let successCount = 0;

        for (let i = 0; i < members.length; i++) {
            const member = members[i];
            setProgress({ current: i + 1, total: members.length, status: '갱신 중...' });

            try {
                // @ts-ignore
                const res = await scrapeMember(member.name, member.serverId || '1006');
                if (res.success && res.data) {
                    updatedList = updatedList.map(m => m.id === member.id ? {
                        ...m,
                        power: parseInt(res.data.power),
                        score: parseInt(res.data.score) || 0,
                        class: res.data.class,
                        guild: res.data.guild,
                        lastUpdated: new Date().toISOString()
                    } : m);
                    successCount++;
                }
            } catch (e) { }
            if (i < members.length - 1) await new Promise(r => setTimeout(r, 3000));
        }

        updateMembers(updatedList);
        setIsBatchRunning(false);
        alert(`갱신 완료! (성공: ${successCount}/${members.length})`);
    };

    const handleSearch = async () => {
        if (!searchName.trim()) return;
        setIsSearching(true);
        setSearchResult(null);
        try {
            const result = await scrapeMember(searchName, searchServer);
            if (result.success && result.data) {
                setSearchResult({
                    id: String(Date.now()),
                    name: result.data.name,
                    rank: '군단병',
                    class: result.data.class,
                    power: parseInt(result.data.power),
                    score: parseInt(result.data.score) || 0,
                    guild: result.data.guild,
                    isActive: false,
                    clearCount: '0회',
                    lastUpdated: new Date().toISOString(),
                    serverId: searchServer,
                    serverName: SERVER_LIST.find(s => s.id === searchServer)?.name || '아리엘'
                });
            } else { setSearchResult('not-found'); }
        } catch (e) { alert("검색 중 오류 발생"); }
        finally { setIsSearching(false); }
    };

    const handleManualUpdate = async (nameToUpdate: string) => {
        if (!nameToUpdate.trim()) return;
        setIsManualUpdating(true);
        try {
            const res = await scrapeMember(nameToUpdate);
            if (res.success && res.data) {
                let found = false;
                const newList = members.map(m => {
                    if (m.name === nameToUpdate) {
                        found = true;
                        return {
                            ...m,
                            power: parseInt(res.data.power),
                            score: parseInt(res.data.score) || 0,
                            class: res.data.class,
                            guild: res.data.guild,
                            lastUpdated: new Date().toISOString()
                        };
                    }
                    return m;
                });
                if (found) {
                    updateMembers(newList);
                } else { alert("리스트에 해당 이름이 없습니다."); }
            }
        } catch (e) { }
        finally { setIsManualUpdating(false); }
    };

    const confirmAdd = () => {
        if (searchResult && typeof searchResult !== 'string') {
            if (members.some(m => m.name === searchResult.name && m.serverId === searchResult.serverId)) {
                alert("이미 등록된 유저입니다.");
                return;
            }
            updateMembers([...members, searchResult]);
            closeModal();
        }
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setSearchName('');
        setSearchResult(null);
    };

    const deleteSelected = () => {
        if (confirm(`${selectedIds.length}명을 리스트에서 삭제하시겠습니까?`)) {
            const newList = members.filter(m => !selectedIds.includes(m.id));
            updateMembers(newList);
            setSelectedIds([]);
        }
    };

    const [sortBy, setSortBy] = useState<'power' | 'score'>('power');

    const sortedMembers = useMemo(() => {
        return [...members].sort((a, b) => {
            if (sortBy === 'power') return b.power - a.power;
            return (b.score || 0) - (a.score || 0);
        });
    }, [members, sortBy]);

    return (
        <div className="space-y-8 animate-in fade-in duration-700 pb-20">
            {/* Header */}
            <div className="flex justify-between items-end gap-6">
                <div>
                    <div className="flex items-center gap-2 mb-2">
                        <span className="bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400 text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-tighter border border-amber-200 dark:border-amber-800">
                            Private List
                        </span>
                    </div>
                    <h2 className="text-4xl font-black text-slate-900 dark:text-white flex items-center gap-3 tracking-tight">
                        <Shield className="text-amber-500" size={36} />
                        고정파티 / 관심인원 관리
                        {isSaving && <Loader2 size={24} className="text-slate-300 animate-spin ml-2" />}
                    </h2>
                    <p className="text-slate-500 dark:text-slate-400 text-sm mt-2 font-medium">
                        레기온 공식 명단과 별개로 관리되는 사용자 전용 리스트입니다.
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 bg-white/80 dark:bg-slate-800/80 backdrop-blur-md p-1.5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
                        <button onClick={() => setIsModalOpen(true)} className="px-4 py-2 text-sm font-bold text-indigo-500 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/40 rounded-xl transition-all flex items-center gap-2">
                            <Plus size={16} /> 인원 추가
                        </button>
                        {selectedIds.length > 0 && (
                            <button onClick={deleteSelected} className="px-4 py-2 text-sm font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-900/40 rounded-xl transition-all flex items-center gap-2">
                                <Trash2 size={16} /> 삭제 ({selectedIds.length})
                            </button>
                        )}
                    </div>
                    <div className="w-px h-8 bg-slate-200 dark:bg-slate-700 mx-1" />
                    <button onClick={handleRefreshAll} disabled={isBatchRunning} className="glass-btn flex items-center gap-3 h-12 px-6 bg-slate-900 text-white rounded-2xl font-black hover:bg-slate-800 transition-all disabled:opacity-50">
                        {isBatchRunning ? `${progress.current}/${progress.total}` : "리스트 전체 갱신"}
                        <RefreshCw className={cn("w-5 h-5", isBatchRunning && "animate-spin")} />
                    </button>
                </div>
            </div>

            {/* Sort Controls */}
            <div className="flex items-center gap-2 bg-white/50 dark:bg-slate-800 p-1 rounded-xl border border-slate-100 dark:border-slate-700 w-fit">
                <button
                    onClick={() => setSortBy('power')}
                    className={cn(
                        "px-4 py-1.5 rounded-lg text-[11px] font-black transition-all flex items-center gap-2 uppercase tracking-tight",
                        sortBy === 'power'
                            ? "bg-indigo-50 dark:bg-indigo-600 text-indigo-600 dark:text-white shadow-sm ring-1 ring-indigo-100 dark:ring-0"
                            : "text-slate-400 dark:text-slate-300 hover:text-slate-600 dark:hover:text-slate-200"
                    )}
                >
                    <Zap size={12} /> 전투력 순
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
                    <Trophy size={12} /> 아툴 점수 순
                </button>
            </div>

            {/* Progress Bar */}
            {isBatchRunning && (
                <div className="w-full h-1 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-amber-500 transition-all duration-300" style={{ width: `${(progress.current / progress.total) * 100}%` }} />
                </div>
            )}

            {/* Ranking Cards */}
            {isLoadingData ? (
                <div className="flex flex-col justify-center items-center h-60 text-slate-400 gap-4">
                    <Loader2 className="animate-spin text-amber-500" size={40} />
                    <p className="font-bold">데이터를 불러오는 중...</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-4">
                    {sortedMembers.length === 0 ? (
                        <div className="text-center py-24 glass-panel text-slate-300 font-bold">
                            리스트가 비어있습니다. 인원 추가 버튼으로 추가해보세요.
                        </div>
                    ) : sortedMembers.map((m, idx) => (
                        <div
                            key={m.id}
                            onClick={() => setSelectedIds(prev => prev.includes(m.id) ? prev.filter(x => x !== m.id) : [...prev, m.id])}
                            className={cn(
                                "glass-panel p-6 flex items-center gap-6 hover:border-amber-200 dark:hover:border-amber-700 hover:shadow-xl hover:shadow-amber-50/50 dark:hover:shadow-amber-900/10 transition-all group relative overflow-hidden cursor-pointer",
                                selectedIds.includes(m.id) && "border-amber-400 dark:border-amber-600 bg-amber-50/30 dark:bg-amber-900/10"
                            )}
                        >
                            {idx < 3 && (
                                <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                                    <Award size={80} className={cn(idx === 0 ? "text-amber-500" : idx === 1 ? "text-slate-400" : "text-amber-700")} />
                                </div>
                            )}

                            {/* Rank Badge */}
                            <div className={cn(
                                "w-12 h-12 flex items-center justify-center rounded-2xl font-black text-xl shadow-inner transition-transform group-hover:scale-110",
                                idx === 0 ? "bg-amber-100 dark:bg-amber-500 text-amber-600 dark:text-white shadow-amber-200/50 shadow-lg" :
                                    idx === 1 ? "bg-slate-100 dark:bg-slate-500 text-slate-500 dark:text-white shadow-slate-200/50 shadow-lg" :
                                        idx === 2 ? "bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-white shadow-orange-200/50 shadow-lg" :
                                            "bg-slate-50 dark:bg-slate-800 text-slate-300 dark:text-slate-300"
                            )}>
                                {idx + 1}
                            </div>

                            {/* Name & Info */}
                            <div className="flex-1">
                                <div className="flex items-center gap-3 flex-wrap">
                                    <span className="text-2xl font-black text-slate-800 dark:text-slate-200 tracking-tight">{m.name}</span>
                                    <div className="flex items-center gap-2 px-3 py-1 bg-slate-50 dark:bg-slate-700/50 rounded-lg border border-slate-100 dark:border-slate-700">
                                        <div className={cn("w-5 h-5 rounded-md flex items-center justify-center font-black text-[9px] shadow-sm shrink-0", getClassColor(m.class))}>
                                            {getJobShortName(m.class)}
                                        </div>
                                        <span className="text-slate-400 dark:text-indigo-200 text-[10px] font-black tracking-widest uppercase">{m.class}</span>
                                    </div>
                                    {/* @ts-ignore */}
                                    <span className="text-[10px] bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 px-2 py-0.5 rounded-md font-black border border-amber-100 dark:border-amber-900/30">{(m as any).serverName || '아리엘'}</span>
                                </div>
                                {(m as any).specialNotes && (
                                    <p className="text-xs text-slate-400 mt-1 font-medium">{(m as any).specialNotes}</p>
                                )}
                            </div>

                            {/* Stats */}
                            <div className="text-right flex items-center gap-8">
                                <div className={cn("flex flex-col transition-opacity duration-300", sortBy === 'power' ? "opacity-100 scale-100" : "opacity-60 scale-95")}>
                                    <span className="text-[10px] text-slate-400 dark:text-slate-300 font-black uppercase tracking-[0.2em] mb-1">Combat Power</span>
                                    <span className={cn("font-black tracking-tighter tabular-nums drop-shadow-sm transition-colors duration-300", sortBy === 'power' ? "text-3xl text-indigo-500" : "text-xl text-slate-500 dark:text-slate-300")}>
                                        {m.power.toLocaleString()}
                                    </span>
                                </div>
                                <div className={cn("flex flex-col transition-opacity duration-300", sortBy === 'score' ? "opacity-100 scale-100" : "opacity-60 scale-95")}>
                                    <span className="text-[10px] text-slate-400 dark:text-slate-300 font-black uppercase tracking-[0.2em] mb-1">AT Score</span>
                                    <span className={cn("font-black tracking-tighter tabular-nums drop-shadow-sm transition-colors duration-300", sortBy === 'score' ? "text-3xl text-amber-500" : "text-xl text-slate-500 dark:text-slate-300")}>
                                        {(m.score || 0).toLocaleString()}
                                    </span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
                    <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-2xl w-full max-w-md overflow-hidden border border-slate-200 dark:border-slate-800">
                        <div className="p-8 space-y-6">
                            <div className="flex justify-between items-center">
                                <h3 className="text-2xl font-black text-slate-900 dark:text-white">인원 추가</h3>
                                <button onClick={closeModal} className="text-slate-400 hover:text-slate-600"><X size={24} /></button>
                            </div>

                            <div className="flex gap-3">
                                <select
                                    value={searchServer}
                                    onChange={(e) => setSearchServer(e.target.value)}
                                    className="bg-slate-50 dark:bg-slate-800 border-none rounded-2xl px-4 font-bold outline-none text-sm"
                                >
                                    <optgroup label="천족 (Elyos)">
                                        {SERVER_LIST.filter(s => parseInt(s.id) >= 1001 && parseInt(s.id) <= 1099).map(s => (
                                            <option key={s.id} value={s.id}>{s.name}</option>
                                        ))}
                                    </optgroup>
                                    <optgroup label="마족 (Asmodian)">
                                        {SERVER_LIST.filter(s => parseInt(s.id) >= 2001 && parseInt(s.id) <= 2099).map(s => (
                                            <option key={s.id} value={s.id}>{s.name}</option>
                                        ))}
                                    </optgroup>
                                </select>
                                <div className="relative flex-1">
                                    <input
                                        type="text"
                                        placeholder="닉네임 입력"
                                        className="w-full h-14 bg-slate-50 dark:bg-slate-800 border-none rounded-2xl px-6 font-bold outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                                        value={searchName}
                                        onChange={(e) => setSearchName(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                    />
                                    <button onClick={handleSearch} className="absolute right-3 top-3 h-8 w-8 bg-indigo-500 text-white rounded-xl flex items-center justify-center">
                                        {isSearching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                                    </button>
                                </div>
                            </div>

                            {searchResult && (
                                <div className="p-6 bg-slate-50 dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-700">
                                    {searchResult === 'not-found' ? (
                                        <p className="text-center text-red-500 font-bold">캐릭터를 찾을 수 없습니다.</p>
                                    ) : (
                                        <div className="text-center">
                                            <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-1">{searchResult.guild} ({searchResult.serverName})</p>
                                            <p className="text-3xl font-black text-slate-800 dark:text-white mb-4">{searchResult.name}</p>
                                            <div className="flex justify-center gap-4 text-sm font-bold">
                                                <span className="text-slate-500">{searchResult.class}</span>
                                                <span className="text-indigo-600">{searchResult.power.toLocaleString()}</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            <button
                                onClick={confirmAdd}
                                disabled={!searchResult || searchResult === 'not-found'}
                                className="w-full h-14 bg-slate-900 dark:bg-white dark:text-slate-900 text-white rounded-2xl font-black text-lg disabled:opacity-50"
                            >
                                리스트에 추가
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
