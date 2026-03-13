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
import { Users, GripVertical, Shuffle, Zap, Trash2, Copy, Check, Sword, Shield, Crosshair, Sparkles, Settings2, Settings, X, XCircle, CheckCircle2, ChevronRight, Clock, Calendar, Plus, Lock, AlertTriangle, RotateCcw, AlertCircle, CheckCircle, Link } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useAppMode } from '@/context/ModeContext';
import { db } from '@/lib/firebase';
import { ref, onValue, set, get, child } from 'firebase/database';
import { cn, getClassColor } from '@/lib/utils';

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
    faction?: '천족' | '마족';
    ownerName?: string;
    isSub?: boolean;
}


interface AutoMatchOptions {
    targetScope: 'FILL' | 'RESHUFFLE';
    matchType: 'DAY' | 'ALL' | 'SMART_ALL';
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

function SortableAlgoCard({ card, isAdmin, isOverlay = false }: { card: AlgoCard, isAdmin?: boolean, isOverlay?: boolean }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: card.id,
        disabled: !isAdmin
    });

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
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-normal pointer-events-none whitespace-pre-wrap">{card.desc}</p>
            </div>
        );
    }

    return (
        <div ref={setNodeRef} style={style} {...attributes} {...listeners}
            onPointerDownCapture={(e) => {
                if (!isAdmin) {
                    alert("알고리즘 우선순위를 변경하려면 관리자 권한이 필요합니다.\n(좌측 하단에서 로그인을 진행해주세요)");
                    e.stopPropagation();
                }
            }}
            className={cn(
                "p-4 bg-white dark:bg-slate-800 border rounded-xl shadow-sm transition-all select-none group touch-none",
                "border-slate-200 dark:border-slate-700",
                isAdmin ? "hover:shadow-md cursor-grab active:cursor-grabbing" : "cursor-default opacity-90",
                card.status === 'ESSENTIAL' && "border-l-4 border-l-rose-500",
                card.status === 'PRIORITY' && "border-l-4 border-l-indigo-500",
                card.status === 'AVAILABLE' && "border-l-4 border-l-slate-300"
            )}>
            <div className="flex justify-between items-start mb-2 pointer-events-none">
                <span className="font-bold text-slate-700 dark:text-slate-200 text-sm">{card.label}</span>
                <GripVertical size={16} className="text-slate-300" />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-normal pointer-events-none whitespace-pre-wrap">{card.desc}</p>
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

function RaidPartySlot({ party, fixedGroups, index, onShowTooltip, onHideTooltip, isAdmin, assignedDay, assignedTime }: { party: Party, fixedGroups?: FixedGroup[], index: number, onShowTooltip: (m: Member, r: DOMRect) => void, onHideTooltip: () => void, isAdmin?: boolean, assignedDay?: string, assignedTime?: string }) {
    const { setNodeRef, isOver } = useDroppable({ id: party.id });

    // Derived Force Info (0-1, 2-3 pair)
    const forceIndex = Math.floor(index / 2);
    const isForceLeader = index % 2 === 0;

    return (
        <div className={cn(
            "bg-white dark:bg-slate-800 rounded-2xl border transition-all flex flex-col overflow-hidden group shadow-sm hover:shadow-md h-[340px]", // Fixed Height
            isOver ? "border-indigo-500 ring-4 ring-indigo-500/10 z-10 scale-[1.02]" : "border-slate-200 dark:border-slate-700"
        )}>
            <div className="p-3 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
                <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-700 dark:text-slate-200">{party.name}</span>
                    <span className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded font-medium",
                        party.members.length === 4 ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-500"
                    )}>
                        {party.members.length}/4
                    </span>
                </div>

                <div className="flex items-center gap-1">
                    <div className={cn(
                        "w-6 h-6 rounded-full flex items-center justify-center border transition-all",
                        party.members.some(m => ['수호성', '검성'].includes(m.class))
                            ? "bg-blue-100 border-blue-200 text-blue-600 shadow-sm shadow-blue-100" // Active
                            : "bg-slate-50 border-slate-100 text-slate-300" // Inactive
                    )}>
                        <Shield size={14} strokeWidth={2.5} />
                    </div>

                    <div className={cn(
                        "w-6 h-6 rounded-full flex items-center justify-center border transition-all",
                        party.members.some(m => m.class === '치유성')
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
                    <DraggableMember
                        key={m.id}
                        member={m}
                        fixedGroups={fixedGroups}
                        isReadOnly={false}
                        onShowTooltip={onShowTooltip}
                        onHideTooltip={onHideTooltip}
                        assignedDay={assignedDay}
                        assignedTime={assignedTime}
                    />
                ))}
            </div>

            <div className="p-2 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-100 dark:border-slate-700 flex justify-between text-[10px] text-slate-400 dark:text-slate-500">
                <span>Power: {party.members.reduce((s, m) => s + m.power, 0).toLocaleString()}</span>
            </div>
        </div>
    );
}

function DraggableMember({ member, fixedGroups, isReadOnly, onShowTooltip, onHideTooltip, assignedDay, assignedTime }: { member: Member, fixedGroups?: FixedGroup[], isReadOnly?: boolean, onShowTooltip?: (m: Member, r: DOMRect) => void, onHideTooltip?: () => void, assignedDay?: string, assignedTime?: string }) {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: member.id,
        disabled: isReadOnly,
    });

    const fixedGroup = fixedGroups?.find(g => g.id === member.fixedGroupId);

    const style = transform ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: 999,
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
                !isReadOnly && "cursor-grab active:cursor-grabbing",
                isDragging ? "opacity-0" : "opacity-100",
                isReadOnly && "opacity-60 cursor-default"
            )}>
            <MemberCard member={member} fixedGroup={fixedGroup} assignedDay={assignedDay} assignedTime={assignedTime} />
        </div>
    );
}

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

function MemberCard({ member, isOverlay, fixedGroup, assignedDay, assignedTime }: { member: Member, isOverlay?: boolean, fixedGroup?: FixedGroup, assignedDay?: string, assignedTime?: string }) {
    const borderColorClass = fixedGroup ? (COLOR_MAP[fixedGroup.color] || 'border-slate-200') : '';

    // Conflict Check: If forced assigned time exist, but member hasn't applied for it
    const isConflict = assignedDay && assignedTime && (!member.availability?.[assignedDay]?.includes(assignedTime));

    return (
        <div className={cn(
            "relative p-2 rounded-xl border flex items-center justify-between gap-3 bg-white dark:bg-slate-800 transition-all select-none box-border overflow-hidden",
            isOverlay ? "shadow-2xl ring-4 ring-indigo-500/20 scale-105 z-50 cursor-grabbing border-indigo-500" : "shadow-sm",
            isConflict
                ? "border-rose-400 bg-rose-50/50 dark:bg-rose-900/10 dark:border-rose-800 shadow-rose-100/50"
                : (fixedGroup && !isOverlay ? cn("border-2", borderColorClass) : "border-slate-100 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600")
        )}
        >
            {isConflict && (
                <div className="absolute top-0 right-0 p-0.5 bg-rose-500 text-white rounded-bl-lg shadow-sm animate-pulse z-10">
                    <AlertCircle size={10} />
                </div>
            )}

            <div className="flex items-center gap-3">
                <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center font-bold text-sm text-white shadow-inner", getClassColor(member.class))}>
                    {member.class[0]}
                </div>
                <div className="flex flex-col min-w-0">
                    <span className="font-bold text-slate-700 dark:text-slate-200 text-sm truncate leading-none">{member.name}</span>
                    <span className="text-[10px] text-slate-400 mt-1">{member.class}</span>
                </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
                {fixedGroup && (
                    <Link size={10} className={cn("rotate-45", COLOR_MAP_TEXT[fixedGroup.color] || 'text-slate-400')} strokeWidth={3} />
                )}
                <span className="text-[10px] font-medium text-slate-400 bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded-full flex items-center gap-1">
                    {member.isSub && <RotateCcw size={10} className="text-indigo-400" />}
                    {member.power.toLocaleString()}
                </span>
            </div>
        </div>
    );
}

function MemberDetailTooltip({ member, rect, fixedGroups, allMembers, assignedDay, assignedTime }: { member: Member, rect: DOMRect, fixedGroups?: FixedGroup[], allMembers: Member[], assignedDay?: string, assignedTime?: string }) {
    const normalize = (s: any) => String(s || '').trim().replace(/\s/g, '').toLowerCase();
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

    const fixedGroup = member.fixedGroupId ? fixedGroups?.find(g => g.id === member.fixedGroupId) : null;
    const groupMembers = fixedGroup ? allMembers.filter(m => (fixedGroup.memberIds.some(id => normalize(id) === normalize(m.id) || normalize(id) === normalize(m.name))) && m.id !== member.id) : [];

    const isConflict = assignedDay && assignedTime && (!member.availability?.[assignedDay]?.includes(assignedTime));
    const slotLabel = assignedTime ? ([...WEEKDAY_SLOTS, ...WEEKEND_SLOTS].find(s => s.id === assignedTime)?.label || assignedTime) : '';

    return (
        <div style={style} className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 p-0 w-[280px] animate-in slide-in-from-left-2 duration-200 overflow-hidden">
            {/* Conflict Warning Header */}
            {isConflict && (
                <div className="bg-rose-500 px-4 py-2 text-white flex items-center gap-2">
                    <AlertCircle size={14} className="animate-bounce" />
                    <span className="text-[11px] font-black tracking-tight">이 시간대 미신청 인원 ({assignedDay} {slotLabel})</span>
                </div>
            )}

            <div className="p-4">
                <div className="flex items-center gap-3 mb-3 pb-3 border-b border-slate-100 dark:border-slate-700">
                    <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center font-bold text-lg text-white shadow-sm", getClassColor(member.class))}>
                        {member.class[0]}
                    </div>
                    <div>
                        <h3 className="font-bold text-slate-900 dark:text-white leading-tight">{member.name}</h3>
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
                            {RAID_DAYS.map(day => {
                                const slots = member.availability?.[day] || [];
                                if (slots.length === 0) return null;

                                const sortedSlots = [...slots].sort((a, b) => {
                                    const sortA = [...WEEKDAY_SLOTS, ...WEEKEND_SLOTS].find(s => s.id === a)?.sortKey || 0;
                                    const sortB = [...WEEKDAY_SLOTS, ...WEEKEND_SLOTS].find(s => s.id === b)?.sortKey || 0;
                                    return sortA - sortB;
                                });

                                return (
                                    <div key={day} className="flex items-center text-xs">
                                        <span className="w-6 font-bold text-slate-500 dark:text-slate-400 shrink-0">{day}</span>
                                        <div className="flex flex-wrap gap-1 flex-1 px-2 py-0.5">
                                            {sortedSlots.map(t => {
                                                const sLabel = [...WEEKDAY_SLOTS, ...WEEKEND_SLOTS].find(s => s.id === t)?.label || t;
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
                            {!RAID_DAYS.some(d => (member.availability?.[d]?.length || 0) > 0) && (
                                <p className="text-xs text-slate-400 text-center py-2">신청한 시간이 없습니다.</p>
                            )}
                        </div>
                    </section>

                    {fixedGroup && (
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

// --- Main Component ---
export default function RaidPartyMakerV3({ testMode = false }: { testMode?: boolean }) {
    const { loading, isAdmin } = useAuth();
    const { mode, dbPath } = useAppMode();
    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 5, // minimum 5px drag to initiate dragging (prevents accidental clicks / micro movements)
            },
        })
    );
    const [isMounted, setIsMounted] = useState(false);

    // Data State
    const [allMembers, setAllMembers] = useState<Member[]>([]);
    const [dbMembers, setDbMembers] = useState<Record<string, any>>({});
    const [pool, setPool] = useState<Member[]>([]);
    const [applications, setApplications] = useState<Member[]>([]);
    const [parties, setParties] = useState<Party[]>([]);
    const [excludedOwners, setExcludedOwners] = useState<string[]>([]);
    const [allSubChars, setAllSubChars] = useState<Member[]>([]);
    const [isAttendanceModalOpen, setIsAttendanceModalOpen] = useState(false);

    // UI State
    const [draggedMember, setDraggedMember] = useState<Member | null>(null);
    const [isOptionsOpen, setIsOptionsOpen] = useState(false);
    const [isAutoMatchModalOpen, setIsAutoMatchModalOpen] = useState(false);
    const [isAlgoSettingsModalOpen, setIsAlgoSettingsModalOpen] = useState(false);
    const [isFixedGroupModalOpen, setIsFixedGroupModalOpen] = useState(false);
    const [confirmationModal, setConfirmationModal] = useState<{
        isOpen: boolean;
        title?: string;
        message: React.ReactNode;
        onConfirm: () => void;
        onCancel: () => void;
        isDanger?: boolean
    }>({ isOpen: false, message: '', onConfirm: () => { }, onCancel: () => { } });

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
    const [isAlgoLoaded, setIsAlgoLoaded] = useState(false); // Added for persistence
    const [serverVersion, setServerVersion] = useState(0); // Added for Version Sync
    const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);

    // --- Filters ---
    const [searchTerm, setSearchTerm] = useState('');
    const [filterClass, setFilterClass] = useState('ALL');
    const [algoCards, setAlgoCards] = useState<AlgoCard[]>([
        { id: 'schedule_gating', label: '신청 스케줄 준수', desc: '신청자가 선택한 시간에만 배정합니다.', status: 'ESSENTIAL' },
        { id: 'fixed_group', label: '동일 오너 중복 방지', desc: '본캐/부캐로 묶인 동일 그룹 멤버가 같은 파티에 배정되지 않게 방지합니다.', status: 'ESSENTIAL' },
        { id: 'resurrection_anchor', label: '치유성 보장', desc: '파티당 1명의 치유성을 고정 배치합니다.', status: 'ESSENTIAL' },
        { id: 'main_tank', label: '탱커 보장', desc: '파티당 1명의 수호성/검성을 고정 배치합니다.', status: 'AVAILABLE' },
        { id: 'safety_opt', label: '검성 탱킹 보조', desc: '검성 탱커 시 호법성을 배치하여 생존력을 보강합니다.', status: 'AVAILABLE' },
        { id: 'combat_logic', label: '근/원 밸런스', desc: '근거리/원거리 클래스 비율을 균형 있게 맞춥니다.', status: 'AVAILABLE' },
        { id: 'power_balance', label: '전투력 밸런스', desc: '포스 전투력을 균형 있게 맞춥니다.', status: 'AVAILABLE' },
        { id: 'attendance_volume', label: '포스 강제 생성', desc: '현재 포스 최소 생성 규칙(5명 이상)을 무시하고\n인원이 충분하지 않아도 포스를 강제로 생성합니다.', status: 'AVAILABLE' },
        { id: 'scarcity_priority', label: '매칭 안전성 강화 (희소성 우선)', desc: '인원이 부족한 역할/시간을 우선적으로 배정합니다.', status: 'AVAILABLE' },
    ]);

    // Tooltip State
    const [tooltipInfo, setTooltipInfo] = useState<{ member: Member, rect: DOMRect } | null>(null);

    // Dnd State for Algo
    const [activeAlgoId, setActiveAlgoId] = useState<string | null>(null);

    // New: Time Selection Modal State
    const [timeSelectionModal, setTimeSelectionModal] = useState<{
        isOpen: boolean;
        member: Member | null;
        targetPartyId: string | null;
    }>({ isOpen: false, member: null, targetPartyId: null });

    const [copySuccess, setCopySuccess] = useState(false);

    const handleConfirmTimeSelection = (day: string, time: string) => {
        if (!timeSelectionModal.member || !timeSelectionModal.targetPartyId) return;

        // Execute move with the selected time
        executeMove(timeSelectionModal.member.id, timeSelectionModal.targetPartyId, day, time);

        setTimeSelectionModal({ isOpen: false, member: null, targetPartyId: null });
    };

    const toggleAttendance = async (ownerName: string) => {
        const isExcluded = excludedOwners.includes(ownerName);
        const newExcluded = isExcluded
            ? excludedOwners.filter(name => name !== ownerName)
            : [...excludedOwners, ownerName];

        setExcludedOwners(newExcluded);

        if (!testMode && isAdmin) {
            try {
                await set(ref(db, `${dbPath.raidAttendance}/excludedOwners`), newExcluded);
            } catch (e) {
                console.error("Failed to save attendance:", e);
            }
        }

        // Re-calculate applications if in fixed mode
        if (mode === 'fixed') {
            const applicants: Member[] = [
                ...allMembers.filter(m => !newExcluded.includes(m.name)),
                ...allSubChars.filter(m => m.ownerName && !newExcluded.includes(m.ownerName))
            ];
            setApplications(applicants);
        }
    };

    const handleShowTooltip = (member: Member, rect: DOMRect) => {
        setTooltipInfo({ member, rect });
    };

    const handleHideTooltip = () => {
        setTooltipInfo(null);
    };

    // --- Effects ---
    useEffect(() => {
        setIsMounted(true);
    }, []);
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

            // Init Parties (Default 2 Forces = 4 Parties)
            setParties(Array.from({ length: 4 }, (_, i) => ({
                id: `party-${i + 1}`, name: `${i + 1}파티`, members: []
            })));
            return;
        }

        const loadData = async () => {
            // 1. Load Roster (members)
            const membersRef = ref(db, dbPath.members);
            onValue(membersRef, (memberSnap) => {
                const memberData = memberSnap.val();
                const rosterRaw: Member[] = memberData ? Object.values(memberData).map((m: any) => ({
                    id: m.id, name: m.name, class: m.class || '검성',
                    power: m.power || 0, score: m.score || 0, rank: m.rank || '',
                    availability: m.availability
                })) : [];

                // 2. Load Sub-Characters
                const subCharsRef = ref(db, dbPath.subCharacters);
                onValue(subCharsRef, (subSnap) => {
                    const subData = subSnap.val();
                    const subListRaw: Member[] = subData ? Object.values(subData).map((m: any) => ({
                        id: m.id, name: m.name, class: m.class || '검성',
                        power: m.power || 0, score: m.score || 0, rank: '',
                        ownerName: m.ownerName,
                        isSub: true
                    })) : [];

                    // Derive dynamic fixedGroups based on subList ownerNames
                    const groupedOwners = new Set<string>();
                    subListRaw.forEach(s => {
                        if (s.ownerName) groupedOwners.add(s.ownerName);
                    });
                    
                    const roster = rosterRaw.map(m => ({
                        ...m,
                        fixedGroupId: groupedOwners.has(m.name) ? m.name : undefined
                    }));

                    const subList = subListRaw.map(m => ({
                        ...m,
                        fixedGroupId: m.ownerName
                    }));

                    setAllMembers(roster);
                    setAllSubChars(subList);

                    // Update fixedGroups UI State for the modal
                    const dynamicFixedGroups: FixedGroup[] = Array.from(groupedOwners).map((ownerName, idx) => {
                        const colors = ['bg-rose-500', 'bg-indigo-500', 'bg-emerald-500', 'bg-orange-500', 'bg-purple-500', 'bg-amber-500', 'bg-cyan-500', 'bg-pink-500'];
                        const groupMembers: string[] = [ownerName, ...subList.filter(s => s.ownerName === ownerName).map(s => s.name)];
                        
                        let savedColor = null;
                        try {
                            const groupColors = JSON.parse(localStorage.getItem('groupColors') || '{}');
                            savedColor = groupColors[ownerName];
                        } catch (e) {}

                        return {
                            id: ownerName,
                            name: ownerName,
                            color: savedColor || colors[idx % colors.length],
                            memberIds: groupMembers
                        };
                    });
                    setFixedGroups(dynamicFixedGroups);

                    // 3. Load Attendance (Excluded Owners)
                    const attendanceRef = ref(db, dbPath.raidAttendance);
                    onValue(attendanceRef, (attSnap) => {
                        const attData = attSnap.val();
                        const excluded = attData?.excludedOwners || [];
                        setExcludedOwners(excluded);

                        if (mode === 'fixed') {
                            // In fixed mode, applications are derived from roster + subList
                            const applicants: Member[] = [
                                ...roster.filter(m => !excluded.includes(m.name)),
                                ...subList.filter(m => m.ownerName && !excluded.includes(m.ownerName))
                            ];
                            setApplications(applicants);
                        } else {
                            // In legion mode, load from raidApplications
                            const appsRef = ref(db, dbPath.raidApplications);
                            onValue(appsRef, (appSnap) => {
                                const appData = appSnap.val();
                                if (appData) {
                                    const appList = Object.values(appData) as any[];
                                    const applicantList: Member[] = appList.map(app => {
                                        const rosterMember = roster.find(m => m.name === app.nickname);
                                        const subMember = subList.find(m => m.name === app.nickname);
                                        const foundMember = rosterMember || subMember;
                                        return {
                                            id: app.id || app.nickname,
                                            name: app.nickname,
                                            class: app.class || (foundMember?.class) || '검성',
                                            power: app.power || (foundMember?.power) || 0,
                                            score: foundMember?.score || 0,
                                            rank: foundMember?.rank || '',
                                            availability: app.availability,
                                            fixedGroupId: foundMember?.fixedGroupId
                                        };
                                    });
                                    setApplications(applicantList);
                                } else {
                                    setApplications([]);
                                }
                            }, { onlyOnce: true });
                        }
                    }, { onlyOnce: true });
                }, { onlyOnce: true });
            }, { onlyOnce: true });
        };
        loadData();
    }, [testMode, mode, dbPath]);

    // 2. Real-time Sync for Parties
    useEffect(() => {
        if (testMode) {
            setParties(Array.from({ length: 4 }, (_, i) => ({
                id: `party-${i + 1}`, name: `${i + 1}파티`, members: []
            })));
            return;
        }

        const sessionRef = ref(db, dbPath.raidMatchingSession);
        const unsubscribe = onValue(sessionRef, (snap) => {
            const data = snap.val();
            if (data && data.parties && Array.isArray(data.parties)) {
                // Sanitize: Firebase might omit empty arrays
                const sanitized = data.parties.map((p: any) => ({
                    ...p,
                    members: p.members || []
                }));
                setParties(sanitized);
                setServerVersion(data.version || 0);
            } else if (data && data.parties) {
                // handle non-array if somehow corrupted but parties exist
            } else {
                const initialParties = Array.from({ length: 4 }, (_, i) => ({
                    id: `party-${i + 1}`, name: `${i + 1}파티`, members: []
                }));
                if (isAdmin) {
                    set(sessionRef, {
                        parties: initialParties,
                        version: 1
                    });
                } else {
                    setParties(initialParties);
                    setServerVersion(0);
                }
            }
        });

        return () => unsubscribe();
    }, [testMode, isAdmin]);

    // 3. Derived Pool: Automatically calculate rest members from applications
    useEffect(() => {
        if (applications.length === 0) {
            setPool([]);
            return;
        }

        const assignedIds = new Set(parties.flatMap(p => (p.members || []).map(m => m.id)));
        const newPool = applications.filter(a => !assignedIds.has(a.id) && a.power >= 2700);

        // Apply UI Filters
        const uiFilteredPool = newPool.filter(m => {
            const matchSearch = m.name.toLowerCase().includes(searchTerm.toLowerCase());
            const matchClass = filterClass === 'ALL' || m.class === filterClass;
            const matchSchedule = mode === 'fixed' || selectedDay === 'ALL' || (m.availability?.[selectedDay]?.length || 0) > 0;
            return matchSearch && matchClass && matchSchedule;
        });

        uiFilteredPool.sort((a, b) => b.power - a.power);
        setPool(uiFilteredPool);
    }, [applications, parties, searchTerm, filterClass, selectedDay]);

    // 4. Save Helper with Version Check (Method C)
    const saveMatchingState = async (updatedParties: Party[]) => {
        if (!isAdmin || testMode) return false;

        try {
            const sessionRef = ref(db, dbPath.raidMatchingSession);
            const snapshot = await get(sessionRef);
            const data = snapshot.val();
            const remoteVersion = data?.version || 0;

            // version check
            if (remoteVersion > serverVersion) {
                setConfirmationModal({
                    isOpen: true,
                    isDanger: true,
                    title: "⚠️ 데이터 동기화 충돌",
                    message: (
                        <div className="space-y-2">
                            <p>다른 관리자가 데이터를 수정했습니다.</p>
                            <p className="text-xs text-slate-500">현재 버전: {serverVersion} / 서버 버전: {remoteVersion}</p>
                            <p className="font-bold text-rose-600">최신 데이터를 불러오기 위해 새로고침이 필요합니다.</p>
                        </div>
                    ),
                    onConfirm: () => window.location.reload(),
                    onCancel: () => setConfirmationModal(prev => ({ ...prev, isOpen: false })),
                });
                return false;
            }

            const serializedParties = JSON.parse(JSON.stringify(updatedParties));
            await set(ref(db, `${dbPath.raidMatchingSession}/parties`), serializedParties);
            await set(ref(db, `${dbPath.raidMatchingSession}/version`), remoteVersion + 1);
            return true;
        } catch (e) {
            console.error("Save failed", e);
            return false;
        }
    };

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
                const snapshot = await get(ref(db, dbPath.fixedGroups));
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
                    set(ref(db, dbPath.fixedGroups), defaults); // Create initial
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

    // 2.5 Load Algo Settings from DB
    useEffect(() => {
        if (testMode) {
            setIsAlgoLoaded(true);
            return;
        }

        const loadAlgoSettings = async () => {
            try {
                const snapshot = await get(ref(db, `${dbPath.raidMatchingSession}/algo_settings`));
                if (snapshot.exists()) {
                    const data = snapshot.val();
                    if (Array.isArray(data)) {
                        setAlgoCards(data);
                    }
                }
            } catch (e) {
                console.error("Failed to load algo settings", e);
            } finally {
                setIsAlgoLoaded(true);
            }
        };
        loadAlgoSettings();
    }, [testMode]);

    useEffect(() => {
        if (!isFixedGroupsLoaded) return;
        if (testMode || !isAdmin) return; // Disable Save in Test Mode or if not Admin

        // Remove undefined values before saving to Firebase
        const serialized = JSON.parse(JSON.stringify(fixedGroups));
        set(ref(db, dbPath.fixedGroups), serialized);
    }, [fixedGroups, isFixedGroupsLoaded, testMode, isAdmin]);

    // Sync Algo Settings to DB
    useEffect(() => {
        if (!isAlgoLoaded) return;
        if (testMode || !isAdmin) return;

        const serialized = JSON.parse(JSON.stringify(algoCards));
        set(ref(db, `${dbPath.raidMatchingSession}/algo_settings`), serialized);
    }, [algoCards, isAlgoLoaded, testMode, isAdmin]);


    // --- Sync Fixed Groups to Members ---
    useEffect(() => {
        if (!isMounted || allMembers.length === 0) return;

        const fixedMap = new Map<string, string>();
        fixedGroups.forEach(fg => {
            (fg.memberIds || []).forEach(mid => fixedMap.set(mid, fg.id));
        });

        const checkNeedsUpdate = (m: Member): boolean => {
            const newFixedId = fixedMap.get(m.id) || fixedMap.get(m.name);
            return m.fixedGroupId !== newFixedId;
        };

        const updateMember = (m: Member): Member => {
            const newFixedId = fixedMap.get(m.id) || fixedMap.get(m.name);
            if (m.fixedGroupId !== newFixedId) {
                return { ...m, fixedGroupId: newFixedId };
            }
            return m;
        };

        const anyUpdateNeeded = allMembers.some(checkNeedsUpdate) ||
            pool.some(checkNeedsUpdate) ||
            parties.some(p => (p.members || []).some(checkNeedsUpdate));

        if (anyUpdateNeeded) {
            setAllMembers(prev => prev.some(checkNeedsUpdate) ? prev.map(updateMember) : prev);
            setPool(prev => prev.some(checkNeedsUpdate) ? prev.map(updateMember) : prev);
            setParties(prev => prev.some(p => (p.members || []).some(checkNeedsUpdate))
                ? prev.map(p => ({
                    ...p,
                    members: (p.members || []).map(updateMember)
                }))
                : prev
            );
        }
    }, [isMounted, fixedGroups, isFixedGroupsLoaded, allMembers, pool, parties]);

    // --- Helper Functions ---
    const getSlotLabel = (id: string) => {
        const slot = [...WEEKDAY_SLOTS, ...WEEKEND_SLOTS].find(s => s.id === id);
        return slot ? slot.label : id;
    };

    const getDayDate = (dayName: string) => {
        const days = ['일', '월', '화', '수', '목', '금', '토'];
        const targetIdx = days.indexOf(dayName);
        if (targetIdx === -1) return '';
        const now = new Date();
        const currentDayIdx = now.getDay();
        let diff = targetIdx - currentDayIdx;
        if (diff < 0) diff += 7;
        const d = new Date(now);
        d.setDate(now.getDate() + diff);
        return `${d.getMonth() + 1}/${d.getDate()}`;
    };

    const findMember = (id: string) => {
        const inPool = pool.find(m => m.id === id);
        if (inPool) return inPool;
        for (const p of parties) {
            const inParty = p.members.find(m => m.id === id);
            if (inParty) return inParty;
        }
        return allMembers.find(m => m.id === id);
    };

    const findContainer = (id: string): string | undefined => {
        if (id === 'pool') return 'pool';
        if (pool.find(m => m.id === id)) return 'pool';
        const party = parties.find(p => p.members.find(m => m.id === id));
        return party ? party.id : undefined;
    };

    const executeMove = (memberId: string, targetContainerId: string, overrideDay?: string, overrideTime?: string) => {
        const member = findMember(memberId);
        if (!member) return;

        let newParties = parties.map(p => ({ ...p, members: [...p.members] }));

        // Remove from Source
        const sourceContainer = findContainer(memberId);
        if (sourceContainer && sourceContainer !== 'pool') {
            const p = newParties.find(p => p.id === sourceContainer);
            if (p) {
                p.members = p.members.filter(m => m.id !== memberId);
            }
        }

        // Add to Target
        if (targetContainerId !== 'pool') {
            const p = newParties.find(p => p.id === targetContainerId);
            if (p) {
                if (p.members.length >= 4) {
                    setConfirmationModal({
                        isOpen: true,
                        isDanger: true,
                        title: "인원 초과",
                        message: "한 파티는 최대 4명까지만 구성할 수 있습니다.",
                        onConfirm: () => setConfirmationModal(prev => ({ ...prev, isOpen: false })),
                        onCancel: () => setConfirmationModal(prev => ({ ...prev, isOpen: false }))
                    });
                    return;
                }
                p.members.push(member);

                // Auto-set time if first member in FORCE OR Override is provided
                const partyIdx = newParties.findIndex(pIdx => pIdx.id === targetContainerId);
                if (partyIdx !== -1) {
                    const forceIdx = Math.floor(partyIdx / 2);
                    const p1 = newParties[forceIdx * 2];
                    const p2 = newParties[forceIdx * 2 + 1];

                    // IF override exists, use it. Otherwise use filter values only if NOT already set.
                    if (overrideDay && overrideTime) {
                        p1.assignedDay = overrideDay;
                        p1.assignedTime = overrideTime;
                        if (p2) {
                            p2.assignedDay = overrideDay;
                            p2.assignedTime = overrideTime;
                        }
                    } else if (selectedSlot && (!p1.assignedTime || !p2.assignedTime)) {
                        const day = selectedDay === 'ALL' ? '수' : selectedDay;
                        p1.assignedDay = day;
                        p1.assignedTime = selectedSlot;
                        if (p2) {
                            p2.assignedDay = day;
                            p2.assignedTime = selectedSlot;
                        }
                    }
                }
            }
        }

        saveMatchingState(newParties).then(success => {
            if (success) {
                setParties(newParties);
            }
        });
    };

    // --- Algo Handlers ---
    const handleAlgoDragStart = (event: DragStartEvent) => {
        setActiveAlgoId(event.active.id as string);
    };

    const handleAlgoDragOver = (event: DragOverEvent) => {
        if (!isAdmin) return;
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
        if (!isAdmin) {
            alert("관리자 권한이 필요합니다.\n(좌측 하단에서 로그인을 진행해주세요)");
            return;
        }
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

    const handleCopyForcesText = () => {
        if (parties.length === 0) {
            alert("구성된 포스가 없습니다.");
            return;
        }

        let fullText = "";
        const numForces = Math.ceil(parties.length / 2);

        for (let i = 0; i < numForces; i++) {
            const forceNumber = i + 1;
            const p1 = parties[i * 2];
            const p2 = parties[i * 2 + 1];

            const forceDay = p1?.assignedDay || p2?.assignedDay;
            const forceTime = p1?.assignedTime || p2?.assignedTime;

            // Header: 5포스 - 일요일 오후 8시
            const dayLabel = forceDay ? (forceDay + "요일") : "시간 미정";
            const timeLabel = forceTime ? getSlotLabel(forceTime) : "";

            fullText += `${forceNumber}포스 - ${dayLabel} ${timeLabel}\n\n`;

            // Column Alignment (using a fixed width for the first column)
            // Korean characters are wider, usually treated as 2 spaces in monospaced fonts.
            // In KakaoTalk/Discord, we'll try to provide enough spacing.
            for (let j = 0; j < 4; j++) {
                const m1 = p1?.members[j];
                const m2 = p2?.members[j];

                const name1 = m1 ? m1.name : "(공팟인원)";
                const name2 = m2 ? m2.name : "(공팟인원)";

                // Heuristic padding: pad the first name to a certain length. 
                // We'll use multiple spaces to ensure a visible gap.
                const name1Display = name1.padEnd(16, ' ');
                fullText += `${name1Display}  ${name2}\n`;
            }

            if (i < numForces - 1) {
                fullText += "\n------------------------------\n";
            }
        }

        navigator.clipboard.writeText(fullText.trim()).then(() => {
            setCopySuccess(true);
            setTimeout(() => setCopySuccess(false), 2000);
        }).catch(err => {
            console.error("Copy failed", err);
            alert("복사에 실패했습니다. 브라우저 권한을 확인해주세요.");
        });
    };

    // toggleAlgo removed as we use status now, and clicking is not the primary interaction
    // const toggleAlgo = (id: string) => { ... }

    // --- Handlers ---
    const handleDragStart = (event: DragStartEvent) => {
        const member = findMember(event.active.id as string);
        if (member) setDraggedMember(member);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        if (!isAdmin) {
            alert("관리자 권한이 필요합니다.\n(좌측 하단에서 로그인을 진행해주세요)");
            return;
        }
        const { active, over } = event;
        setDraggedMember(null);
        if (!over) return;

        const memberId = active.id as string;
        let targetId = over.id as string;

        // If dropped on member, find container
        const overMember = findMember(targetId);
        if (overMember) {
            targetId = findContainer(targetId) || 'pool';
        }

        const sourceId = findContainer(memberId);
        if (sourceId === targetId) return;

        const member = findMember(memberId);
        if (!member) return;

        // Validation: Time Conflict
        if (targetId !== 'pool') {
            const targetParty = parties.find(p => p.id === targetId);
            if (targetParty) {
                const partyIdx = parties.findIndex(p => p.id === targetId);
                const forceIdx = Math.floor(partyIdx / 2);
                const p1 = parties[forceIdx * 2];
                const p2 = parties[forceIdx * 2 + 1];

                // Use Force-level time for validation
                const assignedDay = p1.assignedDay || p2?.assignedDay;
                const assignedTime = p1.assignedTime || p2?.assignedTime;

                // --- NEW LOGIC: If Force Time is NOT set ---
                if (!assignedDay || !assignedTime) {
                    // NEW: Handle Priority - If filters are already selected, use them immediately
                    if (selectedDay !== 'ALL' && selectedSlot) {
                        executeMove(memberId, targetId, selectedDay, selectedSlot);
                        return;
                    }

                    // Check if member actually has any availability to offer
                    const hasAvailability = RAID_DAYS.some(day => (member.availability?.[day]?.length || 0) > 0);

                    if (hasAvailability) {
                        setTimeSelectionModal({
                            isOpen: true,
                            member,
                            targetPartyId: targetId
                        });
                        return; // Stop default execution
                    } else {
                        // Minimalist feedback if member has 0 availability
                        alert(`${member.name}님은 신청한 시간대가 없어 포스 시간을 자동 설정할 수 없습니다.`);
                        return;
                    }
                }

                if (assignedDay && assignedTime) {
                    // Skip validation if moving within the same Force (Avoid redundant alerts)
                    if (sourceId && sourceId !== 'pool') {
                        const sourceIdx = parties.findIndex(p => p.id === sourceId);
                        if (Math.floor(sourceIdx / 2) === forceIdx) {
                            executeMove(memberId, targetId);
                            return;
                        }
                    }

                    // 1. Fixed Group Smart Check: Check if duplicate owner in target party
                    if (member.fixedGroupId) {
                        if (targetParty) {
                            const hasDuplicate = targetParty.members.some(pm => pm.fixedGroupId === member.fixedGroupId && pm.id !== member.id);
                            if (hasDuplicate) {
                                setConfirmationModal({
                                    isOpen: true,
                                    isDanger: true,
                                    message: `선택한 파티에 이미 동일한 계정 소유자(본캐/부캐 그룹)의 캐릭터가 있습니다.\n\n그래도 여기에 배치하시겠습니까?`,
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
                    if ((!member.availability?.[assignedDay]?.includes(assignedTime))) {
                        setConfirmationModal({
                            isOpen: true,
                            isDanger: true,
                            message: (
                                <>
                                    {member.name}님은 포스 시간인 {assignedDay}({getDayDate(assignedDay)}) {getSlotLabel(assignedTime)}에<br />
                                    <span className="text-rose-500 font-bold">신청하지 않았습니다.</span><br /><br />
                                    강제로 배정하시겠습니까?
                                </>
                            ),
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

            groupMembers.forEach(m => {
                const isCleric = m.class === '치유성';
                const targetParty = partiesToMatch.find(p => {
                    const hasGroupMember = p.members.some(pm => pm.fixedGroupId === gid);
                    if (hasGroupMember) return false;

                    if (isCleric) {
                        return p.members.length < 4 && !p.members.some(pm => pm.class === '치유성');
                    } else {
                        return p.members.length < 3;
                    }
                });

                if (targetParty) {
                    targetParty.members.push(m);
                    usedIds.push(m.id);
                }
            });
        });
        return usedIds;
    };

    const matchTankHealer = (partiesToMatch: Party[], candidates: Member[]) => {
        let usedIds: string[] = [];
        partiesToMatch.forEach(p => {
            // Tank
            if (!p.members.some(m => ['수호성', '검성'].includes(m.class))) {
                const tank = candidates.find(m => !usedIds.includes(m.id) && ['수호성', '검성'].includes(m.class) && (!m.fixedGroupId || !p.members.some(pm => pm.fixedGroupId === m.fixedGroupId)));
                if (tank) {
                    p.members.push(tank);
                    usedIds.push(tank.id);
                }
            }
            // Healer
            if (!p.members.some(m => ['치유성', '호법성'].includes(m.class))) {
                const healer = candidates.find(m => !usedIds.includes(m.id) && ['치유성', '호법성'].includes(m.class) && (!m.fixedGroupId || !p.members.some(pm => pm.fixedGroupId === m.fixedGroupId)));
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
                const ace = candidates.find(m => !usedIds.includes(m.id) && (!m.fixedGroupId || !p.members.some(pm => pm.fixedGroupId === m.fixedGroupId)));
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
        const sorted = [...candidates].sort((a, b) => b.power - a.power);

        for (const m of sorted) {
            if (usedIds.includes(m.id)) continue;

            const isCleric = m.class === '치유성';

            // Find target party with lowest power among those with valid space
            const availableParties = partiesToMatch.filter(p => {
                if (m.fixedGroupId && p.members.some(pm => pm.fixedGroupId === m.fixedGroupId)) return false;

                const nonClericCount = p.members.filter(pm => pm.class !== '치유성').length;
                if (isCleric) {
                    return p.members.length < 4 && !p.members.some(pm => pm.class === '치유성');
                } else {
                    return nonClericCount < 3;
                }
            });

            if (availableParties.length === 0) continue;

            const targetParty = availableParties.reduce((prev, curr) => {
                const prevPower = prev.members.reduce((sum, pm) => sum + pm.power, 0);
                const currPower = curr.members.reduce((sum, pm) => sum + pm.power, 0);
                return prevPower <= currPower ? prev : curr;
            });

            targetParty.members.push(m);
            usedIds.push(m.id);
        }
        return usedIds;
    };

    const matchClassSynergy = (partiesToMatch: Party[], candidates: Member[]) => {
        let usedIds: string[] = [];

        partiesToMatch.forEach(p => {
            const hasMagic = p.members.some(m => ['마도성', '정령성'].includes(m.class));
            const hasPhys = p.members.some(m => ['검성', '살성', '궁성'].includes(m.class));

            if (p.members.length < 4) {
                let type = hasMagic ? 'MAGIC' : (hasPhys ? 'PHYS' : 'ANY');

                if (type === 'MAGIC') {
                    const mage = candidates.find(m => !usedIds.includes(m.id) && ['마도성', '정령성'].includes(m.class) && (!m.fixedGroupId || !p.members.some(pm => pm.fixedGroupId === m.fixedGroupId)));
                    if (mage) {
                        p.members.push(mage);
                        usedIds.push(mage.id);
                    }
                } else if (type === 'PHYS') {
                    const phys = candidates.find(m => !usedIds.includes(m.id) && ['검성', '살성', '궁성'].includes(m.class) && (!m.fixedGroupId || !p.members.some(pm => pm.fixedGroupId === m.fixedGroupId)));
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
            for (let i = 0; i < sorted.length; i++) {
                const m = sorted[i];
                const isCleric = m.class === '치유성';
                const nonClericCount = p.members.filter(pm => pm.class !== '치유성').length;

                let canAdd = false;
                if (isCleric) {
                    canAdd = p.members.length < 4 && !p.members.some(pm => pm.class === '치유성');
                } else {
                    canAdd = nonClericCount < 3;
                }

                if (canAdd && (!m.fixedGroupId || !p.members.some(pm => pm.fixedGroupId === m.fixedGroupId))) {
                    p.members.push(m);
                    used.push(m.id);
                    sorted.splice(i, 1);
                    i--;
                }
            }
        }
        return used;
    };

    const matchMainTank = (partiesToMatch: Party[], candidates: Member[]) => {
        const used: string[] = [];
        let tanks = candidates.filter(m => ['수호성', '검성'].includes(m.class)).sort((a, b) => b.power - a.power);
        partiesToMatch.forEach(p => {
            if (p.members.some(m => ['수호성', '검성'].includes(m.class))) return;
            // Cap at 3 for non-cleric slots
            if (p.members.length < 3) {
                const tIdx = tanks.findIndex(m => (!m.fixedGroupId || !p.members.some(pm => pm.fixedGroupId === m.fixedGroupId)));
                if (tIdx !== -1) {
                    const t = tanks[tIdx];
                    p.members.push(t);
                    used.push(t.id);
                    tanks.splice(tIdx, 1);
                }
            }
        });
        return used;
    };

    const matchResurrectionAnchor = (partiesToMatch: Party[], candidates: Member[]) => {
        const used: string[] = [];
        let clerics = candidates.filter(m => m.class === '치유성').sort((a, b) => b.power - a.power);
        partiesToMatch.forEach(p => {
            if (p.members.some(m => m.class === '치유성')) return;
            // Cleric is the ONLY one who can fill up to 4
            if (p.members.length < 4) {
                const cIdx = clerics.findIndex(m => (!m.fixedGroupId || !p.members.some(pm => pm.fixedGroupId === m.fixedGroupId)));
                if (cIdx !== -1) {
                    const c = clerics[cIdx];
                    p.members.push(c);
                    used.push(c.id);
                    clerics.splice(cIdx, 1);
                }
            }
        });
        return used;
    };

    const matchSafetyOptimization = (partiesToMatch: Party[], candidates: Member[]) => {
        const used: string[] = [];
        let chanters = candidates.filter(m => m.class === '호법성').sort((a, b) => b.power - a.power);
        partiesToMatch.forEach(p => {
            // Cap at 3 for Chanters (unless they are clerics, but they aren't)
            if (p.members.length >= 3) return;
            const hasGladTank = p.members.some(m => m.class === '검성');
            const hasTemplar = p.members.some(m => m.class === '수호성');
            const hasChanter = p.members.some(m => m.class === '호법성');
            if (hasGladTank && !hasTemplar && !hasChanter) {
                const chIdx = chanters.findIndex(m => (!m.fixedGroupId || !p.members.some(pm => pm.fixedGroupId === m.fixedGroupId)));
                if (chIdx !== -1) {
                    const ch = chanters[chIdx];
                    p.members.push(ch);
                    used.push(ch.id);
                    chanters.splice(chIdx, 1);
                }
            }
        });
        return used;
    };

    const matchCombatLogic = (partiesToMatch: Party[], candidates: Member[]) => {
        const used: string[] = [];
        partiesToMatch.forEach(p => {
            // Cap at 3
            if (p.members.length >= 3) return;
            const melees = p.members.filter(m => ['수호성', '검성', '살성', '호법성'].includes(m.class)).length;
            const ranges = p.members.filter(m => ['마도성', '정령성', '궁성'].includes(m.class)).length;
            let targetType = '';
            if (melees > ranges + 1) targetType = 'RANGE';
            else if (ranges > melees + 1) targetType = 'MELEE';
            else return;
            const poolCands = candidates.filter(m => !used.includes(m.id) && (!m.fixedGroupId || !p.members.some(pm => pm.fixedGroupId === m.fixedGroupId)));
            let pick: Member | undefined;
            if (targetType === 'RANGE') {
                pick = poolCands.find(m => ['마도성', '정령성', '궁성'].includes(m.class));
            } else {
                pick = poolCands.find(m => ['수호성', '검성', '살성'].includes(m.class));
            }
            if (pick) {
                p.members.push(pick);
                used.push(pick.id);
            }
        });
        return used;
    };

    const matchAttendanceVolume = (partiesToMatch: Party[], candidates: Member[]) => {
        return matchPowerBalance(partiesToMatch, candidates);
    };


    const handleSmartAutoMatch = async () => {
        if (pool.length === 0) return alert('대기 멤버가 없습니다.');
        const { targetScope } = matchOptions;

        // 1. Prepare
        let workingPool = [...pool];
        let workingParties = parties.map(p => ({ ...p, members: [...p.members] }));

        if (targetScope === 'RESHUFFLE') {
            workingParties.forEach(p => {
                p.members.forEach(m => workingPool.push(m));
                p.members = [];
            });
            workingPool = Array.from(new Map(workingPool.map(m => [m.id, m])).values());
        }

        // Essential / Priority Cards
        const essentialCards = algoCards.filter(c => c.status === 'ESSENTIAL' && (mode !== 'fixed' || c.id !== 'schedule_gating'));
        const priorityCards = algoCards.filter(c => c.status === 'PRIORITY');
        const priorityWeights = [10000, 5000, 1000, 500, 100, 50, 10];

        // Scoring Function
        const calculateTotalScore = (currentParties: Party[], currentPool: Member[]) => {
            let score = 0;

            // --- 1. Essential Penalties ---
            essentialCards.forEach(card => {
                let violations = 0;
                currentParties.forEach((p, idx) => {
                    const forceIdx = Math.floor(idx / 2);
                    const p1 = currentParties[forceIdx * 2];
                    const p2 = currentParties[forceIdx * 2 + 1];
                    const forceMembers = [...p1.members, ...(p2?.members || [])];
                    const forceDay = p1.assignedDay;
                    const forceTime = p1.assignedTime;

                    if (card.id === 'schedule_gating') {
                        // Check if schedule is respected
                    }

                    // Simple heuristic for common rules if card IDs match
                    if (card.id === 'fixed_group') {
                        // Check if fixed groups are broken
                    }
                });
                // Since exact evaluation of every complex card in a tight loop is heavy, 
                // we'll focus on the core user-defined cards.

                // Let's implement specific evaluators for each card type
                const evaluateCard = (cardId: string, partiesToEval: Party[]) => {
                    let v = 0;
                    switch (cardId) {
                        case 'schedule_gating':
                            if (mode === 'fixed') return 0;
                            partiesToEval.forEach(p => {
                                if (!p.assignedDay || !p.assignedTime) return;
                                p.members.forEach(m => {
                                    if (!m.availability?.[p.assignedDay!]?.includes(p.assignedTime!)) v++;
                                });
                            });
                            break;
                        case 'resurrection_anchor': // Cleric per party
                            partiesToEval.forEach(p => {
                                if (p.members.length > 0 && !p.members.some(m => m.class === '치유성')) v++;
                            });
                            break;
                        case 'main_tank': // Tank per party
                            partiesToEval.forEach(p => {
                                if (p.members.length > 0 && !p.members.some(m => ['수호성', '검성'].includes(m.class))) v++;
                            });
                            break;
                        case 'fixed_group':
                            {
                                // Check for fixed group split with intersection rule:
                                // If members have an overlapping time, they must be in the same force.
                                // If no overlapping time is possible, splitting is not penalized.
                                const groups = new Set(currentPool.concat(partiesToEval.flatMap(p => p.members)).map(m => m.fixedGroupId).filter(Boolean));
                                groups.forEach(gid => {
                                    const gMembers = currentPool.concat(partiesToEval.flatMap(p => p.members)).filter(m => m.fixedGroupId === gid);
                                    if (gMembers.length <= 1) return;

                                    // Intersection check across ALL group members
                                    let hasOverlap = false;
                                    for (const day of RAID_DAYS) {
                                        let intersection = gMembers[0].availability?.[day] || [];
                                        for (let i = 1; i < gMembers.length; i++) {
                                            const slots = gMembers[i].availability?.[day] || [];
                                            intersection = intersection.filter(s => slots.includes(s));
                                            if (intersection.length === 0) break;
                                        }
                                        if (intersection.length > 0) {
                                            hasOverlap = true;
                                            break;
                                        }
                                    }

                                    if (!hasOverlap) return; // No possibility to be together, no penalty for splitting

                                    const forceIndices = gMembers.map(m => {
                                        const pIdx = partiesToEval.findIndex(p => p.members.some(pm => pm.id === m.id));
                                        return pIdx === -1 ? -1 : Math.floor(pIdx / 2);
                                    });

                                    const assignedForceIds = forceIndices.filter(idx => idx !== -1);
                                    if (assignedForceIds.length > 0) {
                                        const firstForce = assignedForceIds[0];
                                        // Penalty if split across forces OR some are left in pool when they COULD have joined a force together
                                        if (assignedForceIds.some(idx => idx !== firstForce) || forceIndices.some(idx => idx === -1)) {
                                            v++;
                                        }
                                    }
                                });
                            }
                            break;
                    }
                    return v;
                };

                const vCount = evaluateCard(card.id, currentParties);
                score -= vCount * 100000;
            });

            // --- 2. Priority Bonuses ---
            priorityCards.forEach((card, idx) => {
                const weight = priorityWeights[idx] || 0;
                const evaluateCardPriority = (cardId: string, partiesToEval: Party[]) => {
                    let bonus = 0;
                    switch (cardId) {
                        case 'power_balance':
                            // Lower variance of power between forces
                            const forcePowers = [];
                            for (let i = 0; i < partiesToEval.length / 2; i++) {
                                const p1 = partiesToEval[i * 2];
                                const p2 = partiesToEval[i * 2 + 1];
                                const p = (p1.members.reduce((s, m) => s + m.power, 0) + (p2?.members.reduce((s, m) => s + m.power, 0) || 0));
                                forcePowers.push(p);
                            }
                            const avg = forcePowers.length > 0 ? forcePowers.reduce((a, b) => a + b, 0) / forcePowers.length : 0;
                            const variance = forcePowers.reduce((s, p) => s + Math.abs(p - avg), 0);
                            bonus = Math.max(0, 1000 - (variance / 100));
                            break;
                        case 'safety_opt':
                            // Parties with both tank and healer
                            partiesToEval.forEach(p => {
                                const hasTank = p.members.some(m => ['수호성', '검성'].includes(m.class));
                                const hasHealer = p.members.some(m => ['치유성', '호법성'].includes(m.class));
                                if (hasTank && hasHealer) bonus += 1;
                            });
                            break;
                        case 'combat_logic':
                            // Melee/Range balance
                            partiesToEval.forEach(p => {
                                const melees = p.members.filter(m => ['수호성', '검성', '살성', '호법성'].includes(m.class)).length;
                                const ranges = p.members.filter(m => ['마도성', '정령성', '궁성'].includes(m.class)).length;
                                if (Math.abs(melees - ranges) <= 1) bonus += 1;
                            });
                            break;
                    }
                    return bonus;
                };
                score += evaluateCardPriority(card.id, currentParties) * weight;
            });

            // --- 3. General Bonuses ---
            // Fill parties as much as possible
            const filledCount = currentParties.reduce((sum, p) => sum + p.members.length, 0);
            score += filledCount * 1000;

            return score;
        };

        // --- Optimization Loop ---
        setIsAutoMatchModalOpen(false); // Close modal
        // Show a loading/progress indicator (we'll use alert or a dedicated state if we had one, but let's use a simple overlay logic)

        // Initial Assignment (Greedy or Random with Schedule Match)
        // For simplicity, let's just use the current pool and distribute them to forces that have their available time.
        const numForces = Math.ceil(workingParties.length / 2);

        // Set Times first if not set
        workingParties.forEach((p, i) => {
            if (i % 2 === 0) {
                if (!p.assignedDay || !p.assignedTime) {
                    // Pick a random or most popular slot
                    const allSlots = [...WEEKDAY_SLOTS, ...WEEKEND_SLOTS];
                    const bestSlot = allSlots.map(s => ({
                        day: '수', // Default
                        slot: s.id,
                        count: workingPool.filter(m => m.availability?.['수']?.includes(s.id)).length
                    })).sort((a, b) => b.count - a.count)[0];
                    p.assignedDay = bestSlot.day;
                    p.assignedTime = bestSlot.slot;
                    if (workingParties[i + 1]) {
                        workingParties[i + 1].assignedDay = bestSlot.day;
                        workingParties[i + 1].assignedTime = bestSlot.slot;
                    }
                }
            }
        });

        // Fill randomly but respecting schedule if possible
        let tempPool = [...workingPool];
        workingParties.forEach(p => {
            const availableForThis = tempPool.filter(m => m.availability?.[p.assignedDay!]?.includes(p.assignedTime!));
            while (p.members.length < 4 && availableForThis.length > 0) {
                const m = availableForThis.shift()!;
                p.members.push(m);
                tempPool = tempPool.filter(tm => tm.id !== m.id);
            }
        });
        // Rest of pool
        workingParties.forEach(p => {
            while (p.members.length < 4 && tempPool.length > 0) {
                p.members.push(tempPool.shift()!);
            }
        });
        workingPool = tempPool;

        let bestScore = calculateTotalScore(workingParties, workingPool);
        let bestState = JSON.parse(JSON.stringify(workingParties));
        let bestPool = JSON.parse(JSON.stringify(workingPool));

        const iterations = 50000; // Increased for 100 people

        for (let i = 0; i < iterations; i++) {
            // Random action: Swap two members or move one from pool
            // Optimized shallow clone for performance
            const newParties = workingParties.map(p => ({ ...p, members: [...p.members] }));
            let newPool = [...workingPool];

            const action = Math.random();
            if (action < 0.6 && newParties.length > 0) {
                // Swap two members between different forces or parties
                const p1Idx = Math.floor(Math.random() * newParties.length);
                const p2Idx = Math.floor(Math.random() * newParties.length);
                if (newParties[p1Idx].members.length > 0 && newParties[p2Idx].members.length > 0) {
                    const m1Idx = Math.floor(Math.random() * newParties[p1Idx].members.length);
                    const m2Idx = Math.floor(Math.random() * newParties[p2Idx].members.length);
                    const temp = newParties[p1Idx].members[m1Idx];
                    newParties[p1Idx].members[m1Idx] = newParties[p2Idx].members[m2Idx];
                    newParties[p2Idx].members[m2Idx] = temp;
                }
            } else if (action < 0.9 && newPool.length > 0) {
                // Swap one from pool with one from party
                const pIdx = Math.floor(Math.random() * newParties.length);
                if (newParties[pIdx].members.length > 0) {
                    const m1Idx = Math.floor(Math.random() * newParties[pIdx].members.length);
                    const poolIdx = Math.floor(Math.random() * newPool.length);
                    const temp = newParties[pIdx].members[m1Idx];
                    newParties[pIdx].members[m1Idx] = newPool[poolIdx];
                    newPool[poolIdx] = temp;
                }
            }

            const currentScore = calculateTotalScore(newParties, newPool);
            if (currentScore >= bestScore) {
                bestScore = currentScore;
                workingParties = newParties;
                workingPool = newPool;
                bestState = JSON.parse(JSON.stringify(newParties));
                bestPool = JSON.parse(JSON.stringify(newPool));
            }
        }

        saveMatchingState(bestState).then(success => {
            if (success) {
                setParties(bestState);
                alert(`스마트 매칭 완료!\n최적화 점수: ${bestScore.toLocaleString()}점`);
                setIsAutoMatchModalOpen(false);
            } else {
                setIsAutoMatchModalOpen(false);
            }
        });
    };

    const handleAutoMatch = () => {
        if (pool.length === 0) return alert('대기 멤버가 없습니다.');
        const { targetScope, matchType } = matchOptions;

        // 1. Prepare
        let workingPool = [...pool];
        let workingParties = parties.map(p => ({ ...p, members: [...p.members] }));

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
                if (mode === 'fixed') {
                    // In fixed mode, we don't necessarily need a day/time, but let's keep it null
                    forceDay = undefined;
                    forceTime = undefined;
                } else {
                    // Unify logic: Search within selected days (for 'DAY' mode) or all days (for 'ALL' mode)
                    // This ensures we ignore the UI's 'selectedSlot' filter and pick the best available time
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

                    // Sort by score (person count) descending
                    candidateSlots.sort((a, b) => b.score - a.score);

                    if (candidateSlots.length > 0) {
                        forceDay = candidateSlots[0].day;
                        forceTime = candidateSlots[0].slot;
                    }
                }
            }

            if (mode !== 'fixed' && (!forceDay || !forceTime)) return;

            p1.assignedDay = forceDay;
            p1.assignedTime = forceTime;
            p2.assignedDay = forceDay;
            p2.assignedTime = forceTime;

            // 3. Filter Candidates for THIS Force
            let candidates = mode === 'fixed' ? [...workingPool] : workingPool.filter(m => m.availability?.[forceDay!]?.includes(forceTime!));

            // 4. Run Algorithm Pipeline (User Ordered)
            const essentialCards = algoCards.filter(c => c.status === 'ESSENTIAL' && (mode !== 'fixed' || c.id !== 'schedule_gating'));
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

        const totalAssigned = workingParties.reduce((sum, p) => sum + p.members.length, 0);
        if (totalAssigned === 0) {
            alert("매칭된 인원이 없습니다. 대기 명단이나 알고리즘 설정을 확인해주세요.");
            setIsAutoMatchModalOpen(false);
            return;
        }

        // Update State
        saveMatchingState(workingParties).then(success => {
            if (success) {
                setParties(workingParties);
                alert(`매칭 완료! (총 ${totalAssigned}명 배정됨)`);
            }
            setIsAutoMatchModalOpen(false);
        });
    };

    const resetAll = () => {
        // Reset parties to default 4 slots (2 forces)
        const initialParties = Array.from({ length: 4 }, (_, i) => ({
            id: `party-${i + 1}`,
            name: `${i + 1}파티`,
            members: [],
            assignedDay: undefined,
            assignedTime: undefined
        }));
        saveMatchingState(initialParties).then(success => {
            if (success) {
                setParties(initialParties);
                // Reset selected slot
                setSelectedSlot(undefined);
            }
        });
    };

    const addForce = () => {
        if (!isAdmin) {
            alert("관리자 권한이 필요합니다.");
            return;
        }

        const nextParty1Num = parties.length + 1;
        const nextParty2Num = parties.length + 2;

        const updatedParties = [
            ...parties,
            { id: `party-${nextParty1Num}`, name: `${nextParty1Num}파티`, members: [] },
            { id: `party-${nextParty2Num}`, name: `${nextParty2Num}파티`, members: [] }
        ];

        saveMatchingState(updatedParties).then(success => {
            if (success) {
                setParties(updatedParties);
            }
        });
    };

    const removeForce = (forceIdx: number) => {
        if (!isAdmin) {
            alert("관리자 권한이 필요합니다.");
            return;
        }

        const p1 = parties[forceIdx * 2];
        const p2 = parties[forceIdx * 2 + 1];
        const membersToReturn = [...(p1?.members || []), ...(p2?.members || [])];

        const executeDelete = () => {
            // Remove and Re-index
            const filtered = parties.filter((_, idx) => idx !== forceIdx * 2 && idx !== forceIdx * 2 + 1);
            const reindexed = filtered.map((p, idx) => ({
                ...p,
                id: `party-${idx + 1}`,
                name: `${idx + 1}파티`
            }));

            saveMatchingState(reindexed).then(success => {
                if (success) {
                    setParties(reindexed);
                    setConfirmationModal(prev => ({ ...prev, isOpen: false }));
                }
            });
        };

        if (membersToReturn.length > 0) {
            setConfirmationModal({
                isOpen: true,
                isDanger: true,
                message: `[${forceIdx + 1}포스]를 삭제하시겠습니까?\n\n배정된 멤버(${membersToReturn.length}명)는 대기 명단으로 돌아갑니다.`,
                onConfirm: executeDelete,
                onCancel: () => setConfirmationModal(prev => ({ ...prev, isOpen: false }))
            });
        } else {
            setConfirmationModal({
                isOpen: true,
                message: `${forceIdx + 1}포스를 삭제하시겠습니까?`,
                onConfirm: executeDelete,
                onCancel: () => setConfirmationModal(prev => ({ ...prev, isOpen: false }))
            });
        }
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

    const { completedForcesCount, pendingForcesCount } = React.useMemo(() => {
        const total = Math.ceil(parties.length / 2);
        const completed = Array.from({ length: total }).filter((_, i) => {
            const p1 = parties[i * 2];
            const p2 = parties[i * 2 + 1];
            return (p1?.members?.length || 0) + (p2?.members?.length || 0) === 8;
        }).length;
        return { completedForcesCount: completed, pendingForcesCount: total - completed };
    }, [parties]);

    // --- Render ---
    return (
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd} collisionDetection={closestCenter}>
            <div className="relative flex h-[calc(100vh-140px)] gap-6 animate-in fade-in duration-500">

                {/* 1. Left: Queue Dashboard */}
                <div className="w-1/3 min-w-[360px] flex flex-col bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden z-10 transition-all">
                    <div className="p-4 border-b flex justify-between items-center bg-white/50 dark:bg-slate-800/50">
                        <div className="flex items-center gap-2">
                            <h2 className="font-bold flex items-center gap-2 text-slate-700 dark:text-slate-200"><Users size={18} className="text-indigo-500" /> 대기 멤버 ({sortedPool.length})</h2>
                        </div>
                        <div className="flex gap-1">
                            <button
                                onClick={() => {
                                    if (!isAdmin) {
                                        alert("관리자 권한이 필요합니다.\n(좌측 하단에서 로그인을 진행해주세요)");
                                        return;
                                    }
                                    setIsFixedGroupModalOpen(true);
                                }}
                                className="text-xs bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 px-3 py-1.5 rounded-lg font-bold shadow-sm transition-all flex items-center gap-1 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300"
                                title="고정 파티 관리"
                            >
                                <Settings size={14} /> 설정
                            </button>

                            {mode === 'fixed' && (
                                <button
                                    onClick={() => {
                                        if (!isAdmin) {
                                            alert("관리자 권한이 필요합니다.\n(좌측 하단에서 로그인을 진행해주세요)");
                                            return;
                                        }
                                        setIsAttendanceModalOpen(true);
                                    }}
                                    className="text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-600 border border-indigo-100 px-3 py-1.5 rounded-lg font-bold shadow-sm transition-all flex items-center gap-1 dark:bg-indigo-900/20 dark:border-indigo-800 dark:text-indigo-400"
                                    title="출석 관리"
                                >
                                    <CheckCircle size={14} /> 출석 관리
                                </button>
                            )}
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
                                    <span className="text-xs font-medium">드레그 하여 수동으로도 포스 생성이 가능합니다.</span>
                                </div>
                            )}
                        </div>
                    </div>

                    <PoolContainer
                        id="pool"
                        members={sortedPool}
                        fixedGroups={fixedGroups}
                        isReadOnly={false}
                        onShowTooltip={handleShowTooltip}
                        onHideTooltip={handleHideTooltip}
                    />
                </div>

                {/* 2. Right: Party Canvas */}
                <div className="flex-1 flex flex-col min-w-0 bg-slate-50/50 dark:bg-slate-900/50 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                    <div className="p-4 border-b flex justify-between items-center bg-white/50 dark:bg-slate-800/50">
                        <div className="flex items-center gap-3">
                            <h2 className="font-bold flex items-center gap-2 text-slate-700 dark:text-slate-200">
                                <Shield size={18} className="text-rose-500" />
                                포스 구성
                            </h2>
                            <div className="flex items-center gap-2">
                                <span className="px-2.5 py-1 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[11px] font-black rounded-none border border-slate-200 dark:border-slate-700 shadow-sm transition-all">
                                    완성 : {completedForcesCount}개
                                </span>
                                <span className="px-2.5 py-1 bg-white dark:bg-slate-800 text-slate-400 dark:text-slate-500 text-[11px] font-black rounded-none border border-slate-200 dark:border-slate-700 shadow-sm transition-all">
                                    미완성 : {pendingForcesCount}개
                                </span>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => {
                                    setIsAlgoSettingsModalOpen(true);
                                }}
                                className="text-xs bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 px-3 py-1.5 rounded-lg font-bold shadow-sm transition-all flex items-center gap-1 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300"
                            >
                                <Settings2 size={14} /> 알고리즘 수정
                            </button>
                            <button
                                onClick={() => {
                                    setIsAutoMatchModalOpen(true);
                                }}
                                className="text-xs bg-indigo-500 hover:bg-indigo-600 text-white px-3 py-1.5 rounded-lg font-bold shadow-lg shadow-indigo-500/20 transition-all transform hover:scale-105 flex items-center gap-1"
                            >
                                <Sparkles size={14} /> 자동 매칭 실행
                            </button>
                            <button
                                onClick={() => {
                                    if (!isAdmin) {
                                        alert("관리자 권한이 필요합니다.\n(좌측 하단에서 로그인을 진행해주세요)");
                                        return;
                                    }
                                    setConfirmationModal({
                                        isOpen: true,
                                        isDanger: true,
                                        message: "현재 구성된 모든 포스 정보가 초기화됩니다.\n\n정말로 진행하시겠습니까?",
                                        onConfirm: () => {
                                            resetAll();
                                            setConfirmationModal(prev => ({ ...prev, isOpen: false }));
                                        },
                                        onCancel: () => setConfirmationModal(prev => ({ ...prev, isOpen: false }))
                                    });
                                }}
                                className="text-xs bg-rose-500 hover:bg-rose-600 text-white px-3 py-1.5 rounded-lg font-bold shadow-lg shadow-rose-500/20 transition-all transform hover:scale-105 flex items-center gap-1"
                            >
                                <RotateCcw size={14} /> 포스 구성 초기화
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
                                : "";

                            return (
                                <div key={`force-${forceNumber}`} className={cn(
                                    "bg-white/40 dark:bg-slate-800/40 rounded-xl border overflow-hidden transition-all duration-300",
                                    forceDay && forceTime ? "border-slate-200 dark:border-slate-700 shadow-sm" : "border-dashed border-rose-300 dark:border-rose-900/50 bg-rose-50/10"
                                )}>
                                    {/* Force Header */}
                                    <div className={cn(
                                        "px-4 py-2 border-b flex justify-between items-center",
                                        forceDay && forceTime ? "bg-slate-100/50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700" : "bg-rose-50/30 dark:bg-rose-900/10 border-rose-200 dark:border-rose-800"
                                    )}>
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-black text-slate-700 dark:text-slate-200">{forceNumber} 포스</span>
                                            {forceDay && forceTime ? (
                                                <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded border border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-700 font-bold flex items-center gap-1 animate-in zoom-in-95">
                                                    <Clock size={10} /> {forceTimeLabel}
                                                </span>
                                            ) : (
                                                <span className="text-[10px] bg-rose-100 text-rose-600 px-2 py-0.5 rounded border border-rose-200 dark:bg-rose-900/40 dark:text-rose-400 dark:border-rose-800 font-black animate-pulse flex items-center gap-1">
                                                    <AlertCircle size={10} /> 시간을 지정해 주세요
                                                </span>
                                            )}
                                            {forceDay && forceTime && (
                                                (() => {
                                                    const members = [...(party1?.members || []), ...(party2?.members || [])];
                                                    const conflictedMembers = members.filter(m => !m.availability?.[forceDay]?.includes(forceTime));
                                                    if (conflictedMembers.length === 0) return null;

                                                    return (
                                                        <div className="relative group/conflict">
                                                            <span className="text-[10px] bg-rose-500 text-white px-2 py-0.5 rounded border border-rose-600 font-black animate-pulse flex items-center gap-1 shadow-sm cursor-help transition-transform hover:scale-105 active:scale-95">
                                                                <AlertTriangle size={10} /> 미신청자 포함
                                                            </span>

                                                            {/* Conflict List Tooltip */}
                                                            <div className="absolute left-0 top-full mt-2 w-52 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-4 z-[150] opacity-0 translate-y-2 pointer-events-none group-hover/conflict:opacity-100 group-hover/conflict:translate-y-0 transition-all duration-200 ring-4 ring-black/5 dark:ring-white/5">
                                                                <p className="text-[11px] font-black text-rose-500 dark:text-rose-400 mb-3 border-b border-slate-100 dark:border-slate-800 pb-2 flex items-center gap-1.5">
                                                                    <Users size={12} className="text-rose-500" /> 확인 필요 인원 ({conflictedMembers.length})
                                                                </p>
                                                                <div className="space-y-2">
                                                                    {conflictedMembers.map(m => (
                                                                        <div key={m.id} className="flex items-center justify-between">
                                                                            <span className="text-[10px] font-bold text-slate-700 dark:text-slate-200">{m.name}</span>
                                                                            <span className="text-[9px] text-slate-500 dark:text-slate-400 font-bold px-1.5 py-0.5 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-100 dark:border-slate-700/50">{m.class}</span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-[10px] text-slate-500 dark:text-slate-400 font-medium leading-relaxed whitespace-pre-line">
                                                                    해당 인원은 {forceDay}({getNextDate(forceDay)}) {getSlotLabel(forceTime)}에{"\n"}신청하지 않았습니다.
                                                                </div>
                                                                {/* Triangle Arrow */}
                                                                <div className="absolute -top-1 left-4 w-2.5 h-2.5 bg-white dark:bg-slate-900 border-l border-t border-slate-200 dark:border-slate-800 rotate-45" />
                                                            </div>
                                                        </div>
                                                    );
                                                })()
                                            )}
                                        </div>

                                        {isAdmin && (
                                            <button
                                                onClick={() => removeForce(forceIndex)}
                                                className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-all active:scale-95"
                                                title="포스 삭제"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        )}
                                    </div>

                                    {/* Parties Grid (2 items) */}
                                    <div className="p-4 grid grid-cols-2 gap-4">
                                        {party1 && <RaidPartySlot key={party1.id} party={party1} index={forceIndex * 2} fixedGroups={fixedGroups} onShowTooltip={handleShowTooltip} onHideTooltip={handleHideTooltip} isAdmin={isAdmin} assignedDay={forceDay} assignedTime={forceTime} />}
                                        {party2 && <RaidPartySlot key={party2.id} party={party2} index={forceIndex * 2 + 1} fixedGroups={fixedGroups} onShowTooltip={handleShowTooltip} onHideTooltip={handleHideTooltip} isAdmin={isAdmin} assignedDay={forceDay} assignedTime={forceTime} />}
                                    </div>
                                </div>
                            );
                        })}

                        {/* Add Force Button */}
                        <div className="flex justify-center py-4">
                            <button
                                onClick={addForce}
                                className="flex items-center gap-2 px-6 py-3 bg-white hover:bg-slate-50 text-slate-600 dark:bg-slate-800 dark:hover:bg-slate-750 dark:text-slate-300 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl font-bold transition-all transform hover:scale-102 hover:shadow-md"
                            >
                                <Plus size={18} /> 포스 추가하기
                            </button>
                        </div>
                    </div>
                </div>

            </div>

            <DragOverlay>
                {draggedMember ? <MemberCard member={draggedMember} isOverlay /> : null}
            </DragOverlay>

            {/* Auto Match Modal (Simplified - Scope Only) */}
            {
                isAutoMatchModalOpen && (
                    <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
                        <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
                                <div>
                                    <h2 className="text-xl font-bold flex items-center gap-2 text-slate-900 dark:text-white">
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
                                {mode === 'fixed' ? (
                                    <div className="p-4 bg-indigo-50 dark:bg-indigo-900/10 border-2 border-indigo-100 dark:border-indigo-900/30 rounded-2xl">
                                        <div className="flex items-center gap-3 mb-2">
                                            <Sparkles className="text-indigo-500" size={18} />
                                            <span className="font-bold text-slate-700 dark:text-slate-200">고정 파티 자동 매칭</span>
                                        </div>
                                        <p className="text-xs text-slate-500 leading-relaxed">
                                            출석이 확인된 모든 고정 멤버 및 부캐릭터를 대상으로 알고리즘 매칭을 수행합니다.<br />
                                            (신청 시간 및 요일 제한을 무시합니다)
                                        </p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 gap-4">
                                        {/* 1. Global Match (All) */}
                                        <label className={cn(
                                            "flex items-start gap-4 p-4 rounded-2xl border-2 cursor-pointer transition-all hover:bg-slate-50 dark:hover:bg-slate-800",
                                            matchOptions.matchType === 'ALL' ? "border-indigo-500 bg-indigo-50/30 dark:bg-indigo-900/10" : "border-slate-100 dark:border-slate-800"
                                        )}>
                                            <input type="radio" name="matchType" className="mt-1 accent-indigo-500 w-4 h-4"
                                                checked={matchOptions.matchType === 'ALL'}
                                                onChange={() => {
                                                    if (!isAdmin) return alert("매칭 옵션을 변경하려면 관리자 권한이 필요합니다.\n(좌측 하단에서 로그인을 진행해주세요)");
                                                    setMatchOptions(o => ({ ...o, matchType: 'ALL' }))
                                                }} />
                                            <div>
                                                <span className="font-bold text-sm block mb-1 text-slate-700 dark:text-slate-200">전체 요일 매칭</span>
                                                <p className="text-xs text-slate-500">전체 요일을 기준으로 알고리즘 매칭을 실행합니다.</p>
                                            </div>
                                        </label>

                                        {/* 1.5 AI Smart Match (ALL) */}
                                        <label className={cn(
                                            "flex items-start gap-4 p-4 rounded-2xl border-2 cursor-pointer transition-all hover:bg-slate-50 dark:hover:bg-slate-800",
                                            matchOptions.matchType === 'SMART_ALL' ? "border-purple-500 bg-purple-50/30 dark:bg-purple-900/10" : "border-slate-100 dark:border-slate-800"
                                        )}>
                                            <input type="radio" name="matchType" className="mt-1 accent-purple-500 w-4 h-4"
                                                checked={matchOptions.matchType === 'SMART_ALL'}
                                                onChange={() => {
                                                    if (!isAdmin) return alert("매칭 옵션을 변경하려면 관리자 권한이 필요합니다.\n(좌측 하단에서 로그인을 진행해주세요)");
                                                    setMatchOptions(o => ({ ...o, matchType: 'SMART_ALL' }))
                                                }} />
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="font-bold text-sm text-slate-700 dark:text-slate-200">전체 요일 스마트 매칭 (Ver 2.0)</span>
                                                    <span className="text-[9px] bg-purple-500 text-white px-1.5 py-0.5 rounded-full font-black animate-pulse">AI</span>
                                                </div>
                                                <p className="text-xs text-slate-500 leading-relaxed">
                                                    수십만 번의 시뮬레이션을 통해 필수 조건을 모두 충족하는<br />
                                                    최적의 전체 요일 조합을 찾습니다.
                                                </p>
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
                                                        if (!isAdmin) return alert("매칭 옵션을 변경하려면 관리자 권한이 필요합니다.\n(좌측 하단에서 로그인을 진행해주세요)");
                                                        setMatchOptions(o => ({ ...o, matchType: 'DAY' }));
                                                        if (selectedDay === 'ALL') setSelectedDay('수'); // Default to Wed if none selected
                                                    }} />
                                                <div className="flex-1">
                                                    <span className="font-bold text-sm block mb-1 text-slate-700 dark:text-slate-200">선택 요일 매칭</span>
                                                    <p className="text-xs text-slate-500 mb-3">선택한 요일만 대상으로 하여 알고리즘 매칭을 실행합니다.</p>
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
                                                                        if (!isAdmin) return alert("매칭 옵션을 변경하려면 관리자 권한이 필요합니다.\n(좌측 하단에서 로그인을 진행해주세요)");
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
                                                                if (!isAdmin) return alert("매칭 옵션을 변경하려면 관리자 권한이 필요합니다.\n(좌측 하단에서 로그인을 진행해주세요)");
                                                                const allSelected = matchOptions.selectedDays.length === RAID_DAYS.length;
                                                                setMatchOptions(o => ({ ...o, selectedDays: allSelected ? [] : [...RAID_DAYS] }));
                                                            }}
                                                            className="text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 flex items-center gap-1 px-1"
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
                                )}
                                </section>
                            </div>

                            <div className="p-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex justify-end gap-3">
                                <button onClick={() => setIsAutoMatchModalOpen(false)} className="px-5 py-2.5 rounded-xl font-medium text-slate-500 hover:bg-slate-200 transition-colors">
                                    취소
                                </button>
                                <button
                                    onClick={() => {
                                        if (!isAdmin) {
                                            alert("관리자 권한이 필요합니다.\n(좌측 하단에서 로그인을 진행해주세요)");
                                            return;
                                        }
                                        if (matchOptions.matchType === 'SMART_ALL') {
                                            handleSmartAutoMatch();
                                        } else {
                                            handleAutoMatch();
                                        }
                                    }}
                                    className="px-8 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-lg shadow-indigo-500/20 transition-all transform active:scale-95 flex items-center gap-2"
                                >
                                    <Sparkles size={18} />매칭 실행
                                </button>
                            </div>
                        </div>
                    </div >
                )
            }

            {/* Algorithm Settings Modal (New - Separated) */}
            {
                isAlgoSettingsModalOpen && (
                    <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
                        <div className="bg-white dark:bg-slate-900 w-full max-w-7xl rounded-2xl shadow-2xl overflow-hidden flex flex-col h-[80vh]">
                            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
                                <div>
                                    <h2 className="text-xl font-bold flex items-center gap-2">
                                        <Settings className="text-slate-500" /> 매칭 알고리즘 설정
                                    </h2>
                                    <p className="text-sm text-slate-500 mt-1">
                                        우선순위를 드래그하여 조정하세요.
                                        <span className="text-red-500 font-bold ml-1">(관리자 권한 필요)</span>
                                    </p>
                                </div>
                                <button onClick={() => setIsAlgoSettingsModalOpen(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full">
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto p-6 bg-slate-50 dark:bg-slate-900">
                                <DndContext
                                    sensors={sensors}
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
                                                    <SortableAlgoCard key={card.id} card={card} isAdmin={isAdmin} />
                                                ))}
                                            </DroppableAlgoColumn>
                                        </div>

                                        {/* 2. Essential Algorithms */}
                                        <div className="flex flex-col h-full">
                                            <div className="mb-3 flex items-center gap-2">
                                                <div className="w-2 h-8 bg-rose-500 rounded-full" />
                                                <div>
                                                    <h3 className="font-bold text-slate-700 dark:text-slate-200">필수 알고리즘</h3>
                                                    <p className="text-xs text-slate-400">너무 많은 필수 조건은 포스 생성이 안될수도 있습니다.</p>
                                                </div>
                                            </div>
                                            <DroppableAlgoColumn id="ESSENTIAL" items={algoCards.filter(c => c.status === 'ESSENTIAL')}>
                                                {algoCards.filter(c => c.status === 'ESSENTIAL').map((card) => (
                                                    <SortableAlgoCard key={card.id} card={card} isAdmin={isAdmin} />
                                                ))}
                                            </DroppableAlgoColumn>
                                        </div>

                                        {/* 3. Priority Algorithms */}
                                        <div className="flex flex-col h-full">
                                            <div className="mb-3 flex items-center gap-2">
                                                <div className="w-2 h-8 bg-indigo-500 rounded-full" />
                                                <div>
                                                    <h3 className="font-bold text-slate-700 dark:text-slate-200">우선순위</h3>
                                                    <p className="text-xs text-slate-400">필수는 아니나 최대한 반영. 충돌 시 상위 알고리즘이 우선됩니다.</p>
                                                </div>
                                            </div>
                                            <DroppableAlgoColumn id="PRIORITY" items={algoCards.filter(c => c.status === 'PRIORITY')}>
                                                {algoCards.filter(c => c.status === 'PRIORITY').map((card) => (
                                                    <SortableAlgoCard key={card.id} card={card} isAdmin={isAdmin} />
                                                ))}
                                            </DroppableAlgoColumn>
                                        </div>
                                    </div>

                                    {/* Drag Overlay */}
                                    <DragOverlay>
                                        {activeAlgoId ? (
                                            <SortableAlgoCard
                                                card={algoCards.find(c => c.id === activeAlgoId)!}
                                                isAdmin={isAdmin}
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
                )
            }

            {/* Confirmation Modal */}
            {
                confirmationModal.isOpen && (
                    <div className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-300">
                        <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-200 dark:border-slate-800">
                            <div className="p-6">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className={cn(
                                        "w-10 h-10 rounded-full flex items-center justify-center shadow-sm",
                                        confirmationModal.isDanger ? "bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-400" : "bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400"
                                    )}>
                                        {confirmationModal.isDanger ? <AlertTriangle size={20} strokeWidth={2.5} /> : <CheckCircle size={20} strokeWidth={2.5} />}
                                    </div>
                                    <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-0 tracking-tight">
                                        {confirmationModal.title || (confirmationModal.isDanger ? "주의 필요" : "확인")}
                                    </h3>
                                </div>

                                <div className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed mb-8 px-1 font-medium whitespace-pre-wrap">
                                    {confirmationModal.message}
                                </div>

                                <div className="flex justify-end gap-2 pt-2">
                                    <button
                                        onClick={confirmationModal.onCancel}
                                        className="px-4 py-2 rounded-xl text-slate-500 font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition-all active:scale-95"
                                    >
                                        취소
                                    </button>
                                    <button
                                        onClick={confirmationModal.onConfirm}
                                        className={cn(
                                            "px-6 py-2 rounded-xl text-white font-black transition-all active:scale-95 shadow-md",
                                            confirmationModal.isDanger ? "bg-rose-500 hover:bg-rose-600 shadow-rose-500/20" : "bg-indigo-600 hover:bg-indigo-700 shadow-indigo-500/20"
                                        )}
                                    >
                                        {confirmationModal.isDanger ? "확인" : "확인"}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Fixed Group Modal Stub (Can be implemented fully later if needed, mostly CRUD) */}
            {/* Fixed Group Modal */}
            {
                isFixedGroupModalOpen && (
                    <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
                        <div className="bg-white dark:bg-slate-900 w-[80vw] max-w-5xl rounded-2xl shadow-2xl overflow-hidden flex flex-col h-[80vh]">
                            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
                                <div>
                                    <h3 className="text-xl font-bold flex items-center gap-2">
                                        <Settings size={20} className="text-slate-500" /> 본캐 / 부캐 묶기
                                    </h3>
                                    <p className="text-sm text-slate-500 mt-1">동일한 유저의 계정(본캐/부캐)을 묶어 시각적으로 인지하고, 중복 배정을 방지합니다.</p>
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
                                    {fixedGroups.length === 0 && (
                                        <div className="text-center text-slate-400 text-sm py-4">
                                            등록된 부캐 그룹이 없습니다.
                                        </div>
                                    )}
                                </div>

                                {/* Right: Member View */}
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
                                                                className={cn("w-4 h-4 rounded-full transition-transform hover:scale-125 focus:outline-none ring-2 ring-offset-2 ring-transparent focus:ring-indigo-500", selectedGroup?.color)}
                                                                title="팀 색상 변경"
                                                            />
                                                            <h4 className="font-bold text-lg select-none">
                                                                {selectedGroup?.name}
                                                            </h4>
                                                        </div>
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
                                                                        const newGroups = fixedGroups.map(fg =>
                                                                            fg.id === selectedFixedGroupId ? { ...fg, color } : fg
                                                                        );
                                                                        setFixedGroups(newGroups);
                                                                        try {
                                                                            const groupColors = JSON.parse(localStorage.getItem('groupColors') || '{}');
                                                                            groupColors[selectedFixedGroupId] = color;
                                                                            localStorage.setItem('groupColors', JSON.stringify(groupColors));
                                                                        } catch (e) {}
                                                                    }}
                                                                    className={cn(
                                                                        "w-8 h-8 rounded-full shrink-0 transition-all border-2",
                                                                        color,
                                                                        selectedGroup?.color === color ? "border-slate-600 dark:border-white scale-110 shadow-lg ring-2 ring-offset-2 ring-indigo-500" : "border-transparent opacity-70 hover:opacity-100 hover:scale-105"
                                                                    )}
                                                                />
                                                            ))}
                                                        </div>
                                                    )}

                                                    {/* Member List */}
                                                    <div className="flex-1 overflow-y-auto space-y-2">
                                                        {selectedGroup?.memberIds.length === 0 ? (
                                                            <div className="h-40 flex flex-col items-center justify-center text-slate-400 opacity-60">
                                                                <p className="text-sm">등록된 멤버가 없습니다.</p>
                                                            </div>
                                                        ) : (
                                                            selectedGroup?.memberIds.map(mid => {
                                                                const member = [...allMembers, ...allSubChars].find(m => m.id === mid || m.name === mid);
                                                                return (
                                                                    <div key={mid} className="flex items-center justify-between p-2 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
                                                                        <div className="flex items-center gap-2">
                                                                            {member ? (
                                                                                <>
                                                                                    <div className={cn("w-6 h-6 rounded flex items-center justify-center text-xs font-bold text-white", getClassColor(member.class))}>
                                                                                        {member.class[0]}
                                                                                    </div>
                                                                                    <span className="font-bold text-sm">
                                                                                        {member.name}
                                                                                        {member.name === selectedGroup.id && <span className="ml-2 text-xs text-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 px-1.5 py-0.5 rounded font-black">본캐</span>}
                                                                                    </span>
                                                                                </>
                                                                            ) : (
                                                                                <span className="text-slate-400 text-sm">Unknown ({mid})</span>
                                                                            )}
                                                                        </div>
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
                )
            }

            {/* Time Selection Modal (When force time is missing) */}
            {
                timeSelectionModal.isOpen && timeSelectionModal.member && (
                    <div className="fixed inset-0 bg-black/60 z-[150] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
                        <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
                            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
                                <div className="flex items-center gap-3">
                                    <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center font-bold text-white shadow-sm", getClassColor(timeSelectionModal.member.class))}>
                                        {timeSelectionModal.member.class[0]}
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-slate-900 dark:text-white">{timeSelectionModal.member.name}</h3>
                                        <p className="text-[11px] text-slate-500">포스 시간을 설정하고 멤버를 배치합니다.</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setTimeSelectionModal({ isOpen: false, member: null, targetPartyId: null })}
                                    className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors"
                                >
                                    <X size={18} />
                                </button>
                            </div>

                            <div className="p-6">
                                <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/50 rounded-xl flex items-start gap-3">
                                    <AlertTriangle className="text-amber-500 shrink-0" size={16} />
                                    <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed font-medium">
                                        현재 포스 시간이 설정되어 있지 않습니다.<br />
                                        <strong>{timeSelectionModal.member.name}</strong>님이 신청하신 시간대 중 하나를 선택해 주세요.
                                    </p>
                                </div>

                                <div className="space-y-4 max-h-[300px] overflow-y-auto px-1 custom-scrollbar">
                                    {RAID_DAYS.map(day => {
                                        const slots = timeSelectionModal.member?.availability?.[day] || [];
                                        if (slots.length === 0) return null;

                                        return (
                                            <div key={day} className="space-y-2">
                                                <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest pl-1">{day}요일</h4>
                                                <div className="grid grid-cols-2 gap-2">
                                                    {slots.map(tId => {
                                                        const s = [...WEEKDAY_SLOTS, ...WEEKEND_SLOTS].find(s => s.id === tId);
                                                        return (
                                                            <button
                                                                key={`${day}-${tId}`}
                                                                onClick={() => handleConfirmTimeSelection(day, tId)}
                                                                className="flex flex-col items-center justify-center p-3 rounded-xl border-2 border-slate-100 dark:border-slate-800 hover:border-indigo-500 hover:bg-indigo-50/30 dark:hover:bg-indigo-900/20 transition-all group active:scale-95"
                                                            >
                                                                <span className="text-sm font-black text-slate-700 dark:text-slate-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400">{s?.label}</span>
                                                                <span className="text-[10px] text-slate-400">{s?.fullLabel}</span>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
                                <button
                                    onClick={() => setTimeSelectionModal({ isOpen: false, member: null, targetPartyId: null })}
                                    className="w-full py-2.5 rounded-xl font-bold text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors text-sm"
                                >
                                    취소
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Attendance Management Modal */}
            {isAttendanceModalOpen && (
                <div className="fixed inset-0 bg-black/60 z-[150] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
                        <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-xl">
                                    <CheckCircle size={22} />
                                </div>
                                <div className="flex flex-col">
                                    <h3 className="font-bold text-slate-900 dark:text-white leading-tight">출석 관리 (고정 파티)</h3>
                                    <p className="text-[11px] text-slate-500 mt-0.5">불참 인원을 체크하면 본캐 및 모든 부캐가 매칭에서 제외됩니다.</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setIsAttendanceModalOpen(false)}
                                className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <div className="p-4 bg-amber-50 dark:bg-amber-900/10 border-b border-amber-100 dark:border-amber-900/20 px-6 py-3">
                            <p className="text-[11px] text-amber-700 dark:text-amber-400 font-medium leading-relaxed">
                                ※ 고정 파티 멤버 중 이번 레이드에 참여하지 못하는 인원을 선택해 주세요.<br />
                                선택된 유저의 <strong>모든 캐릭터(본캐+부캐)</strong>가 목록에서 사라집니다.
                            </p>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 space-y-2 max-h-[500px] custom-scrollbar">
                            {allMembers.sort((a, b) => (a.name || '').localeCompare(b.name || '')).map(member => {
                                const isExcluded = excludedOwners.includes(member.name);
                                const memberSubCount = allSubChars.filter(s => s.ownerName === member.name).length;

                                return (
                                    <div
                                        key={member.id}
                                        className={cn(
                                            "group flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer",
                                            isExcluded
                                                ? "bg-rose-50 border-rose-100 dark:bg-rose-900/10 dark:border-rose-900/30"
                                                : "bg-white border-slate-100 hover:border-indigo-200 dark:bg-slate-800 dark:border-slate-700"
                                        )}
                                        onClick={() => toggleAttendance(member.name)}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center font-bold text-white shadow-sm", isExcluded ? "grayscale opacity-50 bg-slate-400" : getClassColor(member.class))}>
                                                {member.class[0]}
                                            </div>
                                            <div className="flex flex-col">
                                                <div className="flex items-center gap-2">
                                                    <span className={cn("font-bold text-sm", isExcluded ? "text-slate-400 line-through" : "text-slate-700 dark:text-slate-200")}>
                                                        {member.name}
                                                    </span>
                                                    {memberSubCount > 0 && (
                                                        <span className="text-[10px] bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded-full text-slate-500">
                                                            부캐 {memberSubCount}
                                                        </span>
                                                    )}
                                                </div>
                                                <span className="text-[11px] text-slate-400">{member.class} • {member.power.toLocaleString()}</span>
                                            </div>
                                        </div>

                                        <div className={cn(
                                            "w-10 h-6 rounded-full p-1 transition-all flex items-center",
                                            isExcluded ? "bg-rose-500 justify-end" : "bg-slate-200 dark:bg-slate-700 justify-start"
                                        )}>
                                            <div className="w-4 h-4 rounded-full bg-white shadow-sm" />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
                            <button
                                onClick={() => setIsAttendanceModalOpen(false)}
                                className="w-full py-3 rounded-xl font-black text-white bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-200 dark:shadow-none transition-all"
                            >
                                설정 저장 완료
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {
                tooltipInfo && (
                    <MemberDetailTooltip
                        member={tooltipInfo!.member}
                        rect={tooltipInfo!.rect}
                        fixedGroups={fixedGroups}
                        allMembers={allMembers}
                    />
                )
            }
            {/* Floating Copy Button */}
            <div className="fixed bottom-10 right-10 z-[100] flex flex-col items-end gap-3 pointer-events-none">
                {copySuccess && (
                    <div className="bg-slate-900/90 text-white px-5 py-2.5 rounded-2xl text-xs font-bold shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-300 backdrop-blur-md border border-slate-700">
                        📋 포스 구성표가 복사되었습니다!
                    </div>
                )}
                <button
                    onClick={handleCopyForcesText}
                    className="pointer-events-auto group bg-indigo-600 dark:bg-indigo-500 text-white p-4 rounded-3xl shadow-2xl hover:scale-110 active:scale-95 transition-all flex items-center gap-3 overflow-hidden"
                >
                    <Copy size={22} className="group-hover:rotate-6 transition-transform" />
                    <span className="max-w-0 overflow-hidden group-hover:max-w-[200px] transition-all duration-500 whitespace-nowrap font-black text-sm tracking-tight">
                        포스 구성표 복사
                    </span>
                </button>
            </div>
        </DndContext >
    );
}

