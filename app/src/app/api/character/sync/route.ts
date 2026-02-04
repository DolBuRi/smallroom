import { NextResponse } from 'next/server';

let lastSyncedData: any = null;

// CORS 설정 (모든 도메인 허용 - 확장 프로그램 통신 필수)
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
    return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(request: Request) {
    try {
        const data = await request.json();
        console.log(`[Sync API] 데이터 수신: ${data.name || 'Unknown'} (${data.power})`);

        lastSyncedData = data;

        return NextResponse.json({ success: true }, { headers: corsHeaders });
    } catch (e) {
        console.error("[Sync API] 오류:", e);
        return NextResponse.json({ success: false }, { status: 400, headers: corsHeaders });
    }
}

export async function GET() {
    // 데이터를 읽어가는 즉시 메모리에서 비워서(consume) 중복 처리를 방지
    const data = lastSyncedData;
    if (data) lastSyncedData = null;

    return NextResponse.json(data || { found: false }, { headers: corsHeaders });
}
