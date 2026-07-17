# 소셜 테이블 (Social Table) — Firebase 버전

프라이빗 BAR 소셜 소개팅 웹앱.
관리자 4명 동시접속 + 실시간 동기화 + 데이터 영구저장.

---

## Firebase 설정 (필수, 10분)

1. https://console.firebase.google.com 접속
2. "프로젝트 만들기" → 이름 입력 (예: social-table)
3. **Firestore Database** 활성화
   - "데이터베이스 만들기" → 테스트 모드 선택
4. **Authentication** 활성화
   - "시작하기" → 이메일/비밀번호 사용 설정
   - "사용자 추가" → 관리자 이메일/비밀번호 등록
5. **프로젝트 설정** → "내 앱" → 웹 앱 추가 → firebaseConfig 복사
6. `js/firebase-config.js` 열어서 복사한 값으로 교체

---

## 관리자 계정 만들기

Firebase Console → Authentication → 사용자 추가
- 이메일: admin@socialtable.kr (원하는 이메일)
- 비밀번호: 원하는 비밀번호

관리자 4명이면 4개 계정 생성.

---

## 배포

### 옵션 A: Firebase Hosting (추천, 무료)
```bash
npm install -g firebase-tools
firebase login
firebase init hosting
firebase deploy
```

### 옵션 B: Netlify
소셜 테이블 폴더를 Netlify에 드래그앤드롭

---

## 운영 흐름

### 모임 전날
1. 관리자 로그인 → 새 모임 만들기 (날짜·장소·찜 개수)
2. 생성된 **사전 프로필 링크** 카톡/문자로 참여자에게 전송
3. 참여자가 사전 프로필 작성 → Firebase에 자동 저장
4. 관리자 4명 대시보드에 실시간 반영

### 당일
5. **입장 링크** 전송 → 참여자 성별 선택 → 상대 카드 열람
6. 찜하면 관리자 4명 폰에 즉시 동기화
7. 번호 지정 → 매칭 확인 → 연락처 전달

---

## 실시간 동기화 포인트

| 동작 | 반영 대상 |
|------|----------|
| 참여자 프로필 등록 | 관리자 4명 대시보드 즉시 |
| 찜 누름 | 관리자 매칭 화면 즉시 |
| 번호 지정 | 관리자 4명 즉시 |
| 연락처 전달 | 전달 완료 상태 공유 |

---

## Firebase 무료 한도 (Spark Plan)

- Firestore 읽기: 50,000회/일 → 모임 1회 약 300회 사용 (0.6%)
- Firestore 쓰기: 20,000회/일 → 모임 1회 약 100회 사용 (0.5%)
- Authentication: 무제한
- **예상 월 비용: 0원**

---

## 파일 구조

```
social-table-final/
├── js/
│   ├── firebase-config.js   ← Firebase 키 입력 (필수)
│   └── data.js              ← Firestore + Auth 전체 로직
├── index.html               ← 메인 (QR 진입 / 입장)
├── pages/
│   ├── menu.html, gender.html, preform.html
│   ├── done.html, cards.html
└── admin/
    ├── login.html, dashboard.html, new-event.html
    ├── link.html, numbers.html, matching.html
    ├── ranking.html, settings.html
```
