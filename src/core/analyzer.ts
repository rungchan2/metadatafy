import { glob } from 'glob';
import * as path from 'path';
import * as fs from 'fs/promises';
import type {
  PluginConfig,
  AnalysisResult,
  CodeIndexItem,
  ParsedFile,
  FileType,
  CallGraphEntry,
  ExportInfo,
} from './types';
import { TypeScriptParser } from './parsers/typescript-parser';
import { SQLParser } from './parsers/sql-parser';
import { ImportExtractor } from './extractors/import-extractor';
import { ExportExtractor } from './extractors/export-extractor';
import { PropsExtractor } from './extractors/props-extractor';
import { KeywordExtractor } from './extractors/keyword-extractor';
import { CallGraphBuilder } from './resolvers/call-graph-builder';
import {
  globToRegex,
  FILE_NAME_TYPE_MAPPING,
  PATH_SEGMENT_TYPE_MAPPING,
  SQL_MIGRATION_PATTERNS,
  FOLDER_NAME_TYPE_MAPPING,
} from './config';
import { generateId } from '../utils/id-utils';
import { CodePatternDetector } from './detectors/code-pattern-detector';

/**
 * 프로젝트 분석기 - 메인 오케스트레이터
 */
export class ProjectAnalyzer {
  private config: PluginConfig;
  private tsParser: TypeScriptParser;
  private sqlParser: SQLParser;
  private importExtractor: ImportExtractor;
  private exportExtractor: ExportExtractor;
  private propsExtractor: PropsExtractor;
  private keywordExtractor: KeywordExtractor;
  private callGraphBuilder: CallGraphBuilder;
  private codePatternDetector: CodePatternDetector;

  constructor(config: PluginConfig) {
    this.config = config;
    this.tsParser = new TypeScriptParser();
    this.sqlParser = new SQLParser();
    this.importExtractor = new ImportExtractor();
    this.exportExtractor = new ExportExtractor();
    this.propsExtractor = new PropsExtractor();
    this.keywordExtractor = new KeywordExtractor(config.koreanKeywords);
    this.callGraphBuilder = new CallGraphBuilder();
    this.codePatternDetector = new CodePatternDetector();
  }

  /**
   * 프로젝트 분석 실행
   */
  async analyze(rootDir: string): Promise<AnalysisResult> {
    const startTime = Date.now();
    const parseErrors: string[] = [];

    // 1. 대상 파일 수집
    const files = await this.collectFiles(rootDir);

    if (this.config.verbose) {
      console.log(`[metadata-plugin] Found ${files.length} files to analyze`);
    }

    // 2. 각 파일 파싱
    const parsedFiles: ParsedFile[] = [];

    for (const filePath of files) {
      try {
        const parsed = await this.parseFile(filePath, rootDir);
        if (parsed) {
          parsedFiles.push(parsed);
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        parseErrors.push(`${filePath}: ${errorMessage}`);
      }
    }

    // 3. 의존성 그래프 구축
    const callGraph = this.callGraphBuilder.build(parsedFiles, rootDir);

    // 4. CodeIndexItem 생성
    const items: CodeIndexItem[] = parsedFiles.map((parsed) =>
      this.createIndexItem(parsed, callGraph)
    );

    // 5. 통계 계산
    const stats = this.calculateStats(items, parseErrors);

    if (this.config.verbose) {
      console.log(
        `[metadata-plugin] Analysis completed in ${Date.now() - startTime}ms`
      );
      console.log(`[metadata-plugin] Processed ${items.length} items`);
    }

    return {
      projectId: this.config.projectId,
      items,
      stats,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * 대상 파일 수집
   */
  private async collectFiles(rootDir: string): Promise<string[]> {
    const allFiles: string[] = [];

    for (const pattern of this.config.include) {
      const matches = await glob(pattern, {
        cwd: rootDir,
        ignore: this.config.exclude,
        absolute: true,
      });
      allFiles.push(...matches);
    }

    // 중복 제거
    return [...new Set(allFiles)];
  }

  /**
   * 단일 파일 파싱
   */
  private async parseFile(
    filePath: string,
    rootDir: string
  ): Promise<ParsedFile | null> {
    const relativePath = path.relative(rootDir, filePath);
    const content = await fs.readFile(filePath, 'utf-8');
    const ext = path.extname(filePath);

    // SQL 파일 처리
    if (ext === '.sql') {
      const sqlType = this.determineFileType(relativePath);
      if (!sqlType) return null;
      return this.sqlParser.parse(content, relativePath);
    }

    // TypeScript/JavaScript 파일 처리
    const sourceFile = this.tsParser.parse(content, filePath);

    // 1. 경로/파일명 기반 타입 감지 시도
    let fileType = this.determineFileType(relativePath);

    // 2. 감지 실패 시 코드 패턴 분석으로 폴백
    if (!fileType) {
      const codeDetection = this.codePatternDetector.detect(sourceFile);
      if (codeDetection && codeDetection.confidence >= 0.4) {
        fileType = codeDetection.type;
        if (this.config.verbose) {
          console.log(
            `[metadata-plugin] 코드 분석으로 감지: ${relativePath} → ${fileType} (${(codeDetection.confidence * 100).toFixed(0)}%)`
          );
          codeDetection.reasons.forEach((r) => console.log(`  - ${r}`));
        }
      }
    }

    if (!fileType) {
      return null;
    }

    const imports = this.importExtractor.extract(sourceFile);
    const exports = this.exportExtractor.extract(sourceFile);
    const props =
      fileType === 'component'
        ? this.propsExtractor.extract(sourceFile)
        : undefined;

    return {
      path: relativePath,
      type: fileType,
      name: this.extractName(relativePath, exports),
      imports,
      exports,
      props,
    };
  }

  /**
   * 파일 타입 결정 (경로 기반 + 폴더명 기반 감지)
   *
   * 감지 우선순위:
   * 1. SQL 마이그레이션 파일
   * 2. Next.js 특수 파일 (page.tsx, layout.tsx, route.ts)
   * 3. 경로 세그먼트 (/api/)
   * 4. 폴더 이름 기반 (components/, hooks/, utils/, lib/ 등)
   * 5. 사용자 정의 glob 패턴
   * 6. pages 폴더 (Next.js Pages Router)
   *
   * 나머지는 코드 패턴 분석으로 처리 (parseFile에서 수행)
   */
  private determineFileType(relativePath: string): FileType | null {
    const normalizedPath = relativePath.replace(/\\/g, '/');
    const fileName = path.basename(normalizedPath);
    const ext = path.extname(fileName);
    const pathSegments = normalizedPath.split('/');

    // 1. SQL 파일은 마이그레이션 패턴 확인
    if (ext === '.sql') {
      for (const pattern of SQL_MIGRATION_PATTERNS) {
        if (normalizedPath.includes(pattern)) {
          return 'table';
        }
      }
      return null;
    }

    // 2. Next.js 특수 파일명 확인 (page.tsx, layout.tsx, route.ts 등)
    const fileNameType = FILE_NAME_TYPE_MAPPING[fileName];
    if (fileNameType) {
      return fileNameType;
    }

    // 3. 경로 세그먼트 확인 (예: /api/ 포함 시)
    for (const [segment, type] of Object.entries(PATH_SEGMENT_TYPE_MAPPING)) {
      if (normalizedPath.includes(segment)) {
        return type;
      }
    }

    // 4. 폴더 이름 기반 자동 감지 (components/, hooks/, utils/, lib/ 등)
    for (let i = pathSegments.length - 2; i >= 0; i--) {
      const folderName = pathSegments[i].toLowerCase();
      const folderType = FOLDER_NAME_TYPE_MAPPING[folderName];
      if (folderType) {
        return folderType;
      }
    }

    // 5. 사용자 정의 glob 패턴 확인
    const sortedPatterns = Object.entries(this.config.fileTypeMapping).sort(
      ([a], [b]) => b.length - a.length
    );

    for (const [pattern, type] of sortedPatterns) {
      const regex = globToRegex(pattern);
      if (regex.test(normalizedPath)) {
        return type;
      }
    }

    // 6. pages 폴더 내 파일은 route로 분류 (Next.js Pages Router)
    if (
      pathSegments.includes('pages') &&
      (ext === '.tsx' || ext === '.ts' || ext === '.jsx' || ext === '.js')
    ) {
      return 'route';
    }

    // 나머지는 null 반환 → 코드 패턴 분석으로 처리
    return null;
  }

  /**
   * 파일/컴포넌트 이름 추출
   */
  private extractName(relativePath: string, exports: ExportInfo[]): string {
    // default export의 이름 사용
    const defaultExport = exports.find((e) => e.isDefault);
    if (defaultExport && defaultExport.name !== 'default') {
      return defaultExport.name;
    }

    // 파일명에서 추출
    const basename = path.basename(relativePath, path.extname(relativePath));

    // index, page, layout 파일인 경우 상위 폴더명 사용
    if (['index', 'page', 'layout', 'route'].includes(basename)) {
      const dirname = path.dirname(relativePath);
      const parentName = path.basename(dirname);
      return parentName !== '.' ? parentName : basename;
    }

    return basename;
  }

  /**
   * CodeIndexItem 생성
   */
  private createIndexItem(
    parsed: ParsedFile,
    callGraph: Map<string, CallGraphEntry>
  ): CodeIndexItem {
    const graphEntry = callGraph.get(parsed.path) || {
      calls: [],
      calledBy: [],
    };

    const keywords = this.keywordExtractor.extract(
      parsed.name,
      parsed.path,
      parsed.exports.map((e) => e.name),
      parsed.props?.map((p) => p.name)
    );

    const searchText = this.buildSearchText(parsed, keywords);

    return {
      id: generateId(this.config.projectId, parsed.path),
      projectId: this.config.projectId,
      type: parsed.type,
      name: parsed.name,
      path: parsed.path,
      keywords,
      searchText,
      calls: graphEntry.calls,
      calledBy: graphEntry.calledBy,
      metadata: {
        exports: parsed.exports.map((e) => e.name),
        props: parsed.props?.map((p) => p.name),
        ...parsed.metadata,
      },
    };
  }

  /**
   * 검색용 텍스트 생성
   */
  private buildSearchText(parsed: ParsedFile, keywords: string[]): string {
    const parts = [
      parsed.name,
      parsed.path,
      ...keywords,
      ...parsed.exports.map((e) => e.name),
      ...(parsed.props?.map((p) => p.name) || []),
    ];
    return parts.join(' ').toLowerCase();
  }

  /**
   * 분석 통계 계산
   */
  private calculateStats(
    items: CodeIndexItem[],
    parseErrors: string[]
  ): AnalysisResult['stats'] {
    const byType: Record<FileType, number> = {
      route: 0,
      component: 0,
      hook: 0,
      service: 0,
      api: 0,
      table: 0,
      utility: 0,
    };

    for (const item of items) {
      byType[item.type]++;
    }

    return {
      totalFiles: items.length,
      byType,
      parseErrors,
    };
  }
}
