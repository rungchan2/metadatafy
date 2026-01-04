# metadatafy

A build plugin for extracting project metadata from your codebase. Supports Vite, Next.js, and CLI usage.

코드베이스에서 프로젝트 메타데이터를 추출하는 빌드 플러그인입니다. Vite, Next.js, CLI를 지원합니다.

## Features / 기능

- **AST-based analysis** - Parses TypeScript/JavaScript files using TypeScript compiler API
- **Import/Export extraction** - Tracks file dependencies and call graphs
- **Component props detection** - Extracts React component props
- **Korean keyword mapping** - Automatic English-Korean keyword translation
- **Multiple output formats** - JSON file or API endpoint

---

- **AST 기반 분석** - TypeScript 컴파일러 API를 사용한 파일 파싱
- **Import/Export 추출** - 파일 의존성 및 호출 그래프 추적
- **컴포넌트 Props 감지** - React 컴포넌트 props 추출
- **한글 키워드 매핑** - 영어-한글 키워드 자동 변환
- **다양한 출력 형식** - JSON 파일 또는 API 엔드포인트

## Installation / 설치

```bash
npm install metadatafy
# or
yarn add metadatafy
# or
pnpm add metadatafy
```

## Quick Start / 빠른 시작

The easiest way to get started is with the interactive setup wizard:

가장 쉽게 시작하는 방법은 인터랙티브 설정 마법사를 사용하는 것입니다:

```bash
npx metadatafy init
```

This will:
- Auto-detect your project type (Next.js, Vite, CRA, etc.)
- Detect your package manager (npm, yarn, pnpm)
- Create a `metadata.config.json` with optimized settings
- Optionally add the plugin to your build config (vite.config.ts or next.config.js)
- Optionally configure Supabase integration for automatic uploads

이 명령어는:
- 프로젝트 타입 자동 감지 (Next.js, Vite, CRA 등)
- 패키지 매니저 감지 (npm, yarn, pnpm)
- 최적화된 설정으로 `metadata.config.json` 생성
- 선택적으로 빌드 설정에 플러그인 추가 (vite.config.ts 또는 next.config.js)
- 선택적으로 Supabase 연동 설정 (자동 업로드)

```
$ npx metadatafy init

🚀 metadatafy 설정 마법사

프로젝트: my-app
경로: /Users/you/projects/my-app

🔍 프로젝트 분석 중...

✅ 감지된 정보:
   프로젝트 타입: Next.js (App Router)
   패키지 매니저: pnpm
   TypeScript: 예
   주요 폴더: app, components, hooks, lib

📦 프로젝트 타입을 선택하세요:
  1) Next.js (App Router) (감지됨)
  2) Next.js (Pages Router)
  3) Vite + React
  4) Create React App
  5) Node.js Backend

선택 [1]:
```

## Usage / 사용법

### CLI

```bash
# Interactive setup (recommended for new projects)
# 인터랙티브 설정 (새 프로젝트에 권장)
npx metadatafy init

# Analyze project and generate metadata (file only)
# 프로젝트 분석 및 메타데이터 생성 (파일만)
npx metadatafy analyze

# Analyze + upload to database
# 분석 + 데이터베이스 업로드
npx metadatafy analyze --upload

# Analyze without DB upload (even if configured)
# 분석만 (DB 업로드 스킵)
npx metadatafy analyze --no-upload

# Upload existing metadata file to database
# 기존 메타데이터 파일을 DB에 업로드
npx metadatafy upload

# With options / 옵션과 함께
npx metadatafy analyze --project-id my-project --output ./metadata.json --verbose
```

#### CLI Commands / CLI 명령어

| Command | Description |
|---------|-------------|
| `init` | Interactive setup wizard / 인터랙티브 설정 마법사 |
| `analyze` | Analyze project and generate metadata / 프로젝트 분석 및 메타데이터 생성 |
| `upload` | Upload existing metadata file to database / 기존 메타데이터 파일을 DB에 업로드 |
| `database-init` | Database connection setup (Supabase, etc.) / 데이터베이스 연동 설정 |

#### Analyze Options / Analyze 옵션

| Option | Short | Description |
|--------|-------|-------------|
| `--project-id` | `-p` | Project ID (default: folder name) |
| `--output` | `-o` | Output file path (default: project-metadata.json) |
| `--config` | `-c` | Config file path |
| `--upload` | | Force DB upload / DB 업로드 강제 실행 |
| `--no-upload` | | Skip DB upload / DB 업로드 스킵 |
| `--verbose` | | Enable detailed logging |
| `--help` | `-h` | Show help |

#### Upload Options / Upload 옵션

| Option | Short | Description |
|--------|-------|-------------|
| `--input` | `-i` | Input file path (default: project-metadata.json) |
| `--config` | `-c` | Config file path |
| `--verbose` | | Enable detailed logging |
| `--help` | `-h` | Show help |

### Vite Plugin

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import { metadataPlugin } from 'metadatafy/vite';

export default defineConfig({
  plugins: [
    metadataPlugin({
      projectId: 'my-project',
      output: {
        file: {
          enabled: true,
          path: 'project-metadata.json',
        },
      },
    }),
  ],
});
```

### Next.js Plugin

#### Next.js 16+ (Turbopack) - Recommended

Next.js 16부터 Turbopack이 기본 번들러입니다. Turbopack은 Webpack 플러그인을 지원하지 않으므로, Build Adapter 방식을 사용합니다.

Since Next.js 16, Turbopack is the default bundler. Since Turbopack doesn't support Webpack plugins, use the Build Adapter approach.

**Step 1: Create adapter file / 어댑터 파일 생성**

```javascript
// metadata-adapter.js
const { createMetadataAdapter } = require('metadatafy/next');

module.exports = createMetadataAdapter({
  projectId: 'my-project',
  verbose: true,
  output: {
    file: { enabled: true, path: 'project-metadata.json' },
  },
});
```

**Step 2: Configure next.config / next.config 설정**

```typescript
// next.config.ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    adapterPath: require.resolve('./metadata-adapter.js'),
  },
};

export default nextConfig;
```

#### Next.js 15 or Earlier (Webpack)

For Next.js 15 or earlier, or when using `--webpack` flag:

Next.js 15 이하 또는 `--webpack` 플래그 사용 시:

```javascript
// next.config.js
const { withMetadata } = require('metadatafy/next');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // your config
};

module.exports = withMetadata({
  projectId: 'my-project',
})(nextConfig);
```

#### Alternative: CLI with npm scripts / 대안: npm 스크립트와 CLI

Works with any Next.js version / 모든 Next.js 버전에서 동작:

```json
{
  "scripts": {
    "build": "next build",
    "build:with-metadata": "next build && metadatafy analyze",
    "metadata": "metadatafy analyze"
  }
}
```

## Configuration / 설정

Create `metadata.config.json` in your project root:

프로젝트 루트에 `metadata.config.json` 파일을 생성하세요:

```json
{
  "projectId": "my-project",
  "include": [
    "app/**/*.{ts,tsx}",
    "components/**/*.{ts,tsx}",
    "hooks/**/*.{ts,tsx}",
    "services/**/*.ts",
    "lib/**/*.ts"
  ],
  "exclude": [
    "**/node_modules/**",
    "**/*.test.{ts,tsx}",
    "**/*.spec.{ts,tsx}"
  ],
  "output": {
    "file": {
      "enabled": true,
      "path": "project-metadata.json"
    },
    "api": {
      "enabled": false,
      "endpoint": "https://your-api.com/metadata",
      "headers": {
        "Authorization": "Bearer YOUR_TOKEN"
      }
    }
  },
  "koreanKeywords": {
    "attendance": ["출석", "출결"],
    "student": ["학생", "수강생"]
  },
  "verbose": false
}
```

## Output Format / 출력 형식

```json
{
  "version": "1.0.0",
  "projectId": "my-project",
  "generatedAt": "2025-01-04T12:00:00Z",
  "stats": {
    "totalFiles": 150,
    "byType": {
      "route": 15,
      "component": 80,
      "hook": 20,
      "service": 10,
      "api": 5,
      "table": 8,
      "utility": 12
    }
  },
  "items": [
    {
      "id": "abc123",
      "type": "component",
      "name": "AttendanceModal",
      "path": "components/attendance/AttendanceModal.tsx",
      "keywords": ["attendance", "modal", "출석", "모달"],
      "searchText": "attendancemodal components attendance ...",
      "calls": ["hooks/useAttendance.ts", "services/attendanceService.ts"],
      "calledBy": ["app/attendance/page.tsx"],
      "metadata": {
        "exports": ["AttendanceModal"],
        "props": ["isOpen", "onClose", "studentId"]
      }
    }
  ]
}
```

## File Type Detection / 파일 타입 감지

| Pattern | Type |
|---------|------|
| `app/**/page.tsx` | route |
| `app/**/route.ts` | api |
| `components/**/*.tsx` | component |
| `hooks/**/*.ts` | hook |
| `services/**/*.ts` | service |
| `lib/**/*.ts` | utility |
| `supabase/migrations/*.sql` | table |

## API / 프로그래밍 방식 사용

```typescript
import { ProjectAnalyzer, createDefaultConfig } from 'metadatafy';

const config = createDefaultConfig({
  projectId: 'my-project',
  verbose: true,
});

const analyzer = new ProjectAnalyzer(config);
const result = await analyzer.analyze(process.cwd());

console.log(result.stats);
console.log(result.items);
```

## Korean Keyword Mapping / 한글 키워드 매핑

Built-in mappings include common development terms:

기본 제공되는 매핑에는 일반적인 개발 용어가 포함됩니다:

| English | Korean |
|---------|--------|
| create | 생성, 만들기, 추가 |
| update | 수정, 업데이트, 변경 |
| delete | 삭제, 제거 |
| search | 검색, 찾기 |
| login | 로그인 |
| user | 사용자, 유저, 회원 |
| button | 버튼 |
| modal | 모달, 팝업 |
| ... | ... |

You can extend with custom mappings in config.

설정에서 커스텀 매핑을 추가할 수 있습니다.

## Database Integration / 데이터베이스 연동

Automatically upload metadata to Supabase on every build. Uses Service Role Key for RLS bypass.

빌드할 때마다 자동으로 Supabase에 메타데이터를 업로드합니다. Service Role Key를 사용하여 RLS를 우회합니다.

### Setup with init / init으로 설정

The easiest way is through `npx metadatafy init`:

가장 쉬운 방법은 `npx metadatafy init`을 사용하는 것입니다:

```
🗄️  Supabase에 메타데이터를 자동 저장할까요?
  빌드 시 자동으로 데이터베이스에 업로드됩니다.

Supabase 연동 설정? [y/N]: y

🔧 Supabase 설정
Settings > API에서 확인할 수 있습니다.

💡 환경변수 이름을 입력하면 ${VAR} 형식으로 저장됩니다.
   예: SUPABASE_URL → ${SUPABASE_URL}

Supabase URL 환경변수 이름 [SUPABASE_URL]:
Service Role Key 환경변수 이름 [SUPABASE_SERVICE_ROLE_KEY]:
테이블 이름 [project_metadata]:
```

### Manual Setup / 수동 설정

Or use the dedicated command:

또는 전용 명령어를 사용하세요:

```bash
npx metadatafy database-init
```

### Direct Plugin Configuration / 플러그인 직접 설정

You can also pass Supabase config directly to the plugin:

플러그인에 직접 Supabase 설정을 전달할 수도 있습니다:

```typescript
// vite.config.ts
import metadatafy from 'metadatafy/vite';

export default defineConfig({
  plugins: [
    metadatafy({
      projectId: 'my-project',
      supabase: {
        url: process.env.SUPABASE_URL!,
        serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
        tableName: 'project_metadata',
      },
    }),
  ],
});
```

```typescript
// next.config.ts
import { withMetadata } from 'metadatafy/next';

export default withMetadata({
  projectId: 'my-project',
  supabase: {
    url: process.env.SUPABASE_URL!,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
    tableName: 'project_metadata',
  },
})(nextConfig);
```

### Supabase Table Schema / Supabase 테이블 스키마

```sql
CREATE TABLE project_metadata (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id TEXT UNIQUE NOT NULL,
  metadata JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS Policy (optional - Service Role Key bypasses RLS)
ALTER TABLE project_metadata ENABLE ROW LEVEL SECURITY;
```

### Environment Variables / 환경변수

Add to your `.env` file:

`.env` 파일에 추가하세요:

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

> **Note**: Service Role Key is used (not anon key) to bypass RLS and ensure reliable upserts.
>
> **참고**: RLS 우회 및 안정적인 upsert를 위해 Service Role Key를 사용합니다 (anon key가 아님).

### How It Works / 작동 방식

- **Upsert by project_id**: If a record with the same `project_id` exists, it updates. Otherwise, it creates a new record.
- **Automatic on build**: When using Vite/Next.js plugins with Supabase config, metadata is uploaded on every build.
- **CLI support**: `npx metadatafy analyze` also uploads if database config is in `metadata.config.json`.

- **project_id 기준 upsert**: 동일한 `project_id`가 있으면 업데이트, 없으면 새로 생성합니다.
- **빌드 시 자동 업로드**: Vite/Next.js 플러그인에 Supabase 설정이 있으면 빌드마다 자동 업로드됩니다.
- **CLI 지원**: `npx metadatafy analyze --upload`로 DB에 업로드합니다.

### Recommended Workflow / 권장 워크플로우

Build and metadata generation are separate. Run manually or add to CI.

빌드와 메타데이터 생성은 분리되어 있습니다. 수동으로 실행하거나 CI에 추가하세요.

```bash
# Regular build (unchanged)
# 일반 빌드 (변경 없음)
npm run build

# Generate metadata + upload (when needed)
# 메타데이터 생성 + 업로드 (필요할 때)
npx metadatafy analyze --upload

# Or upload existing file only
# 또는 기존 파일만 업로드
npx metadatafy upload
```

**For CI / GitHub Actions:**

```yaml
- run: npm run build
- run: npx metadatafy analyze --upload
  env:
    SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
    SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
```

## License / 라이선스

MIT

## Contributing / 기여

Issues and pull requests are welcome!

이슈와 풀 리퀘스트를 환영합니다!

GitHub: https://github.com/rungchan2/metadatafy
