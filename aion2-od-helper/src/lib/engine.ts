import { addHours, differenceInHours, startOfDay, addDays, isAfter, parseISO } from 'date-fns';

// AION2 Constants (KST 기준)
export const RESET_HOUR = 5; // 5 AM
export const ODE_MAX_NORMAL = 540;
export const ODE_MAX_MEMBERSHIP = 840;
export const ODE_EXTRA_MAX = 2000;
export const ODE_RECHARGE_3H_NORMAL = 10;
export const ODE_RECHARGE_3H_MEMBERSHIP = 15;

export const EXPEDITION_MAX_BASIC = 14;
export const TRANSCENDENCE_MAX_BASIC = 7;
export const SHUGO_MAX_BASIC = 14;
export const INVASION_MAX_BASIC = 7;
export const SANCTUARY_MAX_BASIC = 4;

export const EXPEDITION_KILLS_CHAR_LIMIT = 35;
export const EXPEDITION_KILLS_ACC_LIMIT = 63;
export const TRANSCENDENCE_KILLS_CHAR_LIMIT = 28;
export const TRANSCENDENCE_KILLS_ACC_LIMIT = 42;
export const SANCTUARY_KILLS_CHAR_LIMIT = 2;

/**
 * KST (UTC+9) 기준 현재 시각 반환
 */
export const getKSTNow = () => {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  return new Date(utc + (3600000 * 9));
};

export const getLatestResetTime = (date: Date = getKSTNow()) => {
  const resetToday = addHours(startOfDay(date), RESET_HOUR);
  if (isAfter(date, resetToday)) return resetToday;
  return addHours(startOfDay(addDays(date, -1)), RESET_HOUR);
};

/**
 * 특정 시각(02, 05, 08... 23) 게이트를 몇 번 지났는지 계산
 */
const countGateCrossed = (start: Date, end: Date, interval: number, offset: number) => {
  let count = 0;
  let current = new Date(start);
  current.setMinutes(0, 0, 0); // 분/초 초기화

  // 다음 게이트 시각 찾기
  let nextGate = new Date(current);
  const currentHour = nextGate.getHours();
  const hoursToNext = (interval - ((currentHour - offset + 24) % interval)) % interval;
  nextGate = addHours(nextGate, hoursToNext === 0 && !isAfter(nextGate, start) ? interval : hoursToNext);

  let safety = 0;
  while (!isAfter(nextGate, end) && safety < 1000) {
    if (isAfter(nextGate, start)) {
      count++;
    }
    nextGate = addHours(nextGate, interval);
    safety++;
  }
  return count;
};

export const calculateCurrentState = (data: any, now: Date = getKSTNow(), isCharacter: boolean = false, isMembership: boolean = false) => {
  const lastUpdate = data.lastUpdate ? parseISO(data.lastUpdate) : getLatestResetTime(now);
  const newState = { ...data };

  // 1. Ode Calculation (3시간마다 정해진 수치 회복 - 02, 05, 08... 23시)
  if (isCharacter) {
    const maxOde = isMembership ? ODE_MAX_MEMBERSHIP : ODE_MAX_NORMAL;
    const rechargeAmount = isMembership ? ODE_RECHARGE_3H_MEMBERSHIP : ODE_RECHARGE_3H_NORMAL;
    
    // 회복 게이트: 02, 05, 08, 11, 14, 17, 20, 23 (간격 3, 오프셋 2)
    const gatesPassed = countGateCrossed(lastUpdate, now, 3, 2);
    newState.ode = Math.min(maxOde, (data.ode || 0) + (gatesPassed * rechargeAmount));
  }

  // 2. Tickets Calculation
  if (isCharacter) {
    // 원정 티켓: 12시간마다 1장 (05, 17시)
    const expeditionGates = countGateCrossed(lastUpdate, now, 12, 5);
    newState.expeditionBasic = Math.min(EXPEDITION_MAX_BASIC, (data.expeditionBasic || 0) + expeditionGates);
    
    // 초월 티켓: 24시간마다 2장 (05시)
    const transcendenceGates = countGateCrossed(lastUpdate, now, 24, 5);
    newState.transcendenceBasic = Math.min(TRANSCENDENCE_MAX_BASIC, (data.transcendenceBasic || 0) + (transcendenceGates * 2));

    // 성역 티켓: 주간 168시간(1주일)마다 4장 (수요일 05시)
    const sanctuaryGates = countWeeklyWednesdayGates(lastUpdate, now);
    newState.sanctuaryBasic = Math.min(SANCTUARY_MAX_BASIC, (data.sanctuaryBasic || 0) + (sanctuaryGates * 4));
  } else {
    // 계정 레벨 (슈고/침공)
    const dailyGates = countGateCrossed(lastUpdate, now, 24, 5);
    newState.shugoBasic = Math.min(SHUGO_MAX_BASIC, (data.shugoBasic || 0) + (dailyGates * 2));
    newState.invasionBasic = Math.min(INVASION_MAX_BASIC, (data.invasionBasic || 0) + dailyGates);
  }

  // 3. Reset Logic (5 AM Daily / Wednesday Weekly)
  const latestReset = getLatestResetTime(now);
  if (isAfter(latestReset, lastUpdate)) {
    if (isCharacter) newState.mission = 0;

    const wednesdayReset = getWednesdayReset(now);
    if (isAfter(wednesdayReset, lastUpdate)) {
      if (isCharacter) {
        newState.awakening = 0;
        newState.sanctuaryCount = 0;
        newState.expeditionKillsBasic = EXPEDITION_KILLS_CHAR_LIMIT;
        newState.expeditionKillsExtra = 0;
        newState.transcendenceKillsBasic = TRANSCENDENCE_KILLS_CHAR_LIMIT;
        newState.transcendenceKillsExtra = 0;
        newState.sanctuaryKillsBasic = SANCTUARY_KILLS_CHAR_LIMIT;
        newState.sanctuaryKillsExtra = 0;
      } else {
        newState.expeditionCount = 0;
        newState.transcendenceCount = 0;
        newState.sanctuaryCount = 0;
      }
    }

    // 회랑 리셋 (수/토 22:00)
    if (isCharacter) {
      const corridorResets = [getWednesday22Reset(now), getSaturday22Reset(now)];
      for (const r of corridorResets) {
        if (isAfter(r, lastUpdate) && isAfter(now, r)) newState.corridor = 0;
      }
    }
  }

  return newState;
};

const getWednesdayReset = (date: Date) => {
  const d = new Date(date);
  const day = d.getDay(); // 0(Sun) - 6(Sat)
  // 이번 주 수요일(3)로부터 며칠 전인지 계산
  const diff = (day < 3) ? (day + 4) : (day - 3);
  d.setDate(d.getDate() - diff);
  d.setHours(5, 0, 0, 0);
  return d;
};

const getWednesday22Reset = (date: Date) => {
  const d = getWednesdayReset(date);
  d.setHours(22, 0, 0, 0);
  return d;
};

const getSaturday22Reset = (date: Date) => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day < 6) ? (day + 1) : (day - 6);
  d.setDate(d.getDate() - diff);
  d.setHours(22, 0, 0, 0);
  return d;
};

/**
 * 수요일 05:00 게이트를 몇 번 지났는지 계산 (성역 티켓용)
 */
export const countWeeklyWednesdayGates = (start: Date, end: Date) => {
  let count = 0;
  let current = new Date(start);
  
  // 이번 주 수요일 05:00 시점
  const thisWed = getWednesdayReset(current);
  
  // 기준점: start보다 이후이고 end보다 이전인 첫 수요일 찾기
  let nextGate = thisWed;
  if (!isAfter(nextGate, start)) {
    nextGate = addDays(nextGate, 7);
  }

  let safety = 0;
  while (!isAfter(nextGate, end) && safety < 100) {
    count++;
    nextGate = addDays(nextGate, 7);
    safety++;
  }
  return count;
};

/**
 * 다음 오드 회복까지 남은 시간 포맷팅
 */
export const getTimeUntilNextRecharge = (now: Date = getKSTNow()) => {
  const interval = 3;
  const offset = 2; // 02, 05, 08...
  
  const d = new Date(now);
  d.setMinutes(0, 0, 0);
  
  const currentHour = d.getHours();
  const hoursSinceLastGate = (currentHour - offset + 24) % interval;
  const hoursToNext = interval - hoursSinceLastGate;
  
  const nextGate = addHours(d, hoursToNext);
  const diffMs = nextGate.getTime() - now.getTime();
  const totalSeconds = Math.max(0, Math.floor(diffMs / 1000));
  
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

