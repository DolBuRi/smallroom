'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
    Calendar, Users, Clock, CheckCircle, AlertCircle, Sparkles,
    Zap, Info, HelpCircle, Shield, Heart, Sword,
    Trash2, X, ClipboardList, ChevronRight, Layers, Target, Activity,
    LayoutGrid, List as ListIcon, PieChart, ChevronDown, ChevronUp,
    Grid3X3
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { db } from '@/lib/firebase';
import { ref, onValue, set, remove } from 'firebase/database';
import { useAuth } from '@/context/AuthContext';

// --- Interfaces ---
interface RaidApplication {
    id: string;
    nickname: string;
    class: string;
    power: number;
    availability: {
        [key: string]: string[];
    };
    updatedAt: string;
}

interface MatchingForce {
    id: string;
    day: string;
    timeLabel: string;
    party1: RaidApplication[];
    party2: RaidApplication[];
    isOptimal: boolean;
    isReserve?: boolean;
}

// Order: Wed -> Tue (AION Raid Week)
const DAYS = ['수', '목', '금', '토', '일', '월', '화'];

// Unified Time Rows for the Heatmap
// Weekend has extra 2 slots (14:00, 16:00). Others start from 18:30.
const TIME_ROWS = [
    { label: '오후 2:00 ~ 4:00', isWeekendOnly: true, wkId: 'we1' },
    { label: '오후 4:00 ~ 6:00', isWeekendOnly: true, wkId: 'we2' },
    { label: '오후 6:30 ~ 8:30', isWeekendOnly: false, wkId: 'we3', wdId: 'wd1' },
    { label: '오후 8:30 ~ 10:30', isWeekendOnly: false, wkId: 'we4', wdId: 'wd2' },
    { label: '오후 10:30 ~ 12:30', isWeekendOnly: false, wkId: 'we5', wdId: 'wd3' },
];

const SLOTS = {
    '평일': [
        { id: 'wd1', label: '오후 6:30 ~ 8:30' },
        { id: 'wd2', label: '오후 8:30 ~ 10:30' },
        { id: 'wd3', label: '오후 10:30 ~ 12:30' }
    ],
    '주말': [
        { id: 'we1', label: '오후 2:00 ~ 4:00' },
        { id: 'we2', label: '오후 4:00 ~ 6:00' },
        { id: 'we3', label: '오후 6:30 ~ 8:30' },
        { id: 'we4', label: '오후 8:30 ~ 10:30' },
        { id: 'we5', label: '오후 10:30 ~ 12:30' }
    ]
};

// --- Helper Components ---

const ClassIcon = ({ className }: { className: string }) => {
    let color = "bg-slate-400 text-white";
    if (['수호성', '검성'].includes(className)) color = "bg-rose-500 text-white";
    if (['치유성', '호법성'].includes(className)) color = "bg-emerald-500 text-white";
    if (['마도성', '정령성'].includes(className)) color = "bg-indigo-500 text-white";
    if (['살성', '궁성'].includes(className)) color = "bg-amber-500 text-white";

    return (
        <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center font-black text-xs shadow-sm shrink-0", color)}>
            {className.charAt(0)}
        </div>
    );
};

const MemberCard = ({ member, compact = false }: { member: RaidApplication, compact?: boolean }) => (
    <div className={cn(
        "flex items-center justify-between bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700/50 rounded-lg shadow-sm transition-all hover:shadow-md",
        compact ? "p-2 px-3" : "p-3 px-4"
    )}>
        <div className="flex items-center gap-3">
            <ClassIcon className={member.class} />
            <div className="flex flex-col">
                <span className={cn("font-bold text-slate-700 dark:text-slate-200 leading-none", compact ? "text-xs" : "text-sm")}>
                    {member.nickname}
                </span>
                {!compact && <span className="text-[10px] text-slate-400 mt-0.5">{member.class}</span>}
            </div>
        </div>
        <div className="text-right">
            <span className={cn("font-black text-slate-900 dark:text-slate-100", compact ? "text-xs" : "text-sm")}>
                {member.power.toLocaleString()}
            </span>
            {!compact && <span className="text-[10px] text-slate-400 block -mt-0.5">CP</span>}
        </div>
    </div>
);

// --- Heatmap Components ---

const HeatmapCell = ({
    day,
    timeLabel,
    slotId,
    apps,
    onClick
}: {
    day: string,
    timeLabel: string,
    slotId: string | null,
    apps: RaidApplication[],
    onClick: () => void
}) => {
    if (!slotId) {
        return <div className="bg-slate-50/50 dark:bg-slate-900/20 border border-slate-100 dark:border-slate-800 rounded-lg h-full min-h-[80px]" />;
    }

    const totalCount = apps.length;
    // const tanks = apps.filter(a => ['수호성', '검성'].includes(a.class)).length;
    // const clerics = apps.filter(a => ['치유성'].includes(a.class)).length;
    // Simplified State logic for cell visual
    // Green: 8+ (Just volume for quick glance? OR Strict Safety?)
    // User asked "Party Window" style -> "Where is empty?"
    // Let's stick strictly to strict logic for color:
    // Green = 1 Force OK. Yellow = 8ppl but imperfect. Red = <8.

    const tanks = apps.filter(a => ['수호성', '검성'].includes(a.class)).length;
    const clerics = apps.filter(a => ['치유성'].includes(a.class)).length;
    const isPossible = totalCount >= 8 && tanks >= 1 && clerics >= 2;

    let statusColor = "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400"; // Empty/Red
    if (totalCount > 0) {
        if (isPossible) {
            statusColor = "bg-emerald-500 border-emerald-600 text-white shadow-emerald-200 shadow-sm";
        } else if (totalCount >= 8) {
            statusColor = "bg-amber-400 border-amber-500 text-white shadow-amber-100 shadow-sm";
        } else {
            statusColor = "bg-white dark:bg-slate-800 border-rose-200 dark:border-rose-900/50 text-rose-500 shadow-sm";
        }
    }

    // Missing text for quick scan
    let missingText = null;
    if (totalCount >= 8 && !isPossible) {
        if (clerics < 2) missingText = "치유↓";
        else if (tanks < 1) missingText = "탱커↓";
    }

    return (
        <div
            onClick={onClick}
            className={cn(
                "relative rounded-xl border-2 flex flex-col items-center justify-center p-2 min-h-[80px] transition-all cursor-pointer hover:scale-95 active:scale-90",
                statusColor
            )}
        >
            {/* Count Badge */}
            <div className="text-xl font-black leading-none mb-1">
                {totalCount}<span className="text-xs opacity-60 font-bold">/8</span>
            </div>

            {/* Alert Tag */}
            {missingText && (
                <div className="bg-black/20 text-white text-[10px] px-1.5 py-0.5 rounded font-bold">
                    {missingText}
                </div>
            )}

            {/* If perfect */}
            {isPossible && (
                <div className="flex gap-0.5 mt-1">
                    {[...Array(Math.min(3, Math.floor(totalCount / 8)))].map((_, i) => (
                        <div key={i} className="w-1.5 h-1.5 rounded-full bg-white" />
                    ))}
                </div>
            )}
        </div>
    );
};


// --- Modal for Slot Details ---
const SlotDetailModal = ({
    isOpen,
    onClose,
    day,
    timeLabel,
    apps
}: {
    isOpen: boolean,
    onClose: () => void,
    day: string,
    timeLabel: string,
    apps: RaidApplication[]
}) => {
    if (!isOpen) return null;

    const tanks = apps.filter(a => ['수호성', '검성'].includes(a.class));
    const clerics = apps.filter(a => ['치유성'].includes(a.class)); // Pure Clerics
    const dps = apps.filter(a => !['수호성', '검성', '치유성'].includes(a.class));

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700/50 rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[80vh]">
                <div className="flex justify-between items-center p-6 border-b border-slate-100 dark:border-slate-700/50 shrink-0 bg-slate-50/50 dark:bg-slate-800">
                    <div>
                        <h3 className="text-xl font-black text-slate-800 dark:text-white flex items-center gap-2">
                            {day}요일 상세 명단
                        </h3>
                        <p className="text-sm font-bold text-slate-400 dark:text-slate-500">{timeLabel}</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors text-slate-400">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto custom-scrollbar space-y-6">
                    {/* Stats Summary */}
                    <div className="grid grid-cols-3 gap-3">
                        <div className="bg-slate-50 dark:bg-slate-700/30 rounded-xl p-3 text-center border border-slate-100 dark:border-slate-700/50">
                            <span className="block text-xs font-bold text-slate-400 mb-1">전체</span>
                            <span className="text-2xl font-black text-slate-700 dark:text-slate-200">{apps.length}</span>
                        </div>
                        <div className={cn("rounded-xl p-3 text-center border", tanks.length >= 1 ? "bg-emerald-50 border-emerald-100 text-emerald-700" : "bg-rose-50 border-rose-100 text-rose-700")}>
                            <span className="block text-xs font-bold opacity-70 mb-1">🛡️ 탱커</span>
                            <span className="text-2xl font-black">{tanks.length}</span>
                        </div>
                        <div className={cn("rounded-xl p-3 text-center border", clerics.length >= 2 ? "bg-emerald-50 border-emerald-100 text-emerald-700" : "bg-rose-50 border-rose-100 text-rose-700")}>
                            <span className="block text-xs font-bold opacity-70 mb-1">💚 치유</span>
                            <span className="text-2xl font-black">{clerics.length}</span>
                        </div>
                    </div>

                    {/* Lists */}
                    {apps.length > 0 ? (
                        <div className="space-y-4">
                            {tanks.length > 0 && (
                                <div>
                                    <h4 className="text-xs font-black text-slate-400 mb-2 uppercase tracking-wider">Tanks</h4>
                                    <div className="space-y-2">
                                        {tanks.map(m => <MemberCard key={m.id} member={m} compact />)}
                                    </div>
                                </div>
                            )}
                            {clerics.length > 0 && (
                                <div>
                                    <h4 className="text-xs font-black text-slate-400 mb-2 uppercase tracking-wider">Healers</h4>
                                    <div className="space-y-2">
                                        {clerics.map(m => <MemberCard key={m.id} member={m} compact />)}
                                    </div>
                                </div>
                            )}
                            {dps.length > 0 && (
                                <div>
                                    <h4 className="text-xs font-black text-slate-400 mb-2 uppercase tracking-wider">DPS</h4>
                                    <div className="space-y-2">
                                        {dps.map(m => <MemberCard key={m.id} member={m} compact />)}
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="text-center py-10 text-slate-300 font-bold">
                            신청자가 없습니다.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};


// --- Main Component ---

export default function RaidManagerV2() {
    const { isAdmin } = useAuth();
    const [applications, setApplications] = useState<RaidApplication[]>([]);
    const [matchedForces, setMatchedForces] = useState<MatchingForce[]>([]);
    const [unassignedMembers, setUnassignedMembers] = useState<RaidApplication[]>([]); // Waiting list

    // Modal State
    const [detailModalOpen, setDetailModalOpen] = useState(false);
    const [selectedSlotData, setSelectedSlotData] = useState<{ day: string, time: string, apps: RaidApplication[] } | null>(null);

    // Initial Data Sync
    useEffect(() => {
        const unsubscribeApps = onValue(ref(db, 'raid_applications'), (snapshot) => {
            const data = snapshot.val();
            setApplications(data ? Object.values(data) : []);
        });

        const unsubscribeForces = onValue(ref(db, 'raid_matched_forces'), (snapshot) => {
            const data = snapshot.val();
            setMatchedForces(data || []);
        });

        const unsubscribeUnassigned = onValue(ref(db, 'raid_unassigned_members'), (snapshot) => {
            const data = snapshot.val();
            setUnassignedMembers(data || []);
        });

        return () => {
            unsubscribeApps();
            unsubscribeForces();
            unsubscribeUnassigned();
        };
    }, []);

    const openSlotDetail = (day: string, timeLabel: string, apps: RaidApplication[]) => {
        setSelectedSlotData({ day, time: timeLabel, apps });
        setDetailModalOpen(true);
    };

    const handleAutoMatch = () => {
        if (!isAdmin) return alert("관리자만 매칭을 실행할 수 있습니다.");
        alert("현재 Heatmap 모드에서는 [자동 매칭] 기능이 비활성화 되어 있습니다.\n(기존 로직 이식 필요 시 요청해주세요)");
    };

    // Dummy Data Generator (Preserved)
    const generateDummyData = async () => {
        if (!isAdmin) return;
        if (!confirm("테스트용 더미 데이터 100개를 생성하시겠습니까?")) return;
        const classes = ['수호성', '검성', '살성', '궁성', '마도성', '정령성', '치유성', '호법성'];
        const slots平日 = ['wd1', 'wd2', 'wd3'];
        const slots週末 = ['we1', 'we2', 'we3', 'we4', 'we5'];
        const dummyData: Record<string, any> = {};
        for (let i = 1; i <= 100; i++) {
            const id = `dummy_${Date.now()}_${i}`;
            const cls = classes[Math.floor(Math.random() * classes.length)];
            const power = Math.floor(Math.random() * (5500 - 1500) + 1500);
            const availability: Record<string, string[]> = { '월': [], '화': [], '수': [], '목': [], '금': [], '토': [], '일': [] };
            const pattern = Math.random();
            if (pattern < 0.3) {
                ['월', '화', '수', '목', '금'].forEach(d => availability[d] = [...slots平日]);
                ['토', '일'].forEach(d => availability[d] = [...slots週末]);
            } else if (pattern < 0.6) {
                ['월', '화', '수', '목', '금'].forEach(d => { if (Math.random() > 0.3) availability[d] = ['wd2', 'wd3']; });
            } else {
                ['토', '일'].forEach(d => { if (Math.random() > 0.2) availability[d] = slots週末.filter(() => Math.random() > 0.4); });
            }
            dummyData[id] = { id, nickname: `TestUser${i}`, class: cls, power, availability, updatedAt: new Date().toISOString() };
        }
        await set(ref(db, 'raid_applications'), dummyData);
        alert("완료");
    };

    const handleResetAll = async () => {
        if (!isAdmin) return alert("관리자 권한이 필요합니다.");
        if (!confirm("모든 데이터를 초기화하시겠습니까?")) return;
        await remove(ref(db, 'raid_applications'));
        await remove(ref(db, 'raid_matched_forces'));
        await remove(ref(db, 'raid_unassigned_members'));
        alert("초기화 완료");
    };

    return (
        <div className="space-y-6 pb-20 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div>
                    <h2 className="text-4xl font-black text-slate-900 dark:text-white flex items-center gap-3 tracking-tight">
                        <Grid3X3 className="text-indigo-500 dark:text-indigo-400" size={32} />
                        성역 파티 도우미 VER2
                    </h2>
                    <p className="text-slate-500 dark:text-slate-300 text-sm font-medium mt-2 flex items-center gap-2">
                        주간 신청 현황을 한눈에 확인하세요.
                    </p>
                </div>
                <div className="flex gap-2">
                    {isAdmin && (
                        <button onClick={generateDummyData} className="px-4 py-2 bg-indigo-50 text-indigo-500 rounded-xl text-xs font-black">
                            [Test] 더미
                        </button>
                    )}
                    <button onClick={handleResetAll} className="px-4 py-2 bg-slate-50 text-slate-400 rounded-xl text-xs font-black">
                        초기화
                    </button>
                </div>
            </div>

            {/* HEATMAP GRID */}
            <div className="bg-white dark:bg-slate-900 rounded-[2rem] shadow-sm border border-slate-100 dark:border-slate-800 p-6 overflow-x-auto">
                <div className="min-w-[800px]">
                    {/* Header Row */}
                    <div className="grid grid-cols-[100px_repeat(7,1fr)] gap-2 mb-2">
                        <div className="flex items-end justify-center pb-2">
                            <span className="text-xs font-bold text-slate-400">TIME</span>
                        </div>
                        {DAYS.map(day => {
                            const isToday = day === ['일', '월', '화', '수', '목', '금', '토'][new Date().getDay()];
                            return (
                                <div key={day} className={cn("text-center pb-2 border-b-2", isToday ? "border-indigo-500 text-indigo-600" : "border-transparent text-slate-500")}>
                                    <span className={cn("text-sm font-black", isToday && "text-indigo-600")}>{day}요일</span>
                                </div>
                            );
                        })}
                    </div>

                    {/* Time Rows */}
                    <div className="space-y-2">
                        {TIME_ROWS.map((row, rowIdx) => (
                            <div key={rowIdx} className="grid grid-cols-[100px_repeat(7,1fr)] gap-2">
                                {/* Time Label */}
                                <div className="flex items-center justify-end pr-4 text-xs font-bold text-slate-400">
                                    {row.label.split(' ~ ')[0].replace('오후 ', '')}
                                </div>

                                {/* Cells for each Day */}
                                {DAYS.map(day => {
                                    const isWknd = ['토', '일'].includes(day);
                                    let slotId = null;

                                    if (isWknd) {
                                        slotId = row.wkId; // Use Weekend ID
                                    } else {
                                        if (!row.isWeekendOnly && row.wdId) {
                                            slotId = row.wdId; // Use Weekday ID (only for rows 3-5)
                                        }
                                    }

                                    // Get Apps for this slot
                                    const slotApps = slotId
                                        ? applications.filter(app => app.availability?.[day]?.includes(slotId!))
                                        : [];

                                    return (
                                        <HeatmapCell
                                            key={`${day}-${rowIdx}`}
                                            day={day}
                                            timeLabel={row.label}
                                            slotId={slotId}
                                            apps={slotApps}
                                            onClick={() => slotId && openSlotDetail(day, row.label, slotApps)}
                                        />
                                    );
                                })}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* STATUS BOARD (SUMMARY TABLE) */}
            <div className="bg-white dark:bg-slate-900 rounded-[2rem] shadow-sm border border-slate-100 dark:border-slate-800 p-8 overflow-x-auto mt-8">
                <div className="flex items-center gap-3 mb-6">
                    <ListIcon className="text-slate-400" size={24} />
                    <h3 className="text-xl font-black text-slate-800 dark:text-white">주간 매칭 현황판</h3>
                </div>

                <div className="min-w-[1000px]">
                    {/* Header */}
                    <div className="grid grid-cols-[120px_repeat(7,1fr)] gap-4 mb-4 border-b border-slate-100 dark:border-slate-800 pb-4">
                        <div className="font-bold text-slate-400 text-sm text-center">시간대</div>
                        {DAYS.map(day => (
                            <div key={day} className="text-center font-black text-slate-700 dark:text-slate-300">{day}요일</div>
                        ))}
                    </div>

                    {/* Rows */}
                    <div className="space-y-6">
                        {TIME_ROWS.map((row, rowIdx) => (
                            <div key={rowIdx} className="grid grid-cols-[120px_repeat(7,1fr)] gap-4 items-start border-b border-slate-50 dark:border-slate-800/50 pb-6 last:border-0">
                                {/* Time Label */}
                                <div className="flex flex-col items-center justify-center h-full pt-2">
                                    <span className="font-black text-slate-600 dark:text-slate-400 text-sm bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-full whitespace-nowrap">
                                        {row.label.split(' ~ ')[0]}
                                    </span>
                                </div>

                                {/* Cells */}
                                {DAYS.map(day => {
                                    const isWknd = ['토', '일'].includes(day);
                                    let slotId = null;
                                    if (isWknd) slotId = row.wkId;
                                    else if (!row.isWeekendOnly && row.wdId) slotId = row.wdId;

                                    if (!slotId) return <div key={day} className="bg-slate-50/30 dark:bg-slate-900/10 rounded-xl h-24" />;

                                    const slotApps = applications.filter(app => app.availability?.[day]?.includes(slotId!));

                                    // Sorting: Tank -> Heal -> DPS
                                    const sortedApps = [...slotApps].sort((a, b) => {
                                        const roleOrder = { '수호성': 0, '검성': 1, '치유성': 2, '호법성': 3, '살성': 4, '궁성': 5, '마도성': 6, '정령성': 7 };
                                        // @ts-ignore
                                        return (roleOrder[a.class] || 99) - (roleOrder[b.class] || 99);
                                    });

                                    const isComplete = slotApps.length >= 8;

                                    return (
                                        <div key={day} className={cn("min-h-[100px] rounded-xl p-3 text-xs transition-colors", slotApps.length > 0 ? "bg-slate-50 dark:bg-slate-800/50" : "bg-transparent")}>
                                            {/* Header Count */}
                                            {slotApps.length > 0 && (
                                                <div className="flex justify-between items-center mb-2 pb-1 border-b border-slate-200 dark:border-slate-700">
                                                    <span className="font-bold text-slate-400">인원</span>
                                                    <span className={cn("font-black", isComplete ? "text-indigo-600" : "text-slate-600")}>
                                                        {slotApps.length}명
                                                    </span>
                                                </div>
                                            )}

                                            {/* Name List */}
                                            <div className="space-y-1">
                                                {sortedApps.map(app => {
                                                    let colorClass = "text-slate-600 dark:text-slate-400";
                                                    if (['수호성', '검성'].includes(app.class)) colorClass = "text-rose-500 font-bold";
                                                    if (['치유성'].includes(app.class)) colorClass = "text-emerald-500 font-bold";

                                                    return (
                                                        <div key={app.id} className="flex justify-between items-center">
                                                            <span className={cn("truncate max-w-[70px]", colorClass)}>{app.nickname}</span>
                                                            <span className="text-[9px] text-slate-300">{app.class.charAt(0)}</span>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <SlotDetailModal
                isOpen={detailModalOpen}
                onClose={() => setDetailModalOpen(false)}
                day={selectedSlotData?.day || ''}
                timeLabel={selectedSlotData?.time || ''}
                apps={selectedSlotData?.apps || []}
            />

        </div>
    );
}
