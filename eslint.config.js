// eslint.config.js — חבילות התכנית בלבד (שלב 8 בתכנית 100 השלבים).
// הקוד הישן ב־src/ ותיקיות אחרות אינן בתחום הקובץ הזה (כלל 8).
// אסמכתא: אפיון §5 (כללי תלות) · תכנית שלב 8: איסור DOM/Node globals בחבילות ליבה.
import plugin from '@typescript-eslint/eslint-plugin';
import parser from '@typescript-eslint/parser';

// חבילות הליבה: הכול למעט cli (מארח Node) ו־test-fixtures (נתונים)
const CORE_PACKAGES = [
  'content-model', 'settings-schema', 'measurement-api', 'layout-api', 'layout-engine',
  'policy-torah', 'measurement-harfbuzz', 'audit-core', 'render-html', 'export-pdf',
];
const CORE_GLOB = `packages/{${CORE_PACKAGES.join(',')}}/src/**/*.ts`;

// גלובלים של דפדפן — אסורים בכל חבילות התכנית (הליבה טהורה מדפדפן)
const BROWSER_GLOBALS = [
  'document', 'window', 'navigator', 'localStorage', 'sessionStorage', 'location',
  'history', 'HTMLElement', 'HTMLCanvasElement', 'HTMLImageElement', 'Image',
  'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'matchMedia',
  'DOMParser', 'XMLSerializer', 'ResizeObserver', 'IntersectionObserver', 'MutationObserver',
  'fetch', 'Worker', 'SharedWorker', 'indexedDB', 'caches', 'self',
];
// גלובלים של Node — אסורים בחבילות הליבה (חייבות לרוץ גם ב־Web Worker)
const NODE_GLOBALS = [
  'process', 'Buffer', 'global', 'require', 'module', 'exports',
  '__dirname', '__filename', 'setImmediate', 'clearImmediate',
];

export default [
  {
    ignores: [
      '**/dist/**', 'src/**', 'tests/**', 'scripts/**', 'public/**',
      'packages/test-fixtures/**', '*.config.*', 'packages/*/tsconfig.json',
    ],
  },
  {
    files: ['packages/*/src/**/*.ts'],
    languageOptions: {
      parser,
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    plugins: { '@typescript-eslint': plugin },
    rules: {
      ...plugin.configs.recommended.rules,
      'no-restricted-globals': ['error', ...BROWSER_GLOBALS],
    },
  },
  {
    // ליבה: גם גלובלים של Node אסורים
    files: [CORE_GLOB],
    rules: {
      'no-restricted-globals': ['error', ...BROWSER_GLOBALS, ...NODE_GLOBALS],
    },
  },
  {
    // ליבה: אין יבוא מודולי Node או ספריות דפדפן/ממשק
    files: [CORE_GLOB],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['node:*', 'fs', 'fs/promises', 'path', 'os', 'url', 'util', 'events',
              'stream', 'crypto', 'assert', 'worker_threads', 'child_process', 'readline'],
            message: 'ליבת המנוע אסורה בהם APIs של Node — היא חייבת לרוץ זהה ב־Node, ב־Web Worker, ב־CLI וב־Tauri (אפיון §5, כלל 2 בתכנית).',
          },
          {
            group: ['react', 'react-dom', 'react-dom/*', 'zustand', 'zustand/*'],
            message: 'חבילות ליבה אינן מייבאות React/Zustand — המעטפת צורכת את הליבה, לא להפך (אפיון §5).',
          },
        ],
      }],
    },
  },
  {
    // render-html: אינו קורא DOM ואינו מודד מחדש — איסור יבוא measurement (אפיון §5)
    files: ['packages/render-html/src/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['@tora/measurement-api', '@tora/measurement-harfbuzz'],
            message: 'render-html אינו מודד מחדש — הוא מיטל של Layout IR בלבד (אפיון §5).',
          },
        ],
      }],
    },
  },
];
