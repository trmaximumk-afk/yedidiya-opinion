# 완전 자동화 실행 순서 (무개입에 최대 근접)

## 1) 필수 1회 인증(최초 1번만)
- `gh auth login`
- `vercel login`

## 2) Supabase 값만 넣고 로컬 자동 세팅
```bash
export SUPABASE_URL="https://<project>.supabase.co"
export SUPABASE_ANON_KEY="<anon-key>"
export ADMIN_PW="2026"
./scripts/auto_setup.sh
```

## 3) 깃 푸시 자동
```bash
export REPO_URL="https://github.com/trmaximumk-afk/yedidiya-opinion.git"
./scripts/auto_push.sh
```

## 4) Vercel 배포 자동
```bash
export VITE_SUPABASE_URL="$SUPABASE_URL"
export VITE_SUPABASE_ANON_KEY="$SUPABASE_ANON_KEY"
export VITE_ADMIN_PW="$ADMIN_PW"
./scripts/auto_vercel.sh
```

## 5) Supabase SQL 자동화(선택)
Supabase CLI access token + project ref 있으면 SQL도 자동 실행 가능.
현재 버전은 웹 SQL Editor 실행 방식 유지.
