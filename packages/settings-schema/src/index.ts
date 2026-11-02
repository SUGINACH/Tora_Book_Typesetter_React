/**
 * index.ts — @tora/settings-schema (שלב 30): מרשם, ייבוא, EffectiveSettings,
 * configHash קנוני ומיגרציות (אפיון §6.3 · תכנית שלב 30).
 */
export const PACKAGE_NAME = '@tora/settings-schema' as const;
export const SCHEMA_VERSION = 1 as const;

export * from './errors.js';
export * from './schema.js';
export * from './migrations.js';
