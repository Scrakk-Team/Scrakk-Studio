// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

export type SymbolKind = 
  | 'file' | 'module' | 'namespace' | 'package' 
  | 'class' | 'method' | 'property' | 'field' 
  | 'constructor' | 'enum' | 'interface' | 'function' 
  | 'variable' | 'constant' | 'string' | 'number' 
  | 'boolean' | 'array' | 'object' | 'key' 
  | 'null' | 'enumMember' | 'struct' | 'event' 
  | 'operator' | 'typeParameter';

export interface DocumentSymbol {
  name: string;
  kind: SymbolKind;
  line: number;
  endLine?: number;
  children?: DocumentSymbol[];
  detail?: string;
}

// Iconos SVG para cada tipo de símbolo (como VS Code)
export const SymbolIcons: Record<SymbolKind, { icon: string; color: string }> = {
  file: { icon: '📄', color: '#cccccc' },
  module: { icon: 'M', color: '#CE9178' },
  namespace: { icon: 'N', color: '#4EC9B0' },
  package: { icon: 'P', color: '#CE9178' },
  class: { icon: 'C', color: '#4EC9B0' },
  method: { icon: 'ƒ', color: '#DCDCAA' },
  property: { icon: 'P', color: '#9CDCFE' },
  field: { icon: 'F', color: '#9CDCFE' },
  constructor: { icon: 'C', color: '#DCDCAA' },
  enum: { icon: 'E', color: '#4EC9B0' },
  interface: { icon: 'I', color: '#4EC9B0' },
  function: { icon: 'ƒ', color: '#DCDCAA' },
  variable: { icon: 'V', color: '#9CDCFE' },
  constant: { icon: 'K', color: '#4FC1FF' },
  string: { icon: 'S', color: '#CE9178' },
  number: { icon: '#', color: '#B5CEA8' },
  boolean: { icon: 'B', color: '#569CD6' },
  array: { icon: '[]', color: '#9CDCFE' },
  object: { icon: '{}', color: '#9CDCFE' },
  key: { icon: 'K', color: '#9CDCFE' },
  null: { icon: 'N', color: '#569CD6' },
  enumMember: { icon: 'E', color: '#4FC1FF' },
  struct: { icon: 'S', color: '#4EC9B0' },
  event: { icon: 'E', color: '#DCDCAA' },
  operator: { icon: 'O', color: '#D4D4D4' },
  typeParameter: { icon: 'T', color: '#4EC9B0' },
};

export function extractSymbols(content: string, filename: string): DocumentSymbol[] {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const lines = content.split('\n');
  
  // Detectar lenguaje
  const isTS = ['ts', 'tsx'].includes(ext);
  const isJS = ['js', 'jsx', 'mjs', 'cjs'].includes(ext);
  const isPython = ext === 'py';
  const isCSS = ['css', 'scss', 'sass', 'less'].includes(ext);
  const isJSON = ext === 'json';
  const isHTML = ['html', 'htm', 'xml', 'svg'].includes(ext);
  
  if (isTS || isJS) return extractJSSymbols(lines, isTS);
  if (isPython) return extractPythonSymbols(lines);
  if (isCSS) return extractCSSSymbols(lines);
  if (isJSON) return extractJSONSymbols(content);
  if (isHTML) return extractHTMLSymbols(lines);
  
  return extractGenericSymbols(lines);
}

function extractJSSymbols(lines: string[], isTS: boolean): DocumentSymbol[] {
  const symbols: DocumentSymbol[] = [];
  const stack: { symbol: DocumentSymbol; indent: number }[] = [];
  
  lines.forEach((line, index) => {
    const lineNum = index + 1;
    const trimmed = line.trim();
    const indent = line.search(/\S/);
    if (indent === -1) return;

    // Imports
    if (/^import\s+/.test(trimmed)) {
      const match = trimmed.match(/^import\s+(?:{([^}]+)}|(\w+)|\*\s+as\s+(\w+))\s+from/);
      if (match) {
        const name = match[1]?.split(',')[0]?.trim() || match[2] || match[3] || 'import';
        symbols.push({ name: `import ${name}`, kind: 'module', line: lineNum });
      }
      return;
    }

    // Classes
    const classMatch = trimmed.match(/^(export\s+)?(default\s+)?class\s+(\w+)/);
    if (classMatch) {
      const classSymbol: DocumentSymbol = { 
        name: classMatch[3], 
        kind: 'class', 
        line: lineNum,
        children: []
      };
      symbols.push(classSymbol);
      stack.push({ symbol: classSymbol, indent });
      return;
    }

    // Interfaces (TS)
    if (isTS) {
      const interfaceMatch = trimmed.match(/^(export\s+)?interface\s+(\w+)/);
      if (interfaceMatch) {
        const ifaceSymbol: DocumentSymbol = {
          name: interfaceMatch[2],
          kind: 'interface',
          line: lineNum,
          children: []
        };
        symbols.push(ifaceSymbol);
        stack.push({ symbol: ifaceSymbol, indent });
        return;
      }

      const typeMatch = trimmed.match(/^(export\s+)?type\s+(\w+)/);
      if (typeMatch) {
        symbols.push({ name: typeMatch[2], kind: 'typeParameter', line: lineNum });
        return;
      }
    }

    // Enums
    const enumMatch = trimmed.match(/^(export\s+)?enum\s+(\w+)/);
    if (enumMatch) {
      const enumSymbol: DocumentSymbol = {
        name: enumMatch[2],
        kind: 'enum',
        line: lineNum,
        children: []
      };
      symbols.push(enumSymbol);
      stack.push({ symbol: enumSymbol, indent });
      return;
    }

    // Functions
    const funcMatch = trimmed.match(/^(export\s+)?(async\s+)?function\s+(\w+)/);
    if (funcMatch) {
      const funcSymbol: DocumentSymbol = {
        name: funcMatch[3],
        kind: 'function',
        line: lineNum,
        children: []
      };
      addToParentOrRoot(symbols, stack, funcSymbol, indent);
      stack.push({ symbol: funcSymbol, indent });
      return;
    }

    // Arrow functions / const functions
    const arrowMatch = trimmed.match(/^(export\s+)?(const|let|var)\s+(\w+)\s*=\s*(async\s*)?\(/);
    if (arrowMatch) {
      const funcSymbol: DocumentSymbol = {
        name: arrowMatch[3],
        kind: 'function',
        line: lineNum,
        children: []
      };
      addToParentOrRoot(symbols, stack, funcSymbol, indent);
      return;
    }

    // Function expressions
    const funcExprMatch = trimmed.match(/^(export\s+)?(const|let|var)\s+(\w+)\s*=\s*(async\s+)?function/);
    if (funcExprMatch) {
      symbols.push({ name: funcExprMatch[3], kind: 'function', line: lineNum });
      return;
    }

    // Methods inside class
    if (stack.length > 0) {
      const parent = stack[stack.length - 1];
      if (parent.symbol.kind === 'class' || parent.symbol.kind === 'interface') {
        // Method
        const methodMatch = trimmed.match(/^(async\s+)?(\w+)\s*\(/);
        if (methodMatch && !['if', 'for', 'while', 'switch', 'catch'].includes(methodMatch[2])) {
          parent.symbol.children = parent.symbol.children || [];
          parent.symbol.children.push({
            name: methodMatch[2],
            kind: methodMatch[2] === 'constructor' ? 'constructor' : 'method',
            line: lineNum
          });
          return;
        }

        // Property
        const propMatch = trimmed.match(/^(readonly\s+)?(private\s+|public\s+|protected\s+)?(\w+)\s*[=:;]/);
        if (propMatch) {
          parent.symbol.children = parent.symbol.children || [];
          parent.symbol.children.push({
            name: propMatch[3],
            kind: 'property',
            line: lineNum
          });
        }
      }
    }

    // Constants/Variables at top level
    const constMatch = trimmed.match(/^(export\s+)?(const|let|var)\s+(\w+)\s*=/);
    if (constMatch && stack.length === 0) {
      symbols.push({
        name: constMatch[3],
        kind: constMatch[2] === 'const' ? 'constant' : 'variable',
        line: lineNum
      });
    }
  });

  return symbols;
}

function addToParentOrRoot(
  symbols: DocumentSymbol[], 
  stack: { symbol: DocumentSymbol; indent: number }[], 
  symbol: DocumentSymbol, 
  indent: number
) {
  // Pop stack until we find a parent with less indent
  while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
    stack.pop();
  }
  
  if (stack.length > 0) {
    const parent = stack[stack.length - 1].symbol;
    parent.children = parent.children || [];
    parent.children.push(symbol);
  } else {
    symbols.push(symbol);
  }
}


function extractPythonSymbols(lines: string[]): DocumentSymbol[] {
  const symbols: DocumentSymbol[] = [];
  const stack: { symbol: DocumentSymbol; indent: number }[] = [];

  lines.forEach((line, index) => {
    const lineNum = index + 1;
    const trimmed = line.trim();
    const indent = line.search(/\S/);
    if (indent === -1) return;

    // Pop stack for dedent
    while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }

    // Class
    const classMatch = trimmed.match(/^class\s+(\w+)/);
    if (classMatch) {
      const classSymbol: DocumentSymbol = {
        name: classMatch[1],
        kind: 'class',
        line: lineNum,
        children: []
      };
      addToParentOrRoot(symbols, stack, classSymbol, indent);
      stack.push({ symbol: classSymbol, indent });
      return;
    }

    // Function/Method
    const funcMatch = trimmed.match(/^(async\s+)?def\s+(\w+)/);
    if (funcMatch) {
      const isMethod = stack.length > 0 && stack[stack.length - 1].symbol.kind === 'class';
      const funcSymbol: DocumentSymbol = {
        name: funcMatch[2],
        kind: isMethod ? 'method' : 'function',
        line: lineNum,
        children: []
      };
      addToParentOrRoot(symbols, stack, funcSymbol, indent);
      stack.push({ symbol: funcSymbol, indent });
    }
  });

  return symbols;
}

function extractCSSSymbols(lines: string[]): DocumentSymbol[] {
  const symbols: DocumentSymbol[] = [];

  lines.forEach((line, index) => {
    const lineNum = index + 1;
    const trimmed = line.trim();

    // CSS selectors
    const selectorMatch = trimmed.match(/^([.#@]?[\w-]+(?:\s*[,>+~]\s*[.#]?[\w-]+)*)\s*\{/);
    if (selectorMatch) {
      symbols.push({
        name: selectorMatch[1],
        kind: trimmed.startsWith('@') ? 'namespace' : 'class',
        line: lineNum
      });
    }
  });

  return symbols;
}

function extractJSONSymbols(content: string): DocumentSymbol[] {
  const symbols: DocumentSymbol[] = [];
  
  try {
    const obj = JSON.parse(content);
    const extractKeys = (o: any, prefix = ''): DocumentSymbol[] => {
      const result: DocumentSymbol[] = [];
      for (const key of Object.keys(o)) {
        const value = o[key];
        const symbol: DocumentSymbol = {
          name: key,
          kind: Array.isArray(value) ? 'array' : typeof value === 'object' && value !== null ? 'object' : 'key',
          line: 1, // JSON doesn't have line info easily
          children: typeof value === 'object' && value !== null ? extractKeys(value, `${prefix}${key}.`) : undefined
        };
        result.push(symbol);
      }
      return result;
    };
    return extractKeys(obj);
  } catch {
    return symbols;
  }
}

function extractHTMLSymbols(lines: string[]): DocumentSymbol[] {
  const symbols: DocumentSymbol[] = [];

  lines.forEach((line, index) => {
    const lineNum = index + 1;
    
    // Tags with id or class
    const tagMatch = line.match(/<(\w+)[^>]*(?:id=["']([^"']+)["']|class=["']([^"']+)["'])/);
    if (tagMatch) {
      const name = tagMatch[2] ? `#${tagMatch[2]}` : tagMatch[3] ? `.${tagMatch[3].split(' ')[0]}` : tagMatch[1];
      symbols.push({ name: `<${tagMatch[1]}> ${name}`, kind: 'struct', line: lineNum });
    }
  });

  return symbols;
}

function extractGenericSymbols(lines: string[]): DocumentSymbol[] {
  const symbols: DocumentSymbol[] = [];

  lines.forEach((line, index) => {
    const lineNum = index + 1;
    const trimmed = line.trim();

    // Generic function patterns
    const funcMatch = trimmed.match(/^(?:function|func|fn|def|sub|proc)\s+(\w+)/i);
    if (funcMatch) {
      symbols.push({ name: funcMatch[1], kind: 'function', line: lineNum });
    }

    // Generic class patterns
    const classMatch = trimmed.match(/^(?:class|struct|type)\s+(\w+)/i);
    if (classMatch) {
      symbols.push({ name: classMatch[1], kind: 'class', line: lineNum });
    }
  });

  return symbols;
}
