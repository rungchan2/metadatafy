import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';

/**
 * 인증 설정 파일 경로 (~/.metadatafyrc)
 */
const CONFIG_PATH = path.join(os.homedir(), '.metadatafyrc');

/**
 * API 서버 URL
 */
const API_BASE_URL = process.env.METADATAFY_API_URL || 'https://management.impakers.club';

/**
 * 저장된 인증 정보
 */
export interface AuthConfig {
  accessToken: string;
  expiresAt: string;
  userId?: string;
}

/**
 * 인증 정보 로드
 */
export function loadAuthConfig(): AuthConfig | null {
  try {
    if (!fs.existsSync(CONFIG_PATH)) {
      return null;
    }
    const content = fs.readFileSync(CONFIG_PATH, 'utf-8');
    const config = JSON.parse(content) as AuthConfig;

    // 만료 확인
    if (config.expiresAt && new Date(config.expiresAt) < new Date()) {
      console.log('⚠️  인증이 만료되었습니다. 다시 로그인하세요.');
      return null;
    }

    return config;
  } catch {
    return null;
  }
}

/**
 * 인증 정보 저장
 */
export function saveAuthConfig(config: AuthConfig): void {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), {
    mode: 0o600, // 소유자만 읽기/쓰기
  });
}

/**
 * 인증 정보 삭제
 */
export function clearAuthConfig(): void {
  if (fs.existsSync(CONFIG_PATH)) {
    fs.unlinkSync(CONFIG_PATH);
  }
}

/**
 * 로그인 상태 확인
 */
export function isLoggedIn(): boolean {
  const config = loadAuthConfig();
  return config !== null && !!config.accessToken;
}

/**
 * Access Token 가져오기
 */
export function getAccessToken(): string | null {
  const config = loadAuthConfig();
  return config?.accessToken || null;
}

/**
 * Device Code 생성
 */
export function generateDeviceCode(): string {
  return crypto.randomUUID();
}

/**
 * 디바이스 코드 등록
 */
export async function registerDeviceCode(deviceCode: string): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/device`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceCode }),
    });
    return response.ok;
  } catch (error) {
    console.error('디바이스 코드 등록 실패:', error);
    return false;
  }
}

/**
 * 인증 상태 폴링
 */
export async function pollForToken(
  deviceCode: string,
  options: { interval?: number; timeout?: number } = {}
): Promise<AuthConfig | null> {
  const { interval = 2000, timeout = 300000 } = options; // 2초 간격, 5분 타임아웃
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/auth/device/status?code=${deviceCode}`
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
          expiresAt: data.expiresAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30일
          userId: data.userId,
        };
      }

      if (data.status === 'expired') {
        return null;
      }

      // pending - 계속 대기
      await sleep(interval);
    } catch {
      await sleep(interval);
    }
  }

  return null;
}

/**
 * 브라우저 열기
 */
export async function openBrowser(url: string): Promise<void> {
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
 * 인증 URL 생성
 */
export function getAuthUrl(deviceCode: string): string {
  return `${API_BASE_URL}/auth/device?code=${deviceCode}`;
}

/**
 * API 요청 헬퍼 (인증 포함)
 */
export async function apiRequest<T = unknown>(
  endpoint: string,
  options: RequestInit = {}
): Promise<{ ok: boolean; data?: T; error?: string }> {
  const token = getAccessToken();

  if (!token) {
    return { ok: false, error: '로그인이 필요합니다. npx metadatafy login 을 실행하세요.' };
  }

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...options.headers,
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        return { ok: false, error: '인증이 만료되었습니다. 다시 로그인하세요.' };
      }
      const errorData = await response.json().catch(() => ({})) as { error?: string };
      return { ok: false, error: errorData.error || `HTTP ${response.status}` };
    }

    const data = await response.json() as T;
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : '네트워크 오류' };
  }
}

/**
 * 프로젝트 목록 조회
 */
export async function fetchProjects(): Promise<{
  ok: boolean;
  projects?: Array<{ id: string; name: string }>;
  error?: string;
}> {
  const result = await apiRequest<{ projects: Array<{ id: string; name: string }> }>(
    '/api/projects'
  );

  if (result.ok && result.data) {
    return { ok: true, projects: result.data.projects };
  }

  return { ok: false, error: result.error };
}

/**
 * 메타데이터 업로드
 */
export async function uploadMetadata(
  projectId: string,
  items: unknown[],
  stats: unknown
): Promise<{ ok: boolean; count?: number; error?: string }> {
  const result = await apiRequest<{ success: boolean; count: number }>(
    '/api/code-index',
    {
      method: 'POST',
      body: JSON.stringify({ projectId, items, stats }),
    }
  );

  if (result.ok && result.data) {
    return { ok: true, count: result.data.count };
  }

  return { ok: false, error: result.error };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
