import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

// Ensure directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DEFAULT_SETTINGS = {
    guildName: '츄',
    serverId: '1006', // Ariel
    serverName: '아리엘',
    adminPassword: '1234'
};

function getSettings() {
    if (!fs.existsSync(SETTINGS_FILE)) {
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(DEFAULT_SETTINGS, null, 2));
        return DEFAULT_SETTINGS;
    }
    const fileData = fs.readFileSync(SETTINGS_FILE, 'utf-8');
    try {
        return JSON.parse(fileData);
    } catch (e) {
        return DEFAULT_SETTINGS;
    }
}

function saveSettings(settings: any) {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

export async function GET() {
    return NextResponse.json(getSettings());
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        saveSettings(body);
        return NextResponse.json({ success: true });
    } catch (e) {
        return NextResponse.json({ success: false, error: "Server Error" }, { status: 500 });
    }
}
