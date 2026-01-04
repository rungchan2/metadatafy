import { parseArgs } from 'node:util';
import * as path from 'path';
import * as fs from 'fs/promises';
import { ProjectAnalyzer } from './core/analyzer';
import { createDefaultConfig } from './core/config';
import { FileWriter } from './core/output/file-writer';
import { ApiSender } from './core/output/api-sender';
import type { PluginConfig } from './core/types';

const VERSION = '1.0.1';

const HELP_TEXT = `
metadatafy - 프로젝트 메타데이터 추출 도구

Usage:
  metadatafy <command> [options]

Commands:
  analyze     프로젝트를 분석하고 메타데이터 생성
  init        설정 파일 생성

Options:
  -h, --help       도움말 표시
  -v, --version    버전 표시

Examples:
  metadatafy analyze
  metadatafy analyze --project-id my-project --output ./metadata.json
  metadatafy init
`;

const ANALYZE_HELP = `
Usage: metadatafy analyze [options]

Options:
  -p, --project-id <id>   프로젝트 ID (기본값: 폴더명)
  -o, --output <path>     출력 파일 경로 (기본값: project-metadata.json)
  -c, --config <path>     설정 파일 경로
  --verbose               상세 로그 출력
  -h, --help              도움말 표시
`;

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '-h' || args[0] === '--help') {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  if (args[0] === '-v' || args[0] === '--version') {
    console.log(VERSION);
    process.exit(0);
  }

  const command = args[0];

  switch (command) {
    case 'analyze':
      await runAnalyze(args.slice(1));
      break;
    case 'init':
      await runInit();
      break;
    default:
      console.error(`Unknown command: ${command}`);
      console.log(HELP_TEXT);
      process.exit(1);
  }
}

async function runAnalyze(args: string[]) {
  const { values } = parseArgs({
    args,
    options: {
      'project-id': { type: 'string', short: 'p' },
      output: { type: 'string', short: 'o' },
      config: { type: 'string', short: 'c' },
      verbose: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  });

  if (values.help) {
    console.log(ANALYZE_HELP);
    process.exit(0);
  }

  const rootDir = process.cwd();
  const projectId = values['project-id'] || path.basename(rootDir);
  const outputPath = values.output || 'project-metadata.json';
  const verbose = values.verbose || false;

  // 설정 파일 로드
  let configFromFile: Partial<PluginConfig> = {};
  if (values.config) {
    try {
      const configContent = await fs.readFile(values.config, 'utf-8');
      configFromFile = JSON.parse(configContent);
    } catch (error) {
      console.error(`Failed to load config file: ${values.config}`);
      process.exit(1);
    }
  } else {
    // 기본 설정 파일 찾기
    const defaultConfigPath = path.join(rootDir, 'metadata.config.json');
    try {
      const configContent = await fs.readFile(defaultConfigPath, 'utf-8');
      configFromFile = JSON.parse(configContent);
      if (verbose) {
        console.log(`Loaded config from ${defaultConfigPath}`);
      }
    } catch {
      // 설정 파일이 없으면 무시
    }
  }

  const config = createDefaultConfig({
    ...configFromFile,
    projectId,
    verbose,
    output: {
      file: {
        enabled: true,
        path: outputPath,
      },
      ...configFromFile.output,
    },
  });

  console.log(`\n📦 Analyzing project: ${projectId}`);
  console.log(`📁 Root directory: ${rootDir}\n`);

  const analyzer = new ProjectAnalyzer(config);
  const fileWriter = new FileWriter(config);

  try {
    const startTime = Date.now();
    const result = await analyzer.analyze(rootDir);
    const duration = Date.now() - startTime;

    // 파일 출력
    const fullOutputPath = path.resolve(rootDir, outputPath);
    await fileWriter.write(result, fullOutputPath);

    // API 전송 (설정된 경우)
    if (config.output.api?.enabled && config.output.api.endpoint) {
      const apiSender = new ApiSender(config);
      await apiSender.send(result);
      console.log(`☁️  Sent to API: ${config.output.api.endpoint}`);
    }

    // 결과 출력
    console.log(`✅ Analysis completed in ${duration}ms\n`);
    console.log(`📊 Results:`);
    console.log(`   Total files: ${result.stats.totalFiles}`);
    console.log(`   - Routes: ${result.stats.byType.route}`);
    console.log(`   - Components: ${result.stats.byType.component}`);
    console.log(`   - Hooks: ${result.stats.byType.hook}`);
    console.log(`   - Services: ${result.stats.byType.service}`);
    console.log(`   - APIs: ${result.stats.byType.api}`);
    console.log(`   - Tables: ${result.stats.byType.table}`);
    console.log(`   - Utilities: ${result.stats.byType.utility}`);
    console.log(`\n📄 Output: ${fullOutputPath}`);

    if (result.stats.parseErrors.length > 0) {
      console.log(`\n⚠️  Parse errors (${result.stats.parseErrors.length}):`);
      result.stats.parseErrors.slice(0, 5).forEach((err) => {
        console.log(`   - ${err}`);
      });
      if (result.stats.parseErrors.length > 5) {
        console.log(`   ... and ${result.stats.parseErrors.length - 5} more`);
      }
    }

    console.log('');
  } catch (error) {
    console.error('❌ Analysis failed:', error);
    process.exit(1);
  }
}

async function runInit() {
  const rootDir = process.cwd();
  const configPath = path.join(rootDir, 'metadata.config.json');

  // 이미 존재하는지 확인
  try {
    await fs.access(configPath);
    console.log(`⚠️  Config file already exists: ${configPath}`);
    process.exit(1);
  } catch {
    // 파일이 없으면 계속 진행
  }

  const defaultConfig = {
    projectId: path.basename(rootDir),
    include: [
      'app/**/*.{ts,tsx}',
      'pages/**/*.{ts,tsx}',
      'components/**/*.{ts,tsx}',
      'hooks/**/*.{ts,tsx}',
      'services/**/*.ts',
      'lib/**/*.ts',
      'src/**/*.{ts,tsx}',
    ],
    exclude: [
      '**/node_modules/**',
      '**/.next/**',
      '**/dist/**',
      '**/*.test.{ts,tsx}',
      '**/*.spec.{ts,tsx}',
    ],
    output: {
      file: {
        enabled: true,
        path: 'project-metadata.json',
      },
      api: {
        enabled: false,
        endpoint: '',
      },
    },
    koreanKeywords: {},
    verbose: false,
  };

  await fs.writeFile(configPath, JSON.stringify(defaultConfig, null, 2));
  console.log(`✅ Created config file: ${configPath}`);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
