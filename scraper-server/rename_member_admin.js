const admin = require('firebase-admin');
const serviceAccount = require('./system_core.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://aion2-guild-default-rtdb.asia-southeast1.firebasedatabase.app"
});

const db = admin.database();

async function renameMember() {
    const OLD_NAME = "부트띠";
    const NEW_NAME = "사신대행이치고";

    console.log(`Renaming ${OLD_NAME} to ${NEW_NAME} using Admin SDK...`);

    // 1. Update fixed_members
    const membersRef = db.ref('fixed_members');
    const membersSnap = await membersRef.once('value');
    if (membersSnap.exists()) {
        const members = membersSnap.val();
        for (const key in members) {
            if (members[key].name === OLD_NAME) {
                console.log(`Updating fixed_members entry: ${key}`);
                await db.ref(`fixed_members/${key}`).update({ name: NEW_NAME });
            }
        }
    }

    // 2. Update fixed_sub_characters ownerName
    const subsRef = db.ref('fixed_sub_characters');
    const subsSnap = await subsRef.once('value');
    if (subsSnap.exists()) {
        const subs = subsSnap.val();
        for (const key in subs) {
            if (subs[key].ownerName === OLD_NAME) {
                console.log(`Updating fixed_sub_characters ownerName for: ${key}`);
                await db.ref(`fixed_sub_characters/${key}`).update({ ownerName: NEW_NAME });
            }
        }
    }

    // 3. Update fixed_raid_fixed_groups name and memberIds
    const groupsRef = db.ref('fixed_raid_fixed_groups');
    const groupsSnap = await groupsRef.once('value');
    if (groupsSnap.exists()) {
        const groups = groupsSnap.val();
        for (const key in groups) {
            let updated = false;
            const group = groups[key];
            
            if (group.name === OLD_NAME) {
                group.name = NEW_NAME;
                updated = true;
            }
            
            if (group.memberIds && Array.isArray(group.memberIds)) {
                const index = group.memberIds.indexOf(OLD_NAME);
                if (index !== -1) {
                    group.memberIds[index] = NEW_NAME;
                    updated = true;
                }
            }

            if (updated) {
                console.log(`Updating fixed_raid_fixed_groups: ${key}`);
                await db.ref(`fixed_raid_fixed_groups/${key}`).set(group);
            }
        }
    }

    console.log("Rename process completed successfully.");
    process.exit(0);
}

renameMember().catch(err => {
    console.error(err);
    process.exit(1);
});
