/**
 * 환경변수 참조 패턴: ${VAR_NAME}
 */
const ENV_PATTERN = /\$\{([^}]+)\}/g;

/**
 * 문자열에서 ${VAR} 패턴을 환경변수 값으로 치환
 *
 * @example
 * resolveEnvValue('${SUPABASE_URL}') // process.env.SUPABASE_URL 값 반환
 * resolveEnvValue('https://example.com') // 그대로 반환
 * resolveEnvValue('Bearer ${API_KEY}') // 'Bearer <API_KEY값>' 반환
 */
export function resolveEnvValue(value: string): string {
  if (!value || typeof value !== 'string') {
    return value;
  }

  return value.replace(ENV_PATTERN, (match, envName) => {
    const envValue = process.env[envName];
    if (envValue === undefined) {
      console.warn(`⚠️  환경변수 ${envName}이(가) 설정되지 않았습니다.`);
      return match; // 원본 유지
    }
    return envValue;
  });
}

/**
 * 환경변수 참조가 포함되어 있는지 확인
 */
export function hasEnvReference(value: string): boolean {
  return ENV_PATTERN.test(value);
}

/**
 * 객체의 모든 문자열 값에서 환경변수 치환
 */
export function resolveEnvInObject<T extends Record<string, unknown>>(obj: T): T {
  const result = { ...obj } as Record<string, unknown>;

  for (const [key, value] of Object.entries(result)) {
    if (typeof value === 'string') {
      result[key] = resolveEnvValue(value);
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = resolveEnvInObject(value as Record<string, unknown>);
    }
  }

  return result as T;
}

/**
 * 환경변수가 모두 설정되어 있는지 확인
 * 설정되지 않은 변수 목록 반환
 */
export function checkRequiredEnvVars(value: string): string[] {
  const missing: string[] = [];
  const matches = value.matchAll(ENV_PATTERN);

  for (const match of matches) {
    const envName = match[1];
    if (!process.env[envName]) {
      missing.push(envName);
    }
  }

  return missing;
}
