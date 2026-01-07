import { parseArgs } from 'node:util';
import * as path from 'path';
import * as fs from 'fs/promises';
import { ProjectAnalyzer } from './core/analyzer';
import { createDefaultConfig } from './core/config';
import { FileWriter } from './core/output/file-writer';
import { ApiSender } from './core/output/api-sender';
import { loadEnvWithLog } from './utils/env-loader';
import type { PluginConfig } from './core/types';
import {
  detectProject,
  getProjectTypeLabel,
  type ProjectType,
  type PackageManager,
} from './cli/detector';
import {
  selectProjectType,
  selectPackageManager,
  confirmBuildIntegration,
  askSupabaseIntegration,
  askSupabaseSetup,
  confirm,
  close as closePrompts,
} from './cli/prompts';
import {
  writeMetadataConfig,
  addVitePlugin,
  addNextPlugin,
  getInstallCommand,
  type InitOptions,
} from './cli/config-writer';
import { runDatabaseInit, createProvider, type AnyDatabaseConfig } from './cli/database';

const VERSION = '1.3.1';

const HELP_TEXT = `
metadatafy - 프로젝트 메타데이터 추출 도구

Usage:
  metadatafy <command> [options]

Commands:
  analyze        프로젝트를 분석하고 메타데이터 생성
  upload         기존 메타데이터 파일을 DB에 업로드
  init           인터랙티브 설정 및 빌드 도구 연동
  database-init  데이터베이스 연동 설정 (Supabase 등)

Options:
  -h, --help       도움말 표시
  -v, --version    버전 표시

Examples:
  metadatafy init
  metadatafy analyze
  metadatafy analyze --upload        # 분석 + DB 업로드
  metadatafy analyze --no-upload     # 분석만 (DB 업로드 안함)
  metadatafy upload                  # 기존 파일을 DB에 업로드
`;

const ANALYZE_HELP = `
Usage: metadatafy analyze [options]

Options:
  -p, --project-id <id>   프로젝트 ID (기본값: 폴더명)
  -o, --output <path>     출력 파일 경로 (기본값: project-metadata.json)
  -c, --config <path>     설정 파일 경로
  --upload                DB 업로드 강제 실행
  --no-upload             DB 업로드 스킵
  --verbose               상세 로그 출력
  -h, --help              도움말 표시
`;

const UPLOAD_HELP = `
Usage: metadatafy upload [options]

기존 메타데이터 JSON 파일을 데이터베이스에 업로드합니다.

Options:
  -i, --input <path>      입력 파일 경로 (기본값: project-metadata.json)
  -c, --config <path>     설정 파일 경로
  --verbose               상세 로그 출력
  -h, --help              도움말 표시
`;

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '-h' || args[0] === '--help') {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  if (args[0] === '-v' || args[0] === '--version') {
    console.log(VERSION);
    process.exit(0);
  }

  const command = args[0];

  switch (command) {
    case 'analyze':
      await runAnalyze(args.slice(1));
      break;
    case 'upload':
      await runUpload(args.slice(1));
      break;
    case 'init':
      await runInit();
      break;
    case 'database-init':
      await runDatabaseInit();
      break;
    default:
      console.error(`Unknown command: ${command}`);
      console.log(HELP_TEXT);
      process.exit(1);
  }
}

async function runAnalyze(args: string[]) {
  const { values } = parseArgs({
    args,
    options: {
      'project-id': { type: 'string', short: 'p' },
      output: { type: 'string', short: 'o' },
      config: { type: 'string', short: 'c' },
      upload: { type: 'boolean' },
      'no-upload': { type: 'boolean' },
      verbose: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  });

  if (values.help) {
    console.log(ANALYZE_HELP);
    process.exit(0);
  }

  const rootDir = process.cwd();

  // .env 파일 로드 (DB 연결 등에 필요)
  loadEnvWithLog(rootDir, values.verbose);

  const projectId = values['project-id'] || path.basename(rootDir);
  const outputPath = values.output || 'project-metadata.json';
  const verbose = values.verbose || false;

  // 설정 파일 로드
  let configFromFile: Partial<PluginConfig> = {};
  if (values.config) {
    try {
      const configContent = await fs.readFile(values.config, 'utf-8');
      configFromFile = JSON.parse(configContent);
    } catch (error) {
      console.error(`Failed to load config file: ${values.config}`);
      process.exit(1);
    }
  } else {
    // 기본 설정 파일 찾기
    const defaultConfigPath = path.join(rootDir, 'metadata.config.json');
    try {
      const configContent = await fs.readFile(defaultConfigPath, 'utf-8');
      configFromFile = JSON.parse(configContent);
      if (verbose) {
        console.log(`Loaded config from ${defaultConfigPath}`);
      }
    } catch {
      // 설정 파일이 없으면 무시
    }
  }

  const config = createDefaultConfig({
    ...configFromFile,
    projectId,
    verbose,
    output: {
      file: {
        enabled: true,
        path: outputPath,
      },
      ...configFromFile.output,
    },
  });

  console.log(`\n📦 Analyzing project: ${projectId}`);
  console.log(`📁 Root directory: ${rootDir}\n`);

  const analyzer = new ProjectAnalyzer(config);
  const fileWriter = new FileWriter(config);

  try {
    const startTime = Date.now();
    const result = await analyzer.analyze(rootDir);
    const duration = Date.now() - startTime;

    // 파일 출력
    const fullOutputPath = path.resolve(rootDir, outputPath);
    await fileWriter.write(result, fullOutputPath);

    // API 전송 (설정된 경우)
    if (config.output.api?.enabled && config.output.api.endpoint) {
      // URL 유효성 검사
      try {
        new URL(config.output.api.endpoint);
        const apiSender = new ApiSender(config);
        await apiSender.send(result);
        console.log(`☁️  Sent to API: ${config.output.api.endpoint}`);
      } catch {
        if (verbose) {
          console.log(`⚠️  Invalid API endpoint, skipping: ${config.output.api.endpoint}`);
        }
      }
    }

    // 데이터베이스 업로드
    const shouldUpload = values.upload || (!values['no-upload'] && configFromFile.output?.database?.enabled);
    if (shouldUpload) {
      await uploadToDatabase(configFromFile, result, verbose);
    } else if (verbose) {
      console.log('ℹ️  DB upload skipped (use --upload to enable)');
    }

    // 결과 출력
    console.log(`✅ Analysis completed in ${duration}ms\n`);
    console.log(`📊 Results:`);
    console.log(`   Total files: ${result.stats.totalFiles}`);
    console.log(`   - Routes: ${result.stats.byType.route}`);
    console.log(`   - Components: ${result.stats.byType.component}`);
    console.log(`   - Hooks: ${result.stats.byType.hook}`);
    console.log(`   - Services: ${result.stats.byType.service}`);
    console.log(`   - APIs: ${result.stats.byType.api}`);
    console.log(`   - Tables: ${result.stats.byType.table}`);
    console.log(`   - Utilities: ${result.stats.byType.utility}`);
    console.log(`\n📄 Output: ${fullOutputPath}`);

    if (result.stats.parseErrors.length > 0) {
      console.log(`\n⚠️  Parse errors (${result.stats.parseErrors.length}):`);
      result.stats.parseErrors.slice(0, 5).forEach((err) => {
        console.log(`   - ${err}`);
      });
      if (result.stats.parseErrors.length > 5) {
        console.log(`   ... and ${result.stats.parseErrors.length - 5} more`);
      }
    }

    console.log('');
  } catch (error) {
    console.error('❌ Analysis failed:', error);
    process.exit(1);
  }
}

async function runUpload(args: string[]) {
  const { values } = parseArgs({
    args,
    options: {
      input: { type: 'string', short: 'i' },
      config: { type: 'string', short: 'c' },
      verbose: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  });

  if (values.help) {
    console.log(UPLOAD_HELP);
    process.exit(0);
  }

  const rootDir = process.cwd();

  // .env 파일 로드 (DB 연결에 필요)
  loadEnvWithLog(rootDir, values.verbose);

  const inputPath = values.input || 'project-metadata.json';
  const verbose = values.verbose || false;

  // 설정 파일 로드
  let configFromFile: Partial<PluginConfig> = {};
  if (values.config) {
    try {
      const configContent = await fs.readFile(values.config, 'utf-8');
      configFromFile = JSON.parse(configContent);
    } catch (error) {
      console.error(`Failed to load config file: ${values.config}`);
      process.exit(1);
    }
  } else {
    const defaultConfigPath = path.join(rootDir, 'metadata.config.json');
    try {
      const configContent = await fs.readFile(defaultConfigPath, 'utf-8');
      configFromFile = JSON.parse(configContent);
      if (verbose) {
        console.log(`Loaded config from ${defaultConfigPath}`);
      }
    } catch {
      console.error('❌ metadata.config.json 파일을 찾을 수 없습니다.');
      console.log('   npx metadatafy init 으로 설정을 먼저 생성하세요.');
      process.exit(1);
    }
  }

  // 메타데이터 파일 로드
  const fullInputPath = path.resolve(rootDir, inputPath);
  let metadata: import('./core/types').AnalysisResult;
  try {
    const content = await fs.readFile(fullInputPath, 'utf-8');
    metadata = JSON.parse(content);
  } catch (error) {
    console.error(`❌ 메타데이터 파일을 찾을 수 없습니다: ${fullInputPath}`);
    console.log('   npx metadatafy analyze 로 먼저 분석을 실행하세요.');
    process.exit(1);
  }

  console.log(`\n📤 Uploading metadata from: ${fullInputPath}`);

  // DB 설정 확인
  const dbConfig = await loadDatabaseConfig(rootDir, configFromFile);
  if (!dbConfig) {
    console.error('❌ 데이터베이스 설정이 없습니다.');
    console.log('   npx metadatafy database-init 으로 설정을 추가하세요.');
    process.exit(1);
  }

  try {
    const provider = await createProvider(dbConfig);
    const uploadResult = await provider.upload(metadata);

    if (uploadResult.success) {
      console.log(`\n✅ ${uploadResult.message} (${dbConfig.provider})`);
    } else {
      console.error(`\n❌ Upload failed: ${uploadResult.error}`);
      process.exit(1);
    }
  } catch (error) {
    console.error(`\n❌ Upload error: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}

async function runInit() {
  const rootDir = process.cwd();
  const projectId = path.basename(rootDir);

  console.log('\n🚀 metadatafy 설정 마법사\n');
  console.log(`프로젝트: ${projectId}`);
  console.log(`경로: ${rootDir}`);

  // 기존 .env 파일 로드 (Supabase 설정에서 사용)
  const { loadEnvFiles } = await import('./utils/env-loader');
  const { variables: existingEnvVars } = loadEnvFiles(rootDir);

  // 프로젝트 감지
  console.log('\n🔍 프로젝트 분석 중...');
  const projectInfo = await detectProject(rootDir);

  console.log(`\n✅ 감지된 정보:`);
  console.log(`   프로젝트 타입: ${getProjectTypeLabel(projectInfo.type)}`);
  console.log(`   패키지 매니저: ${projectInfo.packageManager}`);
  console.log(`   TypeScript: ${projectInfo.hasTypescript ? '예' : '아니오'}`);
  if (projectInfo.existingFolders.length > 0) {
    console.log(`   주요 폴더: ${projectInfo.existingFolders.slice(0, 5).join(', ')}`);
  }

  try {
    // 프로젝트 타입 선택
    const projectType = await selectProjectType(projectInfo.type);

    // 패키지 매니저 선택
    const packageManager = await selectPackageManager(projectInfo.packageManager);

    // 빌드 도구 연동
    let addBuildIntegration = false;
    if (projectType !== 'node' && projectType !== 'unknown') {
      addBuildIntegration = await confirmBuildIntegration(projectType);
    }

    // Supabase 연동
    let supabaseConfig = null;
    const wantSupabase = await askSupabaseIntegration();
    if (wantSupabase) {
      supabaseConfig = await askSupabaseSetup(existingEnvVars);
    }

    const options: InitOptions = {
      projectType,
      packageManager,
      projectInfo,
      addBuildIntegration,
      supabase: supabaseConfig,
    };

    // 설정 파일 확인
    const configPath = path.join(rootDir, 'metadata.config.json');
    let shouldWriteConfig = true;
    try {
      await fs.access(configPath);
      console.log(`\n⚠️  metadata.config.json 파일이 이미 존재합니다.`);
      shouldWriteConfig = await confirm('덮어쓸까요?', false);
    } catch {
      // 파일 없음
    }

    console.log('\n📝 설정 적용 중...\n');

    // 설정 파일 생성
    if (shouldWriteConfig) {
      const configFilePath = await writeMetadataConfig(rootDir, projectId, options);
      console.log(`✅ 설정 파일 생성: ${path.relative(rootDir, configFilePath)}`);
    }

    // 빌드 도구 연동
    if (addBuildIntegration) {
      let success = false;
      if (projectType === 'vite' || projectType === 'cra') {
        success = await addVitePlugin(rootDir);
      } else if (projectType.startsWith('nextjs')) {
        success = await addNextPlugin(rootDir);
      }

      if (success) {
        const configName = projectType.startsWith('nextjs') ? 'next.config' : 'vite.config';
        console.log(`✅ ${configName} 파일에 플러그인 추가됨`);
      } else {
        console.log(`⚠️  빌드 설정 파일을 찾을 수 없습니다. 수동으로 추가해주세요.`);
      }
    }

    // 완료 메시지
    console.log('\n🎉 설정이 완료되었습니다!\n');

    // 패키지가 설치되어 있는지 확인
    const packageJsonPath = path.join(rootDir, 'package.json');
    try {
      const pkgContent = await fs.readFile(packageJsonPath, 'utf-8');
      const pkg = JSON.parse(pkgContent);
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

      if (!allDeps['metadatafy']) {
        console.log('📦 다음 명령어로 패키지를 설치하세요:\n');
        console.log(`   ${getInstallCommand(packageManager)}\n`);
      }
    } catch {
      // package.json 없음
    }

    if (addBuildIntegration) {
      console.log('🔧 빌드 시 자동으로 메타데이터가 생성됩니다.');
    } else {
      console.log('💡 수동 분석 명령어:\n');
      console.log('   npx metadatafy analyze\n');
    }

    // Supabase 설정 안내
    if (supabaseConfig) {
      console.log('\n🗄️  Supabase 연동이 설정되었습니다.');
      console.log(`   환경변수: \${${supabaseConfig.urlEnvName}}, \${${supabaseConfig.serviceRoleKeyEnvName}}`);
      console.log('\n📋 Supabase에서 테이블을 생성하세요:\n');
      console.log(`   CREATE TABLE ${supabaseConfig.tableName} (`);
      console.log('     id UUID DEFAULT gen_random_uuid() PRIMARY KEY,');
      console.log('     project_id TEXT UNIQUE NOT NULL,');
      console.log('     metadata JSONB NOT NULL,');
      console.log('     created_at TIMESTAMPTZ DEFAULT NOW(),');
      console.log('     updated_at TIMESTAMPTZ DEFAULT NOW()');
      console.log('   );\n');
    }
  } finally {
    closePrompts();
  }
}

/**
 * 환경변수 치환 헬퍼
 */
function resolveEnvVar(value: string): string {
  if (!value || typeof value !== 'string') return value;
  if (value.startsWith('${') && value.endsWith('}')) {
    const envName = value.slice(2, -1);
    return process.env[envName] || '';
  }
  return value;
}

/**
 * metadata.config.json에서 데이터베이스 설정 로드
 */
async function loadDatabaseConfig(
  rootDir: string,
  configFromFile: Partial<PluginConfig>
): Promise<AnyDatabaseConfig | null> {
  const dbOutput = configFromFile.output?.database;

  if (!dbOutput || !dbOutput.enabled) {
    return null;
  }

  if (dbOutput.provider === 'supabase' && dbOutput.supabase) {
    const { supabase } = dbOutput;

    // 환경변수 치환
    const url = resolveEnvVar(supabase.url);
    const serviceRoleKey = resolveEnvVar(supabase.serviceRoleKey);

    if (!url || !serviceRoleKey) {
      console.log('⚠️  Supabase 환경변수가 설정되지 않았습니다.');
      if (supabase.url.startsWith('${')) {
        console.log(`   ${supabase.url.slice(2, -1)}을(를) 설정해주세요.`);
      }
      if (supabase.serviceRoleKey.startsWith('${')) {
        console.log(`   ${supabase.serviceRoleKey.slice(2, -1)}을(를) 설정해주세요.`);
      }
      return null;
    }

    return {
      provider: 'supabase',
      enabled: true,
      url,
      serviceRoleKey,
      tableName: supabase.tableName,
      fields: {
        projectId: supabase.fields.projectId,
        metadata: supabase.fields.metadata,
        createdAt: supabase.fields.createdAt,
        updatedAt: supabase.fields.updatedAt,
      },
    } as import('./cli/database').SupabaseConfig;
  }

  if (dbOutput.provider === 'custom' && dbOutput.custom) {
    const { custom } = dbOutput;
    const headers: Record<string, string> = {};

    // 헤더의 환경변수도 치환
    if (custom.headers) {
      for (const [key, value] of Object.entries(custom.headers)) {
        headers[key] = resolveEnvVar(value);
      }
    }

    return {
      provider: 'custom',
      enabled: true,
      endpoint: resolveEnvVar(custom.endpoint),
      method: custom.method,
      headers,
    } as import('./cli/database').CustomApiConfig;
  }

  return null;
}

/**
 * 데이터베이스에 메타데이터 업로드
 */
async function uploadToDatabase(
  configFromFile: Partial<PluginConfig>,
  result: import('./core/types').AnalysisResult,
  verbose: boolean
): Promise<void> {
  const dbConfig = await loadDatabaseConfig(process.cwd(), configFromFile);

  if (!dbConfig) {
    return;
  }

  if (verbose) {
    console.log(`\n🗄️  Uploading to ${dbConfig.provider}...`);
  }

  try {
    const provider = await createProvider(dbConfig);
    const uploadResult = await provider.upload(result);

    if (uploadResult.success) {
      console.log(`🗄️  ${uploadResult.message} (${dbConfig.provider})`);
    } else {
      console.log(`⚠️  Database upload failed: ${uploadResult.error}`);
    }
  } catch (error) {
    console.log(`⚠️  Database upload error: ${error instanceof Error ? error.message : error}`);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
