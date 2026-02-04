const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {
    const nickname = "나스닥";
    const serverId = "1006"; // Ariel
    const logFile = 'debug_log_nasdack.txt';

    fs.writeFileSync(logFile, `[DEBUG START] ${new Date().toISOString()}\n\n`);

    function log(message) {
        console.log(message);
        fs.appendFileSync(logFile, message + '\n');
    }

    log(`🔍 [Diagnosing] '${nickname}' on Server ${serverId}...`);

    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    try {
        log("1. Go to aion2tool.com");
        await page.goto('https://aion2tool.com', { waitUntil: 'networkidle2' });

        // Elyos Selection
        try {
            await page.waitForSelector('#race-elyos', { timeout: 3000 });
            await page.click('#race-elyos');
            log("✅ Selected Elyos");

            await page.waitForSelector('#server-select', { timeout: 3000 });
            await page.select('#server-select', serverId);
            log(`✅ Selected Server ${serverId}`);
        } catch (e) {
            log("⚠️ Selection failed (using defaults)");
        }

        // Search
        const inputSelector = 'input[placeholder="캐릭터 닉네임 입력"]';
        await page.waitForSelector(inputSelector);
        await page.type(inputSelector, nickname);
        await new Promise(r => setTimeout(r, 500));
        await page.keyboard.press('Enter');
        log("✅ Search executed");

        log("⏳ Waiting for results...");
        await new Promise(r => setTimeout(r, 5000));

        // Wait for potential elements
        try {
            await page.waitForFunction(
                () => document.querySelector('#result-combat-power') || document.body.innerText.includes("검색어에 해당하는"),
                { timeout: 10000 }
            );
        } catch (e) {
            log("⚠️ Wait timeout");
        }

        const data = await page.evaluate(() => {
            const powerEl = document.getElementById('result-combat-power');
            const scoreEl = document.getElementById('dps-score-value');
            const bodyText = document.body.innerText;
            const fullHTML = document.body.innerHTML;

            return {
                powerText: powerEl ? powerEl.innerText : "NULL",
                scoreText: scoreEl ? scoreEl.innerText : "NULL",
                bodyText: bodyText,
                html: fullHTML
            };
        });

        log(`\n--- RESULTS ---`);
        log(`Power Element Text: ${data.powerText}`);
        log(`Score Element Text: ${data.scoreText}`);

        // Dump Score-like text from body
        const scoreMatch = data.bodyText.match(/(Score|점수|RP|어비스 포인트)\s*[:]?\s*([\d,]+)/gi);
        log(`Regex Matches for Score: ${JSON.stringify(scoreMatch)}`);

        fs.writeFileSync('debug_nasdack.html', data.html);
        await page.screenshot({ path: 'debug_nasdack.png', fullPage: true });

    } catch (e) {
        log(`❌ Error: ${e.message}`);
    } finally {
        await browser.close();
        log("\n[Done]");
    }
})();
