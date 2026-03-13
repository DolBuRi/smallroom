// [Aoni Visible Scraper]
// 100% 동작 보장을 위한 팝업 윈도우 제어기

let activeCallback = null;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

    // 1. 요청 수신
    if (request.type === 'AONI_SEARCH_REQUEST') {
        const { name, server, serverId, raceId } = request;
        console.log(`[Background] 작업 시작: ${name} (Server: ${server}/${serverId})`);
        activeCallback = sendResponse;

        const serverMap = {
            '아리엘': '1006', '이스라펠': '2001', '시엘': '1001',
            '네자칸': '1002', '지켈': '2002', '트리니엘': '2003', '바이젤': '1003'
        };
        
        // Priority: serverId (passed) > serverMap (hardcoded) > default (1006)
        const sId = serverId || serverMap[server] || '1006';
        
        // Priority: raceId (passed) > faction (passed) > default (1: Elyos)
        let rId = '1';
        if (raceId) {
            rId = raceId;
        } else if (request.faction === '마족') {
            rId = '2';
        } else if (request.faction === '천족') {
            rId = '1';
        }

        const params = `?q=${encodeURIComponent(name)}&serverId=${sId}&raceId=${rId}&auto_scrape=true`;

        chrome.windows.create({
            url: `https://aion2tool.com/${params}`,
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
