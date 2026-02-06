'use client';

import React, { useState } from 'react';
import { Calendar, Clock, Check, Save, AlertCircle, Users, Heart, Star, Loader2, Shield, Trash2, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { db } from '@/lib/firebase';
import { ref, onValue, push, set, remove } from 'firebase/database';

type TimeSlot = {
    id: string;
    label: string;
    startTime: string;
    endTime: string;
};

const WEEKDAYS = ['월', '화', '수', '목', '금'];
const WEEKENDS = ['토', '일'];

const WEEKDAY_SLOTS: TimeSlot[] = [
    { id: 'wd1', label: '오후 6:30 ~ 8:30', startTime: '18:30', endTime: '20:30' },
    { id: 'wd2', label: '오후 8:30 ~ 10:30', startTime: '20:30', endTime: '22:30' },
    { id: 'wd3', label: '오후 10:30 ~ 12:30', startTime: '22:30', endTime: '00:30' },
];

const WEEKEND_SLOTS: TimeSlot[] = [
    { id: 'we1', label: '오후 2:00 ~ 4:00', startTime: '14:00', endTime: '16:00' },
    { id: 'we2', label: '오후 4:00 ~ 6:00', startTime: '16:00', endTime: '18:00' },
    { id: 'we3', label: '오후 6:30 ~ 8:30', startTime: '18:30', endTime: '20:30' },
    { id: 'we4', label: '오후 8:30 ~ 10:30', startTime: '20:30', endTime: '22:30' },
    { id: 'we5', label: '오후 10:30 ~ 12:30', startTime: '22:30', endTime: '00:30' },
];

const getCurrentWeek = () => {
    const now = new Date();
    // 수요일 오전 9시 리셋을 위해 9시간을 뺍니다.
    const adjusted = new Date(now.getTime() - (9 * 60 * 60 * 1000));

    // 해당 주의 수요일 날짜를 찾습니다.
    const day = adjusted.getDay(); // 0(일) ~ 6(토)
    const diffToWed = 3 - day;
    const wednesday = new Date(adjusted);
    wednesday.setDate(adjusted.getDate() + diffToWed);

    const year = wednesday.getFullYear();
    const month = wednesday.getMonth() + 1;

    // 해당 월의 첫 번째 날
    const firstDay = new Date(year, wednesday.getMonth(), 1);
    // 일요일 시작 기준 몇 번째 주인지 계산
    const week = Math.floor((wednesday.getDate() + firstDay.getDay() - 1) / 7) + 1;

    return `${month}월 ${week}주차`;
};

const getCycleDate = (targetDayName: string) => {
    const dayMap: Record<string, number> = { '월': 1, '화': 2, '수': 3, '목': 4, '금': 5, '토': 6, '일': 0 };
    const now = new Date();
    // Wednesday 9 AM reset
    const adjusted = new Date(now.getTime() - (9 * 60 * 60 * 1000));
    const day = adjusted.getDay();

    // Find reference Wednesday of the current cycle
    const diffToWed = 3 - day;
    const wedDate = new Date(adjusted);
    wedDate.setHours(0, 0, 0, 0);
    wedDate.setDate(adjusted.getDate() + diffToWed);

    // Target diff from Wed (Wed reset cycle: Wed, Thu, Fri, Sat, Sun, Mon, Tue)
    const targetIdx = dayMap[targetDayName]; // Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6, Sun:0
    let diffFromWed = targetIdx - 3;
    if (diffFromWed < 0) diffFromWed += 7; // Wed=0, Thu=1... Tue=6

    const targetDate = new Date(wedDate);
    targetDate.setDate(wedDate.getDate() + diffFromWed);

    return `${targetDate.getMonth() + 1}월 ${targetDate.getDate()}일`;
};

import { useAuth } from '@/context/AuthContext';

// --- Main Component ---

export default function PartyApply({ testMode = false }: { testMode?: boolean }) {
    const { isAdmin } = useAuth();
    const [nickname, setNickname] = useState('');
    const [availability, setAvailability] = useState<Record<string, string[]>>({
        '월': [], '화': [], '수': [], '목': [], '금': [], '토': [], '일': []
    });
    const [isSaving, setIsSaving] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [lastSaved, setLastSaved] = useState<string | null>(null);
    const [members, setMembers] = useState<any[]>([]);
    const [existingApps, setExistingApps] = useState<any[]>([]);
    const [manualClass, setManualClass] = useState('수호성');
    const [manualPower, setManualPower] = useState('3000');

    React.useEffect(() => {
        if (testMode) {
            // Mock Data for Test Mode
            setMembers([
                { name: '테스트유저1', class: '수호성', power: 3000 }
            ]);
            setExistingApps([]);
            return;
        }

        // Load Members
        const membersRef = ref(db, 'members');
        const unsubMembers = onValue(membersRef, (snap) => {
            const data = snap.val();
            setMembers(data ? Object.values(data) : []);
        });

        // Load Applications to check for existing
        const appsRef = ref(db, 'raid_applications');
        const unsubApps = onValue(appsRef, (snap) => {
            const data = snap.val();
            if (data) {
                const apps = Object.keys(data).map(key => ({ ...data[key], id: key }));
                setExistingApps(apps);
            } else {
                setExistingApps([]);
            }
        });

        return () => {
            unsubMembers();
            unsubApps();
        }
    }, [testMode]);

    // When nickname changes, pre-fill availability if exists
    React.useEffect(() => {
        const app = existingApps.find(a => a.nickname === nickname.trim());
        if (app && app.availability) {
            setAvailability(app.availability);
            setLastSaved(new Date(app.updatedAt).toLocaleString());
        } else {
            setLastSaved(null);
        }
    }, [nickname, existingApps]);

    const toggleSlot = (day: string, slotId: string) => {
        setAvailability(prev => {
            const daySlots = prev[day] || [];
            if (daySlots.includes(slotId)) {
                return { ...prev, [day]: daySlots.filter(id => id !== slotId) };
            } else {
                return { ...prev, [day]: [...daySlots, slotId] };
            }
        });
    };

    const toggleAll = (day: string, isWeekend: boolean) => {
        const slots = isWeekend ? WEEKEND_SLOTS : WEEKDAY_SLOTS;
        const allSlotIds = slots.map(s => s.id);
        const currentSelected = availability[day] || [];
        setAvailability(prev => ({
            ...prev,
            [day]: currentSelected.length === allSlotIds.length ? [] : allSlotIds
        }));
    };

    const handleSave = async () => {
        const trimmedName = nickname.trim();
        if (!trimmedName) {
            alert('닉네임을 입력해 주세요.');
            return;
        }

        const foundMember = members.find(m => (m.name === trimmedName));
        const selectedSlotsCount = Object.values(availability).flat().length;
        if (selectedSlotsCount === 0) {
            alert('최소 하나 이상의 요일과 시간대를 선택해 주세요.');
            return;
        }

        if (testMode) {
            alert(`[TEST MODE] 저장 성공 (실제 DB에는 저장되지 않음)\n\n이름: ${trimmedName}\n선택된 슬롯: ${selectedSlotsCount}개`);
            setLastSaved(new Date().toLocaleString());
            return;
        }

        const applicationData = {
            nickname: trimmedName,
            class: foundMember ? foundMember.class : manualClass,
            power: foundMember ? foundMember.power : parseInt(manualPower),
            availability,
            updatedAt: new Date().toISOString()
        };

        setIsSaving(true);
        try {
            // Check if exists
            const existing = existingApps.find(a => a.nickname === trimmedName);
            if (existing) {
                // [Security] Block modification if not Admin
                if (!isAdmin) {
                    alert('관리자 권한이 필요합니다.\n(신청 내역 수정/삭제는 임원진에게 연락 부탁드리겠습니다)');
                    return;
                }
                await set(ref(db, `raid_applications/${existing.id}`), { ...applicationData, id: existing.id });
            } else {
                const newRef = push(ref(db, 'raid_applications'));
                await set(newRef, { ...applicationData, id: newRef.key });
            }

            setLastSaved(new Date().toLocaleString());
            alert('파티 신청 정보가 저장되었습니다.');
        } catch (e) {
            console.error(e);
            alert('저장 중 오류가 발생했습니다.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async () => {
        const trimmedName = nickname.trim();
        if (!trimmedName) {
            alert('닉네임을 입력해 주세요.');
            return;
        }

        if (!confirm(`${trimmedName}님의 신청 정보를 정말로 삭제하시겠습니까?`)) return;

        if (testMode) {
            alert(`[TEST MODE] 삭제 성공 (실제 DB에는 영향 없음)`);
            setLastSaved(null);
            return;
        }

        setIsDeleting(true);
        try {
            const existing = existingApps.find(a => a.nickname === trimmedName);
            if (existing) {
                await remove(ref(db, `raid_applications/${existing.id}`));
                alert('신청 정보가 삭제되었습니다.');
                setAvailability({
                    '월': [], '화': [], '수': [], '목': [], '금': [], '토': [], '일': []
                });
                setLastSaved(null);
            } else {
                alert('신청 정보를 찾을 수 없습니다.');
            }
        } catch (e) {
            console.error(e);
            alert('삭제 중 오류가 발생했습니다.');
        } finally {
            setIsDeleting(false);
        }
    };

    const renderDayCard = (day: string, isWeekend: boolean) => {
        const slots = isWeekend ? WEEKEND_SLOTS : WEEKDAY_SLOTS;
        const selectedCount = availability[day]?.length || 0;

        const isSat = day === '토';
        const isSun = day === '일';

        return (
            <div key={day} className={cn(
                "glass-panel p-6 flex flex-col gap-5 transition-all duration-300 hover:shadow-xl",
                selectedCount > 0 ? "border-indigo-100 dark:border-indigo-900/50 ring-1 ring-indigo-50 dark:ring-indigo-900/30" : "opacity-80",
                isSat && "border-blue-100 dark:border-blue-900/30 bg-blue-50/10 dark:bg-blue-900/10",
                isSun && "border-rose-100 dark:border-rose-900/30 bg-rose-50/10 dark:bg-rose-900/10"
            )}>
                <div className="flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <span className={cn(
                            "w-10 h-10 rounded-2xl flex items-center justify-center font-black text-sm shadow-sm",
                            isSat ? "bg-blue-500 text-white shadow-blue-100 dark:shadow-none" :
                                isSun ? "bg-rose-500 text-white shadow-rose-100 dark:shadow-none" :
                                    "bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400"
                        )}>
                            {day}
                        </span>
                        <h3 className={cn(
                            "font-black text-lg",
                            isSat ? "text-blue-600 dark:text-blue-400" : isSun ? "text-rose-600 dark:text-rose-400" : "text-slate-800 dark:text-slate-200"
                        )}>
                            {getCycleDate(day)}
                        </h3>
                    </div>

                    <button
                        onClick={() => toggleAll(day, isWeekend)}
                        className={cn(
                            "text-[10px] px-3 py-1.5 rounded-xl transition-all font-black uppercase tracking-wider",
                            selectedCount === slots.length
                                ? "bg-slate-100 text-slate-400 hover:bg-slate-200"
                                : "bg-indigo-50 text-indigo-400 hover:bg-indigo-100"
                        )}
                    >
                        {selectedCount === slots.length ? 'ALL OFF' : 'ALL ON'}
                    </button>
                </div>

                <div className="space-y-2.5">
                    {slots.map(slot => {
                        const isSelected = availability[day]?.includes(slot.id);
                        return (
                            <button
                                key={slot.id}
                                onClick={() => toggleSlot(day, slot.id)}
                                className={cn(
                                    "w-full p-4 rounded-2xl border-2 text-left text-sm font-bold transition-all flex items-center justify-between group",
                                    isSelected
                                        ? "bg-indigo-500 border-indigo-400 text-white shadow-lg shadow-indigo-100/50 dark:shadow-none"
                                        : "bg-white dark:bg-slate-800 border-slate-50 dark:border-slate-700/50 text-slate-400 dark:text-slate-300 hover:border-indigo-100 dark:hover:border-indigo-500/50 hover:text-indigo-400 dark:hover:text-indigo-300 shadow-sm"
                                )}
                            >
                                <div className="flex items-center gap-3">
                                    <Clock size={16} className={cn(isSelected ? "text-indigo-200" : "text-slate-100")} />
                                    <span>{slot.label}</span>
                                </div>
                                {isSelected && <Check size={16} strokeWidth={3} className="text-white animate-in zoom-in" />}
                            </button>
                        );
                    })}
                </div>
            </div >
        );
    };

    return (
        <div className="space-y-10 animate-in fade-in duration-700">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div>
                    <h2 className="text-4xl font-black text-slate-900 dark:text-white flex items-center gap-3 tracking-tight">
                        <Calendar className="text-indigo-500 dark:text-indigo-400" size={36} />
                        성역 파티 신청 ({getCurrentWeek()})
                        {testMode && <span className="text-xs bg-red-500 text-white px-2 py-1 rounded-full animate-pulse ml-2">TEST MODE</span>}
                    </h2>
                    <div className="mt-[17px]">
                        <p className="text-slate-500 dark:text-slate-300 text-sm font-medium">
                            파티 매칭을 위해 참가 가능한 모든 시간대를 선택해 주세요.
                        </p>
                    </div>
                </div>
                {lastSaved && (
                    <div className="bg-emerald-50 text-emerald-600 px-4 py-2 rounded-2xl text-[10px] font-black border border-emerald-100 shadow-sm tracking-widest uppercase">
                        Last Saved: {lastSaved}
                    </div>
                )}
            </div>

            <div className="glass-panel p-10 flex flex-col lg:flex-row gap-10 items-end">
                <div className="flex-1 w-full lg:max-w-lg">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2 mb-3 block">Participant Identity</label>
                    <div className="relative">
                        <Users className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={24} />
                        <input
                            type="text"
                            placeholder="닉네임을 입력해주세요"
                            value={nickname}
                            onChange={(e) => setNickname(e.target.value)}
                            className="w-full h-16 bg-slate-50/50 dark:bg-slate-800/50 border-2 border-slate-100 dark:border-slate-700 rounded-3xl pl-14 pr-6 text-slate-800 dark:text-slate-200 text-lg font-black focus:border-indigo-200 dark:focus:border-indigo-500/50 focus:bg-white dark:focus:bg-slate-800 outline-none transition-all placeholder:text-slate-200 dark:placeholder:text-slate-600"
                        />
                        <div className="absolute -bottom-8 left-2 text-[11px] font-black tracking-tight flex items-center gap-3">
                            {nickname && !members.some(m => m.name === nickname) && (
                                <div className="text-amber-500 flex items-center gap-2">
                                    <AlertCircle size={14} /> 외부 인원입니다. 직업과 전투력을 확인해 주세요.
                                </div>
                            )}
                            {nickname && members.some(m => m.name === nickname) && (
                                <div className="text-indigo-500 flex items-center gap-2 animate-in slide-in-from-left-2">
                                    <Check size={14} strokeWidth={4} /> 레기온 정식 멤버 확인됨
                                </div>
                            )}
                            {nickname && existingApps.find(a => a.nickname === nickname.trim()) && (
                                <div className="text-emerald-500 flex items-center gap-2 animate-in slide-in-from-left-2">
                                    <Info size={14} strokeWidth={4} /> 이미 신청 정보가 존재합니다
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {nickname && !members.some(m => m.name === nickname) && (
                    <div className="flex gap-4 items-end animate-in zoom-in duration-500 w-full lg:w-auto">
                        <div className="flex-1 lg:w-40">
                            <label className="text-[10px] font-black text-slate-400 capitalize mb-2 block ml-1">Class</label>
                            <select
                                value={manualClass}
                                onChange={(e) => setManualClass(e.target.value)}
                                className="w-full h-16 bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-3xl px-6 text-slate-700 dark:text-slate-200 font-black outline-none focus:border-indigo-200 dark:focus:border-indigo-500/50 shadow-sm appearance-none"
                            >
                                {['수호성', '검성', '살성', '궁성', '마도성', '정령성', '치유성', '호법성'].map(c => (
                                    <option key={c} value={c}>{c}</option>
                                ))}
                            </select>
                        </div>
                        <div className="flex-1 lg:w-40">
                            <label className="text-[10px] font-black text-slate-400 capitalize mb-2 block ml-1">Power</label>
                            <input
                                type="number"
                                value={manualPower}
                                onChange={(e) => setManualPower(e.target.value)}
                                className="w-full h-16 bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-3xl px-6 text-slate-700 dark:text-slate-200 font-black outline-none focus:border-indigo-200 dark:focus:border-indigo-500/50 shadow-sm"
                            />
                        </div>
                    </div>
                )}

                <div className="flex flex-col md:flex-row items-center gap-4 w-full lg:w-auto">
                    <button
                        onClick={handleSave}
                        disabled={isSaving || isDeleting}
                        className="glass-btn flex-1 md:min-w-[180px] h-16 flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50 text-base shadow-xl"
                    >
                        {isSaving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
                        {existingApps.find(a => a.nickname === nickname.trim()) ? '신청 정보 수정' : '신청 정보 제출'}
                    </button>
                    <button
                        onClick={() => {
                            if (!isAdmin) {
                                alert("관리자 권한이 필요합니다.\n(신청 내역 수정/삭제는 임원진에게 연락 부탁드리겠습니다)");
                                return;
                            }
                            handleDelete();
                        }}
                        className={cn(
                            "border-2 flex-1 md:min-w-[180px] h-16 rounded-[1.25rem] flex items-center justify-center gap-3 active:scale-95 text-base transition-all font-black shadow-sm",
                            isDeleting ? "opacity-50" : "",
                            isAdmin
                                ? "bg-white dark:bg-slate-800 border-red-50 dark:border-red-900/30 text-red-400 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:border-red-100 dark:hover:border-red-900/50"
                                : "bg-slate-50 border-slate-100 text-slate-300 cursor-not-allowed"
                        )}
                    >
                        {isDeleting ? <Loader2 className="animate-spin" size={20} /> : <Trash2 size={20} />}
                        {isAdmin ? '신청 정보 제거' : '신청 정보 제거'}
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 pb-12">
                <div className="glass-panel p-6 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-900/30 flex flex-col hover:scale-[1.02] transition-transform shadow-sm gap-5">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-2xl bg-white dark:bg-red-900/30 flex items-center justify-center border border-red-100 dark:border-red-900/50 shadow-sm shrink-0">
                            <AlertCircle className="text-red-500" size={20} />
                        </div>
                        <h3 className="text-2xl font-black tracking-tight text-red-900 dark:text-red-200">필독!</h3>
                    </div>
                    <ul className="text-sm font-bold text-slate-700 dark:text-slate-300 space-y-3">
                        <li className="flex gap-3 items-start">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-400 mt-1.5 shrink-0" />
                            <span className="break-keep leading-relaxed">참가 가능한 모든 시간대 체크 부탁드립니다.</span>
                        </li>
                        <li className="flex gap-3 items-start">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-400 mt-1.5 shrink-0" />
                            <span className="break-keep leading-relaxed">시간대 선택 후 닉네임 입력 및 [신청 정보 제출] 버튼을 꼭 눌러주세요.</span>
                        </li>
                        <li className="flex gap-3 items-start">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-400 mt-1.5 shrink-0" />
                            <span className="break-keep leading-relaxed">수정이 필요할 시 임원진에게 연락 부탁드리겠습니다.</span>
                        </li>
                    </ul>
                </div>

                {['수', '목', '금', '토', '일', '월', '화'].map(day => (
                    renderDayCard(day, ['토', '일'].includes(day))
                ))}
            </div>
        </div>
    );
}
