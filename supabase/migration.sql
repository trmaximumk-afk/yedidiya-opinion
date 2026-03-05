-- ============================================================
-- 여디디야 의견함 (Yedidiya Opinion Box) - Supabase Migration
-- ============================================================
-- 실행 방법: Supabase Dashboard > SQL Editor에서 실행
-- ============================================================

-- 1. opinions 테이블
CREATE TABLE IF NOT EXISTS opinions (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at  TIMESTAMPTZ DEFAULT now() NOT NULL,
  category    TEXT NOT NULL CHECK (category IN ('suggest','feedback','thanks','concern','event','other')),
  title       TEXT NOT NULL CHECK (char_length(title) <= 100),
  content     TEXT NOT NULL CHECK (char_length(content) <= 1000),
  author      TEXT NOT NULL DEFAULT '익명',
  anonymous   BOOLEAN NOT NULL DEFAULT true,
  secret      BOOLEAN NOT NULL DEFAULT false,
  priority    TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal','important','urgent')),
  status      TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','read','replied','archived')),
  likes       INT NOT NULL DEFAULT 0,
  reply       TEXT,
  reply_date  DATE
);

-- 2. 인덱스
CREATE INDEX IF NOT EXISTS idx_opinions_created_at ON opinions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_opinions_category ON opinions (category);
CREATE INDEX IF NOT EXISTS idx_opinions_status ON opinions (status);
CREATE INDEX IF NOT EXISTS idx_opinions_secret ON opinions (secret);

-- 3. RLS (Row Level Security) 활성화
ALTER TABLE opinions ENABLE ROW LEVEL SECURITY;

-- 4. RLS 정책: 누구나 읽기 가능 (비밀글은 앱 레벨에서 필터링)
--    anon key로 접근하므로 anon role에 권한 부여
CREATE POLICY "opinions_select_all"
  ON opinions FOR SELECT
  TO anon
  USING (true);

-- 5. RLS 정책: 누구나 의견 작성 가능
CREATE POLICY "opinions_insert_all"
  ON opinions FOR INSERT
  TO anon
  WITH CHECK (true);

-- 6. RLS 정책: 누구나 좋아요 업데이트 가능 (likes 필드)
--    실제로는 임원진이 status, reply 등도 업데이트하므로 전체 허용
CREATE POLICY "opinions_update_all"
  ON opinions FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

-- 7. RLS 정책: 삭제는 허용 (임원진이 앱에서 비밀번호 인증 후 삭제)
CREATE POLICY "opinions_delete_all"
  ON opinions FOR DELETE
  TO anon
  USING (true);

-- ============================================================
-- 확인용 쿼리
-- ============================================================
-- SELECT * FROM opinions ORDER BY created_at DESC;
