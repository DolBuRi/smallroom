import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'members.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initial Data
const INITIAL_DATA: any[] = [];

function getMembers() {
    if (!fs.existsSync(DATA_FILE)) {
        fs.writeFileSync(DATA_FILE, JSON.stringify(INITIAL_DATA, null, 2));
        return INITIAL_DATA;
    }
    const fileData = fs.readFileSync(DATA_FILE, 'utf-8');
    try {
        return JSON.parse(fileData);
    } catch (e) {
        return [];
    }
}

function saveMembers(members: any[]) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(members, null, 2));
}

export async function GET() {
    const members = getMembers();
    return NextResponse.json(members);
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        if (Array.isArray(body)) {
            saveMembers(body);
            return NextResponse.json({ success: true, count: body.length });
        } else {
            return NextResponse.json({ success: false, error: "Invalid data format" }, { status: 400 });
        }
    } catch (e) {
        return NextResponse.json({ success: false, error: "Server Error" }, { status: 500 });
    }
}
