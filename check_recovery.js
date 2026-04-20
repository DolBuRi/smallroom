
function getAetherTickCount(lastUpdatedIso, nowIso) {
    const last = new Date(lastUpdatedIso);
    const now = new Date(nowIso);
    if (last > now) return 0;

    let ticks = 0;
    let nextTick = new Date(last);
    nextTick.setMinutes(0, 0, 0);
    
    let iterations = 0;
    while (true) {
        iterations++;
        nextTick.setHours(nextTick.getHours() + 1);
        const h = nextTick.getHours();
        
        if ([2, 5, 8, 11, 14, 17, 20, 23].includes(h)) {
            // Tick hour
            if (nextTick > last && nextTick <= now) {
                ticks++;
            } else if (nextTick > now) {
                break;
            }
        } else if (nextTick > now) {
            break;
        }
        
        if (iterations > 1000) break; 
    }
    return ticks;
}

// 18:27 KST = 09:27 UTC
const nowIso = "2026-03-19T09:27:00.000Z";

// Test 1: updated at 10:00 KST (01:00 UTC)
console.log("Updated at 10:00 KST, now 18:27 KST:", getAetherTickCount("2026-03-19T01:00:00.000Z", nowIso));

// Test 2: updated at 16:55 KST (07:55 UTC)
console.log("Updated at 16:55 KST, now 18:27 KST:", getAetherTickCount("2026-03-19T07:55:00.000Z", nowIso));

// Test 3: updated at 17:05 KST (08:05 UTC)
console.log("Updated at 17:05 KST, now 18:27 KST:", getAetherTickCount("2026-03-19T08:05:00.000Z", nowIso));
