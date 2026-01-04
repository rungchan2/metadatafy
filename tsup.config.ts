import { defineConfig, Options } from 'tsup';

const commonConfig: Options = {
  format: ['esm', 'cjs'],
  splitting: true,
  sourcemap: true,
  treeshake: true,
  external: ['vite', 'next', 'webpack', 'typescript'],
  esbuildOptions(options) {
    options.platform = 'node';
  },
};

export default defineConfig([
  // 라이브러리 빌드
  {
    ...commonConfig,
    entry: {
      index: 'src/index.ts',
      vite: 'src/vite.ts',
      next: 'src/next.ts',
    },
    dts: true,
    clean: true,
  },
  // CLI 빌드 (shebang 포함)
  {
    ...commonConfig,
    entry: {
      cli: 'src/cli.ts',
    },
    banner: {
      js: '#!/usr/bin/env node',
    },
    dts: false,
    clean: false,
  },
]);
