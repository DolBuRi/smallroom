import React, { useState, useEffect } from 'react';
import { Bell, Link, Check, X, Loader2, Signal, Volume2, RefreshCw, PlayCircle, Wrench } from 'lucide-react';
import { ref, get, child } from 'firebase/database';
import { cn } from '@/lib/utils';
import { alerterDb } from '@/lib/firebase'; // Use the secondary DB

interface AlerterSettings {
    notificationType: 'both' | 'sound' | 'vib' | 'none';
    volume: number;
    alarmStatus: {
        rift: boolean;
        shugo: boolean;
        invasion: boolean;
        nahma: boolean;
        custom: boolean;
    };
    alarmOffsets: number[];
    shugoAlarmOffsets: number[];
    invasionAlarmOffsets?: number[];
    bossNahmaAlarmOffsets?: number[]; // [FIX] Added missing offset key from original site
    lastSync?: string;
}

// [FIX] Exact schedules from original site
const RIFT_TIMES = [2, 5, 8, 11, 14, 17, 20, 23];
const SHUGO_MINUTES = [15, 45]; // Every hour at xx:15, xx:45

export default function AlerterIntegration({ showDiagnostics = false }: { showDiagnostics?: boolean }) {
    const [syncKey, setSyncKey] = useState('');
    const [isConnected, setIsConnected] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [settings, setSettings] = useState<AlerterSettings | null>(null);
    const [error, setError] = useState('');
    const [nextAlarm, setNextAlarm] = useState<string>('계산 중...');
    const [showLocalDebug, setShowLocalDebug] = useState(showDiagnostics);
    const [virtualTimeOffset, setVirtualTimeOffset] = useState(0);
    const [manualClockOffset, setManualClockOffset] = useState(0); // For clock sync (persisted)
    const [currentTime, setCurrentTime] = useState<Date>(new Date());

    // Sync prop changes to local state
    useEffect(() => {
        if (showDiagnostics) setShowLocalDebug(true);
    }, [showDiagnostics]);

    // Audio Queue Logic
    const [audioQueue, setAudioQueue] = useState<{ type: string, minutes: number }[]>([]);
    const [isPlaying, setIsPlaying] = useState(false);

    // Prevent duplicate alerts in the same minute (Use Set to handle multiple overlapping alarms)
    const triggeredAlarmsRef = React.useRef<Set<string>>(new Set());
    const audioRef = React.useRef<HTMLAudioElement | null>(null);
    const utteranceRef = React.useRef<SpeechSynthesisUtterance | null>(null); // Keep reference to prevent GC
    const [audioLog, setAudioLog] = useState<string[]>([]); // Visual Audio Log

    const addLog = (msg: string) => {
        setAudioLog(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 5));
    };

    // Public API called by Alarm Engine
    const playAudio = (type: string, minutes: number) => {
        addLog(`📝 알람 큐 등록: ${type} (${minutes}분)`);
        setAudioQueue(prev => [...prev, { type, minutes }]);
    };

    // Queue Processor
    useEffect(() => {
        if (audioQueue.length === 0 || isPlaying) return;

        const processNext = async () => {
            setIsPlaying(true);
            const current = audioQueue[0];

            try {
                await executeAudio(current.type, current.minutes);
            } catch (e) {
                addLog(`❌ 오디오 처리 실패: ${e}`);
            } finally {
                // Done with this item
                setAudioQueue(prev => prev.slice(1));
                setIsPlaying(false);
            }
        };

        processNext();
    }, [audioQueue, isPlaying]);

    // Voice Loading State
    const [voiceList, setVoiceList] = useState<SpeechSynthesisVoice[]>([]);

    useEffect(() => {
        const updateVoices = () => {
            const voices = window.speechSynthesis.getVoices();
            setVoiceList(voices);
            // addLog(`🎤 TTS 보이스 목록 로드됨: ${voices.length}개`);
        };

        if ('speechSynthesis' in window) {
            window.speechSynthesis.onvoiceschanged = updateVoices;
            updateVoices(); // Check immediately in case already loaded
        }

        return () => {
            if ('speechSynthesis' in window) window.speechSynthesis.onvoiceschanged = null;
        };
    }, []);

    // Core Audio Executor (TTS -> Fallback MP3)
    const executeAudio = (type: string, minutes: number): Promise<void> => {
        return new Promise((resolve) => {
            if (!settings) { resolve(); return; }

            // 1. Generate Message
            let message = "";
            switch (type) {
                case 'rift': message = minutes === 0 ? "시공의 균열이 생성되었습니다." : `${minutes}분 후 시공의 균열이 생성됩니다.`; break;
                case 'shugo': message = minutes === 0 ? "슈고페스타가 시작되었습니다." : `${minutes}분 후 슈고페스타가 시작됩니다.`; break;
                case 'invasion': message = minutes === 0 ? "차원 침공이 시작되었습니다." : `${minutes}분 후 차원 침공이 시작됩니다.`; break;
                case 'nahma': message = minutes === 0 ? "어비스: 나흐마가 등장하였습니다." : `${minutes}분 후 어비스, 나흐마가 등장합니다.`; break; // Changed comma for better TTS flow
                default: message = "알람이 발생했습니다.";
            }

            // 2. Try TTS First (Restored by User Request)
            if ('speechSynthesis' in window) {
                window.speechSynthesis.cancel(); // 1. Cancel previous

                addLog(`▶️ [Start] TTS 시도: "${message}"`);

                const speak = (forceDefault: boolean = false) => {
                    const utterance = new SpeechSynthesisUtterance(message);
                    utterance.rate = 1.0;
                    utterance.volume = settings.volume / 100;
                    utterance.lang = 'ko-KR';

                    if (!forceDefault) {
                        // Priority: Google 한국어 -> Any Korean -> Default
                        const korVoice = voiceList.find(v => v.name.includes('Google') && v.lang.includes('ko')) ||
                            voiceList.find(v => v.lang.includes('ko')) ||
                            window.speechSynthesis.getVoices().find(v => v.lang.includes('ko'));

                        if (korVoice) {
                            utterance.voice = korVoice;
                            addLog(`🗣️ 보이스: ${korVoice.name}`);
                        } else {
                            addLog(`⚠️ 한국어 보이스 없음 -> 기본값`);
                        }
                    } else {
                        addLog(`🔄 재시도: 기본 보이스 강제 사용`);
                    }

                    utterance.onend = () => {
                        addLog("✅ [End] TTS 완료");
                        resolve();
                    };

                    utterance.onerror = (e) => {
                        // [Fix] If interrupted (by new alarm), just stop. Do NOT fallback to MP3.
                        if (e.error === 'interrupted') {
                            addLog(`⚠️ TTS 중단됨 (새 알람 우선)`);
                            resolve(); // Just finish
                            return;
                        }

                        if (!forceDefault && e.error === 'synthesis-failed') {
                            addLog(`⚠️ TTS 에러(${e.error}) -> 재시도 (기본 보이스)`);
                            setTimeout(() => speak(true), 100);
                        } else {
                            addLog(`⚠️ TTS 최종 에러(${e.error}) -> MP3 폴백`);
                            playMp3Promised(type, minutes).then(resolve);
                        }
                    };

                    utteranceRef.current = utterance;
                    setTimeout(() => window.speechSynthesis.speak(utterance), 50);
                };

                speak();

                // Safety Timeout
                setTimeout(() => {
                    if (window.speechSynthesis.speaking) { /* keep alive */ }
                }, 10000);

            } else {
                addLog("⚠️ 브라우저 TTS 미지원 -> MP3 재생");
                playMp3Promised(type, minutes).then(resolve);
            }
        });
    };

    const playMp3Promised = (type: string, minutes: number): Promise<void> => {
        return new Promise((resolve) => {
            if (!settings) { resolve(); return; }

            const folderMap: Record<string, string> = {
                rift: 'rift_shigong', shugo: 'shugo', invasion: 'chawon', nahma: 'nahma'
            };
            const folder = folderMap[type];
            if (!folder) { resolve(); return; }

            const path = `/sounds/tts/${folder}/${minutes}min.mp3`;
            addLog(`🎵 [Start] MP3 재생: ${path}`);

            const audio = new Audio(path);
            audio.volume = settings.volume / 100;

            audio.onended = () => {
                addLog("✅ [End] MP3 완료");
                resolve();
            };

            audio.onerror = (e) => {
                addLog(`❌ MP3 에러: ${e}`);
                resolve();
            };

            audio.play().catch(e => {
                addLog(`❌ MP3 Play() 예외: ${e}`);
                resolve();
            });

            audioRef.current = audio;
        });
    };

    const [debugInfo, setDebugInfo] = useState<any[]>([]);

    // Alarm Engine Loop
    useEffect(() => {
        const checkAlarms = () => {
            const nowReal = new Date();
            // Total effective time = Actual Time + Fixed Manual Offset + Temporary Simulation Offset
            const effectiveOffset = (manualClockOffset * 1000) + virtualTimeOffset;
            const now = new Date(nowReal.getTime() + effectiveOffset);
            setCurrentTime(now);

            if (!settings || !isConnected) {
                setNextAlarm('연동 대기 중...');
                return;
            }

            const currentInfos: any[] = [];
            const currentSettings = settings!;
            let minDiff = Infinity;
            let nextStatus = '금일 남은 알람 없음';

            // Helper to trigger
            const triggerAlarmHelper = (keyBase: string, label: string, diffMins: number, type: string, offsets: number[]) => {
                // 1. Exact match check (Standard)
                if (offsets.includes(diffMins)) {
                    const key = `${keyBase}-${diffMins}`;
                    if (!triggeredAlarmsRef.current.has(key)) {
                        const text = diffMins === 0
                            ? `${label} 시작 시간입니다!`
                            : `${label}, ${diffMins}분 전입니다.`;
                        triggerAlarm(text, type, diffMins);
                        triggeredAlarmsRef.current.add(key);
                    }
                }

                // 2. Catch-up check for 'Start' alarm (diffMins 0)
                // If we are between 0 and -2 minutes and haven't triggered the '0' alarm yet
                if (diffMins <= 0 && diffMins > -2 && offsets.includes(0)) {
                    const catchUpKey = `${keyBase}-0`;
                    if (!triggeredAlarmsRef.current.has(catchUpKey)) {
                        triggerAlarm(`${label} 오프닝을 놓쳤을 수 있습니다. 현재 진행 중입니다!`, type, 0);
                        triggeredAlarmsRef.current.add(catchUpKey);
                    }
                }
            };

            // Range-based check (fires if diffMins matches an offset EXACTLY, but works with Math.ceil)
            // Math.ceil(diffMs / 60000) results in:
            // 5.001 -> 6
            // 5.000 -> 5
            // 4.001 -> 5
            // 4.000 -> 4
            // So if offset is 5, it fires when diffMs is between 4*60000+1 and 5*60000.
            // This is exactly a 1-minute window.

            // --- 1. Rift Logic ---
            if (currentSettings.alarmStatus.rift) {
                RIFT_TIMES.forEach(hour => {
                    const target = new Date(now);
                    target.setHours(hour, 0, 0, 0);

                    if (target.getTime() <= now.getTime() - 60000 * 60) {
                        target.setDate(target.getDate() + 1);
                    }

                    const diffMs = target.getTime() - now.getTime();
                    const diffMins = Math.ceil(diffMs / 60000);

                    if (diffMins >= -10 && diffMins < 1440) {
                        currentInfos.push({ type: 'rift', hour, diffMins, isEnabled: true, targetTime: target.toLocaleTimeString(), offsets: currentSettings.alarmOffsets });
                        if (diffMins > 0 && diffMins < minDiff) {
                            minDiff = diffMins;
                            nextStatus = `시공 ${hour}시 (${diffMins}분 전)`;
                        }
                        triggerAlarmHelper(`rift-${target.getTime()}`, '시공의 균열', diffMins, 'rift', currentSettings.alarmOffsets);
                    }
                });
            }

            // --- 2. Shugo Logic ---
            if (currentSettings.alarmStatus.shugo) {
                SHUGO_MINUTES.forEach(min => {
                    const target = new Date(now);
                    target.setMinutes(min, 0, 0);
                    if (target.getTime() <= now.getTime()) target.setHours(target.getHours() + 1);

                    const diffMs = target.getTime() - now.getTime();
                    const diffMins = Math.ceil(diffMs / 60000);

                    currentInfos.push({ type: 'shugo', hour: target.getHours(), diffMins, isEnabled: true, targetTime: target.toLocaleTimeString(), offsets: currentSettings.shugoAlarmOffsets });
                    if (diffMins > 0 && diffMins < minDiff) {
                        minDiff = diffMins;
                        nextStatus = `슈고 ${target.getHours()}:${min} (${diffMins}분 전)`;
                    }
                    triggerAlarmHelper(`shugo-${target.getTime()}`, '슈고 페스타', diffMins, 'shugo', currentSettings.shugoAlarmOffsets);
                });
            }

            // --- 3. Invasion Logic ---
            if (currentSettings.alarmStatus.invasion) {
                const target = new Date(now);
                target.setMinutes(0, 0, 0);
                if (target.getTime() <= now.getTime()) target.setHours(target.getHours() + 1);

                const diffMs = target.getTime() - now.getTime();
                const diffMins = Math.ceil(diffMs / 60000);
                const invOffsets = (currentSettings as any).invasionAlarmOffsets || currentSettings.alarmOffsets || [0, 5];

                currentInfos.push({ type: 'invasion', hour: target.getHours(), diffMins, isEnabled: true, targetTime: target.toLocaleTimeString(), offsets: invOffsets });
                if (diffMins > 0 && diffMins < minDiff) {
                    minDiff = diffMins;
                    nextStatus = `침공 ${target.getHours()}시 (${diffMins}분 전)`;
                }
                triggerAlarmHelper(`invasion-${target.getTime()}`, '차원 침공', diffMins, 'invasion', invOffsets);
            }

            // --- 4. Nahma ---
            if (currentSettings.alarmStatus.nahma) {
                const target = new Date(now);
                if (isNaN(target.getTime())) return;

                target.setHours(20, 0, 0, 0);
                // Find next occurrance even if not today (Safety limit: 14 days)
                let safety = 0;
                while ((![0, 6].includes(target.getDay()) || target.getTime() < now.getTime()) && safety < 14) {
                    target.setDate(target.getDate() + 1);
                    safety++;
                }

                const diffMs = target.getTime() - now.getTime();
                const diffMins = Math.ceil(diffMs / 60000);
                const nahmaOffsets = currentSettings.bossNahmaAlarmOffsets || [0, 5];

                if (diffMins < 10080) { // Within a week
                    currentInfos.push({ type: 'nahma', hour: 20, diffMins, isEnabled: true, targetTime: target.toLocaleTimeString(), offsets: nahmaOffsets });
                    if (diffMins > 0 && diffMins < minDiff) {
                        minDiff = diffMins;
                        const dayName = target.getDay() === 0 ? '일' : '토';
                        nextStatus = `나흐마 ${dayName} 20시 (${diffMins}분 전)`;
                    }
                    triggerAlarmHelper(`nahma-${target.getTime()}`, '나흐마 등장', diffMins, 'nahma', nahmaOffsets);
                }
            }

            setNextAlarm(nextStatus);
            setDebugInfo(currentInfos.sort((a, b) => a.diffMins - b.diffMins));
        };

        const interval = setInterval(checkAlarms, 1000);
        return () => clearInterval(interval);
    }, [settings, isConnected, virtualTimeOffset]);

    const triggerAlarm = (text: string, type?: string, diffMins?: number) => {
        if (!settings) return;

        // 1. Browser Notification
        if (settings.notificationType === 'both' || settings.notificationType === 'vib') {
            if (Notification.permission === 'granted') {
                new Notification('아이온2 알리미', { body: text });
            } else if (Notification.permission !== 'denied') {
                Notification.requestPermission().then(permission => {
                    if (permission === 'granted') new Notification('아이온2 알리미', { body: text });
                });
            }
        }

        // 2. Sound (File)
        if (settings.notificationType === 'both' || settings.notificationType === 'sound') {
            if (type && diffMins !== undefined) {
                playAudio(type, diffMins);
            }
        }
    };

    useEffect(() => {
        const savedKey = localStorage.getItem('aion2_alerter_sync_key');
        const localSettings = localStorage.getItem('aion2_alerter_local_settings');
        const savedClockOffset = localStorage.getItem('aion2_alerter_clock_offset');
        if (savedClockOffset) {
            const parsed = parseFloat(savedClockOffset);
            if (!isNaN(parsed)) setManualClockOffset(parsed);
        }

        if (savedKey) {
            setSyncKey(savedKey);
            if (localSettings) {
                // If we have local changes, use them first
                try {
                    setSettings(JSON.parse(localSettings));
                    setIsConnected(true);
                } catch (e) {
                    handleSync(savedKey, true);
                }
            } else {
                // Otherwise fetch from cloud
                handleSync(savedKey, true);
            }
        }

        // Request Notification Permission on mount
        if (Notification.permission !== 'granted' && Notification.permission !== 'denied') {
            Notification.requestPermission();
        }
    }, []);

    // [Simulation] Time Travel Helper
    // [Simulation] Time Travel Helper
    const simulateAlarm = (type: string, offsetMins: number) => {
        const now = new Date();
        let targetDate: Date | null = null;
        let minDiff = Infinity;

        // 1. Calculate Target Date based on Type
        if (type === 'rift') {
            RIFT_TIMES.forEach(h => {
                const d = new Date(now);
                d.setHours(h, 0, 0, 0);
                if (d.getTime() < now.getTime()) d.setDate(d.getDate() + 1);

                const diff = d.getTime() - now.getTime();
                if (diff < minDiff) { minDiff = diff; targetDate = d; }
            });
        }
        else if (type === 'shugo') {
            SHUGO_MINUTES.forEach(min => {
                const d = new Date(now);
                d.setMinutes(min, 0, 0);
                // If passed in current hour, move to next hour
                // Actually if now is 14:20 and target 14:15. It's past.
                // We want next occurrence: 15:15? No, 14:45.
                // Logic: Set min. If < now, add 1 hour? No, that only works if only 1 per hour.
                // Here we have multiple.
                // Simplified: Set min for current hour. If < now, try next hour? 
                // Wait, if 14:15 is past, we check 14:45.
                // So checking "Current Hour" is correct initial step.

                if (d.getTime() < now.getTime()) {
                    // Try same min next hour? Or depend on array order?
                    // Let's just blindly check current hour's slot, if past, check next hour's slot.
                    d.setHours(d.getHours() + 1);
                }

                // We need reliable "Next" logic.
                // Quick fix: Just check current hour mins, and next hour mins.
                // But efficient way:
                const d2 = new Date(now); d2.setMinutes(min, 0, 0);
                if (d2.getTime() < now.getTime()) d2.setHours(d2.getHours() + 1);

                const diff = d2.getTime() - now.getTime();
                if (diff < minDiff) { minDiff = diff; targetDate = d2; }
            });
        }
        else if (type === 'invasion') {
            const d = new Date(now);
            d.setMinutes(0, 0, 0);
            if (d.getTime() < now.getTime()) d.setHours(d.getHours() + 1);
            targetDate = d;
        }
        else if (type === 'nahma') {
            const d = new Date(now);
            d.setHours(20, 0, 0, 0);
            // Find next Sat(6) or Sun(0)
            while (d.getDay() !== 0 && d.getDay() !== 6 || d.getTime() < now.getTime()) {
                d.setDate(d.getDate() + 1);
                d.setHours(20, 0, 0, 0);
            }
            targetDate = d;
        }

        if (targetDate) {
            // Calculate required offset: We want (VirtualNow) = (Target - OffsetMins)
            // VirtualNow = RealNow + VirtualOffset
            // Re-arranged: VirtualOffset = (Target - OffsetMins) - RealNow
            const targetTimeForTrigger = new Date((targetDate as Date).getTime() - offsetMins * 60000);
            const requiredOffset = targetTimeForTrigger.getTime() - now.getTime(); // + extra 1 sec to be safe? No, exact is fine.

            setVirtualTimeOffset(requiredOffset);
            triggeredAlarmsRef.current.clear(); // Reset trigger tracking so it fires immediately

            // Visual Feedback
            setNextAlarm(`[TEST] ${type} ${offsetMins}분 전 시뮬레이션 시작...`);
        }
    };

    const resetSimulation = () => {
        setVirtualTimeOffset(0);
        triggeredAlarmsRef.current.clear();
        setNextAlarm('시뮬레이션 종료. 현재 시간 복귀.');
    };

    // Wrapper to update state AND save to local storage
    const updateSettings = (newSettings: AlerterSettings) => {
        setSettings(newSettings);
        localStorage.setItem('aion2_alerter_local_settings', JSON.stringify(newSettings));
    };

    const handleSync = async (keyInput: string = syncKey, isAuto = false) => {
        const key = keyInput.replace(/\s/g, '').toUpperCase();

        if (key.length < 8) {
            if (!isAuto) setError('키 형식이 올바르지 않습니다.');
            return;
        }

        setIsLoading(true);
        setError('');

        try {
            const snapshotPromise = get(child(ref(alerterDb), `users/${key}`));
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 10000));

            const snapshot: any = await Promise.race([snapshotPromise, timeoutPromise]);

            if (snapshot.exists()) {
                const data = snapshot.val();
                data.lastSync = new Date().toLocaleString('ko-KR');
                // When syncing from cloud, we update local storage too (Reset)
                updateSettings(data);
                setIsConnected(true);
                localStorage.setItem('aion2_alerter_sync_key', key);
                if (!isAuto) alert('연동 성공! 설정을 불러왔습니다.');
            } else {
                if (!isAuto) setError('유효하지 않은 키입니다. 다시 확인해주세요.');
                setIsConnected(false);
                setSettings(null);
            }
        } catch (e) {
            console.error(e);
            if (!isAuto) setError('연동 중 오류가 발생했습니다.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleDisconnect = () => {
        if (confirm('연동을 해제하시겠습니까?')) {
            localStorage.removeItem('aion2_alerter_sync_key');
            localStorage.removeItem('aion2_alerter_local_settings'); // Clear local settings too
            setSyncKey('');
            setIsConnected(false);
            setSettings(null);
        }
    }

    const toggleAlarm = (key: keyof AlerterSettings['alarmStatus']) => {
        if (!settings) return;
        updateSettings({
            ...settings,
            alarmStatus: {
                ...settings.alarmStatus,
                [key]: !settings.alarmStatus[key]
            }
        });
    };

    const handleTestSound = (arg?: any) => {
        if (!settings) return;

        const text = typeof arg === 'string' ? arg : "슈고 페스타, 5분 전입니다.";

        const speak = (content: string, useDefaultVoice: boolean) => {
            // Cancel previous
            window.speechSynthesis.cancel();

            setTimeout(() => {
                const msg = new SpeechSynthesisUtterance(content);
                msg.volume = settings.volume / 100;
                msg.rate = 1.0;
                msg.pitch = 1.0;

                // Attempt to set voice ONLY if not using default fallback
                if (!useDefaultVoice) {
                    const voices = window.speechSynthesis.getVoices();
                    const korVoice = voices.find(v => v.lang.includes('ko'));
                    if (korVoice) {
                        msg.voice = korVoice;
                        console.log("Using Voice:", korVoice.name);
                    }
                } else {
                    console.log("Using system default voice (Fallback)");
                }

                msg.onstart = () => console.log("TTS Start");
                msg.onerror = (e) => {
                    console.error("TTS Error:", e.error);

                    // Retry Logic: If synthesis-failed and we were using a specific voice, try default
                    if (e.error === 'synthesis-failed' && !useDefaultVoice) {
                        console.warn("TTS Failed with specific voice. Retrying with default...");
                        speak(content, true);
                    } else if (e.error === 'not-allowed') {
                        alert("브라우저가 소리 재생을 차단했습니다. 사이트 설정에서 '소리' 권한을 허용해주세요.");
                    }
                };

                window.speechSynthesis.speak(msg);
            }, 50);
        };

        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
            speak(text, false);
        } else {
            alert("이 브라우저는 음성 안내를 지원하지 않습니다.");
        }
    };



    return (
        <div className="space-y-6 animate-in fade-in duration-700">
            <div>
                <h2 className="text-4xl font-black text-slate-900 dark:text-white flex items-center gap-3 tracking-tight">
                    <button onClick={() => setShowLocalDebug(!showLocalDebug)} className="outline-none active:scale-95 transition-transform">
                        <Bell className={showLocalDebug ? "text-red-500" : "text-indigo-500 dark:text-indigo-400"} size={36} />
                    </button>
                    알리미 설정 연동
                </h2>
                <div className="flex items-center gap-4 mt-[17px] font-medium">
                    <p className="text-slate-500 dark:text-slate-300 text-sm">
                        연동 키를 입력하면 내 설정을 그대로 불러와 알람을 수신합니다. (원본 설정은 변경되지 않습니다.)
                        {showLocalDebug && <span className="text-red-500 font-bold ml-2">[디버그 모드 활성]</span>}
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Left: Connection Panel */}
                <div className="space-y-6">
                    <div className="glass-panel p-8 relative overflow-hidden bg-gradient-to-br from-white to-slate-50 dark:from-slate-800 dark:to-slate-900">
                        <h3 className="text-xl font-black text-slate-800 dark:text-slate-200 mb-6 flex items-center gap-2">
                            <Link size={20} className="text-indigo-500 dark:text-indigo-400" />
                            동기화 연결
                        </h3>

                        <div className="space-y-6">
                            <div>
                                <label className="block text-xs font-bold text-slate-400 dark:text-slate-300 mb-2 pl-1 uppercase tracking-widest">Sync Key</label>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={syncKey}
                                        onChange={(e) => setSyncKey(e.target.value.toUpperCase())}
                                        placeholder="A7PV ZAFV"
                                        disabled={isConnected || isLoading}
                                        className={cn(
                                            "w-full bg-white dark:bg-slate-700 border-2 rounded-2xl px-5 py-4 font-mono font-black text-xl outline-none transition-all placeholder:text-slate-200 dark:placeholder:text-slate-600 tracking-wider shadow-sm text-slate-900 dark:text-white",
                                            isConnected
                                                ? "border-green-500 text-green-600 dark:text-green-400 bg-green-50/30 dark:bg-green-900/20"
                                                : "border-slate-100 dark:border-slate-600 focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                                        )}
                                    />
                                    {isConnected ? (
                                        <button
                                            onClick={handleDisconnect}
                                            className="px-6 rounded-2xl font-bold bg-white text-red-500 border-2 border-red-50 hover:border-red-100 hover:bg-red-50 transition-all whitespace-nowrap shadow-sm"
                                        >
                                            해제
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => handleSync()}
                                            disabled={!syncKey || isLoading}
                                            className="px-8 rounded-2xl font-bold bg-indigo-600 text-white shadow-lg shadow-indigo-200 hover:bg-indigo-700 disabled:opacity-50 disabled:shadow-none transition-all whitespace-nowrap active:scale-95"
                                        >
                                            {isLoading ? <Loader2 className="animate-spin" /> : '연동 시작'}
                                        </button>
                                    )}
                                </div>
                                {error && <p className="text-red-500 text-xs font-bold mt-3 ml-2 flex items-center gap-1"><X size={12} /> {error}</p>}
                            </div>

                            <div className="bg-indigo-50/50 dark:bg-indigo-900/20 rounded-2xl p-5 border border-indigo-50 dark:border-indigo-900/30">
                                <h4 className="flex items-center gap-2 text-indigo-900 dark:text-indigo-200 font-bold text-sm mb-2">
                                    <span className="w-5 h-5 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-[10px]">?</span>
                                    연동 키 확인 방법
                                </h4>
                                <p className="text-indigo-700/70 dark:text-indigo-300/70 text-xs leading-relaxed pl-7">
                                    아이온2 이벤트 알리미 사이트 방문 시<br />
                                    우측 상단 <strong>[설정] &gt; [기기 연동]</strong>에서 8자리 코드를 확인하실 수 있습니다.
                                </p>
                            </div>

                            <a
                                href="https://aion2-timer.vercel.app/index.html"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center justify-center gap-2 w-full py-4 rounded-2xl border-2 border-indigo-100 dark:border-indigo-800 text-indigo-400 dark:text-indigo-400 font-bold hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-600 dark:hover:text-indigo-300 hover:border-indigo-200 dark:hover:border-indigo-700 transition-all group"
                            >
                                <span className="group-hover:scale-110 transition-transform">🔗</span>
                                아이온2 이벤트 알리미 바로가기
                            </a>
                        </div>
                    </div>

                    {showLocalDebug && (
                        <div className="bg-slate-900 text-slate-200 p-4 rounded-2xl font-mono text-xs space-y-2 overflow-x-auto">
                            <h4 className="font-bold text-yellow-400 mb-2 flex justify-between items-center">
                                <span>🔍 DEBUG INFO ({virtualTimeOffset !== 0 ? '🔴 VIRTUAL' : 'REAL'})</span>
                                <div className="flex gap-1">
                                    <button onClick={() => window.speechSynthesis.cancel()} className="bg-slate-700 text-slate-300 px-2 py-0.5 rounded hover:bg-slate-600 text-[10px]">
                                        🔇 MUTE
                                    </button>
                                    {virtualTimeOffset !== 0 && (
                                        <button onClick={resetSimulation} className="bg-red-500 text-white px-2 py-0.5 rounded hover:bg-red-600 transition-colors">
                                            RESET
                                        </button>
                                    )}
                                </div>
                            </h4>

                            {/* Audio Log Section */}
                            <div className="bg-black/50 p-2 rounded mb-2 max-h-24 overflow-y-auto">
                                <p className="text-slate-500 text-[9px] mb-1 sticky top-0 bg-black/50">🔊 AUDIO LOG</p>
                                {audioLog.length === 0 ? (
                                    <p className="text-slate-600 italic">No audio events yet.</p>
                                ) : (
                                    audioLog.map((log, i) => (
                                        <p key={i} className="text-cyan-200 border-b border-white/5 pb-0.5 mb-0.5 last:border-0">{log}</p>
                                    ))
                                )}
                            </div>

                            <div className="text-[10px] text-slate-400 mb-2">
                                {virtualTimeOffset !== 0 ? 'VIRTUAL' : 'REAL'}: {currentTime.toLocaleTimeString()}
                            </div>
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="text-slate-500 border-b border-slate-700">
                                        <th className="pb-1">Target</th>
                                        <th className="pb-1">Time</th>
                                        <th className="pb-1">Diff(Min)</th>
                                        <th className="pb-1">Active</th>
                                        <th className="pb-1">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {debugInfo.map((info, idx) => (
                                        <tr key={idx} className={cn("border-b border-slate-800", !info.isEnabled && "opacity-30")}>
                                            <td className="py-1 text-cyan-400">{info.type}</td>
                                            <td className="py-1">{info.targetTime}</td>
                                            <td className={cn("py-1 font-bold", info.diffMins <= 5 ? "text-green-400" : "text-slate-400")}>
                                                {info.diffMins}m
                                            </td>
                                            <td className="py-1">{info.isEnabled ? 'ON' : 'OFF'}</td>
                                            <td className="py-1">
                                                {info.offsets.includes(info.diffMins) ? <span className="text-red-400 animate-pulse">FIRE!</span> : '-'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {/* Force Test Buttons - Now Simulators */}
                            <div className="pt-2 grid grid-cols-2 gap-2">
                                <button onClick={() => simulateAlarm('shugo', 5)} className="bg-slate-800 hover:bg-slate-700 px-2 py-1 rounded text-cyan-200">Simulate Shugo 5m</button>
                                <button onClick={() => simulateAlarm('rift', 5)} className="bg-slate-800 hover:bg-slate-700 px-2 py-1 rounded text-cyan-200">Simulate Rift 5m</button>
                                <button onClick={() => simulateAlarm('invasion', 5)} className="bg-slate-800 hover:bg-slate-700 px-2 py-1 rounded text-cyan-200">Simulate Inv. 5m</button>
                                <button onClick={() => simulateAlarm('nahma', 0)} className="bg-slate-800 hover:bg-slate-700 px-2 py-1 rounded text-cyan-200">Simulate Nahma Start</button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Right: Interactive Settings Dashboard */}
                <div className="space-y-6">
                    {isConnected && settings ? (
                        <div className="glass-panel p-8 animate-in slide-in-from-bottom-4 duration-500 border-indigo-100 dark:border-slate-700 bg-white/80 dark:bg-slate-800/80 relative shadow-xl shadow-indigo-100/20 dark:shadow-none backdrop-blur-xl">
                            {/* Status Header */}
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 pb-6 border-b border-slate-100 dark:border-slate-700">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center text-indigo-500 shadow-inner">
                                        <Signal size={24} className={isLoading ? "animate-pulse" : ""} />
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-black text-slate-800 dark:text-white flex items-center gap-2">
                                            통합 알람 제어
                                            {virtualTimeOffset !== 0 && <span className="text-[10px] bg-red-500 text-white px-1.5 py-0.5 rounded animate-pulse">VIRTUAL</span>}
                                        </h3>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className="flex items-center gap-1.5 text-xs font-bold text-slate-400">
                                                <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                                                현지 사이트 시간:
                                            </span>
                                            <span className="text-sm font-black text-indigo-600 dark:text-indigo-400 tabular-nums">
                                                {currentTime.toLocaleTimeString('ko-KR', { hour12: false })}
                                            </span>
                                            <div className="flex gap-1 ml-2">
                                                <button
                                                    onClick={() => {
                                                        const newVal = manualClockOffset - 0.5;
                                                        setManualClockOffset(newVal);
                                                        localStorage.setItem('aion2_alerter_clock_offset', newVal.toString());
                                                    }}
                                                    className="w-8 h-5 flex items-center justify-center bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded text-[10px] font-bold text-slate-500 transition-colors"
                                                    title="-0.5s"
                                                >
                                                    -0.5
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        const newVal = manualClockOffset + 0.5;
                                                        setManualClockOffset(newVal);
                                                        localStorage.setItem('aion2_alerter_clock_offset', newVal.toString());
                                                    }}
                                                    className="w-8 h-5 flex items-center justify-center bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded text-[10px] font-bold text-slate-500 transition-colors"
                                                    title="+0.5s"
                                                >
                                                    +0.5
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setManualClockOffset(0);
                                                        localStorage.removeItem('aion2_alerter_clock_offset');
                                                    }}
                                                    className="w-5 h-5 flex items-center justify-center bg-indigo-50 dark:bg-indigo-900/30 hover:bg-indigo-100 dark:hover:bg-indigo-800/50 rounded text-indigo-500 transition-colors"
                                                    title="Reset"
                                                >
                                                    <RefreshCw size={10} />
                                                </button>
                                            </div>
                                        </div>
                                        {settings.lastSync && (
                                            <div className="text-[10px] text-slate-400 mt-1 flex items-center gap-1.5 font-medium">
                                                <div className="w-1 h-1 rounded-full bg-slate-300" />
                                                최종 동기화: {settings.lastSync}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="flex flex-col items-end gap-2">
                                    <div className="px-4 py-2 bg-indigo-500 rounded-xl shadow-lg shadow-indigo-200 dark:shadow-none flex items-center gap-3 group transition-all hover:scale-[1.02]">
                                        <div className="flex flex-col items-end">
                                            <span className="text-[9px] font-black text-white/70 uppercase tracking-tighter">Next Alarm</span>
                                            <span className="text-xs font-black text-white truncate max-w-[150px]">
                                                {nextAlarm}
                                            </span>
                                        </div>
                                        <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center text-white">
                                            <Bell size={16} className="animate-bounce" />
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => triggerAlarm("현재 설정된 알람 방식 테스트 메시지입니다.", 'shugo', 5)}
                                            className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 font-bold text-[10px] shadow-sm hover:bg-slate-50 dark:hover:bg-slate-600 transition-all flex items-center gap-1"
                                        >
                                            <PlayCircle size={12} className="text-indigo-500" />
                                            테스트
                                        </button>
                                        <button
                                            onClick={() => handleSync()}
                                            className="px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 font-bold text-[10px] shadow-sm hover:bg-indigo-100 dark:hover:bg-indigo-800/50 transition-all flex items-center gap-1"
                                        >
                                            <RefreshCw size={12} className={isLoading ? "animate-spin" : ""} />
                                            동기화
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-10">
                                {/* 1. Notification Mode (Tabs) */}
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 dark:text-slate-300 mb-3 pl-1 uppercase tracking-widest flex items-center gap-2">
                                        <Bell size={12} /> 알람 방식
                                    </label>
                                    <div className="bg-slate-100 dark:bg-slate-700/50 p-1.5 rounded-2xl flex gap-1">
                                        <ModeSelector
                                            label="소리+윈도우 알람"
                                            icon="📢"
                                            active={settings.notificationType === 'both'}
                                            onClick={() => updateSettings({ ...settings, notificationType: 'both' })}
                                        />
                                        <ModeSelector
                                            label="소리만"
                                            icon="🔊"
                                            active={settings.notificationType === 'sound'}
                                            onClick={() => updateSettings({ ...settings, notificationType: 'sound' })}
                                        />
                                        <ModeSelector
                                            label="윈도우 알람만"
                                            icon="💬"
                                            active={settings.notificationType === 'vib'}
                                            onClick={() => updateSettings({ ...settings, notificationType: 'vib' })}
                                        />
                                        <ModeSelector
                                            label="끄기"
                                            icon="🔕"
                                            active={settings.notificationType === 'none'}
                                            isDestructive
                                            onClick={() => updateSettings({ ...settings, notificationType: 'none' })}
                                        />
                                    </div>
                                </div>

                                {/* 2. Volume Slider */}
                                <div>
                                    <div className="flex justify-between items-center mb-4 px-1">
                                        <label className="text-xs font-bold text-slate-400 dark:text-slate-300 uppercase tracking-widest flex items-center gap-2">
                                            <Volume2 size={12} /> 알람 볼륨
                                        </label>
                                        <div className="px-3 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 text-sm font-black tabular-nums">
                                            {settings.volume}%
                                        </div>
                                    </div>
                                    <div className="relative h-6 flex items-center">
                                        <div className="absolute w-full h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-gradient-to-r from-indigo-400 to-indigo-600 transition-all duration-100"
                                                style={{ width: `${settings.volume}%` }}
                                            />
                                        </div>
                                        <input
                                            type="range"
                                            min="0"
                                            max="100"
                                            step="1"
                                            value={settings.volume}
                                            onChange={(e) => updateSettings({ ...settings, volume: parseInt(e.target.value) })}
                                            className="absolute w-full h-full opacity-0 cursor-pointer"
                                        />
                                        <div
                                            className="absolute w-5 h-5 bg-white border-2 border-indigo-500 rounded-full shadow-md pointer-events-none transition-all duration-100"
                                            style={{ left: `calc(${settings.volume}% - 10px)` }}
                                        />
                                    </div>
                                </div>

                                {/* 3. Active Alarms & Details (Consolidated) */}
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 dark:text-slate-300 mb-3 pl-1 uppercase tracking-widest flex items-center gap-2">
                                        <Check size={12} /> 알람 대상
                                    </label>

                                    {/* Checkbox Row */}
                                    <div className="flex flex-wrap gap-4 mb-6 px-1">
                                        <CompactToggle label="시공" active={settings.alarmStatus?.rift} onClick={() => toggleAlarm('rift')} />
                                        <CompactToggle label="슈고" active={settings.alarmStatus?.shugo} onClick={() => toggleAlarm('shugo')} />
                                        <CompactToggle label="침공" active={settings.alarmStatus?.invasion} onClick={() => toggleAlarm('invasion')} />
                                        <CompactToggle label="나흐마" active={settings.alarmStatus?.nahma} onClick={() => toggleAlarm('nahma')} />
                                        <CompactToggle label="커스텀" active={settings.alarmStatus?.custom} onClick={() => toggleAlarm('custom')} />
                                    </div>

                                    {/* Tree View Details */}
                                    <div className="space-y-1 pl-2">
                                        {/* Rift Details */}
                                        <TreeItem
                                            label="시공"
                                            active={settings.alarmStatus?.rift}
                                            times={settings.alarmOffsets}
                                        />

                                        {/* Shugo Details */}
                                        <TreeItem
                                            label="슈고"
                                            active={settings.alarmStatus?.shugo}
                                            times={settings.shugoAlarmOffsets}
                                        // Removed isAmber for consistency
                                        />

                                        {/* Invasion Details */}
                                        <TreeItem
                                            label="침공"
                                            active={settings.alarmStatus?.invasion}
                                            times={settings.invasionAlarmOffsets || settings.alarmOffsets}
                                        />

                                        {/* Nahma Details */}
                                        <TreeItem
                                            label="나흐마"
                                            active={settings.alarmStatus?.nahma}
                                            times={settings.bossNahmaAlarmOffsets}
                                            // Fallback to "시작 시" if no offsets
                                            customContent={(!settings.bossNahmaAlarmOffsets || settings.bossNahmaAlarmOffsets.length === 0) ? (
                                                <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-xs font-bold text-slate-600 dark:text-slate-300">
                                                    시작 시
                                                </span>
                                            ) : undefined}
                                        />

                                        {/* Custom Details */}
                                        <TreeItem
                                            label="커스텀"
                                            active={settings.alarmStatus?.custom}
                                            customContent={
                                                <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-xs font-bold text-slate-600 dark:text-slate-300">
                                                    1개의 스케줄 존재
                                                </span>
                                            }
                                            isLast
                                        />
                                    </div>

                                    {/* 4. Diagnostics (Hidden by default) */}
                                    {showLocalDebug && (
                                        <div className="animate-in fade-in slide-in-from-bottom-2 duration-500 mt-6">
                                            <div className="flex justify-between items-end mb-3">
                                                <label className="text-xs font-bold text-slate-400 pl-1 uppercase tracking-widest flex items-center gap-2">
                                                    <Wrench size={12} /> 알람 진단
                                                </label>
                                                <span className="text-xs font-bold text-indigo-500 bg-indigo-50 px-2 py-1 rounded-md">
                                                    {nextAlarm}
                                                </span>
                                            </div>
                                            <div className="bg-slate-50 p-4 rounded-2xl space-y-3 border border-slate-100">
                                                <p className="text-xs text-slate-400 font-medium flex items-center gap-1">
                                                    <PlayCircle size={10} />
                                                    강제 알람 실행 (소리 및 알림 테스트)
                                                </p>
                                                <div className="grid grid-cols-2 gap-2">
                                                    <button onClick={() => playAudio('shugo', 5)} className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-100 transition-all text-left shadow-sm group">
                                                        <span className="opacity-50 group-hover:opacity-100 mr-2">🐹</span>
                                                        슈고 5분전
                                                    </button>
                                                    <button onClick={() => playAudio('rift', 5)} className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-100 transition-all text-left shadow-sm group">
                                                        <span className="opacity-50 group-hover:opacity-100 mr-2">⚡</span>
                                                        시공 5분전
                                                    </button>
                                                    <button onClick={() => playAudio('invasion', 5)} className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-100 transition-all text-left shadow-sm group">
                                                        <span className="opacity-50 group-hover:opacity-100 mr-2">⚔️</span>
                                                        침공 5분전
                                                    </button>
                                                    <button onClick={() => playAudio('nahma', 0)} className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-100 transition-all text-left shadow-sm group">
                                                        <span className="opacity-50 group-hover:opacity-100 mr-2">👑</span>
                                                        나흐마 시작
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="glass-panel p-8 flex flex-col items-center justify-center h-full min-h-[500px] text-slate-300 gap-6 border-dashed border-2 bg-transparent">
                            <div className="p-8 rounded-full bg-slate-50 dark:bg-slate-800">
                                <Link size={64} className="opacity-20 text-slate-400 dark:text-slate-500" />
                            </div>
                            <div className="text-center space-y-1">
                                <p className="text-lg font-black text-slate-400">연동 대기 중</p>
                                <p className="text-sm font-medium opacity-60">좌측 패널에서 Sync Key를 입력해주세요</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// --- Helper Components for Premium UI ---

function ModeSelector({ label, icon, active, isDestructive, onClick }: any) {
    return (
        <button
            onClick={onClick}
            className={cn(
                "flex-1 flex flex-col items-center justify-center gap-1 py-3 rounded-xl transition-all duration-200 font-bold text-xs",
                active
                    ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-md shadow-slate-200 dark:shadow-none scale-[1.02]"
                    : "text-slate-400 dark:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-700/50 hover:text-slate-600 dark:hover:text-slate-300",
                active && isDestructive && "text-red-500"
            )}
        >
            <span className="text-lg mb-0.5">{icon}</span>
            <span>{label}</span>
        </button>
    )
}

function CompactToggle({ label, active, onClick }: any) {
    return (
        <button
            onClick={onClick}
            className="flex items-center gap-1.5 transition-all outline-none group"
        >
            <div className={cn(
                "w-5 h-5 flex items-center justify-center border transition-all rounded-[4px]", // Square shape
                active
                    ? "bg-green-500 border-green-500 text-white shadow-sm" // Green Check
                    : "bg-white dark:bg-slate-800 border-red-200 dark:border-red-900/50 text-red-500 dark:text-red-400 hover:border-red-300 dark:hover:border-red-800" // Red X outline
            )}>
                {active ? <Check size={14} strokeWidth={4} /> : <X size={14} strokeWidth={4} />}
            </div>
            <span className={cn(
                "text-sm font-bold transition-colors",
                active ? "text-slate-700 dark:text-slate-200" : "text-slate-400 dark:text-slate-300"
            )}>
                {label}
            </span>
        </button>
    );
}

function TreeItem({ label, active, times, isAmber, customContent, isLast }: any) {
    return (
        <div className="flex items-start gap-3 relative h-10">
            {/* Tree Connector L-shape */}
            <div className="absolute left-0 top-0 w-4 h-full">
                <div className="absolute left-0 top-0 w-[2px] h-full bg-slate-100 dark:bg-slate-700" />
                <div className="absolute left-0 top-[50%] w-3 h-[2px] bg-slate-100 dark:bg-slate-700" />
            </div>

            <div className="ml-6 flex items-center justify-between w-full h-full pr-2">
                <span className={cn(
                    "text-sm font-bold transition-colors w-16 text-right",
                    active ? "text-slate-600 dark:text-slate-300" : "text-slate-300 dark:text-slate-300" // Removed line-through as per request to "show settings as is"
                )}>
                    {label}:
                </span>

                <div className={cn(
                    "flex items-center justify-end gap-1.5 flex-1 flex-wrap transition-opacity duration-200",
                    !active && "opacity-60 grayscale"
                )}>
                    {/* Always render content regardless of active state */}
                    {customContent ? customContent : (
                        times?.length > 0 ? times.map((t: number) => (
                            <span key={t} className={cn(
                                "px-2 py-0.5 rounded-md border text-xs font-bold shadow-sm",
                                isAmber
                                    ? "bg-amber-50 border-amber-100 text-amber-600"
                                    : "bg-slate-100 dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300"
                            )}>
                                {t === 0 ? "시작 시" : `${t}분 전`}
                            </span>
                        )) : <span className="text-xs text-slate-300">-</span>
                    )}
                </div>
            </div>
        </div>
    );
}
