const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');
const admin = require('firebase-admin');
const cron = require('node-cron');
const serviceAccount = require('./system_core.json');

// Firebase Admin Init
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://aion2-guild-default-rtdb.asia-southeast1.firebasedatabase.app"
});
const db = admin.database();

const app = express();
app.use(express.json());
app.use(cors());

const PORT = 4000;

const SERVER_LIST = [
    { id: 'all', name: '전체 서버', faction: '전체' },
    { id: '1001', name: '시엘', faction: '천족' },
    { id: '1002', name: '네자칸', faction: '천족' },
    { id: '1003', name: '바이젤', faction: '천족' },
    { id: '1004', name: '카이시넬', faction: '천족' },
    { id: '1005', name: '유스티엘', faction: '천족' },
    { id: '1006', name: '아리엘', faction: '천족' },
    { id: '1007', name: '프레기온', faction: '천족' },
    { id: '1008', name: '메스람타에다', faction: '천족' },
    { id: '1009', name: '히타니에', faction: '천족' },
    { id: '1010', name: '나니아', faction: '천족' },
    { id: '1011', name: '타하바타', faction: '천족' },
    { id: '1012', name: '루터스', faction: '천족' },
    { id: '1013', name: '페르노스', faction: '천족' },
    { id: '1014', name: '다미누', faction: '천족' },
    { id: '1015', name: '카사카', faction: '천족' },
    { id: '1016', name: '바카르마', faction: '천족' },
    { id: '1017', name: '챈가룽', faction: '천족' },
    { id: '1018', name: '코치룽', faction: '천족' },
    { id: '1019', name: '이슈타르', faction: '천족' },
    { id: '1020', name: '티아마트', faction: '천족' },
    { id: '1021', name: '포에타', faction: '천족' },
    { id: '2001', name: '이스라펠', faction: '마족' },
    { id: '2002', name: '지켈', faction: '마족' },
    { id: '2003', name: '트리니엘', faction: '마족' },
    { id: '2004', name: '루미엘', faction: '마족' },
    { id: '2005', name: '마르쿠탄', faction: '마족' },
    { id: '2006', name: '아스펠', faction: '마족' },
    { id: '2007', name: '에레슈키갈', faction: '마족' },
    { id: '2008', name: '브리트라', faction: '마족' },
    { id: '2009', name: '네먼', faction: '마족' },
    { id: '2010', name: '하달', faction: '마족' },
    { id: '2011', name: '루드라', faction: '마족' },
    { id: '2012', name: '울고른', faction: '마족' },
    { id: '2013', name: '무닌', faction: '마족' },
    { id: '2014', name: '오다르', faction: '마족' },
    { id: '2015', name: '젠카카', faction: '마족' },
    { id: '2016', name: '크로메데', faction: '마족' },
    { id: '2017', name: '콰이링', faction: '마족' },
    { id: '2018', name: '바바룽', faction: '마족' },
    { id: '2019', name: '파프니르', faction: '마족' },
    { id: '2020', name: '인드라투', faction: '마족' },
    { id: '2021', name: '이스할겐', faction: '마족' },
];

// [최적화] 전역 브라우저 변수 (하나로 돌려쓰기)
let globalBrowser = null;

async function getBrowser() {
    // 브라우저가 없거나 죽었으면 새로 실행
    if (!globalBrowser || !globalBrowser.isConnected()) {
        console.log('🚀 Chrome 인스턴스 시작 (무한 재사용 모드)...');
        globalBrowser = await puppeteer.launch({
            headless: "new",
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--window-size=1920,1080',
                '--disable-gpu',
                '--disable-dev-shm-usage'
            ]
        });
    }
    return globalBrowser;
}

// 공통 스크래핑 로직 함수
async function scrapeCharacter(nickname, serverId = 1006) {
    if (!nickname || nickname === 'undefined') {
        console.error(`[에러] 유효하지 않은 닉네임 요청입니다.`);
        return { success: false, error: "INVALID_NICKNAME" };
    }
    console.log(`[검색] ${nickname} (서버: ${serverId}) 시작...`);

    let page = null;
    let attempts = 0;
    const MAX_ATTEMPTS = 2;

    while (attempts < MAX_ATTEMPTS) {
        attempts++;
        if (attempts > 1) console.log(`🔄 [재시도] ${nickname} (시도 ${attempts}/${MAX_ATTEMPTS})`);

        try {
            const browser = await getBrowser();
            page = await browser.newPage();
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
            await page.setViewport({ width: 1920, height: 1080 });

            // 리소스 차단 (CSS는 렌더링에 필요할 수 있으므로 제외)
            await page.setRequestInterception(true);
            page.on('request', (req) => {
                if (['image', 'media', 'font'].includes(req.resourceType())) {
                    req.abort();
                } else {
                    req.continue();
                }
            });

            // 직접 URL로 이동 (더 빠르고 정확함)
            const targetUrl = `https://aion2tool.com/char/serverid=${serverId}/${encodeURIComponent(nickname)}`;
            console.log(`[이동] ${targetUrl}`);
            
            await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 30000 });

            // 데이터 로드 확인
            try {
                await page.waitForFunction(
                    () => {
                        const notFound = document.body.innerText.includes("검색어에 해당하는");
                        const errorMsg = document.body.innerText.includes("Internal Server Error");
                        if (notFound || errorMsg) return true;
                        
                        const powerEl = document.querySelector('#result-combat-power');
                        const scoreEl = document.querySelector('#dps-score-value');
                        return (powerEl && /\d/.test(powerEl.innerText)) && (scoreEl && /\d/.test(scoreEl.innerText));
                    },
                    { timeout: 20000 }
                );
            } catch (e) {
                console.log("⚠️ 데이터 로드 지연 (대기 중...)");
            }

            // 데이터 추출
            const data = await page.evaluate(() => {
                const bodyText = document.body.innerText;
                const powerEl = document.getElementById('result-combat-power');
                const jobEl = document.getElementById('result-job');

                return {
                    raw: bodyText,
                    lines: bodyText.split('\n').map(l => l.trim()).filter(l => l.length > 0),
                    idPower: powerEl ? powerEl.innerText : null,
                    idJob: jobEl ? jobEl.innerText : null
                };
            });

            if (data.raw.includes("검색어에 해당하는 캐릭터가 없습니다")) {
                if (page) await page.close();
                return { success: false, error: "CHARACTER_NOT_FOUND" };
            }

            const jobs = ["수호성", "검성", "살성", "궁성", "마도성", "정령성", "치유성", "호법성"];
            let job = "미정";

            // 1순위: 전용 ID 엘리먼트 텍스트
            if (data.idJob && jobs.includes(data.idJob.trim())) {
                job = data.idJob.trim();
            }
            // 2순위: 이미지 alt (이미지 ID: result-job-image)
            else {
                job = jobs.find(j => data.raw.includes(j)) || "미정";
            }

            const powerRaw = (data.idPower || '').trim();
            console.log(`[분석] Power Raw: ${powerRaw}`);

            let itemLevel = 0;
            let power = 0;

            // 새 형식: "3,977 (430,272)" 또는 "3,977 / 430,272" 또는 기존 형식 "430,272" 대응
            const combinedMatch = powerRaw.match(/([\d,]+)\s*[/(]\s*([\d,]+)/);
            if (combinedMatch) {
                itemLevel = parseInt(combinedMatch[1].replace(/,/g, ''));
                power = parseInt(combinedMatch[2].replace(/,/g, ''));
            } else {
                power = parseInt(powerRaw.replace(/[^0-9]/g, '')) || 0;
            }

            // 만약 ID 엘리먼트로 실패했다면 전체 텍스트에서 재검토
            if (power === 0) {
                const powerMatch = data.raw.match(/전투력\s*([\d,]+)/);
                if (powerMatch) power = parseInt(powerMatch[1].replace(/,/g, ''));
            }

            let guild = "-";
            const legionLine = data.lines.find(l => l.includes('레기온') && !l.includes('전체') && !l.includes('랭킹'));
            if (legionLine) {
                const match = legionLine.match(/([^\s]+)\s*레기온/);
                if (match && match[1] !== '프') guild = match[1];
                else {
                    const match2 = legionLine.match(/레기온\s*[:]?\s*([^\s]+)/);
                    if (match2) guild = match2[1];
                }
            }
            if (guild === "-" || guild === "프") {
                if (data.lines.some(l => l === "츄" || l === "츄 레기온")) guild = "츄";
            }
            if (guild === "랭킹") guild = "-";


            // 재시도 조건 (필수 데이터 부재 시)
            if (power === 0) {
                console.log(`⚠️ 데이터 추출 실패 (Power: ${power}). 재시도...`);
                if (page) await page.close();
                continue;
            }

            console.log(`[성공] ${nickname} -> Power: ${power}, ItemLevel: ${itemLevel}`);
            if (page) await page.close();
            return {
                success: true,
                data: { name: nickname, class: job, power, itemLevel, guild }
            };

        } catch (e) {
            console.error(`[실패] ${nickname}: ${e.message}`);
            if (page) await page.close();
            if (attempts === MAX_ATTEMPTS) return { success: false, error: e.message };
        }
    }
}

// API Endpoint
app.post('/scrape', async (req, res) => {
    const { nickname, serverId = 1006 } = req.body;
    const result = await scrapeCharacter(nickname, serverId);
    res.json(result);
});

// Cron Job: 매 시간 50분에 기상 -> 인원수 계산 후 대기 -> 59분 도착 목표 [Dynamic Scheduling]
// --- 스케줄러 유틸리티 ---
async function runBatchScrape(taskName, paths, timestampPath) {
    const now = new Date();
    console.log(`========================================`);
    console.log(`⏰ [${taskName}] 스케줄러 기상 (${now.toLocaleString()})`);

    try {
        // 1. 모든 대상 데이터 수집
        const snapshots = await Promise.all(paths.map(p => db.ref(p).once('value')));
        const datasets = snapshots.map(s => s.val() || {});
        
        // 2. 고유 닉네임 목록 생성 (중복 제거로 아툴 요청 최소화)
        const nameMap = new Map(); // name -> {server, indices: [{path, index}]}
        
        paths.forEach((path, pathIdx) => {
            const data = datasets[pathIdx];
            const list = Array.isArray(data) ? data : Object.values(data);
            list.forEach((m, idx) => {
                if (m && m.name) {
                    if (!nameMap.has(m.name)) {
                        nameMap.set(m.name, { 
                            name: m.name, 
                            server: m.server || '아리엘',
                            serverId: (SERVER_LIST.find(s => s.name === (m.server || '아리엘'))?.id || '1006'),
                            targets: [] 
                        });
                    }
                    nameMap.get(m.name).targets.push({ path, index: Array.isArray(data) ? idx : Object.keys(data)[idx] });
                }
            });
        });

        const uniqueNames = Array.from(nameMap.values());
        if (uniqueNames.length === 0) {
            console.log(`[${taskName}] 대상 데이터가 없습니다.`);
            return;
        }

        console.log(`📊 대상: ${uniqueNames.length}명 (중복 제거됨) | 원본 합계: ${paths.reduce((acc, _, i) => acc + Object.keys(datasets[i]).length, 0)}명`);

        // 3. 순차 처리 (Safe Mode - 저사양 배려)
        const CONCURRENT_LIMIT = 2; // 동시 창 2개로 제한 루프
        const DELAY_MS = 5000;      // 요청 간 5초 여유
        let successCount = 0;

        for (let i = 0; i < uniqueNames.length; i += CONCURRENT_LIMIT) {
            const chunk = uniqueNames.slice(i, i + CONCURRENT_LIMIT);
            const promises = chunk.map(async (item) => {
                console.log(`[Auto] ${item.name} (${item.server}) 갱신 중...`);
                try {
                    const res = await scrapeCharacter(item.name, item.serverId);
                    if (res.success && res.data) {
                        // 모든 관련 경로에 업데이트
                        const updatePromises = item.targets.map(t => 
                            db.ref(`${t.path}/${t.index}`).update({
                                power: res.data.power,
                                itemLevel: res.data.itemLevel || 0,
                                class: res.data.class,
                                guild: res.data.guild,
                                isActive: (res.data.guild === '츄'),
                                lastUpdated: new Date().toISOString()
                            })
                        );
                        await Promise.all(updatePromises);
                        return true;
                    }
                } catch (e) {
                    console.error(`❌ [Auto] ${item.name} 실패: ${e.message}`);
                }
                return false;
            });

            const results = await Promise.all(promises);
            successCount += results.filter(r => r).length;

            if (i + CONCURRENT_LIMIT < uniqueNames.length) {
                await new Promise(r => setTimeout(r, DELAY_MS));
            }
        }

        // 4. 타임스탬프 업데이트
        if (Array.isArray(timestampPath)) {
            await Promise.all(timestampPath.map(tp => db.ref(tp).set(new Date().toISOString())));
        } else {
            await db.ref(timestampPath).set(new Date().toISOString());
        }

        console.log(`✅ [${taskName}] 갱신 완료! (성공: ${successCount}/${uniqueNames.length})`);

    } catch (e) {
        console.error(`❌ [${taskName}] 에러 발생:`, e);
    }
}

// [스케줄 1] 메인 캐릭터 통합 (매 시간 50분)
// 레기온 멤버 + 고정 파티 멤버 함께 처리 (중복 제거)
cron.schedule('50 * * * *', () => {
    runBatchScrape(
        'Main-Integrate', 
        ['members', 'fixed_members'], 
        ['metadata/lastFullRefresh', 'metadata/fixed_members_lastRefresh']
    );
});

// [스케줄 2] 고정 파티 부캐릭터 (매 시간 10분)
// 부하 분산을 위해 본체 갱신이 없는 시간대에 실행
cron.schedule('10 * * * *', () => {
    runBatchScrape(
        'Sub-Routine', 
        ['fixed_sub_characters'], 
        'metadata/fixed_subChars_lastRefresh'
    );
});

app.listen(PORT, () => {
    console.log(`🤖 Server & Automation running on port ${PORT}`);
});
