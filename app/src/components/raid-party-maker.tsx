'use client';

import React, { useState, useEffect } from 'react';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent,
    DragStartEvent,
    DragOverEvent,
    DragOverlay,
    useDraggable,
    useDroppable,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Users, GripVertical, Shuffle, Zap, Trash2, Copy, Check, Sword, Shield, Crosshair, Sparkles, Settings2, Settings, X, XCircle, CheckCircle2, ChevronRight, Clock, Calendar, Plus, Lock, AlertTriangle, RotateCcw } from 'lucide-react';
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
    matchType: 'DAY' | 'ALL';
    selectedDays: string[]; // Added multiple days
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
    status: 'AVAILABLE' | 'ESSENTIAL' | 'PRIORITY';
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
export default function RaidPartyMakerV3({ testMode = false }: { testMode?: boolean }) {
    const { loading } = useAuth();

    // Data State
    const [allMembers, setAllMembers] = useState<Member[]>([]);
    const [dbMembers, setDbMembers] = useState<Record<string, any>>({});
    const [pool, setPool] = useState<Member[]>([]);
    const [applications, setApplications] = useState<Member[]>([]);
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
        matchType: 'ALL',
        selectedDays: ['수'], // Init with Wed
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
        { id: 'schedule_gating', label: '스케줄 게이팅', desc: '신청자가 선택한 시간에만 배정합니다.', status: 'ESSENTIAL' },
        { id: 'fixed_group', label: '고정 파티 우선', desc: '설정된 고정 파티 멤버를 1순위로 배정합니다.', status: 'ESSENTIAL' },
        { id: 'resurrection_anchor', label: '부활 앵커', desc: '파티당 1명의 치유성을 필수 배치합니다.', status: 'ESSENTIAL' },
        { id: 'scarcity_priority', label: '희소성 우선', desc: '인원이 부족한 역할/시간을 우선 배정합니다.', status: 'PRIORITY' },
        { id: 'safety_opt', label: '안전 최적화', desc: '검성 탱커 시 호법성을 배치하여 생존력을 보강합니다.', status: 'PRIORITY' },
        { id: 'combat_logic', label: '전투 로직', desc: '근거리/원거리 클래스 비율을 균형 있게 맞춥니다.', status: 'PRIORITY' },
        { id: 'power_balance', label: '파워 밸런스', desc: '전투력 고점과 저점을 교차하여 평준화합니다.', status: 'PRIORITY' },
        { id: 'attendance_volume', label: '참여 볼륨', desc: '남은 자리를 조건 없이 채워 참여 인원을 최대화합니다.', status: 'PRIORITY' },
        { id: 'main_tank', label: '메인 탱커', desc: '파티당 1명의 수호성/검성을 고정 배치합니다.', status: 'AVAILABLE' },
    ]);

    // Tooltip State
    const [tooltipInfo, setTooltipInfo] = useState<{ member: Member, rect: DOMRect } | null>(null);

    // Dnd State for Algo
    const [activeAlgoId, setActiveAlgoId] = useState<string | null>(null);

    const handleShowTooltip = (member: Member, rect: DOMRect) => {
        setTooltipInfo({ member, rect });
    };

    const handleHideTooltip = () => {
        setTooltipInfo(null);
    };


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
            // 1. Load Roster (members)
            const membersRef = ref(db, 'members');
            onValue(membersRef, (memberSnap) => {
                const memberData = memberSnap.val();
                const roster: Member[] = memberData ? Object.values(memberData).map((m: any) => ({
                    id: m.id, name: m.name, class: m.class || '검성',
                    power: m.power || 0, score: m.score || 0, rank: m.rank || '',
                    availability: m.availability,
                    fixedGroupId: m.fixedGroupId
                })) : [];
                setAllMembers(roster);

                // 2. Load Applications (raid_applications)
                const appsRef = ref(db, 'raid_applications');
                onValue(appsRef, (appSnap) => {
                    const appData = appSnap.val();
                    if (appData) {
                        const applications = Object.values(appData) as any[];

                        // 3. Map applications to Member objects, enriching with roster data
                        const applicantList: Member[] = applications.map(app => {
                            // Find matching member in roster by nickname
                            const rosterMember = roster.find(m => m.name === app.nickname);

                            return {
                                id: app.id || app.nickname,
                                name: app.nickname,
                                class: app.class || (rosterMember?.class) || '검성',
                                power: app.power || (rosterMember?.power) || 0,
                                score: rosterMember?.score || 0,
                                rank: rosterMember?.rank || '',
                                availability: app.availability,
                                fixedGroupId: rosterMember?.fixedGroupId
                            };
                        });

                        setApplications(applicantList);
                        setPool(applicantList);
                    } else {
                        setApplications([]);
                        setPool([]);
                    }
                }, { onlyOnce: true });

                // Init Parties (8 per force, 4 forces total in UI but usually we handle 1 force at a time or 8 parties total)
                // Existing logic had 8 parties.
                setParties(Array.from({ length: 8 }, (_, i) => ({
                    id: `party-${i + 1}`, name: `${i + 1}파티`, members: []
                })));

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
    const handleAlgoDragStart = (event: DragStartEvent) => {
        setActiveAlgoId(event.active.id as string);
    };

    const handleAlgoDragOver = (event: DragOverEvent) => {
        const { active, over } = event;
        if (!over) return;

        const activeId = active.id as string;
        const overId = over.id as string;

        // Container IDs
        const containers = ['AVAILABLE', 'ESSENTIAL', 'PRIORITY'];

        // Find current card
        const activeCard = algoCards.find(c => c.id === activeId);
        if (!activeCard) return;

        // Determine new status based on overId
        let newStatus: 'AVAILABLE' | 'ESSENTIAL' | 'PRIORITY' | null = null;

        if (containers.includes(overId)) {
            newStatus = overId as any;
        } else {
            const overCard = algoCards.find(c => c.id === overId);
            if (overCard) {
                newStatus = overCard.status;
            }
        }

        if (newStatus && activeCard.status !== newStatus) {
            setAlgoCards((items) => {
                const activeIndex = items.findIndex((i) => i.id === activeId);
                const overIndex = items.findIndex((i) => i.id === overId);

                if (activeIndex === -1) return items;

                // Clone state
                const newItems = [...items];

                // Update status locally for smooth transition
                newItems[activeIndex] = { ...newItems[activeIndex], status: newStatus! };

                // If hovering over another item in different container, we might want to move it effectively?
                // Actually dnd-kit's sortable strategy handles reordering if they share context.
                // But since we use filtered lists in SortableContext, we need to ensure the item "moves" to that context in state logic.

                return arrayMove(newItems, activeIndex, activeIndex); // Just trigger update with new status
            });
        }
    };

    const handleAlgoDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveAlgoId(null);

        if (!over) return;

        const activeId = active.id as string;
        const overId = over.id as string;

        // Container IDs
        const containers = ['AVAILABLE', 'ESSENTIAL', 'PRIORITY'];

        const activeCard = algoCards.find(c => c.id === activeId);
        if (!activeCard) return;

        let newStatus = activeCard.status;

        if (containers.includes(overId)) {
            newStatus = overId as any;
        } else {
            const overCard = algoCards.find(c => c.id === overId);
            if (overCard) {
                newStatus = overCard.status;
            }
        }

        setAlgoCards((items) => {
            const oldIndex = items.findIndex((item) => item.id === activeId);
            const newIndex = items.findIndex((item) => item.id === overId);

            let newItems = [...items];

            if (items[oldIndex].status !== newStatus) {
                newItems[oldIndex] = { ...newItems[oldIndex], status: newStatus };
            }

            if (oldIndex !== -1 && newIndex !== -1) {
                return arrayMove(newItems, oldIndex, newIndex);
            }

            return newItems;
        });
    };

    // toggleAlgo removed as we use status now, and clicking is not the primary interaction
    // const toggleAlgo = (id: string) => { ... }

    // --- Handlers ---
    const handleDragStart = (event: DragStartEvent) => {
        if (selectedDay === 'ALL' || !selectedSlot) {
            alert("전체 보기 또는 시간 전체 상태에서는 파티를 편성할 수 없습니다.\n먼저 특정 요일과 시간을 선택해주세요.");
            return;
        }
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

        const member = allMembers.find(m => m.id === memberId);
        if (!member) return;

        // Validation: Time Conflict
        if (targetId !== 'pool') {
            const targetParty = parties.find(p => p.id === targetId);
            if (targetParty && targetParty.assignedDay && targetParty.assignedTime) {
                // 1. Fixed Group Smart Check
                if (member.fixedGroupId) {
                    const groupMembers = allMembers.filter(m => m.fixedGroupId === member.fixedGroupId && m.id !== member.id);
                    // Filter only those who applied (exist in allMembers implies they applied/are in pool context if filtered correctly, 
                    // but allMembers here seems to be the full list including pool and parties. 
                    // Actually 'allMembers' is prop passed from parent, usually only applicants.

                    if (groupMembers.length > 0) {
                        // Calculate Intersection of Availability for ALL group members (including self)
                        const allGroupMembers = [member, ...groupMembers];
                        const commonSlots = allGroupMembers.reduce((acc, m) => {
                            const mSlots = m.availability?.[targetParty.assignedDay!] || []; // Type assertion: we know assignedDay exists
                            if (acc === null) return mSlots;
                            return acc.filter(s => mSlots.includes(s));
                        }, null as string[] | null) || [];

                        // If target slot is NOT a common slot, but common slots exist
                        if (!commonSlots.includes(targetParty.assignedTime) && commonSlots.length > 0) {
                            const recommendedLabel = `${targetParty.assignedDay} ${getSlotLabel(commonSlots[0])}`; // Show first common slot

                            setConfirmationModal({
                                isOpen: true,
                                message: `고정 파티 '${fixedGroups.find(g => g.id === member.fixedGroupId)?.name || '그룹'}' 멤버 전원이\n[${recommendedLabel}]에 참여 가능합니다.\n\n현재 선택한 ${targetParty.assignedDay} ${getSlotLabel(targetParty.assignedTime)}에는 일부 인원이 참여할 수 없습니다.\n\n그래도 여기에 배치하시겠습니까?`,
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

                // 2. Individual Availability Check (Existing Logic)
                if ((!member.availability?.[targetParty.assignedDay]?.includes(targetParty.assignedTime))) {
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

    // --- Algo Helpers ---
    const matchFixedParties = (partiesToMatch: Party[], candidates: Member[], pool: Member[]) => {
        let usedIds: string[] = [];
        const groupsInCandidates = new Set(candidates.filter(m => m.fixedGroupId).map(m => m.fixedGroupId));

        groupsInCandidates.forEach(gid => {
            const groupMembers = candidates.filter(m => m.fixedGroupId === gid);
            if (groupMembers.length === 0) return;

            // Find a party with enough space (Integrity Check)
            const targetParty = partiesToMatch.find(p => p.members.length + groupMembers.length <= 4);

            if (targetParty) {
                targetParty.members.push(...groupMembers);
                groupMembers.forEach(m => usedIds.push(m.id));
            }
        });
        return usedIds;
    };

    const matchTankHealer = (partiesToMatch: Party[], candidates: Member[]) => {
        let usedIds: string[] = [];
        partiesToMatch.forEach(p => {
            // Tank
            if (!p.members.some(m => ['수호성', '검성'].includes(m.class))) {
                const tank = candidates.find(m => !usedIds.includes(m.id) && ['수호성', '검성'].includes(m.class));
                if (tank) {
                    p.members.push(tank);
                    usedIds.push(tank.id);
                }
            }
            // Healer
            if (!p.members.some(m => ['치유성', '호법성'].includes(m.class))) {
                const healer = candidates.find(m => !usedIds.includes(m.id) && ['치유성', '호법성'].includes(m.class));
                if (healer) {
                    p.members.push(healer);
                    usedIds.push(healer.id);
                }
            }
        });
        return usedIds;
    };

    const matchAceFirst = (partiesToMatch: Party[], candidates: Member[]) => {
        let usedIds: string[] = [];
        partiesToMatch.forEach(p => {
            while (p.members.length < 4) {
                const ace = candidates.find(m => !usedIds.includes(m.id));
                if (!ace) break;
                p.members.push(ace);
                usedIds.push(ace.id);
            }
        });
        return usedIds;
    };

    // Weighted Random Fill (Balance) - Logic similar to before but iterates
    const matchPowerBalance = (partiesToMatch: Party[], candidates: Member[]) => {
        let usedIds: string[] = [];
        // Continue until all parties full or no candidates
        while (candidates.length > 0 && partiesToMatch.some(p => p.members.length < 4)) {
            const member = candidates.find(m => !usedIds.includes(m.id));
            if (!member) break;

            // Find target party with lowest power among those with space
            const availableParties = partiesToMatch.filter(p => p.members.length < 4);
            if (availableParties.length === 0) break;

            const targetParty = availableParties.reduce((prev, curr) => {
                const prevPower = prev.members.reduce((sum, m) => sum + m.power, 0);
                const currPower = curr.members.reduce((sum, m) => sum + m.power, 0);
                return prevPower <= currPower ? prev : curr;
            });

            targetParty.members.push(member);
            usedIds.push(member.id);
        }
        return usedIds;
    };

    const matchClassSynergy = (partiesToMatch: Party[], candidates: Member[]) => {
        let usedIds: string[] = [];
        // Synergy: Magic (Sorc/Spirit) vs Phys (Glad/Sin/Ranger)
        // Healers apply to both, but ideally Cleric for Magic, Chanter for Phys (heuristic)

        // Simple logic: If a party has Magic DPS, try to add more Magic DPS or Elementalist
        partiesToMatch.forEach(p => {
            const hasMagic = p.members.some(m => ['마도성', '정령성'].includes(m.class));
            const hasPhys = p.members.some(m => ['검성', '살성', '궁성'].includes(m.class));

            if (p.members.length < 4) {
                let type = hasMagic ? 'MAGIC' : (hasPhys ? 'PHYS' : 'ANY');
                // If empty, look at candidates provided? No, just pick one to define type logic? 
                // For now, prioritize filling with same type if established

                if (type === 'MAGIC') {
                    const mage = candidates.find(m => !usedIds.includes(m.id) && ['마도성', '정령성'].includes(m.class));
                    if (mage) {
                        p.members.push(mage);
                        usedIds.push(mage.id);
                    }
                } else if (type === 'PHYS') {
                    const phys = candidates.find(m => !usedIds.includes(m.id) && ['검성', '살성', '궁성'].includes(m.class));
                    if (phys) {
                        p.members.push(phys);
                        usedIds.push(phys.id);
                    }
                }
            }
        });
        return usedIds;
    };


    // --- V1 Algorithm Helpers ---
    const matchScarcityFill = (partiesToMatch: Party[], candidates: Member[]) => {
        const used: string[] = [];
        const sorted = [...candidates].sort((a, b) => {
            const countA = Object.values(a.availability || {}).flat().length;
            const countB = Object.values(b.availability || {}).flat().length;
            if (countA !== countB) return countA - countB;
            return b.power - a.power;
        });

        for (const p of partiesToMatch) {
            while (p.members.length < 4 && sorted.length > 0) {
                const m = sorted.shift()!;
                p.members.push(m);
                used.push(m.id);
            }
        }
        return used;
    };

    const matchMainTank = (partiesToMatch: Party[], candidates: Member[]) => {
        const used: string[] = [];
        const tanks = candidates.filter(m => ['수호성', '검성'].includes(m.class)).sort((a, b) => b.power - a.power);
        partiesToMatch.forEach(p => {
            if (p.members.some(m => ['수호성', '검성'].includes(m.class))) return;
            if (p.members.length < 4 && tanks.length > 0) {
                const t = tanks.shift()!;
                p.members.push(t);
                used.push(t.id);
            }
        });
        return used;
    };

    const matchResurrectionAnchor = (partiesToMatch: Party[], candidates: Member[]) => {
        const used: string[] = [];
        const clerics = candidates.filter(m => m.class === '치유성').sort((a, b) => b.power - a.power);
        partiesToMatch.forEach(p => {
            if (p.members.some(m => m.class === '치유성')) return;
            if (p.members.length < 4 && clerics.length > 0) {
                const c = clerics.shift()!;
                p.members.push(c);
                used.push(c.id);
            }
        });
        return used;
    };

    const matchSafetyOptimization = (partiesToMatch: Party[], candidates: Member[]) => {
        const used: string[] = [];
        const chanters = candidates.filter(m => m.class === '호법성').sort((a, b) => b.power - a.power);
        partiesToMatch.forEach(p => {
            if (p.members.length >= 4) return;
            const hasGladTank = p.members.some(m => m.class === '검성');
            const hasTemplar = p.members.some(m => m.class === '수호성');
            const hasChanter = p.members.some(m => m.class === '호법성');
            if (hasGladTank && !hasTemplar && !hasChanter && chanters.length > 0) {
                const ch = chanters.shift()!;
                p.members.push(ch);
                used.push(ch.id);
            }
        });
        return used;
    };

    const matchCombatLogic = (partiesToMatch: Party[], candidates: Member[]) => {
        const used: string[] = [];
        partiesToMatch.forEach(p => {
            if (p.members.length >= 4) return;
            const melees = p.members.filter(m => ['수호성', '검성', '살성', '호법성'].includes(m.class)).length;
            const ranges = p.members.filter(m => ['마도성', '정령성', '궁성'].includes(m.class)).length;
            let targetType = '';
            if (melees > ranges + 1) targetType = 'RANGE';
            else if (ranges > melees + 1) targetType = 'MELEE';
            else return;
            const poolCands = candidates.filter(m => !used.includes(m.id));
            let pick: Member | undefined;
            if (targetType === 'RANGE') {
                pick = poolCands.find(m => ['마도성', '정령성', '궁성'].includes(m.class));
            } else {
                pick = poolCands.find(m => ['수호성', '검성', '살성'].includes(m.class));
            }
            if (pick) {
                p.members.push(pick);
                used.push(pick.id);
                candidates = candidates.filter(c => c.id !== pick!.id);
            }
        });
        return used;
    };

    const matchAttendanceVolume = (partiesToMatch: Party[], candidates: Member[]) => {
        return matchPowerBalance(partiesToMatch, candidates);
    };


    const handleAutoMatch = () => {
        if (pool.length === 0) return alert('대기 멤버가 없습니다.');
        const { targetScope, matchType } = matchOptions;

        // 1. Prepare
        let workingPool = [...pool];
        let workingParties = [...parties];

        if (targetScope === 'RESHUFFLE') {
            // Empty all parties first
            workingParties.forEach(p => {
                p.members.forEach(m => workingPool.push(m));
                p.members = [];
                // p.assignedDay = undefined; // Keep settings? No, Reshuffle usually means full reset.
                // But let's keep assignedDay/Time if it was "Fixed" by user? 
                // For V3, let's clear settings for fresh start, or keep if locked?
                // Text says "Overall Reshuffle". Let's clear members but keep slot config if it exists?
                // Actually, V1 logic builds forces from scratch.
                // Here we fill existing Party slots.
            });
            // Dedup pool
            workingPool = Array.from(new Map(workingPool.map(m => [m.id, m])).values());
        }

        // Determine how many parties to make
        // If FIXED slots exist, use them. If not, calc based on pool size?
        // V3 UI shows 8 parties fixed. We just fill them.

        // Filter working pool based on TimeScope?
        // Logic handled inside per-force loop?
        // If TimeScope is CURRENT, we only use people available for SelectedSlot.
        // If ALL, we iterate slots?
        // Current V3 implementation iterates *Parties* (forces) and tries to assign Time to them if missing.

        // Let's follow existing structure:
        // Identify Forces -> Match for that Force

        const numForces = Math.ceil(workingParties.length / 2);
        const forces = Array.from({ length: numForces }, (_, i) => i);

        forces.forEach(forceIdx => {
            const p1 = workingParties[forceIdx * 2];
            const p2 = workingParties[forceIdx * 2 + 1];
            if (!p2) return;

            let forceDay = p1.assignedDay;
            let forceTime = p1.assignedTime;

            if (!forceDay || !forceTime) {
                if (matchType === 'DAY') {
                    const daysToTry = matchOptions.selectedDays;
                    if (daysToTry.length > 0) {
                        // Heuristic: Use first selected day or best among selected
                        if (daysToTry.includes(selectedDay)) {
                            forceDay = selectedDay;
                        } else {
                            forceDay = daysToTry[0];
                        }

                        if (selectedSlot) forceTime = selectedSlot;
                        else {
                            const allSlots = [...WEEKDAY_SLOTS, ...WEEKEND_SLOTS];
                            let bestSlot = null;
                            let maxCount = -1;
                            allSlots.forEach(s => {
                                const count = workingPool.filter(m => m.availability?.[forceDay!]?.includes(s.id)).length;
                                if (count > maxCount) { maxCount = count; bestSlot = s.id; }
                            });
                            forceTime = bestSlot || undefined;
                        }
                    }
                } else {
                    // Smart Pick (Best Slot for remaining pool)
                    // ... (Existing implementation kept) ...
                    let candidateSlots: { day: string, slot: string, score: number }[] = [];
                    const daysToScan = matchType === 'DAY' ? matchOptions.selectedDays : RAID_DAYS;
                    const allSlots = [...WEEKDAY_SLOTS, ...WEEKEND_SLOTS];

                    daysToScan.forEach(d => {
                        allSlots.forEach(s => {
                            const count = workingPool.filter(m => m.availability?.[d]?.includes(s.id)).length;
                            if (count >= 4) { // Min 4 to form something
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

            // 3. Filter Candidates for THIS Force
            let candidates = workingPool.filter(m => m.availability?.[forceDay!]?.includes(forceTime!));

            // 4. Run Algorithm Pipeline (User Ordered)
            const essentialCards = algoCards.filter(c => c.status === 'ESSENTIAL');
            const priorityCards = algoCards.filter(c => c.status === 'PRIORITY');

            const runAlgo = (card: AlgoCard) => {
                let used: string[] = [];
                const partiesToMatch = [p1, p2];

                switch (card.id) {
                    case 'fixed_group':
                        used = matchFixedParties(partiesToMatch, candidates, workingPool);
                        break;
                    case 'main_tank':
                        used = matchMainTank(partiesToMatch, candidates);
                        break;
                    case 'resurrection_anchor':
                        used = matchResurrectionAnchor(partiesToMatch, candidates);
                        break;
                    case 'tank_healer': // Legacy support if card id lingers
                        used = matchTankHealer(partiesToMatch, candidates);
                        break;
                    case 'scarcity_priority':
                        used = matchScarcityFill(partiesToMatch, candidates);
                        break;
                    case 'safety_optimization':
                        used = matchSafetyOptimization(partiesToMatch, candidates);
                        break;
                    case 'combat_logic':
                        used = matchCombatLogic(partiesToMatch, candidates);
                        break;
                    case 'power_balance':
                        used = matchPowerBalance(partiesToMatch, candidates);
                        break;
                    case 'attendance_volume':
                        used = matchAttendanceVolume(partiesToMatch, candidates);
                        break;
                    case 'ace_first': // Legacy
                        used = matchAceFirst(partiesToMatch, candidates);
                        break;
                }

                // Remove used candidates from local force list AND global working pool
                if (used.length > 0) {
                    candidates = candidates.filter(m => !used.includes(m.id));
                    workingPool = workingPool.filter(m => !used.includes(m.id));
                }
            };

            // Execute Essential First
            essentialCards.forEach(runAlgo);

            // Execute Priority Next
            priorityCards.forEach(runAlgo);

            // 5. Final Fallback (Always fill if empty)
            if (candidates.length > 0 && (p1.members.length < 4 || p2.members.length < 4)) {
                const leftovers = matchPowerBalance([p1, p2], candidates);
                if (leftovers.length > 0) {
                    workingPool = workingPool.filter(m => !leftovers.includes(m.id));
                }
            }
        });

        // Update State
        setParties([...workingParties]);
        setPool(workingPool);
        alert(`매칭 완료! (범위: ${matchType === 'DAY' ? '선택 요일' : '전체 일정'}, 방식: ${targetScope === 'RESHUFFLE' ? '전체 재분배' : '빈칸 채우기'})`);
    };

    const resetAll = () => {
        setParties(parties.map(p => ({ ...p, members: [] })));
        setPool(applications);
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

                    <PoolContainer
                        id="pool"
                        members={sortedPool}
                        fixedGroups={fixedGroups}
                        isReadOnly={selectedDay === 'ALL' || !selectedSlot}
                        onShowTooltip={handleShowTooltip}
                        onHideTooltip={handleHideTooltip}
                    />
                </div>

                {/* 2. Right: Party Canvas */}
                <div className="flex-1 flex flex-col min-w-0 bg-slate-50/50 dark:bg-slate-900/50 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                    <div className="p-4 border-b flex justify-between items-center bg-white/50 dark:bg-slate-800/50">
                        <h2 className="font-bold flex items-center gap-2"><Shield size={18} className="text-rose-500" /> 포스 구성 ({Math.ceil(parties.length / 2)})</h2>
                        <div className="flex items-center gap-2">
                            <button onClick={() => setIsAlgoSettingsModalOpen(true)} className="text-xs bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 px-3 py-1.5 rounded-lg font-bold shadow-sm transition-all flex items-center gap-1 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300">
                                <Settings2 size={14} /> 매칭 알고리즘 수정
                            </button>
                            <button onClick={() => setIsAutoMatchModalOpen(true)} className="text-xs bg-indigo-500 hover:bg-indigo-600 text-white px-3 py-1.5 rounded-lg font-bold shadow-lg shadow-indigo-500/20 transition-all transform hover:scale-105 flex items-center gap-1">
                                <Sparkles size={14} /> 자동 매칭 시작
                            </button>
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-6">
                        {Array.from({ length: Math.ceil(parties.length / 2) }).map((_, forceIndex) => {
                            const forceNumber = forceIndex + 1;
                            const party1 = parties[forceIndex * 2];
                            const party2 = parties[forceIndex * 2 + 1];

                            // Header Time Display (heuristic: use P1's time if set)
                            const forceDay = party1?.assignedDay;
                            const forceTime = party1?.assignedTime;

                            // Helper to get date string (MM/DD)
                            const getNextDate = (dayName: string) => {
                                const today = new Date();
                                const currentDay = today.getDay(); // 0(Sun) ~ 6(Sat)
                                const dayMap: Record<string, number> = { '일': 0, '월': 1, '화': 2, '수': 3, '목': 4, '금': 5, '토': 6 };
                                const targetDay = dayMap[dayName];

                                let diff = targetDay - currentDay;
                                if (diff < 0) diff += 7; // Next week if passed
                                // If today is the day, show today's date? Or next week? Assume today if same day.

                                const targetDate = new Date(today);
                                targetDate.setDate(today.getDate() + diff);
                                return `${targetDate.getMonth() + 1}/${targetDate.getDate()}`;
                            };

                            const forceTimeLabel = forceDay && forceTime
                                ? `${forceDay}(${getNextDate(forceDay)}) ${getSlotLabel(forceTime)}`
                                : "시간 미정";

                            return (
                                <div key={`force-${forceNumber}`} className="bg-white/40 dark:bg-slate-800/40 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 overflow-hidden">
                                    {/* Force Header */}
                                    <div className="px-4 py-2 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-100/50 dark:bg-slate-800/80">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-black text-slate-700 dark:text-slate-200">{forceNumber} 포스</span>
                                            {forceDay && forceTime && (
                                                <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded border border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-700 font-bold flex items-center gap-1">
                                                    <Clock size={10} /> {forceTimeLabel}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Parties Grid (2 items) */}
                                    <div className="p-4 grid grid-cols-2 gap-4">
                                        {party1 && <RaidPartySlot key={party1.id} party={party1} index={forceIndex * 2} fixedGroups={fixedGroups} />}
                                        {party2 && <RaidPartySlot key={party2.id} party={party2} index={forceIndex * 2 + 1} fixedGroups={fixedGroups} />}
                                    </div>
                                </div>
                            );
                        })}
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
                            {/* Match Type (Primary Range Selection) */}
                            <section>
                                <div className="mb-3">
                                    <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">매칭 대상 범위</h3>
                                </div>
                                <div className="grid grid-cols-1 gap-4">
                                    {/* 1. Global Match (All) */}
                                    <label className={cn(
                                        "flex items-start gap-4 p-4 rounded-2xl border-2 cursor-pointer transition-all hover:bg-slate-50 dark:hover:bg-slate-800",
                                        matchOptions.matchType === 'ALL' ? "border-indigo-500 bg-indigo-50/30 dark:bg-indigo-900/10" : "border-slate-100 dark:border-slate-800"
                                    )}>
                                        <input type="radio" name="matchType" className="mt-1 accent-indigo-500 w-4 h-4"
                                            checked={matchOptions.matchType === 'ALL'}
                                            onChange={() => setMatchOptions(o => ({ ...o, matchType: 'ALL' }))} />
                                        <div>
                                            <span className="font-bold text-sm block mb-1">전체 요일 매칭 (Global Match)</span>
                                            <p className="text-xs text-slate-500">모든 요일의 스케줄을 분석하여 가장 효율적인 시간대에 자동으로 배치합니다.</p>
                                        </div>
                                    </label>

                                    {/* 2. Selective Match (Day) */}
                                    <div className={cn(
                                        "flex flex-col p-4 rounded-2xl border-2 transition-all",
                                        matchOptions.matchType === 'DAY' ? "border-indigo-500 bg-indigo-50/30 dark:bg-indigo-900/10" : "border-slate-100 dark:border-slate-800"
                                    )}>
                                        <label className="flex items-start gap-4 cursor-pointer">
                                            <input type="radio" name="matchType" className="mt-1 accent-indigo-500 w-4 h-4"
                                                checked={matchOptions.matchType === 'DAY'}
                                                onChange={() => {
                                                    setMatchOptions(o => ({ ...o, matchType: 'DAY' }));
                                                    if (selectedDay === 'ALL') setSelectedDay('수'); // Default to Wed if none selected
                                                }} />
                                            <div className="flex-1">
                                                <span className="font-bold text-sm block mb-1">선택 요일 매칭 (Selective Match)</span>
                                                <p className="text-xs text-slate-500 mb-3">특정 요일을 선택하여 해당 날짜의 스케줄에 인원을 집중 배정합니다.</p>
                                            </div>
                                        </label>

                                        {/* Day Selector (Conditional) */}
                                        {matchOptions.matchType === 'DAY' && (
                                            <div className="mt-4 animate-in slide-in-from-top-2 duration-300">
                                                <div className="grid grid-cols-7 gap-1">
                                                    {RAID_DAYS.map((d) => {
                                                        const isSel = matchOptions.selectedDays.includes(d);
                                                        return (
                                                            <button
                                                                key={d}
                                                                onClick={() => {
                                                                    setMatchOptions(o => ({
                                                                        ...o,
                                                                        selectedDays: isSel
                                                                            ? o.selectedDays.filter(day => day !== d)
                                                                            : [...o.selectedDays, d]
                                                                    }));
                                                                }}
                                                                className={cn(
                                                                    "h-10 rounded-lg text-sm font-bold transition-all border",
                                                                    isSel
                                                                        ? "bg-indigo-600 border-indigo-600 text-white shadow-sm"
                                                                        : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 hover:border-indigo-300 hover:bg-slate-50 dark:hover:bg-slate-700"
                                                                )}
                                                            >
                                                                {d}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                                <div className="flex justify-end mt-2">
                                                    <button
                                                        onClick={() => {
                                                            const allSelected = matchOptions.selectedDays.length === RAID_DAYS.length;
                                                            setMatchOptions(o => ({ ...o, selectedDays: allSelected ? [] : [...RAID_DAYS] }));
                                                        }}
                                                        className="text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 flex items-center gap-1 transition-colors px-1"
                                                    >
                                                        {matchOptions.selectedDays.length === RAID_DAYS.length ? (
                                                            <><XCircle size={12} /> 전체 해제</>
                                                        ) : (
                                                            <><CheckCircle2 size={12} /> 전체 선택</>
                                                        )}
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
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
                    <div className="bg-white dark:bg-slate-900 w-full max-w-7xl rounded-2xl shadow-2xl overflow-hidden flex flex-col h-[80vh]">
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

                        <div className="flex-1 overflow-y-auto p-6 bg-slate-50 dark:bg-slate-900">
                            <DndContext
                                collisionDetection={closestCenter}
                                onDragStart={handleAlgoDragStart}
                                onDragOver={handleAlgoDragOver}
                                onDragEnd={handleAlgoDragEnd}
                            >
                                <div className="grid grid-cols-3 gap-6 h-full min-h-[400px]">
                                    {/* 1. Available Algorithms */}
                                    <div className="flex flex-col h-full">
                                        <div className="mb-3 flex items-center gap-2">
                                            <div className="w-2 h-8 bg-slate-400 rounded-full" />
                                            <div>
                                                <h3 className="font-bold text-slate-700 dark:text-slate-200">제공 알고리즘</h3>
                                                <p className="text-xs text-slate-400">사용 가능한 목록</p>
                                            </div>
                                        </div>
                                        <DroppableAlgoColumn id="AVAILABLE" items={algoCards.filter(c => c.status === 'AVAILABLE')}>
                                            {algoCards.filter(c => c.status === 'AVAILABLE').map((card) => (
                                                <SortableAlgoCard key={card.id} card={card} />
                                            ))}
                                        </DroppableAlgoColumn>
                                    </div>

                                    {/* 2. Essential Algorithms */}
                                    <div className="flex flex-col h-full">
                                        <div className="mb-3 flex items-center gap-2">
                                            <div className="w-2 h-8 bg-rose-500 rounded-full" />
                                            <div>
                                                <h3 className="font-bold text-slate-700 dark:text-slate-200">필수 알고리즘</h3>
                                                <p className="text-xs text-slate-400">무조건 반영됩니다. 조건이 많으면 파티 구성이 어려워질 수 있습니다.</p>
                                            </div>
                                        </div>
                                        <DroppableAlgoColumn id="ESSENTIAL" items={algoCards.filter(c => c.status === 'ESSENTIAL')}>
                                            {algoCards.filter(c => c.status === 'ESSENTIAL').map((card) => (
                                                <SortableAlgoCard key={card.id} card={card} />
                                            ))}
                                        </DroppableAlgoColumn>
                                    </div>

                                    {/* 3. Priority Algorithms */}
                                    <div className="flex flex-col h-full">
                                        <div className="mb-3 flex items-center gap-2">
                                            <div className="w-2 h-8 bg-indigo-500 rounded-full" />
                                            <div>
                                                <h3 className="font-bold text-slate-700 dark:text-slate-200">우선순위</h3>
                                                <p className="text-xs text-slate-400">남은 자리에 적용됩니다. 충돌 시 상위 알고리즘이 우선됩니다.</p>
                                            </div>
                                        </div>
                                        <DroppableAlgoColumn id="PRIORITY" items={algoCards.filter(c => c.status === 'PRIORITY')}>
                                            {algoCards.filter(c => c.status === 'PRIORITY').map((card) => (
                                                <SortableAlgoCard key={card.id} card={card} />
                                            ))}
                                        </DroppableAlgoColumn>
                                    </div>
                                </div>

                                {/* Drag Overlay */}
                                <DragOverlay>
                                    {activeAlgoId ? (
                                        <SortableAlgoCard
                                            card={algoCards.find(c => c.id === activeAlgoId)!}
                                            isOverlay
                                        />
                                    ) : null}
                                </DragOverlay>
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
                                                                    if (selectedGroup.memberIds.includes(member.id) || selectedGroup.memberIds.includes(member.name)) {
                                                                        alert("이미 이 팀에 추가된 멤버입니다.");
                                                                        e.currentTarget.value = '';
                                                                        return;
                                                                    }

                                                                    // 2. Check if already in ANOTHER group
                                                                    const otherGroup = fixedGroups.find(fg => fg.id !== selectedFixedGroupId && fg.memberIds.includes(member.id) || fg.memberIds.includes(member.name));

                                                                    if (otherGroup) {
                                                                        // Custom Modal for confirmation
                                                                        setConfirmationModal({
                                                                            isOpen: true,
                                                                            message: `'${member.name}'님은 이미 '${otherGroup.name}'에 속해있습니다.\n'${selectedGroup.name}'(으)로 이동하시겠습니까?`,
                                                                            onConfirm: () => {
                                                                                setFixedGroups(prev => prev.map(fg => {
                                                                                    if (fg.id === otherGroup.id) {
                                                                                        return { ...fg, memberIds: fg.memberIds.filter(id => id !== member.id && id !== member.name) };
                                                                                    }
                                                                                    if (fg.id === selectedFixedGroupId) {
                                                                                        return { ...fg, memberIds: [...fg.memberIds, member.name] };
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
                                                                                ? { ...fg, memberIds: [...fg.memberIds, member.name] }
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
                                                            const member = allMembers.find(m => m.id === mid || m.name === mid);
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

            {tooltipInfo && (
                <MemberDetailTooltip
                    member={tooltipInfo.member}
                    rect={tooltipInfo.rect}
                    fixedGroups={fixedGroups}
                    allMembers={allMembers}
                />
            )}
        </DndContext>
    );
}

// --- Sub Components ---

function DroppableAlgoColumn({ id, items, children }: { id: string, items: AlgoCard[], children: React.ReactNode }) {
    const { setNodeRef } = useDroppable({ id });

    let bgClass = "bg-slate-100 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700/50";
    if (id === 'ESSENTIAL') bgClass = "bg-rose-50/50 dark:bg-rose-900/10 border-rose-100 dark:border-rose-900/30";
    if (id === 'PRIORITY') bgClass = "bg-indigo-50/50 dark:bg-indigo-900/10 border-indigo-100 dark:border-indigo-900/30";

    return (
        <div ref={setNodeRef} className={cn("rounded-2xl p-3 flex-1 border h-full", bgClass)}>
            <SortableContext id={id} items={items} strategy={verticalListSortingStrategy}>
                <div className="space-y-3 min-h-[100px] h-full">
                    {children}
                </div>
            </SortableContext>
        </div>
    );
}

function SortableAlgoCard({ card, isOverlay = false }: { card: AlgoCard, isOverlay?: boolean }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 50 : 'auto',
        position: 'relative' as const,
        opacity: isDragging ? 0.3 : 1, // Dim original when dragging
    };

    if (isOverlay) {
        return (
            <div className={cn(
                "p-4 bg-white dark:bg-slate-800 border rounded-xl shadow-xl ring-2 ring-indigo-500/20 rotate-1 scale-105 z-50 cursor-grabbing",
                card.status === 'ESSENTIAL' && "border-l-4 border-l-rose-500",
                card.status === 'PRIORITY' && "border-l-4 border-l-indigo-500",
                card.status === 'AVAILABLE' && "border-l-4 border-l-slate-300"
            )}>
                <div className="flex justify-between items-start mb-2 pointer-events-none">
                    <span className="font-bold text-slate-700 dark:text-slate-200 text-sm">{card.label}</span>
                    <GripVertical size={16} className="text-slate-300" />
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-normal pointer-events-none">{card.desc}</p>
            </div>
        );
    }

    return (
        <div ref={setNodeRef} style={style} {...attributes} {...listeners} className={cn(
            "p-4 bg-white dark:bg-slate-800 border rounded-xl shadow-sm transition-all select-none group touch-none hover:shadow-md cursor-grab active:cursor-grabbing",
            "border-slate-200 dark:border-slate-700",
            card.status === 'ESSENTIAL' && "border-l-4 border-l-rose-500",
            card.status === 'PRIORITY' && "border-l-4 border-l-indigo-500",
            card.status === 'AVAILABLE' && "border-l-4 border-l-slate-300 opacity-80 hover:opacity-100"
        )}>
            <div className="flex justify-between items-start mb-2 pointer-events-none">
                <span className="font-bold text-slate-700 dark:text-slate-200 text-sm">{card.label}</span>
                <GripVertical size={16} className="text-slate-300" />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-normal pointer-events-none">{card.desc}</p>
        </div>
    );
}

function PoolContainer({ id, members, fixedGroups, isReadOnly, onShowTooltip, onHideTooltip }: { id: string, members: Member[], fixedGroups?: FixedGroup[], isReadOnly?: boolean, onShowTooltip: (m: Member, r: DOMRect) => void, onHideTooltip: () => void }) {
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
                    <DraggableMember
                        key={m.id}
                        member={m}
                        fixedGroups={fixedGroups}
                        isReadOnly={isReadOnly}
                        onShowTooltip={onShowTooltip}
                        onHideTooltip={onHideTooltip}
                    />
                ))
            )}
        </div>
    );
}

// Renamed to force HMR update
function RaidPartySlot({ party, fixedGroups, index }: { party: Party, fixedGroups?: FixedGroup[], index: number }) {
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
                    {/* Index Removed */}
                    <span className="font-bold text-slate-700 dark:text-slate-200">{party.name}</span>
                    <span className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded font-medium",
                        party.members.length === 4 ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-500"
                    )}>
                        {party.members.length}/4
                    </span>
                </div>

                <div className="flex items-center gap-1">
                    {/* Tanker Indicator */}
                    <div className={cn(
                        "w-6 h-6 rounded-full flex items-center justify-center border transition-all",
                        party.members.some(m => ['수호성', '검성'].includes(m.class))
                            ? "bg-blue-100 border-blue-200 text-blue-600 shadow-sm shadow-blue-100" // Active
                            : "bg-slate-50 border-slate-100 text-slate-300" // Inactive
                    )}>
                        <Shield size={14} strokeWidth={2.5} />
                    </div>

                    {/* Healer Indicator */}
                    <div className={cn(
                        "w-6 h-6 rounded-full flex items-center justify-center border transition-all",
                        party.members.some(m => ['치유성', '호법성'].includes(m.class))
                            ? "bg-green-100 border-green-200 text-green-600 shadow-sm shadow-green-100" // Active
                            : "bg-slate-50 border-slate-100 text-slate-300" // Inactive
                    )}>
                        <Plus size={14} strokeWidth={2.5} />
                    </div>
                </div>
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
        </div >
    );
}

function DraggableMember({ member, fixedGroups, isReadOnly, onShowTooltip, onHideTooltip }: { member: Member, fixedGroups?: FixedGroup[], isReadOnly?: boolean, onShowTooltip?: (m: Member, r: DOMRect) => void, onHideTooltip?: () => void }) {
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

    const handleMouseEnter = (e: React.MouseEvent) => {
        if (!onShowTooltip) return;
        const rect = e.currentTarget.getBoundingClientRect();
        onShowTooltip(member, rect);
    };

    const handleMouseLeave = () => {
        if (onHideTooltip) onHideTooltip();
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...listeners}
            {...attributes}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            className={cn(
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

function MemberDetailTooltip({ member, rect, fixedGroups, allMembers }: { member: Member, rect: DOMRect, fixedGroups?: FixedGroup[], allMembers: Member[] }) {
    // Calculate Position (Right of the element, centered vertically or aligned top)
    // Simple: Fixed position based on rect
    const style: React.CSSProperties = {
        position: 'fixed',
        top: rect.top,
        left: rect.right + 10,
        zIndex: 9999,
    };

    // Find Fixed Group Members (Match by ID or Name for robustness)
    const fixedGroup = member.fixedGroupId ? fixedGroups?.find(g => g.id === member.fixedGroupId) : null;
    const groupMembers = fixedGroup ? allMembers.filter(m => (fixedGroup.memberIds.includes(m.id) || fixedGroup.memberIds.includes(m.name)) && m.id !== member.id) : [];

    return (
        <div style={style} className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 p-4 w-[280px] animate-in slide-in-from-left-2 duration-200">
            {/* Header */}
            <div className="flex items-center gap-3 mb-3 pb-3 border-b border-slate-100 dark:border-slate-700">
                <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center font-bold text-lg text-white shadow-sm", getClassColor(member.class))}>
                    {member.class[0]}
                </div>
                <div>
                    <h3 className="font-bold text-slate-900 dark:text-white">{member.name}</h3>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span>{member.class}</span>
                        <span>•</span>
                        <span className="font-bold text-indigo-600 dark:text-indigo-400">{member.power.toLocaleString()} 전투력</span>
                    </div>
                </div>
            </div>

            {/* Availability */}
            <div className="mb-4">
                <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">참여 가능 시간</h4>
                <div className="space-y-2">
                    {['수', '목', '금', '토', '일', '월', '화'].map(day => {
                        const slots = member.availability?.[day] || [];
                        if (slots.length === 0) return null;

                        // Sort slots numerically (assuming IDs like "13", "14")
                        const sortedSlots = [...slots].sort((a, b) => parseInt(a) - parseInt(b));

                        return (
                            <div key={day} className="flex items-start text-xs border-b border-slate-50 dark:border-slate-700/50 pb-1.5 last:border-0 last:pb-0">
                                <span className="w-6 font-bold text-slate-500 dark:text-slate-400 flex-shrink-0 mt-0.5">{day}</span>
                                <div className="flex flex-wrap gap-1 flex-1">
                                    {sortedSlots.map(t => {
                                        const slotLabel = [...WEEKDAY_SLOTS, ...WEEKEND_SLOTS].find(s => s.id === t)?.label || t;
                                        // Remove "오후 " for brevity if desired, or keep it. User asked "13시" style. 
                                        // The labels are "오후 6:30". Let's convert or use just the time part if possible, or mapping.
                                        // Constants: { id: 'wd1', label: '오후 6:30' }
                                        // If user wants "13시", I might need a custom mapping or just show the label.
                                        // "wd1시" was because `t` was "wd1".
                                        // Let's use the label but strips "오후 " to save space or just use the label.
                                        return (
                                            <span key={`${day}-${t}`} className="px-1.5 py-0.5 bg-indigo-50 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 rounded text-[10px] font-medium border border-indigo-100 dark:border-indigo-800">
                                                {slotLabel}
                                            </span>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                    {!['수', '목', '금', '토', '일', '월', '화'].some(d => (member.availability?.[d]?.length || 0) > 0) && (
                        <p className="text-xs text-slate-400 text-center py-2">신청한 시간이 없습니다.</p>
                    )}
                </div>
            </div>

            {/* Fixed Group Info */}
            {fixedGroup && (
                <div>
                    <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center justify-between">
                        <span>고정 파티 ({fixedGroup.name})</span>
                        <div className={cn("w-2 h-2 rounded-full", fixedGroup.color)} />
                    </h4>
                    <div className="space-y-1.5 bg-slate-50 dark:bg-slate-800/50 rounded-lg p-2">
                        {groupMembers.length > 0 ? groupMembers.map((gm, idx) => (
                            <div key={`${gm.id}-${idx}`} className="flex justify-between items-center text-xs">
                                <div className="flex items-center gap-2">
                                    <span className={cn("w-1.5 h-1.5 rounded-full", getClassColor(gm.class).split(' ')[0])} />
                                    <span className="text-slate-600 dark:text-slate-300 font-medium">{gm.name}</span>
                                </div>
                                <span className="text-slate-400 text-[10px]">{gm.class}</span>
                            </div>
                        )) : (
                            <p className="text-[10px] text-slate-400 text-center py-2">다른 멤버 없음</p>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
