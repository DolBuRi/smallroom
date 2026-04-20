'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { RefreshCw, Users, UserCheck, Search, Plus, Trash2, Settings, X, Check, Loader2, Clock, AlertCircle, ChevronDown, Sheet } from 'lucide-react';
import { cn, formatRelativeTime } from '@/lib/utils';
import { db } from '@/lib/firebase';
import { ref, onValue, set, remove, update } from 'firebase/database';
import { useAuth } from '@/context/AuthContext';
import { useAppMode } from '@/context/ModeContext';
import { SERVER_LIST, scrapeMember, parsePowerAndItemLevel } from '@/lib/scraper';

// Data Type
export interface GuildMember {
    id: string;
    name: string;
    rank: '군단장' | '엘리트 장교' | '장교' | '군단병';
    class: string;
    power: number;
    itemLevel?: number;
    guild: string;
    isActive: boolean;
    clearCount: string;
    lastUpdated?: string;
    specialNotes?: string;
    joinDate?: string;
    faction?: '천족' | '마족';
    server?: string;
    // Aether Energy
    aetherEnergy?: number;
    aetherEnergyLastUpdated?: string;
    aetherCharged?: number;
}


export default function MemberList({ mode: propMode, isAdmin: propAdmin }: { mode?: 'legion' | 'fixed', isAdmin?: boolean }) {
    const { isAdmin: authAdmin, user, loading } = useAuth();
    const { dbPath, mode: contextMode } = useAppMode();
    
    // Props take precedence over context
    const isAdmin = propAdmin !== undefined ? propAdmin : authAdmin;
    const mode = propMode || contextMode || 'legion';
    const [members, setMembers] = useState<GuildMember[]>([]);
    const [isLoadingData, setIsLoadingData] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [permissionError, setPermissionError] = useState(false);

    const [appSettings] = useState({
        guildName: '츄',
        serverId: '1006',
        serverName: '아리엘',
    });

    const [progress, setProgress] = useState({ current: 0, total: 0, status: '' });
    const [isBatchRunning, setIsBatchRunning] = useState(false);
    const [isManageMode, setIsManageMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [searchName, setSearchName] = useState('');
    const [searchServer, setSearchServer] = useState('1006');
    const [searchResult, setSearchResult] = useState<GuildMember | null | 'not-found'>(null);
    const [isSearching, setIsSearching] = useState(false);
    const [isManualUpdating, setIsManualUpdating] = useState(false);
    const [lastFullRefresh, setLastFullRefresh] = useState<string | null>(null);

    useEffect(() => {
        if (loading) return;
        if (!user) {
            setPermissionError(true);
            setIsLoadingData(false);
            return;
        }

        const membersRef = ref(db, dbPath.members);
        const unsubscribe = onValue(membersRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                const normalized = Object.entries(data)
                    .filter(([key, m]) => m && (m as any).name)
                    .map(([key, m]: [string, any]) => {
                        const { power, itemLevel } = parsePowerAndItemLevel(m.power, m.itemLevel);
                        return {
                            ...m,
                            id: m.id || key,
                            power,
                            itemLevel,
                            clearCount: m.clearCount || '0회',
                        };
                    });
                setMembers(normalized);
            } else {
                setMembers([]);
            }
            setIsLoadingData(false);
        }, (error) => {
            if (error.message.includes("permission_denied")) setPermissionError(true);
            setIsLoadingData(false);
        });

        const metadataRef = ref(db, dbPath.lastFullRefresh);
        const unsubscribeMeta = onValue(metadataRef, (snapshot) => {
            setLastFullRefresh(snapshot.val());
        });

        return () => {
            unsubscribe();
            unsubscribeMeta();
        };
    }, [user, loading, dbPath]);

    const saveMembers = async (newMembers: GuildMember[]) => {
        setIsSaving(true);
        // Clean undefineds before saving
        const cleanedList = (newMembers || []).map(m => {
            const clean: any = {};
            Object.entries(m).forEach(([k, v]) => {
                if (v !== undefined) clean[k] = v;
            });
            return clean;
        });

        try {
            await set(ref(db, dbPath.members), cleanedList);
        } catch (e) {
            console.error("Save failed:", e);
            alert("저장 실패!");
        } finally {
            setIsSaving(false);
        }
    };

    const updateMembers = (newList: GuildMember[]) => {
        setMembers(newList);
        saveMembers(newList);
    };


    const handleRefreshAll = async (e?: React.MouseEvent) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }

        if (isBatchRunning) return;
        
        const confirmed = window.confirm(`총 ${(members || []).length}명의 정보를 갱신합니다.\n데이터 수집을 위해 시간이 다소 소요됩니다. 진행하시겠습니까?`);
        if (!confirmed) return;

        setIsBatchRunning(true);
        const validMembers = members.filter(m => m && m.name);
        let successCount = 0;

        for (let i = 0; i < validMembers.length; i++) {
            const member = validMembers[i];
            setProgress({ current: i + 1, total: validMembers.length, status: `${member.name} 갱신 중...` });

            try {
                const targetServerId = member.server ? (SERVER_LIST.find(s => s.name === member.server)?.id || '1006') : '1006';
                const res = await scrapeMember(member.name, targetServerId);
                if (res.success && res.data) {
                    const { power, itemLevel } = parsePowerAndItemLevel(res.data.power, res.data.itemLevel);

                    // Individual update for robustness
                    await update(ref(db, `${dbPath.members}/${member.id}`), {
                        power,
                        itemLevel,
                        class: res.data.class,
                        guild: res.data.guild,
                        isActive: String(res.data.guild || '').includes(appSettings.guildName),
                        lastUpdated: new Date().toISOString()
                    });
                    successCount++;
                }
            } catch (e) {
                console.error(`Refresh error for ${member.name}:`, e);
            }
            if (i < validMembers.length - 1) await new Promise(r => setTimeout(r, 1000));
        }

        try {
            await set(ref(db, dbPath.lastFullRefresh), new Date().toISOString());
        } catch (e) { }

        setIsBatchRunning(false);
        alert(`갱신 완료! (성공: ${successCount}/${validMembers.length})`);
    };

    const handleSearch = async () => {
        if (!searchName.trim()) return;
        setIsSearching(true);
        setSearchResult(null);
        try {
            const serverObj = SERVER_LIST.find(s => s.id === searchServer);
            const res = await scrapeMember(searchName, searchServer);
            if (res.success && res.data) {
                const { power, itemLevel } = parsePowerAndItemLevel(res.data.power, res.data.itemLevel);

                setSearchResult({
                    id: String(Date.now()),
                    name: res.data.name,
                    rank: '군단병',
                    class: res.data.class,
                    power,
                    itemLevel,
                    guild: res.data.guild,
                    isActive: res.data.guild === appSettings.guildName,
                    clearCount: '0회',
                    lastUpdated: new Date().toISOString(),
                    ...(mode === 'fixed' ? {
                        faction: serverObj?.faction as any,
                        server: serverObj?.name
                    } : {})
                });
            } else { setSearchResult('not-found'); }
        } catch (e) { alert("검색 중 오류 발생"); }
        finally { setIsSearching(false); }
    };

    const handleManualUpdate = async (nameToUpdate: string) => {
        if (!nameToUpdate.trim()) return;
        setIsManualUpdating(true);
        try {
            const member = members.find(m => m.name === nameToUpdate);
            const targetServerId = member?.server ? (SERVER_LIST.find(s => s.name === member.server)?.id || '1006') : '1006';
            const res = await scrapeMember(nameToUpdate, targetServerId);
            if (res.success && res.data) {
                const { power, itemLevel } = parsePowerAndItemLevel(res.data.power, res.data.itemLevel);

                let found = false;
                const newList = members.map(m => {
                    if (m.name === nameToUpdate) {
                        found = true;
                        return {
                            ...m,
                            power,
                            itemLevel,
                            class: res.data.class,
                            guild: res.data.guild,
                            isActive: (res.data.guild === appSettings.guildName),
                            lastUpdated: new Date().toISOString()
                        };
                    }
                    return m;
                });
                if (found) {
                    updateMembers(newList);
                    alert(`${nameToUpdate}님의 정보가 갱신되었습니다.`);
                } else { alert("리스트에 해당 이름이 없습니다."); }
            } else { alert(`갱신 실패: ${res.error || '캐릭터를 찾을 수 없습니다.'}`); }
        } catch (e) { alert("오류가 발생했습니다."); }
        finally { setIsManualUpdating(false); }
    };

    const confirmAdd = () => {
        if (searchResult && typeof searchResult !== 'string') {
            if (members.some(m => m.name === searchResult.name)) {
                alert("이미 등록된 멤버입니다.");
                return;
            }
            const serverObj = SERVER_LIST.find(s => s.id === searchServer);
            updateMembers([...members, {
                ...searchResult,
                ...(mode === 'fixed' ? {
                    faction: serverObj?.faction as any,
                    server: serverObj?.name
                } : {})
            }]);
            closeModal();
        } else if (searchResult === 'not-found') {
            const serverObj = SERVER_LIST.find(s => s.id === searchServer);
            const cls = (document.getElementById('manual-class') as HTMLSelectElement).value;
            const pwr = parseInt((document.getElementById('manual-power') as HTMLInputElement).value) || 0;
            updateMembers([...members, {
                id: Date.now().toString(),
                name: searchName,
                rank: '군단병',
                class: cls,
                power: pwr,
                itemLevel: 0,
                guild: '-',
                isActive: false,
                clearCount: '0회',
                lastUpdated: new Date().toISOString(),
                ...(mode === 'fixed' ? {
                    faction: serverObj?.faction as any,
                    server: serverObj?.name
                } : {})
            }]);
            closeModal();
        }
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setSearchName('');
        setSearchResult(null);
        setSearchServer('1006');
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

    const sortedMembers = useMemo(() => {
        const rankPriority: Record<string, number> = { '군단장': 0, '장교': 1, '엘리트 장교': 1, '군단병': 2 };
        const uniqueItems = new Map<string, GuildMember>();
        members.forEach(m => { if (m && m.name) uniqueItems.set(m.name, m); });
        return Array.from(uniqueItems.values()).sort((a, b) => {
            const rankDiff = (rankPriority[a.rank] ?? 99) - (rankPriority[b.rank] ?? 99);
            if (rankDiff !== 0) return rankDiff;
            const powerDiff = b.power - a.power;
            if (powerDiff !== 0) return powerDiff;
            return a.name.localeCompare(b.name, 'ko');
        });
    }, [members]);

    const renderedMemberRows = useMemo(() => {
        const colCount = mode === 'fixed' ? (isManageMode ? 6 : 5) : (isAdmin ? 10 : 8);
        if (sortedMembers.length === 0) {
            return <tr><td colSpan={colCount} className="text-center py-20 text-slate-400 font-medium">등록된 멤버가 없습니다.</td></tr>;
        }
        return sortedMembers.map(m => (
            <tr key={m.id} className={cn("transition-all duration-200", isManageMode && selectedIds.includes(m.id) ? "bg-indigo-50/50 dark:bg-indigo-900/20" : "hover:bg-slate-50/30 dark:hover:bg-slate-800/30")}>
                {isManageMode && (
                    <td className="px-2 py-5 text-center">
                        <div onClick={() => toggleSelection(m.id)} className={cn("w-6 h-6 mx-auto rounded-lg border-2 flex items-center justify-center cursor-pointer transition-all", selectedIds.includes(m.id) ? "bg-indigo-500 border-indigo-500 text-white" : "border-slate-200 dark:border-slate-700 hover:border-indigo-200")}>
                            {selectedIds.includes(m.id) && <Check size={16} strokeWidth={3} />}
                        </div>
                    </td>
                )}
                <td className="px-5 py-5 font-black text-slate-700 dark:text-slate-200 min-w-[170px]">
                    <a 
                        href={`https://aion2tool.com/char/serverid=${SERVER_LIST.find(s => s.name === m.server)?.id || '1006'}/${encodeURIComponent(m.name)}`} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="hover:text-indigo-500 hover:underline transition-all decoration-2 underline-offset-4"
                        title={`${m.name} 아툴 정보 보기`}
                    >
                        {m.name}
                    </a>
                </td>
                {mode !== 'fixed' && (
                    <td className="px-5 py-5 text-center">
                        <div className="relative w-[100px] mx-auto flex items-center justify-center">
                            <span className={cn("absolute left-0 pointer-events-none z-10", m.rank === '군단장' ? "text-amber-500" : (m.rank === '장교' || m.rank === '엘리트 장교') ? "text-indigo-400" : "text-slate-400")}>
                                {m.rank === '군단장' ? '👑' : (m.rank === '장교' || m.rank === '엘리트 장교') ? '🎖️' : '🛡️'}
                            </span>
                            <select
                                value={m.rank}
                                onChange={(e) => isAdmin && updateMembers(members.map(curr => curr.id === m.id ? { ...curr, rank: e.target.value as any } : curr))}
                                className={cn(
                                    "bg-transparent border-none outline-none font-bold cursor-pointer rounded px-2 py-1 transition-all hover:bg-white/50 dark:hover:bg-slate-700/50 text-center w-full appearance-none pl-6",
                                    m.rank === '군단장' ? "text-amber-500 text-sm" : (m.rank === '장교' || m.rank === '엘리트 장교') ? "text-indigo-400 text-sm" : "text-slate-400 text-[13px]"
                                )}
                            >
                                <option value="군단장">군단장</option>
                                <option value="장교">장교</option>
                                <option value="군단병">군단병</option>
                            </select>
                            <div className="absolute right-0 pointer-events-none text-slate-400"><ChevronDown size={14} strokeWidth={3} /></div>
                        </div>
                    </td>
                )}
                <td className="px-5 py-5 text-center font-bold text-slate-600 dark:text-slate-300">{m.class}</td>
                <td className="px-5 py-5 text-center font-bold text-slate-600 dark:text-slate-300">{m.itemLevel?.toLocaleString() || '-'}</td>
                <td className="px-5 py-5 text-center font-black text-indigo-600 dark:text-indigo-300">{m.power.toLocaleString()}</td>
                {mode === 'fixed' && (
                    <td className="px-5 py-5 text-center font-bold text-slate-600 dark:text-slate-300">
                        {m.server || '아리엘'}
                    </td>
                )}
                {mode !== 'fixed' && (
                    <>
                        <td className="px-5 py-5 text-center">
                            <select
                                value={m.clearCount}
                                onChange={(e) => isAdmin && updateMembers(members.map(curr => curr.id === m.id ? { ...curr, clearCount: e.target.value } : curr))}
                                className={cn(
                                    "bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 outline-none font-bold cursor-pointer rounded-lg px-3 py-1.5 transition-all text-xs",
                                    m.clearCount === '숙련' ? "text-indigo-400 border-indigo-200" : "text-slate-500 dark:text-slate-300"
                                )}
                            >
                                {['0회', '1회', '2회', '3회', '4회', '숙련'].map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </td>
                        {isAdmin && <SpecialNoteCell member={m} onSave={(notes) => updateMembers(members.map(curr => curr.id === m.id ? { ...curr, specialNotes: notes } : curr))} />}
                        {isAdmin && <JoinDateCell member={m} onSave={(date) => updateMembers(members.map(curr => curr.id === m.id ? { ...curr, joinDate: date } : curr))} />}
                        <td className="px-5 py-5 text-center">
                            <div className={cn("inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-black tracking-tighter", m.isActive ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30" : "bg-red-50 text-red-600 dark:bg-red-900/30")}>
                                <Check size={12} strokeWidth={4} /> {m.isActive ? '확인됨' : '미확인'}
                            </div>
                        </td>
                    </>
                )}
            </tr>
        ));
    }, [sortedMembers, isManageMode, selectedIds, isAdmin, members]);

    return (
        <div className="space-y-8 animate-in fade-in duration-700 min-w-[1050px]">
            <div className="flex justify-between items-center gap-6">
                <div>
                    <h2 className="text-4xl font-black text-slate-900 dark:text-white flex items-center gap-3 tracking-tight">
                        <Users className="text-indigo-500 dark:text-indigo-400" size={36} />
                        {mode === 'fixed' ? '고정 파티 멤버' : '레기온 멤버'}
                        {isSaving && <Loader2 size={24} className="text-slate-300 animate-spin ml-2" />}
                    </h2>
                    <div className="flex items-center gap-4 mt-3 font-medium">
                        <div className="text-slate-500 dark:text-slate-300 text-sm flex items-center gap-2">
                            <UserCheck size={14} className="text-indigo-400" />
                            {members.length}명의 멤버가 존재합니다.
                            <div className="group relative flex items-center">
                                <AlertCircle size={14} className="text-slate-400 cursor-help" />
                                <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-3 py-1.5 bg-slate-800 text-white text-xs rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-lg z-10">
                                    정각마다 자동 갱신됩니다.
                                </div>
                            </div>
                        </div>
                        <span className="text-[11px] bg-slate-100/80 dark:bg-slate-800/80 text-slate-400 dark:text-slate-300 px-3 py-1 rounded-full flex items-center gap-1.5 border border-slate-200 dark:border-slate-700">
                            <Clock size={12} />
                            마지막 전체 갱신: {lastFullRefresh ? formatRelativeTime(lastFullRefresh) : '기록 없음'}
                        </span>
                        {isBatchRunning && (
                            <span className="text-indigo-500 font-black animate-pulse text-sm">
                                [{progress.current}/{progress.total}] {progress.status}
                            </span>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {isAdmin && (
                        <button onClick={() => {
                            window.open('https://docs.google.com/spreadsheets/d/1L3XMo2hOd9drdGPT25S3kNdajxfVCeHf6k0Oznz3K70/edit', '_blank');
                        }} className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 transition-all px-4 py-3 rounded-2xl flex items-center gap-2 text-sm font-bold border border-emerald-100 shadow-sm dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800">
                            <Sheet size={18} /> 구글 시트
                        </button>
                    )}
                    {isAdmin && (!isManageMode ? (
                        <button onClick={() => setIsManageMode(true)} className="text-slate-500 hover:text-indigo-600 hover:bg-white transition-all px-4 py-3 rounded-2xl flex items-center gap-2 text-sm font-bold border border-transparent hover:border-indigo-100 shadow-sm dark:text-slate-400">
                            <Settings size={18} /> 관리하기
                        </button>
                    ) : (
                        <div className="flex items-center gap-2 bg-white/80 dark:bg-slate-800/80 backdrop-blur-md p-1.5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
                            <button onClick={() => setIsModalOpen(true)} className="px-4 py-2 text-sm font-bold text-indigo-500 dark:text-indigo-400 hover:bg-indigo-50 rounded-xl transition-all flex items-center gap-2"><Plus size={16} /> 추가</button>
                            {selectedIds.length > 0 && <button onClick={deleteSelected} className="px-4 py-2 text-sm font-bold text-red-500 hover:bg-red-50 rounded-xl transition-all flex items-center gap-2"><Trash2 size={16} /> 삭제 ({selectedIds.length})</button>}
                            <button onClick={() => { setIsManageMode(false); setSelectedIds([]); }} className="px-4 py-2 text-sm font-black text-slate-400 hover:text-slate-600 transition-all">닫기</button>
                        </div>
                    ))}
                    <div className="w-px h-8 bg-slate-200 dark:bg-slate-700 mx-0 hidden md:block" />
                    <ManualRefreshInput isManageMode={isManageMode} isManualUpdating={isManualUpdating} onUpdate={handleManualUpdate} />
                    <div className="w-px h-8 bg-slate-200 dark:bg-slate-700 mx-0 hidden md:block" />
                    <button onClick={(e) => handleRefreshAll(e)} disabled={isBatchRunning} className="glass-btn flex items-center gap-3 h-12 px-6">
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
                {isLoadingData ? (
                    <div className="flex flex-col items-center justify-center min-h-[400px] text-slate-400 gap-4">
                        <Loader2 className="animate-spin text-indigo-500" size={40} />
                        <p className="font-bold text-sm">데이터를 불러오는 중입니다...</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm text-slate-500 dark:text-slate-300 border-collapse">
                            <thead className="bg-slate-50/50 dark:bg-slate-800/50 text-slate-400 uppercase font-black tracking-widest text-[13px] border-b border-slate-100 dark:border-slate-700">
                                <tr>
                                    {isManageMode && <th className="w-16 px-2 py-5 text-center">선택</th>}
                                    <th className="px-5 py-5 text-center min-w-[170px]">닉네임</th>
                                    {mode !== 'fixed' && <th className="px-5 py-5 text-center">계급</th>}
                                    <th className="px-5 py-5 text-center">직업</th>
                                    <th className="px-5 py-5 text-center">장비 레벨</th>
                                    <th className="px-5 py-5 text-center">전투력</th>
                                    {mode === 'fixed' && <th className="px-5 py-5 text-center">서버</th>}
                                    {mode !== 'fixed' && (
                                        <>
                                            <th className="px-5 py-5 text-center">성역</th>
                                            {isAdmin && <th className="w-[120px] px-2 py-5 text-center">특이사항</th>}
                                            {isAdmin && <th className="px-5 py-5 text-center text-xs">가입일</th>}
                                            <th className="px-5 py-5 text-center">소속 여부</th>
                                        </>
                                    )}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50 dark:divide-slate-800">{renderedMemberRows}</tbody>
                        </table>
                    </div>
                )}
            </div>

            {isModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300">
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

                            {mode === 'fixed' && (
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <label className="block text-xs font-bold text-slate-500 pl-1 uppercase tracking-widest">서버 및 종족 선택</label>
                                        <div className="relative">
                                            <select 
                                                value={searchServer}
                                                onChange={(e) => setSearchServer(e.target.value)}
                                                className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-4 text-sm font-black outline-none focus:ring-2 focus:ring-indigo-500/20 appearance-none cursor-pointer"
                                            >
                                                <optgroup label="천족 (Elyos)">
                                                    {SERVER_LIST.filter(s => s.faction === '천족').map(s => (
                                                        <option key={s.id} value={s.id}>천족 - {s.name}</option>
                                                    ))}
                                                </optgroup>
                                                <optgroup label="마족 (Asmodian)">
                                                    {SERVER_LIST.filter(s => s.faction === '마족').map(s => (
                                                        <option key={s.id} value={s.id}>마족 - {s.name}</option>
                                                    ))}
                                                </optgroup>
                                            </select>
                                            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                                                <ChevronDown size={18} strokeWidth={3} />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="min-h-[140px] flex items-center justify-center bg-slate-50 dark:bg-slate-800/80 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700">
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
                                    ) : (
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
                            <button onClick={confirmAdd} disabled={!searchResult} className="glass-btn w-full h-14 text-lg font-black">추가하기</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function ManualRefreshInput({ isManageMode, isManualUpdating, onUpdate }: { isManageMode: boolean, isManualUpdating: boolean, onUpdate: (name: string) => void }) {
    const [localName, setLocalName] = useState('');
    const handleSubmit = () => { if (localName.trim() && !isManualUpdating) { onUpdate(localName.trim()); setLocalName(''); } };
    return (
        <div className="hidden md:flex items-center gap-1 bg-white/80 dark:bg-slate-800/80 backdrop-blur-md p-1 pr-1.5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm h-12 transition-all">
            <input type="text" placeholder="닉네임 갱신" className={cn("h-full bg-transparent text-sm font-black px-3 outline-none text-slate-700 dark:text-slate-200 placeholder:text-slate-400 transition-all", isManageMode ? "w-28" : "w-48")} value={localName} onChange={(e) => setLocalName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSubmit()} />
            <button onClick={handleSubmit} disabled={isManualUpdating || !localName.trim()} className="h-full aspect-square rounded-xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500 hover:text-white border border-indigo-100 flex items-center justify-center transition-all disabled:opacity-50">
                {isManualUpdating ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
            </button>
        </div>
    );
}

function SpecialNoteCell({ member, onSave }: { member: GuildMember, onSave: (notes: string) => void }) {
    const [localNotes, setLocalNotes] = useState(member.specialNotes || '');
    useEffect(() => { setLocalNotes(member.specialNotes || ''); }, [member.specialNotes]);
    return (
        <td className="w-[120px] px-2 py-3">
            <textarea
                value={localNotes}
                onChange={(e) => setLocalNotes(e.target.value)}
                onBlur={() => localNotes !== (member.specialNotes || '') && onSave(localNotes)}
                ref={(el) => { if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`; } }}
                className="w-full bg-transparent border-b border-transparent hover:border-slate-200 focus:border-indigo-400 outline-none px-2 py-1 text-xs font-bold transition-all text-slate-600 dark:text-slate-400 resize-none overflow-hidden leading-normal block max-h-[3.6rem]"
                placeholder="-"
            />
        </td>
    );
}

function JoinDateCell({ member, onSave }: { member: GuildMember, onSave: (date: string) => void }) {
    const [localDate, setLocalDate] = useState(member.joinDate || '');
    useEffect(() => { setLocalDate(member.joinDate || ''); }, [member.joinDate]);
    return (
        <td className="px-5 py-5 text-center">
            <input type="date" value={localDate} onChange={(e) => setLocalDate(e.target.value)} onBlur={() => localDate !== (member.joinDate || '') && onSave(localDate)} className="bg-transparent border-none outline-none text-xs font-bold text-slate-500 dark:text-slate-400 cursor-pointer hover:text-indigo-500" />
        </td>
    );
}
