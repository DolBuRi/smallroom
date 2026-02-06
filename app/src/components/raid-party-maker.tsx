'use client';

import React, { useState, useEffect } from 'react';
import { DndContext, DragOverlay, useDraggable, useDroppable, DragStartEvent, DragEndEvent, closestCenter } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Users, GripVertical, Shuffle, Zap, Trash2, Copy, Check, Sword, Shield, Crosshair, Sparkles, Settings2, X, ChevronRight, Clock, Calendar, Plus } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/lib/firebase';
import { ref, onValue } from 'firebase/database';
import { cn } from '@/lib/utils';

// --- Types ---
interface Member {
    id: string;
    name: string;
    class: string;
    power: number;
    score?: number; // Added score
    rank: string;
    fixedGroupId?: string;
    availability?: Record<string, string[]>;
}

interface AlgoCard {
    id: string;
    label: string;
    desc: string;
    active: boolean;
}

interface Party {
    id: string;
    name: string;
    members: Member[];
    assignedDay?: string; // Persist Day
    assignedTime?: string; // Persist Time Slot ID
}

// --- Constants & Helpers ---
const WEEKDAY_SLOTS = [
    { id: 'wd1', label: '18:30', fullLabel: '18:30 ~ 20:30' },
    { id: 'wd2', label: '20:30', fullLabel: '20:30 ~ 22:30' },
    { id: 'wd3', label: '22:30', fullLabel: '22:30 ~ 00:30' },
];
const WEEKEND_SLOTS = [
    { id: 'we1', label: '14:00', fullLabel: '14:00 ~ 16:00' },
    { id: 'we2', label: '16:00', fullLabel: '16:00 ~ 18:00' },
    { id: 'we3', label: '18:30', fullLabel: '18:30 ~ 20:30' },
    { id: 'we4', label: '20:30', fullLabel: '20:30 ~ 22:30' },
    { id: 'we5', label: '22:30', fullLabel: '22:30 ~ 00:30' },
];

const DAYS = ['월', '화', '수', '목', '금', '토', '일'];

const CLASS_ICONS: Record<string, React.ReactNode> = {
    '검성': <Sword size={14} className="text-sky-500" />,
    '수호성': <Shield size={14} className="text-indigo-500" />,
    '살성': <Sword size={14} className="text-lime-500" />,
    '궁성': <Crosshair size={14} className="text-emerald-500" />,
    '마도성': <Sparkles size={14} className="text-purple-500" />,
    '정령성': <Sparkles size={14} className="text-violet-400" />,
    '치유성': <Zap size={14} className="text-yellow-500" />,
    '호법성': <Zap size={14} className="text-orange-500" />,
};

const getClassColor = (className: string) => {
    switch (className) {
        case '수호성': return "bg-indigo-900 text-white";
        case '검성': return "bg-sky-400 text-white";
        case '궁성': return "bg-emerald-700 text-emerald-50";
        case '살성': return "bg-lime-400 text-slate-900";
        case '호법성': return "bg-orange-500 text-white";
        case '치유성': return "bg-yellow-400 text-slate-900";
        case '마도성': return "bg-purple-600 text-white";
        case '정령성': return "bg-violet-300 text-slate-900";
        default: return "bg-slate-400 text-white";
    }
};

// --- Main Component ---
export default function RaidPartyMaker() {
    const { loading } = useAuth();

    // Data State
    const [allMembers, setAllMembers] = useState<Member[]>([]);
    const [dbMembers, setDbMembers] = useState<Record<string, any>>({}); // Store raw members data
    const [rawApplications, setRawApplications] = useState<any[]>([]); // Store raw apps data
    const [pool, setPool] = useState<Member[]>([]);
    const [parties, setParties] = useState<Party[]>([
        { id: 'party-1', name: '1파티', members: [] },
        { id: 'party-2', name: '2파티', members: [] },
        { id: 'party-3', name: '3파티', members: [] },
        { id: 'party-4', name: '4파티', members: [] },
    ]);
    const [draggedMember, setDraggedMember] = useState<Member | null>(null);

    // Algorithm State
    const [algoCards, setAlgoCards] = useState<AlgoCard[]>([
        { id: 'fixed_group', label: '🔒 고정 파티 우선', desc: 'Fixed Group ID가 있는 멤버들을 최우선으로 묶습니다.', active: true },
        { id: 'tank_healer', label: '🛡️ 탱1+힐1 필수', desc: '각 파티에 탱커/힐러를 최소 1명씩 배정합니다.', active: true },
        { id: 'power_balance', label: '⚖️ 전투력 밸런스', desc: '파티 간 평균 전투력을 비슷하게 맞춥니다.', active: false },
        { id: 'ace_first', label: '🔥 1파티 에이스', desc: '전투력 최상위 6명을 1파티에 몰아줍니다.', active: false },
        { id: 'class_mix', label: '✨ 직업 다양성', desc: '동일 직업이 3명 이상 겹치지 않게 분산합니다.', active: true },
    ]);

    // UI State
    const [isOptionsOpen, setIsOptionsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterClass, setFilterClass] = useState('ALL');
    const [selectedDay, setSelectedDay] = useState<string>('월');
    const [selectedSlot, setSelectedSlot] = useState<string>(''); // Empty = All
    const [isTestMode, setIsTestMode] = useState(false);

    // Validation State
    const [confirmationModal, setConfirmationModal] = useState<{
        isOpen: boolean;
        message: string;
        onConfirm: () => void;
        onCancel: () => void;
    }>({
        isOpen: false,
        message: '',
        onConfirm: () => { },
        onCancel: () => { },
    });

    // Helper: Get Force Info
    const getForceInfo = (forceIndex: number) => {
        // Force 1: Parties 0, 1. Force 2: Parties 2, 3
        const forceParties = parties.slice(forceIndex * 2, (forceIndex * 2) + 2);
        // Return the assigned time from ANY party in the force (they should be synced)
        const activeParty = forceParties.find(p => p.assignedTime);
        return activeParty ? { day: activeParty.assignedDay, time: activeParty.assignedTime } : null;
    };

    const getSlotLabel = (slotId: string) => {
        const slot = [...WEEKDAY_SLOTS, ...WEEKEND_SLOTS].find(s => s.id === slotId);
        return slot ? slot.label : '';
    };

    // Helper: Get Date String (MM/DD) for a specific day of THIS week (Mon-Sun)
    const getFormatDate = (dayName: string) => {
        const dayIndex = DAYS.indexOf(dayName); // 0=Mon, 6=Sun
        if (dayIndex === -1) return '';

        const today = new Date();
        const currentDay = today.getDay(); // 0=Sun, 1=Mon...
        // Convert to 0=Mon, 6=Sun
        const currentDayIndex = currentDay === 0 ? 6 : currentDay - 1;

        // Calculate difference
        const diff = dayIndex - currentDayIndex;

        const targetDate = new Date(today);
        targetDate.setDate(today.getDate() + diff);

        return `(${targetDate.getMonth() + 1}/${targetDate.getDate()})`;
    };

    // --- Effects ---
    useEffect(() => {
        if (isTestMode) {
            // Generate Mock Data
            const mockMembers: Member[] = Array.from({ length: 50 }, (_, i) => {
                const classes = ['검성', '수호성', '살성', '궁성', '마도성', '정령성', '치유성', '호법성'];
                const days = ['월', '화', '수', '목', '금', '토', '일'];
                const mockAvailability: Record<string, string[]> = {};
                days.forEach(day => {
                    if (Math.random() > 0.3) { // 70% chance to have availability for a day
                        const slots = ['wd1', 'wd2', 'wd3', 'we1', 'we2', 'we3', 'we4', 'we5'].filter(() => Math.random() > 0.5);
                        if (slots.length > 0) mockAvailability[day] = slots;
                    }
                });

                return {
                    id: `mock-${i}`,
                    name: `테스트유저${i + 1}`,
                    class: classes[Math.floor(Math.random() * classes.length)],
                    power: Math.floor(Math.random() * (5000 - 1000) + 1000),
                    score: Math.floor(Math.random() * (1000 - 100) + 100), // Mock Score
                    rank: '군단병',
                    availability: mockAvailability
                };
            }).sort((a, b) => b.power - a.power);

            setAllMembers(mockMembers);
            setPool(mockMembers);
            setParties(prev => prev.map(p => ({ ...p, members: [] })));
            return;
        }

        // Fetch Members Data (for Score)
        const membersRef = ref(db, 'members');
        const unsubscribeMembers = onValue(membersRef, (snapshot) => {
            setDbMembers(snapshot.val() || {});
        });

        // Fetch Applications
        const appsRef = ref(db, 'raid_applications');
        const unsubscribeApps = onValue(appsRef, (snapshot) => {
            const data = snapshot.val();
            setRawApplications(data ? Object.values(data) : []);
        });

        return () => {
            unsubscribeMembers();
            unsubscribeApps();
        };
    }, [isTestMode]);

    // Effect to merge raw applications with member scores and update allMembers/pool
    useEffect(() => {
        if (isTestMode) return;

        if (rawApplications.length > 0) {
            const list: Member[] = rawApplications.map(app => {
                // Find matching member for Score (Robust Matching)
                const appNickname = app.nickname ? app.nickname.trim() : '';
                const matchedMember = Object.values(dbMembers).find((m: any) =>
                    (m.name && m.name.trim() === appNickname)
                ) as any;

                return {
                    id: app.id || String(Math.random()),
                    name: appNickname,
                    class: app.class,
                    power: parseInt(app.power) || 0,
                    score: matchedMember?.score ? parseInt(matchedMember.score) : undefined, // Get Score
                    rank: '신청자',
                    availability: app.availability
                };
            });
            list.sort((a, b) => b.power - a.power); // Sort by Power (Desc)
            setAllMembers(list);

            // Update pool, preserving members already in parties
            setPool(prevPool => {
                const partyMemberIds = new Set(parties.flatMap(p => p.members.map(m => m.id)));
                const newPoolMembers = list.filter(m => !partyMemberIds.has(m.id));
                return newPoolMembers;
            });
        } else {
            setAllMembers([]);
            setPool([]);
        }
    }, [rawApplications, dbMembers, isTestMode, parties]); // parties is a dependency to correctly update the pool

    // --- Handlers ---
    const handleAlgoDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (active.id !== over?.id) {
            setAlgoCards((items) => {
                const oldIndex = items.findIndex((i) => i.id === active.id);
                const newIndex = items.findIndex((i) => i.id === over?.id);
                return arrayMove(items, oldIndex, newIndex);
            });
        }
    };

    const toggleAlgo = (id: string) => {
        setAlgoCards(cards => cards.map(c => c.id === id ? { ...c, active: !c.active } : c));
    };

    const handleForceClick = (forceIndex: number) => {
        const info = getForceInfo(forceIndex);
        if (info && info.day && info.time) {
            setSelectedDay(info.day);
            setSelectedSlot(info.time);
        } else {
            alert('이 포스에는 아직 설정된 시간 정보가 없습니다.');
        }
    };

    const findContainer = (memberId: string) => {
        if (pool.find(m => m.id === memberId)) return 'pool';
        return parties.find(p => p.members.find(m => m.id === memberId))?.id;
    };

    const handleDragStart = (event: DragStartEvent) => {
        const { active } = event;
        const member = allMembers.find(m => m.id === active.id);
        if (member) setDraggedMember(member);
    };

    const executeMove = (activeId: string, overId: string, sourceContainer: string, targetContainer: string) => {
        let member: Member | undefined;
        let updatedParties = [...parties];
        // Remove from Source
        if (sourceContainer === 'pool') {
            member = pool.find(m => m.id === activeId);
            setPool(prev => prev.filter(m => m.id !== activeId));
        } else {
            // First, remove the member from the source party in our local 'updatedParties'
            updatedParties = updatedParties.map(p => {
                if (p.id === sourceContainer) {
                    member = p.members.find(m => m.id === activeId);
                    return { ...p, members: p.members.filter(m => m.id !== activeId) };
                }
                return p;
            });

            // Then, check if the Force belonging to this source party is now empty
            const srcPartyIdx = updatedParties.findIndex(p => p.id === sourceContainer);
            if (srcPartyIdx !== -1) {
                const forceIdx = Math.floor(srcPartyIdx / 2); // 0 or 1
                const forceParties = updatedParties.slice(forceIdx * 2, (forceIdx * 2) + 2);

                // If ALL parties in this force are empty
                const isForceEmpty = forceParties.every(p => p.members.length === 0);

                if (isForceEmpty) {
                    // Reset assignedDay and assignedTime for BOTH parties in the force
                    updatedParties = updatedParties.map((p, idx) => {
                        if (Math.floor(idx / 2) === forceIdx) {
                            return { ...p, assignedDay: undefined, assignedTime: undefined };
                        }
                        return p;
                    });
                }
            }
        }

        if (!member) return;

        // Add to Target
        if (targetContainer === 'pool') {
            setPool(prev => [...prev, member!].sort((a, b) => b.power - a.power));
            setParties(updatedParties);
        } else {
            setParties(prev => updatedParties.map(p => {
                if (p.id === targetContainer) {
                    if (p.members.length >= 4) {
                        alert("파티는 최대 4명까지만 가능합니다.");
                        setPool(prevPool => [...prevPool, member!].sort((a, b) => b.power - a.power));
                        return p;
                    }

                    // Set Assigned Time if not set (First member join)
                    // We set it for THIS party. The Force Logic will read from *any* party in the force.
                    // Also, we must use the CURRENT selectedDay/Slot because this is a new entry.
                    // Note: If selectedSlot is empty, we blocked it in handleDragEnd.
                    const updateData = (p.members.length === 0 && !p.assignedTime) ? { assignedDay: selectedDay, assignedTime: selectedSlot } : {};

                    return { ...p, members: [...p.members, member!], ...updateData };
                }
                return p;
            }));
        }
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        setDraggedMember(null);

        if (!over) return;

        const activeId = String(active.id);
        const overId = String(over.id);
        const sourceContainer = findContainer(activeId);
        const targetContainer = overId;

        if (!sourceContainer || !targetContainer || sourceContainer === targetContainer) return;

        // Block Drops if All Time (No specific slot selected)
        // ONLY if moving TO a party (from pool or another party)
        if (targetContainer !== 'pool' && !selectedSlot) {
            alert("파티 구성을 위해 먼저 구체적인 시간대를 선택해주세요.\n('전체 시간' 목록에서는 배치가 불가능합니다)");
            return;
        }

        // Validation Logic
        if (targetContainer !== 'pool' && sourceContainer === 'pool') {
            const member = pool.find(m => m.id === activeId);
            if (!member) return;

            // Determine Target Force Info
            const targetPartyIndex = parties.findIndex(p => p.id === targetContainer);
            const forceIndex = Math.floor(targetPartyIndex / 2);
            const forceInfo = getForceInfo(forceIndex);

            // If Force has a time set, check if member matches THE FORCE TIME
            if (forceInfo && forceInfo.time) {
                const forceTime = forceInfo.time;
                const forceDay = forceInfo.day;

                // Compare with Member's availability for the FORCE'S Day
                const memberAvail = member.availability && member.availability[forceDay!];

                if (!memberAvail || !memberAvail.includes(forceTime)) {
                    // Mismatch! Show Confirmation
                    setConfirmationModal({
                        isOpen: true,
                        message: `이 포스는 [${forceDay}요일 ${getSlotLabel(forceTime)}] 시간대로 진행 중입니다.\n\n[${member.name}] 님은 해당 시간대에 신청하지 않았습니다.\n계속 추가하시겠습니까?`,
                        onConfirm: () => {
                            executeMove(activeId, overId, sourceContainer, targetContainer);
                            setConfirmationModal(prev => ({ ...prev, isOpen: false }));
                        },
                        onCancel: () => {
                            setConfirmationModal(prev => ({ ...prev, isOpen: false }));
                        }
                    });
                    return;
                }
            }
        }

        executeMove(activeId, overId, sourceContainer, targetContainer);
    };

    const resetAll = () => {
        setParties(parties.map(p => ({ ...p, members: [] })));
        setPool(allMembers);
    };

    const filteredPool = pool.filter(m => {
        // Time Slot Filter
        let matchesTime = true;
        if (selectedDay && selectedDay !== 'ALL') { // Only filter by day if a specific day is selected
            const memberAvail = m.availability;
            if (!memberAvail || !memberAvail[selectedDay]) {
                matchesTime = false; // No availability for this day
            } else if (selectedSlot) {
                matchesTime = memberAvail[selectedDay].includes(selectedSlot);
            }
        }

        return matchesTime;
    });

    // Helper to get Count for slots
    const getSlotCount = (day: string, slotId: string) => {
        return pool.filter(m => {
            const avail = m.availability;
            return avail && avail[day] && avail[day].includes(slotId);
        }).length;
    };

    // --- Render ---
    return (
        <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd} collisionDetection={closestCenter}>
            <div className="relative flex h-[calc(100vh-140px)] gap-6 animate-in fade-in duration-500">

                {/* 1. Left: Queue Dashboard */}
                <div className="w-1/3 min-w-[360px] flex flex-col bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden z-10 transition-all">

                    {/* Header: Title & Settings */}
                    <div className="p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/80 backdrop-blur-md flex justify-between items-center">
                        <h3 className="text-xl font-black text-slate-800 dark:text-white flex items-center gap-2">
                            <Users className="text-indigo-500" /> 대기열 <span className="text-indigo-500 opacity-50 text-base">({filteredPool.length})</span>
                        </h3>
                        <div className="flex gap-2">
                            <button onClick={() => setIsOptionsOpen(true)} className="p-2 bg-white dark:bg-slate-700 rounded-xl border border-slate-200 dark:border-slate-600 text-slate-400 hover:text-indigo-500 hover:border-indigo-300 transition-all shadow-sm">
                                <Settings2 size={20} />
                            </button>
                        </div>
                    </div>

                    {/* Dashboard: Day & Time Selectors */}
                    <div className="p-4 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 space-y-4">

                        {/* 1. Day Tabs */}
                        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar snap-x">
                            {DAYS.map(day => {
                                const isSelected = selectedDay === day;
                                const isWeekend = ['토', '일'].includes(day);
                                return (
                                    <button
                                        key={day}
                                        onClick={() => { setSelectedDay(day); setSelectedSlot(''); }}
                                        className={cn(
                                            "flex-1 min-w-[48px] py-2.5 rounded-xl text-sm font-black transition-all snap-start border-2",
                                            isSelected
                                                ? (isWeekend ? "bg-rose-500 border-rose-600 text-white shadow-lg shadow-rose-200 dark:shadow-none" : "bg-indigo-500 border-indigo-600 text-white shadow-lg shadow-indigo-200 dark:shadow-none")
                                                : "bg-slate-50 dark:bg-slate-800 border-transparent text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
                                        )}
                                    >
                                        {day}
                                    </button>
                                );
                            })}
                        </div>

                        {/* 2. Slot Grid */}
                        <div className="grid grid-cols-2 gap-2">
                            {[
                                { id: '', label: '전체 시간', count: pool.filter(m => m.availability?.[selectedDay]).length },
                                ...(['토', '일'].includes(selectedDay) ? WEEKEND_SLOTS : WEEKDAY_SLOTS).map(slot => ({
                                    ...slot,
                                    count: getSlotCount(selectedDay, slot.id)
                                }))
                            ].map(slot => {
                                const isSelected = selectedSlot === slot.id;
                                return (
                                    <button
                                        key={slot.id}
                                        onClick={() => setSelectedSlot(slot.id === selectedSlot ? '' : slot.id)}
                                        className={cn(
                                            "py-3 px-3 rounded-xl border-2 text-left transition-all relative group overflow-hidden",
                                            isSelected
                                                ? "bg-indigo-50 border-indigo-500 text-indigo-700 dark:bg-indigo-900/30 dark:border-indigo-400 dark:text-indigo-300"
                                                : slot.count > 0
                                                    ? "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-indigo-200"
                                                    : "bg-slate-50 dark:bg-slate-800/50 border-slate-50 dark:border-slate-800 text-slate-300 dark:text-slate-600 opacity-60"
                                        )}
                                    >
                                        <div className="flex justify-between items-center relative z-10">
                                            <span className="text-xs font-bold">{slot.label}</span>
                                            {slot.count > 0 && (
                                                <span className={cn(
                                                    "text-[10px] font-black px-1.5 py-0.5 rounded-md",
                                                    isSelected ? "bg-indigo-500 text-white" : "bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300"
                                                )}>
                                                    {slot.count}명
                                                </span>
                                            )}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* List */}
                    <PoolContainer id="pool" members={filteredPool} />
                </div>

                {/* 2. Right: Party Canvas */}
                {/* 2. Right: Party Canvas */}
                <div className="flex-1 flex flex-col min-w-0">
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-1">
                        <div className="space-y-8 pb-20">
                            {/* Force 1: Party 1 & 2 */}
                            <div className="bg-slate-50/50 dark:bg-slate-800/20 p-5 rounded-[2.5rem] border border-slate-200 dark:border-slate-800/50">
                                <h3
                                    onClick={() => handleForceClick(0)}
                                    className="text-xl font-black text-slate-400 dark:text-slate-500 mb-4 px-2 flex items-center gap-2 cursor-pointer hover:text-indigo-500 transition-colors group select-none"
                                >
                                    <span className="w-1.5 h-6 bg-slate-300 dark:bg-slate-600 rounded-full group-hover:bg-indigo-500 transition-colors"></span>
                                    1 포스
                                    {(() => {
                                        const info = getForceInfo(0);
                                        if (info && info.time) {
                                            return (
                                                <span className="ml-2 text-sm text-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 rounded-full border border-indigo-100 dark:border-indigo-800 flex items-center gap-1">
                                                    <span className="text-[10px] font-bold opacity-70">
                                                        {info.day}{getFormatDate(info.day!)}
                                                    </span>
                                                    {getSlotLabel(info.time)}
                                                </span>
                                            );
                                        }
                                        return null;
                                    })()}
                                </h3>
                                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                                    {parties.slice(0, 2).map((party) => (
                                        <PartySlot key={party.id} party={party} />
                                    ))}
                                </div>
                            </div>

                            {/* Force 2: Party 3 & 4 */}
                            <div className="bg-slate-50/50 dark:bg-slate-800/20 p-5 rounded-[2.5rem] border border-slate-200 dark:border-slate-800/50">
                                <h3
                                    onClick={() => handleForceClick(1)}
                                    className="text-xl font-black text-slate-400 dark:text-slate-500 mb-4 px-2 flex items-center gap-2 cursor-pointer hover:text-indigo-500 transition-colors group select-none"
                                >
                                    <span className="w-1.5 h-6 bg-slate-300 dark:bg-slate-600 rounded-full group-hover:bg-indigo-500 transition-colors"></span>
                                    2 포스
                                    {(() => {
                                        const info = getForceInfo(1);
                                        if (info && info.time) {
                                            return (
                                                <span className="ml-2 text-sm text-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 rounded-full border border-indigo-100 dark:border-indigo-800 flex items-center gap-1">
                                                    <span className="text-[10px] font-bold opacity-70">
                                                        {info.day}{getFormatDate(info.day!)}
                                                    </span>
                                                    {getSlotLabel(info.time)}
                                                </span>
                                            );
                                        }
                                        return null;
                                    })()}
                                </h3>
                                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                                    {parties.slice(2, 4).map((party) => (
                                        <PartySlot key={party.id} party={party} />
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 3. Floating Actions */}
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-white dark:bg-slate-800 p-2 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 flex gap-2 z-20">
                    <button onClick={resetAll} className="px-6 py-3 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 font-bold hover:bg-red-50 hover:text-red-500 transition-colors flex items-center gap-2">
                        <Trash2 size={18} /> 초기화
                    </button>
                    <div className="w-px bg-slate-200 dark:bg-slate-600 mx-1 my-1"></div>
                    <button onClick={() => alert("복사되었습니다!")} className="px-6 py-3 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-500 shadow-lg shadow-indigo-200 dark:shadow-none transition-all flex items-center gap-2 active:scale-95">
                        <Copy size={18} /> 파티 확정 & 복사
                    </button>
                </div>

                {/* 4. Drawer: Options */}
                <div className={cn(
                    "fixed inset-y-0 right-0 w-96 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl transform transition-transform duration-300 ease-in-out z-50 flex flex-col",
                    isOptionsOpen ? "translate-x-0" : "translate-x-full"
                )}>
                    <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
                        <h2 className="text-xl font-black text-slate-800 dark:text-white flex items-center gap-2">
                            <Settings2 className="text-indigo-500" /> 파티 알고리즘
                        </h2>
                        <button onClick={() => setIsOptionsOpen(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
                            <X size={20} className="text-slate-400" />
                        </button>
                    </div>

                    {/* Drawer Content: Algorithm Builder */}
                    <div className="flex-1 p-6 overflow-y-auto custom-scrollbar">
                        <div className="p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl border border-indigo-100 dark:border-indigo-900/50 mb-6">
                            <p className="text-xs text-indigo-700 dark:text-indigo-300 font-bold leading-relaxed">
                                카드를 드래그하여 우선순위를 변경하세요. 체크박스로 사용 여부를 결정합니다.
                            </p>
                        </div>

                        <DndContext collisionDetection={closestCenter} onDragEnd={handleAlgoDragEnd}>
                            <SortableContext items={algoCards} strategy={verticalListSortingStrategy}>
                                <div className="space-y-3">
                                    {algoCards.map(card => (
                                        <SortableAlgoCard key={card.id} card={card} onToggle={() => toggleAlgo(card.id)} />
                                    ))}
                                </div>
                            </SortableContext>
                        </DndContext>
                    </div>

                    <div className="p-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
                        <button onClick={() => setIsOptionsOpen(false)} className="w-full py-4 bg-slate-800 dark:bg-white text-white dark:text-slate-900 rounded-xl font-black shadow-lg hover:opacity-90 transition-opacity">
                            설정 저장
                        </button>
                    </div>
                </div>

                {isOptionsOpen && (
                    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40" onClick={() => setIsOptionsOpen(false)} />
                )}
            </div>

            <DragOverlay>
                {draggedMember ? <MemberCard member={draggedMember} isOverlay /> : null}
            </DragOverlay>

            {/* Validation Modal */}
            {confirmationModal.isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-sm w-full p-6 border border-slate-200 dark:border-slate-800 scale-100 animate-in zoom-in-95 duration-200">
                        <div className="flex flex-col items-center text-center gap-4">
                            <div className="w-12 h-12 bg-rose-100 dark:bg-rose-900/30 rounded-full flex items-center justify-center text-rose-600 dark:text-rose-400">
                                <Clock size={24} />
                            </div>
                            <h3 className="text-lg font-bold text-rose-600 dark:text-rose-400">
                                신청 시간 불일치
                            </h3>
                            <p className="text-sm text-slate-500 dark:text-slate-400 whitespace-pre-wrap leading-relaxed">
                                {confirmationModal.message}
                            </p>
                            <div className="flex gap-2 w-full mt-2">
                                <button
                                    onClick={confirmationModal.onCancel}
                                    className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded-xl font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition"
                                >
                                    취소
                                </button>
                                <button
                                    onClick={confirmationModal.onConfirm}
                                    className="flex-1 py-3 bg-rose-500 text-white rounded-xl font-bold hover:bg-rose-600 shadow-lg shadow-rose-200 dark:shadow-none transition"
                                >
                                    진행 (무시)
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </DndContext>
    );
}

// --- Sub Components ---

function SortableAlgoCard({ card, onToggle }: { card: AlgoCard, onToggle: () => void }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 50 : 'auto',
        position: 'relative' as const,
    };

    return (
        <div ref={setNodeRef} style={style} className={cn(
            "p-3 bg-white dark:bg-slate-800 border rounded-xl shadow-sm transition-all flex items-start gap-3 select-none group touch-none",
            card.active ? "border-indigo-200 dark:border-slate-600" : "border-slate-100 dark:border-slate-800 opacity-60 grayscale",
            isDragging && "shadow-xl ring-2 ring-indigo-500/20 rotate-1 opacity-100 z-50 bg-white"
        )}>
            <div {...attributes} {...listeners} className="mt-1 text-slate-300 hover:text-indigo-500 cursor-grab active:cursor-grabbing p-1 -ml-1">
                <GripVertical size={16} />
            </div>
            <div className="flex-1 pt-0.5">
                <div className="flex justify-between items-start mb-1">
                    <span className="font-bold text-slate-700 dark:text-slate-200 text-sm">{card.label}</span>
                    <input type="checkbox" checked={card.active} onChange={onToggle} className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-gray-300 cursor-pointer" />
                </div>
                <p className="text-[11px] text-slate-400 font-medium leading-tight">{card.desc}</p>
            </div>
        </div>
    );
}

function PoolContainer({ id, members }: { id: string, members: Member[] }) {
    const { setNodeRef } = useDroppable({ id });
    return (
        <div ref={setNodeRef} className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
            {members.map(m => (
                <DraggableMember key={m.id} member={m} />
            ))}
            {members.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-2">
                    <Users size={32} className="opacity-20" />
                    <span className="text-xs font-bold">대기 인원 없음</span>
                </div>
            )}
        </div>
    );
}

function PartySlot({ party }: { party: Party }) {
    const { setNodeRef } = useDroppable({ id: party.id });
    const avgPower = party.members.length > 0 ? Math.round(party.members.reduce((a, b) => a + b.power, 0) / party.members.length) : 0;
    const hasTank = party.members.some(m => ['수호성', '검성'].includes(m.class));
    const hasCleric = party.members.some(m => m.class === '치유성');

    return (
        <div ref={setNodeRef} className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm rounded-[2rem] border border-slate-200 dark:border-slate-700 shadow-xl overflow-hidden flex flex-col h-[380px] transition-all hover:shadow-2xl hover:border-indigo-300 dark:hover:border-indigo-700 group">
            <div className="p-5 border-b border-slate-100 dark:border-slate-700 flex justify-between items-start bg-slate-50/50 dark:bg-slate-800/50">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <span className="w-2 h-6 bg-indigo-500 rounded-full"></span>
                        <h3 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight">{party.name}</h3>
                    </div>
                    <div className="flex items-center gap-3 text-xs font-bold text-slate-400 pl-4">
                        <span className="flex items-center gap-1"><Zap size={10} /> {avgPower.toLocaleString()}</span>
                        <span className="flex items-center gap-1"><Users size={10} /> {party.members.length}/4</span>
                    </div>
                </div>
                <div className="flex gap-1.5">
                    <div className={cn("w-8 h-8 rounded-full flex items-center justify-center border transition-all", hasTank ? "bg-blue-100 border-blue-200 text-blue-600" : "bg-slate-100 border-slate-200 text-slate-300 grayscale opacity-50")}>
                        <Shield size={14} strokeWidth={2.5} />
                    </div>
                    <div className={cn("w-8 h-8 rounded-full flex items-center justify-center border transition-all", hasCleric ? "bg-emerald-100 border-emerald-200 text-emerald-600" : "bg-slate-100 border-slate-200 text-slate-300 grayscale opacity-50")}>
                        <Plus size={18} strokeWidth={3} />
                    </div>
                </div>
            </div>
            <div className="flex-1 p-3 space-y-2 bg-slate-50/30 dark:bg-slate-900/30 relative">
                {party.members.map(m => (
                    <DraggableMember key={m.id} member={m} />
                ))}
                {party.members.length < 4 && (
                    <div className="absolute inset-x-3 bottom-3 h-12 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl flex items-center justify-center text-slate-300 text-xs font-bold pointer-events-none group-hover:border-indigo-300 dark:group-hover:border-indigo-700 transition-colors">
                        빈 슬롯 (드래그하여 추가)
                    </div>
                )}
            </div>
        </div>
    );
}

function DraggableMember({ member }: { member: Member }) {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: member.id,
    });
    const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;

    if (isDragging) {
        return <div ref={setNodeRef} style={style} className="opacity-0"><MemberCard member={member} /></div>;
    }
    return (
        <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
            <MemberCard member={member} />
        </div>
    );
}

function MemberCard({ member, isOverlay }: { member: Member, isOverlay?: boolean }) {
    const classColor = getClassColor(member.class);
    return (
        <div className={cn(
            "relative bg-white dark:bg-slate-800 rounded-xl p-3 shadow-sm border border-slate-100 dark:border-slate-700 flex items-center justify-between cursor-grab active:cursor-grabbing hover:shadow-md hover:-translate-y-0.5 transition-all select-none group",
            isOverlay && "shadow-2xl scale-105 rotate-2 border-indigo-500 ring-4 ring-indigo-500/10 z-50 cursor-grabbing"
        )}>
            <div className="flex items-center gap-3">
                <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center font-black text-xs shadow-sm shrink-0 transition-transform group-hover:scale-110", classColor)}>
                    {member.class.charAt(0)}
                </div>
                <div className="flex flex-col">
                    <span className="font-bold text-slate-700 dark:text-slate-200 text-sm leading-none mb-0.5">{member.name}</span>
                    <span className="text-[10px] text-slate-400 font-medium">{member.class}</span>
                </div>
            </div>
            <div className="flex items-center gap-3">
                <div className="text-right flex flex-col items-end">
                    <span className="font-black text-slate-800 dark:text-slate-100 text-sm block">{member.power.toLocaleString()}</span>
                    <span className="text-[9px] text-slate-400 block -mt-0.5">전투력</span>
                </div>
                {member.score != null && (
                    <div className="text-right flex flex-col items-end min-w-[40px]">
                        <span className="font-black text-indigo-500 text-sm block">{member.score.toLocaleString()}</span>
                        <span className="text-[9px] text-indigo-300 block -mt-0.5">점수</span>
                    </div>
                )}
            </div>
        </div>
    );
}
