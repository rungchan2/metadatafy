import ts from 'typescript';
import type { FileType } from '../types';

/**
 * 코드 패턴 기반 파일 타입 감지 결과
 */
export interface DetectionResult {
  type: FileType;
  confidence: number; // 0-1 사이의 신뢰도
  reasons: string[];  // 감지 이유
}

/**
 * 코드 패턴 분석을 통한 파일 타입 감지기
 * 폴더 구조나 파일명에 의존하지 않고 실제 코드 내용을 분석
 */
export class CodePatternDetector {
  /**
   * 소스 파일을 분석하여 파일 타입 감지
   */
  detect(sourceFile: ts.SourceFile): DetectionResult | null {
    const detections: DetectionResult[] = [];

    // 각 패턴 감지 실행
    const hookResult = this.detectHook(sourceFile);
    if (hookResult) detections.push(hookResult);

    const componentResult = this.detectComponent(sourceFile);
    if (componentResult) detections.push(componentResult);

    const apiRouteResult = this.detectApiRoute(sourceFile);
    if (apiRouteResult) detections.push(apiRouteResult);

    const serviceResult = this.detectService(sourceFile);
    if (serviceResult) detections.push(serviceResult);

    const utilityResult = this.detectUtility(sourceFile);
    if (utilityResult) detections.push(utilityResult);

    // 가장 높은 신뢰도의 결과 반환
    if (detections.length === 0) return null;

    return detections.sort((a, b) => b.confidence - a.confidence)[0];
  }

  /**
   * Hook 감지: React Hook 패턴
   * - 함수 이름이 use로 시작
   * - useState, useEffect 등 다른 훅 호출
   */
  private detectHook(sourceFile: ts.SourceFile): DetectionResult | null {
    const reasons: string[] = [];
    let score = 0;

    const hookCalls = new Set<string>();
    const functionNames: string[] = [];

    const visit = (node: ts.Node) => {
      // 함수 선언 확인
      if (ts.isFunctionDeclaration(node) && node.name) {
        const name = node.name.text;
        functionNames.push(name);
        if (name.startsWith('use') && name.length > 3 && name[3] === name[3].toUpperCase()) {
          reasons.push(`함수 '${name}'가 use로 시작 (Hook 네이밍 컨벤션)`);
          score += 0.4;
        }
      }

      // 변수 선언에서 화살표 함수 확인
      if (ts.isVariableDeclaration(node) && node.name && ts.isIdentifier(node.name)) {
        const name = node.name.text;
        functionNames.push(name);
        if (name.startsWith('use') && name.length > 3 && name[3] === name[3].toUpperCase()) {
          reasons.push(`함수 '${name}'가 use로 시작 (Hook 네이밍 컨벤션)`);
          score += 0.4;
        }
      }

      // Hook 호출 감지 (useState, useEffect 등)
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
        const callName = node.expression.text;
        if (callName.startsWith('use') && callName.length > 3) {
          hookCalls.add(callName);
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);

    // React 훅 사용 확인
    const reactHooks = ['useState', 'useEffect', 'useCallback', 'useMemo', 'useRef', 'useContext', 'useReducer'];
    const usedReactHooks = reactHooks.filter(h => hookCalls.has(h));

    if (usedReactHooks.length > 0) {
      reasons.push(`React Hook 사용: ${usedReactHooks.join(', ')}`);
      score += 0.2 * Math.min(usedReactHooks.length, 3);
    }

    // 커스텀 훅 호출 확인 (useXxx)
    const customHookCalls = Array.from(hookCalls).filter(h => !reactHooks.includes(h));
    if (customHookCalls.length > 0) {
      reasons.push(`커스텀 Hook 호출: ${customHookCalls.slice(0, 3).join(', ')}`);
      score += 0.1;
    }

    if (score < 0.3) return null;

    return {
      type: 'hook',
      confidence: Math.min(score, 1),
      reasons,
    };
  }

  /**
   * Component 감지: React Component 패턴
   * - JSX 반환
   * - props 매개변수 사용
   */
  private detectComponent(sourceFile: ts.SourceFile): DetectionResult | null {
    const reasons: string[] = [];
    let score = 0;

    let hasJsxReturn = false;
    let hasPropsParam = false;
    let jsxElementCount = 0;

    const visit = (node: ts.Node) => {
      // JSX 요소 감지
      if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) {
        jsxElementCount++;
        hasJsxReturn = true;
      }

      // 함수 매개변수에서 props 패턴 확인
      if (ts.isFunctionDeclaration(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
        const params = node.parameters;
        if (params.length > 0) {
          const firstParam = params[0];
          if (firstParam.name) {
            const paramName = firstParam.name.getText(sourceFile);
            if (paramName === 'props' || paramName.startsWith('{')) {
              hasPropsParam = true;
            }
          }
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);

    if (hasJsxReturn) {
      reasons.push('JSX 요소 반환');
      score += 0.5;

      if (jsxElementCount > 3) {
        reasons.push(`다수의 JSX 요소 (${jsxElementCount}개)`);
        score += 0.2;
      }
    }

    if (hasPropsParam) {
      reasons.push('props 매개변수 사용');
      score += 0.2;
    }

    // 파일 확장자가 .tsx/.jsx인 경우 추가 점수
    if (sourceFile.fileName.match(/\.(tsx|jsx)$/)) {
      score += 0.1;
    }

    if (score < 0.4) return null;

    return {
      type: 'component',
      confidence: Math.min(score, 1),
      reasons,
    };
  }

  /**
   * API Route 감지: Next.js API Route / Route Handler 패턴
   * - GET, POST, PUT, DELETE, PATCH export
   * - NextRequest/NextResponse 사용
   */
  private detectApiRoute(sourceFile: ts.SourceFile): DetectionResult | null {
    const reasons: string[] = [];
    let score = 0;

    const httpMethods = new Set<string>();
    let hasNextRequest = false;
    let hasNextResponse = false;

    const visit = (node: ts.Node) => {
      // HTTP 메서드 export 감지
      if (ts.isFunctionDeclaration(node) && node.name) {
        const name = node.name.text;
        if (['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'].includes(name)) {
          const modifiers = ts.getModifiers(node);
          const isExported = modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword);
          if (isExported) {
            httpMethods.add(name);
          }
        }
      }

      // export const GET = ... 패턴
      if (ts.isVariableStatement(node)) {
        const modifiers = ts.getModifiers(node);
        const isExported = modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword);
        if (isExported) {
          for (const decl of node.declarationList.declarations) {
            if (ts.isIdentifier(decl.name)) {
              const name = decl.name.text;
              if (['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'].includes(name)) {
                httpMethods.add(name);
              }
            }
          }
        }
      }

      // NextRequest/NextResponse import 확인
      if (ts.isImportDeclaration(node)) {
        const moduleSpecifier = node.moduleSpecifier;
        if (ts.isStringLiteral(moduleSpecifier)) {
          const moduleName = moduleSpecifier.text;
          if (moduleName === 'next/server') {
            const clause = node.importClause;
            if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
              for (const element of clause.namedBindings.elements) {
                const name = element.name.text;
                if (name === 'NextRequest') hasNextRequest = true;
                if (name === 'NextResponse') hasNextResponse = true;
              }
            }
          }
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);

    if (httpMethods.size > 0) {
      reasons.push(`HTTP 메서드 export: ${Array.from(httpMethods).join(', ')}`);
      score += 0.6;
    }

    if (hasNextRequest || hasNextResponse) {
      reasons.push('Next.js server import (NextRequest/NextResponse)');
      score += 0.3;
    }

    if (score < 0.5) return null;

    return {
      type: 'api',
      confidence: Math.min(score, 1),
      reasons,
    };
  }

  /**
   * Service 감지: API 호출 및 데이터 처리 패턴
   * - fetch, axios 사용
   * - 다수의 async 함수
   * - 클래스 기반 서비스
   */
  private detectService(sourceFile: ts.SourceFile): DetectionResult | null {
    const reasons: string[] = [];
    let score = 0;

    let fetchCount = 0;
    let axiosCount = 0;
    let asyncFunctionCount = 0;
    let hasServiceClass = false;

    const visit = (node: ts.Node) => {
      // fetch 호출 감지
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
        if (node.expression.text === 'fetch') {
          fetchCount++;
        }
      }

      // axios 호출 감지
      if (ts.isCallExpression(node)) {
        const expr = node.expression;
        // axios.get, axios.post 등
        if (ts.isPropertyAccessExpression(expr) && ts.isIdentifier(expr.expression)) {
          if (expr.expression.text === 'axios') {
            axiosCount++;
          }
        }
        // axios() 직접 호출
        if (ts.isIdentifier(expr) && expr.text === 'axios') {
          axiosCount++;
        }
      }

      // async 함수 카운트
      if (ts.isFunctionDeclaration(node) || ts.isArrowFunction(node) || ts.isMethodDeclaration(node)) {
        const modifiers = ts.getModifiers(node);
        if (modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword)) {
          asyncFunctionCount++;
        }
      }

      // Service 클래스 감지
      if (ts.isClassDeclaration(node) && node.name) {
        const className = node.name.text;
        if (className.toLowerCase().includes('service') ||
            className.toLowerCase().includes('api') ||
            className.toLowerCase().includes('client')) {
          hasServiceClass = true;
          reasons.push(`서비스 클래스: ${className}`);
          score += 0.5;
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);

    if (fetchCount > 0) {
      reasons.push(`fetch 호출 ${fetchCount}회`);
      score += 0.2 * Math.min(fetchCount, 3);
    }

    if (axiosCount > 0) {
      reasons.push(`axios 호출 ${axiosCount}회`);
      score += 0.2 * Math.min(axiosCount, 3);
    }

    if (asyncFunctionCount >= 2) {
      reasons.push(`async 함수 ${asyncFunctionCount}개`);
      score += 0.15;
    }

    if (score < 0.3) return null;

    return {
      type: 'service',
      confidence: Math.min(score, 1),
      reasons,
    };
  }

  /**
   * Utility 감지: 유틸리티 함수 패턴
   * - 다수의 순수 함수 export
   * - DOM/React 의존성 없음
   * - 재사용 가능한 헬퍼 함수
   */
  private detectUtility(sourceFile: ts.SourceFile): DetectionResult | null {
    const reasons: string[] = [];
    let score = 0;

    let exportedFunctionCount = 0;
    let hasReactImport = false;
    let hasJsx = false;
    const exportedNames: string[] = [];

    const visit = (node: ts.Node) => {
      // React import 확인
      if (ts.isImportDeclaration(node)) {
        const moduleSpecifier = node.moduleSpecifier;
        if (ts.isStringLiteral(moduleSpecifier)) {
          const moduleName = moduleSpecifier.text;
          if (moduleName === 'react' || moduleName.startsWith('react/')) {
            hasReactImport = true;
          }
        }
      }

      // JSX 확인
      if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
        hasJsx = true;
      }

      // export된 함수 카운트
      if (ts.isFunctionDeclaration(node) && node.name) {
        const modifiers = ts.getModifiers(node);
        const isExported = modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword);
        if (isExported) {
          exportedFunctionCount++;
          exportedNames.push(node.name.text);
        }
      }

      // export const fn = () => {} 패턴
      if (ts.isVariableStatement(node)) {
        const modifiers = ts.getModifiers(node);
        const isExported = modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword);
        if (isExported) {
          for (const decl of node.declarationList.declarations) {
            if (decl.initializer && (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer))) {
              if (ts.isIdentifier(decl.name)) {
                exportedFunctionCount++;
                exportedNames.push(decl.name.text);
              }
            }
          }
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);

    // JSX나 React 의존성이 있으면 유틸리티가 아님
    if (hasJsx || hasReactImport) return null;

    if (exportedFunctionCount >= 2) {
      reasons.push(`${exportedFunctionCount}개의 함수 export`);
      score += 0.3 + (0.1 * Math.min(exportedFunctionCount - 2, 5));
    }

    // 유틸리티 관련 함수명 패턴
    const utilityPatterns = ['format', 'parse', 'convert', 'validate', 'is', 'has', 'get', 'set', 'create', 'generate', 'calculate', 'transform'];
    const matchingNames = exportedNames.filter(name =>
      utilityPatterns.some(pattern => name.toLowerCase().startsWith(pattern))
    );

    if (matchingNames.length > 0) {
      reasons.push(`유틸리티 함수명 패턴: ${matchingNames.slice(0, 3).join(', ')}`);
      score += 0.2;
    }

    if (score < 0.3) return null;

    return {
      type: 'utility',
      confidence: Math.min(score, 1),
      reasons,
    };
  }
}

export const codePatternDetector = new CodePatternDetector();
