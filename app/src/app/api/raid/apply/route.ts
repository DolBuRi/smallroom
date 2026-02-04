import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const APPLICATIONS_FILE = path.join(DATA_DIR, 'raid_applications.json');

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

function getApplications() {
    if (!fs.existsSync(APPLICATIONS_FILE)) {
        return [];
    }
    const fileData = fs.readFileSync(APPLICATIONS_FILE, 'utf-8');
    try {
        return JSON.parse(fileData);
    } catch (e) {
        return [];
    }
}

function saveApplications(apps: any[]) {
    fs.writeFileSync(APPLICATIONS_FILE, JSON.stringify(apps, null, 2));
}

export async function GET() {
    return NextResponse.json(getApplications());
}

export async function POST(request: Request) {
    try {
        const body = await request.json(); // { nickname, availability, class, power }
        const { nickname, availability } = body;

        if (!nickname || !availability) {
            return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 });
        }

        const currentApps = getApplications();
        // Update if exists, otherwise append
        const index = currentApps.findIndex((a: any) => a.nickname === nickname);

        const newEntry = {
            ...body,
            id: index >= 0 ? currentApps[index].id : Date.now().toString(),
            updatedAt: new Date().toISOString()
        };

        if (index >= 0) {
            currentApps[index] = newEntry;
        } else {
            currentApps.push(newEntry);
        }

        saveApplications(currentApps);
        return NextResponse.json({ success: true, data: newEntry });
    } catch (e) {
        return NextResponse.json({ success: false, error: "Server Error" }, { status: 500 });
    }
}

export async function DELETE(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const nickname = searchParams.get('nickname');
        const isAll = searchParams.get('all') === 'true';

        if (isAll) {
            saveApplications([]);
            return NextResponse.json({ success: true, message: "All applications cleared" });
        }

        if (!nickname) {
            return NextResponse.json({ success: false, error: "Nickname is required" }, { status: 400 });
        }

        const currentApps = getApplications();
        const filteredApps = currentApps.filter((a: any) => a.nickname !== nickname);

        if (currentApps.length === filteredApps.length) {
            return NextResponse.json({ success: false, error: "Application not found" }, { status: 404 });
        }

        saveApplications(filteredApps);
        return NextResponse.json({ success: true, message: "Removed successfully" });
    } catch (e) {
        return NextResponse.json({ success: false, error: "Server Error" }, { status: 500 });
    }
}
