# 티켓 자동 분석 시스템 PRD

## Product Requirements Document

**문서 버전**: 1.0  
**작성일**: 2025년 1월  
**상태**: Draft

---

## 1. 개요

### 1.1 배경

외주 개발사에서 클라이언트로부터 받는 요청(티켓)은 대부분 비기술적인 언어로 작성됩니다.

```
"출석 처리 완료되었음에도 학부모에게 메시지 발송 되지 않고 있음"
"유저 로그인 안 되는 오류"
"교재 수정에서 할당한 PPT 삭제되지 않는 오류"
```

개발자는 이러한 요청을 받으면:
1. 어떤 페이지/기능인지 파악
2. 관련 코드 파일 찾기
3. 수정 범위 결정
4. 실제 개발 착수

**1~3 단계에 상당한 시간이 소요**되며, 프로젝트가 많아질수록 컨텍스트 스위칭 비용이 증가합니다.

### 1.2 목표

티켓 생성 시 **자동으로 기술 분석**을 수행하여:
- 클라이언트 언어 → 기술 키워드 변환
- 관련 코드 파일 자동 식별
- 수정 범위 카테고리 분류
- 개발자가 바로 작업에 착수할 수 있도록 지원

### 1.3 핵심 원칙

| 원칙 | 설명 |
|------|------|
| **AI Completion만 사용** | Agent(다중 호출, 도구 사용) 없이 단순 1회 호출로 처리 |
| **메타데이터 기반** | AI가 전체 코드를 읽지 않고, 미리 인덱싱된 메타데이터만 참조 |
| **점진적 학습** | 티켓 완료 시 실제 수정 파일과 비교하여 정확도 개선 |
| **프로젝트별 독립** | 각 프로젝트의 용어/구조가 다름을 인정하고 독립적으로 관리 |

### 1.4 성공 지표

| 지표 | 목표 |
|------|------|
| 분석 정확도 (관련 파일 적중률) | 70% 이상 |
| 분석 소요 시간 | 5초 이내 |
| AI 비용 | $0.01/티켓 이하 |
| 개발자 컨텍스트 파악 시간 단축 | 50% |

---

## 2. 운영 환경

### 2.1 프로젝트 특성

| 항목 | 현황 |
|------|------|
| 레포 구조 | 멀티레포 (프로젝트별 별도 레포) |
| 기술 스택 | Next.js + Supabase (주), React Vite, Hono 백엔드 (일부) |
| 프로젝트 규모 | 중형 위주 (1~5만 줄), 대형 2개 (5만+ 줄) |
| 동시 운영 프로젝트 | ~5개, 점진적 증가 예상 |

### 2.2 티켓 현황

| 항목 | 현황 |
|------|------|
| 일일 티켓 생성 | ~20개 (3개 프로젝트 기준) |
| 티켓 생성 주체 | 개발자 50%, 미팅 후 정리 50% (향후 클라이언트 직접 생성 추가) |
| 주요 티켓 유형 | 버그/오류 수정, 기능 추가, UI 수정 |

### 2.3 코드 변경 빈도

| 환경 | 빈도 |
|------|------|
| 개발 단계 | main 5회/일, dev 10회/일 |
| 유지보수 단계 | 10회/주 |

---

## 3. 시스템 아키텍처

### 3.1 전체 구조

```
┌─────────────────────────────────────────────────────────────────┐
│                    Phase A: 인덱싱 (오프라인)                    │
│                    PR 머지 시 자동 실행                          │
└─────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────┐
│                    코드 메타데이터 저장소                        │
│                    (code_index, project_terms)                  │
└─────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Phase B: 티켓 분석 (실시간)                   │
│                    티켓 생성 시 자동 실행                        │
└─────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Phase C: 학습 (백그라운드)                    │
│                    티켓 완료 시 피드백 수집                      │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 데이터 흐름

```
┌─────────────┐     PR 머지      ┌─────────────┐
│   GitHub    │ ───────────────→ │  인덱싱     │
│   레포      │   (Webhook)      │  파이프라인  │
└─────────────┘                  └──────┬──────┘
                                        │
                                        ▼
                                 ┌─────────────┐
                                 │ code_index  │
                                 │ (Supabase)  │
                                 └──────┬──────┘
                                        │
       티켓 생성                        │ 검색
           │                            │
           ▼                            ▼
    ┌─────────────┐              ┌─────────────┐
    │   티켓      │ ───────────→ │  분석 API   │
    │   내용      │              │  (AI 호출)  │
    └─────────────┘              └──────┬──────┘
                                        │
                                        ▼
                                 ┌─────────────┐
                                 │  분석 결과  │
                                 │  (UI 표시)  │
                                 └──────┬──────┘
                                        │
       티켓 완료                        │
           │                            │
           ▼                            ▼
    ┌─────────────┐              ┌─────────────┐
    │  실제 수정  │ ───────────→ │   학습      │
    │  파일 (PR)  │   피드백     │  (용어 갱신) │
    └─────────────┘              └─────────────┘
```

---

## 4. Phase A: 코드 인덱싱

### 4.1 목적

코드베이스를 검색 가능한 메타데이터로 변환하여 저장합니다.  
**AI가 전체 코드를 읽지 않고도** 관련 파일을 찾을 수 있게 합니다.

### 4.2 트리거 시점

| 시점 | 설명 |
|------|------|
| PR 머지 시 | GitHub Webhook으로 main/dev 머지 감지 |
| 프로젝트 등록 시 | 최초 1회 전체 인덱싱 |
| 수동 트리거 | 관리자 "재인덱싱" 버튼 |

### 4.3 메타데이터 추출 전략

#### MVP 단계: 파일 스캔

```
대상 파일:
- app/**/page.tsx, layout.tsx (라우트)
- components/**/*.tsx (컴포넌트)
- hooks/**/*.ts (훅)
- services/**/*.ts (서비스)
- lib/**/*.ts (유틸리티)
- supabase/migrations/*.sql (테이블 구조)

추출 정보:
- 파일 경로, 이름
- export된 함수/컴포넌트명
- import 관계 (기본 파싱)
```

#### 향후 단계: 빌드 플러그인

```
개념:
- Vite/Next.js 빌드 플러그인으로 컴파일러 옆에서 메타데이터 생성
- 컴파일러가 이미 파싱한 정보를 활용
- 컨벤션 차이에 무관하게 정확한 정보 추출

출력:
project-metadata.json 자동 생성
```

### 4.4 키워드 생성

파일/함수명에서 검색용 키워드를 자동 생성합니다.

```
"AttendanceCheckModal.tsx"
        ↓
["attendance", "check", "modal", "출석", "체크", "모달"]

변환 규칙:
- camelCase/PascalCase → 단어 분리
- 영어 → 한글 기본 동의어 매핑
- 프로젝트별 용어 사전 참조
```

### 4.5 저장 구조

```typescript
interface CodeIndexItem {
  id: string
  projectId: string
  
  // 기본 정보
  type: 'route' | 'component' | 'hook' | 'service' | 'api' | 'table'
  name: string           // "AttendanceCheckModal"
  path: string           // "components/attendance/AttendanceCheckModal.tsx"
  
  // 검색용
  keywords: string[]     // ["attendance", "check", "출석", "체크"]
  searchText: string     // 전문 검색용 통합 텍스트
  
  // 관계
  calls: string[]        // 이 파일이 호출하는 다른 함수/서비스
  calledBy: string[]     // 이 파일을 호출하는 곳
  
  // 메타
  metadata: {
    exports?: string[]
    props?: string[]
    // ...
  }
}
```

---

## 5. Phase B: 티켓 분석

### 5.1 목적

티켓 생성 시 **자동으로 분석**을 수행하여:
- 클라이언트 언어를 기술 키워드로 변환
- 관련 코드 파일 식별
- 수정 카테고리 분류
- 개발자에게 컨텍스트 제공

### 5.2 트리거 시점

| 시점 | 설명 |
|------|------|
| 티켓 생성 직후 | 자동 분석 실행 |
| 티켓 내용 수정 시 | 재분석 (선택적) |
| "다시 분석" 버튼 | 수동 재분석 |

### 5.3 분석 프로세스

```
┌─────────────────────────────────────────────────────────────────┐
│ B-1. 1차 번역 (AI Completion)                                   │
│                                                                 │
│ 입력: "출석 처리 완료되었음에도 학부모에게 메시지 발송 안 됨"    │
│                                                                 │
│ AI 프롬프트:                                                    │
│ "다음 요청에서 기술 키워드를 추출하고 문제 유형을 분류해줘"     │
│                                                                 │
│ 출력:                                                           │
│ {                                                               │
│   "keywords": ["출석", "attendance", "메시지", "notification"], │
│   "category": "side_effect_failure",                           │
│   "trigger": "출석 완료",                                       │
│   "expected_action": "메시지 발송",                             │
│   "symptom": "발송 안 됨"                                       │
│ }                                                               │
│                                                                 │
│ 비용: ~$0.001/요청                                              │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ B-2. 코드 인덱스 검색 (DB)                                      │
│                                                                 │
│ AI가 추출한 키워드로 code_index 검색                            │
│                                                                 │
│ SELECT * FROM code_index                                       │
│ WHERE project_id = ?                                           │
│ AND keywords && ARRAY['출석', '메시지', '발송', 'notification'] │
│ ORDER BY 매칭 키워드 수 DESC                                    │
│ LIMIT 10                                                        │
│                                                                 │
│ 결과: 관련 파일 후보 10개                                       │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ B-3. 결과 정제 (AI Completion)                                  │
│                                                                 │
│ 입력:                                                           │
│ - 티켓 내용                                                     │
│ - 검색된 파일 목록 10개 (경로만, 코드 내용 X)                   │
│                                                                 │
│ AI 프롬프트:                                                    │
│ "이 티켓과 가장 관련 있는 파일 3-5개를 선택하고                 │
│  각각 왜 관련 있는지 한 줄로 설명해줘"                          │
│                                                                 │
│ 출력:                                                           │
│ {                                                               │
│   "selected": [                                                 │
│     {                                                           │
│       "file": "hooks/useAttendance.ts",                        │
│       "reason": "출석 처리 후 알림 발송 로직 포함 가능성"       │
│     },                                                          │
│     {                                                           │
│       "file": "services/notificationService.ts",               │
│       "reason": "메시지 발송 서비스"                            │
│     },                                                          │
│     {                                                           │
│       "file": "lib/sms.ts",                                    │
│       "reason": "실제 SMS 발송 함수"                            │
│     }                                                           │
│   ],                                                            │
│   "suggested_action": "useAttendance 훅에서 출석 완료 후        │
│                        알림 발송 로직이 정상 호출되는지 확인"   │
│ }                                                               │
│                                                                 │
│ 비용: ~$0.002/요청                                              │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ B-4. 결과 저장 및 표시                                          │
│                                                                 │
│ ticket_analysis 테이블에 저장                                   │
│ 티켓 UI에 분석 결과 표시                                        │
└─────────────────────────────────────────────────────────────────┘
```

### 5.4 수정 카테고리

| 카테고리 | 증상 키워드 | 영향 범위 |
|---------|------------|----------|
| **UI/Style** | 색상, 크기, 간격, 폰트, 정렬 | 해당 컴포넌트 CSS/className |
| **Component Logic** | 버튼, 클릭, 동작, 안 됨 | 특정 컴포넌트 핸들러 |
| **Data Fetch** | 안 나옴, 로딩, 데이터 | hooks, services, API |
| **Side Effect** | 완료 후, 발송 안 됨, 저장 안 됨 | 후속 액션 로직 |
| **Auth** | 로그인, 권한, 접근 | middleware, auth hooks |
| **Mutation** | 삭제 안 됨, 수정 안 됨, 저장 실패 | API, 서비스 mutation |

### 5.5 비용 계산

```
티켓 1개당:
- 1차 번역 (AI): ~$0.001
- DB 검색: 무료
- 결과 정제 (AI): ~$0.002
- 합계: ~$0.003

하루 20개 티켓: $0.06
한 달: ~$1.8

→ 충분히 감당 가능한 수준
```

---

## 6. Phase C: 학습

### 6.1 목적

티켓 완료 시 **실제 수정된 파일**과 **예측 파일**을 비교하여:
- 분석 정확도 측정
- 용어 사전 자동 업데이트
- 인덱스 연관 관계 보강

### 6.2 트리거 시점

| 시점 | 설명 |
|------|------|
| 티켓 완료 시 | 상태가 "done"으로 변경될 때 |
| PR 머지 시 | 티켓과 연결된 PR이 머지될 때 |

### 6.3 학습 프로세스

```
┌─────────────────────────────────────────────────────────────────┐
│ C-1. 실제 수정 파일 수집                                        │
│                                                                 │
│ 티켓과 연결된 PR에서 수정된 파일 목록 추출                      │
│                                                                 │
│ 티켓 #123 → PR #456                                            │
│ 수정된 파일: ["hooks/useAttendance.ts", "lib/sms.ts"]          │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ C-2. 분석 정확도 계산                                           │
│                                                                 │
│ 예측: ["useAttendance.ts", "notificationService.ts"]           │
│ 실제: ["useAttendance.ts", "sms.ts"]                           │
│                                                                 │
│ 정확도: 50% (1/2 맞춤)                                          │
│ 발견: "메시지 발송"이 sms.ts와 연결됨                           │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ C-3. 용어 사전 업데이트                                         │
│                                                                 │
│ 새로운 매핑 학습:                                               │
│ "메시지 발송" → sms.ts                                         │
│                                                                 │
│ project_terms 업데이트:                                         │
│ {                                                               │
│   term: "메시지",                                              │
│   aliases: ["message", "발송", "알림", "SMS"], ← SMS 추가      │
│   mapped_to: ["notificationService", "sms"] ← sms 추가         │
│ }                                                               │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ C-4. 인덱스 연관 관계 보강                                      │
│                                                                 │
│ useAttendance.ts의 calls 업데이트:                             │
│ ["notificationService"] → ["notificationService", "sms"]       │
│                                                                 │
│ → 다음에 "출석 + 메시지" 검색 시 sms.ts도 검색됨               │
└─────────────────────────────────────────────────────────────────┘
```

---

## 7. 프로젝트별 용어 사전

### 7.1 필요성

```
프로젝트 A (Playce):
- "PL" = 지사
- "ACE" = 가맹점
- "출석" = attendance, checkin

프로젝트 B (다른 클라이언트):
- "가맹점" = franchise, store
- "출석" = attendance (checkin 없음)
```

같은 단어도 프로젝트마다 다른 코드 개념에 매핑될 수 있습니다.

### 7.2 용어 사전 구조

```typescript
interface ProjectTerm {
  id: string
  projectId: string
  
  term: string              // "출석"
  aliases: string[]         // ["attendance", "체크인", "checkin"]
  
  mappedTo: {
    routes?: string[]       // ["/attendance", "/checkin"]
    components?: string[]   // ["AttendanceModal"]
    services?: string[]     // ["attendanceService"]
    tables?: string[]       // ["attendances"]
  }
  
  source: 'manual' | 'extracted' | 'learned'
  confidence: number        // 0.0 ~ 1.0
  usageCount: number        // 매칭 횟수
}
```

### 7.3 용어 수집 소스

| 소스 | 방법 | 시점 |
|-----|------|------|
| 코드베이스 | 파일명/함수명에서 자동 추출 | 인덱싱 시 |
| 스펙 문서 | spec_documents에서 추출 | 문서 저장 시 |
| 티켓 학습 | 완료된 티켓에서 학습 | 티켓 완료 시 |
| 수동 등록 | 관리자가 직접 추가 | 수시 |

---

## 8. 데이터 모델

### 8.1 code_index (코드 인덱스)

```sql
CREATE TABLE code_index (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  
  -- 기본 정보
  type TEXT NOT NULL,  -- 'route', 'component', 'hook', 'service', 'api', 'table'
  name TEXT NOT NULL,
  path TEXT NOT NULL,
  
  -- 검색용
  keywords TEXT[] DEFAULT '{}',
  search_text TEXT,
  
  -- 관계
  calls TEXT[] DEFAULT '{}',
  called_by TEXT[] DEFAULT '{}',
  
  -- 메타
  metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스
CREATE INDEX idx_code_index_project ON code_index(project_id);
CREATE INDEX idx_code_index_keywords ON code_index USING gin(keywords);
CREATE INDEX idx_code_index_search ON code_index 
  USING gin(to_tsvector('simple', search_text));
```

### 8.2 project_terms (프로젝트 용어 사전)

```sql
CREATE TABLE project_terms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  
  term TEXT NOT NULL,
  aliases TEXT[] DEFAULT '{}',
  mapped_to JSONB DEFAULT '{}',
  
  source TEXT DEFAULT 'manual',  -- 'manual', 'extracted', 'learned'
  confidence DECIMAL DEFAULT 1.0,
  usage_count INT DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(project_id, term)
);
```

### 8.3 ticket_analysis (티켓 분석 결과)

```sql
CREATE TABLE ticket_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID REFERENCES tickets(id) ON DELETE CASCADE,
  
  -- AI 추출 결과
  detected_keywords TEXT[],
  category TEXT,
  trigger_action TEXT,
  expected_action TEXT,
  symptom TEXT,
  
  -- 검색 결과
  matched_files TEXT[],
  matched_tables TEXT[],
  suggested_action TEXT,
  
  -- 메타
  confidence DECIMAL,
  ai_assisted BOOLEAN DEFAULT true,
  
  -- 학습용 (완료 후 기록)
  actual_files TEXT[],
  accuracy DECIMAL,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 9. API 설계

### 9.1 인덱싱 API

```
# 프로젝트 인덱싱 트리거
POST /api/projects/[slug]/index
Authorization: Bearer <token>
Body: { force?: boolean }

Response:
{
  "success": true,
  "data": {
    "indexed_files": 234,
    "routes": 15,
    "components": 89,
    "hooks": 23,
    "services": 12,
    "duration_ms": 4523
  }
}
```

### 9.2 분석 API

```
# 티켓 분석 실행
POST /api/tickets/[id]/analyze
Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": {
    "category": "side_effect_failure",
    "detected_keywords": ["출석", "메시지", "발송"],
    "matched_files": [
      {
        "path": "hooks/useAttendance.ts",
        "reason": "출석 처리 후 알림 발송 로직"
      },
      {
        "path": "services/notificationService.ts",
        "reason": "메시지 발송 서비스"
      }
    ],
    "suggested_action": "useAttendance 훅에서 알림 발송 로직 확인",
    "confidence": 0.82
  }
}
```

### 9.3 GitHub Webhook

```
# PR 머지 이벤트 수신
POST /api/webhooks/github
Headers: X-Hub-Signature-256: sha256=...

Event: pull_request (action: closed, merged: true)

처리:
1. 해당 프로젝트 식별
2. 인덱싱 파이프라인 트리거
3. 연결된 티켓 있으면 학습 프로세스 실행
```

---

## 10. UI/UX

### 10.1 티켓 상세 - 분석 결과 표시

```
┌─────────────────────────────────────────────────────────────────┐
│ 티켓 #PLAY-042                                                  │
│ "출석 처리 완료되었음에도 학부모에게 메시지 발송 되지 않음"      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ 📋 기술 분석                                        [다시 분석] │
│ ───────────────────────────────────────────────────────────────│
│                                                                 │
│ 카테고리: 후속 동작 실패 (Side Effect)                         │
│ 신뢰도: 82%                                                     │
│                                                                 │
│ 🎯 트리거: 출석 완료                                            │
│ ❌ 증상: 메시지 발송 안 됨                                      │
│                                                                 │
│ 📁 관련 파일                                                    │
│ ┌─────────────────────────────────────────────────────────────┐│
│ │ hooks/useAttendance.ts                                      ││
│ │ └ 출석 처리 후 알림 발송 로직 포함 가능성                   ││
│ │                                                              ││
│ │ services/notificationService.ts                             ││
│ │ └ 메시지 발송 서비스                                        ││
│ │                                                              ││
│ │ lib/sms.ts                                                  ││
│ │ └ 실제 SMS 발송 함수                                        ││
│ └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│ 💡 수정 제안                                                    │
│ useAttendance 훅에서 출석 완료 후 알림 발송 로직이              │
│ 정상 호출되는지 확인                                            │
│                                                                 │
│ [분석 결과 수정]                                                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 10.2 프로젝트 설정 - 인덱싱 관리

```
┌─────────────────────────────────────────────────────────────────┐
│ 프로젝트 설정 > 코드 인덱싱                                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ 📊 인덱스 현황                                                  │
│ ───────────────────────────────────────────────────────────────│
│ 마지막 인덱싱: 2025-01-03 14:23                                 │
│ 인덱싱된 파일: 234개                                            │
│                                                                 │
│ 라우트: 15개                                                    │
│ 컴포넌트: 89개                                                  │
│ 훅: 23개                                                        │
│ 서비스: 12개                                                    │
│                                                                 │
│ [수동 재인덱싱]                                                 │
│                                                                 │
│ 📚 용어 사전                                           [관리]  │
│ ───────────────────────────────────────────────────────────────│
│ 등록된 용어: 45개                                               │
│ - 자동 추출: 32개                                               │
│ - 학습됨: 8개                                                   │
│ - 수동 등록: 5개                                                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 11. 개발 계획

### 11.1 MVP 범위 (2일)

#### Day 1: 인덱싱 파이프라인

| 시간 | 작업 |
|-----|------|
| 2h | DB 스키마 (code_index, project_terms, ticket_analysis) |
| 3h | 파일 스캔 스크립트 (routes, components, hooks, services) |
| 2h | 키워드 생성 로직 (camelCase 분리, 기본 한영 매핑) |
| 1h | 인덱싱 API + 수동 트리거 버튼 |

#### Day 2: 분석 + UI

| 시간 | 작업 |
|-----|------|
| 2h | 1차 번역 AI Completion (키워드 추출, 카테고리 분류) |
| 2h | 코드 인덱스 검색 + 결과 정제 AI Completion |
| 2h | 티켓 분석 API 통합 |
| 2h | 티켓 상세 UI에 분석 결과 표시 |

### 11.2 MVP 이후

| Phase | 기능 | 예상 기간 |
|-------|------|----------|
| Phase 2 | GitHub Webhook 연동 (자동 인덱싱) | 2일 |
| Phase 2 | 학습 프로세스 (티켓 완료 시 피드백) | 2일 |
| Phase 3 | 빌드 플러그인 (정확한 메타데이터) | 3일 |
| Phase 3 | 용어 사전 관리 UI | 2일 |
| Phase 4 | 분석 정확도 대시보드 | 2일 |

### 11.3 MVP 한계 (인정하고 시작)

| 한계 | MVP 대응 | 향후 개선 |
|-----|---------|----------|
| 실시간 코드 동기화 없음 | 수동 "재인덱싱" 버튼 | GitHub Webhook |
| 용어 학습 없음 | 기본 영한 매핑만 | Phase C 학습 프로세스 |
| import 관계 분석 약함 | 파일명 기반 추론 | 빌드 플러그인 |
| 한국어 형태소 분석 약함 | 단순 공백 분리 | 형태소 분석기 추가 |

---

## 12. 리스크 및 대응

| 리스크 | 영향 | 대응 방안 |
|--------|------|----------|
| AI 분석 정확도 부족 | 중 | 개발자 검토/수정 UI 제공, 학습으로 개선 |
| 인덱싱 시간 과다 (대형 프로젝트) | 낮 | 증분 인덱싱, 비동기 처리 |
| 프로젝트별 컨벤션 차이 | 중 | 빌드 플러그인으로 해결 (향후) |
| AI 비용 증가 | 낮 | Completion만 사용, 캐싱 |

---

## 13. 성공 기준

### 13.1 MVP 완료 기준

- [ ] 프로젝트 인덱싱 실행 가능 (수동)
- [ ] 티켓 생성 시 자동 분석 실행
- [ ] 분석 결과 (카테고리, 관련 파일, 제안) 표시
- [ ] 개발자가 분석 결과 수정 가능

### 13.2 1개월 후 목표

- [ ] 분석 정확도 70% 이상
- [ ] 개발자 컨텍스트 파악 시간 50% 단축
- [ ] 티켓당 AI 비용 $0.01 이하
- [ ] 3개 프로젝트에서 실사용

---

## 14. 부록

### 14.1 AI 프롬프트 예시

#### 1차 번역 프롬프트

```
당신은 소프트웨어 버그 리포트를 분석하는 전문가입니다.

다음 요청에서:
1. 기술 키워드를 추출하세요 (한글 + 영어)
2. 문제 카테고리를 분류하세요
3. 트리거 동작과 예상 동작을 식별하세요

카테고리 옵션:
- ui_style: 색상, 크기, 레이아웃 등 시각적 문제
- component_logic: 버튼, 클릭 등 UI 동작 문제
- data_fetch: 데이터가 안 나오거나 로딩 문제
- side_effect: 어떤 동작 후 후속 처리가 안 되는 문제
- auth: 로그인, 권한 문제
- mutation: 저장, 삭제, 수정이 안 되는 문제

요청:
{ticket_content}

JSON 형식으로 응답:
{
  "keywords": ["한글1", "english1", ...],
  "category": "카테고리",
  "trigger": "트리거 동작",
  "expected_action": "예상 동작",
  "symptom": "실제 증상"
}
```

#### 결과 정제 프롬프트

```
다음 버그 리포트와 가장 관련 있는 파일을 선택하세요.

버그 리포트:
{ticket_content}

추출된 정보:
- 카테고리: {category}
- 트리거: {trigger}
- 증상: {symptom}

검색된 파일 목록:
{file_list}

3-5개 파일을 선택하고, 각각 왜 관련 있는지 한 줄로 설명하세요.
마지막으로 수정 방향을 제안하세요.

JSON 형식으로 응답:
{
  "selected": [
    {"file": "경로", "reason": "이유"},
    ...
  ],
  "suggested_action": "수정 방향 제안"
}
```

### 14.2 용어 정의

| 용어 | 정의 |
|------|------|
| 인덱싱 | 코드베이스에서 메타데이터를 추출하여 검색 가능한 형태로 저장하는 과정 |
| 1차 번역 | 클라이언트 언어를 기술 키워드로 변환하는 AI 처리 |
| 결과 정제 | 검색된 파일 후보 중 가장 관련 있는 것을 선택하는 AI 처리 |
| 용어 사전 | 프로젝트별 비즈니스 용어와 코드 개념의 매핑 정보 |
| Confidence | 분석 결과의 신뢰도 (0.0 ~ 1.0) |

---

*문서 버전: 1.0*  
*최종 수정: 2025년 1월*