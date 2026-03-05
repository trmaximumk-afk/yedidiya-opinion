# 📮 여디디야 의견함

여디디야 청년부 전용 익명 의견함 웹앱입니다.
**가입 없이** 링크만 공유하면 모든 지체가 바로 사용할 수 있습니다.

---

## 🚀 배포 가이드 (15분 소요)

### Step 1: Supabase 테이블 생성

1. [Supabase Dashboard](https://supabase.com/dashboard) 접속
2. 기존 프로젝트 선택 (출석부 앱과 같은 프로젝트 사용 가능)
3. 좌측 메뉴 **SQL Editor** 클릭
4. `supabase/migration.sql` 파일 내용을 **복사 → 붙여넣기 → Run** 실행
5. 좌측 **Table Editor**에서 `opinions` 테이블 생성 확인

### Step 2: GitHub 저장소 생성

```bash
# 프로젝트 폴더에서
cd yedidiya-opinion
git init
git add .
git commit -m "여디디야 의견함 v1.0"

# GitHub에 새 저장소 만들고 push
git remote add origin https://github.com/YOUR_USERNAME/yedidiya-opinion.git
git branch -M main
git push -u origin main
```

### Step 3: Vercel 배포

1. [Vercel](https://vercel.com) 접속 → **New Project**
2. GitHub 저장소 `yedidiya-opinion` 선택
3. **Framework Preset**: `Vite` 선택
4. **Environment Variables** 추가:

| Key | Value |
|-----|-------|
| `VITE_SUPABASE_URL` | Supabase Dashboard > Settings > API > Project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase Dashboard > Settings > API > anon public |
| `VITE_ADMIN_PW` | `2026` (원하는 비밀번호로 변경 가능) |

5. **Deploy** 클릭!

### Step 4: 배포 완료!

생성된 URL (예: `https://yedidiya-opinion.vercel.app`)을
**여디디야 단톡방에 공유**하면 끝!

---

## 📱 사용 방법

### 일반 지체
- 링크 접속 → 바로 의견 작성 가능
- 익명/실명 선택 가능
- 🔒 비밀글은 실명 작성 필수 (임원진만 확인)
- ❤️ 공감 가능

### 임원진
- 우측 상단 🔒 → 비밀번호 입력 → 임원진 모드
- 비밀글 확인 (작성자 실명 포함)
- 답변 작성 ("임원진" 이름으로 표시)
- 상태 변경 (새 의견 → 확인됨 → 답변완료 → 보관)
- 📥 엑셀(CSV) 다운로드
- 의견 삭제

---

## 🛠 로컬 개발

```bash
npm install
cp .env.example .env    # 환경변수 설정
npm run dev             # http://localhost:5173
```

---

## 📁 프로젝트 구조

```
yedidiya-opinion/
├── index.html
├── package.json
├── vite.config.js
├── .env.example
├── supabase/
│   └── migration.sql       ← Supabase SQL (테이블 생성)
└── src/
    ├── main.jsx
    ├── App.jsx              ← 메인 앱 컴포넌트
    └── lib/
        └── supabase.js      ← Supabase 클라이언트 + DB 함수
```

---

## ⚙️ 기술 스택

- **Frontend**: React 18 + Vite
- **Backend**: Supabase (PostgreSQL + REST API)
- **Hosting**: Vercel
- **비용**: 무료 (Supabase Free tier + Vercel Hobby)
