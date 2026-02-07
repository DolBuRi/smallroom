
const fs = require('fs');
const path = 'c:/Users/admin/Documents/KHW_AI/AION2_Guild_Raid/app/src/components/raid-party-maker.tsx';

try {
    const content = fs.readFileSync(path, 'utf8');
    const lines = content.split('\n');

    // 1. Identify start of corruption (Line 147, which is index 146)
    // Verify it starts with 'use client' or import
    const startIdx = 146;
    if (!lines[startIdx].includes("'use client'") && !lines[startIdx].includes("import")) {
        console.log("Line 147 doesn't look like 'use client' or import. Validation failed.");
        console.log("Line 147 content:", lines[startIdx]);
        // Fallback: search for 'use client' after line 140
        // ...
    }

    // 2. Identify end of corruption
    // We look for the SECOND occurrence of "// Tooltip State"
    // The first one is inside the corrupted block (around line 300?)
    // The second one is where the original file resumes.

    let tooltipStateCount = 0;
    let endIdx = -1;

    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes("// Tooltip State")) {
            tooltipStateCount++;
            if (tooltipStateCount === 2) {
                endIdx = i;
                break;
            }
        }
    }

    if (endIdx === -1) {
        console.error("Could not find 2nd '// Tooltip State'. Aborting.");
        process.exit(1);
    }

    // 3. Construct Correct AlgoCards Block
    const correctAlgoCards = `    const [algoCards, setAlgoCards] = useState<AlgoCard[]>([
        { id: 'fixed_group', label: '고정 파티 우선', desc: '설정된 고정 파티 멤버를 1순위로 배정합니다.', active: true, status: 'ESSENTIAL' },
        { id: 'schedule_gating', label: '스케줄 게이팅', desc: '신청자가 선택한 시간에만 배정합니다.', active: true, status: 'ESSENTIAL' },
        { id: 'resurrection_anchor', label: '부활 앵커', desc: '파티당 1명의 치유성을 필수 배치합니다.', active: true, status: 'ESSENTIAL' },
        { id: 'main_tank', label: '메인 탱커', desc: '파티당 1명의 수호성/검성을 고정 배치합니다.', active: true, status: 'ESSENTIAL' },
        { id: 'scarcity_priority', label: '희소성 우선', desc: '인원이 부족한 역할/시간을 우선 배정합니다.', active: true, status: 'PRIORITY' },
        { id: 'safety_opt', label: '호법성 시너지 (Safety)', desc: '검성 탱커 지원 및 무탱 파티 생존력 보강', status: 'PRIORITY' },
        { id: 'combat_logic', label: '전투 로직', desc: '근거리/원거리 클래스 비율을 균형 있게 맞춥니다.', active: true, status: 'PRIORITY' },
        { id: 'power_balance', label: '파워 밸런스', desc: '전투력 고점과 저점을 교차하여 평준화합니다.', active: true, status: 'PRIORITY' },
        { id: 'attendance_volume', label: '참여 볼륨', desc: '남은 자리를 조건 없이 채워 참여 인원을 최대화합니다.', active: true, status: 'PRIORITY' },
    ]);`;

    // 4. Replace
    // Keep lines 0 to startIdx-1
    // Insert correctAlgoCards
    // Keep lines endIdx to end

    const newLines = [
        ...lines.slice(0, startIdx),
        correctAlgoCards,
        ...lines.slice(endIdx)
    ];

    fs.writeFileSync(path, newLines.join('\n'), 'utf8');
    console.log(`Successfully repaired file. Removed lines ${startIdx + 1} to ${endIdx}.`);

} catch (e) {
    console.error(e);
}
