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

## Usage / 사용법

### CLI

```bash
# Analyze project and generate metadata
# 프로젝트 분석 및 메타데이터 생성
npx metadatafy analyze

# With options / 옵션과 함께
npx metadatafy analyze --project-id my-project --output ./metadata.json --verbose

# Generate config file / 설정 파일 생성
npx metadatafy init
```

#### CLI Options / CLI 옵션

| Option | Short | Description |
|--------|-------|-------------|
| `--project-id` | `-p` | Project ID (default: folder name) |
| `--output` | `-o` | Output file path (default: project-metadata.json) |
| `--config` | `-c` | Config file path |
| `--verbose` | | Enable detailed logging |
| `--help` | `-h` | Show help |
| `--version` | `-v` | Show version |

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

## License / 라이선스

MIT

## Contributing / 기여

Issues and pull requests are welcome!

이슈와 풀 리퀘스트를 환영합니다!

GitHub: https://github.com/rungchan2/get-metadata
