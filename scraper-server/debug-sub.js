const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {
    const nickname = "부트띠";
    const serverId = "1006";
    const logFile = 'debug_log.txt';

    // 로그 파일 초기화
    fs.writeFileSync(logFile, `[DEBUG START] ${new Date().toISOString()}\n\n`);

    function log(message) {
        console.log(message);
        fs.appendFileSync(logFile, message + '\n');
    }

    log(`🔍 [서브컴 종합 진단] '${nickname}' 정밀 분석 시작...`);

    const browser = await puppeteer.launch({
        headless: "new", // 다시 안 보이는 모드 (해상도 고정 트릭 사용)
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    try {
        log("1. 아툴 접속 중...");
        await page.goto('https://aion2tool.com', { waitUntil: 'networkidle2' });

        // 종족/서버 선택
        try {
            await page.waitForSelector('#race-elyos', { timeout: 3000 });
            await page.click('#race-elyos');
            log("✅ 천족 선택");

            await page.waitForSelector('#server-select', { timeout: 3000 });
            await page.select('#server-select', serverId);
            log("✅ 아리엘 서버 선택");
        } catch (e) {
            log("⚠️ 초기 설정 실패 (기본값 진행)");
        }

        // 검색
        const inputSelector = 'input[placeholder="캐릭터 닉네임 입력"]';
        await page.waitForSelector(inputSelector);
        await page.type(inputSelector, nickname);
        await new Promise(r => setTimeout(r, 500));
        await page.keyboard.press('Enter');
        log("✅ 검색어 입력 및 엔터");

        log("⏳ 결과 페이지 대기 중... (최대 15초)");
        await new Promise(r => setTimeout(r, 5000)); // 5초 기본 대기

        try {
            await page.waitForFunction(
                () => document.body.innerText.includes("전투력") ||
                    document.body.innerText.includes("종합 능력치") ||
                    document.body.innerText.includes("검색어에 해당하는"),
                { timeout: 10000 }
            );
            log("✅ 특정 키워드 감지됨");
        } catch (e) {
            log("⚠️ 로딩 타임아웃 (그래도 분석 진행)");
        }

        // --- 데이터 수집 ---
        const info = await page.evaluate(() => {
            const bodyText = document.body.innerText;
            const fullHTML = document.body.innerHTML;

            // "전투력" 혹은 "Power" 혹은 숫자가 포함된 모든 짧은 요소 찾기
            const potentialNodes = [];
            const allElements = document.body.getElementsByTagName("*");

            for (let el of allElements) {
                // 자식이 없고 텍스트만 있는 요소 (Leaf node 비슷하게)
                if (el.children.length === 0 && el.innerText && el.innerText.trim().length > 0) {
                    const txt = el.innerText.trim();
                    // "전투력"이나 "숫자 4자리 이상"이 포함되면 수집
                    if (txt.includes("전투력") || /[\d,]{4,}/.test(txt)) {
                        potentialNodes.push({
                            tag: el.tagName,
                            text: txt,
                            className: el.className,
                            id: el.id
                        });
                    }
                }
            }

            return { text: bodyText, html: fullHTML, nodes: potentialNodes };
        });

        log("\n--- [텍스트 덤프 (상위 200줄)] ---");
        info.text.split('\n').filter(l => l.trim()).slice(0, 200).forEach(l => log(l.trim()));

        log("\n--- [주요 요소 분석 (전투력/숫자 관련)] ---");
        info.nodes.forEach((n, i) => {
            log(`[${i}] <${n.tag} class="${n.className}" id="${n.id}"> ${n.text}`);
        });

        // 파일 저장
        fs.writeFileSync('debug_full_html.html', info.html);
        log("\n✅ HTML 전체 저장 완료: debug_full_html.html");

        await page.screenshot({ path: 'debug_screenshot_final.png', fullPage: true });
        log("✅ 스크린샷 저장 완료: debug_screenshot_final.png");

    } catch (e) {
        log(`❌ 에러 발생: ${e.message}`);
    } finally {
        await browser.close();
        log("\n[진단 종료]");
    }
})();
