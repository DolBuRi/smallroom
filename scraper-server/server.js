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
                '--disable-dev-shm-usage',
                '--no-first-run',
                '--no-zygote'
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
            await page.setViewport({ width: 1920, height: 1080 });

            // 리소스 차단
            await page.setRequestInterception(true);
            page.on('request', (req) => {
                if (['image', 'media', 'font', 'stylesheet'].includes(req.resourceType())) {
                    req.abort();
                } else {
                    req.continue();
                }
            });

            await page.goto('https://aion2tool.com', { waitUntil: 'domcontentloaded' });

            // 종족 선택
            try {
                const raceSelector = parseInt(serverId) >= 2000 ? '#race-asmodian' : '#race-elyos';
                await page.waitForSelector(raceSelector, { timeout: 3000 });
                await page.click(raceSelector);
                console.log(`[종족] ${parseInt(serverId) >= 2000 ? '마족' : '천족'} 선택 완료`);
            } catch (e) {
                console.log(`[주의] 종족 선택 실패 또는 이미 선택됨: ${e.message}`);
            }

            // 서버 선택
            try {
                await page.waitForSelector('#server-select', { timeout: 3000 });
                await page.select('#server-select', String(serverId));
                console.log(`[서버] ID: ${serverId} 선택 완료`);
            } catch (e) {
                console.log(`[주의] 서버 선택 실패: ${e.message}`);
            }

            // 검색어 입력
            const inputSelector = 'input[placeholder="캐릭터 닉네임 입력"]';
            await page.waitForSelector(inputSelector);
            await page.type(inputSelector, nickname);
            await new Promise(r => setTimeout(r, 300));
            await page.keyboard.press('Enter');

            // 로딩 대기
            try {
                await page.waitForFunction(
                    () => {
                        const notFound = document.body.innerText.includes("검색어에 해당하는");
                        if (notFound) return true;
                        const powerEl = document.querySelector('#result-combat-power');
                        const scoreEl = document.querySelector('#dps-score-value');
                        return (powerEl && /\d/.test(powerEl.innerText)) && (scoreEl && /\d/.test(scoreEl.innerText));
                    },
                    { timeout: 45000 }
                );
            } catch (e) {
                console.log("⚠️ 로딩 타임아웃 (부분 데이터 가능성)");
            }

            // 데이터 추출
            const data = await page.evaluate(() => {
                const bodyText = document.body.innerText;
                const powerEl = document.getElementById('result-combat-power');
                const scoreEl = document.getElementById('dps-score-value');
                const jobEl = document.getElementById('result-job');

                return {
                    raw: bodyText,
                    lines: bodyText.split('\n').map(l => l.trim()).filter(l => l.length > 0),
                    idPower: powerEl ? powerEl.innerText : null,
                    idScore: scoreEl ? scoreEl.innerText : null,
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

            let power = parseInt((data.idPower || '').replace(/[^0-9]/g, '')) || 0;
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

            let score = parseInt((data.idScore || '').replace(/[^0-9]/g, '')) || 0;
            if (score === 0) {
                const scoreMatch = data.raw.match(/(Score|점수|RP|어비스 포인트)\s*[:]?\s*([\d,]+)/i);
                if (scoreMatch) score = parseInt(scoreMatch[2].replace(/,/g, ''));
            }

            // 재시도 조건
            if (power > 0 && score === 0) {
                console.log(`⚠️ 불완전 데이터 (Power: ${power}, Score: ${score}). 재시도...`);
                if (page) await page.close();
                continue;
            }

            if (power === 0) throw new Error("INVALID_DATA (Power is 0)");

            console.log(`[성공] ${nickname} -> ${power} / ${score}`);
            if (page) await page.close();
            return {
                success: true,
                data: { name: nickname, class: job, power, guild, score }
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
cron.schedule('50 * * * *', async () => {
    const now = new Date();
    console.log(`========================================`);
    console.log(`⏰ [WakeUp] 스케줄러 기상 (${now.toLocaleString()})`);

    try {
        const snapshot = await db.ref('members').once('value');
        const members = snapshot.val();
        if (!members) {
            console.log("멤버 데이터가 없습니다.");
            return;
        }

        const memberList = Array.isArray(members) ? members : Object.values(members);

        // [Dynamic Wait Logic]
        // 목표: 59분 00초에 끝내기
        // 계산: (인원수 / 3) * 8초 (여유 있게 3초 컷 + 4초 딜레이 + 1초 마진)
        const BATCH_SIZE = 3;
        const SEC_PER_BATCH = 8;
        const totalBatches = Math.ceil(memberList.length / BATCH_SIZE);
        const estDurationMs = totalBatches * SEC_PER_BATCH * 1000;

        const targetEndTime = new Date(now);
        targetEndTime.setMinutes(59, 0, 0); // xx시 59분 00초 목표

        const optimalStartTime = new Date(targetEndTime.getTime() - estDurationMs);
        const waitTimeMs = optimalStartTime.getTime() - now.getTime();

        console.log(`📊 인원: ${memberList.length}명 | 예상 소요: ${estDurationMs / 1000}초`);
        console.log(`🎯 목표 종료: ${targetEndTime.toLocaleTimeString()} | 최적 시작: ${optimalStartTime.toLocaleTimeString()}`);

        if (waitTimeMs > 0) {
            console.log(`⏳ [Wait] ${waitTimeMs / 1000}초 대기 후 시작합니다...`);
            await new Promise(r => setTimeout(r, waitTimeMs));
        } else {
            console.log(`⚡ [Immediate] 시간이 촉박하여 즉시 시작합니다!`);
        }

        console.log(`🚀 [Start] 크롤링 시작 (${new Date().toLocaleTimeString()})`);

        let successCount = 0;

        // [Parallel Optimization] 3 concurrent requests
        const CONCURRENT_LIMIT = 3;
        const DELAY_MS = 4000; // 4 seconds delay (Safe mode)

        // Helper to process a chunk
        const processMember = async (member, index) => {
            if (!member || !member.name) return false;

            console.log(`[Auto] ${index + 1}/${memberList.length}: ${member.name} 갱신 중...`);

            try {
                const res = await scrapeCharacter(member.name);
                if (res.success && res.data) {
                    await db.ref(`members/${index}`).update({
                        power: res.data.power,
                        score: res.data.score,
                        class: res.data.class,
                        guild: res.data.guild,
                        isActive: (res.data.guild === '츄'),
                        lastUpdated: new Date().toISOString()
                    });
                    return true;
                }
            } catch (e) {
                console.error(`❌ [Auto] ${member.name} 실패: ${e.message}`);
            }
            return false;
        };

        // Chunk processing loop
        for (let i = 0; i < memberList.length; i += CONCURRENT_LIMIT) {
            const chunk = memberList.slice(i, i + CONCURRENT_LIMIT);
            const promises = chunk.map((member, chunkIdx) =>
                processMember(member, i + chunkIdx)
            );

            const results = await Promise.all(promises);
            successCount += results.filter(r => r).length;

            // Delay between chunks (not after the last one)
            if (i + CONCURRENT_LIMIT < memberList.length) {
                await new Promise(r => setTimeout(r, DELAY_MS));
            }
        }

        // [New] Update Last Full Refresh Timestamp
        await db.ref('metadata/lastFullRefresh').set(new Date().toISOString());

        // [New] Save Snapshot for the day
        const todayStr = new Date().toISOString().split('T')[0];
        const latestMembers = (await db.ref('members').once('value')).val();
        if (latestMembers) {
            // Store as object mapping for faster lookups in dashboard
            const memberList = Array.isArray(latestMembers) ? latestMembers : Object.values(latestMembers);
            const snapshotMap = memberList.reduce((acc, m) => {
                if (m && m.id) acc[m.id] = m;
                return acc;
            }, {});
            await db.ref(`snapshots/${todayStr}`).set(snapshotMap);
            console.log(`📸 [Snapshot] ${todayStr} 저장 완료`);
        }

        console.log(`✅ [Auto-Refresh] 갱신 완료! (성공: ${successCount}/${memberList.length})`);

    } catch (e) {
        console.error(`❌ [Auto-Refresh] 에러 발생:`, e);
    }
});

app.listen(PORT, () => {
    console.log(`🤖 Server & Automation running on port ${PORT}`);
});
