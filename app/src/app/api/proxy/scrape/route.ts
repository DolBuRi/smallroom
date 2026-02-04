import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { name } = body;

        // 로컬 Scraper Server (Port 4000)로 전달
        // 주의: Vercel 배포 환경에서는 localhost:4000에 접근 불가하므로 에러 발생 -> 클라이언트가 Extension으로 Fallback 해야 함.
        // 만약 배포 환경에서도 쓰려면 ngrok 주소나 실제 서버 주소를 환경변수로 넣어야 함.
        const scraperUrl = process.env.SCRAPER_URL || 'http://localhost:4000/scrape';
        console.log(`[Proxy] Forwarding to: ${scraperUrl}`);

        const response = await fetch(scraperUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'ngrok-skip-browser-warning': 'true' // Ngrok 무료 버전 경고 페이지 우회
            },
            body: JSON.stringify({ nickname: name })
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error(`[Proxy] Scraper Error (${response.status}):`, errText);
            return NextResponse.json({ success: false, error: 'Scraper Unreachable' }, { status: 502 });
        }

        const data = await response.json();
        return NextResponse.json(data);

    } catch (error) {
        console.error(`[Proxy] Fatal Error:`, error);
        return NextResponse.json({ success: false, error: 'Server Error' }, { status: 500 });
    }
}
