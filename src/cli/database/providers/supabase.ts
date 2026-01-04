import type { AnalysisResult } from '../../../core/types';
import type { DatabaseProvider } from '../provider';
import type { SupabaseConfig, UploadResult } from '../types';

/**
 * Supabase 프로바이더
 */
export class SupabaseProvider implements DatabaseProvider {
  name = 'Supabase';
  private config: SupabaseConfig;

  constructor(config: SupabaseConfig) {
    this.config = config;
  }

  /**
   * Supabase REST API URL 생성
   */
  private getRestUrl(table: string): string {
    const baseUrl = this.config.url.replace(/\/$/, '');
    return `${baseUrl}/rest/v1/${table}`;
  }

  /**
   * 연결 테스트
   */
  async testConnection(): Promise<boolean> {
    try {
      const response = await fetch(this.getRestUrl(this.config.tableName), {
        method: 'GET',
        headers: {
          'apikey': this.config.serviceRoleKey,
          'Authorization': `Bearer ${this.config.serviceRoleKey}`,
          'Content-Type': 'application/json',
          'Range': '0-0', // 첫 번째 row만 가져오기 (테스트용)
        },
      });

      // 200 또는 206 (Partial Content) 또는 416 (빈 테이블)
      return response.ok || response.status === 416;
    } catch (error) {
      return false;
    }
  }

  /**
   * 메타데이터 업로드
   */
  async upload(result: AnalysisResult): Promise<UploadResult> {
    const { fields, tableName } = this.config;

    // 기존 데이터 확인 (upsert용)
    const existingData = await this.findByProjectId(result.projectId);

    const payload: Record<string, unknown> = {
      [fields.projectId]: result.projectId,
      [fields.metadata]: result,
    };

    if (fields.updatedAt) {
      payload[fields.updatedAt] = new Date().toISOString();
    }

    if (!existingData && fields.createdAt) {
      payload[fields.createdAt] = new Date().toISOString();
    }

    try {
      let response: Response;

      if (existingData) {
        // UPDATE
        response = await fetch(
          `${this.getRestUrl(tableName)}?${fields.projectId}=eq.${result.projectId}`,
          {
            method: 'PATCH',
            headers: {
              'apikey': this.config.serviceRoleKey,
              'Authorization': `Bearer ${this.config.serviceRoleKey}`,
              'Content-Type': 'application/json',
              'Prefer': 'return=representation',
            },
            body: JSON.stringify(payload),
          }
        );
      } else {
        // INSERT
        response = await fetch(this.getRestUrl(tableName), {
          method: 'POST',
          headers: {
            'apikey': this.config.serviceRoleKey,
            'Authorization': `Bearer ${this.config.serviceRoleKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation',
          },
          body: JSON.stringify(payload),
        });
      }

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          message: `Supabase API error: ${response.status}`,
          error: errorText,
        };
      }

      const data = await response.json();
      return {
        success: true,
        message: existingData ? 'Metadata updated' : 'Metadata created',
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

  /**
   * 프로젝트 ID로 기존 데이터 조회
   */
  private async findByProjectId(projectId: string): Promise<unknown | null> {
    try {
      const { fields, tableName } = this.config;
      const response = await fetch(
        `${this.getRestUrl(tableName)}?${fields.projectId}=eq.${projectId}&limit=1`,
        {
          method: 'GET',
          headers: {
            'apikey': this.config.serviceRoleKey,
            'Authorization': `Bearer ${this.config.serviceRoleKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      return Array.isArray(data) && data.length > 0 ? data[0] : null;
    } catch {
      return null;
    }
  }
}
