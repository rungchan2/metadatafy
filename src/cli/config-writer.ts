import * as fs from 'fs/promises';
import * as path from 'path';
import type { ProjectType, PackageManager, ProjectInfo } from './detector';

export interface InitOptions {
  projectType: ProjectType;
  packageManager: PackageManager;
  projectInfo: ProjectInfo;
  addBuildIntegration: boolean;
  /** ticket-ms 프로젝트 UUID */
  projectUuid: string;
  /** ticket-ms 프로젝트 이름 */
  projectName: string;
  /** API를 통한 업로드 활성화 여부 */
  enableApiUpload?: boolean;
}

/**
 * 프로젝트 타입에 맞는 include 패턴 생성
 */
function getIncludePatterns(options: InitOptions): string[] {
  const { projectType, projectInfo } = options;
  const patterns: string[] = [];
  const ext = projectInfo.hasTypescript ? '{ts,tsx}' : '{js,jsx}';

  switch (projectType) {
    case 'nextjs-app':
      if (projectInfo.hasSrc) {
        patterns.push(`src/app/**/*.${ext}`);
      } else {
        patterns.push(`app/**/*.${ext}`);
      }
      patterns.push(`components/**/*.${ext}`);
      patterns.push(`hooks/**/*.${ext}`);
      patterns.push(`lib/**/*.${ext}`);
      break;

    case 'nextjs-pages':
      if (projectInfo.hasSrc) {
        patterns.push(`src/pages/**/*.${ext}`);
      } else {
        patterns.push(`pages/**/*.${ext}`);
      }
      patterns.push(`components/**/*.${ext}`);
      patterns.push(`hooks/**/*.${ext}`);
      patterns.push(`lib/**/*.${ext}`);
      break;

    case 'vite':
    case 'cra':
      patterns.push(`src/**/*.${ext}`);
      break;

    case 'node':
      patterns.push(`src/**/*.${projectInfo.hasTypescript ? 'ts' : 'js'}`);
      patterns.push(`routes/**/*.${projectInfo.hasTypescript ? 'ts' : 'js'}`);
      patterns.push(`controllers/**/*.${projectInfo.hasTypescript ? 'ts' : 'js'}`);
      break;

    default:
      patterns.push(`src/**/*.${ext}`);
  }

  // DB 마이그레이션
  if (projectInfo.hasPrisma) {
    patterns.push('prisma/migrations/**/*.sql');
  }
  if (projectInfo.hasSupabase) {
    patterns.push('supabase/migrations/*.sql');
  }

  return patterns;
}

/**
 * metadata.config.json 생성
 */
export async function writeMetadataConfig(
  rootDir: string,
  projectId: string,
  options: InitOptions
): Promise<string> {
  const configPath = path.join(rootDir, 'metadata.config.json');

  const config: Record<string, unknown> = {
    projectId,
    projectUuid: options.projectUuid,
    projectName: options.projectName,
    include: getIncludePatterns(options),
    exclude: [
      '**/node_modules/**',
      '**/.next/**',
      '**/dist/**',
      '**/build/**',
      '**/*.test.{ts,tsx,js,jsx}',
      '**/*.spec.{ts,tsx,js,jsx}',
      '**/__tests__/**',
    ],
    output: {
      file: {
        enabled: true,
        path: 'project-metadata.json',
      },
    },
    koreanKeywords: {},
    verbose: false,
  };

  await fs.writeFile(configPath, JSON.stringify(config, null, 2));
  return configPath;
}

/**
 * Vite 설정 파일에 플러그인 추가
 */
export async function addVitePlugin(rootDir: string): Promise<boolean> {
  const configFiles = ['vite.config.ts', 'vite.config.js', 'vite.config.mts', 'vite.config.mjs'];

  for (const configFile of configFiles) {
    const configPath = path.join(rootDir, configFile);
    try {
      let content = await fs.readFile(configPath, 'utf-8');

      // 이미 추가되어 있는지 확인
      if (content.includes('metadatafy')) {
        return true;
      }

      // import 추가
      const importStatement = "import metadatafy from 'metadatafy/vite';\n";
      if (content.includes("from 'vite'")) {
        content = content.replace(
          /^(import .+ from ['"]vite['"];?\n)/m,
          `$1${importStatement}`
        );
      } else {
        content = importStatement + content;
      }

      // plugins 배열에 추가
      if (content.includes('plugins:')) {
        content = content.replace(
          /plugins:\s*\[/,
          'plugins: [\n    metadatafy(),'
        );
      } else if (content.includes('defineConfig(')) {
        // plugins가 없으면 추가
        content = content.replace(
          /defineConfig\(\{/,
          'defineConfig({\n  plugins: [metadatafy()],'
        );
      }

      await fs.writeFile(configPath, content);
      return true;
    } catch {
      // 파일 없음
    }
  }

  return false;
}

/**
 * Next.js 설정 파일에 플러그인 추가
 */
export async function addNextPlugin(rootDir: string): Promise<boolean> {
  const configFiles = ['next.config.ts', 'next.config.mjs', 'next.config.js'];

  for (const configFile of configFiles) {
    const configPath = path.join(rootDir, configFile);
    try {
      let content = await fs.readFile(configPath, 'utf-8');

      // 이미 추가되어 있는지 확인
      if (content.includes('metadatafy') || content.includes('withMetadatafy')) {
        return true;
      }

      const isTS = configFile.endsWith('.ts');
      const isMJS = configFile.endsWith('.mjs');

      // import 추가
      const importStatement = isMJS || isTS
        ? "import { withMetadatafy } from 'metadatafy/next';\n"
        : "const { withMetadatafy } = require('metadatafy/next');\n";

      content = importStatement + content;

      // export default 감싸기
      if (content.includes('export default')) {
        content = content.replace(
          /export default\s+({[\s\S]*?});?\s*$/m,
          'export default withMetadatafy()($1);'
        );
        content = content.replace(
          /export default\s+(\w+);?\s*$/m,
          'export default withMetadatafy()($1);'
        );
      } else if (content.includes('module.exports')) {
        content = content.replace(
          /module\.exports\s*=\s*({[\s\S]*?});?\s*$/m,
          'module.exports = withMetadatafy()($1);'
        );
        content = content.replace(
          /module\.exports\s*=\s*(\w+);?\s*$/m,
          'module.exports = withMetadatafy()($1);'
        );
      }

      await fs.writeFile(configPath, content);
      return true;
    } catch {
      // 파일 없음
    }
  }

  return false;
}

/**
 * 패키지 설치 명령어 반환
 */
export function getInstallCommand(packageManager: PackageManager): string {
  switch (packageManager) {
    case 'yarn':
      return 'yarn add -D metadatafy';
    case 'pnpm':
      return 'pnpm add -D metadatafy';
    default:
      return 'npm install -D metadatafy';
  }
}
