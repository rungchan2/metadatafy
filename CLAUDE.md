# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**metadatafy** is a build plugin that extracts project metadata from codebases. It supports:
- CLI tool (`npx metadatafy analyze`)
- Vite plugin (`metadatafy/vite`)
- Next.js plugin (`metadatafy/next`)

The primary use case is for a ticket analysis system that automatically identifies relevant code files based on ticket descriptions.

## Tech Stack

- **Language**: TypeScript
- **Build Tool**: tsup
- **Test Framework**: vitest
- **Target Platforms**: Node.js (Vite/Next.js build plugins)

## Project Structure

```
src/
├── index.ts              # Main entry point (library exports)
├── vite.ts               # Vite plugin entry
├── next.ts               # Next.js plugin entry
├── cli.ts                # CLI entry point
├── core/
│   ├── types.ts          # Type definitions
│   ├── config.ts         # Configuration schema and defaults
│   ├── analyzer.ts       # Main analysis orchestrator
│   ├── parsers/
│   │   ├── typescript-parser.ts  # TypeScript AST parsing
│   │   └── sql-parser.ts         # SQL migration parsing
│   ├── extractors/
│   │   ├── import-extractor.ts   # Extract import statements
│   │   ├── export-extractor.ts   # Extract export statements
│   │   ├── props-extractor.ts    # Extract React component props
│   │   └── keyword-extractor.ts  # Generate search keywords
│   ├── resolvers/
│   │   ├── dependency-resolver.ts  # Resolve import paths
│   │   └── call-graph-builder.ts   # Build file dependency graph
│   └── output/
│       ├── file-writer.ts   # JSON file output
│       └── api-sender.ts    # API endpoint output
├── adapters/
│   ├── vite-adapter.ts    # Vite plugin implementation
│   └── next-adapter.ts    # Next.js webpack plugin
└── utils/
    ├── naming-utils.ts    # camelCase/PascalCase splitting
    ├── korean-mapper.ts   # English-Korean keyword mapping
    └── id-utils.ts        # ID generation
```

## Common Commands

```bash
# Install dependencies
npm install

# Build the package
npm run build

# Run type checking
npm run typecheck

# Run tests
npm test

# Development mode (watch)
npm run dev
```

## Key Design Decisions

1. **TypeScript AST Parsing**: Uses the built-in `typescript` package for accurate AST parsing instead of regex-based approaches.

2. **Separate Build Configs**: tsup builds library and CLI separately to handle shebang properly for CLI.

3. **Korean Keyword Support**: Built-in English-Korean keyword mapping for Korean-speaking development teams.

4. **Framework Adapters**: Core logic is framework-agnostic; adapters wrap it for Vite/Next.js.

## Publishing

```bash
npm publish --access public
```

Package name: `metadatafy`
NPM: https://www.npmjs.com/package/metadatafy
GitHub: https://github.com/rungchan2/metadatafy
