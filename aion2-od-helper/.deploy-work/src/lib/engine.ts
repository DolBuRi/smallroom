import { isAfter } from 'date-fns';

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
 * KST (UTC+9) 기준 시각 계산을 위한 헬퍼
 * 시스템 타임존에 상관없이 항상 일정한 KST 벽시계 시간을 반환합니다.
 */
export const getKSTNow = () => {
  const now = new Date();
  return new Date(now.getTime() + (9 * 60 * 60 * 1000));
};

export const getLatestResetTime = (date: Date = getKSTNow()) => {
  const d = new Date(date.getTime());
  d.setUTCHours(RESET_HOUR, 0, 0, 0);
  if (date.getTime() >= d.getTime()) return d;
  return new Date(d.getTime() - 24 * 3600000);
};

/**
 * 특정 시각(02, 05, 08... 23) 게이트를 몇 번 지났는지 계산
 * 모든 계산은 UTC 메서드를 사용하여 타임존 독립적으로 수행합니다.
 */
const countGateCrossed = (start: Date, end: Date, interval: number, offset: number) => {
  if (start.getTime() > end.getTime()) return 0;

  let count = 0;
  // 시작 시각을 기준으로 첫 번째 게이트 시각 찾기
  let current = new Date(start.getTime());
  current.setUTCMinutes(0, 0, 0);

  const currentHour = current.getUTCHours();
  // 다음 게이트까지 남은 시간 계산
  const hoursToNext = (interval - ((currentHour - offset + 24) % interval)) % interval;
  
  let nextGateTime = current.getTime() + (hoursToNext === 0 ? interval : hoursToNext) * 3600000;
  
  // 만약 계산된 nextGate가 start와 같거나 이전이면 한 주기 뒤로
  if (nextGateTime <= start.getTime()) {
    nextGateTime += interval * 3600000;
  }

  while (nextGateTime <= end.getTime()) {
    count++;
    nextGateTime += interval * 3600000;
  }
  
  return count;
};

export const calculateCurrentState = (data: any, now: Date = new Date(), isCharacter: boolean = false, isMembership: boolean = false) => {
  // DB의 lastUpdate(UTC ISO)를 그대로 사용
  const lastUpdate = data.lastUpdate 
    ? new Date(data.lastUpdate)
    : new Date(getLatestResetTime(now).getTime() - (9 * 60 * 60 * 1000));
  
  const newState = { ...data };
  
  // 모든 계산은 KST(UTC+9) 기준으로 통일
  const kstLastUpdate = new Date(lastUpdate.getTime() + (9 * 60 * 60 * 1000));
  const kstNow = new Date(now.getTime() + (9 * 60 * 60 * 1000));

  // 1. Ode Calculation
  if (isCharacter) {
    const maxOde = isMembership ? ODE_MAX_MEMBERSHIP : ODE_MAX_NORMAL;
    const rechargeAmount = isMembership ? ODE_RECHARGE_3H_MEMBERSHIP : ODE_RECHARGE_3H_NORMAL;
    

    const gatesPassed = countGateCrossed(kstLastUpdate, kstNow, 3, 2);
    const currentOde = data.ode || 0;

    if (currentOde < maxOde) {
      newState.ode = Math.min(maxOde, currentOde + (gatesPassed * rechargeAmount));
    } else {
      newState.ode = currentOde;
    }
  }

  // 2. Tickets Calculation
  if (isCharacter) {
    // 원정 티켓: 12시간마다 1장 (05, 17시)
    const expeditionGates = countGateCrossed(kstLastUpdate, kstNow, 12, 5);
    newState.expeditionBasic = Math.min(EXPEDITION_MAX_BASIC, (data.expeditionBasic || 0) + expeditionGates);
    
    // 초월 티켓: 24시간마다 2장 (05시)
    const transcendenceGates = countGateCrossed(kstLastUpdate, kstNow, 24, 5);
    newState.transcendenceBasic = Math.min(TRANSCENDENCE_MAX_BASIC, (data.transcendenceBasic || 0) + (transcendenceGates * 2));

    // 악몽 티켓 회복: 매일 2개씩 완료 횟수 차감 (05시) - 최소 0
    const nightmareGates = countGateCrossed(kstLastUpdate, kstNow, 24, 5);
    newState.nightmare = Math.max(0, (data.nightmare || 0) - (nightmareGates * 2));

    // 성역 티켓: 주간 168시간(1주일)마다 4장 (수요일 05시)
    const sanctuaryGates = countWeeklyWednesdayGates(kstLastUpdate, kstNow);
    newState.sanctuaryBasic = Math.min(SANCTUARY_MAX_BASIC, (data.sanctuaryBasic || 0) + (sanctuaryGates * 4));
  } else {
    // 계정 레벨 (슈고/침공)
    const dailyGates = countGateCrossed(kstLastUpdate, kstNow, 24, 5);
    newState.shugoBasic = Math.min(SHUGO_MAX_BASIC, (data.shugoBasic || 0) + (dailyGates * 2));
    newState.invasionBasic = Math.min(INVASION_MAX_BASIC, (data.invasionBasic || 0) + dailyGates);
  }

  // 3. Reset Logic (5 AM Daily / Wednesday Weekly)
  const latestReset = getLatestResetTime(kstNow);
  if (isAfter(latestReset, kstLastUpdate)) {
    if (!isCharacter) {
      newState.mission = 0; // 사명은 매일 초기화 (계정 레벨)
    }

    const wednesdayReset = getWednesdayReset(kstNow);
    if (isAfter(wednesdayReset, kstLastUpdate)) {
      if (isCharacter) {
        newState.awakening = 0;
        newState.sanctuaryCount = 0; // 성역 입장 횟수(사용량) 초기화
        newState.expeditionKillsBasic = EXPEDITION_KILLS_CHAR_LIMIT;
        newState.transcendenceKillsBasic = TRANSCENDENCE_KILLS_CHAR_LIMIT;
        newState.sanctuaryKillsBasic = SANCTUARY_KILLS_CHAR_LIMIT;
        // Note: expeditionKillsExtra 등 '추가' 수치는 초기화하지 않음
      } else {
        newState.dailyDungeon = 0; // 일일던전은 매주 수요일 초기화 (계정 레벨)
        newState.expeditionCount = 0;
        newState.transcendenceCount = 0;
        newState.sanctuaryCount = 0;
      }
    }
  }

  // 회랑 리셋 (수/토 22:00)은 05시 리셋과 별개로 검사해야 합니다.
  if (isCharacter) {
    const corridorResets = [getWednesday22Reset(kstNow), getSaturday22Reset(kstNow)];
    for (const r of corridorResets) {
      if (isAfter(r, kstLastUpdate) && isAfter(kstNow, r)) newState.corridor = 0;
    }
  }

  return newState;
};

const getWednesdayReset = (date: Date) => {
  const d = new Date(date.getTime());
  const day = d.getUTCDay(); // 0(Sun) - 6(Sat)
  const diff = (day < 3) ? (day + 4) : (day - 3);
  d.setUTCDate(d.getUTCDate() - diff);
  d.setUTCHours(5, 0, 0, 0);
  return d;
};

const getWednesday22Reset = (date: Date) => {
  const d = getWednesdayReset(date);
  d.setUTCHours(22, 0, 0, 0);
  return d;
};

const getSaturday22Reset = (date: Date) => {
  const d = new Date(date.getTime());
  const day = d.getUTCDay();
  const diff = (day < 6) ? (day + 1) : (day - 6);
  d.setUTCDate(d.getUTCDate() - diff);
  d.setUTCHours(22, 0, 0, 0);
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
  if (nextGate.getTime() <= start.getTime()) {
    nextGate = new Date(nextGate.getTime() + 7 * 24 * 3600000);
  }

  let safety = 0;
  while (nextGate.getTime() <= end.getTime() && safety < 100) {
    count++;
    nextGate = new Date(nextGate.getTime() + 7 * 24 * 3600000);
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
  
  const d = new Date(now.getTime());
  d.setUTCMinutes(0, 0, 0);
  
  const currentHour = d.getUTCHours();
  const hoursSinceLastGate = (currentHour - offset + 24) % interval;
  const hoursToNext = interval - hoursSinceLastGate;
  
  const nextGateTime = d.getTime() + hoursToNext * 3600000;
  const diffMs = nextGateTime - now.getTime();
  const totalSeconds = Math.max(0, Math.floor(diffMs / 1000));
  
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};
