import type { AnalysisResult } from '../../core/types';
import type { AnyDatabaseConfig, UploadResult } from './types';

/**
 * 데이터베이스 프로바이더 인터페이스
 */
export interface DatabaseProvider {
  /** 프로바이더 이름 */
  name: string;

  /** 연결 테스트 */
  testConnection(): Promise<boolean>;

  /** 메타데이터 업로드 */
  upload(result: AnalysisResult): Promise<UploadResult>;
}

/**
 * 프로바이더 팩토리
 */
export async function createProvider(config: AnyDatabaseConfig): Promise<DatabaseProvider> {
  switch (config.provider) {
    case 'supabase':
      const { SupabaseProvider } = await import('./providers/supabase');
      return new SupabaseProvider(config);

    case 'custom':
      const { CustomApiProvider } = await import('./providers/custom-api');
      return new CustomApiProvider(config);

    default:
      throw new Error(`Unknown provider: ${(config as AnyDatabaseConfig).provider}`);
  }
}
