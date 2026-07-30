const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function backup() {
  const date = new Date().toISOString().split('T')[0];
  const backupDir = path.join('backups', date);

  if (!fs.existsSync('backups')) fs.mkdirSync('backups');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir);

  const collections = ['participants', 'events', 'zzims', 'menus', 'settings'];

  for (const col of collections) {
    const snap = await db.collection(col).get();
    const data = {};
    snap.forEach(doc => { data[doc.id] = doc.data(); });
    fs.writeFileSync(
      path.join(backupDir, `${col}.json`),
      JSON.stringify(data, null, 2)
    );
    console.log(`✓ ${col}: ${snap.size}개 백업완료`);
  }
  console.log(`\n백업 완료: backups/${date}/`);
}

backup().catch(console.error);
