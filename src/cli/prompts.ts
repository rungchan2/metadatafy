import * as readline from 'readline';
import type { ProjectType, PackageManager } from './detector';

let rl: readline.Interface | null = null;

function getReadline(): readline.Interface {
  if (!rl) {
    rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false,
    });
  }
  return rl;
}

function question(query: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(query);
    getReadline().once('line', (answer) => {
      resolve(answer);
    });
  });
}

export function close() {
  if (rl) {
    rl.close();
    rl = null;
  }
}

/**
 * 프로젝트 타입 선택
 */
export async function selectProjectType(detected: ProjectType): Promise<ProjectType> {
  const options: { key: string; type: ProjectType; label: string }[] = [
    { key: '1', type: 'nextjs-app', label: 'Next.js (App Router)' },
    { key: '2', type: 'nextjs-pages', label: 'Next.js (Pages Router)' },
    { key: '3', type: 'vite', label: 'Vite + React' },
    { key: '4', type: 'cra', label: 'Create React App' },
    { key: '5', type: 'node', label: 'Node.js Backend' },
  ];

  const detectedIndex = options.findIndex((o) => o.type === detected);
  const defaultKey = detectedIndex >= 0 ? options[detectedIndex].key : '1';

  console.log('\n📦 프로젝트 타입을 선택하세요:');
  options.forEach((opt) => {
    const isDetected = opt.type === detected;
    const marker = isDetected ? ' (감지됨)' : '';
    console.log(`  ${opt.key}) ${opt.label}${marker}`);
  });

  const answer = await question(`\n선택 [${defaultKey}]: `);
  const selected = answer.trim() || defaultKey;

  const choice = options.find((o) => o.key === selected);
  return choice?.type || detected;
}

/**
 * 패키지 매니저 선택
 */
export async function selectPackageManager(detected: PackageManager): Promise<PackageManager> {
  const options: { key: string; manager: PackageManager }[] = [
    { key: '1', manager: 'npm' },
    { key: '2', manager: 'yarn' },
    { key: '3', manager: 'pnpm' },
  ];

  const detectedIndex = options.findIndex((o) => o.manager === detected);
  const defaultKey = detectedIndex >= 0 ? options[detectedIndex].key : '1';

  console.log('\n📦 패키지 매니저를 선택하세요:');
  options.forEach((opt) => {
    const isDetected = opt.manager === detected;
    const marker = isDetected ? ' (감지됨)' : '';
    console.log(`  ${opt.key}) ${opt.manager}${marker}`);
  });

  const answer = await question(`\n선택 [${defaultKey}]: `);
  const selected = answer.trim() || defaultKey;

  const choice = options.find((o) => o.key === selected);
  return choice?.manager || detected;
}

/**
 * 빌드 도구 연동 여부
 */
export async function confirmBuildIntegration(projectType: ProjectType): Promise<boolean> {
  if (projectType === 'node' || projectType === 'unknown') {
    return false;
  }

  const toolName = projectType.startsWith('nextjs') ? 'next.config' : 'vite.config';
  console.log(`\n🔧 ${toolName} 파일에 metadatafy 플러그인을 자동으로 추가할까요?`);
  console.log('  빌드 시 자동으로 메타데이터가 생성됩니다.');

  const answer = await question('\n추가할까요? [Y/n]: ');
  return answer.trim().toLowerCase() !== 'n';
}

/**
 * API 엔드포인트 설정
 */
export async function askApiEndpoint(): Promise<string | null> {
  console.log('\n☁️  API 엔드포인트로 메타데이터를 전송할까요?');
  console.log('  빈칸으로 두면 파일만 생성됩니다.');

  const answer = await question('\nAPI URL (선택사항): ');
  const trimmed = answer.trim();

  if (!trimmed) {
    return null;
  }

  // URL 유효성 검사
  try {
    new URL(trimmed);
    return trimmed;
  } catch {
    console.log('⚠️  유효하지 않은 URL입니다. API 전송을 건너뜁니다.');
    return null;
  }
}

/**
 * 확인
 */
export async function confirm(message: string, defaultYes = true): Promise<boolean> {
  const hint = defaultYes ? '[Y/n]' : '[y/N]';
  const answer = await question(`${message} ${hint}: `);
  const trimmed = answer.trim().toLowerCase();

  if (trimmed === '') {
    return defaultYes;
  }
  return trimmed === 'y' || trimmed === 'yes';
}

/**
 * Supabase 연동 여부
 */
export async function askSupabaseIntegration(): Promise<boolean> {
  console.log('\n🗄️  Supabase에 메타데이터를 자동 저장할까요?');
  console.log('  빌드 시 자동으로 데이터베이스에 업로드됩니다.');

  const answer = await question('\nSupabase 연동 설정? [y/N]: ');
  return answer.trim().toLowerCase() === 'y';
}

/**
 * Supabase 설정 입력 (간단 버전)
 */
export interface SupabaseSetupResult {
  url: string;
  serviceRoleKey: string;
  tableName: string;
}

export async function askSupabaseSetup(): Promise<SupabaseSetupResult | null> {
  console.log('\n🔧 Supabase 설정');
  console.log('Settings > API에서 확인할 수 있습니다.\n');

  // 환경변수 사용 안내
  console.log('💡 환경변수 이름을 입력하면 ${VAR} 형식으로 저장됩니다.');
  console.log('   예: SUPABASE_URL → ${SUPABASE_URL}\n');

  const urlInput = await question('Supabase URL 환경변수 이름 [SUPABASE_URL]: ');
  const keyInput = await question('Service Role Key 환경변수 이름 [SUPABASE_SERVICE_ROLE_KEY]: ');
  const tableInput = await question('테이블 이름 [project_metadata]: ');

  const urlEnvName = urlInput.trim() || 'SUPABASE_URL';
  const keyEnvName = keyInput.trim() || 'SUPABASE_SERVICE_ROLE_KEY';
  const tableName = tableInput.trim() || 'project_metadata';

  return {
    url: `\${${urlEnvName}}`,
    serviceRoleKey: `\${${keyEnvName}}`,
    tableName,
  };
}
