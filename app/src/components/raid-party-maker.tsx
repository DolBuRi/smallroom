'use client';

import React, { useState, useEffect } from 'react';
import { DndContext, DragOverlay, useDraggable, useDroppable, DragStartEvent, DragEndEvent, closestCenter } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Users, GripVertical, Shuffle, Zap, Trash2, Copy, Check, Sword, Shield, Crosshair, Sparkles, Settings2, Settings, X, ChevronRight, Clock, Calendar, Plus, Lock, AlertTriangle, RotateCcw } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/lib/firebase';
import { ref, onValue, set, get, child } from 'firebase/database';
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


interface AutoMatchOptions {
    targetScope: 'FILL' | 'RESHUFFLE';
    timeScope: 'CURRENT' | 'SELECTED' | 'ALL';
    priority: 'BALANCED'; // Added priority
}

interface FixedGroup {
    id: string;
    name: string;
    color: string; // Tailwind class or hex
    memberIds: string[];
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
    { id: 'wd1', label: '오후 6:30', fullLabel: '18:30 ~ 20:30', sortKey: 1830 },
    { id: 'wd2', label: '오후 8:30', fullLabel: '20:30 ~ 22:30', sortKey: 2030 },
    { id: 'wd3', label: '오후 10:30', fullLabel: '22:30 ~ 00:30', sortKey: 2230 },
];
const WEEKEND_SLOTS = [
    { id: 'we1', label: '오후 2:00', fullLabel: '14:00 ~ 16:00', sortKey: 1400 },
    { id: 'we2', label: '오후 4:00', fullLabel: '16:00 ~ 18:00', sortKey: 1600 },
    { id: 'we3', label: '오후 6:30', fullLabel: '18:30 ~ 20:30', sortKey: 1830 },
    { id: 'we4', label: '오후 8:30', fullLabel: '20:30 ~ 22:30', sortKey: 2030 },
    { id: 'we5', label: '오후 10:30', fullLabel: '22:30 ~ 00:30', sortKey: 2230 },
];

// User requested order: Wed start
const RAID_DAYS = ['수', '목', '금', '토', '일', '월', '화'];
const DAYS = ['월', '화', '수', '목', '금', '토', '일']; // Keep for legacy compatibility if needed, but UI uses RAID_DAYS

const CLASS_ICONS: Record<string, React.ReactNode> = {
    '검성': <Sword size={14} className="text-sky-500" />,
    '수호성': <Shield size={14} className="text-indigo-500" />,
    '살성': <Sword size={14} className="text-lime-500" />,
    '궁성': <Crosshair size={14} className="text-emerald-500" />,
    '마도성': <Sparkles size={14} className="text-purple-500" />,
    '정령성': <Sparkles size={14} className="text-violet-400" />,
    '치유성': <Check size={14} className="text-rose-500" />,
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

// --- Main Component Stub ---
export default function RaidPartyMaker({ testMode = false }: { testMode?: boolean }) {
    const { loading } = useAuth();

    // Data State
    const [allMembers, setAllMembers] = useState<Member[]>([]);
    const [dbMembers, setDbMembers] = useState<Record<string, any>>({});
    const [pool, setPool] = useState<Member[]>([]);
    const [parties, setParties] = useState<Party[]>([]);

    // UI State
    const [draggedMember, setDraggedMember] = useState<Member | null>(null);
    const [isOptionsOpen, setIsOptionsOpen] = useState(false);
    const [isAutoMatchModalOpen, setIsAutoMatchModalOpen] = useState(false);
    const [isAlgoSettingsModalOpen, setIsAlgoSettingsModalOpen] = useState(false);
    const [isFixedGroupModalOpen, setIsFixedGroupModalOpen] = useState(false);
    const [confirmationModal, setConfirmationModal] = useState<{ isOpen: boolean; message: string; onConfirm: () => void; onCancel: () => void }>({ isOpen: false, message: '', onConfirm: () => { }, onCancel: () => { } });

    // Filters & Options
    const [selectedDay, setSelectedDay] = useState<string>('ALL'); // Default to ALL
    const [selectedSlot, setSelectedSlot] = useState<string | undefined>(undefined);
    const [matchOptions, setMatchOptions] = useState<AutoMatchOptions>({
        targetScope: 'FILL',
        timeScope: 'CURRENT',
        priority: 'BALANCED'
    });

    // Fixed Groups - now loaded from DB
    const [selectedFixedGroupId, setSelectedFixedGroupId] = useState<string | null>(null);
    const [fixedGroups, setFixedGroups] = useState<FixedGroup[]>([]);
    const [isFixedGroupsLoaded, setIsFixedGroupsLoaded] = useState(false);
    const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);

    // --- Filters ---
    const [searchTerm, setSearchTerm] = useState('');
    const [filterClass, setFilterClass] = useState('ALL');
    const [algoCards, setAlgoCards] = useState<AlgoCard[]>([
        { id: 'fixed_group', label: '고정 파티 우선', desc: '고정 파티원을 같은 파티에 우선 배정합니다.', active: true },
        { id: 'tank_healer', label: '탱/힐 필수 배치', desc: '각 파티에 수호/검성과 치유/호법을 1명씩 보장합니다.', active: true },
        { id: 'ace_first', label: '에이스 우선 배정', desc: '전투력이 높은 인원을 먼저 각 파티에 분배합니다.', active: true },
        { id: 'power_balance', label: '전투력 균등 분배', desc: '파티 간 평균 전투력 차이를 줄입니다.', active: true },
        { id: 'class_balance', label: '클래스 조합 고려', desc: '파티 내 클래스 중복을 최소화합니다.', active: false },
    ]);


    // --- Effects ---
    // Close color picker when group changes
    useEffect(() => {
        setIsColorPickerOpen(false);
    }, [selectedFixedGroupId]);

    // Reset color picker when modal opens/closes
    useEffect(() => {
        setIsColorPickerOpen(false);
    }, [isFixedGroupModalOpen]);

    // 1. Load Members (One-time or Mock)
    useEffect(() => {
        if (testMode) {
            // Mock Data Generation
            const classes = ['수호성', '검성', '살성', '궁성', '마도성', '정령성', '치유성', '호법성'];
            const mockMembers: Member[] = Array.from({ length: 150 }, (_, i) => {
                // Randomize Availability
                const availability: Record<string, string[]> = {};
                const days = ['수', '목', '금', '토', '일', '월', '화'];
                const slotsWeekday = ['wd1', 'wd2'];
                const slotsWeekend = ['we1', 'we2', 'we3'];

                // Assign random slots (3~7 slots per user)
                const numSlots = Math.floor(Math.random() * 5) + 3;
                for (let j = 0; j < numSlots; j++) {
                    const day = days[Math.floor(Math.random() * days.length)];
                    const isWeekend = ['토', '일'].includes(day);
                    const slotPool = isWeekend ? slotsWeekend : slotsWeekday;
                    const slot = slotPool[Math.floor(Math.random() * slotPool.length)];

                    if (!availability[day]) availability[day] = [];
                    if (!availability[day].includes(slot)) availability[day].push(slot);
                }

                return {
                    id: `mock-${i}`,
                    name: `테스트${i + 1}`,
                    class: classes[Math.floor(Math.random() * classes.length)],
                    power: Math.floor(Math.random() * 3000) + 1000,
                    rank: '정예',
                    availability,
                    fixedGroupId: i < 5 ? 'fg-1' : (i < 10 ? 'fg-2' : undefined) // Scatter fixed members
                };
            });
            setAllMembers(mockMembers);
            setPool(mockMembers);

            // Init Parties
            setParties(Array.from({ length: 8 }, (_, i) => ({
                id: `party-${i + 1}`, name: `${i + 1}파티`, members: []
            })));
            return;
        }

        const loadMembers = async () => {
            // Mock Load for now or real logic
            // Ideally fetching from DB
            const membersRef = ref(db, 'members');
            onValue(membersRef, (snapshot) => {
                const data = snapshot.val();
                if (data) {
                    setDbMembers(data);
                    const list: Member[] = Object.values(data).map((m: any) => ({
                        id: m.id, name: m.name, class: m.class || '검성',
                        power: m.power || 0, rank: m.rank || '',
                        availability: m.availability,
                        fixedGroupId: m.fixedGroupId
                    }));
                    setAllMembers(list);
                    setPool(list);

                    // Init Parties
                    setParties(Array.from({ length: 8 }, (_, i) => ({
                        id: `party-${i + 1}`, name: `${i + 1}파티`, members: []
                    })));
                }
            }, { onlyOnce: true });
        };
        loadMembers();
    }, [testMode]);

    // 2. Load Fixed Groups (One-time or Mock)
    useEffect(() => {
        if (testMode) {
            setFixedGroups([
                { id: 'fg-1', name: '테스트 1팀', color: 'bg-rose-500', memberIds: ['mock-0', 'mock-1', 'mock-2'] },
                { id: 'fg-2', name: '테스트 2팀', color: 'bg-indigo-500', memberIds: [] }
            ]);
            setIsFixedGroupsLoaded(true);
            return;
        }

        const loadFixedGroups = async () => {
            try {
                const snapshot = await get(ref(db, 'raid_fixed_groups'));
                if (snapshot.exists()) {
                    const data = snapshot.val() as FixedGroup[];
                    // Sanitize: Firebase removes empty arrays, so ensure memberIds exists
                    const sanitized = data.map(g => ({
                        ...g,
                        memberIds: g.memberIds || []
                    }));
                    setFixedGroups(sanitized);
                } else {
                    // Default Init if empty
                    const defaults = [
                        { id: 'fg-1', name: '1팀', color: 'bg-rose-500', memberIds: [] },
                        { id: 'fg-2', name: '2팀', color: 'bg-indigo-500', memberIds: [] }
                    ];
                    setFixedGroups(defaults);
                    set(ref(db, 'raid_fixed_groups'), defaults); // Create initial
                }
            } catch (e) {
                console.error("Failed to load fixed groups", e);
                // Fallback local defaults
                setFixedGroups([
                    { id: 'fg-1', name: '1팀', color: 'bg-rose-500', memberIds: [] },
                    { id: 'fg-2', name: '2팀', color: 'bg-indigo-500', memberIds: [] }
                ]);
            } finally {
                setIsFixedGroupsLoaded(true);
            }
        };
        loadFixedGroups();
    }, [testMode]);

    // 3. Auto-Save Fixed Groups
    useEffect(() => {
        if (!isFixedGroupsLoaded) return;
        if (testMode) return; // Disable Save in Test Mode
        set(ref(db, 'raid_fixed_groups'), fixedGroups);
    }, [fixedGroups, isFixedGroupsLoaded, testMode]);


    // --- Sync Fixed Groups to Members ---
    useEffect(() => {
        if (allMembers.length === 0) return;

        // Create a map of memberId -> fixedGroupId
        const fixedMap = new Map<string, string>();
        fixedGroups.forEach(fg => {
            (fg.memberIds || []).forEach(mid => fixedMap.set(mid, fg.id));
        });

        // Update function helper
        const updateMember = (m: Member): Member => {
            const newFixedId = fixedMap.get(m.id);
            if (m.fixedGroupId !== newFixedId) {
                return { ...m, fixedGroupId: newFixedId };
            }
            return m;
        };

        // Sync to allMembers
        setAllMembers(prev => prev.map(updateMember));

        // Sync to Pool
        setPool(prev => prev.map(updateMember));

        // Sync to Parties (if members are already assigned there)
        setParties(prev => prev.map(p => ({
            ...p,
            members: p.members.map(updateMember)
        })));

    }, [fixedGroups]); // Trigger when fixedGroups changes

    // --- Helper Functions ---
    const getSlotLabel = (id: string) => {
        const slot = [...WEEKDAY_SLOTS, ...WEEKEND_SLOTS].find(s => s.id === id);
        return slot ? slot.label : id;
    };

    const findContainer = (id: string): string | undefined => {
        if (pool.find(m => m.id === id)) return 'pool';
        const party = parties.find(p => p.members.find(m => m.id === id));
        return party ? party.id : undefined;
    };

    const executeMove = (memberId: string, targetContainerId: string) => {
        const member = allMembers.find(m => m.id === memberId);
        if (!member) return;

        let newPool = [...pool];
        let newParties = parties.map(p => ({ ...p, members: [...p.members] }));

        // Remove from Source
        const sourceContainer = findContainer(memberId);
        if (sourceContainer === 'pool') {
            newPool = newPool.filter(m => m.id !== memberId);
        } else if (sourceContainer) {
            const p = newParties.find(p => p.id === sourceContainer);
            if (p) {
                p.members = p.members.filter(m => m.id !== memberId);
            }
        }

        // Add to Target
        if (targetContainerId === 'pool') {
            newPool.push(member);
            newPool.sort((a, b) => b.power - a.power);
        } else {
            const p = newParties.find(p => p.id === targetContainerId);
            if (p) {
                if (p.members.length >= 4) {
                    alert("파티는 최대 4명까지만 가능합니다.");
                    // Return to source essentially (or just fail move)
                    if (sourceContainer === 'pool') newPool.push(member); // Put back
                    return;
                }
                p.members.push(member);

                // Auto-set time if first member
                if (p.members.length === 1 && !p.assignedTime && selectedSlot) {
                    p.assignedDay = selectedDay === 'ALL' ? '수' : selectedDay; // Default to Wed if All selected
                    p.assignedTime = selectedSlot;
                }
            }
        }

        setPool(newPool);
        setParties(newParties);
    };

    // --- Algo Handlers ---
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

    // --- Handlers ---
    const handleDragStart = (event: DragStartEvent) => {
        const member = allMembers.find(m => m.id === event.active.id);
        if (member) setDraggedMember(member);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        setDraggedMember(null);
        if (!over) return;

        const memberId = active.id as string;
        let targetId = over.id as string;

        // If dropped on member, find container
        const overMember = allMembers.find(m => m.id === targetId);
        if (overMember) {
            targetId = findContainer(targetId) || 'pool';
        }

        const sourceId = findContainer(memberId);
        if (sourceId === targetId) return;

        // Validation: Time Conflict
        if (targetId !== 'pool') {
            const targetParty = parties.find(p => p.id === targetId);
            if (targetParty && targetParty.assignedDay && targetParty.assignedTime) {
                const member = allMembers.find(m => m.id === memberId);
                if (member && (!member.availability?.[targetParty.assignedDay]?.includes(targetParty.assignedTime))) {
                    setConfirmationModal({
                        isOpen: true,
                        message: `${member.name}님은 해당 시간(${targetParty.assignedDay} ${getSlotLabel(targetParty.assignedTime)})에 신청하지 않았습니다.\n강제 배정하시겠습니까?`,
                        onConfirm: () => {
                            executeMove(memberId, targetId);
                            setConfirmationModal(prev => ({ ...prev, isOpen: false }));
                        },
                        onCancel: () => setConfirmationModal(prev => ({ ...prev, isOpen: false }))
                    });
                    return;
                }
            }
        }

        executeMove(memberId, targetId);
    };

    const handleAutoMatch = () => {
        setIsAutoMatchModalOpen(false);
        const { targetScope, timeScope } = matchOptions;

        let workingParties = [...parties];
        let workingPool = [...pool];

        // 1. Handle Target Scope
        if (targetScope === 'RESHUFFLE') {
            workingParties.forEach(p => {
                if (p.members.length > 0) {
                    workingPool.push(...p.members);
                    p.members = [];
                }
                p.assignedDay = undefined;
                p.assignedTime = undefined;
            });
        }

        // --- Auto-Scaling ---
        const totalHeadcount = workingPool.length + workingParties.reduce((sum, p) => sum + p.members.length, 0);
        const neededPartiesCount = Math.max(4, Math.ceil(totalHeadcount / 4));
        const neededForces = Math.ceil(neededPartiesCount / 2);
        const targetPartyCount = Math.max(4, neededForces * 2);

        if (workingParties.length < targetPartyCount) {
            const currentCount = workingParties.length;
            for (let i = currentCount; i < targetPartyCount; i++) {
                workingParties.push({
                    id: `party-${i + 1}`,
                    name: `${i + 1}파티`,
                    members: []
                });
            }
        }

        workingPool = Array.from(new Map(workingPool.map(m => [m.id, m])).values());
        workingPool.sort((a, b) => b.power - a.power);

        // 2. Identify Forces & Match
        const numForces = Math.ceil(workingParties.length / 2);
        const forces = Array.from({ length: numForces }, (_, i) => i);

        forces.forEach(forceIdx => {
            const p1 = workingParties[forceIdx * 2];
            const p2 = workingParties[forceIdx * 2 + 1];
            if (!p2) return; // Should not happen due to ceiling

            let forceDay = p1.assignedDay;
            let forceTime = p1.assignedTime;

            if (!forceDay || !forceTime) {
                if (timeScope === 'CURRENT') {
                    if (selectedSlot) {
                        forceDay = selectedDay === 'ALL' ? '수' : selectedDay; // Default to Wed if ALL
                        forceTime = selectedSlot;
                    }
                } else {
                    // Smart Pick
                    let candidateSlots: { day: string, slot: string, score: number }[] = [];
                    // Scan only Selected Day or All Days (using RAID_DAYS order)
                    const daysToScan = timeScope === 'SELECTED' && selectedDay !== 'ALL' ? [selectedDay] : RAID_DAYS;
                    const allSlots = [...WEEKDAY_SLOTS, ...WEEKEND_SLOTS];

                    daysToScan.forEach(d => {
                        allSlots.forEach(s => {
                            const count = workingPool.filter(m => m.availability?.[d]?.includes(s.id)).length;
                            if (count >= 4) {
                                candidateSlots.push({ day: d, slot: s.id, score: count });
                            }
                        });
                    });

                    candidateSlots.sort((a, b) => b.score - a.score);
                    if (candidateSlots.length > 0) {
                        forceDay = candidateSlots[0].day;
                        forceTime = candidateSlots[0].slot;
                    }
                }
            }

            if (!forceDay || !forceTime) return;

            p1.assignedDay = forceDay;
            p1.assignedTime = forceTime;
            p2.assignedDay = forceDay;
            p2.assignedTime = forceTime;

            // 3. Filter Candidates
            let candidates = workingPool.filter(m => m.availability?.[forceDay!]?.includes(forceTime!));

            // [A] Fixed Group Priority
            const groupsInCandidates = new Set(candidates.filter(m => m.fixedGroupId).map(m => m.fixedGroupId));
            groupsInCandidates.forEach(gid => {
                const groupMembers = candidates.filter(m => m.fixedGroupId === gid);
                if (groupMembers.length === 0) return;
                const targetParty = [p1, p2].find(p => p.members.length + groupMembers.length <= 4);
                if (targetParty) {
                    targetParty.members.push(...groupMembers);
                    const ids = groupMembers.map(m => m.id);
                    candidates = candidates.filter(m => !ids.includes(m.id));
                    workingPool = workingPool.filter(m => !ids.includes(m.id));
                }
            });

            // [B] Tank/Healer
            const useTankHealer = algoCards.find(c => c.id === 'tank_healer')?.active;
            if (useTankHealer) {
                [p1, p2].forEach(p => {
                    if (!p.members.some(m => ['수호성', '검성'].includes(m.class))) {
                        const tank = candidates.find(m => ['수호성', '검성'].includes(m.class));
                        if (tank) {
                            p.members.push(tank);
                            candidates = candidates.filter(m => m.id !== tank.id);
                            workingPool = workingPool.filter(m => m.id !== tank.id);
                        }
                    }
                    if (!p.members.some(m => ['치유성', '호법성'].includes(m.class))) {
                        const healer = candidates.find(m => ['치유성', '호법성'].includes(m.class));
                        if (healer) {
                            p.members.push(healer);
                            candidates = candidates.filter(m => m.id !== healer.id);
                            workingPool = workingPool.filter(m => m.id !== healer.id);
                        }
                    }
                });
            }

            // [C] Ace First
            const useAceFirst = algoCards.find(c => c.id === 'ace_first')?.active;
            if (useAceFirst) {
                while (p1.members.length < 4 && candidates.length > 0) {
                    const ace = candidates[0];
                    p1.members.push(ace);
                    candidates = candidates.filter(m => m.id !== ace.id);
                    workingPool = workingPool.filter(m => m.id !== ace.id);
                }
            }

            // [D] Fill Remaining
            const useBalance = algoCards.find(c => c.id === 'power_balance')?.active;
            while (candidates.length > 0 && (p1.members.length < 4 || p2.members.length < 4)) {
                const member = candidates[0];
                let targetP = null;

                if (p1.members.length < 4 && p2.members.length < 4) {
                    if (useBalance) {
                        const p1Power = p1.members.reduce((s, m) => s + m.power, 0);
                        const p2Power = p2.members.reduce((s, m) => s + m.power, 0);
                        targetP = p1Power <= p2Power ? p1 : p2;
                    } else {
                        targetP = p1;
                    }
                } else if (p1.members.length < 4) targetP = p1;
                else targetP = p2;

                targetP.members.push(member);
                candidates = candidates.filter(m => m.id !== member.id);
                workingPool = workingPool.filter(m => m.id !== member.id);
            }
        });

        // Update State
        setParties([...workingParties]);
        setPool(workingPool);
        alert(`매칭 완료! (범위: ${matchOptions.targetScope === 'RESHUFFLE' ? '전체 재분배' : '빈칸 채우기'})`);
    };

    const resetAll = () => {
        setParties(parties.map(p => ({ ...p, members: [] })));
        setPool(allMembers);
    };

    const filteredPool = pool.filter(m => {
        // Time Slot Logic (Only Filter)
        if (selectedDay !== 'ALL' && !selectedSlot) {
            if (!m.availability?.[selectedDay]) return false;
        } else if (selectedDay !== 'ALL' && selectedSlot) {
            if (!m.availability?.[selectedDay]?.includes(selectedSlot)) return false;
        }

        return true;
    });

    // Sort: Combat Power Desc (Grouped by Fixed Party's Max Power)
    const sortedPool = [...filteredPool].sort((a, b) => {
        // 1. Calculate Effective Sort Power
        const getSortPower = (m: Member) => {
            if (m.fixedGroupId) {
                // If in fixed group, use the group's max power
                const groupMembers = pool.filter(gm => gm.fixedGroupId === m.fixedGroupId);
                return Math.max(...groupMembers.map(gm => gm.power));
            }
            return m.power;
        };

        const powerA = getSortPower(a);
        const powerB = getSortPower(b);

        // 2. Primary Sort: Effective Power (Group vs Solo)
        if (powerA !== powerB) return powerB - powerA;

        // 3. Secondary Sort: Member's Own Power (within group or ties)
        return b.power - a.power;
    });

    // --- Render ---
    return (
        <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd} collisionDetection={closestCenter}>
            <div className="relative flex h-[calc(100vh-140px)] gap-6 animate-in fade-in duration-500">

                {/* 1. Left: Queue Dashboard */}
                <div className="w-1/3 min-w-[360px] flex flex-col bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden z-10 transition-all">
                    <div className="p-4 border-b flex justify-between items-center bg-white/50 dark:bg-slate-800/50">
                        <div className="flex items-center gap-2">
                            <h2 className="font-bold flex items-center gap-2"><Users size={18} className="text-indigo-500" /> 대기 멤버 ({sortedPool.length})</h2>
                        </div>
                        <div className="flex gap-1">
                            <button onClick={() => setIsFixedGroupModalOpen(true)} className="text-xs bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 px-3 py-1.5 rounded-lg font-bold shadow-sm transition-all flex items-center gap-1 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300" title="고정 파티 관리">
                                <Settings size={14} /> 고정 파티 설정
                            </button>
                        </div>
                    </div>

                    {/* Simplified Filters (Day & Slot Only) */}
                    <div className="px-4 py-3 border-b flex flex-col gap-2 bg-slate-50/50 dark:bg-slate-800/30">
                        <div className="flex flex-col gap-3">
                            {/* Day Buttons (Grid Layout) */}
                            <div className="flex w-full">
                                <button
                                    onClick={() => setSelectedDay('ALL')}
                                    className={cn(
                                        "flex-1 h-10 text-sm font-bold transition-all border border-r-0 last:border-r flex items-center justify-center",
                                        selectedDay === 'ALL'
                                            ? "bg-slate-800 text-white border-slate-800 z-10 dark:bg-white dark:text-slate-900"
                                            : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700"
                                    )}
                                >
                                    전체
                                </button>
                                {RAID_DAYS.map((d, i) => (
                                    <button
                                        key={d}
                                        onClick={() => setSelectedDay(d)}
                                        className={cn(
                                            "flex-1 h-10 text-sm font-bold transition-all border border-r-0 last:border-r flex items-center justify-center",
                                            selectedDay === d
                                                ? "bg-indigo-600 text-white border-indigo-600 z-10"
                                                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700"
                                        )}
                                    >
                                        {d}
                                    </button>
                                ))}
                            </div>

                            {/* Divider & Time Slots (Switch based on Day) */}
                            {selectedDay !== 'ALL' ? (
                                <>
                                    <div className="h-px bg-slate-100 dark:bg-slate-800 w-full" />

                                    {/* Time Slot Buttons */}
                                    <div className="grid grid-cols-2 gap-1 w-full">
                                        <button
                                            onClick={() => setSelectedSlot(undefined)}
                                            className={cn(
                                                "w-full h-9 text-xs font-bold transition-all border flex items-center justify-center",
                                                !selectedSlot
                                                    ? "bg-slate-800 text-white border-slate-800 dark:bg-white dark:text-slate-900"
                                                    : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700"
                                            )}
                                        >
                                            시간 전체
                                        </button>
                                        {/* Filter slots based on selected day */}
                                        {(() => {
                                            let visibleSlots;
                                            if (['토', '일'].includes(selectedDay)) {
                                                visibleSlots = WEEKEND_SLOTS;
                                            } else {
                                                visibleSlots = WEEKDAY_SLOTS;
                                            }

                                            return visibleSlots.map(s => {
                                                // Check availability count for this slot
                                                const availableCount = pool.filter(m =>
                                                    m.availability?.[selectedDay]?.includes(s.id)
                                                ).length;
                                                const isDisabled = availableCount === 0;

                                                return (
                                                    <div key={s.id} className="relative group w-full">
                                                        <button
                                                            onClick={() => !isDisabled && setSelectedSlot(s.id)}
                                                            className={cn(
                                                                "w-full h-9 text-xs font-bold transition-all border flex items-center justify-center",
                                                                isDisabled
                                                                    ? "bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed dark:bg-slate-800/50 dark:text-slate-600 dark:border-slate-800"
                                                                    : selectedSlot === s.id
                                                                        ? "bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-700"
                                                                        : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700"
                                                            )}
                                                        >
                                                            {s.label}
                                                        </button>
                                                        {/* Custom Tooltip */}
                                                        {isDisabled && (
                                                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max max-w-[150px] px-2 py-1 bg-slate-800 text-white text-[10px] rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 whitespace-pre-wrap text-center">
                                                                해당 시간대에<br />신청자가 없습니다.
                                                                {/* Triangle Arrow */}
                                                                <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800" />
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            });
                                        })()}
                                    </div>
                                </>
                            ) : (
                                /* ALL View Subtitle */
                                <div className="py-4 flex flex-col items-center justify-center text-slate-400 space-y-1 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-100 dark:border-slate-700/50">
                                    <span className="text-xs font-medium">전체 목록에서는 리스트 확인만 가능합니다.</span>
                                </div>
                            )}
                        </div>
                    </div>

                    <PoolContainer id="pool" members={sortedPool} fixedGroups={fixedGroups} isReadOnly={selectedDay === 'ALL'} />
                </div>

                {/* 2. Right: Party Canvas */}
                <div className="flex-1 flex flex-col min-w-0 bg-slate-50/50 dark:bg-slate-900/50 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                    <div className="p-4 border-b flex justify-between items-center bg-white/50 dark:bg-slate-800/50">
                        <h2 className="font-bold flex items-center gap-2"><Shield size={18} className="text-rose-500" /> 파티 구성 ({parties.length})</h2>
                        <div className="flex items-center gap-2">
                            <button onClick={() => setIsAlgoSettingsModalOpen(true)} className="text-xs bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 px-3 py-1.5 rounded-lg font-bold shadow-sm transition-all flex items-center gap-1 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300">
                                <Settings2 size={14} /> 매칭 알고리즘 수정
                            </button>
                            <button onClick={() => setIsAutoMatchModalOpen(true)} className="text-xs bg-indigo-500 hover:bg-indigo-600 text-white px-3 py-1.5 rounded-lg font-bold shadow-lg shadow-indigo-500/20 transition-all transform hover:scale-105 flex items-center gap-1">
                                <Sparkles size={14} /> 자동 매칭 시작
                            </button>
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 grid grid-cols-2 gap-4">
                        {parties.map((party, idx) => (
                            <PartySlot key={party.id} party={party} index={idx} fixedGroups={fixedGroups} />
                        ))}
                    </div>
                </div>

                {/* 3. Floating Actions */}
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-white dark:bg-slate-800 p-2 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 flex gap-2 z-20">
                    <button onClick={resetAll} className="px-6 py-3 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 font-bold hover:bg-red-50 hover:text-red-500 transition-colors flex items-center gap-2">
                        <RotateCcw size={18} /> 초기화
                    </button>
                </div>
            </div>

            <DragOverlay>
                {draggedMember ? <MemberCard member={draggedMember} isOverlay /> : null}
            </DragOverlay>

            {/* Auto Match Modal (Simplified - Scope Only) */}
            {isAutoMatchModalOpen && (
                <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
                            <div>
                                <h2 className="text-xl font-bold flex items-center gap-2">
                                    <Sparkles className="text-indigo-500" /> 자동 매칭 시작
                                </h2>
                                <p className="text-sm text-slate-500 mt-1">매칭 범위를 선택하고 실행하세요.</p>
                            </div>
                            <button onClick={() => setIsAutoMatchModalOpen(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 space-y-6">
                            {/* Scope Options */}
                            <section>
                                <div className="grid grid-cols-1 gap-3">
                                    <label className={cn(
                                        "flex items-start gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all hover:bg-slate-50 dark:hover:bg-slate-800",
                                        matchOptions.targetScope === 'FILL' ? "border-indigo-500 bg-indigo-50/50 dark:bg-indigo-900/10" : "border-slate-100 dark:border-slate-800"
                                    )}>
                                        <input type="radio" name="scope" className="mt-1 accent-indigo-500 w-4 h-4"
                                            checked={matchOptions.targetScope === 'FILL'}
                                            onChange={() => setMatchOptions(o => ({ ...o, targetScope: 'FILL' }))} />
                                        <div>
                                            <span className="font-bold text-sm block mb-1">빈 자리 채우기 (FILL)</span>
                                            <p className="text-xs text-slate-500">현재 구성된 파티원은 유지하고,<br />남은 빈 자리만 대기 멤버로 채웁니다.</p>
                                        </div>
                                    </label>
                                    <label className={cn(
                                        "flex items-start gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all hover:bg-slate-50 dark:hover:bg-slate-800",
                                        matchOptions.targetScope === 'RESHUFFLE' ? "border-rose-500 bg-rose-50/50 dark:bg-rose-900/10" : "border-slate-100 dark:border-slate-800"
                                    )}>
                                        <input type="radio" name="scope" className="mt-1 accent-rose-500 w-4 h-4"
                                            checked={matchOptions.targetScope === 'RESHUFFLE'}
                                            onChange={() => setMatchOptions(o => ({ ...o, targetScope: 'RESHUFFLE' }))} />
                                        <div>
                                            <span className="font-bold text-sm block mb-1">전체 재분배 (Re-Shuffle)</span>
                                            <p className="text-xs text-slate-500">모든 파티를 해체하고 처음부터 다시 배치합니다.<br /><span className="text-rose-500 font-bold">※ 기존 구성이 초기화됩니다.</span></p>
                                        </div>
                                    </label>
                                </div>
                            </section>
                        </div>

                        <div className="p-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex justify-end gap-3">
                            <button onClick={() => setIsAutoMatchModalOpen(false)} className="px-5 py-2.5 rounded-xl font-medium text-slate-500 hover:bg-slate-200 transition-colors">
                                취소
                            </button>
                            <button onClick={handleAutoMatch} className="px-8 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-lg shadow-indigo-500/20 transition-all transform active:scale-95 flex items-center gap-2">
                                <Sparkles size={18} />매칭 실행
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Algorithm Settings Modal (New - Separated) */}
            {isAlgoSettingsModalOpen && (
                <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
                            <div>
                                <h2 className="text-xl font-bold flex items-center gap-2">
                                    <Settings className="text-slate-500" /> 매칭 알고리즘 설정
                                </h2>
                                <p className="text-sm text-slate-500 mt-1">우선순위를 드래그하여 조정하세요.</p>
                            </div>
                            <button onClick={() => setIsAlgoSettingsModalOpen(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6">
                            <DndContext collisionDetection={closestCenter} onDragEnd={handleAlgoDragEnd}>
                                <SortableContext items={algoCards} strategy={verticalListSortingStrategy}>
                                    <div className="space-y-2">
                                        {algoCards.map((card) => (
                                            <SortableAlgoCard key={card.id} card={card} onToggle={() => toggleAlgo(card.id)} />
                                        ))}
                                    </div>
                                </SortableContext>
                            </DndContext>
                        </div>

                        <div className="p-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex justify-end">
                            <button onClick={() => setIsAlgoSettingsModalOpen(false)} className="px-6 py-2.5 rounded-xl bg-slate-900 text-white font-bold hover:bg-slate-800 transition-colors">
                                완료
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Confirmation Modal */}
            {confirmationModal.isOpen && (
                <div className="fixed inset-0 bg-black/50 z-[200] flex items-center justify-center animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-2xl max-w-sm w-full mx-4 border border-slate-100 dark:border-slate-700">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-full bg-yellow-100 text-yellow-600 flex items-center justify-center">
                                <AlertTriangle size={20} />
                            </div>
                            <h3 className="text-lg font-bold">확인 필요</h3>
                        </div>
                        <p className="text-slate-600 dark:text-slate-300 text-sm whitespace-pre-wrap leading-relaxed">{confirmationModal.message}</p>
                        <div className="flex gap-2 mt-6">
                            <button onClick={confirmationModal.onCancel} className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-medium hover:bg-slate-200 transition-colors">취소</button>
                            <button onClick={confirmationModal.onConfirm} className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 transition-colors">확인</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Fixed Group Modal Stub (Can be implemented fully later if needed, mostly CRUD) */}
            {/* Fixed Group Modal */}
            {isFixedGroupModalOpen && (
                <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-slate-900 w-[80vw] max-w-5xl rounded-2xl shadow-2xl overflow-hidden flex flex-col h-[80vh]">
                        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
                            <div>
                                <h3 className="text-xl font-bold flex items-center gap-2">
                                    <Settings size={20} className="text-slate-500" /> 고정 파티 관리
                                </h3>
                                <p className="text-sm text-slate-500 mt-1">고정으로 운영할 파티원을 관리합니다.</p>
                            </div>
                            <button onClick={() => setIsFixedGroupModalOpen(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="flex flex-1 overflow-hidden">
                            {/* Left: Group List */}
                            <div className="w-1/3 border-r border-slate-100 dark:border-slate-800 p-4 bg-slate-50/50 dark:bg-slate-800/30 overflow-y-auto space-y-2">
                                {fixedGroups.map(fg => (
                                    <button
                                        key={fg.id}
                                        onClick={() => setSelectedFixedGroupId(fg.id)}
                                        className={cn(
                                            "w-full text-left p-3 rounded-xl border transition-all shadow-sm group",
                                            selectedFixedGroupId === fg.id
                                                ? "bg-white dark:bg-slate-800 border-indigo-500 ring-1 ring-indigo-500 z-10"
                                                : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-indigo-400"
                                        )}
                                    >
                                        <div className="flex items-center justify-between mb-1">
                                            <div className="flex items-center gap-2 font-bold text-sm">
                                                <div className={cn("w-3 h-3 rounded-full", fg.color)} />
                                                {fg.name}
                                            </div>
                                            <span className="text-xs text-slate-400 bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded-full">{fg.memberIds.length}명</span>
                                        </div>
                                    </button>
                                ))}
                                <button
                                    onClick={() => {
                                        const newId = `fg-${Date.now()}`;
                                        const newName = `${fixedGroups.length + 1}팀`;
                                        const colors = ['bg-rose-500', 'bg-indigo-500', 'bg-emerald-500', 'bg-orange-500', 'bg-purple-500'];
                                        const newColor = colors[fixedGroups.length % colors.length];

                                        const newGroup: FixedGroup = {
                                            id: newId,
                                            name: newName,
                                            color: newColor,
                                            memberIds: []
                                        };

                                        setFixedGroups([...fixedGroups, newGroup]);
                                        setSelectedFixedGroupId(newId);
                                    }}
                                    className="w-full py-3 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 text-slate-400 hover:text-indigo-500 hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-all flex items-center justify-center gap-2 font-bold text-sm"
                                >
                                    <Plus size={16} /> 새 팀 추가
                                </button>
                            </div>

                            {/* Right: Member Editor */}
                            <div className="flex-1 p-6 flex flex-col bg-white dark:bg-slate-900">
                                {selectedFixedGroupId ? (
                                    (() => {
                                        const selectedGroup = fixedGroups.find(g => g.id === selectedFixedGroupId);
                                        if (!selectedGroup) return null;

                                        return (
                                            <div className="flex flex-col h-full">
                                                <div className="mb-4 pb-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                                                    <div className="flex items-center gap-2 flex-1">
                                                        <button
                                                            onClick={() => setIsColorPickerOpen(!isColorPickerOpen)}
                                                            className={cn("w-4 h-4 rounded-full transition-transform hover:scale-125 focus:outline-none ring-2 ring-offset-2 ring-transparent focus:ring-indigo-500", selectedGroup.color)}
                                                            title="팀 색상 변경"
                                                        />
                                                        <input
                                                            type="text"
                                                            value={selectedGroup.name}
                                                            onChange={(e) => {
                                                                const newName = e.target.value;
                                                                setFixedGroups(fixedGroups.map(fg =>
                                                                    fg.id === selectedFixedGroupId ? { ...fg, name: newName } : fg
                                                                ));
                                                            }}
                                                            className="font-bold text-lg bg-transparent border-b border-transparent hover:border-slate-300 focus:border-indigo-500 focus:outline-none transition-colors w-full"
                                                            placeholder="팀 이름 입력"
                                                        />
                                                    </div>
                                                    <button
                                                        onClick={() => {
                                                            if (confirm(`'${selectedGroup.name}' 팀을 삭제하시겠습니까?`)) {
                                                                setFixedGroups(fixedGroups.filter(fg => fg.id !== selectedFixedGroupId));
                                                                setSelectedFixedGroupId(null);
                                                            }
                                                        }}
                                                        className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                                                        title="팀 삭제"
                                                    >
                                                        <Trash2 size={18} />
                                                    </button>
                                                </div>

                                                {/* Color Picker (Toggled) */}
                                                {isColorPickerOpen && (
                                                    <div className="flex gap-2 mb-6 overflow-x-auto pb-2 custom-scrollbar animate-in slide-in-from-top-2 fade-in duration-200">
                                                        {[
                                                            'bg-slate-500', 'bg-red-500', 'bg-orange-500', 'bg-amber-500', 'bg-yellow-500',
                                                            'bg-lime-500', 'bg-green-500', 'bg-emerald-500', 'bg-teal-500', 'bg-cyan-500',
                                                            'bg-sky-500', 'bg-blue-500', 'bg-indigo-500', 'bg-violet-500', 'bg-purple-500',
                                                            'bg-fuchsia-500', 'bg-pink-500', 'bg-rose-500'
                                                        ].map(color => (
                                                            <button
                                                                key={color}
                                                                onClick={() => {
                                                                    setFixedGroups(fixedGroups.map(fg =>
                                                                        fg.id === selectedFixedGroupId ? { ...fg, color } : fg
                                                                    ));
                                                                    // Keep open for easy switching
                                                                }}
                                                                className={cn(
                                                                    "w-8 h-8 rounded-full shrink-0 transition-all border-2",
                                                                    color,
                                                                    selectedGroup.color === color ? "border-slate-600 dark:border-white scale-110 shadow-lg ring-2 ring-offset-2 ring-indigo-500" : "border-transparent opacity-70 hover:opacity-100 hover:scale-105"
                                                                )}
                                                            />
                                                        ))}
                                                    </div>
                                                )}

                                                {/* Add Member Input (Simple ID/Name Match for prototype) */}
                                                <div className="mb-4 flex gap-2">
                                                    <input
                                                        type="text"
                                                        placeholder="캐릭터명 검색 (엔터로 추가)"
                                                        className="flex-1 px-3 py-2 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-slate-800 dark:border-slate-700"
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') {
                                                                const val = e.currentTarget.value.trim();
                                                                if (!val) return;

                                                                // Simple logic: find member by name or ID
                                                                // In real app, this should be a proper search dropdown
                                                                const member = allMembers.find(m => m.name === val || m.id === val);
                                                                if (member) {
                                                                    // 1. Check if already in THIS group
                                                                    if (selectedGroup.memberIds.includes(member.id)) {
                                                                        alert("이미 이 팀에 추가된 멤버입니다.");
                                                                        e.currentTarget.value = '';
                                                                        return;
                                                                    }

                                                                    // 2. Check if already in ANOTHER group
                                                                    const otherGroup = fixedGroups.find(fg => fg.id !== selectedFixedGroupId && fg.memberIds.includes(member.id));

                                                                    if (otherGroup) {
                                                                        // Custom Modal for confirmation
                                                                        setConfirmationModal({
                                                                            isOpen: true,
                                                                            message: `'${member.name}'님은 이미 '${otherGroup.name}'에 속해있습니다.\n'${selectedGroup.name}'(으)로 이동하시겠습니까?`,
                                                                            onConfirm: () => {
                                                                                setFixedGroups(prev => prev.map(fg => {
                                                                                    if (fg.id === otherGroup.id) {
                                                                                        return { ...fg, memberIds: fg.memberIds.filter(id => id !== member.id) };
                                                                                    }
                                                                                    if (fg.id === selectedFixedGroupId) {
                                                                                        return { ...fg, memberIds: [...fg.memberIds, member.id] };
                                                                                    }
                                                                                    return fg;
                                                                                }));
                                                                                setConfirmationModal(prev => ({ ...prev, isOpen: false }));
                                                                            },
                                                                            onCancel: () => {
                                                                                setConfirmationModal(prev => ({ ...prev, isOpen: false }));
                                                                            }
                                                                        });
                                                                        // Note: Input clearing in async flow is tricky, keeping logic simple or clearing immediately if desired.
                                                                        // Original logic cleared it inside confirm block. Here we clear it in onConfirm or immediately?
                                                                        // Should clear immediately to avoid confusion, or handle it via state.
                                                                        // For now, let's clear it immediately to match recent user behavior expectations if accepted,
                                                                        // but wait, if cancelled? Better to keep it?
                                                                        // Let's clear it immediately as it's cleaner for "pending action".
                                                                        e.currentTarget.value = '';
                                                                    } else {
                                                                        // 3. Just Add
                                                                        setFixedGroups(fixedGroups.map(fg =>
                                                                            fg.id === selectedFixedGroupId
                                                                                ? { ...fg, memberIds: [...fg.memberIds, member.id] }
                                                                                : fg
                                                                        ));
                                                                        e.currentTarget.value = '';
                                                                    }
                                                                } else {
                                                                }
                                                            }
                                                        }}
                                                    />
                                                </div>

                                                {/* Member List */}
                                                <div className="flex-1 overflow-y-auto space-y-2">
                                                    {selectedGroup.memberIds.length === 0 ? (
                                                        <div className="h-40 flex flex-col items-center justify-center text-slate-400 opacity-60">
                                                            <p className="text-sm">등록된 멤버가 없습니다.</p>
                                                        </div>
                                                    ) : (
                                                        selectedGroup.memberIds.map(mid => {
                                                            const member = allMembers.find(m => m.id === mid);
                                                            return (
                                                                <div key={mid} className="flex items-center justify-between p-2 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
                                                                    <div className="flex items-center gap-2">
                                                                        {member ? (
                                                                            <>
                                                                                <div className={cn("w-6 h-6 rounded flex items-center justify-center text-xs font-bold text-white", getClassColor(member.class))}>
                                                                                    {member.class[0]}
                                                                                </div>
                                                                                <span className="font-bold text-sm">{member.name}</span>
                                                                            </>
                                                                        ) : (
                                                                            <span className="text-slate-400 text-sm">Unknown ({mid})</span>
                                                                        )}
                                                                    </div>
                                                                    <button
                                                                        onClick={() => {
                                                                            const newGroups = fixedGroups.map(fg =>
                                                                                fg.id === selectedFixedGroupId
                                                                                    ? { ...fg, memberIds: fg.memberIds.filter(id => id !== mid) }
                                                                                    : fg
                                                                            );
                                                                            setFixedGroups(newGroups);
                                                                        }}
                                                                        className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded transition-colors"
                                                                    >
                                                                        <Trash2 size={14} />
                                                                    </button>
                                                                </div>
                                                            );
                                                        })
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })()
                                ) : (
                                    <div className="flex-1 flex flex-col items-center justify-center text-slate-400 space-y-2 opacity-50">
                                        <Users size={32} />
                                        <p className="text-sm">왼쪽에서 고정 파티를 선택해주세요</p>
                                    </div>
                                )}
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
                <GripVertical size={18} />
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

function PoolContainer({ id, members, fixedGroups, isReadOnly }: { id: string, members: Member[], fixedGroups?: FixedGroup[], isReadOnly?: boolean }) {
    const { setNodeRef } = useDroppable({ id });
    return (
        <div ref={setNodeRef} className={cn("flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar", isReadOnly && "opacity-60 grayscale bg-slate-50/50 dark:bg-slate-900/50")}>
            {members.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-2 opacity-50">
                    <Users size={32} strokeWidth={1.5} />
                    <p className="text-sm">대기 인원이 없습니다</p>
                </div>
            ) : (
                members.map(m => (
                    <DraggableMember key={m.id} member={m} fixedGroups={fixedGroups} isReadOnly={isReadOnly} />
                ))
            )}
        </div>
    );
}

function PartySlot({ party, fixedGroups, index }: { party: Party, fixedGroups?: FixedGroup[], index: number }) {
    const { setNodeRef, isOver } = useDroppable({ id: party.id });

    // Derived Force Info (0-1, 2-3 pair)
    const forceIndex = Math.floor(index / 2);
    const isForceLeader = index % 2 === 0;

    return (
        <div className={cn(
            "bg-white dark:bg-slate-800 rounded-2xl border transition-all flex flex-col overflow-hidden group shadow-sm hover:shadow-md h-[340px]", // Fixed Height
            isOver ? "border-indigo-500 ring-4 ring-indigo-500/10 z-10 scale-[1.02]" : "border-slate-200 dark:border-slate-700"
        )}>
            {/* Thread/Connector Visuals if needed */}
            <div className="p-3 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
                <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-600 dark:text-slate-300">
                        {index + 1}
                    </div>
                    <span className="font-bold text-slate-700 dark:text-slate-200">{party.name}</span>
                    <span className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded font-medium",
                        party.members.length === 4 ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-500"
                    )}>
                        {party.members.length}/4
                    </span>
                </div>
                {/* Time Display (Small) */}
                {party.assignedDay && party.assignedTime && (
                    <div className="flex items-center gap-1 text-[10px] bg-indigo-50 text-indigo-600 px-2 py-1 rounded-full border border-indigo-100">
                        <Clock size={10} />
                        <span>{party.assignedDay} {party.assignedTime}</span>
                    </div>
                )}
            </div>

            <div ref={setNodeRef} className="flex-1 p-2 space-y-1.5 overflow-y-auto custom-scrollbar relative">
                {party.members.length === 0 && !isOver && (
                    <div className="absolute inset-0 flex items-center justify-center text-slate-300 pointer-events-none">
                        <span className="text-xs">드래그하여 추가</span>
                    </div>
                )}
                {party.members.map(m => (
                    <DraggableMember key={m.id} member={m} fixedGroups={fixedGroups} />
                ))}
            </div>

            {/* Simple Stats Footer */}
            <div className="p-2 bg-slate-50 border-t border-slate-100 flex justify-between text-[10px] text-slate-400">
                <span>Power: {party.members.reduce((s, m) => s + m.power, 0).toLocaleString()}</span>
            </div>
        </div>
    );
}

function DraggableMember({ member, fixedGroups, isReadOnly }: { member: Member, fixedGroups?: FixedGroup[], isReadOnly?: boolean }) {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: member.id,
        disabled: isReadOnly, // Disable drag if read-only
    });

    // Check Fixed Group
    const fixedGroup = fixedGroups?.find(g => g.id === member.fixedGroupId);

    const style = transform ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: 999, // High z-index while dragging
    } : undefined;

    return (
        <div ref={setNodeRef} style={style} {...listeners} {...attributes} className={cn(
            "touch-none",
            !isReadOnly && "cursor-grab active:cursor-grabbing", // Only show grab cursor if not read-only
            isDragging ? "opacity-0" : "opacity-100", // Hide original while dragging
            isReadOnly && "pointer-events-none" // Optional: disable all interactions
        )}>
            <MemberCard member={member} fixedGroup={fixedGroup} />
        </div>
    );
}

// Safe mapping for Tailwind classes to ensure they are not purged
const COLOR_MAP: Record<string, string> = {
    'bg-slate-500': 'border-slate-500',
    'bg-red-500': 'border-red-500',
    'bg-orange-500': 'border-orange-500',
    'bg-amber-500': 'border-amber-500',
    'bg-yellow-500': 'border-yellow-500',
    'bg-lime-500': 'border-lime-500',
    'bg-green-500': 'border-green-500',
    'bg-emerald-500': 'border-emerald-500',
    'bg-teal-500': 'border-teal-500',
    'bg-cyan-500': 'border-cyan-500',
    'bg-sky-500': 'border-sky-500',
    'bg-blue-500': 'border-blue-500',
    'bg-indigo-500': 'border-indigo-500',
    'bg-violet-500': 'border-violet-500',
    'bg-purple-500': 'border-purple-500',
    'bg-fuchsia-500': 'border-fuchsia-500',
    'bg-pink-500': 'border-pink-500',
    'bg-rose-500': 'border-rose-500'
};

function MemberCard({ member, isOverlay, fixedGroup }: { member: Member, isOverlay?: boolean, fixedGroup?: FixedGroup }) {
    // Explicit lookup to fix Tailwind JIT purging
    const borderColorClass = fixedGroup ? (COLOR_MAP[fixedGroup.color] || 'border-slate-200') : '';

    return (
        <div className={cn(
            "relative p-2 rounded-xl border flex items-center gap-3 bg-white dark:bg-slate-800 transition-all select-none box-border",
            isOverlay ? "shadow-2xl ring-4 ring-indigo-500/20 scale-105 z-50 cursor-grabbing border-indigo-500" : "shadow-sm",
            fixedGroup && !isOverlay ? cn("border-2", borderColorClass) : "border-slate-100 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
        )}
        >
            {/* Fixed Group Indicator */}
            {fixedGroup && (
                <div className={cn("absolute -top-1 -right-1 w-3 h-3 rounded-full shadow-sm border-2 border-white", fixedGroup.color)} />
            )}

            <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shadow-inner", getClassColor(member.class))}>
                <span className="text-white font-bold">{member.class[0]}</span>
            </div>

            <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between">
                    <span className="font-bold text-slate-700 dark:text-slate-200 text-sm truncate">{member.name}</span>
                    <span className="text-[10px] font-medium text-slate-400 bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded-full">
                        {member.power.toLocaleString()}
                    </span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-slate-400">{member.class}</span>
                </div>
            </div>
        </div>
    );
}
