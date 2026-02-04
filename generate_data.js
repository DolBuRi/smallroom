const fs = require('fs');
const path = require('path');

const CLASSES = ['검성', '수호성', '살성', '궁성', '마도성', '정령성', '치유성', '호법성'];
const DAYS = ['월', '화', '수', '목', '금', '토', '일'];
const SLOTS = {
    '평일': ['wd1', 'wd2', 'wd3'],
    '주말': ['we1', 'we2', 'we3', 'we4', 'we5']
};

const NICKNAMES_PREFIX = ['빛나는', '강력한', '빠른', '무거운', '날렵한', '지혜로운', '신성한', '어두운', '붉은', '푸른'];
const NICKNAMES_SUFFIX = ['전사', '수호자', '암살자', '궁수', '마법사', '정령', '사제', '호법', '기사', '용사'];

function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateNickname(index) {
    return `${NICKNAMES_PREFIX[index % NICKNAMES_PREFIX.length]}${NICKNAMES_SUFFIX[index % NICKNAMES_SUFFIX.length]}${index}`;
}

const applications = [];

for (let i = 1; i <= 100; i++) {
    const cls = CLASSES[i % CLASSES.length]; // Even distribution of classes
    const power = getRandomInt(1000, 4800); // Varied power

    // Generate random availability
    const availability = {};
    const numDays = getRandomInt(1, 3);
    const selectedDays = [];

    while (selectedDays.length < numDays) {
        const day = DAYS[getRandomInt(0, DAYS.length - 1)];
        if (!selectedDays.includes(day)) selectedDays.push(day);
    }

    selectedDays.forEach(day => {
        const isWeekend = ['토', '일'].includes(day);
        const slots = isWeekend ? SLOTS['주말'] : SLOTS['평일'];
        const numSlots = getRandomInt(1, Math.min(3, slots.length));
        const selectedSlots = [];

        // Randomly pick slots for that day
        const shuffled = [...slots].sort(() => 0.5 - Math.random());
        availability[day] = shuffled.slice(0, numSlots).sort();
    });

    applications.push({
        id: `app${i}`,
        nickname: generateNickname(i),
        class: cls,
        power: power,
        availability: availability,
        updatedAt: new Date().toISOString()
    });
}

// Write to file
const outputPath = path.join(__dirname, 'app', 'data', 'raid_applications.json');
fs.writeFileSync(outputPath, JSON.stringify(applications, null, 2), 'utf8');

console.log('Successfully generated 100 dummy applications to ' + outputPath);
