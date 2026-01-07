import type { PluginConfig, FileType } from './types';

/**
 * 폴더 이름 패턴 -> FileType 매핑
 * 폴더 경로의 어느 위치에든 이 이름이 포함되면 해당 타입으로 분류
 */
export const FOLDER_NAME_TYPE_MAPPING: Record<string, FileType> = {
  // Components (복수/단수 모두 지원)
  components: 'component',
  component: 'component',
  ui: 'component',
  widgets: 'component',
  widget: 'component',
  elements: 'component',

  // Hooks (복수/단수 모두 지원)
  hooks: 'hook',
  hook: 'hook',
  composables: 'hook', // Vue 스타일

  // Services (복수/단수 모두 지원)
  services: 'service',
  service: 'service',
  api: 'service', // api 폴더가 서비스 역할을 할 때

  // Utilities (다양한 네이밍 컨벤션 지원)
  utils: 'utility',
  util: 'utility',
  utilities: 'utility',
  utility: 'utility',
  lib: 'utility',
  libs: 'utility',
  helpers: 'utility',
  helper: 'utility',
  common: 'utility',
  shared: 'utility',
};

/**
 * 파일 이름 패턴 -> FileType 매핑 (라우트 및 특수 파일용)
 */
export const FILE_NAME_TYPE_MAPPING: Record<string, FileType> = {
  // Next.js App Router 특수 파일
  'page.tsx': 'route',
  'page.ts': 'route',
  'page.jsx': 'route',
  'page.js': 'route',
  'layout.tsx': 'route',
  'layout.ts': 'route',
  'layout.jsx': 'route',
  'layout.js': 'route',
  'route.tsx': 'api',
  'route.ts': 'api',
  'route.js': 'api',
};

/**
 * 폴더 경로 패턴 -> FileType 매핑 (경로에 특정 세그먼트가 포함되면 해당 타입)
 */
export const PATH_SEGMENT_TYPE_MAPPING: Record<string, FileType> = {
  // API 경로 (app/api 또는 pages/api 내부의 모든 파일)
  '/api/': 'api',
};

/**
 * SQL 마이그레이션 패턴
 */
export const SQL_MIGRATION_PATTERNS = [
  'supabase/migrations',
  'prisma/migrations',
  'migrations',
  'db/migrations',
  'database/migrations',
];

/**
 * 파일명 패턴 기반 타입 감지 규칙
 * 폴더 구조와 관계없이 파일명 네이밍 컨벤션으로 타입 결정
 */
export interface FileNamePatternRule {
  pattern: RegExp;
  type: FileType;
  description: string;
}

export const FILE_NAME_PATTERN_RULES: FileNamePatternRule[] = [
  // Hooks: use로 시작하는 파일 (useAuth.ts, useData.tsx 등)
  {
    pattern: /^use[A-Z][a-zA-Z0-9]*\.(ts|tsx|js|jsx)$/,
    type: 'hook',
    description: 'React hook (use*.ts)',
  },

  // Services: .service.ts 또는 Service.ts로 끝나는 파일
  {
    pattern: /\.(service|Service)\.(ts|js)$/,
    type: 'service',
    description: 'Service file (*.service.ts)',
  },
  {
    pattern: /[A-Z][a-zA-Z0-9]*Service\.(ts|js)$/,
    type: 'service',
    description: 'Service class file (*Service.ts)',
  },

  // API/Actions: .action.ts, .api.ts 패턴
  {
    pattern: /\.(action|actions|api)\.(ts|js)$/,
    type: 'api',
    description: 'API/Action file (*.action.ts, *.api.ts)',
  },

  // Utilities: .util.ts, .helper.ts, .utils.ts 패턴
  {
    pattern: /\.(util|utils|helper|helpers)\.(ts|js)$/,
    type: 'utility',
    description: 'Utility file (*.util.ts, *.helper.ts)',
  },

  // Components: .component.tsx 패턴
  {
    pattern: /\.component\.(tsx|jsx)$/,
    type: 'component',
    description: 'Component file (*.component.tsx)',
  },
];

/**
 * 파일명에서 확장자를 제거한 이름 추출
 */
function getNameWithoutExt(fileName: string): string {
  return fileName.replace(/\.(tsx|jsx|ts|js)$/, '');
}

/**
 * 파일명을 정규화하여 단어 배열로 분리
 * PascalCase, camelCase, kebab-case, snake_case 모두 지원
 */
export function normalizeFileName(fileName: string): string[] {
  const nameWithoutExt = getNameWithoutExt(fileName);

  // 1. kebab-case 및 snake_case 분리 (-와 _ 기준)
  // 2. PascalCase/camelCase 분리 (대문자 기준)
  return nameWithoutExt
    .split(/[-_]/) // kebab-case, snake_case 분리
    .flatMap((part) =>
      // camelCase/PascalCase 분리: 대문자 앞에서 분리
      part.split(/(?=[A-Z])/).filter((s) => s.length > 0)
    )
    .map((s) => s.toLowerCase())
    .filter((s) => s.length > 0);
}

/**
 * 파일명 패턴으로 타입 감지
 */
export function detectTypeByFileName(fileName: string): FileType | null {
  // 1. 정의된 패턴 규칙 확인 (정확한 패턴 매칭)
  for (const rule of FILE_NAME_PATTERN_RULES) {
    if (rule.pattern.test(fileName)) {
      return rule.type;
    }
  }

  // 2. 정규화된 파일명으로 추가 감지
  const words = normalizeFileName(fileName);
  const nameWithoutExt = getNameWithoutExt(fileName);

  // Hook 감지: use로 시작 (모든 케이스)
  // use-auth, use_auth, useAuth 등
  if (words[0] === 'use' && words.length > 1) {
    return 'hook';
  }

  // Service 감지: service로 끝남 (모든 케이스)
  // auth-service, auth_service, AuthService, auth.service 등
  if (words[words.length - 1] === 'service') {
    return 'service';
  }

  // Utility 감지: util, utils, helper, helpers로 끝남
  const lastWord = words[words.length - 1];
  if (['util', 'utils', 'helper', 'helpers'].includes(lastWord)) {
    return 'utility';
  }

  // API/Action 감지: action, actions, api로 끝남
  if (['action', 'actions', 'api'].includes(lastWord)) {
    return 'api';
  }

  // Component 감지: component로 끝남
  if (lastWord === 'component') {
    return 'component';
  }

  return null;
}

/**
 * .tsx/.jsx 파일을 컴포넌트로 감지 (React 컴포넌트 휴리스틱)
 * - PascalCase: Button.tsx, AuthModal.tsx
 * - kebab-case: button.tsx, auth-modal.tsx
 * - snake_case: auth_modal.tsx
 *
 * 단, index, page, layout, route 등 특수 파일은 제외
 */
export function detectComponentByNaming(fileName: string): boolean {
  const ext = fileName.match(/\.(tsx|jsx)$/);
  if (!ext) return false;

  const nameWithoutExt = getNameWithoutExt(fileName);

  // 특수 파일 제외
  const specialFiles = ['index', 'page', 'layout', 'route', 'loading', 'error', 'not-found', 'template'];
  if (specialFiles.includes(nameWithoutExt.toLowerCase())) {
    return false;
  }

  // .tsx/.jsx 파일은 기본적으로 컴포넌트로 간주
  // (다른 감지 규칙에서 이미 걸러지지 않은 경우)
  return true;
}

/**
 * 기본 파일 타입 매핑 (glob 패턴 -> FileType)
 * @deprecated 폴더 기반 자동 감지를 사용하세요. 이 매핑은 하위 호환성을 위해 유지됩니다.
 */
export const DEFAULT_FILE_TYPE_MAPPING: Record<string, FileType> = {
  // Next.js App Router (src 포함)
  'app/**/page.tsx': 'route',
  'app/**/page.ts': 'route',
  'app/**/layout.tsx': 'route',
  'app/**/layout.ts': 'route',
  'app/**/route.tsx': 'api',
  'app/**/route.ts': 'api',
  'app/api/**/*.ts': 'api',
  'app/api/**/*.tsx': 'api',
  'src/app/**/page.tsx': 'route',
  'src/app/**/page.ts': 'route',
  'src/app/**/layout.tsx': 'route',
  'src/app/**/layout.ts': 'route',
  'src/app/**/route.tsx': 'api',
  'src/app/**/route.ts': 'api',
  'src/app/api/**/*.ts': 'api',
  'src/app/api/**/*.tsx': 'api',

  // Pages Router (레거시, src 포함)
  'pages/**/*.tsx': 'route',
  'pages/**/*.ts': 'route',
  'pages/api/**/*.ts': 'api',
  'src/pages/**/*.tsx': 'route',
  'src/pages/**/*.ts': 'route',
  'src/pages/api/**/*.ts': 'api',

  // Database
  'supabase/migrations/*.sql': 'table',
  'prisma/migrations/**/*.sql': 'table',
};

/**
 * 기본 포함 패턴
 */
export const DEFAULT_INCLUDE_PATTERNS = [
  'app/**/*.{ts,tsx}',
  'pages/**/*.{ts,tsx}',
  'components/**/*.{ts,tsx}',
  'hooks/**/*.{ts,tsx}',
  'services/**/*.ts',
  'lib/**/*.ts',
  'utils/**/*.ts',
  'src/**/*.{ts,tsx}',
  'supabase/migrations/*.sql',
];

/**
 * 기본 제외 패턴
 */
export const DEFAULT_EXCLUDE_PATTERNS = [
  '**/node_modules/**',
  '**/.next/**',
  '**/dist/**',
  '**/*.test.{ts,tsx}',
  '**/*.spec.{ts,tsx}',
  '**/__tests__/**',
  '**/*.d.ts',
  '**/coverage/**',
];

/**
 * 기본 설정으로 PluginConfig 생성
 */
export function createDefaultConfig(
  overrides: Partial<PluginConfig> = {}
): PluginConfig {
  return {
    projectId: overrides.projectId || 'default',
    include: overrides.include || DEFAULT_INCLUDE_PATTERNS,
    exclude: overrides.exclude || DEFAULT_EXCLUDE_PATTERNS,
    fileTypeMapping: {
      ...DEFAULT_FILE_TYPE_MAPPING,
      ...overrides.fileTypeMapping,
    },
    output: {
      file: {
        enabled: true,
        path: 'project-metadata.json',
        ...overrides.output?.file,
      },
      api: {
        enabled: false,
        endpoint: '',
        ...overrides.output?.api,
      },
    },
    koreanKeywords: overrides.koreanKeywords,
    mode: overrides.mode || 'production',
    verbose: overrides.verbose || false,
  };
}

/**
 * 설정 유효성 검증
 */
export function validateConfig(config: PluginConfig): string[] {
  const errors: string[] = [];

  if (!config.projectId) {
    errors.push('projectId is required');
  }

  if (config.output.api?.enabled && !config.output.api.endpoint) {
    errors.push('API endpoint is required when api output is enabled');
  }

  if (config.include.length === 0) {
    errors.push('At least one include pattern is required');
  }

  return errors;
}

/**
 * glob 패턴을 정규식으로 변환
 */
export function globToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '{{GLOBSTAR}}')
    .replace(/\*/g, '[^/]*')
    .replace(/{{GLOBSTAR}}/g, '.*')
    .replace(/\{([^}]+)\}/g, (_, group) => {
      const alternatives = group.split(',').map((s: string) => s.trim());
      return `(${alternatives.join('|')})`;
    });
  return new RegExp(`^${escaped}$`);
}
