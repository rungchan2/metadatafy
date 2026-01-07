import * as fs from 'fs';
import * as path from 'path';
import { config as dotenvConfig } from 'dotenv';

/**
 * .env 파일 우선순위 (낮은 순서 → 높은 순서로 덮어씀)
 * Next.js 스타일: https://nextjs.org/docs/basic-features/environment-variables
 *
 * 1. .env                    (모든 환경)
 * 2. .env.local              (모든 환경, git에서 제외)
 * 3. .env.[mode]             (특정 환경: development, production, test)
 * 4. .env.[mode].local       (특정 환경, git에서 제외)
 *
 * 나중에 로드된 파일이 이전 값을 덮어씁니다.
 */
export function loadEnvFiles(rootDir: string, mode?: string): {
  loaded: string[];
  variables: Record<string, string>;
} {
  const nodeEnv = mode || process.env.NODE_ENV || 'development';

  // 우선순위 순서대로 정의 (낮은 → 높은)
  const envFiles = [
    '.env',
    '.env.local',
    `.env.${nodeEnv}`,
    `.env.${nodeEnv}.local`,
  ];

  const loaded: string[] = [];
  const variables: Record<string, string> = {};

  for (const envFile of envFiles) {
    const envPath = path.join(rootDir, envFile);

    if (fs.existsSync(envPath)) {
      // dotenv로 파싱하고 process.env에 로드
      const result = dotenvConfig({
        path: envPath,
        override: true, // 이전 값 덮어쓰기
      });

      if (result.parsed) {
        loaded.push(envFile);
        Object.assign(variables, result.parsed);
      }
    }
  }

  return { loaded, variables };
}

/**
 * 환경변수 로드 및 로그 출력 (verbose 모드용)
 */
export function loadEnvWithLog(rootDir: string, verbose = false): void {
  const { loaded } = loadEnvFiles(rootDir);

  if (verbose && loaded.length > 0) {
    console.log(`📦 Loaded env files: ${loaded.join(', ')}`);
  }
}
