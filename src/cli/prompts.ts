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

export function question(query: string): Promise<string> {
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
 * Next.js 16+는 Turbopack 기본이라 webpack 플러그인 충돌 → Vite만 지원
 */
export async function confirmBuildIntegration(projectType: ProjectType): Promise<boolean> {
  // Next.js는 Turbopack 충돌로 플러그인 추가 안함
  if (projectType === 'node' || projectType === 'unknown' || projectType.startsWith('nextjs')) {
    return false;
  }

  console.log(`\n🔧 vite.config 파일에 metadatafy 플러그인을 자동으로 추가할까요?`);
  console.log('  빌드 시 자동으로 메타데이터가 생성됩니다.');

  const answer = await question('\n추가할까요? [Y/n]: ');
  return answer.trim().toLowerCase() !== 'n';
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

