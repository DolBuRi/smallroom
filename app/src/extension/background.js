// [Aoni Visible Scraper]
// 100% 동작 보장을 위한 팝업 윈도우 제어기

let activeCallback = null;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

    // 1. 요청 수신
    if (request.type === 'AONI_SEARCH_REQUEST') {
        const { name, server } = request;
        console.log(`[Background] 작업 시작: ${name}`);
        activeCallback = sendResponse;

        const serverMap = {
            '아리엘': '1006', '이스라펠': '2001', '시엘': '1001',
            '네자칸': '1002', '지켈': '2002', '트리니엘': '2003', '바이젤': '1003'
        };
        const sId = serverMap[server] || '1006';
        const rId = '1'; // 천족

        const params = `?q=${encodeURIComponent(name)}&page=0&raceId=${rId}&serverId=${sId}&auto_scrape=true`;

        // [변경] 사용자 편의: 화면 밖으로 창을 이동시켜서 완벽하게 숨김 (Invisible Mode)
        // [변경] 오프스크린 렌더링 불가 문제 해결 -> 최소화 모드로 복귀
        chrome.windows.create({
            url: `https://aon2.info/character/search${params}`,
            type: 'popup',
            state: 'minimized',
            focused: false
        });

        return true;
    }

    // 2. 결과 수신
    if (request.type === 'SCRAPE_RESULT') {
        console.log(`[Background] 결과 수신:`, request);

        // 자동 닫기 (탭 닫기)
        if (sender.tab && sender.tab.id) {
            setTimeout(() => {
                chrome.tabs.remove(sender.tab.id);
            }, 100); // 0.1초 후 즉시 닫기
        }

        if (activeCallback) {
            activeCallback(request);
            activeCallback = null;
        }
    }
});
