/**
 * 파일 타입 분류
 */
export type FileType =
  | 'route'
  | 'component'
  | 'hook'
  | 'service'
  | 'api'
  | 'table'
  | 'utility';

/**
 * 코드 인덱스 아이템 - 분석된 파일의 메타데이터
 */
export interface CodeIndexItem {
  id: string;
  projectId: string;
  type: FileType;
  name: string;
  path: string;
  keywords: string[];
  searchText: string;
  calls: string[];
  calledBy: string[];
  metadata: CodeMetadata;
}

export interface CodeMetadata {
  exports?: string[];
  props?: string[];
  routePath?: string;
  httpMethods?: string[];
  tableName?: string;
  columns?: TableColumn[];
}

/**
 * SQL 테이블 컬럼 정보
 */
export interface TableColumn {
  name: string;
  type: string;
  nullable: boolean;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  references?: {
    table: string;
    column: string;
  };
}

/**
 * 파싱된 파일 정보
 */
export interface ParsedFile {
  path: string;
  type: FileType;
  name: string;
  imports: ImportInfo[];
  exports: ExportInfo[];
  props?: PropInfo[];
  metadata?: CodeMetadata;
}

/**
 * import 문 정보
 */
export interface ImportInfo {
  source: string;
  specifiers: string[];
  isDefault: boolean;
  isTypeOnly: boolean;
  resolvedPath?: string;
}

/**
 * export 정보
 */
export interface ExportInfo {
  name: string;
  isDefault: boolean;
  isTypeOnly: boolean;
  kind: 'function' | 'class' | 'variable' | 'type' | 'interface';
}

/**
 * React 컴포넌트 Props 정보
 */
export interface PropInfo {
  name: string;
  type: string;
  required: boolean;
  defaultValue?: string;
}

/**
 * 플러그인 설정
 */
export interface PluginConfig {
  projectId: string;
  include: string[];
  exclude: string[];
  fileTypeMapping: Record<string, FileType>;
  output: OutputConfig;
  koreanKeywords?: Record<string, string[]>;
  mode: 'development' | 'production';
  verbose?: boolean;
}

export interface OutputConfig {
  file?: {
    enabled: boolean;
    path: string;
  };
  api?: {
    enabled: boolean;
    endpoint: string;
    headers?: Record<string, string>;
  };
  database?: DatabaseOutputConfig;
}

/**
 * 데이터베이스 출력 설정
 * 값에 ${ENV_VAR} 형식을 사용하면 환경변수에서 로드
 */
export interface DatabaseOutputConfig {
  enabled: boolean;
  provider: 'supabase' | 'custom';

  // Supabase 설정
  supabase?: {
    url: string;        // ${SUPABASE_URL} 형식 지원
    serviceRoleKey: string;    // ${SUPABASE_SERVICE_ROLE_KEY} 형식 지원
    tableName: string;
    fields: {
      projectId: string;
      metadata: string;
      createdAt?: string;
      updatedAt?: string;
    };
  };

  // Custom API 설정
  custom?: {
    endpoint: string;   // ${API_ENDPOINT} 형식 지원
    method: 'POST' | 'PUT' | 'PATCH';
    headers?: Record<string, string>;  // 값에 ${VAR} 형식 지원
  };
}

/**
 * 분석 결과
 */
export interface AnalysisResult {
  projectId: string;
  items: CodeIndexItem[];
  stats: AnalysisStats;
  timestamp: string;
}

export interface AnalysisStats {
  totalFiles: number;
  byType: Record<FileType, number>;
  parseErrors: string[];
}

/**
 * 호출 그래프 엔트리
 */
export interface CallGraphEntry {
  calls: string[];
  calledBy: string[];
}
