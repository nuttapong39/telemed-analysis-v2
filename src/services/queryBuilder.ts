// =============================================================================
// BMS Session KPI Dashboard - Query Builder (T021)
// Database-type-aware SQL generation
// =============================================================================

import type { DatabaseType } from '@/types';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** MySQL → PostgreSQL date-format token mapping */
const FORMAT_TOKEN_MAP: Record<string, string> = {
  '%Y': 'YYYY',
  '%m': 'MM',
  '%d': 'DD',
  '%H': 'HH24',
  '%i': 'MI',
  '%s': 'SS',
};

/**
 * Convert a MySQL-style format string (%Y-%m-%d) to its PostgreSQL equivalent
 * (YYYY-MM-DD).
 */
function convertFormat(mysqlFormat: string): string {
  let pgFormat = mysqlFormat;
  for (const [token, replacement] of Object.entries(FORMAT_TOKEN_MAP)) {
    pgFormat = pgFormat.replaceAll(token, replacement);
  }
  return pgFormat;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Returns the SQL expression for "today" in the target database. */
function currentDate(dbType: DatabaseType): string {
  return dbType === 'mysql' ? 'CURDATE()' : 'CURRENT_DATE';
}

/**
 * Wraps a column / expression in the database-specific date-formatting
 * function.
 *
 * @param format - MySQL-style format string (e.g. `'%Y-%m-%d'`).
 */
function dateFormat(dbType: DatabaseType, column: string, format: string): string {
  if (dbType === 'mysql') {
    return `DATE_FORMAT(${column}, '${format}')`;
  }
  return `TO_CHAR(${column}, '${convertFormat(format)}')`;
}

/** Generates the expression for "current date minus N days". */
function dateSubtract(dbType: DatabaseType, days: number): string {
  if (dbType === 'mysql') {
    return `DATE_SUB(CURDATE(), INTERVAL ${days} DAY)`;
  }
  return `CURRENT_DATE - INTERVAL '${days} days'`;
}

/** Calculates age in years from a birthday column. */
function ageCalc(dbType: DatabaseType, birthdayCol: string): string {
  if (dbType === 'mysql') {
    return `TIMESTAMPDIFF(YEAR, ${birthdayCol}, CURDATE())`;
  }
  return `EXTRACT(YEAR FROM AGE(${birthdayCol}))`;
}

/** Extracts the hour (as integer) from a time / datetime column. */
function hourExtract(dbType: DatabaseType, timeCol: string): string {
  if (dbType === 'mysql') {
    return `HOUR(${timeCol})`;
  }
  return `EXTRACT(HOUR FROM ${timeCol})::int`;
}

/** Database-specific random number function. */
function random(dbType: DatabaseType): string {
  return dbType === 'mysql' ? 'RAND()' : 'RANDOM()';
}

/**
 * Casts a column to text. MySQL's CAST(x AS CHAR) returns full string,
 * but PostgreSQL's CHAR without length truncates to 1 character.
 */
function castToText(dbType: DatabaseType, column: string): string {
  return dbType === 'mysql' ? `CAST(${column} AS CHAR)` : `${column}::text`;
}

/**
 * Determine the {@link DatabaseType} from a raw `SELECT VERSION()` string.
 *
 * Falls back to `'mysql'` when the string is unrecognisable.
 */
function detectDatabaseType(versionString: string): DatabaseType {
  const lower = versionString.toLowerCase();
  if (lower.includes('mysql') || lower.includes('mariadb')) {
    return 'mysql';
  }
  if (lower.includes('postgresql') || lower.includes('postgres')) {
    return 'postgresql';
  }
  return 'mysql';
}

// ---------------------------------------------------------------------------
// Exported module
// ---------------------------------------------------------------------------

export const queryBuilder = {
  currentDate,
  dateFormat,
  dateSubtract,
  ageCalc,
  hourExtract,
  random,
  castToText,
  detectDatabaseType,
} as const;
