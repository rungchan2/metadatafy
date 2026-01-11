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
  close as closePrompts,
} from './cli/prompts';
import {
  writeMetadataConfig,
  addVitePlugin,
  getInstallCommand,
  type InitOptions,
} from './cli/config-writer';
import {
  isLoggedIn,
  loadAuthConfig,
  saveAuthConfig,
  clearAuthConfig,
  generateDeviceCode,
  registerDeviceCode,
  pollForToken,
  openBrowser,
  getAuthUrl,
  fetchProjects,
  uploadMetadata,
} from './cli/auth';

const VERSION = '2.0.0';

const HELP_TEXT = `
metadatafy - 프로젝트 메타데이터 추출 도구

Usage:
  metadatafy <command> [options]

Commands:
  login          ticket-ms에 로그인
  logout         로그아웃
  whoami         현재 로그인 상태 확인
  init           프로젝트 설정 (프로젝트 선택 포함)
  analyze        프로젝트를 분석하고 메타데이터 생성
  upload         기존 메타데이터 파일을 서버에 업로드

Options:
  -h, --help       도움말 표시
  -v, --version    버전 표시

Examples:
  metadatafy login                   # 로그인
  metadatafy init                    # 프로젝트 설정
  metadatafy analyze                 # 분석만 (로컬 파일 생성)
  metadatafy analyze --upload        # 분석 + 서버 업로드
  metadatafy upload                  # 기존 파일을 서버에 업로드
`;

const ANALYZE_HELP = `
Usage: metadatafy analyze [options]

Options:
  -o, --output <path>     출력 파일 경로 (기본값: project-metadata.json)
  -c, --config <path>     설정 파일 경로
  --upload                서버 업로드 실행
  --verbose               상세 로그 출력
  -h, --help              도움말 표시
`;

const UPLOAD_HELP = `
Usage: metadatafy upload [options]

기존 메타데이터 JSON 파일을 서버에 업로드합니다.

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
    default:
      console.error(`Unknown command: ${command}`);
      console.log(HELP_TEXT);
      process.exit(1);
  }
}

/**
 * 로그인
 */
async function runLogin() {
  if (isLoggedIn()) {
    console.log('이미 로그인되어 있습니다.');
    const shouldRelogin = await confirm('다시 로그인할까요?', false);
    if (!shouldRelogin) {
      closePrompts();
      return;
    }
  }

  console.log('\n🔐 ticket-ms 로그인\n');

  // 1. Device code 생성
  const deviceCode = generateDeviceCode();

  // 2. 서버에 등록
  console.log('🔄 인증 준비 중...');
  const registered = await registerDeviceCode(deviceCode);
  if (!registered) {
    console.error('❌ 서버 연결에 실패했습니다.');
    closePrompts();
    process.exit(1);
  }

  // 3. 브라우저 열기
  const authUrl = getAuthUrl(deviceCode);
  console.log('\n🌐 브라우저에서 인증을 완료하세요.');
  console.log(`   ${authUrl}\n`);

  await openBrowser(authUrl);

  // 4. 폴링
  console.log('⏳ 인증 대기 중... (브라우저에서 로그인하세요)');
  const authConfig = await pollForToken(deviceCode);

  if (!authConfig) {
    console.error('\n❌ 인증 시간이 초과되었습니다. 다시 시도해주세요.');
    closePrompts();
    process.exit(1);
  }

  // 5. 저장
  saveAuthConfig(authConfig);
  console.log('\n✅ 로그인 성공!');
  closePrompts();
}

/**
 * 로그아웃
 */
async function runLogout() {
  if (!isLoggedIn()) {
    console.log('로그인되어 있지 않습니다.');
    return;
  }

  clearAuthConfig();
  console.log('✅ 로그아웃되었습니다.');
}

/**
 * 현재 로그인 상태 확인
 */
async function runWhoami() {
  const config = loadAuthConfig();

  if (!config) {
    console.log('로그인되어 있지 않습니다.');
    console.log('npx metadatafy login 으로 로그인하세요.');
    return;
  }

  console.log('✅ 로그인됨');
  if (config.userId) {
    console.log(`   User ID: ${config.userId}`);
  }
  if (config.expiresAt) {
    console.log(`   만료: ${new Date(config.expiresAt).toLocaleString()}`);
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

  // 설정 파일 로드
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

    // 서버 업로드
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

  // 설정 파일 로드
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
      console.error('❌ metadata.config.json 파일을 찾을 수 없습니다.');
      console.log('   npx metadatafy init 으로 설정을 먼저 생성하세요.');
      process.exit(1);
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
    console.log('   npx metadatafy analyze 로 먼저 분석을 실행하세요.');
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
  // 로그인 확인
  if (!isLoggedIn()) {
    console.error('❌ 로그인이 필요합니다.');
    console.log('   npx metadatafy login 으로 먼저 로그인하세요.');
    process.exit(1);
  }

  // 프로젝트 UUID 확인
  if (!projectUuid) {
    console.error('❌ 프로젝트가 설정되지 않았습니다.');
    console.log('   npx metadatafy init 으로 프로젝트를 선택하세요.');
    process.exit(1);
  }

  console.log('🔄 서버에 업로드 중...');

  const uploadResult = await uploadMetadata(projectUuid, result.items, result.stats);

  if (uploadResult.ok) {
    console.log(`✅ 업로드 완료! (${uploadResult.count}개 파일)`);
  } else {
    console.error(`❌ 업로드 실패: ${uploadResult.error}`);
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

  // 로그인 확인
  if (!isLoggedIn()) {
    console.log('\n⚠️  로그인이 필요합니다.');
    const shouldLogin = await confirm('지금 로그인할까요?', true);
    if (shouldLogin) {
      closePrompts();
      await runLogin();
    } else {
      console.log('\n로그인 후 다시 시도해주세요: npx metadatafy login');
      closePrompts();
      process.exit(0);
    }
  }

  // 프로젝트 목록 조회
  console.log('\n📋 프로젝트 목록 조회 중...');
  const projectsResult = await fetchProjects();

  if (!projectsResult.ok || !projectsResult.projects) {
    console.error(`❌ 프로젝트 목록을 가져올 수 없습니다: ${projectsResult.error}`);
    closePrompts();
    process.exit(1);
  }

  const projects = projectsResult.projects;

  if (projects.length === 0) {
    console.log('\n⚠️  등록된 프로젝트가 없습니다.');
    console.log('   ticket-ms에서 먼저 프로젝트를 생성하세요.');
    closePrompts();
    process.exit(0);
  }

  // 프로젝트 선택
  console.log('\n📦 연결할 프로젝트를 선택하세요:\n');
  projects.forEach((p, i) => {
    console.log(`  ${i + 1}) ${p.name}`);
  });

  const { question } = await import('./cli/prompts');
  const answer = await question(`\n선택 [1-${projects.length}]: `);
  const selectedIndex = parseInt(answer.trim(), 10) - 1;

  if (isNaN(selectedIndex) || selectedIndex < 0 || selectedIndex >= projects.length) {
    console.error('❌ 잘못된 선택입니다.');
    closePrompts();
    process.exit(1);
  }

  const selectedProject = projects[selectedIndex];
  console.log(`\n✅ 선택됨: ${selectedProject.name}`);

  // 프로젝트 감지
  console.log('\n🔍 프로젝트 분석 중...');
  const projectInfo = await detectProject(rootDir);

  console.log(`\n✅ 감지된 정보:`);
  console.log(`   프로젝트 타입: ${getProjectTypeLabel(projectInfo.type)}`);
  console.log(`   패키지 매니저: ${projectInfo.packageManager}`);
  console.log(`   TypeScript: ${projectInfo.hasTypescript ? '예' : '아니오'}`);

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
      projectUuid: selectedProject.id,
      projectName: selectedProject.name,
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
      const configFilePath = await writeMetadataConfig(rootDir, selectedProject.name, options);
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

    // 패키지 설치 안내
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

    console.log('💡 사용법:\n');
    console.log('   npx metadatafy analyze          # 분석 (로컬 파일 생성)');
    console.log('   npx metadatafy analyze --upload # 분석 + 서버 업로드');
    console.log('');

  } finally {
    closePrompts();
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
