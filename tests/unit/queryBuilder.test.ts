// =============================================================================
// T013 - Query Builder Tests
// Tests database-type-aware SQL generation for MySQL and PostgreSQL
// =============================================================================

import { describe, it, expect } from 'vitest';
import { queryBuilder } from '@/services/queryBuilder';

// ---------------------------------------------------------------------------
// currentDate
// ---------------------------------------------------------------------------

describe('queryBuilder.currentDate', () => {
  it('returns CURDATE() for MySQL', () => {
    expect(queryBuilder.currentDate('mysql')).toBe('CURDATE()');
  });

  it('returns CURRENT_DATE for PostgreSQL', () => {
    expect(queryBuilder.currentDate('postgresql')).toBe('CURRENT_DATE');
  });
});

// ---------------------------------------------------------------------------
// dateFormat
// ---------------------------------------------------------------------------

describe('queryBuilder.dateFormat', () => {
  describe('MySQL', () => {
    it('wraps column with DATE_FORMAT and preserves MySQL tokens', () => {
      const result = queryBuilder.dateFormat('mysql', 'created_at', '%Y-%m-%d');
      expect(result).toBe("DATE_FORMAT(created_at, '%Y-%m-%d')");
    });

    it('handles time format tokens', () => {
      const result = queryBuilder.dateFormat('mysql', 'visit_time', '%H:%i:%s');
      expect(result).toBe("DATE_FORMAT(visit_time, '%H:%i:%s')");
    });

    it('handles mixed date and time format', () => {
      const result = queryBuilder.dateFormat('mysql', 'ts', '%Y-%m-%d %H:%i');
      expect(result).toBe("DATE_FORMAT(ts, '%Y-%m-%d %H:%i')");
    });
  });

  describe('PostgreSQL', () => {
    it('wraps column with TO_CHAR and converts tokens to PostgreSQL format', () => {
      const result = queryBuilder.dateFormat('postgresql', 'created_at', '%Y-%m-%d');
      expect(result).toBe("TO_CHAR(created_at, 'YYYY-MM-DD')");
    });

    it('converts time format tokens', () => {
      const result = queryBuilder.dateFormat('postgresql', 'visit_time', '%H:%i:%s');
      expect(result).toBe("TO_CHAR(visit_time, 'HH24:MI:SS')");
    });

    it('converts mixed date and time format', () => {
      const result = queryBuilder.dateFormat('postgresql', 'ts', '%Y-%m-%d %H:%i');
      expect(result).toBe("TO_CHAR(ts, 'YYYY-MM-DD HH24:MI')");
    });
  });
});

// ---------------------------------------------------------------------------
// dateSubtract
// ---------------------------------------------------------------------------

describe('queryBuilder.dateSubtract', () => {
  describe('MySQL', () => {
    it('returns DATE_SUB with INTERVAL for 7 days', () => {
      expect(queryBuilder.dateSubtract('mysql', 7)).toBe(
        'DATE_SUB(CURDATE(), INTERVAL 7 DAY)',
      );
    });

    it('returns DATE_SUB with INTERVAL for 30 days', () => {
      expect(queryBuilder.dateSubtract('mysql', 30)).toBe(
        'DATE_SUB(CURDATE(), INTERVAL 30 DAY)',
      );
    });

    it('handles 0 days', () => {
      expect(queryBuilder.dateSubtract('mysql', 0)).toBe(
        'DATE_SUB(CURDATE(), INTERVAL 0 DAY)',
      );
    });
  });

  describe('PostgreSQL', () => {
    it('returns CURRENT_DATE minus INTERVAL for 7 days', () => {
      expect(queryBuilder.dateSubtract('postgresql', 7)).toBe(
        "CURRENT_DATE - INTERVAL '7 days'",
      );
    });

    it('returns CURRENT_DATE minus INTERVAL for 30 days', () => {
      expect(queryBuilder.dateSubtract('postgresql', 30)).toBe(
        "CURRENT_DATE - INTERVAL '30 days'",
      );
    });

    it('handles 1 day', () => {
      expect(queryBuilder.dateSubtract('postgresql', 1)).toBe(
        "CURRENT_DATE - INTERVAL '1 days'",
      );
    });
  });
});

// ---------------------------------------------------------------------------
// ageCalc
// ---------------------------------------------------------------------------

describe('queryBuilder.ageCalc', () => {
  it('returns TIMESTAMPDIFF(YEAR, ...) for MySQL', () => {
    const result = queryBuilder.ageCalc('mysql', 'birthday');
    expect(result).toBe('TIMESTAMPDIFF(YEAR, birthday, CURDATE())');
  });

  it('returns EXTRACT(YEAR FROM AGE(...)) for PostgreSQL', () => {
    const result = queryBuilder.ageCalc('postgresql', 'birthday');
    expect(result).toBe('EXTRACT(YEAR FROM AGE(birthday))');
  });

  it('uses the column name as provided for MySQL', () => {
    const result = queryBuilder.ageCalc('mysql', 'p.date_of_birth');
    expect(result).toBe('TIMESTAMPDIFF(YEAR, p.date_of_birth, CURDATE())');
  });

  it('uses the column name as provided for PostgreSQL', () => {
    const result = queryBuilder.ageCalc('postgresql', 'p.date_of_birth');
    expect(result).toBe('EXTRACT(YEAR FROM AGE(p.date_of_birth))');
  });
});

// ---------------------------------------------------------------------------
// hourExtract
// ---------------------------------------------------------------------------

describe('queryBuilder.hourExtract', () => {
  it('returns HOUR() for MySQL', () => {
    const result = queryBuilder.hourExtract('mysql', 'visit_time');
    expect(result).toBe('HOUR(visit_time)');
  });

  it('returns EXTRACT(HOUR FROM ...)::int for PostgreSQL', () => {
    const result = queryBuilder.hourExtract('postgresql', 'visit_time');
    expect(result).toBe('EXTRACT(HOUR FROM visit_time)::int');
  });

  it('handles qualified column names for MySQL', () => {
    const result = queryBuilder.hourExtract('mysql', 'o.vsttime');
    expect(result).toBe('HOUR(o.vsttime)');
  });

  it('handles qualified column names for PostgreSQL', () => {
    const result = queryBuilder.hourExtract('postgresql', 'o.vsttime');
    expect(result).toBe('EXTRACT(HOUR FROM o.vsttime)::int');
  });
});

// ---------------------------------------------------------------------------
// random
// ---------------------------------------------------------------------------

describe('queryBuilder.random', () => {
  it('returns RAND() for MySQL', () => {
    expect(queryBuilder.random('mysql')).toBe('RAND()');
  });

  it('returns RANDOM() for PostgreSQL', () => {
    expect(queryBuilder.random('postgresql')).toBe('RANDOM()');
  });
});

// ---------------------------------------------------------------------------
// detectDatabaseType
// ---------------------------------------------------------------------------

describe('queryBuilder.detectDatabaseType', () => {
  it('detects MySQL from version string', () => {
    expect(queryBuilder.detectDatabaseType('MySQL 8.0')).toBe('mysql');
  });

  it('detects MySQL from version string (case insensitive)', () => {
    expect(queryBuilder.detectDatabaseType('mysql 5.7.42')).toBe('mysql');
  });

  it('detects MariaDB as mysql', () => {
    expect(queryBuilder.detectDatabaseType('MariaDB 10.5')).toBe('mysql');
  });

  it('detects MariaDB as mysql (case insensitive)', () => {
    expect(queryBuilder.detectDatabaseType('10.11.8-mariadb-0ubuntu0.24.04.1')).toBe(
      'mysql',
    );
  });

  it('detects PostgreSQL', () => {
    expect(queryBuilder.detectDatabaseType('PostgreSQL 16.4')).toBe('postgresql');
  });

  it('detects PostgreSQL (lowercase)', () => {
    expect(queryBuilder.detectDatabaseType('postgresql 15.0')).toBe('postgresql');
  });

  it('detects Postgres shorthand', () => {
    expect(queryBuilder.detectDatabaseType('postgres 14.2')).toBe('postgresql');
  });

  it('defaults to mysql for unknown version strings', () => {
    expect(queryBuilder.detectDatabaseType('unknown')).toBe('mysql');
  });

  it('defaults to mysql for empty string', () => {
    expect(queryBuilder.detectDatabaseType('')).toBe('mysql');
  });

  it('defaults to mysql for version strings without db name', () => {
    expect(queryBuilder.detectDatabaseType('8.0.32')).toBe('mysql');
  });
});
