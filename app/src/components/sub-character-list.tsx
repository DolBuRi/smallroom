'use client';
import { toast } from 'sonner';

import React, { useState, useEffect, useMemo } from 'react';
import { RefreshCw, Users, Search, Plus, Trash2, Settings, X, Check, Loader2, Clock, AlertCircle, ChevronDown, List, Pin, Zap, Edit2, HelpCircle } from 'lucide-react';
import { cn, formatRelativeTime, getClassColor, getJobShortName } from '@/lib/utils';
import { db } from '@/lib/firebase';
import { ref, onValue, set, remove, update } from 'firebase/database';
import { useAuth } from '@/context/AuthContext';
import { useAppMode } from '@/context/ModeContext';
import { GuildMember } from './member-list';
import { SERVER_LIST, scrapeMember, parsePowerAndItemLevel } from '@/lib/scraper';

interface SubCharacter extends Omit<GuildMember, 'rank' | 'clearCount' | 'isActive'> {
    ownerName: string;
    raidOptIn?: boolean;
    isPrivate?: boolean;
    aetherEnergy?: number;
    aetherEnergyLastUpdated?: string;
    aetherCharged?: number;
}

const CLASSES = ['수호성', '검성', '살성', '궁성', '마도성', '정령성', '치유성', '호법성'];

export default function SubCharacterList({ mode: propMode, isAdmin: propAdmin }: { mode?: 'legion' | 'fixed', isAdmin?: boolean }) {
    const { isAdmin: authAdmin, user, loading: authLoading } = useAuth();
    const { dbPath, mode: contextMode } = useAppMode();
    
    // Props take precedence over context
    const isAdmin = propAdmin !== undefined ? propAdmin : authAdmin;
    const mode = propMode || contextMode || 'legion';

    const [subChars, setSubChars] = useState<SubCharacter[]>([]);
    const [mainMembers, setMainMembers] = useState<any[]>([]);
    const [currentTime, setCurrentTime] = useState(new Date());
    const [isLoadingData, setIsLoadingData] = useState(true);
    const [isManageMode, setIsManageMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [lastFullRefresh, setLastFullRefresh] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<'owner' | 'class'>('owner');
    const [pinnedOwner, setPinnedOwner] = useState<string | null>(null);

    useEffect(() => {
        const saved = localStorage.getItem('pinnedOwner');
        if (saved) setPinnedOwner(saved);

        const timer = setInterval(() => {
            setCurrentTime(new Date());
        }, 60000);
        return () => clearInterval(timer);
    }, []);

    const togglePin = (owner: string) => {
        if (pinnedOwner === owner) {
            setPinnedOwner(null);
            localStorage.removeItem('pinnedOwner');
        } else {
            setPinnedOwner(owner);
            localStorage.setItem('pinnedOwner', owner);
        }
    };

    // Add Modal state
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [ownerName, setOwnerName] = useState('');
    const [searchName, setSearchName] = useState('');
    const [searchServer, setSearchServer] = useState('1006');
    const [searchResult, setSearchResult] = useState<SubCharacter | null | 'not-found'>(null);
    const [isSearching, setIsSearching] = useState(false);
    const [isBatchRunning, setIsBatchRunning] = useState(false);
    const [progress, setProgress] = useState({ current: 0, total: 0, status: '' });

    // Aether Energy Logic
    const getAetherTickCount = (lastUpdatedIso: string) => {
        const last = new Date(lastUpdatedIso);
        const now = new Date();
        if (last > now) return 0;

        let ticks = 0;
        const tickHours = [2, 5, 8, 11, 14, 17, 20, 23];
        
        // Start from the beginning of the hour of 'last'
        let check = new Date(last);
        check.setMinutes(0, 0, 0);
        check.setMilliseconds(0);

        // Iteratively move forward hour by hour
        while (check <= now) {
            if (tickHours.includes(check.getHours())) {
                // Only count if this specific tick (HH:00:00) happened AFTER 'last'
                if (check > last && check <= now) {
                    ticks++;
                }
            }
            check.setHours(check.getHours() + 1);
        }
        return ticks;
    };

    const getCurrentAether = (char: SubCharacter | GuildMember) => {
        const baseEnergy = char.aetherEnergy ?? 0;
        
        // Use aetherEnergyLastUpdated as primary.
        // If missing, use a stable fallback to prevent resets during hourly refreshes.
        // Character IDs are created using Date.now(), so they serve as a perfect stable fallback.
        let lastRefTime = char.aetherEnergyLastUpdated;
        
        if (!lastRefTime) {
            const idTimestamp = parseInt(char.id);
            if (!isNaN(idTimestamp) && idTimestamp > 1000000000000) { // Valid timestamp check
                lastRefTime = new Date(idTimestamp).toISOString();
            } else {
                lastRefTime = char.lastUpdated || new Date().toISOString();
            }
        }
        
        const ticks = getAetherTickCount(lastRefTime);
        const recovered = ticks * 15;
        // Maximum Base Energy is 840
        return Math.min(840, baseEnergy + recovered);
    };

    const getAetherPrediction = (char: SubCharacter) => {
        const currentBase = getCurrentAether(char);
        if (currentBase >= 840) return "오드가 가득 찼습니다! (낭비 중)";
        
        const tickHours = [2, 5, 8, 11, 14, 17, 20, 23];
        
        // Find next tick
        let nextTick = new Date(currentTime);
        nextTick.setMinutes(0, 0, 0);
        nextTick.setSeconds(0);
        nextTick.setMilliseconds(0);
        
        for (let i = 0; i < 24; i++) {
            nextTick.setHours(nextTick.getHours() + 1);
            if (tickHours.includes(nextTick.getHours())) {
                break;
            }
        }
        
        const diffMs = nextTick.getTime() - currentTime.getTime();
        const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
        const diffMins = Math.floor((diffMs / (1000 * 60)) % 60);
        
        const nextTimeStr = `${diffHrs > 0 ? `${diffHrs}시간 ` : ""}${diffMins}분 후 +15 회복`;
        
        const ticksNeeded = Math.ceil((840 - currentBase) / 15);
        if (ticksNeeded <= 1) return nextTimeStr;
        
        const totalHrs = (ticksNeeded - 1) * 3 + diffHrs;
        const fullDays = Math.floor(totalHrs / 24);
        const remainingHrs = totalHrs % 24;
        
        const fullTimeStr = `전체 회복까지 약 ${fullDays > 0 ? `${fullDays}일 ` : ""}${remainingHrs}시간 ${diffMins}분`;
        return `${nextTimeStr}\n${fullTimeStr}`;
    };

    const getNextTickCountdown = () => {
        const tickHours = [2, 5, 8, 11, 14, 17, 20, 23];
        let nextTick = new Date(currentTime);
        nextTick.setMinutes(0, 0, 0);
        nextTick.setSeconds(0);
        nextTick.setMilliseconds(0);
        
        for (let i = 0; i < 24; i++) {
            nextTick.setHours(nextTick.getHours() + 1);
            if (tickHours.includes(nextTick.getHours())) {
                break;
            }
        }
        
        const diffMs = nextTick.getTime() - currentTime.getTime();
        const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
        const diffMins = Math.floor((diffMs / (1000 * 60)) % 60);
        
        return `${diffHrs > 0 ? `${diffHrs}시간 ` : ""}${diffMins}분`;
    };

    const [editingAether, setEditingAether] = useState<{ id: string, base: string, charged: string, isMain?: boolean } | null>(null);
    const aetherInputRef = React.useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (editingAether && aetherInputRef.current) {
            aetherInputRef.current.focus();
        }
    }, [editingAether?.id]); // Only focus when opening a new character's modal

    const handleUpdateAether = async (id: string, base: string, charged: string, isMain?: boolean) => {
        const b = parseInt(base);
        const c = parseInt(charged) || 0;
        if (isNaN(b)) return;
        
        const basePath = isMain ? dbPath.members : dbPath.subCharacters;
        
        await set(ref(db, `${basePath}/${id}/aetherEnergy`), Math.min(840, b));
        await set(ref(db, `${basePath}/${id}/aetherCharged`), Math.min(2000, c));
        await set(ref(db, `${basePath}/${id}/aetherEnergyLastUpdated`), new Date().toISOString());
        setEditingAether(null);
    };

    const handleConsumeAether = async (c: SubCharacter | GuildMember, isMain?: boolean) => {
        const currentBase = getCurrentAether(c);
        const currentCharged = c.aetherCharged || 0;
        const total = currentBase + currentCharged;
        
        if (total < 80) return; // Not enough energy
        
        let newBase = currentBase;
        let newCharged = currentCharged;
        
        // Priority: Use Base energy first to allow it to recover
        if (newBase >= 80) {
            newBase -= 80;
        } else {
            const remainder = 80 - newBase;
            newBase = 0;
            newCharged = Math.max(0, newCharged - remainder);
        }
        
        const basePath = isMain ? dbPath.members : dbPath.subCharacters;
        
        await set(ref(db, `${basePath}/${c.id}/aetherEnergy`), newBase);
        await set(ref(db, `${basePath}/${c.id}/aetherCharged`), newCharged);
        await set(ref(db, `${basePath}/${c.id}/aetherEnergyLastUpdated`), new Date().toISOString());
    };

    const renderAetherCell = (char: SubCharacter | GuildMember, isMain?: boolean) => {
        const isEditing = editingAether?.id === char.id && !!editingAether?.isMain === !!isMain;
        const currentEnergy = getCurrentAether(char);
        const totalEnergy = currentEnergy + (char.aetherCharged || 0);

        if (isEditing) {
            return (
                <div className="flex flex-col items-center justify-center gap-1.5 h-full min-w-[140px]" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-1.5 bg-slate-800 dark:bg-slate-800/80 rounded-full px-3 py-1 shadow-inner border border-slate-700/50">
                        <input
                            ref={aetherInputRef}
                            type="number"
                            className="bg-transparent text-white w-9 text-center text-xs font-black outline-none placeholder:text-slate-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            value={editingAether.base}
                            onChange={(e) => setEditingAether(prev => prev ? { ...prev, base: e.target.value } : null)}
                            onKeyDown={(e) => {
                                e.stopPropagation();
                                if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                                    handleUpdateAether(editingAether.id, editingAether.base, editingAether.charged, editingAether.isMain);
                                }
                            }}
                        />
                        <RefreshCw size={10} className="text-slate-400" />
                        <span className="text-slate-400 text-[10px] font-black">+</span>
                        <input
                            type="number"
                            className="bg-transparent text-cyan-400 w-9 text-center text-xs font-black outline-none placeholder:text-cyan-800/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            value={editingAether.charged}
                            onChange={(e) => setEditingAether(prev => prev ? { ...prev, charged: e.target.value } : null)}
                            onKeyDown={(e) => {
                                e.stopPropagation();
                                if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                                    handleUpdateAether(editingAether.id, editingAether.base, editingAether.charged, editingAether.isMain);
                                }
                            }}
                        />
                    </div>
                    <div className="flex items-center gap-1">
                        <button 
                            onClick={(e) => { e.stopPropagation(); handleUpdateAether(editingAether.id, editingAether.base, editingAether.charged, editingAether.isMain); }}
                            className="bg-indigo-500 hover:bg-indigo-400 text-white text-[10px] font-black px-2.5 py-0.5 rounded transition-colors"
                        >
                            적용
                        </button>
                        <button 
                            onClick={(e) => { e.stopPropagation(); setEditingAether(null); }}
                            className="bg-slate-600 hover:bg-slate-500 text-white text-[10px] font-black px-2.5 py-0.5 rounded transition-colors"
                        >
                            취소
                        </button>
                    </div>
                </div>
            );
        }

        return (
            <div className="flex items-center justify-center h-full">
                <div 
                    className={cn(
                        "flex items-stretch bg-white dark:bg-slate-900/40 rounded-xl border border-slate-100 dark:border-slate-800/60 shadow-sm overflow-hidden transition-all hover:shadow-md hover:border-slate-200 dark:hover:border-slate-700 relative",
                        currentEnergy >= 840 && "animate-pulse border-red-300 dark:border-red-900 shadow-[0_0_15px_rgba(239,68,68,0.15)] bg-red-50/30 dark:bg-red-900/10"
                    )    
}
                    title={getAetherPrediction(char as SubCharacter)}
                >
                    {/* Energy Info Section */}
                    <div 
                        onClick={() => setEditingAether({ 
                            id: char.id, 
                            base: currentEnergy.toString(), 
                            charged: (char.aetherCharged || 0).toString(),
                            isMain 
                        })}
                        className="group/energy relative flex items-center gap-2.5 px-2.5 py-2 cursor-pointer hover:bg-slate-100/50 dark:hover:bg-slate-800/50 transition-colors min-w-[80px]"
                    >
                        <div className="flex-shrink-0 relative">
                            <Zap size={14} className={cn(
                                "transition-transform group-hover/energy:scale-110",
                                currentEnergy >= 840 
                                    ? "text-red-500 fill-red-500 drop-shadow-[0_0_8px_rgba(239,68,68,0.5)]" 
                                    : "text-cyan-400 fill-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.5)]"
                            )} />
                        </div>
                        <div className="flex flex-col items-start">
                            <span className={cn(
                                "font-black tracking-tight text-sm leading-none mb-0.5",
                                currentEnergy >= 840 ? "text-red-600 dark:text-red-400" : "text-slate-800 dark:text-slate-100"
                            )}>
                                {currentEnergy}
                            </span>
                            <span className="text-[12px] font-black text-cyan-600 dark:text-cyan-400 leading-none">
                                +{char.aetherCharged || 0}
                            </span>
                        </div>
                        <div className="absolute top-1 right-1 opacity-0 group-hover/energy:opacity-100 transition-opacity">
                            <Edit2 size={8} className="text-slate-400" />
                        </div>
                    </div>

                    {/* Divider */}
                    <div className="w-px bg-slate-100 dark:bg-slate-800/60 my-1.5" />

                    {/* Cube Action Section */}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            if (totalEnergy < 80) {
                                toast.error("오드 에너지가 부족하여 큐브를 열 수 없습니다.");
                                return;
                            }
                            handleConsumeAether(char, isMain);
                        }}
                        className={cn(
                            "group/spend flex items-center justify-center px-2 min-w-[36px] transition-all outline-none",
                            totalEnergy >= 80
                                ? "hover:bg-cyan-500 text-cyan-500 hover:text-white"
                                : "text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/50"
                        )}
                        title="오드 80 소모 (큐브 보상)"
                    >
                        <div className="flex flex-col items-center gap-0.5">
                            <div className="flex flex-col items-center text-[10px] font-black leading-[0.9] tracking-tighter">
                                <span>큐</span>
                                <span>브</span>
                            </div>
                            <div className="w-2.5 h-0.5 rounded-full bg-current opacity-30 group-hover/spend:w-3.5 transition-all" />
                        </div>
                    </button>

                    {/* Progress Bar */}
                    <div className="absolute bottom-0 left-0 h-0.5 bg-slate-200 dark:bg-slate-800 w-full overflow-hidden">
                        <div 
                            className={cn(
                                "h-full transition-all duration-1000",
                                currentEnergy >= 840 ? "bg-red-500" : "bg-cyan-400"
                            )}
                            style={{ width: `${Math.min(100, (currentEnergy / 840) * 100)}%` }}
                        />
                    </div>
                </div>
            </div>
        );
    };

    useEffect(() => {
        if (authLoading) return;

        // Fetch Sub-characters
        const subCharsRef = ref(db, dbPath.subCharacters || 'sub_characters');
        const unsubscribeSub = onValue(subCharsRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                const list = Object.entries(data).map(([key, val]: [string, any]) => {
                    const { power, itemLevel } = parsePowerAndItemLevel(val.power, val.itemLevel);

                    return {
                        ...val,
                        id: key,
                        power: power || 0,
                        itemLevel: itemLevel || 0
                    };
                });

                // Deduplicate by name if duplicates exist
                const uniqueList = Array.from(new Map(list.map(item => [item.name, item])).values());
                setSubChars(uniqueList);

                // Auto-cleanup duplicates from Firebase if any
                if (list.length !== uniqueList.length) {
                    const uniqueKeys = new Set(uniqueList.map(u => u.id));
                    const duplicates = list.filter(item => !uniqueKeys.has(item.id));
                    duplicates.forEach(d => remove(ref(db, `${dbPath.subCharacters}/${d.id}`)));
                }
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
                const list = Object.entries(data).map(([key, m]: [string, any]) => {
                    const { power, itemLevel } = parsePowerAndItemLevel(m.power, m.itemLevel);
                    return { ...m, id: key, power, itemLevel };
                });
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
    }, [user, authLoading, dbPath]);

    const handleRefreshAll = async (e?: React.MouseEvent) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }

        if (isBatchRunning) return;
        if (!window.confirm(`전체 ${subChars.length}명의 정보를 갱신하시겠습니까?\n시간이 다소 소요될 수 있습니다. 진행하시겠습니까?`)) return;

        setIsBatchRunning(true);
        const validChars = subChars.filter(c => c && c.name);
        let successCount = 0;

        for (let i = 0; i < validChars.length; i++) {
            const char = validChars[i];
            setProgress({ current: i + 1, total: validChars.length, status: `${char.name} 갱신 중...` });

            try {
                const targetServerId = char.server ? (SERVER_LIST.find(s => s.name === char.server)?.id || '1006') : '1006';
                const res = await scrapeMember(char.name, targetServerId);
                if (res.success && res.data) {
                    const { power, itemLevel } = parsePowerAndItemLevel(res.data.power, res.data.itemLevel);

                    // Individual update for robustness
                    await update(ref(db, `${dbPath.subCharacters}/${char.id}`), {
                        power,
                        itemLevel,
                        class: res.data.class,
                        guild: res.data.guild,
                        lastUpdated: new Date().toISOString()
                    });
                    successCount++;
                }
            } catch (e) {
                console.error(`Refresh error for ${char.name}:`, e);
            }
            if (i < validChars.length - 1) await new Promise(r => setTimeout(r, 2000));
        }

        try {
            await set(ref(db, dbPath.subCharsLastRefresh), new Date().toISOString());
        } catch (e) { }

        setIsBatchRunning(false);
        setProgress({ current: 0, total: 0, status: '' });
        alert(`갱신 완료! (성공: ${successCount}/${validChars.length})`);
    };

    const handleSingleRefresh = async (char: SubCharacter) => {
        if (isBatchRunning) return;
        
        try {
            const targetServerId = char.server ? (SERVER_LIST.find(s => s.name === char.server)?.id || '1006') : '1006';
            const res = await scrapeMember(char.name, targetServerId);
            if (res.success && res.data) {
                const { power, itemLevel } = parsePowerAndItemLevel(res.data.power, res.data.itemLevel);

                await update(ref(db, `${dbPath.subCharacters}/${char.id}`), {
                    power,
                    itemLevel,
                    class: res.data.class,
                    guild: res.data.guild,
                    lastUpdated: new Date().toISOString()
                });
                toast.success(`${char.name} 정보 갱신 완료`);
            } else {
                toast.error(`${char.name} 갱신 실패: ${res.error || '데이터 없음'}`);
            }
        } catch (e) {
            toast.error(`${char.name} 갱신 중 오류 발생`);
        }
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
            }, 60000); // 60초 대기 (고성능 스크래퍼 대응)
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
                const { power, itemLevel } = parsePowerAndItemLevel(res.data.power, res.data.itemLevel);

                setSearchResult({
                    id: Date.now().toString(),
                    name: res.data.name,
                    class: res.data.class,
                    power,
                    itemLevel,
                    guild: res.data.guild,
                    server: SERVER_LIST.find(s => s.name === searchServer)?.name || '아리엘',
                    ownerName: ownerName,
                    aetherEnergy: 75, // Initial energy for new characters
                    aetherEnergyLastUpdated: new Date().toISOString(),
                    aetherCharged: 0,
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
                guild: '-',
                server: SERVER_LIST.find(s => s.id === searchServer)?.name || '아리엘',
                ownerName: ownerName.trim(),
                aetherEnergy: 75,
                aetherEnergyLastUpdated: new Date().toISOString(),
                aetherCharged: 0,
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

    const visibleSubChars = useMemo(() => {
        return isAdmin ? subChars : subChars.filter(c => !c.isPrivate);
    }, [subChars, isAdmin]);

    const groupedChars = useMemo(() => {
        const groups: Record<string, SubCharacter[]> = {};
        visibleSubChars.forEach(c => {
            if (!groups[c.ownerName]) groups[c.ownerName] = [];
            groups[c.ownerName].push(c);
        });

        // 전투력 내림차순 정렬
        Object.values(groups).forEach(list => {
            list.sort((a, b) => b.power - a.power);
        });

        return groups;
    }, [visibleSubChars]);

    const groupedByClass = useMemo(() => {
        const groups: Record<string, SubCharacter[]> = {};
        CLASSES.forEach(cls => groups[cls] = []);
        visibleSubChars.forEach(c => {
            if (groups[c.class] && (c.power || 0) >= 2700 && c.raidOptIn !== false) groups[c.class].push(c);
        });

        // 전투력 내림차순 정렬
        Object.values(groups).forEach(list => {
            list.sort((a, b) => b.power - a.power);
        });

        return groups;
    }, [visibleSubChars]);

    const classStats = useMemo(() => {
        const stats: Record<string, { main: number, sub: number }> = {};
        CLASSES.forEach(cls => stats[cls] = { main: 0, sub: 0 });

        mainMembers.forEach(m => {
            if (stats[m.class] && (m.power || 0) >= 2700) stats[m.class].main++;
        });
        visibleSubChars.forEach(c => {
            if (stats[c.class] && (c.power || 0) >= 2700 && c.raidOptIn !== false) stats[c.class].sub++;
        });
        return stats;
    }, [mainMembers, visibleSubChars]);

    return (
        <div className="space-y-8 animate-in fade-in duration-700">
            <div className="flex justify-between items-center gap-6">
                <div>
                    <h2 className="text-4xl font-black text-slate-900 dark:text-white flex items-center gap-3 tracking-tight">
                        <List className="text-indigo-500" size={36} />
                        고정 멤버 부캐
                        {isBatchRunning && <Loader2 size={24} className="text-indigo-500 animate-spin ml-2" />}
                    </h2>
                    <div className="flex items-center gap-4 mt-3 font-medium">
                        <div className="text-slate-500 dark:text-slate-300 text-sm flex items-center gap-2">
                            <Users size={14} className="text-indigo-400" />
                            {visibleSubChars.length}개의 부캐릭터가 존재합니다.
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
                            마지막 전체 갱신: {lastFullRefresh ? formatRelativeTime(lastFullRefresh) : '기록 없음'}
                        </span>
                        {isBatchRunning && (
                            <span className="text-indigo-500 font-black animate-pulse text-sm">
                                [{progress.current}/{progress.total}] {progress.status}
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
                        <button onClick={(e) => handleRefreshAll(e)} disabled={isBatchRunning} className="glass-btn flex items-center gap-3 h-12 px-6">
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
                ) : visibleSubChars.length === 0 ? (
                    <div className="glass-panel py-20 text-center text-slate-400 font-bold">등록된 부캐 정보가 없습니다.</div>
                ) : viewMode === 'owner' ? (
                    /* Grouped by Owner */
                    Object.entries(groupedChars)
                        .sort(([ownerA], [ownerB]) => {
                            if (ownerA === pinnedOwner) return -1;
                            if (ownerB === pinnedOwner) return 1;

                            // 메인 멤버(고정 멤버)의 전투력을 기준으로 내림차순 정렬
                            const powerA = mainMembers.find(m => m.name === ownerA)?.power || 0;
                            const powerB = mainMembers.find(m => m.name === ownerB)?.power || 0;

                            return powerB - powerA;
                        })
                        .map(([owner, chars]) => {
                            const ownerInfo = mainMembers.find(m => m.name === owner);
                            const ownerClass = ownerInfo?.class || '';

                            return (
                                <div key={owner} className="glass-panel overflow-visible">
                                    <div className="px-8 py-5 bg-slate-50/50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
                                        <div className="flex items-center gap-4">
                                            <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm shadow-sm shrink-0", getClassColor(ownerClass))}>
                                                {getJobShortName(ownerClass)}
                                            </div>
                                            <div className="flex flex-col">
                                                <div className="flex items-center gap-2">
                                                    <a 
                                                        href={`https://aion2tool.com/char/serverid=${SERVER_LIST.find(s => s.name === (mainMembers.find(m => m.name === owner)?.server || '아리엘'))?.id || '1006'}/${encodeURIComponent(owner)}`} 
                                                        target="_blank" 
                                                        rel="noopener noreferrer"
                                                        className="text-xl font-black text-slate-800 dark:text-slate-200 tracking-tight hover:text-indigo-500 hover:underline transition-all decoration-2 underline-offset-4"
                                                        title={`${owner} 아툴 정보 보기`}
                                                    >
                                                        {owner}
                                                    </a>
                                                    <span className="text-slate-400 font-bold text-sm">의 부캐 목록</span>
                                                    {ownerInfo && (
                                                        <div className="ml-4">
                                                            {renderAetherCell(ownerInfo, true)}
                                                        </div>
                                                    )}
                                                    <button
                                                        onClick={() => togglePin(owner)}
                                                        className={cn("ml-2 p-1.5 rounded-lg transition-all", pinnedOwner === owner ? "bg-amber-100 text-amber-500 dark:bg-amber-900/30 dark:text-amber-400" : "bg-slate-100 text-slate-400 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-400 dark:hover:bg-slate-600")}
                                                        title={pinnedOwner === owner ? "최상단 고정 해제" : "내 캐릭터로 설정하여 최상단에 고정"}
                                                    >
                                                        <Pin size={16} className={pinnedOwner === owner ? "fill-amber-500 dark:fill-amber-400" : ""} />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                        <span className="text-xs font-black text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-4 py-1.5 rounded-full uppercase tracking-widest">{chars.length} SUB-CHARS</span>
                                    </div>
                                    <div className="overflow-x-auto pt-10 -mt-10">
                                        <table className="w-full text-left text-sm text-slate-500 dark:text-slate-300 table-fixed">
                                            <thead className="text-[11px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-50 dark:border-slate-800">
                                                <tr>
                                                    {isManageMode && isAdmin && <th className="w-16 px-5 py-4 text-center">선택</th>}
                                                    <th className="w-40 px-8 py-4 text-left">닉네임</th>
                                                    <th className="w-40 px-8 py-4 text-center">직업</th>
                                                    <th className="w-32 px-8 py-4 text-center">장비 레벨</th>
                                                    <th className="w-32 px-8 py-4 text-center">전투력</th>
                                                                                                         <th className="w-32 px-8 py-4 text-center">
                                                         <div className="flex items-center justify-center gap-1.5">
                                                             오드 에너지
                                                             <div className="group relative flex items-center">
                                                                 <HelpCircle size={14} className="text-slate-400 cursor-help" />
                                                                 <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-3 py-2 bg-slate-800 text-white text-[11px] rounded-xl whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-xl z-20 font-bold border border-slate-700">
                                                                     주기 충전까지 남은 시간: <span className="text-cyan-400">{getNextTickCountdown()}</span>
                                                                     <div className="absolute left-1/2 -translate-x-1/2 top-full border-4 border-transparent border-t-slate-800"></div>
                                                                 </div>
                                                             </div>
                                                         </div>
                                                     </th>

                                                    <th className="w-32 px-8 py-4 text-center">서버</th>
                                                    <th className="w-28 px-4 py-4 text-center text-indigo-500 bg-indigo-50/50 dark:bg-indigo-900/10">성역 매칭 희망</th>
                                                    {isAdmin && <th className="w-24 px-4 py-4 text-center text-rose-500 bg-rose-50/50 dark:bg-rose-900/10">비공개</th>}
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
                                                            <div className="flex items-center gap-2 group/nick">
                                                                <a 
                                                                    href={`https://aion2tool.com/char/serverid=${SERVER_LIST.find(s => s.name === c.server)?.id || '1006'}/${encodeURIComponent(c.name)}`} 
                                                                    target="_blank" 
                                                                    rel="noopener noreferrer"
                                                                    className="truncate hover:text-indigo-500 hover:underline transition-all decoration-2 underline-offset-4 block" 
                                                                    title={`${c.name} 아툴 정보 보기`}
                                                                >
                                                                    {c.name}
                                                                </a>
                                                                <button 
                                                                    onClick={() => handleSingleRefresh(c)}
                                                                    className="p-1 text-slate-300 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-slate-700 rounded transition-all opacity-0 group-hover/nick:opacity-100"
                                                                    title="이 캐릭터만 갱신"
                                                                >
                                                                    <RefreshCw size={12} className={isBatchRunning ? "animate-spin" : ""} />
                                                                </button>
                                                            </div>
                                                        </td>
                                                        <td className="w-40 px-8 py-5 text-center font-bold text-slate-600 dark:text-slate-300">{c.class}</td>
                                                        <td className="w-32 px-8 py-5 text-center font-bold text-slate-600 dark:text-slate-300">{c.itemLevel?.toLocaleString() || '-'}</td>
                                                        <td className="w-32 px-8 py-5 text-center font-black text-indigo-500">{c.power.toLocaleString()}</td>
                                                        <td className="w-32 px-8 py-5 text-center">
                                                            {renderAetherCell(c)}
                                                        </td>
                                                        <td className="w-32 px-8 py-5 text-center font-bold text-slate-400">{c.server}</td>
                                                        <td className="w-28 px-4 py-5 text-center bg-indigo-50/20 dark:bg-indigo-900/5">
                                                            <input
                                                                type="checkbox"
                                                                className={cn("w-4 h-4 accent-indigo-500 transition-transform", isManageMode ? "cursor-pointer hover:scale-110" : "cursor-not-allowed opacity-60")}
                                                                checked={c.raidOptIn !== false}
                                                                onChange={(e) => {
                                                                    set(ref(db, `${dbPath.subCharacters}/${c.id}/raidOptIn`), e.target.checked);
                                                                }}
                                                                disabled={!isManageMode}
                                                            />
                                                        </td>
                                                        {isAdmin && (
                                                            <td className="w-24 px-4 py-5 text-center bg-rose-50/20 dark:bg-rose-900/5">
                                                                <input
                                                                    type="checkbox"
                                                                    className={cn("w-4 h-4 accent-rose-500 transition-transform", isManageMode ? "cursor-pointer hover:scale-110" : "cursor-not-allowed opacity-60")}
                                                                    checked={!!c.isPrivate}
                                                                    onChange={(e) => {
                                                                        set(ref(db, `${dbPath.subCharacters}/${c.id}/isPrivate`), e.target.checked);
                                                                    }}
                                                                    disabled={!isManageMode}
                                                                />
                                                            </td>
                                                        )}
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
                                                    <span><span className="text-indigo-300 font-black">성역 매칭 희망</span> 캐릭터 기준</span>
                                                    <span>루드라 참여 가능 캐릭터 <span className="text-indigo-300 font-black">(2700+)</span> 집계</span>
                                                </div>
                                                <div className="absolute left-2 top-full border-[6px] border-transparent border-t-slate-800/95"></div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex gap-4">
                                    <div className="bg-white/50 dark:bg-slate-700/50 px-4 py-2 rounded-2xl border border-slate-100/50 dark:border-slate-600">
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
                                                <th className="w-32 px-8 py-4 text-center">장비 레벨</th>
                                                <th className="w-40 px-8 py-4 text-center">전투력</th>
                                                <th className="w-32 px-8 py-4 text-center">오드 에너지</th>
                                                <th className="w-40 px-8 py-4 text-center">본캐</th>
                                                <th className="w-32 px-8 py-4 text-center">서버</th>
                                                {isAdmin && <th className="w-24 px-4 py-4 text-center text-rose-500 bg-rose-50/50 dark:bg-rose-900/10">비공개</th>}
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
                                                        <a 
                                                            href={`https://aion2tool.com/char/serverid=${SERVER_LIST.find(s => s.name === c.server)?.id || '1006'}/${encodeURIComponent(c.name)}`} 
                                                            target="_blank" 
                                                            rel="noopener noreferrer"
                                                            className="truncate hover:text-indigo-500 hover:underline transition-all decoration-2 underline-offset-4 block" 
                                                            title={`${c.name} 아툴 정보 보기`}
                                                        >
                                                            {c.name}
                                                        </a>
                                                    </td>
                                                    <td className="w-40 px-8 py-5 text-center font-bold text-slate-600 dark:text-slate-300">{c.class}</td>
                                                    <td className="w-32 px-8 py-5 text-center font-bold text-slate-600 dark:text-slate-300">{c.itemLevel?.toLocaleString() || '-'}</td>
                                                    <td className="w-32 px-8 py-5 text-center font-black text-indigo-500">{c.power.toLocaleString()}</td>
                                                    <td className="w-32 px-8 py-5 text-center">
                                                        {renderAetherCell(c)}
                                                    </td>
                                                    <td className="w-40 px-8 py-5 text-center font-bold text-slate-500">
                                                        <a 
                                                            href={`https://aion2tool.com/char/serverid=${SERVER_LIST.find(s => s.name === (mainMembers.find(m => m.name === c.ownerName)?.server || '아리엘'))?.id || '1006'}/${encodeURIComponent(c.ownerName)}`} 
                                                            target="_blank" 
                                                            rel="noopener noreferrer"
                                                            className="hover:text-indigo-500 hover:underline transition-all decoration-1 underline-offset-4"
                                                            title={`${c.ownerName} 아툴 정보 보기`}
                                                        >
                                                            {c.ownerName}
                                                        </a>
                                                    </td>
                                                    <td className="w-32 px-8 py-5 text-center font-bold text-slate-400">{c.server}</td>
                                                    {isAdmin && (
                                                        <td className="w-24 px-4 py-5 text-center bg-rose-50/20 dark:bg-rose-900/5">
                                                            <input
                                                                type="checkbox"
                                                                className={cn("w-4 h-4 accent-rose-500 transition-transform", isManageMode ? "cursor-pointer hover:scale-110" : "cursor-not-allowed opacity-60")}
                                                                checked={!!c.isPrivate}
                                                                onChange={(e) => {
                                                                    set(ref(db, `${dbPath.subCharacters}/${c.id}/isPrivate`), e.target.checked);
                                                                }}
                                                                disabled={!isManageMode}
                                                            />
                                                        </td>
                                                    )}
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

            {
                isModalOpen && (
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
                                        <input type="text" placeholder="예: 사신대행이치고" className="glass-input w-full px-4 font-bold h-12" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="block text-xs font-bold text-slate-400 pl-1 uppercase tracking-widest">부캐 서버</label>
                                        <select value={searchServer} onChange={(e) => setSearchServer(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl px-4 h-12 text-sm font-black outline-none appearance-none cursor-pointer">
                                            {SERVER_LIST.filter(s => s.id !== 'all').map(s => <option key={s.id} value={s.id}>{s.faction} - {s.name}</option>)}
                                        </select>
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
                )
            }
        </div >
    );
}
