# AGENTS.md — Aion2 OD Helper (숙제 관리 도우미)

> **이 문서는 AI 에이전트(Codex, Antigravity 등)가 이 프로젝트에서 작업할 때 반드시 먼저 읽어야 하는 최상위 컨텍스트입니다.**

---

## 1. 프로젝트 개요

MMORPG "아이온2"의 일일/주간 숙제(오드, 티켓, 처치 횟수 등)를 관리하는 유틸리티.
**두 가지 클라이언트**가 하나의 코드베이스를 공유합니다:

| 클라이언트 | 용도 | 접근 방식 |
|---|---|---|
| **웹 대시보드** | PC/모바일 브라우저에서 전체 현황 확인 · 데이터 편집 | Vercel 배포 (정적 export) |
| **PC HUD 툴** | 게임 위 오버레이 · 원클릭 실행 · OCR · 알리미 | Electron Portable (.exe) |

두 클라이언트 모두 **Firebase Realtime Database**를 통해 실시간 동기화됩니다.

---

## 2. 기술 스택

| 레이어 | 기술 | 버전 | 비고 |
|---|---|---|---|
| Framework | **Next.js** (App Router) | 16.2.4 | `output: 'export'` (정적 빌드), `trailingSlash: true` |
| Language | **TypeScript** | 5.x | strict mode |
| UI | **React** | 19.2.4 | |
| Styling | **Tailwind CSS** | 4.x | PostCSS 기반 (`@tailwindcss/postcss`) |
| State | `useState` / `useCallback` / `useMemo` | — | 전역 상태 관리 없음, 훅 기반 |
| Animation | **Framer Motion** | 12.x | `Reorder` 컴포넌트(드래그 순서) |
| Icons | **Lucide React** | 1.x | |
| Backend | **Firebase** Realtime DB + Anonymous Auth | 12.x | |
| Desktop | **Electron** | 33.x | `electron-builder` → portable .exe |
| OCR | **Tesseract.js** | 7.x | HUD에서 게임 화면 인식용 |
| Theming | **next-themes** | 0.4.x | 다크 모드 기본 |

---

## 3. 디렉토리 구조 & 파일 맵

```
aion2-od-helper/
├── electron/                    # Electron 메인 프로세스
│   ├── main.js                  # 메인 프로세스 (Firebase 구독, IPC, 핫키, 내장 HTTP 서버)
│   ├── preload.js               # contextBridge API (invoke, subscribe, onDataUpdate 등)
│   └── ocr-selection.html       # OCR 영역 선택 오버레이 창
│
├── src/
│   ├── app/                     # Next.js App Router 페이지
│   │   ├── layout.tsx           # 루트 레이아웃 (Inter 폰트, Providers)
│   │   ├── providers.tsx        # ThemeProvider + AuthProvider
│   │   ├── globals.css          # 전역 CSS (Tailwind @import)
│   │   ├── page.tsx             # / (랜딩, dashboard로 리다이렉트)
│   │   ├── dashboard/page.tsx   # 웹 대시보드 (727줄, 요약 카드 + 캐릭터 테이블)
│   │   ├── hud/page.tsx         # ★ HUD 메인 (3099줄, 가장 큰 파일)
│   │   ├── accounts/page.tsx    # 계정 관리 페이지
│   │   ├── characters/page.tsx  # 캐릭터 관리 페이지
│   │   ├── login/page.tsx       # 관리자 로그인
│   │   └── contact/page.tsx     # 문의 페이지
│   │
│   ├── hooks/
│   │   └── useAionData.ts       # ★ 핵심 데이터 훅 (Firebase CRUD, 상태 계산, 티켓 소모)
│   │
│   ├── lib/
│   │   ├── engine.ts            # ★ 게임 엔진 (오드 회복, 티켓 충전, 리셋 로직)
│   │   ├── firebase.ts          # Firebase 초기화 + 익명 인증
│   │   └── utils.ts             # cn() 유틸리티 (clsx + tailwind-merge)
│   │
│   ├── context/
│   │   └── AuthContext.tsx       # Firebase Auth 컨텍스트 (관리자 여부 판별)
│   │
│   └── components/
│       ├── common/
│       │   └── AccessGate.tsx    # 접근 제어 게이트
│       └── layout/
│           ├── ClientLayout.tsx
│           ├── RootClientWrapper.tsx  # HUD vs 웹 라우팅 분기
│           ├── Navbar.tsx
│           └── Footer.tsx
│
├── public/assets/mp3/           # 사운드 에셋 (count_*.mp3, web_test.mp3, custom_alarm.mp3만 잔존)
├── skills/aion2-mechanics/SKILL.md  # ★ 게임 메카닉 명세 (반드시 읽을 것)
│
├── package.json                 # 스크립트, 의존성, electron-builder 설정
├── next.config.ts               # output: 'export', trailingSlash, images: unoptimized
├── tsconfig.json                # paths: @/* → ./src/*
├── deploy-lock.json             # 배포 잠금 장치 (LOCKED/UNLOCKED)
├── DEPLOYMENT_GUIDELINE.md      # 배포 금지 / 승인 절차 규칙
└── AGENTS.md                    # 이 파일
```

---

## 4. 핵심 아키텍처

### 4.1 데이터 모델 (Firebase Realtime DB)

```
users/{syncKey}/od_helper/
├── accounts/{accountId}         # 계정 단위 데이터
│   ├── name, membership (boolean)
│   ├── shugoBasic, shugoExtra, invasionBasic, invasionExtra  # 티켓
│   ├── expeditionCount, transcendenceCount, sanctuaryCount    # 주간 실행 카운터
│   ├── mission, dailyDungeon     # 체크리스트
│   └── lastUpdate (ISO string)
│
└── members/{characterId}        # 캐릭터 단위 데이터
    ├── name, className, color, accountId, order
    ├── ode, odeExtra             # 오드 (행동력)
    ├── expeditionBasic/Extra, expeditionKillsBasic/Extra
    ├── transcendenceBasic/Extra, transcendenceKillsBasic/Extra
    ├── sanctuaryBasic/Extra, sanctuaryKillsBasic/Extra, sanctuaryCount
    ├── mission, corridor, awakening, nightmare, attendance, dailyDungeon
    └── lastUpdate (ISO string)
```

- **syncKey**: 8자리 영숫자 키. 여러 기기에서 같은 키를 사용하면 데이터 동기화.
- **lastUpdate**: 모든 시간 계산의 기준점. **항상 UTC ISO 문자열로 저장**.

### 4.2 시간 처리 규칙 (매우 중요!)

| 규칙 | 설명 |
|---|---|
| **DB 저장** | `new Date().toISOString()` — 항상 UTC |
| **엔진 계산** | `engine.ts`의 `calculateCurrentState` 내부에서 UTC → KST 변환 수행 |
| **HUD/웹 호출** | `new Date()` (표준 UTC)를 `now` 파라미터로 전달. `getKSTNow()` 직접 전달 금지! |
| **게이트 계산** | `countGateCrossed`는 UTC 메서드(`getUTCHours()` 등)를 사용하되, 입력은 KST 변환된 값 |

> ⚠️ 과거 버그: HUD에서 `getKSTNow()`를 직접 넘겨서 엔진이 이중 변환하여 9시간 차이가 발생했음. 절대 반복하지 말 것.

### 4.3 HUD ↔ Electron 통신

```
[Renderer (page.tsx)] ←→ [preload.js (contextBridge)] ←→ [main.js (IPC)]
                                                              ↕
                                                       [Firebase RTDB]
```

- **웹 환경**: `useAionData` 훅이 직접 Firebase SDK 사용
- **Electron 환경**: `window.api`가 존재하면 IPC를 통해 main.js가 Firebase 연결
  - `window.api.subscribe(path)` / `window.api.onDataUpdate(callback)`
  - `window.api.invoke('set-firebase-data', path, data)`
  - `window.api.invoke('load-config')` / `window.api.invoke('save-config', config)`
- **환경 감지**: `typeof window !== 'undefined' && (window as any).api`

### 4.4 빌드 & 배포

| 대상 | 명령어 | 산출물 |
|---|---|---|
| 웹 (Vercel) | `npm run build` → `npx vercel --prod` | 정적 HTML (out/) |
| HUD (Electron) | `npm run build` → `npx electron-builder --win portable` | `dist/Aion2_HUD 0.1.0.exe` |
| 개발 서버 | `npm run dev` (웹만) 또는 `npm run electron:dev` (웹+Electron) | localhost:3000 |

---

## 5. 게임 엔진 명세 (`lib/engine.ts`)

> **전체 명세는 `skills/aion2-mechanics/SKILL.md`에 있습니다. 반드시 읽으세요.**

핵심 요약:

| 자원 | 회복 방식 | 게이트 | 최대치 |
|---|---|---|---|
| 오드 (기본) | 3시간 게이트 | 02,05,08,11,14,17,20,23시 | 멤버십 840 / 일반 540 |
| 오드 (추가) | 자동 회복 없음 | — | 2000 |
| 원정 티켓 | 12시간마다 1장 | 05,17시 | 14 |
| 초월 티켓 | 24시간마다 2장 | 05시 | 7 |
| 성역 티켓 | 주간 4장 | 수요일 05시 | 4 |
| 슈고 티켓 | 24시간마다 2장 | 05시 (계정 단위) | 14 |
| 침공 티켓 | 24시간마다 1장 | 05시 (계정 단위) | 7 |

- **오드 소모**: 컨텐츠 실행 시 멤버십 80 / 일반 40 차감. 기본 오드 먼저, 부족하면 추가 오드에서 차감.
- **주간 리셋**: 수요일 05:00 KST
- **회랑 리셋**: 수요일, 토요일 22:00 KST

---

## 6. HUD (`src/app/hud/page.tsx`) 구조 가이드

이 파일은 ~3100줄로 프로젝트에서 가장 큰 파일입니다.

### 주요 섹션 (대략적 줄 번호)

| 줄 범위 | 내용 |
|---|---|
| 1-100 | 타입 정의 (`GameConfig`, `AlerterConfig`) |
| 100-280 | 상태 선언 (`useState` 다수), 초기값 |
| 280-370 | 오디오 재생 시스템 (`processAudioQueue`, `playAionSound`) |
| 370-460 | 알람 체크 엔진 `useEffect` — **현재 내부 로직 비움 (알람 기능 제거됨)** |
| 460-700 | Firebase 구독, 설정 저장/불러오기, OCR 로직 |
| 700-1200 | 핵심 핸들러 (handleChargeOde, handleExecuteContent 등) |
| 1200-2000 | HUD 뷰 렌더링 (메인 / 압축 / 상세) |
| 2000-2500 | 컨텐츠 실행 캐러셀 (스와이프 가능) |
| 2500-3000 | 설정 사이드 패널 |
| 3000-3100 | 유틸리티 함수, 토스트 |

### 뷰 모드

- **HUD 모드**: 작은 오버레이 (게임 위)
- **압축 모드**: 최소한의 정보만 표시
- **상세 모드**: 캐릭터별 상세 정보 + 실행 버튼
- **설정 모드**: 사이드 패널 (계정/캐릭터 관리, 알림 설정, OCR 등)

---

## 7. 코딩 컨벤션 & 규칙

### 7.1 절대 규칙
1. **배포 금지**: `deploy-lock.json`이 `LOCKED`면 배포 명령어 실행 불가. `DEPLOYMENT_GUIDELINE.md` 참조.
2. **게임 로직 추측 금지**: 새로운 수치나 규칙은 `skills/aion2-mechanics/SKILL.md`에 없으면 사용자에게 확인.
3. **시간 처리**: DB에는 UTC, 엔진에서만 KST 변환. `getKSTNow()`를 `calculateCurrentState`의 `now`에 직접 넘기지 말 것.

### 7.2 스타일 & 패턴
- **CSS**: Tailwind v4 유틸리티 클래스 사용. `cn()` 유틸 사용 권장.
- **컴포넌트**: 함수형 컴포넌트만 사용. 클래스형 없음.
- **상태 관리**: React Hook 기반. Redux/Zustand 등 외부 상태 관리 없음.
- **타입**: 인터페이스 선언은 사용하는 파일 상단에 직접 정의 (별도 types 파일 없음).
- **한국어 UI**: 모든 사용자 대면 텍스트는 한국어.
- **코드 주석**: 한국어로 작성.

### 7.3 Electron 관련
- `main.js`는 순수 JS (TypeScript 아님).
- Electron에서 Firebase를 직접 사용 (main 프로세스에서 `firebase/database` import).
- 패키지 빌드 시 `out/` 폴더의 정적 파일을 내장 HTTP 서버로 서빙.

---

## 8. 최근 변경 이력 (커밋되지 않은 작업 포함)

### 현재 Working Tree 상태 (`git status`)
- **Modified**: `engine.ts`, `useAionData.ts`, `hud/page.tsx`, `dashboard/page.tsx`, `accounts/page.tsx`, `SKILL.md`
- **Deleted**: `shugo_*.mp3`, `invasion_*.mp3`, `rift_*.mp3`, `nahma_*.mp3`, `artifact_*.mp3` (약 1200개 파일)

### 최근 주요 변경 내역

1. **오드 시간대 동기화 버그 수정**
   - 원인: HUD는 UTC, 대시보드는 KST를 혼용하여 9시간 차이 발생
   - 수정: `calculateCurrentState`에서 UTC 입력 → 내부 KST 변환으로 통일
   - `useAionData.ts`에서 `getKSTNow()` 대신 `new Date()` 사용

2. **handleChargeOde 데이터 증발 버그 수정**
   - 원인: 수동 충전 시 자연 회복된 오드가 초기화됨
   - 수정: `ode: calculatedEnergy`를 명시적으로 저장하여 회복량 보존

3. **알람 시스템 전면 제거** (직전 세션)
   - 슈고, 차원 침공, 시공의 균열, 나흐마 알람 로직 완전 삭제
   - 관련 MP3 에셋 모두 삭제
   - 설정 UI에서 알람 토글 제거
   - `AlerterConfig`에서 `riftEnabled`, `nahmaEnabled`, `invasionEnabled`, `nahmaCountdown` 필드 제거

4. **컨텐츠 실행 캐러셀 UX 개선**
   - 좌우 화살표 버튼 → 하단 인디케이터 + 스와이프로 변경
   - 의도하지 않은 클릭 방지

5. **티켓 유효성 체크 기능 추가**
   - 컨텐츠 실행 시 티켓 부족하면 버튼 비활성화 + 토스트 메시지

---

## 9. 알려진 이슈 & 주의사항

| 이슈 | 상태 | 설명 |
|---|---|---|
| `.gitignore` 인코딩 | 🟡 경미 | 44-45줄에 널문자가 포함된 깨진 항목 존재. 기능에 영향 없음. |
| `Scan` 아이콘 import | 🟡 확인 필요 | 차원 침공 토글 제거로 `Scan` import가 미사용 상태일 수 있음 |
| Electron 빌드 rcedit 경고 | 🟡 간헐적 | EXE가 실행 중이면 빌드 실패. `taskkill /f /im Aion2_HUD.exe` 후 재시도 |
| 알람 useEffect 빈 타이머 | 🟡 정리 대상 | 알람 로직 제거 후 빈 `setInterval`이 매초 실행 중. 완전 제거 또는 목적 재정의 필요 |

---

## 10. 테스트 방법

```bash
# 웹 빌드 검증
npm run build            # TypeScript 타입 체크 + 정적 빌드

# 개발 서버
npm run dev              # http://localhost:3000

# Electron 개발 모드
npm run electron:dev     # Next.js 서버 + Electron 동시 실행

# Electron 포터블 빌드
npm run build && npx electron-builder --win portable
# 산출물: dist/Aion2_HUD 0.1.0.exe
```

---

## 11. Codex 에이전트를 위한 작업 가이드

### 시작 전 체크리스트
1. ✅ 이 `AGENTS.md`를 읽었는가
2. ✅ `skills/aion2-mechanics/SKILL.md`를 읽었는가
3. ✅ `DEPLOYMENT_GUIDELINE.md`를 읽었는가
4. ✅ 수정할 파일의 현재 상태를 확인했는가

### 작업 시 주의
- `hud/page.tsx`는 3100줄짜리 모놀리스입니다. 수정 전 줄 번호를 정확히 확인하세요.
- `useAionData.ts`와 `engine.ts`는 웹과 HUD가 공유합니다. 한쪽만 수정하면 다른 쪽이 깨집니다.
- Firebase 경로에 `.`, `#`, `$`, `[`, `]` 문자가 들어가면 런타임 에러 발생.

### 병렬 작업 분담 가이드 (Antigravity ↔ Codex)
- **Antigravity**: HUD 비주얼, Electron 빌드, 브라우저 테스트, 복잡한 디버깅
- **Codex**: 엔진 로직, useAionData 훅, 대시보드 UI, 새 페이지/컴포넌트, 리팩토링
- **충돌 방지**: 같은 파일을 동시에 수정하지 마세요. 특히 `hud/page.tsx`.
