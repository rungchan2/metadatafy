import { parseArgs } from 'node:util';
import * as path from 'path';
import * as fs from 'fs/promises';
import { ProjectAnalyzer } from './core/analyzer';
import { createDefaultConfig } from './core/config';
import { FileWriter } from './core/output/file-writer';
import type { PluginConfig, AnalysisResult } from './core/types';
import {
  detectProject,
  getProjectTypeLabel,
} from './cli/detector';
import {
  selectProjectType,
  selectPackageManager,
  confirmBuildIntegration,
  confirm,
  question,
  close as closePrompts,
} from './cli/prompts';
import {
  writeMetadataConfig,
  addVitePlugin,
  getInstallCommand,
  type InitOptions,
} from './cli/config-writer';
import {
  loadGlobalConfig,
  saveGlobalConfig,
  loadAuthInfo,
  saveAuthInfo,
  clearAuthInfo,
  isLoggedIn,
  getAccessToken,
  getDatabaseConfig,
  getApiServerUrl,
  getConfigDir,
  type GlobalConfig,
} from './cli/global-config';

const VERSION = '1.5.1';

const HELP_TEXT = `
metadatafy - 프로젝트 메타데이터 추출 도구

Usage:
  metadatafy <command> [options]

Commands:
  init           프로젝트 설정 초기화
  link           API 서버의 프로젝트와 연결
  analyze        프로젝트를 분석하고 메타데이터 생성
  upload         기존 메타데이터 파일을 업로드

  config         글로벌 설정 관리
    config show          현재 설정 표시
    config setup         대화형 설정
    config set <k> <v>   개별 설정 변경
    config reset         설정 초기화

  login          API 서버에 로그인 (서버 연동 시)
  logout         로그아웃
  whoami         현재 로그인 상태 확인

Options:
  -h, --help       도움말 표시
  -v, --version    버전 표시

Examples:
  metadatafy init                    # 프로젝트 설정
  metadatafy link                    # 서버 프로젝트 연결
  metadatafy analyze                 # 분석 (로컬 파일 생성)
  metadatafy analyze --upload        # 분석 + 업로드
  metadatafy config setup            # DB 연결 설정
`;

const CONFIG_HELP = `
Usage: metadatafy config <subcommand>

Subcommands:
  show                현재 글로벌 설정 표시
  setup               대화형 설정 (DB 연결 등)
  set <key> <value>   개별 설정 변경
  reset               모든 설정 초기화

Examples:
  metadatafy config show
  metadatafy config setup
  metadatafy config set database.provider supabase
  metadatafy config set api.serverUrl https://my-server.com
`;

const ANALYZE_HELP = `
Usage: metadatafy analyze [options]

Options:
  -o, --output <path>     출력 파일 경로 (기본값: project-metadata.json)
  -c, --config <path>     설정 파일 경로
  --upload                업로드 실행 (글로벌 config 또는 API 서버)
  --verbose               상세 로그 출력
  -h, --help              도움말 표시
`;

const UPLOAD_HELP = `
Usage: metadatafy upload [options]

기존 메타데이터 JSON 파일을 업로드합니다.
업로드 대상은 글로벌 설정(config)에서 지정합니다.

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
    case 'config':
      await runConfig(args.slice(1));
      break;
    case 'login':
      await runLogin();
      break;
    case 'logout':
      await runLogout();
      break;
    case 'whoami':
      await runWhoami();
      break;
    case 'analyze':
      await runAnalyze(args.slice(1));
      break;
    case 'upload':
      await runUpload(args.slice(1));
      break;
    case 'init':
      await runInit();
      break;
    case 'link':
      await runLink();
      break;
    default:
      console.error(`Unknown command: ${command}`);
      console.log(HELP_TEXT);
      process.exit(1);
  }
}

/**
 * 글로벌 설정 관리
 */
async function runConfig(args: string[]) {
  const subcommand = args[0];

  if (!subcommand || subcommand === '-h' || subcommand === '--help') {
    console.log(CONFIG_HELP);
    return;
  }

  switch (subcommand) {
    case 'show':
      await runConfigShow();
      break;
    case 'setup':
      await runConfigSetup();
      break;
    case 'set':
      await runConfigSet(args.slice(1));
      break;
    case 'reset':
      await runConfigReset();
      break;
    default:
      console.error(`Unknown config subcommand: ${subcommand}`);
      console.log(CONFIG_HELP);
      process.exit(1);
  }
}

/**
 * 현재 설정 표시
 */
async function runConfigShow() {
  const config = loadGlobalConfig();
  const configDir = getConfigDir();

  console.log(`\n📁 설정 위치: ${configDir}\n`);

  if (Object.keys(config).length === 0) {
    console.log('설정이 없습니다. metadatafy config setup 으로 설정하세요.');
    return;
  }

  console.log('현재 설정:');
  console.log(JSON.stringify(config, null, 2));

  // 인증 상태
  const auth = loadAuthInfo();
  if (auth) {
    console.log('\n🔐 인증 상태: 로그인됨');
    if (auth.serverUrl) {
      console.log(`   서버: ${auth.serverUrl}`);
    }
  }
}

/**
 * 대화형 설정
 */
async function runConfigSetup() {
  console.log('\n⚙️  metadatafy 글로벌 설정\n');
  console.log('이 설정은 ~/.metadatafy/에 저장됩니다.');
  console.log('모든 프로젝트에서 공통으로 사용됩니다.\n');

  const config = loadGlobalConfig();

  // 1. 업로드 방식 선택
  console.log('📤 메타데이터 업로드 방식을 선택하세요:\n');
  console.log('  1) Supabase 직접 연결');
  console.log('  2) API 서버 (ticket-ms 등)');
  console.log('  3) 로컬 파일만 (업로드 안 함)');

  const uploadChoice = await question('\n선택 [1-3]: ');

  if (uploadChoice === '1') {
    // Supabase 설정
    await setupSupabase(config);
  } else if (uploadChoice === '2') {
    // API 서버 설정
    await setupApiServer(config);
  } else {
    // 로컬만
    config.database = undefined;
    config.api = undefined;
    saveGlobalConfig(config);
    console.log('\n✅ 로컬 파일 모드로 설정되었습니다.');
  }

  closePrompts();
  console.log('\n🎉 설정이 완료되었습니다!');
  console.log(`   저장 위치: ${getConfigDir()}/config.json\n`);
}

/**
 * Supabase 설정
 */
async function setupSupabase(config: GlobalConfig) {
  console.log('\n🗄️  Supabase 설정\n');
  console.log('Supabase 대시보드에서 다음 정보를 확인하세요:');
  console.log('Settings > API > Project URL, service_role key\n');

  const url = await question('Supabase URL: ');
  const key = await questionHidden('Service Role Key: ');
  const table = await question('테이블 이름 [code_index]: ');

  config.database = {
    provider: 'supabase',
    supabaseUrl: url.trim(),
    supabaseServiceRoleKey: key,
    supabaseTable: table.trim() || 'code_index',
  };

  saveGlobalConfig(config);
  console.log('\n✅ Supabase 설정이 저장되었습니다.');
  console.log('\n💡 각 프로젝트에서 metadatafy init 으로 프로젝트 ID를 설정하세요.');
}

/**
 * API 서버 설정
 */
async function setupApiServer(config: GlobalConfig) {
  console.log('\n🌐 API 서버 설정\n');

  const defaultUrl = config.api?.serverUrl || 'https://management.impakers.club';
  const url = await question(`서버 URL [${defaultUrl}]: `);

  config.api = {
    serverUrl: url.trim() || defaultUrl,
  };

  // 로그인 안내
  console.log('\n💡 API 서버 사용 시 로그인이 필요합니다.');
  console.log('   metadatafy login 으로 로그인하세요.');

  saveGlobalConfig(config);
  console.log('\n✅ API 서버 설정이 저장되었습니다.');
}

/**
 * 숨김 입력 (비밀번호용)
 */
function questionHidden(query: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(query);

    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;

    if (stdin.isTTY) {
      stdin.setRawMode(true);
    }

    let input = '';

    const onData = (char: Buffer) => {
      const c = char.toString('utf8');

      switch (c) {
        case '\n':
        case '\r':
        case '\u0004': // Ctrl-D
          if (stdin.isTTY) {
            stdin.setRawMode(wasRaw);
          }
          stdin.removeListener('data', onData);
          process.stdout.write('\n');
          resolve(input);
          break;
        case '\u0003': // Ctrl-C
          process.exit();
          break;
        case '\u007F': // Backspace
          if (input.length > 0) {
            input = input.slice(0, -1);
            process.stdout.clearLine(0);
            process.stdout.cursorTo(0);
            process.stdout.write(query + '*'.repeat(input.length));
          }
          break;
        default:
          input += c;
          process.stdout.write('*');
          break;
      }
    };

    stdin.on('data', onData);
    stdin.resume();
  });
}

/**
 * 개별 설정 변경
 */
async function runConfigSet(args: string[]) {
  if (args.length < 2) {
    console.error('Usage: metadatafy config set <key> <value>');
    console.log('\nExamples:');
    console.log('  metadatafy config set database.provider supabase');
    console.log('  metadatafy config set api.serverUrl https://my-server.com');
    process.exit(1);
  }

  const [key, ...valueParts] = args;
  const value = valueParts.join(' ');

  const config = loadGlobalConfig();
  const keys = key.split('.');
  let current: Record<string, unknown> = config as Record<string, unknown>;

  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    if (!current[k] || typeof current[k] !== 'object') {
      current[k] = {};
    }
    current = current[k] as Record<string, unknown>;
  }

  current[keys[keys.length - 1]] = value;
  saveGlobalConfig(config);

  console.log(`✅ ${key} = ${value}`);
}

/**
 * 설정 초기화
 */
async function runConfigReset() {
  const confirmed = await confirm('모든 설정을 초기화할까요?', false);
  closePrompts();

  if (!confirmed) {
    console.log('취소되었습니다.');
    return;
  }

  saveGlobalConfig({});
  clearAuthInfo();
  console.log('✅ 모든 설정이 초기화되었습니다.');
}

/**
 * 로그인 (API 서버용)
 */
async function runLogin() {
  const serverUrl = getApiServerUrl();

  if (isLoggedIn()) {
    const auth = loadAuthInfo();
    console.log(`이미 로그인되어 있습니다. (${auth?.serverUrl || serverUrl})`);
    const shouldRelogin = await confirm('다시 로그인할까요?', false);
    if (!shouldRelogin) {
      closePrompts();
      return;
    }
  }

  console.log(`\n🔐 로그인 (${serverUrl})\n`);

  // Device code 생성
  const deviceCode = crypto.randomUUID();

  // 서버에 등록
  console.log('🔄 인증 준비 중...');
  try {
    const response = await fetch(`${serverUrl}/api/auth/device`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceCode }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (error) {
    console.error('❌ 서버 연결에 실패했습니다.');
    console.log(`   ${serverUrl}/api/auth/device`);
    closePrompts();
    process.exit(1);
  }

  // 브라우저 열기
  const authUrl = `${serverUrl}/auth/device?code=${deviceCode}`;
  console.log('\n🌐 브라우저에서 인증을 완료하세요.');
  console.log(`   ${authUrl}\n`);

  await openBrowser(authUrl);

  // 폴링
  console.log('⏳ 인증 대기 중... (브라우저에서 로그인하세요)');
  const authResult = await pollForToken(serverUrl, deviceCode);

  if (!authResult) {
    console.error('\n❌ 인증 시간이 초과되었습니다. 다시 시도해주세요.');
    closePrompts();
    process.exit(1);
  }

  // 저장
  saveAuthInfo({
    accessToken: authResult.accessToken,
    expiresAt: authResult.expiresAt,
    userId: authResult.userId,
    serverUrl,
  });

  console.log('\n✅ 로그인 성공!');
  closePrompts();
}

/**
 * 브라우저 열기
 */
async function openBrowser(url: string): Promise<void> {
  const { exec } = await import('child_process');
  const platform = process.platform;

  const command =
    platform === 'darwin'
      ? `open "${url}"`
      : platform === 'win32'
        ? `start "${url}"`
        : `xdg-open "${url}"`;

  exec(command);
}

/**
 * 토큰 폴링
 */
async function pollForToken(
  serverUrl: string,
  deviceCode: string
): Promise<{ accessToken: string; expiresAt: string; userId?: string } | null> {
  const interval = 2000;
  const timeout = 300000; // 5분
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    try {
      const response = await fetch(
        `${serverUrl}/api/auth/device/status?code=${deviceCode}`
      );

      if (!response.ok) {
        await sleep(interval);
        continue;
      }

      const data = await response.json() as {
        status?: string;
        accessToken?: string;
        expiresAt?: string;
        userId?: string;
      };

      if (data.status === 'authorized' && data.accessToken) {
        return {
          accessToken: data.accessToken,
          expiresAt: data.expiresAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          userId: data.userId,
        };
      }

      if (data.status === 'expired') {
        return null;
      }

      await sleep(interval);
    } catch {
      await sleep(interval);
    }
  }

  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 로그아웃
 */
async function runLogout() {
  if (!isLoggedIn()) {
    console.log('로그인되어 있지 않습니다.');
    return;
  }

  clearAuthInfo();
  console.log('✅ 로그아웃되었습니다.');
}

/**
 * 현재 로그인 상태 확인
 */
async function runWhoami() {
  const auth = loadAuthInfo();

  if (!auth) {
    console.log('로그인되어 있지 않습니다.');
    console.log('metadatafy login 으로 로그인하세요.');
    return;
  }

  console.log('✅ 로그인됨');
  if (auth.serverUrl) {
    console.log(`   서버: ${auth.serverUrl}`);
  }
  if (auth.userId) {
    console.log(`   User ID: ${auth.userId}`);
  }
  if (auth.expiresAt) {
    console.log(`   만료: ${new Date(auth.expiresAt).toLocaleString()}`);
  }
}

/**
 * 프로젝트 연결 (API 서버)
 */
async function runLink() {
  const rootDir = process.cwd();
  const folderName = path.basename(rootDir);

  console.log('\n🔗 프로젝트 연결\n');

  // 로그인 확인
  if (!isLoggedIn()) {
    console.log('❌ 로그인이 필요합니다.');
    console.log('   metadatafy login 으로 먼저 로그인하세요.');
    closePrompts();
    process.exit(1);
  }

  const serverUrl = getApiServerUrl();
  const token = getAccessToken();

  if (!token) {
    console.log('❌ 인증 토큰이 없습니다.');
    console.log('   metadatafy login 으로 로그인하세요.');
    closePrompts();
    process.exit(1);
  }

  // 프로젝트 목록 조회
  console.log('📋 프로젝트 목록 조회 중...');

  try {
    const response = await fetch(`${serverUrl}/api/projects`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });

    if (!response.ok) {
      if (response.status === 401) {
        console.log('\n❌ 인증이 만료되었습니다.');
        console.log('   metadatafy login 으로 다시 로그인하세요.');
        closePrompts();
        process.exit(1);
      }
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json() as { projects: Array<{ id: string; name: string }> };
    const projects = data.projects || [];

    if (projects.length === 0) {
      console.log('\n⚠️  연결할 수 있는 프로젝트가 없습니다.');
      console.log('   서버에서 먼저 프로젝트를 생성하세요.');
      closePrompts();
      return;
    }

    console.log('\n📦 연결할 프로젝트를 선택하세요:\n');
    projects.forEach((p, i) => {
      console.log(`  ${i + 1}) ${p.name}`);
    });

    const answer = await question(`\n선택 [1-${projects.length}]: `);
    const selectedIndex = parseInt(answer.trim(), 10) - 1;

    if (isNaN(selectedIndex) || selectedIndex < 0 || selectedIndex >= projects.length) {
      console.log('\n❌ 잘못된 선택입니다.');
      closePrompts();
      process.exit(1);
    }

    const selectedProject = projects[selectedIndex];

    // 기존 설정 파일 로드
    const configPath = path.join(rootDir, 'metadata.config.json');
    let existingConfig: Record<string, unknown> = {};

    try {
      const content = await fs.readFile(configPath, 'utf-8');
      existingConfig = JSON.parse(content);
    } catch {
      // 파일 없으면 새로 생성
    }

    // projectId와 projectUuid 업데이트
    existingConfig.projectId = selectedProject.name;
    existingConfig.projectUuid = selectedProject.id;

    // 설정 파일 저장
    await fs.writeFile(configPath, JSON.stringify(existingConfig, null, 2));

    console.log(`\n✅ 프로젝트 연결 완료!`);
    console.log(`   프로젝트: ${selectedProject.name}`);
    console.log(`   설정 파일: ${path.relative(rootDir, configPath)}`);
    console.log('\n💡 이제 metadatafy analyze --upload 로 업로드할 수 있습니다.\n');

  } catch (error) {
    console.error(`\n❌ 프로젝트 목록 조회 실패: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  } finally {
    closePrompts();
  }
}

/**
 * 분석
 */
async function runAnalyze(args: string[]) {
  const { values } = parseArgs({
    args,
    options: {
      output: { type: 'string', short: 'o' },
      config: { type: 'string', short: 'c' },
      upload: { type: 'boolean' },
      verbose: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  });

  if (values.help) {
    console.log(ANALYZE_HELP);
    process.exit(0);
  }

  const rootDir = process.cwd();
  const outputPath = values.output || 'project-metadata.json';
  const verbose = values.verbose || false;

  // 프로젝트 설정 파일 로드
  let configFromFile: Partial<PluginConfig> & { projectUuid?: string } = {};
  if (values.config) {
    try {
      const configContent = await fs.readFile(values.config, 'utf-8');
      configFromFile = JSON.parse(configContent);
    } catch {
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
      // 설정 파일이 없으면 무시
    }
  }

  const projectId = configFromFile.projectId || path.basename(rootDir);

  const config = createDefaultConfig({
    ...configFromFile,
    projectId,
    verbose,
    output: {
      file: {
        enabled: true,
        path: outputPath,
      },
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

    // 업로드
    if (values.upload) {
      console.log('');
      await doUpload(configFromFile.projectUuid, result, verbose);
    }

    console.log('');
  } catch (error) {
    console.error('❌ Analysis failed:', error);
    process.exit(1);
  }
}

/**
 * 업로드
 */
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
  const inputPath = values.input || 'project-metadata.json';
  const verbose = values.verbose || false;

  // 프로젝트 설정 파일 로드
  let configFromFile: { projectUuid?: string } = {};
  if (values.config) {
    try {
      const configContent = await fs.readFile(values.config, 'utf-8');
      configFromFile = JSON.parse(configContent);
    } catch {
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
      // 설정 파일이 없어도 글로벌 config로 업로드 가능
    }
  }

  // 메타데이터 파일 로드
  const fullInputPath = path.resolve(rootDir, inputPath);
  let metadata: AnalysisResult;
  try {
    const content = await fs.readFile(fullInputPath, 'utf-8');
    metadata = JSON.parse(content);
  } catch {
    console.error(`❌ 메타데이터 파일을 찾을 수 없습니다: ${fullInputPath}`);
    console.log('   metadatafy analyze 로 먼저 분석을 실행하세요.');
    process.exit(1);
  }

  console.log(`\n📤 Uploading metadata from: ${fullInputPath}`);
  await doUpload(configFromFile.projectUuid, metadata, verbose);
}

/**
 * 실제 업로드 로직
 */
async function doUpload(
  projectUuid: string | undefined,
  result: AnalysisResult,
  verbose: boolean
): Promise<void> {
  const globalConfig = loadGlobalConfig();
  const dbConfig = getDatabaseConfig();

  // 1. Supabase 직접 연결
  if (dbConfig?.provider === 'supabase' && dbConfig.supabaseUrl) {
    console.log('🔄 Supabase에 업로드 중...');
    await uploadToSupabase(dbConfig, projectUuid, result, verbose);
    return;
  }

  // 2. API 서버
  if (globalConfig.api?.serverUrl || !dbConfig) {
    // 로그인 확인
    if (!isLoggedIn()) {
      console.error('❌ 로그인이 필요합니다.');
      console.log('   metadatafy login 으로 먼저 로그인하세요.');
      process.exit(1);
    }

    // 프로젝트 UUID 확인
    if (!projectUuid) {
      console.error('❌ 프로젝트가 설정되지 않았습니다.');
      console.log('   metadatafy init 으로 프로젝트를 선택하세요.');
      process.exit(1);
    }

    console.log('🔄 서버에 업로드 중...');
    await uploadToApiServer(projectUuid, result, verbose);
    return;
  }

  console.error('❌ 업로드 설정이 없습니다.');
  console.log('   metadatafy config setup 으로 설정하세요.');
  process.exit(1);
}

/**
 * Supabase 직접 업로드
 */
async function uploadToSupabase(
  dbConfig: NonNullable<GlobalConfig['database']>,
  projectUuid: string | undefined,
  result: AnalysisResult,
  verbose: boolean
): Promise<void> {
  const { supabaseUrl, supabaseServiceRoleKey, supabaseTable } = dbConfig;

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    console.error('❌ Supabase 설정이 불완전합니다.');
    console.log('   metadatafy config setup 으로 다시 설정하세요.');
    process.exit(1);
  }

  // projectUuid가 있으면 사용, 없으면 projectId 사용
  const projectIdForDb = projectUuid || result.projectId;

  const tableName = supabaseTable || 'code_index';

  try {
    // 기존 데이터 삭제 (projectId 기준)
    const deleteResponse = await fetch(
      `${supabaseUrl}/rest/v1/${tableName}?project_id=eq.${projectIdForDb}`,
      {
        method: 'DELETE',
        headers: {
          'apikey': supabaseServiceRoleKey,
          'Authorization': `Bearer ${supabaseServiceRoleKey}`,
        },
      }
    );

    if (!deleteResponse.ok && deleteResponse.status !== 404) {
      const errorText = await deleteResponse.text();
      throw new Error(`Delete failed: ${deleteResponse.status} - ${errorText}`);
    }

    // 새 데이터 삽입 (id는 DB에서 자동 생성 또는 UNIQUE 제약조건 사용)
    const rows = result.items.map((item) => ({
      project_id: projectIdForDb,
      file_type: item.type,
      name: item.name,
      path: item.path,
      keywords: item.keywords,
      search_text: item.searchText,
      calls: item.calls,
      called_by: item.calledBy,
      metadata: item.metadata,
    }));

    const insertResponse = await fetch(
      `${supabaseUrl}/rest/v1/${tableName}`,
      {
        method: 'POST',
        headers: {
          'apikey': supabaseServiceRoleKey,
          'Authorization': `Bearer ${supabaseServiceRoleKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify(rows),
      }
    );

    if (!insertResponse.ok) {
      const error = await insertResponse.text();
      throw new Error(`Insert failed: ${error}`);
    }

    console.log(`✅ 업로드 완료! (${result.items.length}개 파일)`);
  } catch (error) {
    console.error(`❌ 업로드 실패: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}

/**
 * API 서버 업로드
 */
async function uploadToApiServer(
  projectUuid: string,
  result: AnalysisResult,
  verbose: boolean
): Promise<void> {
  const serverUrl = getApiServerUrl();
  const token = getAccessToken();

  if (!token) {
    console.error('❌ 인증 토큰이 없습니다.');
    console.log('   metadatafy login 으로 로그인하세요.');
    process.exit(1);
  }

  try {
    const response = await fetch(`${serverUrl}/api/code-index`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        projectId: projectUuid,
        items: result.items,
        stats: result.stats,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    const data = await response.json() as { count?: number };
    console.log(`✅ 업로드 완료! (${data.count || result.items.length}개 파일)`);
  } catch (error) {
    console.error(`❌ 업로드 실패: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}

/**
 * 초기 설정
 */
async function runInit() {
  const rootDir = process.cwd();
  const folderName = path.basename(rootDir);

  console.log('\n🚀 metadatafy 설정 마법사\n');
  console.log(`폴더: ${folderName}`);
  console.log(`경로: ${rootDir}`);

  // 프로젝트 감지
  console.log('\n🔍 프로젝트 분석 중...');
  const projectInfo = await detectProject(rootDir);

  console.log(`\n✅ 감지된 정보:`);
  console.log(`   프로젝트 타입: ${getProjectTypeLabel(projectInfo.type)}`);
  console.log(`   패키지 매니저: ${projectInfo.packageManager}`);
  console.log(`   TypeScript: ${projectInfo.hasTypescript ? '예' : '아니오'}`);

  // 글로벌 설정 확인
  const globalConfig = loadGlobalConfig();
  const hasApiServer = !!globalConfig.api?.serverUrl;
  const hasSupabase = globalConfig.database?.provider === 'supabase';

  let projectId = folderName;
  let projectUuid = '';

  // Supabase 직접 연결 모드
  if (hasSupabase && !hasApiServer) {
    console.log('\n📌 프로젝트 ID 설정');
    console.log('   Supabase code_index 테이블의 project_id 컬럼에 저장될 값입니다.');
    console.log('   여러 프로젝트를 구분하는 데 사용됩니다.\n');

    const inputId = await question(`프로젝트 ID [${folderName}]: `);
    projectId = inputId.trim() || folderName;
  }
  // API 서버 모드
  else if (hasApiServer || isLoggedIn()) {
    console.log('\n📋 프로젝트 목록 조회 중...');

    const serverUrl = getApiServerUrl();
    const token = getAccessToken();

    if (!token) {
      console.log('\n⚠️  로그인이 필요합니다.');
      const shouldLogin = await confirm('지금 로그인할까요?', true);
      if (shouldLogin) {
        closePrompts();
        await runLogin();
        // 다시 init 실행
        await runInit();
        return;
      }
    } else {
      try {
        const response = await fetch(`${serverUrl}/api/projects`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });

        if (response.ok) {
          const data = await response.json() as { projects: Array<{ id: string; name: string }> };
          const projects = data.projects;

          if (projects.length > 0) {
            console.log('\n📦 연결할 프로젝트를 선택하세요:\n');
            projects.forEach((p, i) => {
              console.log(`  ${i + 1}) ${p.name}`);
            });

            const answer = await question(`\n선택 [1-${projects.length}]: `);
            const selectedIndex = parseInt(answer.trim(), 10) - 1;

            if (!isNaN(selectedIndex) && selectedIndex >= 0 && selectedIndex < projects.length) {
              const selectedProject = projects[selectedIndex];
              projectId = selectedProject.name;
              projectUuid = selectedProject.id;
              console.log(`\n✅ 선택됨: ${selectedProject.name}`);
            }
          }
        }
      } catch {
        console.log('⚠️  프로젝트 목록을 가져올 수 없습니다.');
      }
    }
  }

  try {
    // 프로젝트 타입 선택
    const projectType = await selectProjectType(projectInfo.type);

    // 패키지 매니저 선택
    const packageManager = await selectPackageManager(projectInfo.packageManager);

    // 빌드 도구 연동 (Vite만 지원)
    let addBuildIntegration = false;
    if (projectType === 'vite' || projectType === 'cra') {
      addBuildIntegration = await confirmBuildIntegration(projectType);
    }

    const options: InitOptions = {
      projectType,
      packageManager,
      projectInfo,
      addBuildIntegration,
      projectUuid,
      projectName: projectId,
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
      const success = await addVitePlugin(rootDir);
      if (success) {
        console.log(`✅ vite.config 파일에 플러그인 추가됨`);
      } else {
        console.log(`⚠️  빌드 설정 파일을 찾을 수 없습니다. 수동으로 추가해주세요.`);
      }
    }

    // 완료 메시지
    console.log('\n🎉 설정이 완료되었습니다!\n');

    // 글로벌 설정 안내
    if (!hasApiServer && !hasSupabase) {
      console.log('💡 업로드를 사용하려면 글로벌 설정을 완료하세요:');
      console.log('   metadatafy config setup\n');
    }

    console.log('💡 사용법:\n');
    console.log('   metadatafy analyze          # 분석 (로컬 파일 생성)');
    console.log('   metadatafy analyze --upload # 분석 + 업로드');
    console.log('');

  } finally {
    closePrompts();
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
