// =============================================================================
// T011 - Type Validation Tests
// Verifies that all type definitions compile correctly and accept valid values
// =============================================================================

import { describe, it, expect, expectTypeOf } from 'vitest';
import type {
  DatabaseType,
  SessionState,
  QueryState,
  Session,
  BmsSessionResponse,
  KpiSummary,
  DepartmentWorkload,
  DoctorWorkload,
  VisitTrend,
  HourlyDistribution,
  SystemInfo,
  UserInfo,
  ConnectionConfig,
  SqlApiResponse,
  SqlApiRequest,
  QueryResult,
  DemographicBreakdown,
  PatientTypeDistribution,
} from '@/types';

// ---------------------------------------------------------------------------
// DatabaseType
// ---------------------------------------------------------------------------

describe('DatabaseType', () => {
  it('accepts "mysql" as a valid value', () => {
    const dbType: DatabaseType = 'mysql';
    expect(dbType).toBe('mysql');
  });

  it('accepts "postgresql" as a valid value', () => {
    const dbType: DatabaseType = 'postgresql';
    expect(dbType).toBe('postgresql');
  });

  it('is a union of exactly "mysql" and "postgresql"', () => {
    expectTypeOf<DatabaseType>().toEqualTypeOf<'mysql' | 'postgresql'>();
  });
});

// ---------------------------------------------------------------------------
// SessionState
// ---------------------------------------------------------------------------

describe('SessionState', () => {
  const validStates: SessionState[] = ['idle', 'disconnected', 'connecting', 'connected', 'expired'];

  it.each(validStates)('accepts "%s" as a valid state', (state) => {
    const s: SessionState = state;
    expect(s).toBe(state);
    expectTypeOf(s).toEqualTypeOf<SessionState>();
  });

  it('is a union of exactly 5 states', () => {
    expectTypeOf<SessionState>().toEqualTypeOf<
      'idle' | 'disconnected' | 'connecting' | 'connected' | 'expired'
    >();
  });
});

// ---------------------------------------------------------------------------
// QueryState
// ---------------------------------------------------------------------------

describe('QueryState', () => {
  const validStates: QueryState[] = ['idle', 'loading', 'success', 'error'];

  it.each(validStates)('accepts "%s" as a valid state', (state) => {
    const q: QueryState = state;
    expect(q).toBe(state);
    expectTypeOf(q).toEqualTypeOf<QueryState>();
  });

  it('is a union of exactly 4 states', () => {
    expectTypeOf<QueryState>().toEqualTypeOf<'idle' | 'loading' | 'success' | 'error'>();
  });
});

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

describe('Session', () => {
  it('can be constructed with all required fields', () => {
    const session: Session = {
      sessionId: 'abc-123',
      apiUrl: 'https://example.com/api',
      bearerToken: 'token-xyz',
      databaseType: 'mysql',
      databaseName: 'hospital_db',
      expirySeconds: 3600,
      connectedAt: new Date('2026-01-01T00:00:00Z'),
      userInfo: {
        name: 'Dr. Smith',
        position: 'Physician',
        positionId: 1,
        hospitalCode: 'H001',
        doctorCode: 'D001',
        department: 'Internal Medicine',
        location: 'Building A',
        isHrAdmin: false,
        isDirector: false,
      },
      systemInfo: {
        version: '1.0.0',
        environment: 'production',
      },
      isLocalApi: false,
    };

    expect(session.sessionId).toBe('abc-123');
    expect(session.databaseType).toBe('mysql');
    expect(session.connectedAt).toBeInstanceOf(Date);
    expectTypeOf(session).toExtend<Session>();
  });

  it('has the correct property types', () => {
    expectTypeOf<Session['sessionId']>().toBeString();
    expectTypeOf<Session['apiUrl']>().toBeString();
    expectTypeOf<Session['bearerToken']>().toBeString();
    expectTypeOf<Session['databaseType']>().toEqualTypeOf<DatabaseType>();
    expectTypeOf<Session['databaseName']>().toBeString();
    expectTypeOf<Session['expirySeconds']>().toBeNumber();
    expectTypeOf<Session['connectedAt']>().toEqualTypeOf<Date>();
    expectTypeOf<Session['userInfo']>().toEqualTypeOf<UserInfo>();
    expectTypeOf<Session['systemInfo']>().toEqualTypeOf<SystemInfo>();
  });
});

// ---------------------------------------------------------------------------
// BmsSessionResponse
// ---------------------------------------------------------------------------

describe('BmsSessionResponse', () => {
  it('can represent a full API response with all fields', () => {
    const response: BmsSessionResponse = {
      MessageCode: 0,
      Message: 'success',
      RequestTime: '2026-01-01T00:00:00Z',
      result: {
        system_info: {
          version: '2.0.0',
          environment: 'staging',
        },
        user_info: {
          name: 'Dr. Jane',
          position: 'Surgeon',
          position_id: 2,
          hospital_code: 'H002',
          doctor_code: 'D002',
          department: 'Surgery',
          location: 'Building B',
          is_hr_admin: true,
          is_director: false,
          bms_url: 'https://bms.example.com',
          bms_session_port: 8080,
          bms_session_code: 'session-code-xyz',
          bms_database_name: 'hospital_db',
          bms_database_type: 'mysql',
        },
        key_value: 'fallback-token',
        expired_second: 7200,
      },
    };

    expect(response.MessageCode).toBe(0);
    expect(response.result?.user_info?.bms_url).toBe('https://bms.example.com');
    expect(response.result?.key_value).toBe('fallback-token');
    expectTypeOf(response).toExtend<BmsSessionResponse>();
  });

  it('can represent a minimal response without result', () => {
    const response: BmsSessionResponse = {
      MessageCode: 1,
      Message: 'error',
      RequestTime: '2026-01-01T00:00:00Z',
    };

    expect(response.result).toBeUndefined();
    expectTypeOf(response).toExtend<BmsSessionResponse>();
  });

  it('has optional result field', () => {
    expectTypeOf<BmsSessionResponse['result']>().toEqualTypeOf<
      BmsSessionResponse['result']
    >();
  });
});

// ---------------------------------------------------------------------------
// KpiSummary
// ---------------------------------------------------------------------------

describe('KpiSummary', () => {
  it('can be constructed with valid fields', () => {
    const kpi: KpiSummary = {
      opdVisitCount: 150,
      ipdPatientCount: 30,
      erVisitCount: 12,
      activeDepartmentCount: 8,
      timestamp: new Date(),
    };

    expect(kpi.opdVisitCount).toBe(150);
    expect(kpi.timestamp).toBeInstanceOf(Date);
    expectTypeOf(kpi).toExtend<KpiSummary>();
  });

  it('has the correct property types', () => {
    expectTypeOf<KpiSummary['opdVisitCount']>().toBeNumber();
    expectTypeOf<KpiSummary['ipdPatientCount']>().toBeNumber();
    expectTypeOf<KpiSummary['erVisitCount']>().toBeNumber();
    expectTypeOf<KpiSummary['activeDepartmentCount']>().toBeNumber();
    expectTypeOf<KpiSummary['timestamp']>().toEqualTypeOf<Date>();
  });
});

// ---------------------------------------------------------------------------
// DepartmentWorkload
// ---------------------------------------------------------------------------

describe('DepartmentWorkload', () => {
  it('can be constructed with valid fields', () => {
    const dept: DepartmentWorkload = {
      departmentCode: 'DEPT-01',
      departmentName: 'Cardiology',
      visitCount: 42,
    };

    expect(dept.departmentCode).toBe('DEPT-01');
    expect(dept.departmentName).toBe('Cardiology');
    expect(dept.visitCount).toBe(42);
    expectTypeOf(dept).toExtend<DepartmentWorkload>();
  });

  it('has the correct property types', () => {
    expectTypeOf<DepartmentWorkload['departmentCode']>().toBeString();
    expectTypeOf<DepartmentWorkload['departmentName']>().toBeString();
    expectTypeOf<DepartmentWorkload['visitCount']>().toBeNumber();
  });
});

// ---------------------------------------------------------------------------
// DoctorWorkload
// ---------------------------------------------------------------------------

describe('DoctorWorkload', () => {
  it('can be constructed with valid fields', () => {
    const doc: DoctorWorkload = {
      doctorCode: 'DOC-01',
      doctorName: 'Dr. Smith',
      patientCount: 15,
    };

    expect(doc.doctorCode).toBe('DOC-01');
    expect(doc.doctorName).toBe('Dr. Smith');
    expect(doc.patientCount).toBe(15);
    expectTypeOf(doc).toExtend<DoctorWorkload>();
  });

  it('has the correct property types', () => {
    expectTypeOf<DoctorWorkload['doctorCode']>().toBeString();
    expectTypeOf<DoctorWorkload['doctorName']>().toBeString();
    expectTypeOf<DoctorWorkload['patientCount']>().toBeNumber();
  });
});

// ---------------------------------------------------------------------------
// VisitTrend
// ---------------------------------------------------------------------------

describe('VisitTrend', () => {
  it('can be constructed with valid fields', () => {
    const trend: VisitTrend = {
      date: '2026-01-01',
      visitCount: 200,
    };

    expect(trend.date).toBe('2026-01-01');
    expect(trend.visitCount).toBe(200);
    expectTypeOf(trend).toExtend<VisitTrend>();
  });

  it('has the correct property types', () => {
    expectTypeOf<VisitTrend['date']>().toBeString();
    expectTypeOf<VisitTrend['visitCount']>().toBeNumber();
  });
});

// ---------------------------------------------------------------------------
// HourlyDistribution
// ---------------------------------------------------------------------------

describe('HourlyDistribution', () => {
  it('can be constructed with valid fields', () => {
    const hourly: HourlyDistribution = {
      hour: 14,
      visitCount: 35,
    };

    expect(hourly.hour).toBe(14);
    expect(hourly.visitCount).toBe(35);
    expectTypeOf(hourly).toExtend<HourlyDistribution>();
  });

  it('has the correct property types', () => {
    expectTypeOf<HourlyDistribution['hour']>().toBeNumber();
    expectTypeOf<HourlyDistribution['visitCount']>().toBeNumber();
  });
});

// ---------------------------------------------------------------------------
// Supporting types
// ---------------------------------------------------------------------------

describe('SystemInfo', () => {
  it('has version and environment string fields', () => {
    const info: SystemInfo = { version: '1.0', environment: 'dev' };
    expect(info.version).toBe('1.0');
    expectTypeOf<SystemInfo['version']>().toBeString();
    expectTypeOf<SystemInfo['environment']>().toBeString();
  });
});

describe('UserInfo', () => {
  it('has all required fields with correct types', () => {
    expectTypeOf<UserInfo['name']>().toBeString();
    expectTypeOf<UserInfo['position']>().toBeString();
    expectTypeOf<UserInfo['positionId']>().toBeNumber();
    expectTypeOf<UserInfo['hospitalCode']>().toBeString();
    expectTypeOf<UserInfo['doctorCode']>().toBeString();
    expectTypeOf<UserInfo['department']>().toBeString();
    expectTypeOf<UserInfo['location']>().toBeString();
    expectTypeOf<UserInfo['isHrAdmin']>().toBeBoolean();
    expectTypeOf<UserInfo['isDirector']>().toBeBoolean();
  });
});

describe('ConnectionConfig', () => {
  it('can be constructed with valid fields', () => {
    const config: ConnectionConfig = {
      apiUrl: 'https://api.example.com',
      bearerToken: 'abc123',
      databaseType: 'postgresql',
      appIdentifier: 'TestApp',
    };

    expect(config.apiUrl).toBe('https://api.example.com');
    expect(config.databaseType).toBe('postgresql');
    expectTypeOf(config).toExtend<ConnectionConfig>();
  });
});

describe('SqlApiResponse', () => {
  it('can represent a full SQL response', () => {
    const response: SqlApiResponse = {
      result: {},
      MessageCode: 0,
      Message: 'OK',
      RequestTime: '2026-01-01T00:00:00Z',
      data: [{ id: 1, name: 'test' }],
      field: [3, 253],
      field_name: ['id', 'name'],
      record_count: 1,
    };

    expect(response.data).toHaveLength(1);
    expect(response.record_count).toBe(1);
    expectTypeOf(response).toExtend<SqlApiResponse>();
  });
});

describe('SqlApiRequest', () => {
  it('can represent a request with and without params', () => {
    const simple: SqlApiRequest = { sql: 'SELECT 1', app: 'TestApp' };
    expect(simple.sql).toBe('SELECT 1');
    expect(simple.params).toBeUndefined();

    const withParams: SqlApiRequest = {
      sql: 'SELECT * FROM t WHERE id = :id',
      app: 'TestApp',
      params: { id: { value: '1', value_type: 'integer' } },
    };
    expect(withParams.params?.id.value).toBe('1');
    expectTypeOf(simple).toExtend<SqlApiRequest>();
    expectTypeOf(withParams).toExtend<SqlApiRequest>();
  });
});

describe('QueryResult', () => {
  it('is generic and wraps typed data arrays', () => {
    const result: QueryResult<{ name: string }> = {
      data: [{ name: 'Alice' }],
      fieldNames: ['name'],
      fieldTypes: [253],
      recordCount: 1,
      messageCode: 0,
      message: 'OK',
      requestTime: '2026-01-01T00:00:00Z',
    };

    expect(result.data[0].name).toBe('Alice');
    expect(result.recordCount).toBe(1);
    expectTypeOf(result.data).toEqualTypeOf<{ name: string }[]>();
  });
});

describe('DemographicBreakdown', () => {
  it('can be constructed with valid fields', () => {
    const demo: DemographicBreakdown = {
      ageGroups: [{ group: '0-18', count: 50 }],
      genderDistribution: [{ gender: 'male', count: 100 }],
      dataSource: 'patient',
    };

    expect(demo.ageGroups).toHaveLength(1);
    expect(demo.dataSource).toBe('patient');
    expectTypeOf(demo).toExtend<DemographicBreakdown>();
  });

  it('dataSource accepts only "patient" or "ovst_patient_record"', () => {
    expectTypeOf<DemographicBreakdown['dataSource']>().toEqualTypeOf<
      'patient' | 'ovst_patient_record'
    >();
  });
});

describe('PatientTypeDistribution', () => {
  it('can be constructed with valid fields', () => {
    const pt: PatientTypeDistribution = {
      pttypeCode: 'OPD',
      pttypeName: 'Outpatient',
      visitCount: 200,
    };

    expect(pt.pttypeCode).toBe('OPD');
    expectTypeOf(pt).toExtend<PatientTypeDistribution>();
  });
});
