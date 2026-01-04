import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    vite: 'src/vite.ts',
    next: 'src/next.ts',
    cli: 'src/cli.ts',
  },
  format: ['esm', 'cjs'],
  splitting: true,
  sourcemap: false,
  treeshake: true,
  minify: true,
  external: ['vite', 'next', 'webpack', 'typescript'],
  dts: {
    entry: {
      index: 'src/index.ts',
      vite: 'src/vite.ts',
      next: 'src/next.ts',
    },
  },
  clean: true,
  esbuildOptions(options) {
    options.platform = 'node';
  },
  async onSuccess() {
    // CLI 파일에 shebang 추가
    const fs = await import('fs/promises');

    for (const file of ['dist/cli.js', 'dist/cli.cjs']) {
      try {
        const content = await fs.readFile(file, 'utf-8');
        if (!content.startsWith('#!/usr/bin/env node')) {
          await fs.writeFile(file, `#!/usr/bin/env node\n${content}`);
        }
        await fs.chmod(file, 0o755);
      } catch {}
    }
  },
});
