import type { AnalysisResult } from '../../../core/types';
import type { DatabaseProvider } from '../provider';
import type { CustomApiConfig, UploadResult } from '../types';

/**
 * 커스텀 API 프로바이더
 */
export class CustomApiProvider implements DatabaseProvider {
  name = 'Custom API';
  private config: CustomApiConfig;

  constructor(config: CustomApiConfig) {
    this.config = config;
  }

  /**
   * 연결 테스트 (OPTIONS 또는 HEAD 요청)
   */
  async testConnection(): Promise<boolean> {
    try {
      const response = await fetch(this.config.endpoint, {
        method: 'HEAD',
        headers: this.config.headers || {},
      });
      return response.ok || response.status === 405; // Method Not Allowed도 연결은 됨
    } catch {
      return false;
    }
  }

  /**
   * 메타데이터 업로드
   */
  async upload(result: AnalysisResult): Promise<UploadResult> {
    try {
      const response = await fetch(this.config.endpoint, {
        method: this.config.method,
        headers: {
          'Content-Type': 'application/json',
          ...this.config.headers,
        },
        body: JSON.stringify(result),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          message: `API error: ${response.status}`,
          error: errorText,
        };
      }

      let data: unknown = null;
      try {
        data = await response.json();
      } catch {
        // JSON이 아닌 응답도 허용
      }

      return {
        success: true,
        message: 'Metadata uploaded successfully',
        data,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to upload metadata',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
