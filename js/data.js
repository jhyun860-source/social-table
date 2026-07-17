// ════════════════════════════════════════════════════════
//  소셜 테이블 — Firebase Firestore 데이터 레이어
//  onSnapshot 실시간 리스너 기반
//  관리자 최대 4명 동시접속 + 참여자 실시간 동기화
// ════════════════════════════════════════════════════════

import { FIREBASE_CONFIG } from "./firebase-config.js";
import { initializeApp }          from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, doc,
         getDocs, getDoc, addDoc, setDoc,
         updateDoc, deleteDoc, query, where,
         orderBy, onSnapshot, serverTimestamp,
         writeBatch }              from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword,
         signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// ── 앱 초기화 ──────────────────────────────────────────
const app  = initializeApp(FIREBASE_CONFIG);
const db   = getFirestore(app);
const auth = getAuth(app);

// ── 컬렉션 참조 ────────────────────────────────────────
const COL = {
  events:       () => collection(db, 'events'),
  participants: () => collection(db, 'participants'),
  zzims:        () => collection(db, 'zzims'),
  notified:     () => collection(db, 'notified'),
  settings:     () => collection(db, 'settings'),
  menus:        () => collection(db, 'menus'),
};

// ════════════════════════════════════════════════════════
//  인증 (Authentication)
// ════════════════════════════════════════════════════════

// 로그인
async function adminLogin(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

// 로그아웃
async function adminLogout() {
  await signOut(auth);
}

// 현재 로그인 상태 감시 (콜백)
function onAdminAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}

// 현재 유저
function currentAdmin() {
  return auth.currentUser;
}

// ════════════════════════════════════════════════════════
//  모임 (Events)
// ════════════════════════════════════════════════════════

// 모임 목록 가져오기 (1회)
async function getEvents() {
  const snap = await getDocs(COL.events());
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

// 특정 모임 가져오기
async function getEvent(eventId) {
  const snap = await getDoc(doc(db, 'events', eventId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// 새 모임 생성
async function addEvent(ev) {
  // 중복 방지: 같은 ID 있으면 새 고유 ID 생성
  const baseId = ev.id;
  let finalId = baseId;
  let suffix = 1;
  while (true) {
    const existing = await getDoc(doc(db, 'events', finalId));
    if (!existing.exists()) break;
    finalId = baseId + '_' + suffix;
    suffix++;
  }
  await setDoc(doc(db, 'events', finalId), {
    ...ev,
    id: finalId,
    createdAt: serverTimestamp(),
  });
  return finalId;
}

// 모임 업데이트
async function updateEvent(eventId, data) {
  await updateDoc(doc(db, 'events', eventId), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

// 모임 실시간 감시 → 관리자 4명 화면 자동 업데이트
function watchEvents(callback) {
  return onSnapshot(
    query(COL.events(), orderBy('date', 'desc')),
    snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  );
}

// 모임 ID 생성
function genEventId(date) {
  return 'e_' + date.replace(/-/g, '');
}

// ════════════════════════════════════════════════════════
//  참여자 (Participants)
// ════════════════════════════════════════════════════════

// 특정 모임 참여자 가져오기 (1회)
async function getParticipants(eventId, gender) {
  try {
    const snap = await getDocs(COL.participants());
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(p => p.eventId === eventId && (!gender || p.gender === gender))
      .sort((a, b) => (a.number || 999) - (b.number || 999));
  } catch(e) {
    console.error('getParticipants error:', e);
    return [];
  }
}

// 참여자 추가
async function addParticipant(p) {
  const ref = await addDoc(COL.participants(), {
    ...p,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

// 이름과 핸드폰 번호로 참여자 찾기
async function findParticipant(eventId, name, phone) {
  // 하이픈 제거 후 비교 (010-1234-5678 / 01012345678 둘 다 매칭)
  const phoneClean = phone.replace(/\D/g, '');
  const snap = await getDocs(COL.participants());
  const match = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .find(p =>
      p.eventId === eventId &&
      p.name === name &&
      (p.phone || '').replace(/\D/g, '') === phoneClean
    );
  return match || null;
}

// 참여자 번호 업데이트
async function updateParticipantNumber(participantId, number) {
  await updateDoc(doc(db, 'participants', participantId), {
    number,
    updatedAt: serverTimestamp(),
  });
}

// 참여자 실시간 감시 → 번호 지정 시 관리자 전원 즉시 반영
function watchParticipants(eventId, callback) {
  const q = query(
    COL.participants(),
    where('eventId', '==', eventId)
  );
  return onSnapshot(q, snap => {
    const pts = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.number || 999) - (b.number || 999));
    callback(pts);
  });
}

// 참여자 수 헬퍼
async function getParticipantCount(eventId, gender) {
  const pts = await getParticipants(eventId, gender);
  return pts.length;
}

// 받은 찜 수
async function getReceivedCount(toId, eventId) {
  const snap = await getDocs(
    query(COL.zzims(), where('toId', '==', toId), where('eventId', '==', eventId))
  );
  return snap.size;
}

// ════════════════════════════════════════════════════════
//  찜 (Zzims)
// ════════════════════════════════════════════════════════

// 내 찜 목록
async function getMyZzims(fromId, eventId) {
  const snap = await getDocs(
    query(COL.zzims(), where('fromId', '==', fromId), where('eventId', '==', eventId))
  );
  return snap.docs.map(d => d.data().toId);
}

// 찜 추가
async function addZzim(fromId, toId, eventId) {
  // 중복 방지
  const existing = await getDocs(
    query(COL.zzims(),
      where('fromId', '==', fromId),
      where('toId',   '==', toId),
      where('eventId','==', eventId)
    )
  );
  if (!existing.empty) return;
  await addDoc(COL.zzims(), {
    fromId, toId, eventId,
    createdAt: serverTimestamp(),
  });
}

// 찜 취소
async function removeZzim(fromId, toId, eventId) {
  const snap = await getDocs(
    query(COL.zzims(),
      where('fromId', '==', fromId),
      where('toId',   '==', toId),
      where('eventId','==', eventId)
    )
  );
  const batch = writeBatch(db);
  snap.docs.forEach(d => batch.delete(d.ref));
  await batch.commit();
}

// 상호 매칭 계산
async function getMutualMatches(eventId) {
  const snap = await getDocs(
    query(COL.zzims(), where('eventId', '==', eventId))
  );
  const all = snap.docs.map(d => d.data());
  const results = [];
  const seen = new Set();

  for (const z of all) {
    const rev = all.find(r => r.fromId === z.toId && r.toId === z.fromId);
    if (rev) {
      const key = [z.fromId, z.toId].sort().join('|');
      if (!seen.has(key)) {
        seen.add(key);
        const [aSnap, bSnap] = await Promise.all([
          getDoc(doc(db, 'participants', z.fromId)),
          getDoc(doc(db, 'participants', z.toId)),
        ]);
        const a = aSnap.exists() ? { id: aSnap.id, ...aSnap.data() } : null;
        const b = bSnap.exists() ? { id: bSnap.id, ...bSnap.data() } : null;
        if (a && b) results.push({ a, b });
      }
    }
  }
  return results;
}

// 찜 실시간 감시 → 참여자가 찜하면 관리자 4명 즉시 반영
function watchZzims(eventId, callback) {
  return onSnapshot(
    query(COL.zzims(), where('eventId', '==', eventId)),
    async snap => {
      const all = snap.docs.map(d => d.data());
      const results = [];
      const seen = new Set();

      for (const z of all) {
        const rev = all.find(r => r.fromId === z.toId && r.toId === z.fromId);
        if (rev) {
          const key = [z.fromId, z.toId].sort().join('|');
          if (!seen.has(key)) {
            seen.add(key);
            const [aSnap, bSnap] = await Promise.all([
              getDoc(doc(db, 'participants', z.fromId)),
              getDoc(doc(db, 'participants', z.toId)),
            ]);
            const a = aSnap.exists() ? { id: aSnap.id, ...aSnap.data() } : null;
            const b = bSnap.exists() ? { id: bSnap.id, ...bSnap.data() } : null;
            if (a && b) results.push({ a, b });
          }
        }
      }
      callback({ all, mutuals: results });
    }
  );
}

// ════════════════════════════════════════════════════════
//  연락처 전달 알림 (Notified)
// ════════════════════════════════════════════════════════

async function isNotified(aId, bId, eventId) {
  const key = [aId, bId].sort().join('|') + '_' + eventId;
  const snap = await getDoc(doc(db, 'notified', key));
  return snap.exists();
}

async function setNotified(aId, bId, eventId) {
  const key = [aId, bId].sort().join('|') + '_' + eventId;
  await setDoc(doc(db, 'notified', key), {
    aId, bId, eventId,
    notifiedAt: serverTimestamp(),
  });
}

// ════════════════════════════════════════════════════════
//  메뉴 (Menus)
// ════════════════════════════════════════════════════════

// 메뉴 전체 가져오기
async function getMenus() {
  const snap = await getDocs(COL.menus());
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// 카테고리별 메뉴
async function getMenuByCategory(category) {
  const snap = await getDocs(
    query(COL.menus(), where('category', '==', category))
  );
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// 메뉴 저장 (전체 덮어쓰기)
async function saveMenus(menus) {
  const batch = writeBatch(db);
  // 기존 삭제
  const existing = await getDocs(COL.menus());
  existing.docs.forEach(d => batch.delete(d.ref));
  // 새로 저장
  menus.forEach(m => {
    const ref = doc(db, 'menus', m.id || ('m_' + Date.now() + Math.random()));
    batch.set(ref, m);
  });
  await batch.commit();
}

// ════════════════════════════════════════════════════════
//  설정 (Settings)
// ════════════════════════════════════════════════════════

async function getSettings() {
  const snap = await getDoc(doc(db, 'settings', 'main'));
  return snap.exists() ? snap.data() : {
    solapiKey: '',
    senderPhone: '',
  };
}

async function saveSettings(data) {
  await setDoc(doc(db, 'settings', 'main'), data, { merge: true });
}

// ════════════════════════════════════════════════════════
//  랭킹 (Cross-event)
// ════════════════════════════════════════════════════════

async function getCrossRanking(gender) {
  let q = COL.participants();
  if (gender) q = query(COL.participants(), where('gender', '==', gender));
  const snap = await getDocs(q);
  const pts = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  const allZzims = await getDocs(COL.zzims());
  const zzimData = allZzims.docs.map(d => d.data());

  return pts
    .map(p => ({
      ...p,
      totalVotes: zzimData.filter(z => z.toId === p.id).length,
    }))
    .sort((a, b) => b.totalVotes - a.totalVotes);
}

// ════════════════════════════════════════════════════════
//  초기 데이터 시딩 (최초 1회만)
//  Firebase 콘솔에서 직접 넣거나 이 함수 1회 실행
// ════════════════════════════════════════════════════════

async function seedInitialData() {
  // 항상 최신 메뉴로 업데이트
  const existing = await getDocs(COL.menus());

  const batch = writeBatch(db);
  const defaultMenus = [
    { id:'m1',  category:'mix',    name:'하이볼',              price:'15,000', isUnlimited:false, isNonAlc:false },
    { id:'m2',  category:'mix',    name:'진저 하이볼',          price:'15,000', isUnlimited:false, isNonAlc:false },
    { id:'m3',  category:'mix',    name:'얼그레이 하이볼',      price:'15,000', isUnlimited:false, isNonAlc:false },
    { id:'m4',  category:'mix',    name:'청포도 하이볼',        price:'15,000', isUnlimited:false, isNonAlc:false },
    { id:'m5',  category:'mix',    name:'블루레몬 하이볼',      price:'15,000', isUnlimited:false, isNonAlc:false },
    { id:'m6',  category:'mix',    name:'워터멜론',             price:'15,000', isUnlimited:false, isNonAlc:false },
    { id:'m7',  category:'mix',    name:'진토닉',               price:'15,000', isUnlimited:false, isNonAlc:false },
    { id:'m8',  category:'mix',    name:'보드카 토닉',          price:'15,000', isUnlimited:false, isNonAlc:false },
    { id:'m9',  category:'mix',    name:'보드카 크랜베리',      price:'15,000', isUnlimited:false, isNonAlc:false },
    { id:'m10', category:'mix',    name:'위스키콕',             price:'15,000', isUnlimited:false, isNonAlc:false },
    { id:'m11', category:'cock',   name:'모히토',               price:'15,000', isUnlimited:false, isNonAlc:false },
    { id:'m12', category:'cock',   name:'갓파더',               price:'15,000', isUnlimited:false, isNonAlc:false },
    { id:'m13', category:'cock',   name:'마티니',               price:'15,000', isUnlimited:false, isNonAlc:false },
    { id:'m14', category:'cock',   name:'피치크러시',           price:'15,000', isUnlimited:false, isNonAlc:false },
    { id:'m15', category:'cock',   name:'미도리사워',           price:'15,000', isUnlimited:false, isNonAlc:false },
    { id:'m16', category:'cock',   name:'바나나다이키리',       price:'15,000', isUnlimited:false, isNonAlc:false },
    { id:'m17', category:'cock',   name:'롱아일랜드 아이스티',  price:'15,000', isUnlimited:false, isNonAlc:false },
    { id:'m18', category:'cock',   name:'칼루아밀크',           price:'15,000', isUnlimited:false, isNonAlc:false },
    { id:'m19', category:'cock',   name:'말리부밀크',           price:'15,000', isUnlimited:false, isNonAlc:false },
    { id:'m20', category:'nonalc', name:'워터멜론',             price:'15,000', isUnlimited:false, isNonAlc:true  },
    { id:'m21', category:'nonalc', name:'청포도 하이볼',        price:'15,000', isUnlimited:false, isNonAlc:true  },
    { id:'m22', category:'nonalc', name:'얼그레이 하이볼',      price:'15,000', isUnlimited:false, isNonAlc:true  },
    { id:'m23', category:'nonalc', name:'피나콜라다',           price:'15,000', isUnlimited:false, isNonAlc:true  },
    { id:'m24', category:'whisky', name:'발렌타인 17y',         price:'',       isUnlimited:true,  isNonAlc:false },
    { id:'m25', category:'whisky', name:'글랜리벳 12y',         price:'',       isUnlimited:true,  isNonAlc:false },
  ];
  defaultMenus.forEach(m => batch.set(doc(db, 'menus', m.id), m));
  await batch.commit();
  console.log('✅ 초기 메뉴 데이터 입력 완료');
}

// ════════════════════════════════════════════════════════
//  유틸
// ════════════════════════════════════════════════════════

function numLabel(gender, number) {
  if (!number) return '미지정';
  return (gender === 'f' ? '여자' : '남자') + ' ' + number + '번';
}

function copyToClipboard(text) {
  if (navigator.clipboard) navigator.clipboard.writeText(text);
  else {
    const t = document.createElement('textarea');
    t.value = text; document.body.appendChild(t);
    t.select(); document.execCommand('copy');
    document.body.removeChild(t);
  }
}

// SMS 발송 — 링크 복사 + 카톡/문자 공유 방식 사용
// 자동 발송은 솔라피 공식 SDK(서버사이드) 구현 필요 — 현재 MVP에서는 미지원
async function sendSMS(to, message) {
  // 링크 복사로 대체
  copyToClipboard(message);
  alert('링크가 복사됐어요. 카톡 단톡방에 붙여넣기 해주세요!');
  return true;
}

async function deleteParticipant(id) {
  const docRef = doc(db, 'participants', id);
  await deleteDoc(docRef);
}

async function updateParticipant(id, data) {
  const docRef = doc(db, 'participants', id);
  await updateDoc(docRef, data);
}

// 전체 export
export {
  db, auth,
  adminLogin, adminLogout, onAdminAuthChange, currentAdmin,
  getEvents, getEvent, addEvent, updateEvent, watchEvents, genEventId,
  getParticipants, addParticipant, findParticipant, updateParticipantNumber,
  watchParticipants, getParticipantCount, getReceivedCount,
  getMyZzims, addZzim, removeZzim, getMutualMatches, watchZzims,
  isNotified, setNotified,
  getMenus, getMenuByCategory, saveMenus,
  getSettings, saveSettings,
  getCrossRanking,
  seedInitialData,
  numLabel, copyToClipboard, sendSMS,
  deleteParticipant, updateParticipant
};
