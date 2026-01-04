import * as fs from 'fs/promises';
import * as path from 'path';
import * as readline from 'readline';
import type { DatabaseOutputConfig } from '../../core/types';
import type { DatabaseProvider as ProviderType, SupabaseConfig, AnyDatabaseConfig } from './types';
import { createProvider } from './provider';
import { resolveEnvValue } from '../../utils/env-resolver';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(query: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(query, resolve);
  });
}

function questionHidden(query: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(query);

    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;

    if (stdin.isTTY) {
      stdin.setRawMode(true);
    }

    let input = '';

    const onData = (char: Buffer) => {
      const c = char.toString('utf8');

      switch (c) {
        case '\n':
        case '\r':
        case '\u0004': // Ctrl-D
          if (stdin.isTTY) {
            stdin.setRawMode(wasRaw);
          }
          stdin.removeListener('data', onData);
          process.stdout.write('\n');
          resolve(input);
          break;
        case '\u0003': // Ctrl-C
          process.exit();
          break;
        case '\u007F': // Backspace
          if (input.length > 0) {
            input = input.slice(0, -1);
            process.stdout.clearLine(0);
            process.stdout.cursorTo(0);
            process.stdout.write(query + '*'.repeat(input.length));
          }
          break;
        default:
          input += c;
          process.stdout.write('*');
          break;
      }
    };

    stdin.on('data', onData);
    stdin.resume();
  });
}

export function closeDatabasePrompts() {
  rl.close();
}

/**
 * 데이터베이스 프로바이더 선택
 */
async function selectProvider(): Promise<ProviderType> {
  console.log('\n📦 데이터베이스 프로바이더를 선택하세요:');
  console.log('  1) Supabase');
  console.log('  2) Custom API (직접 설정)');
  console.log('  (Firebase, PlanetScale 등은 추후 지원 예정)');

  const answer = await question('\n선택 [1]: ');
  const selected = answer.trim() || '1';

  switch (selected) {
    case '2':
      return 'custom';
    default:
      return 'supabase';
  }
}

/**
 * 환경변수 사용 여부 선택
 */
async function askUseEnvVars(): Promise<boolean> {
  console.log('\n🔐 인증 정보 저장 방식을 선택하세요:');
  console.log('  1) 환경변수 참조 사용 (권장) - ${SUPABASE_URL} 형식으로 저장');
  console.log('  2) 직접 값 저장 (비권장) - 실제 값을 config에 저장');

  const answer = await question('\n선택 [1]: ');
  return answer.trim() !== '2';
}

/**
 * Supabase 설정 입력
 */
async function configureSupabase(useEnvVars: boolean): Promise<{
  config: DatabaseOutputConfig;
  actualValues: { url: string; serviceRoleKey: string };
}> {
  console.log('\n🔧 Supabase 설정\n');
  console.log('Supabase 대시보드에서 다음 정보를 확인하세요:');
  console.log('Settings > API > Project URL, service_role key\n');

  let url: string;
  let serviceRoleKey: string;
  let urlForConfig: string;
  let serviceRoleKeyForConfig: string;

  if (useEnvVars) {
    // 환경변수 이름 입력
    const urlEnvName = await question('Supabase URL 환경변수 이름 [SUPABASE_URL]: ');
    const keyEnvName = await question('Supabase service role key 환경변수 이름 [SUPABASE_SERVICE_ROLE_KEY]: ');

    urlForConfig = `\${${urlEnvName.trim() || 'SUPABASE_URL'}}`;
    serviceRoleKeyForConfig = `\${${keyEnvName.trim() || 'SUPABASE_SERVICE_ROLE_KEY'}}`;

    // 연결 테스트용 실제 값 입력
    console.log('\n연결 테스트를 위해 실제 값을 입력해주세요 (저장되지 않음):');
    url = await question('Supabase URL: ');
    serviceRoleKey = await questionHidden('Supabase service role key: ');
  } else {
    // 직접 값 입력
    url = await question('Supabase URL (예: https://xxx.supabase.co): ');
    serviceRoleKey = await questionHidden('Supabase service role key: ');
    urlForConfig = url.trim();
    serviceRoleKeyForConfig = serviceRoleKey;
  }

  if (!url.trim() || !serviceRoleKey) {
    throw new Error('Supabase URL과 service role key는 필수입니다.');
  }

  // 테이블 이름
  const tableInput = await question('\n테이블 이름 [project_metadata]: ');
  const tableName = tableInput.trim() || 'project_metadata';

  // 필드 매핑
  console.log('\n📝 필드 매핑 설정');
  console.log('메타데이터를 저장할 컬럼 이름을 입력하세요.\n');

  const projectIdField = await question('프로젝트 ID 필드 [project_id]: ');
  const metadataField = await question('메타데이터 JSON 필드 [metadata]: ');
  const createdAtField = await question('생성 시간 필드 (빈칸=created_at, "none"=사용안함) [created_at]: ');
  const updatedAtField = await question('업데이트 시간 필드 (빈칸=updated_at, "none"=사용안함) [updated_at]: ');

  const config: DatabaseOutputConfig = {
    enabled: true,
    provider: 'supabase',
    supabase: {
      url: urlForConfig,
      serviceRoleKey: serviceRoleKeyForConfig,
      tableName,
      fields: {
        projectId: projectIdField.trim() || 'project_id',
        metadata: metadataField.trim() || 'metadata',
        ...(createdAtField.trim().toLowerCase() !== 'none' && {
          createdAt: createdAtField.trim() || 'created_at',
        }),
        ...(updatedAtField.trim().toLowerCase() !== 'none' && {
          updatedAt: updatedAtField.trim() || 'updated_at',
        }),
      },
    },
  };

  return {
    config,
    actualValues: { url: url.trim(), serviceRoleKey },
  };
}

/**
 * 연결 테스트
 */
async function testConnection(
  dbConfig: DatabaseOutputConfig,
  actualValues: { url: string; serviceRoleKey: string }
): Promise<boolean> {
  console.log('\n🔌 연결 테스트 중...');

  if (dbConfig.provider !== 'supabase' || !dbConfig.supabase) {
    return true;
  }

  // 테스트용으로 실제 값을 사용하는 설정 생성
  const testConfig: SupabaseConfig = {
    provider: 'supabase',
    enabled: true,
    url: actualValues.url,
    serviceRoleKey: actualValues.serviceRoleKey,
    tableName: dbConfig.supabase.tableName,
    fields: {
      projectId: dbConfig.supabase.fields.projectId,
      metadata: dbConfig.supabase.fields.metadata,
      createdAt: dbConfig.supabase.fields.createdAt,
      updatedAt: dbConfig.supabase.fields.updatedAt,
    },
  };

  try {
    const provider = await createProvider(testConfig);
    const success = await provider.testConnection();

    if (success) {
      console.log('✅ 연결 성공!');
      return true;
    } else {
      console.log('❌ 연결 실패. 설정을 확인해주세요.');
      return false;
    }
  } catch (error) {
    console.log(`❌ 연결 오류: ${error instanceof Error ? error.message : error}`);
    return false;
  }
}

/**
 * metadata.config.json 업데이트
 */
async function updateMetadataConfig(
  rootDir: string,
  dbConfig: DatabaseOutputConfig
): Promise<string> {
  const configPath = path.join(rootDir, 'metadata.config.json');
  let existingConfig: Record<string, unknown> = {};

  // 기존 설정 로드
  try {
    const content = await fs.readFile(configPath, 'utf-8');
    existingConfig = JSON.parse(content);
  } catch {
    // 파일 없으면 새로 생성
    existingConfig = {
      projectId: path.basename(rootDir),
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['**/node_modules/**', '**/*.test.{ts,tsx}'],
      output: {},
    };
  }

  // output.database 추가/업데이트
  const output = (existingConfig.output as Record<string, unknown>) || {};
  output.database = dbConfig;
  existingConfig.output = output;

  await fs.writeFile(configPath, JSON.stringify(existingConfig, null, 2));
  return configPath;
}

/**
 * SQL 스키마 생성 안내
 */
function showSupabaseSchema(dbConfig: DatabaseOutputConfig): void {
  if (!dbConfig.supabase) return;

  const { tableName, fields } = dbConfig.supabase;

  console.log('\n📋 Supabase에서 다음 SQL로 테이블을 생성하세요:\n');
  console.log('```sql');
  console.log(`CREATE TABLE ${tableName} (`);
  console.log(`  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,`);
  console.log(`  ${fields.projectId} TEXT UNIQUE NOT NULL,`);
  console.log(`  ${fields.metadata} JSONB NOT NULL,`);
  if (fields.createdAt) {
    console.log(`  ${fields.createdAt} TIMESTAMPTZ DEFAULT NOW(),`);
  }
  if (fields.updatedAt) {
    console.log(`  ${fields.updatedAt} TIMESTAMPTZ DEFAULT NOW()`);
  }
  console.log(');');
  console.log('');
  console.log('-- RLS 정책 (필요시)');
  console.log(`ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY;`);
  console.log('```\n');
}

/**
 * 환경변수 안내
 */
function showEnvVarsGuide(dbConfig: DatabaseOutputConfig): void {
  if (dbConfig.provider !== 'supabase' || !dbConfig.supabase) return;

  const { url, serviceRoleKey } = dbConfig.supabase;

  // 환경변수 참조인 경우에만 안내
  if (url.startsWith('${') || serviceRoleKey.startsWith('${')) {
    console.log('🔐 .env 파일에 다음 환경변수를 설정하세요:\n');

    if (url.startsWith('${')) {
      const envName = url.slice(2, -1);
      console.log(`${envName}=https://your-project.supabase.co`);
    }
    if (serviceRoleKey.startsWith('${')) {
      const envName = serviceRoleKey.slice(2, -1);
      console.log(`${envName}=your-service-role-key`);
    }

    console.log('\n💡 CI/CD 환경에서는 해당 환경변수를 설정해주세요.');
    console.log('   GitHub Actions: Settings > Secrets and variables > Actions');
    console.log('   Vercel: Project Settings > Environment Variables\n');
  }
}

/**
 * database-init 메인 함수
 */
export async function runDatabaseInit(): Promise<void> {
  const rootDir = process.cwd();

  console.log('\n🗄️  metadatafy 데이터베이스 설정\n');
  console.log('빌드 시 자동으로 메타데이터를 데이터베이스에 저장합니다.');
  console.log('설정은 metadata.config.json에 저장됩니다.');

  try {
    // 프로바이더 선택
    const providerType = await selectProvider();

    if (providerType !== 'supabase') {
      console.log('\n현재 Supabase만 인터랙티브 설정을 지원합니다.');
      console.log('metadata.config.json의 output.database를 직접 작성해주세요.\n');
      return;
    }

    // 환경변수 사용 여부
    const useEnvVars = await askUseEnvVars();

    // Supabase 설정
    const { config: dbConfig, actualValues } = await configureSupabase(useEnvVars);

    // 연결 테스트
    const connected = await testConnection(dbConfig, actualValues);
    if (!connected) {
      const retry = await question('\n계속 진행할까요? [y/N]: ');
      if (retry.toLowerCase() !== 'y') {
        console.log('설정이 취소되었습니다.');
        return;
      }
    }

    // metadata.config.json 업데이트
    const configPath = await updateMetadataConfig(rootDir, dbConfig);
    console.log(`\n✅ 설정 저장됨: ${path.relative(rootDir, configPath)}`);

    // SQL 스키마 안내
    showSupabaseSchema(dbConfig);

    // 환경변수 안내
    showEnvVarsGuide(dbConfig);

    console.log('🎉 데이터베이스 설정이 완료되었습니다!');
    console.log('\n💡 사용법:');
    console.log('   npx metadatafy analyze  # 분석 + DB 업로드');
    console.log('');
  } finally {
    closeDatabasePrompts();
  }
}
