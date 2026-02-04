const puppeteer = require('puppeteer');

(async () => {
    const nickname = "기룡";
    console.log(`🔍 '${nickname}' 검색 시뮬레이션 (화면 표시 모드)...`);

    const browser = await puppeteer.launch({
        headless: false, // [요청] 화면 띄우기
        defaultViewport: null, // 브라우저 창 크기에 맞춤
        args: ['--start-maximized', '--no-sandbox', '--disable-setuid-sandbox'] // 최대화
    });

    const page = await browser.newPage();

    try {
        await page.goto('https://aion2tool.com', { waitUntil: 'networkidle2' });
        console.log("✅ 메인 페이지 접속 완료");

        // 1. 종족 선택 (천족)
        try {
            await page.waitForSelector('#race-elyos', { timeout: 5000 });
            await page.click('#race-elyos');
            console.log("✅ 종족 선택 완료: 천족");
        } catch (e) {
            console.error("⚠️ 종족 버튼 클릭 실패");
        }

        // 2. 서버 선택 (아리엘 - 1006)
        try {
            await page.select('#server-select', '1006');
            console.log("✅ 서버 선택 완료: 아리엘");
        } catch (e) {
            console.error("⚠️ 서버 선택 실패");
        }

        // 3. 닉네임 입력 & 엔터
        const inputSelector = 'input[placeholder="캐릭터 닉네임 입력"]';
        await page.type(inputSelector, nickname);
        await page.keyboard.press('Enter');
        console.log("✅ 검색어 입력 및 엔터! (결과를 기다립니다)");

        // [중요] 사용자가 눈으로 확인할 시간을 줌 + 데이터 로딩 대기
        await new Promise(r => setTimeout(r, 5000));

        // 4. 로딩 완료 여부 체크 (더 오래 대기)
        try {
            await page.waitForFunction(
                () => document.body.innerText.includes("종합 능력치") && !document.body.innerText.includes("로딩 중"),
                { timeout: 10000 }
            );
            console.log("✅ 데이터 로딩 감지됨!");
        } catch (e) {
            console.log("⚠️ 로딩 타임아웃 (여전히 로딩 중이거나 실패)");
        }

        const text = await page.evaluate(() => document.body.innerText);

        console.log("------------------------------------------------");

        // 점수 파싱 시도
        const scoreMatch = text.match(/(Score|점수|RP|어비스 포인트)\s*[:]?\s*([\d,]+)/i);
        console.log(`📊 추출 스코어: ${scoreMatch ? scoreMatch[2] : "못찾음(0)"}`);

        // 텍스트 일부 출력 (로딩중인지 확인)
        const lines = text.split('\n').filter(l => l.trim().length > 0);
        console.log("--- 화면 텍스트 상위 20줄 ---");
        lines.slice(0, 20).forEach(l => console.log(l));

        console.log("------------------------------------------------");

        // 사용자가 볼 수 있게 브라우저를 바로 끄지 않고 10초 더 대기
        console.log("👀 확인을 위해 10초간 대기합니다...");
        await new Promise(r => setTimeout(r, 10000));

    } catch (e) {
        console.error("❌ 에러:", e.message);
    } finally {
        await browser.close();
    }
})();
