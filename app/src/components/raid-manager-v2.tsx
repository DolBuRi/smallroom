'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
    Calendar, Users, Clock, CheckCircle, AlertCircle, Sparkles,
    Zap, Info, Grid3X3, List as ListIcon, X, LayoutGrid, ClipboardList, Sword, Link
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { db } from '@/lib/firebase';
import { ref, onValue, set, remove } from 'firebase/database';
import { useAuth } from '@/context/AuthContext';
import { useAppMode } from '@/context/ModeContext';

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
    fixedGroupId?: string;
}

interface FixedGroup {
    id: string;
    name: string;
    color: string;
    memberIds: string[];
}

// Order: Wed -> Tue (AION Raid Week)
const DAYS = ['수', '목', '금', '토', '일', '월', '화'];

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

// Unified Time Rows
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

// --- Helper Functions ---
const getDayDate = (dayString: string) => {
    const today = new Date();
    const currentDay = today.getDay(); // Sun=0 ...
    const distToWed = (currentDay + 4) % 7;
    const wednesday = new Date(today);
    wednesday.setDate(today.getDate() - distToWed);
    const targetIndex = DAYS.indexOf(dayString);
    if (targetIndex === -1) return '';
    const targetDate = new Date(wednesday);
    targetDate.setDate(wednesday.getDate() + targetIndex);
    return `${targetDate.getMonth() + 1}/${targetDate.getDate()}`;
};

// Unified Class Color Mapping
const getClassColor = (className: string) => {
    switch (className) {
        case '수호성': return "bg-indigo-900 text-white"; // Navy
        case '검성': return "bg-sky-400 text-white";   // Sky Blue
        case '궁성': return "bg-emerald-700 text-emerald-50"; // Dark Green
        case '살성': return "bg-lime-400 text-slate-900";   // Light Green
        case '호법성': return "bg-orange-500 text-white"; // Orange
        case '치유성': return "bg-yellow-400 text-slate-900"; // Yellow
        case '마도성': return "bg-purple-600 text-white"; // Purple
        case '정령성': return "bg-violet-300 text-slate-900"; // Light Purple
        default: return "bg-slate-400 text-white";
    }
};

const COLOR_MAP_TEXT: Record<string, string> = {
    'bg-slate-500': 'text-slate-500',
    'bg-red-500': 'text-red-500',
    'bg-orange-500': 'text-orange-500',
    'bg-amber-500': 'text-amber-500',
    'bg-yellow-500': 'text-yellow-500',
    'bg-lime-500': 'text-lime-500',
    'bg-green-500': 'text-green-500',
    'bg-emerald-500': 'text-emerald-500',
    'bg-teal-500': 'text-teal-500',
    'bg-cyan-500': 'text-cyan-500',
    'bg-sky-500': 'text-sky-500',
    'bg-blue-500': 'text-blue-500',
    'bg-indigo-500': 'text-indigo-500',
    'bg-violet-500': 'text-violet-500',
    'bg-purple-500': 'text-purple-500',
    'bg-fuchsia-500': 'text-fuchsia-500',
    'bg-pink-500': 'text-pink-500',
    'bg-rose-500': 'text-rose-500'
};

// --- Helper Components ---

const ClassIcon = ({ className }: { className: string }) => {
    return (
        <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center font-black text-xs shadow-sm shrink-0", getClassColor(className))}>
            {className.charAt(0)}
        </div>
    );
};

const MemberCard = ({ member, compact = false, onShowTooltip, onHideTooltip, fixedGroups = [], roster = [] }: { member: RaidApplication, compact?: boolean, onShowTooltip: (m: RaidApplication, r: DOMRect) => void, onHideTooltip: () => void, fixedGroups?: FixedGroup[], roster?: any[] }) => {
    const normalize = (s: any) => String(s || '').trim().replace(/\s/g, '').toLowerCase();

    // Find matching roster member
    const rosterMember = roster.find(m => normalize(m.name) === normalize(member.nickname) || m.id === member.id);
    const mId = rosterMember?.id;
    const mName = rosterMember?.name || member.nickname;

    // Find if in any group
    const fixedGroup = fixedGroups.find(g => {
        const ids = Array.isArray(g.memberIds) ? g.memberIds : (g.memberIds ? Object.values(g.memberIds) : []);
        return ids.some((id: any) => {
            const sid = normalize(id);
            if (!sid) return false;
            return sid === normalize(mId) || sid === normalize(mName) || sid === normalize(member.id) || sid === normalize(member.nickname);
        });
    });

    return (
        <div
            onMouseEnter={(e) => onShowTooltip(member, e.currentTarget.getBoundingClientRect())}
            onMouseLeave={onHideTooltip}
            className={cn(
                "flex items-center justify-between bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700/50 rounded-lg shadow-sm transition-all hover:shadow-md cursor-default",
                compact ? "p-2 px-3" : "p-3 px-4"
            )}
        >
            <div className="flex items-center gap-3">
                <ClassIcon className={member.class} />
                <div className="flex flex-col">
                    <span className={cn("font-bold text-slate-700 dark:text-slate-200 leading-none truncate", compact ? "text-xs" : "text-sm")}>
                        {member.nickname}
                    </span>
                    {!compact && <span className="text-[10px] text-slate-400 mt-0.5">{member.class}</span>}
                </div>
            </div>

            <div className="flex items-center gap-2">
                {fixedGroup && (
                    <span title={fixedGroup.name}>
                        <Link size={10} className={cn("rotate-45 shrink-0", COLOR_MAP_TEXT[fixedGroup.color] || 'text-slate-400')} strokeWidth={3} />
                    </span>
                )}
                <div className="text-right">
                    <span className={cn("font-black text-slate-900 dark:text-slate-100", compact ? "text-xs" : "text-sm")}>
                        {member.power.toLocaleString()}
                    </span>
                    {!compact && <span className="text-[10px] text-slate-400 block -mt-0.5">전투력</span>}
                </div>
            </div>
        </div>
    );
};

function MemberDetailTooltip({ member, rect, fixedGroups = [], roster = [], subCharacters = [], isAdmin = false, mode = 'legion' }: { member: RaidApplication, rect: DOMRect, fixedGroups?: FixedGroup[], roster?: any[], subCharacters?: any[], isAdmin?: boolean, mode?: 'legion' | 'fixed' }) {
    const normalize = (s: any) => String(s || '').trim().replace(/\s/g, '').toLowerCase();

    // Find matching roster member
    const rosterMember = roster.find(m => normalize(m.name) === normalize(member.nickname) || m.id === member.id);
    const mId = rosterMember?.id;
    const mName = rosterMember?.name || member.nickname;

    // Find if in any group
    const fixedGroup = fixedGroups.find(g => {
        const ids = Array.isArray(g.memberIds) ? g.memberIds : (g.memberIds ? Object.values(g.memberIds) : []);
        return ids.some((id: any) => {
            const sid = normalize(id);
            if (!sid) return false;
            return sid === normalize(mId) || sid === normalize(mName) || sid === normalize(member.id) || sid === normalize(member.nickname);
        });
    });

    const groupMembers = fixedGroup ? roster.filter(m => {
        const ids = Array.isArray(fixedGroup.memberIds) ? fixedGroup.memberIds : (fixedGroup.memberIds ? Object.values(fixedGroup.memberIds) : []);
        return ids.some(id => normalize(id) === normalize(m.id) || normalize(id) === normalize(m.name));
    }) : [];

    const tooltipWidth = 280;
    let top = rect.top;
    let left = rect.right + 10;

    if (typeof window !== 'undefined') {
        if (left + tooltipWidth > window.innerWidth - 20) {
            left = rect.left - tooltipWidth - 10;
        }
        left = Math.max(10, left);

        // Adjust top to prevent bottom overflow
        const estimatedMaxHeight = 450;
        if (top + estimatedMaxHeight > window.innerHeight - 20) {
            top = window.innerHeight - estimatedMaxHeight - 20;
        }
        top = Math.max(20, top);
    }

    const style: React.CSSProperties = {
        position: 'fixed',
        top: top,
        left: left,
        zIndex: 9999,
        pointerEvents: 'none',
        maxHeight: 'calc(100vh - 40px)',
        overflowY: 'auto',
    };

    return (
        <div style={style} className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 p-0 w-[280px] animate-in slide-in-from-left-2 duration-200 overflow-hidden">
            <div className="p-4">
                <div className="flex items-center gap-3 mb-3 pb-3 border-b border-slate-100 dark:border-slate-700">
                    <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center font-bold text-lg text-white shadow-sm", getClassColor(member.class))}>
                        {member.class[0]}
                    </div>
                    <div>
                        <h3 className="font-bold text-slate-900 dark:text-white leading-tight">{member.nickname}</h3>
                        <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
                            <span className="text-indigo-600 dark:text-indigo-400">{member.class}</span>
                            <span className="opacity-30">•</span>
                            <span className="font-bold text-slate-700 dark:text-slate-300">{member.power.toLocaleString()} 전투력</span>
                        </div>
                    </div>
                </div>

                <div className="space-y-4">
                    <section>
                        <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">참여 가능 시간</h4>
                        <div className="space-y-1.5">
                            {DAYS.map(day => {
                                const slots = member.availability?.[day] || [];
                                if (slots.length === 0) return null;

                                const sortedSlots = [...slots].sort((a, b) => {
                                    const sortA = [...WEEKDAY_SLOTS, ...WEEKEND_SLOTS].find(s => s.id === a)?.sortKey || 0;
                                    const sortB = [...WEEKDAY_SLOTS, ...WEEKEND_SLOTS].find(s => s.id === b)?.sortKey || 0;
                                    return sortA - sortB;
                                });

                                return (
                                    <div key={day} className="flex items-center text-xs">
                                        <span className="w-6 font-bold text-slate-500 dark:text-slate-400">{day}</span>
                                        <div className="flex flex-wrap gap-1 flex-1 px-2 py-0.5">
                                            {sortedSlots.map(t => {
                                                const sLabel = [...WEEKDAY_SLOTS, ...WEEKEND_SLOTS].find(s => s.id === t)?.label.replace(' 00:30', '') || t;
                                                return (
                                                    <span key={`${day}-${t}`} className="px-1.5 py-0.5 bg-indigo-50/50 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 rounded text-[10px] font-bold border border-indigo-100 dark:border-indigo-800">
                                                        {sLabel}
                                                    </span>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                            {!DAYS.some(d => (member.availability?.[d]?.length || 0) > 0) && (
                                <p className="text-xs text-slate-400 text-center py-2">신청한 시간이 없습니다.</p>
                            )}
                        </div>
                    </section>

                    {mode === 'fixed' && (
                        <section className="pt-4 border-t border-slate-100 dark:border-slate-800">
                            {(() => {
                                // 1. Identify owner
                                const fuzzy = (s: any) => String(s || '').trim().replace(/\s/g, '').toLowerCase();
                                const mNickFuzzy = fuzzy(member.nickname);
                                
                                // Check if this member is a main or sub
                                const mInRoster = roster.find(m => fuzzy(m.name) === mNickFuzzy);
                                const mInSubs = subCharacters.find(s => fuzzy(s.name) === mNickFuzzy);
                                
                                const ownerName = mInSubs?.ownerName || mInRoster?.name || member.nickname;
                                const ownerFuzzy = fuzzy(ownerName);

                                // 2. Find all characters of this owner
                                const ownerMain = roster.find(m => fuzzy(m.name) === ownerFuzzy);
                                const ownerSubs = subCharacters.filter(s => fuzzy(s.ownerName) === ownerFuzzy);
                                
                                // 3. Build List
                                const allChars = [];
                                if (ownerMain) allChars.push({ ...ownerMain, isMain: true });
                                ownerSubs.forEach(s => {
                                    if (fuzzy(s.name) !== fuzzy(ownerMain?.name)) {
                                        allChars.push({ ...s, isMain: false });
                                    }
                                });

                                return (
                                    <>
                                        <div className="flex items-center justify-between mb-2">
                                            <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">소유자 ({ownerName})</h4>
                                            <div className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                                        </div>
                                        <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-3 space-y-2">
                                            {allChars.length > 0 ? allChars.sort((a,b) => (b.power || 0) - (a.power || 0)).map((gm, idx) => (
                                                <div key={`${gm.id}-${idx}`} className="flex justify-between items-center text-xs">
                                                    <div className="flex items-center gap-2 overflow-hidden">
                                                        <div className={cn("w-1.5 h-1.5 rounded-full shrink-0", getClassColor(gm.class).split(' ')[0])} />
                                                        <span className={cn("font-bold truncate", gm.name === member.nickname ? "text-indigo-600 dark:text-indigo-400" : "text-slate-700 dark:text-slate-300")}>
                                                            {gm.name}
                                                        </span>
                                                        {gm.isMain && <span className="text-[9px] bg-indigo-100 dark:bg-indigo-900/40 text-indigo-500 px-1 rounded flex-shrink-0 font-bold">본캐</span>}
                                                    </div>
                                                    <span className="text-[10px] text-slate-400 font-medium whitespace-nowrap ml-2">{gm.class || '미정'}</span>
                                                </div>
                                            )) : (
                                                <p className="text-[10px] text-slate-400 text-center py-2">연결된 캐릭터 정보 없음</p>
                                            )}
                                        </div>
                                    </>
                                );
                            })()}
                        </section>
                    )}

                    {mode !== 'fixed' && fixedGroup && (
                        <section className="pt-4 border-t border-slate-100 dark:border-slate-800">
                            <div className="flex items-center justify-between mb-2">
                                <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">고정 파티 ({fixedGroup.name})</h4>
                                <div className={cn("w-2 h-2 rounded-full", fixedGroup.color)} />
                            </div>
                            <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-3 space-y-2">
                                {groupMembers.length > 0 ? groupMembers.map((gm, idx) => (
                                    <div key={`${gm.id}-${idx}`} className="flex justify-between items-center text-xs">
                                        <div className="flex items-center gap-2">
                                            <div className={cn("w-1.5 h-1.5 rounded-full", getClassColor(gm.class).split(' ')[0])} />
                                            <span className="font-bold text-slate-700 dark:text-slate-300">{gm.name}</span>
                                        </div>
                                        <span className="text-[10px] text-slate-400 font-medium">{gm.class}</span>
                                    </div>
                                )) : (
                                    <p className="text-[10px] text-slate-400 text-center py-2">다른 멤버 없음</p>
                                )}
                            </div>
                        </section>
                    )}
                </div>
            </div>
        </div>
    );
}

const HeatmapCell = ({
    day,
    timeLabel,
    slotId,
    apps,
    onShowTooltip,
    onHideTooltip,
}: {
    day: string,
    timeLabel: string,
    slotId: string | null,
    apps: RaidApplication[],
    onShowTooltip: (day: string, apps: RaidApplication[], rect: DOMRect) => void,
    onHideTooltip: () => void,
}) => {
    if (!slotId) {
        return <div className="bg-slate-50/50 dark:bg-slate-900/20 border border-slate-100 dark:border-slate-800 rounded-lg h-full min-h-[80px]" />;
    }

    const totalCount = apps.length;
    const clericCount = apps.filter(app => app.class === '치유성').length;

    // Heatmap Logic: Simplified
    // 0: White
    // 1-7: Light Blue (Fixed)
    // 8+: Green
    let bgClass = "bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700/50 text-slate-400";

    if (totalCount > 0) {
        // Default Logic (1~7)
        bgClass = "bg-indigo-50 dark:bg-indigo-900/20 border-indigo-100 dark:border-indigo-800 text-indigo-600 dark:text-indigo-300";

        // Full Party Logic (8+)
        if (totalCount >= 8) {
            bgClass = "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400 font-bold ring-2 ring-emerald-100 dark:ring-emerald-900";
        }
    }

    return (
        <div
            onMouseEnter={(e) => totalCount > 0 && onShowTooltip(day, apps, e.currentTarget.getBoundingClientRect())}
            onMouseLeave={onHideTooltip}
            className={cn(
                "group relative rounded-xl border-2 flex flex-col items-center justify-center p-2 min-h-[100px] cursor-default transition-all hover:border-indigo-400 dark:hover:border-indigo-500 hover:z-[70] hover:shadow-2xl",
                bgClass
            )}
        >
            {/* Cleric Count (Top Right) */}
            <div className="absolute top-0.5 right-2">
                <span className={cn(
                    "text-[10px] font-bold transition-colors",
                    clericCount === 0 && "text-slate-300 dark:text-slate-600",
                    clericCount === 1 && "text-indigo-600 dark:text-indigo-400 opacity-80",
                    clericCount >= 2 && "text-emerald-600 dark:text-emerald-400"
                )}>
                    치유성: {clericCount}
                </span>
            </div>

            {/* Count Badge */}
            <div className="flex items-end gap-1 mb-1">
                <span className="text-2xl font-black leading-none">{totalCount}</span>
                <span className="text-xs opacity-60 font-bold mb-1">/8</span>
            </div>
        </div>
    );
};

function HeatmapTooltip({ day, apps, rect, onMouseEnter, onMouseLeave, fixedGroups = [], roster = [] }: {
    day: string,
    apps: RaidApplication[],
    rect: DOMRect,
    onMouseEnter: () => void,
    onMouseLeave: () => void,
    fixedGroups?: FixedGroup[],
    roster?: any[]
}) {
    const tooltipWidth = 220;

    // Layout Calculation
    let left = rect.left + (rect.width / 2) - (tooltipWidth / 2);

    // Default: Show ABOVE the cell (Standard Position)
    let bottomValue: number | undefined = (typeof window !== 'undefined' ? window.innerHeight : 0) - rect.top + 8;
    let topValue: number | undefined = undefined;

    // Adjustment to stay inside viewport
    if (typeof window !== 'undefined') {
        // Horizontal clamping
        if (left < 10) left = 10;
        if (left + tooltipWidth > window.innerWidth - 10) left = window.innerWidth - tooltipWidth - 10;

        // Vertical flip: If top area is too cramped (less than 300px), show BELOW instead
        if (rect.top < 300) {
            bottomValue = undefined;
            topValue = rect.bottom + 8;
        }
    }

    return (
        <div
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
            style={{
                position: 'fixed',
                top: topValue,
                bottom: bottomValue,
                left,
                width: tooltipWidth,
                zIndex: 9999,
                pointerEvents: 'auto'
            }}
            className="animate-in fade-in zoom-in-95 duration-200"
        >
            {/* Safe Zone Bridge (Invisible) - Higher and better pointer events */}
            <div
                className="absolute left-0 w-full h-8 bg-transparent pointer-events-auto"
                style={{
                    top: bottomValue !== undefined ? '100%' : 'auto',
                    bottom: topValue !== undefined ? '100%' : 'auto',
                    transform: bottomValue !== undefined ? 'translateY(-4px)' : 'translateY(4px)'
                }}
            />
            <div className="bg-white dark:bg-slate-900/95 backdrop-blur text-slate-900 dark:text-white text-xs rounded-xl p-3 shadow-[0_20px_50px_rgba(0,0,0,0.3)] border border-slate-200 dark:border-slate-800">
                <div className="font-bold text-slate-500 dark:text-slate-400 mb-2 border-b border-slate-100 dark:border-slate-700 pb-1 flex justify-between items-center">
                    <span>{day}요일 <span className="text-[10px] font-normal">({getDayDate(day)})</span></span>
                    <span className="text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-1.5 py-0.5 rounded text-[10px]">{apps.length}명</span>
                </div>
                <div className="space-y-1 max-h-[240px] overflow-y-auto custom-scrollbar pr-1">
                    {apps.map(app => {
                        const fuzzy = (s: any) => String(s || '').trim().replace(/\s/g, '');
                        const rosterMember = roster.find(m => fuzzy(m.name) === fuzzy(app.nickname) || m.id === app.id);
                        const mId = rosterMember?.id;
                        const mName = rosterMember?.name || app.nickname;

                        const group = fixedGroups.find(g => {
                            const ids = Array.isArray(g.memberIds) ? g.memberIds : (g.memberIds ? Object.values(g.memberIds) : []);
                            return ids.some((id: any) => {
                                const sid = fuzzy(id);
                                if (!sid) return false;
                                return sid === fuzzy(mId) || sid === fuzzy(mName) || sid === fuzzy(app.id) || sid === fuzzy(app.nickname);
                            });
                        });
                        const fixedGroup = group || (app.fixedGroupId ? fixedGroups.find(g => g.id === app.fixedGroupId) : null);

                        return (
                            <div
                                key={app.id}
                                className="flex justify-between items-center p-1.5"
                            >
                                <div className="flex items-center gap-1.5 overflow-hidden">
                                    <span className="text-slate-700 dark:text-slate-300 font-bold truncate">{app.nickname}</span>
                                    {fixedGroup && (
                                        <Link size={10} className={cn("rotate-45 shrink-0", COLOR_MAP_TEXT[fixedGroup.color] || 'text-slate-400')} strokeWidth={3} />
                                    )}
                                </div>
                                <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-bold shadow-sm shrink-0", getClassColor(app.class))}>
                                    {app.class}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

// --- Main Component ---

export default function RaidManagerV2({ testMode = false }: { testMode?: boolean }) {
    const { isAdmin } = useAuth();
    const { mode, dbPath } = useAppMode();
    const [applications, setApplications] = useState<RaidApplication[]>([]);
    const [fixedGroups, setFixedGroups] = useState<FixedGroup[]>([]);
    const [roster, setRoster] = useState<any[]>([]);
    const [subCharacters, setSubCharacters] = useState<any[]>([]);

    // Detailed View State
    const [selectedDay, setSelectedDay] = useState<string>('전체');
    const [overviewViewMode, setOverviewViewMode] = useState<'slots' | 'list'>('slots');
    const [isResetModalOpen, setIsResetModalOpen] = useState(false);
    const [resetConfirmText, setResetConfirmText] = useState('');

    const [tooltipInfo, setTooltipInfo] = useState<{ member: RaidApplication, rect: DOMRect } | null>(null);
    const [heatmapTooltipInfo, setHeatmapTooltipInfo] = useState<{ day: string, apps: RaidApplication[], rect: DOMRect } | null>(null);

    // Use a ref to track the active tooltip state and prevent race conditions
    const activeTooltipTimer = React.useRef<NodeJS.Timeout | null>(null);

    const showHeatmapTooltip = (day: string, apps: RaidApplication[], rect: DOMRect) => {
        if (activeTooltipTimer.current) {
            clearTimeout(activeTooltipTimer.current);
            activeTooltipTimer.current = null;
        }
        setHeatmapTooltipInfo({ day, apps, rect });
    };

    const hideHeatmapTooltip = () => {
        // High grace period (300ms) to ensure stability even with fast/erratic mouse movement
        if (activeTooltipTimer.current) clearTimeout(activeTooltipTimer.current);

        activeTooltipTimer.current = setTimeout(() => {
            setHeatmapTooltipInfo(null);
            activeTooltipTimer.current = null;
        }, 300);
    };

    // Initial Data Sync
    useEffect(() => {
        if (testMode) {
            // ... (Mock data logic preserved)
            const classes = ['수호성', '검성', '살성', '궁성', '마도성', '정령성', '치유성', '호법성'];
            const mockApps: RaidApplication[] = Array.from({ length: 80 }, (_, i) => {
                const cls = classes[Math.floor(Math.random() * classes.length)];
                const slots平日 = ['wd1', 'wd2', 'wd3'];
                const slots週末 = ['we1', 'we2', 'we3', 'we4', 'we5'];
                const availability: Record<string, string[]> = { '월': [], '화': [], '수': [], '목': [], '금': [], '토': [], '일': [] };

                if (Math.random() > 0.3) {
                    ['월', '화', '수', '목', '금'].forEach(d => {
                        if (Math.random() > 0.45) availability[d] = ['wd2', 'wd3'];
                    });
                }
                ['토', '일'].forEach(d => {
                    if (Math.random() > 0.4) availability[d] = slots週末.filter(() => Math.random() > 0.5);
                });

                return {
                    id: `mock-${i}`,
                    nickname: `테스트${i + 1}`,
                    class: cls,
                    power: Math.floor(Math.random() * (5000 - 1000) + 1000),
                    availability,
                    updatedAt: new Date().toISOString(),
                    fixedGroupId: i < 5 ? 'fg-1' : (i < 10 ? 'fg-2' : undefined)
                };
            });
            setApplications(mockApps);
            setFixedGroups([
                { id: 'fg-1', name: '테스트 1팀', color: 'bg-rose-500', memberIds: [] },
                { id: 'fg-2', name: '테스트 2팀', color: 'bg-indigo-500', memberIds: [] }
            ]);
            return;
        }

        // 1. Load Fixed Groups
        const unsubscribeGroups = onValue(ref(db, dbPath.fixedGroups), (snapshot) => {
            const data = snapshot.val();
            setFixedGroups(data ? Object.values(data) : []);
        });

        // 2. Load Members (Roster)
        const unsubscribeMembers = onValue(ref(db, dbPath.members), (snap) => {
            const data = snap.val();
            setRoster(data ? Object.values(data) : []);
        });

        // 3. Load Applications
        const unsubscribeApps = onValue(ref(db, dbPath.raidApplications), (snapshot) => {
            const data = snapshot.val();
            setApplications(data ? Object.values(data) as RaidApplication[] : []);
        });

        // 4. Load Sub Characters
        const unsubscribeSubChars = onValue(ref(db, dbPath.subCharacters), (snapshot) => {
            const data = snapshot.val();
            setSubCharacters(data ? Object.values(data) : []);
        });

        return () => {
            unsubscribeGroups();
            unsubscribeMembers();
            unsubscribeApps();
            unsubscribeSubChars();
        };
    }, [testMode, dbPath]);

    // Dummy Data Generator (Preserved for Admin)
    const generateDummyData = async () => {
        if (!isAdmin) return;
        if (!confirm("테스트용 더미 데이터 100개를 생성하시겠습니까? (DB 저장)")) return;
        const classes = ['수호성', '검성', '살성', '궁성', '마도성', '정령성', '치유성', '호법성'];
        const slots平日 = ['wd1', 'wd2', 'wd3'];
        const slots週末 = ['we1', 'we2', 'we3', 'we4', 'we5'];
        const dummyData: Record<string, any> = {};
        for (let i = 1; i <= 100; i++) {
            const id = `dummy_${Date.now()}_${i}`;
            const cls = classes[Math.floor(Math.random() * classes.length)];
            const power = Math.floor(Math.random() * (5500 - 1500) + 1500);
            const availability: Record<string, string[]> = { '월': [], '화': [], '수': [], '목': [], '금': [], '토': [], '일': [] };
            if (Math.random() < 0.6) {
                ['월', '화', '수', '목', '금'].forEach(d => { if (Math.random() > 0.5) availability[d] = ['wd2', 'wd3']; });
            }
            ['토', '일'].forEach(d => { if (Math.random() > 0.3) availability[d] = slots週末.filter(() => Math.random() > 0.4); });

            dummyData[id] = { id, nickname: `TestUser${i}`, class: cls, power, availability, updatedAt: new Date().toISOString() };
        }
        await set(ref(db, dbPath.raidApplications), dummyData);
        alert("완료");
    };

    const handleResetAll = async () => {
        if (!isAdmin) return alert("관리자 권한이 필요합니다.");

        setIsResetModalOpen(false); // Close modal

        try {
            await remove(ref(db, dbPath.raidApplications));
            await remove(ref(db, dbPath.raidMatchedForces));
            await remove(ref(db, dbPath.raidUnassignedMembers));
            alert("신청 정보가 성공적으로 초기화되었습니다.");
        } catch (e) {
            console.error("Reset Error:", e);
            alert("초기화 중 오류가 발생했습니다.");
        }
    };

    // --- DATA ENRICHMENT ---
    const enrichedApplications = useMemo(() => {
        const normalize = (s: any) => String(s || '').trim().replace(/\s/g, '').toLowerCase();
        return applications.map(app => {
            const rosterMember = roster.find(m => normalize(m.name) === normalize(app.nickname) || m.id === app.id);
            const mId = rosterMember?.id;
            const mName = rosterMember?.name || app.nickname;

            const group = fixedGroups.find(g => {
                const ids = Array.isArray(g.memberIds) ? g.memberIds : (g.memberIds ? Object.values(g.memberIds) : []);
                return ids.some((id: any) => {
                    const sid = normalize(id);
                    if (!sid) return false;
                    return sid === normalize(mId) || sid === normalize(mName) || sid === normalize(app.id) || sid === normalize(app.nickname);
                });
            });

            return {
                ...app,
                fixedGroupId: group?.id || app.fixedGroupId
            };
        });
    }, [applications, fixedGroups, roster]);

    // Derived Data for Detailed View
    const dayApplicants = useMemo(() => {
        if (selectedDay === '전체') {
            return enrichedApplications.sort((a, b) => b.power - a.power);
        }
        return enrichedApplications
            .filter(app => app.availability?.[selectedDay]?.length > 0)
            .sort((a, b) => b.power - a.power);
    }, [enrichedApplications, selectedDay]);

    return (
        <div className="space-y-6 pb-20 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div>
                    <h2 className="text-4xl font-black text-slate-900 dark:text-white flex items-center gap-3 tracking-tight">
                        <Grid3X3 className="text-indigo-500 dark:text-indigo-400" size={32} />
                        성역 신청 현황
                        {testMode && <span className="text-xs bg-red-500 text-white px-2 py-1 rounded-full animate-pulse">TEST MODE</span>}
                    </h2>
                    <div className="mt-[17px]">
                        <p className="text-slate-500 dark:text-slate-300 text-sm font-medium flex items-center gap-2">
                            주간 신청 현황을 한눈에 확인하세요. (캘린더 뷰 & 상세 목록)
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {isAdmin && !testMode && (
                        <>
                            <button
                                onClick={generateDummyData}
                                className="px-4 py-2.5 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-xl text-xs font-black hover:bg-indigo-100 dark:hover:bg-indigo-800/30 transition-colors flex items-center gap-2"
                            >
                                <Zap size={14} />
                                [DB] 더미 생성
                            </button>
                            <button
                                onClick={() => setIsResetModalOpen(true)}
                                className="px-4 py-2.5 bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 rounded-xl text-xs font-black hover:bg-rose-100 dark:hover:bg-rose-800/30 transition-colors flex items-center gap-2 border border-rose-100 dark:border-rose-900/30 shadow-sm"
                            >
                                <X size={14} className="stroke-[3px]" />
                                신청 정보 초기화
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* RESET WARNING MODAL */}
            {isResetModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-6">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-10 h-10 bg-rose-100 dark:bg-rose-900/40 rounded-full flex items-center justify-center text-rose-500 shadow-sm">
                                    <AlertCircle size={20} className="stroke-[2.5px]" />
                                </div>
                                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-0">신청 정보를 초기화할까요?</h3>
                            </div>

                            <div className="space-y-3 mb-6">
                                <p className="text-slate-500 dark:text-slate-400 text-sm font-medium leading-relaxed whitespace-pre-wrap">
                                    현재까지 접수된 <span className="text-rose-500 font-bold">모든 신청 내역과 매칭 결과</span>가{"\n"}영구적으로 삭제되며 복구할 수 없습니다.
                                </p>
                                <div className="text-[11px] text-rose-600/80 dark:text-rose-400/80 bg-rose-50/50 dark:bg-rose-900/20 p-2.5 rounded-lg border border-rose-100/50 dark:border-rose-900/30">
                                    새로운 주차의 레이드 매칭을 준비할 때만 사용해 주세요. 이 작업은 취소할 수 없습니다.
                                </div>
                            </div>

                            <div className="flex justify-end gap-2">
                                <button
                                    onClick={() => setIsResetModalOpen(false)}
                                    className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-300 font-bold rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-all active:scale-95"
                                >
                                    취소
                                </button>
                                <button
                                    onClick={handleResetAll}
                                    className="px-6 py-2 bg-rose-500 text-white font-black rounded-xl shadow-lg shadow-rose-500/20 hover:bg-rose-600 transition-all active:scale-95 flex items-center justify-center gap-2"
                                >
                                    지금 초기화
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}


            {/* HEATMAP GRID (Calendar Style) */}
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
                                        ? enrichedApplications.filter(app => app.availability?.[day]?.includes(slotId!))
                                        : [];

                                    return (
                                        <HeatmapCell
                                            key={`${day}-${rowIdx}`}
                                            day={day}
                                            timeLabel={row.label}
                                            slotId={slotId}
                                            apps={slotApps}
                                            onShowTooltip={showHeatmapTooltip}
                                            onHideTooltip={hideHeatmapTooltip}
                                        />
                                    );
                                })}
                            </div>
                        ))}
                    </div>
                </div>
            </div>


            {/* DETAILED CARD VIEW (Legacy UI) */}
            <div className="space-y-6">
                <div className="glass-panel p-2 flex flex-col md:flex-row items-center justify-between gap-4">
                    {/* Day Tabs */}
                    <div className="flex p-1 bg-slate-100/50 dark:bg-slate-900/50 rounded-xl flex-wrap md:flex-nowrap gap-1">
                        {['전체', ...DAYS].map((day) => {
                            const isToday = day === ['일', '월', '화', '수', '목', '금', '토'][new Date().getDay()];
                            return (
                                <button
                                    key={day}
                                    onClick={() => setSelectedDay(day)}
                                    className={cn(
                                        "px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap relative group",
                                        selectedDay === day ? "bg-white dark:bg-indigo-600 text-indigo-600 dark:text-white shadow-sm" : "text-slate-400 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                                    )}
                                >
                                    {isToday && null}
                                    {day}
                                    {day !== '전체' && (
                                        <span className="ml-1 text-xs opacity-80">
                                            요일
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>

                    {/* View Sub-toggles */}
                    <div className="flex gap-2">
                        <button
                            onClick={() => setOverviewViewMode('slots')}
                            className={cn("p-2 rounded-lg transition-colors", overviewViewMode === 'slots' ? "bg-indigo-50 dark:bg-slate-700 text-indigo-600 dark:text-indigo-400" : "text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700")}
                        >
                            <LayoutGrid size={18} />
                        </button>
                        <button
                            onClick={() => setOverviewViewMode('list')}
                            className={cn("p-2 rounded-lg transition-colors", overviewViewMode === 'list' ? "bg-indigo-50 dark:bg-slate-700 text-indigo-600 dark:text-indigo-400" : "text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700")}
                        >
                            <Users size={18} />
                        </button>
                    </div>
                </div>

                {/* SLOTS CARD VIEW */}
                {overviewViewMode === 'slots' ? (
                    <div className="space-y-8">
                        {(selectedDay === '전체' ? DAYS : [selectedDay]).map(day => {
                            const isWknd = ['토', '일'].includes(day);
                            const currentSlots = isWknd ? SLOTS['주말'] : SLOTS['평일'];

                            return (
                                <div key={day} className="space-y-4">
                                    <h4 className="text-sm font-black text-slate-500 dark:text-slate-200 uppercase tracking-widest pl-2 border-l-4 border-slate-200 dark:border-slate-700">
                                        {day}요일 <span className="text-slate-400 dark:text-slate-400 font-normal">({getDayDate(day)})</span>
                                    </h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                        {currentSlots.map(slot => {
                                            const slotApps = dayApplicants.filter(app => app.availability?.[day]?.includes(slot.id));
                                            return (
                                                <div key={slot.id} className="glass-panel p-5 flex flex-col gap-4">
                                                    <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-700 pb-3">
                                                        <div className="flex items-center gap-2">
                                                            <div className="bg-indigo-50 dark:bg-slate-800 text-indigo-600 dark:text-indigo-300 p-1.5 rounded-lg">
                                                                <Clock size={16} />
                                                            </div>
                                                            <span className="font-bold text-slate-700 dark:text-slate-200">{slot.label}</span>
                                                        </div>
                                                        <span className="bg-indigo-50 dark:bg-slate-800 text-indigo-600 dark:text-indigo-300 px-2.5 py-1 rounded-lg text-xs font-black">
                                                            {slotApps.length}명
                                                        </span>
                                                    </div>

                                                    <div className="min-h-[120px] max-h-[320px] overflow-y-auto custom-scrollbar pr-2">
                                                        {slotApps.length > 0 ? (
                                                            <div className="space-y-2">
                                                                {slotApps.map(app => (
                                                                    <MemberCard
                                                                        key={app.id}
                                                                        member={app}
                                                                        compact
                                                                        onShowTooltip={(m, r) => setTooltipInfo({ member: m, rect: r })}
                                                                        onHideTooltip={() => setTooltipInfo(null)}
                                                                        fixedGroups={fixedGroups}
                                                                        roster={roster}
                                                                    />
                                                                ))}
                                                            </div>
                                                        ) : (
                                                            <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-2 min-h-[120px]">
                                                                <Users size={24} className="opacity-50" />
                                                                <span className="text-xs font-bold">신청자가 없습니다</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    /* LIST VIEW */
                    <div className="glass-panel p-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {dayApplicants.map(app => (
                                <MemberCard
                                    key={app.id}
                                    member={app}
                                    onShowTooltip={(m, r) => setTooltipInfo({ member: m, rect: r })}
                                    onHideTooltip={() => setTooltipInfo(null)}
                                    fixedGroups={fixedGroups}
                                    roster={roster}
                                />
                            ))}
                            {dayApplicants.length === 0 && (
                                <div className="col-span-full text-center py-20 text-slate-300">신청 내역이 없습니다.</div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {heatmapTooltipInfo && (
                <HeatmapTooltip
                    day={heatmapTooltipInfo.day}
                    apps={heatmapTooltipInfo.apps}
                    rect={heatmapTooltipInfo.rect}
                    onMouseEnter={() => {
                        if (activeTooltipTimer.current) {
                            clearTimeout(activeTooltipTimer.current);
                            activeTooltipTimer.current = null;
                        }
                    }}
                    onMouseLeave={hideHeatmapTooltip}
                    fixedGroups={fixedGroups}
                    roster={roster}
                />
            )}

            {tooltipInfo && (
                <MemberDetailTooltip
                    member={tooltipInfo.member}
                    rect={tooltipInfo.rect}
                    fixedGroups={fixedGroups}
                    roster={roster}
                    subCharacters={subCharacters}
                    isAdmin={isAdmin}
                    mode={mode}
                />
            )}

        </div>
    );
}
