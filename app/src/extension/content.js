(async function () {
    const waitForBody = () => new Promise(resolve => {
        if (document.body) return resolve();
        window.addEventListener('DOMContentLoaded', resolve);
    });
    await waitForBody();

    if (window.location.href.includes('localhost') || window.location.href.includes('127.0.0.1') || window.location.href.includes('aion2-gm.vercel.app')) {
        window.addEventListener("message", (event) => {
            if (event.source !== window || !event.data.type || event.data.type !== 'AONI_SEARCH_REQUEST') return;
            chrome.runtime.sendMessage(event.data, (response) => {
                window.postMessage({
                    type: 'AONI_SEARCH_RESPONSE',
                    success: response?.success || false,
                    data: response?.data,
                    error: response?.error
                }, "*");
            });
        });
        return;
    }

    const params = new URLSearchParams(window.location.search);
    const isAuto = params.get('auto_scrape') === 'true';
    if (!isAuto) return;

    const overlay = document.createElement('div');
    overlay.style = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); color:white; z-index:2147483647; padding:20px; font-family:monospace; font-size:14px; overflow:auto;";
    overlay.innerHTML = `<h2 style="color:#4ade80;">🤖 AION2 정밀 분석기 V8 (3자리수 대응)</h2><div id="step-log" style="color:#cbd5e1; font-size:16px;">초기화...</div>`;
    document.body.appendChild(overlay);

    const log = (msg) => document.getElementById('step-log').innerText = msg;
    const report = (data) => chrome.runtime.sendMessage({ type: 'SCRAPE_RESULT', ...data });

    let currentState = 'search';

    setInterval(() => {
        const bodyText = document.body.innerText;
        if (currentState !== 'detail' && (bodyText.includes('종합 점수') || (bodyText.includes('전투') && bodyText.includes('생존')))) {
            currentState = 'detail';
            log("📊 상세 화면 감지됨! 분석 시작...");
            startDetailParsing();
        }
    }, 100);

    // --- [로직 1] 목록 페이지 ---
    if (window.location.href.includes('/character/search')) {
        const keyword = params.get('q');
        log(`목록에서 '${keyword}' 찾는 중...`);

        let attempts = 0;
        const finder = setInterval(() => {
            if (currentState === 'detail') {
                clearInterval(finder);
                return;
            }

            const bodyText = document.body.innerText;
            if (bodyText.includes('검색 결과가 없습니다') || bodyText.includes('검색된 캐릭터가 없습니다')) {
                clearInterval(finder);
                log("❌ 검색 결과 없음.");
                report({ success: false, error: "Not Found" });
                return;
            }

            const elements = Array.from(document.querySelectorAll('a, div, span'));
            const target = elements.find(el => el.innerText?.trim() === keyword);

            if (target) {
                const clickable = target.closest('a') || target.closest('div[onclick]') || target;
                if (clickable) {
                    log("✅ 타겟 클릭!");
                    clickable.click();
                }
            }

            // 100ms * 200 = 20초 (기존 유지)
            if (attempts++ > 200 && currentState !== 'detail') {
                clearInterval(finder);
                log("❌ 시간 초과");
                report({ success: false, error: "Timeout" });
            }
        }, 100);
    }

    // --- [로직 2] 상세 페이지 ---
    function startDetailParsing() {
        let attempts = 0;
        const parser = setInterval(() => {
            try {
                const body = document.body.innerText;
                const cleanBody = body.replace(/\s+/g, ' ');

                const jobEl = document.getElementById('result-job');
                const jobImg = document.getElementById('result-job-image');
                let job = null;

                if (jobEl && jobEl.innerText.trim()) {
                    job = jobEl.innerText.trim();
                } else if (jobImg && jobImg.alt) {
                    job = jobImg.alt.trim();
                } else {
                    const jobs = ["수호성", "검성", "살성", "궁성", "마도성", "정령성", "치유성", "호법성"];
                    // 최후의 수단으로만 본문 매칭을 시도하되, 아주 제한적인 영역에서만 찾도록 변경될 수 있음
                    job = jobs.find(j => cleanBody.includes(j)) || null;
                }

                let power = "0";

                // [수정] 3자리수 대응 (\d{4} -> \d{3,5})
                // 아이템 레벨 키워드 주변 숫자를 1순위로 탐색
                // 예: "아이템레벨 934" or "아이템 레벨 1,234"
                const itemLvMatch = body.match(/아이템\s*레벨\s*([\d,]{3,6})/); // 3자리~6자리 허용

                if (itemLvMatch) {
                    const cleanNum = itemLvMatch[1].replace(/,/g, '');
                    // 너무 크면(예: 랭킹 294,590위) 무시하고 더 합리적인 숫자를 찾아야 함
                    // 하지만 '아이템 레벨' 키워드 바로 뒤면 믿을만함
                    power = cleanNum;
                } else {
                    // 2순위: 종합 점수 (예: 166,507 -> 전투력 대체)
                    const scoreMatch = body.match(/종합\s*점수\s*([\d,]{3,7})/);
                    if (scoreMatch) {
                        power = scoreMatch[1].replace(/,/g, '');
                    }
                }

                let guild = "-";
                if (body.includes('츄') || document.querySelector("img[alt='츄']")) guild = '츄';
                else {
                    const gMatch = body.match(/레기온\s+([^\s\n]+)/);
                    if (gMatch) guild = gMatch[1];
                }

                log(`분석: ${name} / ${power} / ${job}`);

                if (name && power !== "0") {
                    clearInterval(parser);
                    log("🚀 완료! 전송");
                    report({ success: true, data: { name, class: job || '미정', power, guild } });
                }

            } catch (e) { }

            if (attempts++ > 200) {
                clearInterval(parser);
                report({ success: false, error: "상세 정보 분석 실패" });
            }
        }, 100);
    }
})();
