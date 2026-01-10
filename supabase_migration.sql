-- ============================================================================
-- Code Metadata Tables for metadatafy
-- 프로젝트 코드베이스 메타데이터 저장용 테이블
--
-- 사용법:
-- 1. Supabase Dashboard > SQL Editor에서 실행
-- 2. 또는 supabase/migrations 폴더에 복사 후 supabase db push
-- ============================================================================

-- 파일 타입 enum (이미 존재하면 스킵)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'file_type') THEN
    CREATE TYPE file_type AS ENUM (
      'route',
      'component',
      'hook',
      'service',
      'api',
      'table',
      'utility'
    );
  END IF;
END$$;

-- ----------------------------------------------------------------------------
-- code_index: 코드 파일 인덱스 (개별 파일 메타데이터)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS code_index (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  file_type file_type NOT NULL,
  name TEXT NOT NULL,
  path TEXT NOT NULL,

  -- 검색용 필드
  keywords TEXT[] DEFAULT '{}',
  search_text TEXT,

  -- 의존성 그래프
  calls TEXT[] DEFAULT '{}',
  called_by TEXT[] DEFAULT '{}',

  -- 추가 메타데이터 (exports, props, routePath, httpMethods 등)
  metadata JSONB DEFAULT '{}',

  -- 타임스탬프
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- 유니크 제약: 같은 프로젝트에서 같은 경로는 하나만
  UNIQUE(project_id, path)
);

-- ----------------------------------------------------------------------------
-- code_analysis_log: 분석 실행 로그
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS code_analysis_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id TEXT NOT NULL,

  -- 분석 통계
  total_files INTEGER NOT NULL,
  stats JSONB NOT NULL,  -- byType: { route: 10, component: 20, ... }
  parse_errors TEXT[] DEFAULT '{}',

  -- 분석 시간
  analyzed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- Indexes
-- ----------------------------------------------------------------------------

-- code_index 검색 최적화
CREATE INDEX IF NOT EXISTS idx_code_index_project_id ON code_index(project_id);
CREATE INDEX IF NOT EXISTS idx_code_index_file_type ON code_index(file_type);
CREATE INDEX IF NOT EXISTS idx_code_index_name ON code_index(name);
CREATE INDEX IF NOT EXISTS idx_code_index_keywords ON code_index USING GIN(keywords);
CREATE INDEX IF NOT EXISTS idx_code_index_search_text ON code_index USING GIN(to_tsvector('simple', search_text));

-- code_analysis_log 조회 최적화
CREATE INDEX IF NOT EXISTS idx_code_analysis_log_project_id ON code_analysis_log(project_id);
CREATE INDEX IF NOT EXISTS idx_code_analysis_log_analyzed_at ON code_analysis_log(analyzed_at DESC);

-- ----------------------------------------------------------------------------
-- Triggers
-- ----------------------------------------------------------------------------

-- updated_at 자동 갱신
CREATE OR REPLACE FUNCTION update_code_index_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_code_index_updated_at ON code_index;
CREATE TRIGGER trigger_update_code_index_updated_at
  BEFORE UPDATE ON code_index
  FOR EACH ROW
  EXECUTE FUNCTION update_code_index_updated_at();

-- ----------------------------------------------------------------------------
-- Comments
-- ----------------------------------------------------------------------------

COMMENT ON TABLE code_index IS '프로젝트 코드 파일 메타데이터 인덱스 (metadatafy)';
COMMENT ON TABLE code_analysis_log IS '코드 분석 실행 로그';

COMMENT ON COLUMN code_index.id IS '파일 고유 ID (projectId + path 해시)';
COMMENT ON COLUMN code_index.project_id IS '프로젝트 식별자';
COMMENT ON COLUMN code_index.file_type IS '파일 타입 (route, component, hook, service, api, table, utility)';
COMMENT ON COLUMN code_index.name IS '파일/컴포넌트 이름';
COMMENT ON COLUMN code_index.path IS '프로젝트 루트 기준 상대 경로';
COMMENT ON COLUMN code_index.keywords IS '검색 키워드 배열';
COMMENT ON COLUMN code_index.search_text IS '전문 검색용 텍스트';
COMMENT ON COLUMN code_index.calls IS '이 파일이 호출하는 다른 파일 경로들';
COMMENT ON COLUMN code_index.called_by IS '이 파일을 호출하는 다른 파일 경로들';
COMMENT ON COLUMN code_index.metadata IS '추가 메타데이터 (exports, props, routePath, httpMethods 등)';
