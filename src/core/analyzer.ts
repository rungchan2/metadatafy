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
import { globToRegex } from './config';
import { generateId } from '../utils/id-utils';

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

  constructor(config: PluginConfig) {
    this.config = config;
    this.tsParser = new TypeScriptParser();
    this.sqlParser = new SQLParser();
    this.importExtractor = new ImportExtractor();
    this.exportExtractor = new ExportExtractor();
    this.propsExtractor = new PropsExtractor();
    this.keywordExtractor = new KeywordExtractor(config.koreanKeywords);
    this.callGraphBuilder = new CallGraphBuilder();
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
    const fileType = this.determineFileType(relativePath);

    if (!fileType) {
      return null;
    }

    const content = await fs.readFile(filePath, 'utf-8');
    const ext = path.extname(filePath);

    // SQL 파일 처리
    if (ext === '.sql') {
      return this.sqlParser.parse(content, relativePath);
    }

    // TypeScript/JavaScript 파일 처리
    const sourceFile = this.tsParser.parse(content, filePath);

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
   * 파일 타입 결정
   */
  private determineFileType(relativePath: string): FileType | null {
    // 정렬: 더 구체적인 패턴이 먼저 매칭되도록
    const sortedPatterns = Object.entries(this.config.fileTypeMapping).sort(
      ([a], [b]) => b.length - a.length
    );

    for (const [pattern, type] of sortedPatterns) {
      const regex = globToRegex(pattern);
      if (regex.test(relativePath)) {
        return type;
      }
    }
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
