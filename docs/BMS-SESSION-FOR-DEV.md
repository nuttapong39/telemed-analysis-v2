# BMS Session Specification for Developers v3.6

> **IMPORTANT NOTICE**: This is a developer-focused specification for building applications that use the BMS Session system. The three supported BMS API endpoints are scoped by purpose:
> - **`/api/sql`** — read-only queries (SELECT/DESCRIBE/EXPLAIN/SHOW/WITH)
> - **`/api/rest`** — data modification (CRUD) on whitelisted tables
> - **`/api/function`** — support utility functions (e.g., serial generation, hospital variables)
>
> In addition:
> - The **BMS-auth LLM completions API** (`https://ai-api.kube.bmscloud.in.th`) is available for chat-style completions using the same BMS session id for authentication — see [LLM Completions API](#llm-completions-api) below.
> - The **Thai TTS (text-to-speech) service** (`https://vox-cpm.bmscloud.in.th`) — public, for OpenAI-compatible speech synthesis — see [Thai TTS API](#thai-tts-api) below.
> - The **Thai ASR (speech-to-text) service** (`https://asr1.bmscloud.in.th`) — public, for Whisper-compatible transcription — see [Thai ASR API](#thai-asr-api) below.
>
> Authentication key algorithms for sensitive data access are intentionally excluded from this document.
>
> **Design Philosophy**: With good application design, it is NOT necessary to access or store sensitive data to display useful information and statistical dashboards. Applications should be designed to work with aggregated, anonymized, or non-personally-identifiable data whenever possible.
>
> **Marketplace Token & Environment Modes**:
> - The `marketplace-token` (or `marketplace_token` — see [Marketplace Token Usage](#marketplace-token-usage)) is passed **only via URL query parameter when the app is launched from the HOSxP dashboard URL or through an approved addon integration**. Applications are expected to capture it once at launch time and forward it to `/api/sql` and `/api/rest` requests for the rest of the session.
> - **When testing in any other environment** (local development, standalone browser, direct URL without the dashboard/addon launcher), no marketplace token will be present. The app will run in **read-only mode** and the server will **encrypt/mask sensitive data** in responses automatically. Applications MUST be designed to degrade gracefully in this mode.

## Overview

The BMS (Bangkok Medical Software) Session system provides secure authentication and database access for HOSxP hospital management systems. This specification documents how the system uses `bms-session-id` to establish user sessions, authenticate API requests, and execute **read-only** SQL queries against hospital databases.

**Dynamic BMS Session Integration:**
- Destination systems should accept `bms-session-id` via URL parameters
- Example: `https://example.com/?bms-session-id=CB411DB0-B121-43C6-B795-80ADECE6A13C`
- System uses session ID to retrieve correct endpoint URL from HOSxP API
- Session ID is dynamic and can change per user/session

**Scope of This Document:**
- Read-only operations via `/api/sql` endpoint
- RESTful CRUD operations via `/api/rest` endpoint (writes require marketplace token, obtained via dashboard/addon launch URL)
- Support utility functions via `/api/function` endpoint
- Session management and validation
- Building dashboards and statistical displays
- Building marketplace add-on applications with table-level access control

## Architecture Flow

### 1. Session ID Acquisition

The system supports three methods to obtain a BMS session ID:

1. **URL Parameter**: `?bms-session-id=SESSION_ID`
2. **Cookie Storage**: Automatically stored for 7 days after successful authentication
3. **Manual Input**: User enters session ID through the UI

### 1.1 Server-Side Session Management

The BMS API server runs locally on the HOSxP workstation.

The bms-session-id is dynamic. Destination systems designed to use bms-session-id should allow passing bms-session-id in URL parameter (e.g., `https://example.com/?bms-session-id=xxxx-xxxx-xxxxx-xxxx`) and use it to retrieve the correct endpoint URL before fetching API data.

**Session Code Lifecycle**:
1. Server starts → generates new JWT (GUID format)
2. JWT stored internally
3. JWT used as Bearer token for API authentication
4. JWT remains valid until server restarts

### 2. Session Retrieval Flow

```
User → URL/Cookie/Input → SessionValidator → retrieveBmsSession() → HOSxP API
                                                     ↓
                                        https://hosxp.net/phapi/PasteJSON
                                                     ↓
                                           Session Data Response
```

Sample JSON response from `https://hosxp.net/phapi/PasteJSON?Action=GET&code=xxxx-xxxx-xxxxx-xxxx`:

```json
{
   "result":{
      "system_info":{
         "version":"1.0.0.0",
         "environment":"production"
      },
      "user_info":{
         "name":"Ondemand User",
         "position":"User",
         "position_id":1,
         "hospital_code":"00000",
         "doctor_code":"00000",
         "department":"server",
         "location":"server",
         "is_hr_admin":false,
         "is_director":false,
         "bms_url":"https://00000-ondemand-win-3ru63gfld9e.tunnel.hosxp.net",
         "bms_session_port":53845,
         "bms_session_code":"xxxx-xxxx-xxxxx-xxxx",
         "bms_database_name":"bmshosxp",
         "bms_database_type":"PostgreSQL"
      },
      "key_value":"xxxx-xxxx-xxxxx-xxxx",
      "expired_second":2592000
   },
   "MessageCode":200,
   "Message":"OK",
   "RequestTime":"2025-11-09T09:09:58.756Z",
   "EndpointIP":"10.0.0.15",
   "EndpointPort":17028,
   "processing_time_ms":0
}
```

## API Endpoints

### Endpoint Overview

Three endpoints are in scope for application developers. Each has a distinct purpose — do not cross them:

| Endpoint | Methods | Purpose | Auth Required |
|----------|---------|---------|---------------|
| `/api/sql` | GET, POST | **Read-only** queries (SELECT/DESCRIBE/EXPLAIN/SHOW/WITH) | Bearer token |
| `/api/rest/{table}[/{id}]` | GET, POST, PUT, DELETE | **Data modification** (CRUD) on whitelisted tables | Bearer token + marketplace token for writes |
| `/api/function` | GET, POST | **Support utility functions** (serial, hosvariable, …) | Bearer token |

**Endpoint routing guidance**:
- For any read-only query: use `/api/sql`. Do not try to shoehorn reads into `/api/rest` unless a table join/filter fits the REST pattern cleanly.
- For any INSERT/UPDATE/DELETE: use `/api/rest` with a marketplace token that has READWRITE grant. `/api/sql` is hard-locked to read statements.
- For any utility not expressible as SQL (e.g., generating a serial number, reading a system variable): use `/api/function`.
- For AI chat completions / summarisation / generation: use the separate [LLM Completions API](#llm-completions-api) (`ai-api.kube.bmscloud.in.th`) — different auth (session id as Bearer), different base URL.
- For Thai speech synthesis: use the [Thai TTS API](#thai-tts-api) (`vox-cpm.bmscloud.in.th`) — public endpoint, no auth required.
- For Thai speech transcription (audio → text): use the [Thai ASR API](#thai-asr-api) (`asr1.bmscloud.in.th`) — public endpoint, no auth required.

### `/api/sql` - Query Endpoint (Read Operations)

**Purpose**: Execute SQL queries to retrieve data from the database

**Supported Methods**: GET, POST

**Supported SQL Statements**:
- `SELECT` - Retrieve data from tables
- `DESCRIBE` / `DESC` - Show table structure
- `EXPLAIN` - Show query execution plan
- `SHOW` - Show database metadata (SHOW TABLES, SHOW DATABASES, etc.)
- `WITH` - Common Table Expressions (CTE) - *Requires MariaDB 10.2+ or MySQL 8.0+*

**Request Parameters**:
- `sql` (required): SQL query statement
- `app` (required): Application identifier — any non-empty string. Used by the server for logging/telemetry only; no specific format or registration is required.
- `params` (optional): Parameter binding for SQL injection prevention
- `marketplace-token` (optional): Marketplace token for sensitive-data unmasking. See [Marketplace Token Usage](#marketplace-token-usage). Both `marketplace-token` (hyphen) and `marketplace_token` (underscore) are accepted for compatibility.

**Parameter Binding for SQL Injection Prevention**:
- Use named parameters (`:param_name`) in SQL queries
- Provide parameter values and types in separate `params` object
- Supported `value_type` values: `string`, `integer`, `float`, `date`, `time`, `datetime`, `text` (`text` is a compatibility alias for `string`)
- Parameters are safely bound to prevent SQL injection attacks
- Empty or missing parameter values are bound as SQL `NULL`
- Example: `SELECT * FROM patient WHERE hn = :hn` with `params: { hn: { value: "12345", value_type: "string" } }`

**Request Examples**:

```javascript
// POST Request (JSON Body) - Simple query
POST /api/sql
{
  "sql": "SELECT COUNT(*) as total FROM patient WHERE birthday >= '2024-01-01'",
  "app": "BMS.Dashboard.React"
}

// POST Request (JSON Body) with parameter binding
POST /api/sql
{
  "sql": "SELECT COUNT(*) as total, sex FROM patient WHERE birthday = :birthday GROUP BY sex",
  "app": "BMS.Dashboard.React",
  "params": {
    "birthday": {"value": "2024-01-01", "value_type": "date"}
  }
}

// GET Request
GET /api/sql?sql=SELECT%20VERSION()%20as%20version&app=BMS.Dashboard.React

// DESCRIBE Statement
POST /api/sql
{
  "sql": "DESCRIBE patient",
  "app": "BMS.Dashboard.React"
}

// SHOW Statement
POST /api/sql
{
  "sql": "SHOW TABLES",
  "app": "BMS.Dashboard.React"
}

// EXPLAIN Statement
POST /api/sql
{
  "sql": "EXPLAIN SELECT * FROM ovst WHERE vstdate = '2024-01-01'",
  "app": "BMS.Dashboard.React"
}
```

**Response Format**:
```json
{
  "result": {},
  "MessageCode": 200,
  "Message": "OK",
  "RequestTime": "2025-10-20T12:00:00.000Z",
  "data": [
    {
      "column1": "value1",
      "column2": "value2"
    }
  ],
  "field": [6, 6],
  "field_name": ["column1", "column2"],
  "record_count": 2
}
```

**Response Fields**:
- `result` - Additional result metadata (usually empty object)
- `MessageCode` - HTTP-style status code (200 = success, 400/500 = error)
- `Message` - Status message ("OK" for success, error description for failures)
- `RequestTime` - ISO 8601 timestamp of request processing
- `data` - Array of result rows (each row is an object with column name/value pairs)
- `field` - Array of field type codes (see Field Type Codes section)
- `field_name` - Array of column names in the result set
- `record_count` - Number of records returned

**Error Response Format**:
```json
{
  "result": {},
  "MessageCode": 409,
  "Message": "Database error: #42000You have an error in your SQL syntax...",
  "RequestTime": "2025-10-20T12:00:00.000Z"
}
```

**HTTP Status Codes**:
- `200` - Request processed (check MessageCode for actual query status)
- `501` - Not Implemented / Unauthorized (missing or invalid Bearer token)

**MessageCode Reference**:
- `200` - Success: Query executed successfully
- `400` - Bad Request: Invalid SQL or parameters
- `409` - Conflict: SQL syntax error or unsupported SQL feature
- `500` - Server Error: Database error or internal server error

**Security Features**:
- SQL sanitization (removes trailing semicolons, converts backslashes)
- Support for LIMIT clause normalization ("; LIMIT" → " LIMIT")
- Bearer token authentication required
- **Table access restrictions**:
  - Blacklisted tables: opduser, opdconfig, sys_var, user_var, user_jwt
  - Maximum 20 tables referenced per query (includes subqueries, CTEs, and JOINed tables — not just top-level FROM)
  - No cross-database queries (dots not allowed in table names)
- **SQL statement whitelist**: Only SELECT, DESCRIBE, EXPLAIN, SHOW, WITH allowed
- **Additional SQL pattern restrictions** (rejected even if the leading statement is a SELECT):
  - `LOAD DATA ...` (bulk load from file)
  - `... INTO OUTFILE ...` / `... INTO DUMPFILE ...` (write to filesystem)
  - `LOAD_FILE(...)` (read filesystem)
  - Multi-statement payloads — only one statement per request (a single trailing `;` is tolerated and stripped)
- **Sensitive data masking**: When the request has no marketplace token (or the token does not grant access to the relevant tables), the server automatically masks/encrypts sensitive columns (e.g., `patient.cid`, `person.cid`, other PII) in the response. A properly-granted marketplace token is required to receive unmasked values.

---

### `/api/rest` - RESTful CRUD Endpoint

**Purpose**: Provides a config-driven RESTful API for reading and writing hospital data with automatic table joins, filtering, pagination, and marketplace-based access control.

**Supported Methods**: GET, POST, PUT, DELETE

**URL Pattern**: `/api/rest/{table_name}[/{resource_id}]`

**Authentication**:
- **Bearer token** (required): Same JWT session token as `/api/sql`
- **Marketplace token** (optional): Required for write operations. Controls table-level read/write permissions.

**Permission Model**:
| Scenario | GET | POST/PUT/DELETE |
|----------|-----|-----------------|
| JWT only (no marketplace token) | Allowed | Denied (403) |
| Marketplace token with READONLY grant | Allowed | Denied (403) |
| Marketplace token with READWRITE grant | Allowed | Allowed |

#### Available Tables

110 tables are available, organized by module:

| Module | Tables |
|--------|--------|
| Patient & Registration | `patient`, `pname` |
| OPD (Outpatient) | `ovst`, `ovstdiag`, `opdscreen`, `opdscreen_cc_list`, `vn_stat`, `er_regist`, `ovst_vaccine`, `ovst_doctor_diag` |
| IPD (Inpatient) | `ipt`, `iptdiag`, `an_stat`, `ipt_newborn`, `ipt_pttype` |
| Labor & Delivery | `ipt_labour`, `ipt_labour_infant`, `ipt_labour_complication` |
| Lab & Diagnostics | `lab_head`, `lab_order`, `lab_items`, `lab_items_group`, `lab_specimen_items`, `xray_head`, `xray_report` |
| Pharmacy & Drug | `opitemrece`, `drugitems`, `s_drugitems`, `nondrugitems` |
| Operation / Surgery | `operation_list`, `operation_set` |
| Dental | `dtmain`, `dtdn`, `dttm` |
| Appointment | `oapp`, `oapp_cancel` |
| Slot Management (OPDQS) | `opd_queue_schedule` (writable v2), `opd_queue_slot`, `opd_queue_slot_type`, `opd_qs_slot_summary`, `opd_qs_location`, `opd_qs_limit_type` — see [Slot Management Endpoints](#slot-management-endpoints) |
| Referral | `referout`, `referin` |
| Finance & Billing | `income`, `paidst`, `pttype`, `rcpt_print`, `rcpt_debt` |
| Master / Reference | `doctor`, `ward`, `roomno`, `bedno`, `spclty`, `kskdepartment`, `clinic`, `icd101`, `hospcode`, `epi_vaccine` |
| PCU - Person & Community | `person`, `village`, `house`, `person_chronic`, `person_vaccine`, `person_death`, `person_screen_head`, `person_screen_result`, `clinicmember`, `surveil_member` |
| PCU - ANC / Pregnancy | `person_anc`, `person_anc_service`, `person_labour` |
| PCU - WBC (Well Baby) | `person_wbc`, `person_wbc_service` |
| PCU - EPI (Vaccination) | `person_epi`, `person_epi_vaccine`, `person_epi_nutrition` |
| PCU - School Health | `village_student` |
| PCU - Women's Health | `person_women`, `person_women_service` |
| Traditional Medicine | `health_med_service`, `health_med_service_diagnosis`, `health_med_service_treatment`, `health_med_service_medication`, `health_med_service_operation`, `health_med_service_result`, `health_med_provider`, `health_med_items`, `health_med_queue` |
| Physical Therapy | `physic_main`, `physic_main_ipd`, `physic_member`, `physic_pe`, `physic_pt_send` |
| Visit Patient Type | `visit_pttype`, `visit_pttype_change`, `visit_pttype_charge`, `visit_pttype_income_cover`, `visit_pttype_item_cover` |
| IPD Patient Type | `ipt_pttype_check`, `ipt_pttype_income_cover` |
| Doctor Workbench | `opdscreen_doctor_pe`, `opdscreen_pe`, `opdscreen_bp`, `opdscreen_ros`, `opdscreen_fbs`, `opdscreen_fp`, `opdscreen_revisit`, `ovst_doctor_sign`, `ovst_seq`, `doctor_cert`, `ptnote`, `patient_condition`, `patient_doctor_note` |
| Allergy | `opd_allergy` |
| IPD Doctor/Nurse | `ipd_doctor_order`, `ipd_nurse_note` |

> **Note**: Some tables have blacklisted fields (e.g., `patient.cid` and `person.cid` are not returned in responses).

#### GET - Read Records

**List records**:
```
GET /api/rest/{table_name}?{query_params}
Authorization: Bearer {session_token}
```

**Get single record**:
```
GET /api/rest/{table_name}/{resource_id}
Authorization: Bearer {session_token}
```

The `resource_id` maps to the table's REST ID field (e.g., `hn` for patient, `vn` for ovst, `an` for ipt).

##### Query Parameters

| Parameter | Description | Example |
|-----------|-------------|---------|
| `select` | Fields to return and expand (join) directives | `select=hn,fname,lname,patient(pname)` |
| `limit` | Max records to return (capped by table config) | `limit=50` |
| `offset` | Skip N records (for pagination) | `offset=100` |
| `order` | Sort order (`.desc` / `.asc` suffix) | `order=vstdate.desc` |
| `{field}` | Filter by field value (see Filter Operators) | `hn=eq.HN0001` |

##### Filter Operators

Filters use the format `{field}={operator}.{value}`:

| Operator | SQL Equivalent | Example |
|----------|---------------|---------|
| `eq` | `=` | `hn=eq.HN0001` |
| `neq` | `<>` | `sex=neq.1` |
| `gt` | `>` | `vstdate=gt.2024-01-01` |
| `gte` | `>=` | `vstdate=gte.2024-01-01` |
| `lt` | `<` | `vstdate=lt.2024-12-31` |
| `lte` | `<=` | `vstdate=lte.2024-12-31` |
| `like` | `LIKE` | `fname=like.%John%` |
| `in` | `IN` | `pttype=in.(01,02,03)` |
| `is` | `IS NULL / IS NOT NULL` | `birthday=is.null` or `birthday=is.notnull` |

Multiple filters are combined with AND.

##### Expand (Join) Syntax

The `select` parameter supports automatic table joins via configured lookups:

**Named expand** (specific columns):
```
GET /api/rest/ovst?select=*,patient(pname,fname,lname),doctor(name)
```
This generates a LEFT JOIN to the `patient` table and `doctor` table, returning the specified columns with aliased names like `patient.pname`, `patient.fname`, `doctor.name`.

**Expand all configured lookups**:
```
GET /api/rest/ovst?select=*,expand(all)
```

**Inner join** (use `!` prefix to require match):
```
GET /api/rest/ovst?select=*,!patient(pname,fname,lname)
```

**Custom lookup** (server-defined sub-queries):
```
GET /api/rest/lab_head?select=*,custom.patient_last_visit
```

##### Available Expand Lookups

| Table | Alias | Joined Table | Columns |
|-------|-------|-------------|---------|
| `ovst` | `patient` | `patient` | `pname,fname,lname` |
| `ovst` | `doctor` | `doctor` | `name,licenseno` |
| `ovst` | `pttype` | `pttype` | `name` |
| `ovst` | `spclty` | `spclty` | `name` |
| `ovstdiag` | `icd101` | `icd101` | `name,tname` |
| `opdscreen` | `ovst` | `ovst` | `hn,vstdate,vsttime,doctor` |
| `ipt` | `patient` | `patient` | `pname,fname,lname` |
| `ipt` | `doctor` | `doctor` | `name` |
| `ipt` | `ward` | `ward` | `name` |
| `ipt` | `spclty` | `spclty` | `name` |
| `ipt` | `pttype` | `pttype` | `name` |
| `iptdiag` | `icd101` | `icd101` | `name,tname` |
| `lab_head` | `doctor` | `doctor` | `name,licenseno` |
| `lab_head` | `ward` | `ward` | `name` |
| `lab_head` | `patient` | `patient` | `pname,fname,lname` |
| `lab_head` | `ovst` | `ovst` | `vstdate,vsttime,doctor` |
| `opitemrece` | `s_drugitems` | `s_drugitems` | `name,strength,units,dosageform` |
| `opitemrece` | `patient` | `patient` | `pname,fname,lname` |
| `oapp` | `patient` | `patient` | `pname,fname,lname` |
| `oapp` | `doctor` | `doctor` | `name` |
| `oapp` | `clinic` | `clinic` | `name` |
| `oapp` | `kskdepartment` | `kskdepartment` | `department` |
| `oapp` | `custom.cancel` | *(custom SQL)* | latest `oapp_cancel` row joined to `oapp_cancel_type` — see [Appointment Domain Endpoints](#appointment-domain-endpoints) |
| `oapp_cancel` | `oapp_cancel_type` | `oapp_cancel_type` | `name` |
| `opd_queue_schedule` | `doctor` | `doctor` | `name` |
| `opd_queue_schedule` | `clinic` | `clinic` | `name` |
| `opd_queue_schedule` | `opd_queue_slot` | `opd_queue_slot` | `opd_queue_slot_name,opd_queue_slot_start_time,opd_queue_slot_finish_time` |
| `opd_queue_schedule` | `opd_qs_limit_type` | `opd_qs_limit_type` | `opd_qs_limit_type_name` |
| `opd_qs_slot_summary` | `doctor` | `doctor` | `name` |

> Additional lookups are available for `er_regist`, `kskdepartment`, `roomno`, `ipt_labour`, `ipt_newborn`, `dtmain`, `operation_list`, `referout`, `referin`, `clinicmember`, `person_anc`, `person_wbc`, `person_epi`, `person_women`, `person_chronic`, `rcpt_print`, `physic_main`, `physic_member`, `physic_pt_send`, `health_med_service`, `health_med_queue`, `visit_pttype`, `ipt_pttype`.

##### GET Examples

```bash
# List patients (default limit 50)
GET /api/rest/patient
Authorization: Bearer {session_token}

# Get single patient by HN
GET /api/rest/patient/HN0001
Authorization: Bearer {session_token}

# List OPD visits with patient and doctor names, filtered by date
GET /api/rest/ovst?select=vn,vstdate,vsttime,patient(pname,fname,lname),doctor(name)&vstdate=gte.2024-06-01&vstdate=lte.2024-06-30&order=vstdate.desc&limit=100
Authorization: Bearer {session_token}

# List lab orders with all configured lookups expanded
GET /api/rest/lab_head?select=*,expand(all)&limit=20
Authorization: Bearer {session_token}

# Get appointments for a specific clinic
GET /api/rest/oapp?select=*,patient(pname,fname,lname),doctor(name),clinic(name)&nextdate=gte.2024-06-01&limit=50
Authorization: Bearer {session_token}
```

##### GET Response Format

**List response**:
```json
{
  "MessageCode": 200,
  "Message": "OK",
  "RequestTime": "2025-10-20T12:00:00.000Z",
  "data": [
    { "vn": "660100001", "vstdate": "2024-06-01", "patient.fname": "John", "doctor.name": "Dr. Smith" },
    { "vn": "660100002", "vstdate": "2024-06-01", "patient.fname": "Jane", "doctor.name": "Dr. Lee" }
  ],
  "field": [6, 4, 6, 6],
  "field_name": ["vn", "vstdate", "patient.fname", "doctor.name"],
  "record_count": 2,
  "limit": 100,
  "offset": 0
}
```

**Single record response**:
```json
{
  "MessageCode": 200,
  "Message": "OK",
  "RequestTime": "2025-10-20T12:00:00.000Z",
  "data": { "hn": "HN0001", "pname": "Mr.", "fname": "John", "lname": "Doe" },
  "field": [6, 6, 6, 6],
  "field_name": ["hn", "pname", "fname", "lname"]
}
```

**Record not found**:
```json
{
  "MessageCode": 404,
  "Message": "Record not found",
  "RequestTime": "2025-10-20T12:00:00.000Z"
}
```

#### POST - Create Records

> **Requires marketplace token with READWRITE grant for the target table.**

**Single insert**:
```bash
POST /api/rest/{table_name}
Authorization: Bearer {session_token}
Content-Type: application/json

{
  "field1": "value1",
  "field2": "value2"
}
```

**Bulk insert**:
```bash
POST /api/rest/{table_name}/bulk
Authorization: Bearer {session_token}
Content-Type: application/json

[
  { "field1": "value1", "field2": "value2" },
  { "field1": "value3", "field2": "value4" }
]
```

**Response**:
```json
{
  "MessageCode": 201,
  "Message": "Created",
  "RequestTime": "2025-10-20T12:00:00.000Z",
  "insert_count": 1
}
```

`insert_count` reflects the number of rows actually inserted (matches the array length for `/bulk`, always `1` for single insert).

**Data type handling**:
- **Date fields**: Use ISO format `"2024-06-15"` (YYYY-MM-DD)
- **DateTime fields**: Use ISO format `"2024-06-15T14:30:00"` (YYYY-MM-DDTHH:mm:ss)
- **Time fields**: Use `"14:30:00"` (HH:mm:ss)
- **Blob fields**: Use Base64-encoded string

#### PUT - Update Records

> **Requires marketplace token with READWRITE grant for the target table.**

**Single update**:
```bash
PUT /api/rest/{table_name}/{resource_id}
Authorization: Bearer {session_token}
Content-Type: application/json

{
  "field1": "new_value1",
  "field2": "new_value2"
}
```

**Bulk update** (each row must include the REST ID field):
```bash
PUT /api/rest/{table_name}/bulk
Authorization: Bearer {session_token}
Content-Type: application/json

[
  { "hn": "HN0001", "fname": "Updated Name" },
  { "hn": "HN0002", "fname": "Another Name" }
]
```

**Response**:
```json
{
  "MessageCode": 200,
  "Message": "OK",
  "RequestTime": "2025-10-20T12:00:00.000Z",
  "update_count": 1
}
```

`update_count` reflects the number of rows actually updated.

#### DELETE - Delete Records

> **Requires marketplace token with READWRITE grant for the target table.**

```bash
DELETE /api/rest/{table_name}/{resource_id}
Authorization: Bearer {session_token}
```

**Response**:
```json
{
  "MessageCode": 200,
  "Message": "Deleted",
  "RequestTime": "2025-10-20T12:00:00.000Z",
  "delete_count": 1
}
```

`delete_count` reflects the number of rows actually deleted (always `1` on success, `0` if the record was already gone).

#### Marketplace Token Usage

The marketplace token provides table-level access control for add-on applications.

**Where the token comes from (environments)**:

| Launch environment | Marketplace token present? | Resulting mode |
|--------------------|----------------------------|----------------|
| Launched from the **HOSxP dashboard URL** | ✅ Passed as `?marketplace-token=...` URL parameter | Full permissions per grant (READONLY or READWRITE) |
| Launched from an **approved addon integration URL** | ✅ Passed as `?marketplace-token=...` URL parameter | Full permissions per grant (READONLY or READWRITE) |
| **Any other environment** (local dev, direct browser, standalone testing) | ❌ Not provided | **Read-only mode** on `/api/rest` (GET only); write calls return `403`. Sensitive-data columns returned by `/api/sql` and `/api/rest` GET are **automatically encrypted/masked** by the server. |

> Applications should capture the `marketplace-token` query parameter **once at launch**, alongside `bms-session-id`, persist it client-side for the lifetime of the session, and then forward it on subsequent `/api/sql` and `/api/rest` calls. Do NOT attempt to generate, refresh, or fabricate a marketplace token — it is issued only by the HOSxP dashboard / addon launcher.

**Parameter name**: Both `marketplace-token` (hyphenated) and `marketplace_token` (underscore) are accepted for compatibility. New code should prefer the hyphenated form.

**How to pass it to the API** (query string OR JSON body):

```bash
# Via query parameter (GET requests — always this form)
GET /api/rest/lab_head?marketplace-token=mkt_xxxxx&limit=10
Authorization: Bearer {session_token}

# Via JSON body (POST / PUT / DELETE write requests)
POST /api/rest/lab_order
Authorization: Bearer {session_token}
Content-Type: application/json

{
  "marketplace-token": "mkt_xxxxx",
  "lab_order_number": "LAB001",
  "lab_items_code": "CBC"
}
```

**For `/api/sql`**, include the token in the JSON body alongside `sql` and `app`:

```json
POST /api/sql
{
  "sql": "SELECT hn, cid FROM patient WHERE hn = :hn",
  "app": "BMS.Dashboard.React",
  "marketplace-token": "mkt_xxxxx",
  "params": { "hn": { "value": "HN0001", "value_type": "string" } }
}
```

The server validates the marketplace token against the BMS Marketplace API (`hosxp-marketplace.bmscloud.in.th`) and caches the granted table permissions for the session. Each token specifies which tables can be accessed with READONLY or READWRITE permission.

#### Appointment Domain Endpoints

The appointment family (`oapp` + `oapp_cancel` + `oapp_confirm_type` + the OPDQS slot tables) has five extensions on top of the plain generic REST surface. These exist because appointment writes must keep `opd_queue_schedule.available_count` consistent with `oapp` row count, because cancellation is a state transition with a detail row — not a simple `DELETE` — and because confirmation records contact-tracking fields without changing the appointment status.

##### 1. Status guard on `oapp` PUT/DELETE

`PUT /api/rest/oapp/{oapp_id}` and `DELETE /api/rest/oapp/{oapp_id}` are refused (HTTP `409`) when the appointment's current state is:

- `oapp_status_id >= 4` (visited / closed / cancelled), OR
- `patient_visit = 'Y'` (visit-confirmed)

Open → closed transitions remain allowed (the guard reads current persisted state at request time). To withdraw a closed appointment, use the cancel endpoint below.

```json
// HTTP 409 example
{
  "MessageCode": 409,
  "Message": "Appointment is closed (oapp_status_id=4); modify not permitted",
  "RequestTime": "2026-05-24T07:00:00.000Z"
}
```

##### 2. Custom `cancel` lookup on `oapp` GET

`GET /api/rest/oapp/{oapp_id}?select=*,custom.cancel` hydrates the **latest** `oapp_cancel` row inline (joined to `oapp_cancel_type` for the human-readable type name). The `cancel` sub-object is empty/null for appointments that have never been cancelled.

```bash
GET /api/rest/oapp/1234567?select=*,custom.cancel
Authorization: Bearer {session_token}
```

```json
{
  "MessageCode": 200,
  "data": {
    "oapp_id": 1234567,
    "hn": "0000001",
    "oapp_status_id": 5,
    "...": "...",
    "cancel": {
      "oapp_cancel_id": 98765,
      "oapp_cancel_type_id": 3,
      "cancel_datetime": "2026-05-24 10:15:00",
      "staff": "USR001",
      "cancel_type_name": "Patient requested"
    }
  }
}
```

##### 3. Atomic book-slot — `POST /api/rest/oapp/book-slot`

> **Use this endpoint to create new appointments.** The generic `POST /api/rest/oapp` has a known PK-allocation issue (sends `oapp_id=0`); `book-slot` allocates the PK canonically AND atomically updates the slot's capacity counters.

Inserts an `oapp` row with `opd_queue_schedule_id` set, AND decrements `opd_queue_schedule.available_count` / increments `confirm_count` for that slot — all serialized inside a server-side critical section so concurrent bookers cannot drive `available_count` negative.

**Required body fields**: `opd_queue_schedule_id` (must exist), `hn` (must exist). Optional: `vstdate`, `nextdate`, `nexttime`, `doctor`, `clinic`, `depcode`, `note`. Server defaults `doctor`/`nextdate` from the schedule row when omitted, `vstdate=today`, `nexttime='09:00:00'`.

```bash
POST /api/rest/oapp/book-slot
Authorization: Bearer {session_token}
Content-Type: application/json

{
  "marketplace-token": "mkt_xxxxx",
  "opd_queue_schedule_id": 42,
  "hn": "0000001",
  "nexttime": "09:30:00",
  "note": "Booked via mobile app"
}
```

**Responses**:

| HTTP | When | Body shape |
|------|------|-----------|
| `200` | Booking succeeded; capacity decremented | `{MessageCode:200, data:{oapp_id, opd_queue_schedule_id, available_count, confirm_count}}` |
| `400` | `opd_queue_schedule_id` or `hn` missing/invalid | `{MessageCode:400, Message:"opd_queue_schedule_id is required"}` |
| `404` | Schedule doesn't exist | `{MessageCode:404, Message:"Schedule not found: opd_queue_schedule_id=42"}` |
| `409` | Slot full (`available_count <= 0`) | `{MessageCode:409, Message:"Slot is full (available_count=0, confirm_count=8)"}` |
| `500` | Internal failure | `{MessageCode:500, Message:"Server error: ..."}` (also logged server-side with stack trace) |

**Discover bookable slots first** via `GET /api/rest/opd_queue_schedule?doctor_code=eq.<code>&schedule_date=eq.<date>&available_count=gt.0&select=*,expand(all)` to get the `opd_queue_schedule_id` to book against.

##### 4. Atomic cancel — `POST /api/rest/oapp/{oapp_id}/cancel`

> **Use this endpoint to cancel appointments.** Inserts the `oapp_cancel` log row, flips `oapp.oapp_status_id` to the cancelled value, AND if the appointment was booked via `book-slot` (i.e. `oapp.opd_queue_schedule_id` is set), restores the slot's `available_count` so the freed slot becomes immediately re-bookable.

All steps run inside the same critical section as `book-slot` so concurrent book + cancel on the same slot serialize correctly.

**Required body fields**: `oapp_cancel_type_id` (must exist in `oapp_cancel_type` lookup), `staff`. Optional: `note`, `cancel_datetime` (defaults to server `now()`).

```bash
POST /api/rest/oapp/1234567/cancel
Authorization: Bearer {session_token}
Content-Type: application/json

{
  "marketplace-token": "mkt_xxxxx",
  "oapp_cancel_type_id": 3,
  "staff": "USR001",
  "note": "Patient called to cancel"
}
```

**Responses**:

| HTTP | When | Body shape |
|------|------|-----------|
| `200` | Cancelled; oapp_status flipped; slot capacity restored (if slot-bound) | `{MessageCode:200, data:{oapp_id, oapp_cancel_id, oapp_status_id}}` |
| `400` | `oapp_cancel_type_id` missing or non-positive | `{MessageCode:400, Message:"oapp_cancel_type_id is required"}` |
| `404` | Appointment doesn't exist | `{MessageCode:404, Message:"Appointment not found: oapp_id=..."}` |
| `409` | Already closed / visited / cancelled (status guard via shared helper) | `{MessageCode:409, Message:"Appointment is closed (oapp_status_id=4); modify not permitted"}` |
| `500` | Internal failure | `{MessageCode:500, Message:"Server error: ..."}` |

**Side effects** on a successful 200:

1. INSERT into `oapp_cancel(oapp_cancel_id, oapp_id, oapp_cancel_type_id, cancel_datetime, staff)`
2. UPDATE `oapp SET oapp_status_id = <cancelled>` (cancelled-value auto-resolved per deployment from `oapp_status.name LIKE '%cancel%'`, fallback `5`)
3. If `oapp.opd_queue_schedule_id IS NOT NULL`: UPDATE `opd_queue_schedule SET available_count = available_count + 1, confirm_count = GREATEST(confirm_count - 1, 0), update_datetime = now()`

##### 5. Confirm appointment — `POST /api/rest/oapp/{oapp_id}/confirm`

> **Use this endpoint to record that a patient has confirmed (or is still pending confirmation of) an upcoming appointment.** Writes the `oapp.oapp_confirm_*` tracking fields. Unlike cancel, confirm does **NOT** change `oapp_status_id` — confirmation is a sub-state of "waiting for the appointment date", so a confirmed appointment keeps its current status (e.g. `oapp_status_id = 1`).

Runs inside the same critical section as `book-slot` / `cancel`. The appointment must still be open — the shared status guard refuses confirmation of a closed / visited / cancelled appointment.

**Required body fields**: `oapp_confirm_type_id` (positive integer; must exist in the `oapp_confirm_type` lookup). Optional: `oapp_confirm_method` (free-text channel, e.g. `"phone"`, `"sms"`, `"line"`; max 15 chars), `oapp_confirm_note` (max 150 chars), `oapp_confirm_datetime` (defaults to server `now()`).

```bash
POST /api/rest/oapp/1234567/confirm
Authorization: Bearer {session_token}
Content-Type: application/json

{
  "marketplace-token": "mkt_xxxxx",
  "oapp_confirm_type_id": 1,
  "oapp_confirm_method": "phone",
  "oapp_confirm_note": "Patient confirmed by phone"
}
```

**Responses**:

| HTTP | When | Body shape |
|------|------|-----------|
| `200` | Confirmed; `oapp_confirm_*` fields written; `oapp_status_id` unchanged | `{MessageCode:200, data:{oapp_id, oapp_confirm_type_id, oapp_confirm_datetime}}` |
| `400` | `oapp_confirm_type_id` missing or non-positive | `{MessageCode:400, Message:"oapp_confirm_type_id is required"}` |
| `404` | Appointment doesn't exist, OR `oapp_confirm_type_id` not in the `oapp_confirm_type` lookup | `{MessageCode:404, Message:"Unknown oapp_confirm_type_id=99"}` |
| `409` | Already closed / visited / cancelled (status guard via shared helper) | `{MessageCode:409, Message:"Appointment is closed (oapp_status_id=4); modify not permitted"}` |
| `500` | Internal failure | `{MessageCode:500, Message:"Server error: ..."}` |

**Side effect** on a successful 200 — a single `UPDATE oapp SET oapp_confirm_type_id = ?, oapp_confirm_method = ?, oapp_confirm_note = ?, oapp_confirm_datetime = ?` for the target `oapp_id`. No counter or child-slot rows are touched, and `oapp_status_id` is left as-is. Re-confirming overwrites the fields (idempotent latest-state semantics).

**`oapp_confirm_type` lookup** — a small reference table (`oapp_confirm_type_id` int PK, `oapp_confirm_type_name` varchar). Default rows:

| `oapp_confirm_type_id` | `oapp_confirm_type_name` |
|---|---|
| 1 | ยืนยันแล้ว (confirmed) |
| 2 | รอยืนยัน (pending) |

Discover the available confirm types at runtime via `/api/sql`:
`SELECT oapp_confirm_type_id, oapp_confirm_type_name FROM oapp_confirm_type ORDER BY oapp_confirm_type_id`.

##### Typical client workflow

```
1. List availability:  GET  /api/rest/opd_queue_schedule?doctor_code=eq.ABC&schedule_date=eq.2026-06-15&available_count=gt.0&select=*,expand(all)
2. Book a slot:        POST /api/rest/oapp/book-slot {opd_queue_schedule_id, hn, ...}
3. Confirm attendance: POST /api/rest/oapp/{oapp_id}/confirm {oapp_confirm_type_id, oapp_confirm_method?}
   (records oapp_confirm_* fields; does NOT change oapp_status_id)
4. Reschedule (open):  PUT  /api/rest/oapp/{oapp_id}  {nexttime: "10:00:00"}
   (refused 409 if already closed/visited)
5. Cancel atomically:  POST /api/rest/oapp/{oapp_id}/cancel  {oapp_cancel_type_id, staff}
   (restores slot capacity so step 1's list immediately reflects the freed slot)
6. Read with cancel:   GET  /api/rest/oapp/{oapp_id}?select=*,custom.cancel
```

> **Permissions**: All five endpoints require a `marketplace-token` with READWRITE grants. The cancel handler additionally writes to `oapp_cancel` and `opd_queue_schedule`, and the confirm handler writes only `oapp_confirm_*` columns on `oapp`, so a token with `[oapp]` READWRITE alone is sufficient (the handlers are server-trusted; they do not gate each side-effect table independently).

---

#### Slot Management Endpoints

The slot-management family (`opd_queue_schedule` plus its child `opd_qs_slot` rows and `opd_qs_slot_summary` aggregates) has **four extensions** on top of the read-only catalog: a server-side atomic create, a faithful child-row-rebalance resize, a guarded cascade delete, and a date-range bulk generator. Plus a column-level PUT guard that protects the capacity counters from drift.

These exist because `slot_count` / `confirm_count` / `available_count` must stay consistent with the child `opd_qs_slot` rows AND with the live `oapp` bookings that consume them. A naïve generic POST/PUT/DELETE on `opd_queue_schedule` would let clients overwrite the counters directly or delete a schedule that still has live bookings.

All four endpoints serialize on the same critical section as `book-slot` and `cancel`, so concurrent appointment + slot operations on the same schedule are race-free.

##### 1. Atomic schedule create — `POST /api/rest/opd_queue_schedule`

> **Use this endpoint to create a new per-doctor-per-date session.** Bypasses the generic-POST PK-allocation bug by short-circuiting on URL match. Mints `opd_queue_schedule_id` via `GetSerialNumberChkExist`, derives `description_name` / `ref_clinic_name` from doctor/clinic lookups per `tmpl_type_id`, and INSERTs with `slot_count = available_count = <input>`, `confirm_count = 0`.

**Required body fields**: `doctor_code`, `schedule_date`, `opd_qs_schedule_tmpl_type_id`, `opd_queue_slot_id`, `opd_qs_limit_type_id`, `slot_count`.

```http
POST /api/rest/opd_queue_schedule
Authorization: Bearer <JWT>
Content-Type: application/json

{
  "doctor_code": "0001",
  "schedule_date": "2026-06-15",
  "opd_qs_schedule_tmpl_type_id": 1,
  "opd_queue_slot_id": 42,
  "opd_qs_limit_type_id": 7,
  "slot_count": 12
}
```

| Status | Meaning | Body shape |
|---|---|---|
| `200` | Created | `{MessageCode:200, data:{opd_queue_schedule_id, slot_count, available_count, confirm_count}}` |
| `400` | `slot_create_missing_field` / `slot_create_invalid_date` / `slot_create_invalid_type` / `slot_create_invalid_count` | `{MessageCode:400, Message:"<code>|<reason>"}` |
| `404` | `slot_create_unknown_fk` — doctor/clinic/template/limit_type not found | `{MessageCode:404, ...}` |
| `409` | `slot_create_duplicate` — `(doctor, date, type)` already exists | `{MessageCode:409, ...}` |

`doctor_code` is **overloaded by `tmpl_type_id`**: type 1 → `doctor.code`, type 2 → `clinic.clinic`, type 3 → `clinic:doctor` colon-joined. `schedule_date` is **strictly 10 characters** (`YYYY-MM-DD`); loose forms like `2026-6-15` are rejected with 400.

##### 2. Atomic resize — `POST /api/rest/opd_queue_schedule/{id}/resize`

> **Use this endpoint to grow or shrink a schedule's capacity.** Grow appends `(new − old)` non-busy `opd_qs_slot` children with sequential queue numbers; shrink deletes `(old − new)` non-busy children (highest queue number first). **Never deletes a `slot_busy='Y'` child** — refuses 409 if the target would lose a booking.

```http
POST /api/rest/opd_queue_schedule/12345/resize
{"new_slot_count": 20}
```

| Status | Meaning | Body shape |
|---|---|---|
| `200` | Resized | `{MessageCode:200, data:{opd_queue_schedule_id, old_slot_count, new_slot_count, confirm_count, available_count, child_slots_added, child_slots_removed}}` |
| `400` | `slot_resize_missing_field` / `slot_resize_invalid_count` | `{MessageCode:400, ...}` |
| `404` | `slot_resize_unknown_id` | `{MessageCode:404, ...}` |
| `409` | `slot_resize_below_confirm` (new < confirm_count) / `slot_resize_below_busy` (new < count of slot_busy='Y' children — defensive when confirm_count diverged) | `{MessageCode:409, ...}` |

When `new == old`, returns 200 with `child_slots_added: 0, child_slots_removed: 0` (no-op, idempotent).

**Queue prefix lookup** for newly-grown children follows the same convention as the desktop:
- Type 1 → `doctor.queue_prefix`
- Type 2 → `clinic.queue_prefix`
- Type 3 → `opd_qs_clinic_doctor_prefix.queue_prefix` for the `(clinic, doctor_code)` pair
- Fallback `'Z'` when the looked-up prefix is NULL/empty

**Counter update** is a direct parameterized `UPDATE opd_queue_schedule SET slot_count = ?, available_count = ? - confirm_count, update_datetime = now()` — NOT `UpdateOPDQueueSchedule(id)` from `HOSxPDMU.pas`. The HOSxPDMU helper derives `slot_count` from `count(opd_qs_slot)` which conflicts with lazy materialization (a schedule created via API has 0 children but `slot_count = N`).

##### 3. Guarded cascade delete — `DELETE /api/rest/opd_queue_schedule/{id}`

> **Use this endpoint to retire a schedule.** Intercepts the generic DELETE before it runs and applies the busy-slot guard. Refuses 409 if any `opd_qs_slot.slot_busy='Y'` child exists. On success: cascades children, deletes parent (audit-logged), and conditionally cleans up the matching `opd_qs_slot_summary` if no other schedule remains for the `(doctor, date, type)` triple.

```http
DELETE /api/rest/opd_queue_schedule/12345
```

| Status | Meaning | Body shape |
|---|---|---|
| `200` | Deleted (cascade + conditional summary cleanup) | `{MessageCode:200, data:{opd_queue_schedule_id, deleted:true}}` |
| `404` | `slot_delete_unknown_id` | `{MessageCode:404, ...}` |
| `409` | `slot_delete_has_bookings` — N busy slot(s) exist | `{MessageCode:409, ...}` |

To delete a schedule with active bookings, cancel those first via `POST /api/rest/oapp/{id}/cancel` (which sets the child's `slot_busy='N'` and restores `available_count`), then DELETE.

##### 4. Date-range bulk generator — `POST /api/rest/opd_queue_schedule/bulk-generate`

> **Use this endpoint to materialize a doctor/clinic's calendar from a template.** Mirrors the desktop OPDQS bulk-generate form. Iterates dates between `start_date` and `end_date`, applies `days_of_week` + `skip_holidays` filters, and for each qualifying date **DELETEs existing schedules** for `(composite_code, date, type)` and re-inserts from the named template's child rows. Refuses to regenerate dates that have live bookings (`slot_busy='Y'`) — surfaces those as per-date `skipped_existing_bookings`.

```http
POST /api/rest/opd_queue_schedule/bulk-generate
Content-Type: application/json

{
  "start_date": "2026-06-01",
  "end_date":   "2026-06-30",
  "doctor_code": "0001",
  "clinic_code": "001",
  "opd_qs_schedule_tmpl_type_id": 3,
  "template_name": "Morning Clinic",
  "days_of_week":   [2, 3, 4, 5, 6],
  "skip_holidays":  true
}
```

| Status | Meaning | Body shape |
|---|---|---|
| `200` | Date range processed; per-date results in body | `{MessageCode:200, data:{template_id, composite_code, results:[{date, status, schedules_created?}, ...], summary:{created, skipped}}}` |
| `400` | `slot_bulkgen_missing_field` / `slot_bulkgen_invalid_date` / `slot_bulkgen_invalid_type` / `slot_bulkgen_type_mismatch` | `{MessageCode:400, ...}` |
| `404` | `slot_bulkgen_unknown_template` — `(composite_code, type_id, template_name)` lookup failed | `{MessageCode:404, ...}` |

Per-date `status` values: `created`, `skipped_weekend` (day-of-week filter), `skipped_holiday` (holiday table + skip_holidays=true), `skipped_existing_bookings` (live booking blocks regen).

A date that "would skip due to existing bookings" returns **200 with per-date status**, NOT 409. The whole call returns 200 with mixed results — use `data.results[]` to identify what was actually written. This matches the desktop's "warn-and-continue" semantics.

**Critical-section hold**: the lock spans the entire call (~3s worst-case for 30 dates × 8 schedules × 12 children). Long ranges may block concurrent `book-slot`/`cancel`. Use ranges ≤30 days, or schedule during off-hours.

##### 5. Column-level PUT guard

Generic `PUT /api/rest/opd_queue_schedule/{id}` writes that touch `slot_count`, `confirm_count`, or `available_count` are refused with 409 `slot_column_guard`. Use the resize endpoint instead. Other column updates (e.g. `description_name`) pass through to generic PUT.

```http
# Refused:
PUT /api/rest/opd_queue_schedule/12345
{"slot_count": 99}
# → 409 slot_column_guard

# Allowed (description_name is not a counter column):
PUT /api/rest/opd_queue_schedule/12345
{"description_name": "Updated note"}
# → 200
```

##### Slot capacity discovery for booking integrations

Before booking, query slot availability:

```http
GET /api/rest/opd_queue_schedule?doctor_code=eq.DR101&schedule_date=eq.2026-06-15&available_count=gt.0&select=*,expand(all)
```

Returns the row plus joined columns from `doctor.name`, `clinic.name`, `opd_queue_slot.opd_queue_slot_name + start_time + finish_time`, and `opd_qs_limit_type.opd_qs_limit_type_name`. Use the returned `opd_queue_schedule_id` in your subsequent `POST /api/rest/oapp/book-slot` body.

To enumerate available template names for `bulk-generate`, query `opd_qs_schedule_tmpl` directly:

```http
GET /api/rest/opd_qs_schedule_tmpl?doctor_code=eq.DR101&opd_qs_schedule_tmpl_type_id=eq.1&select=opd_qs_schedule_tmpl_id,opd_qs_schedule_tmpl_name
```

##### Slot management workflows

```
Workflow A — Onboard a new doctor (admin):
1. Configure template via desktop (opd_qs_schedule_tmpl + opd_qs_schedule_tmpl_list)
2. POST /api/rest/opd_queue_schedule/bulk-generate  {start_date, end_date, doctor_code, template_name, days_of_week, skip_holidays}
3. Verify: GET /api/rest/opd_queue_schedule?doctor_code=eq.DR101&schedule_date=ge.<start>&schedule_date=le.<end>

Workflow B — Pop-up extra session for a popular doctor (admin):
1. POST /api/rest/opd_queue_schedule {doctor_code, schedule_date, type_id, opd_queue_slot_id, opd_qs_limit_type_id, slot_count}
2. Bookings come in via POST /api/rest/oapp/book-slot  (consumes slots)
3. POST /api/rest/opd_queue_schedule/{id}/resize {new_slot_count: 15}  (grow on demand)

Workflow C — Cancel an unbooked session (admin):
1. DELETE /api/rest/opd_queue_schedule/{id}    # 200 if no busy children
                                                # 409 slot_delete_has_bookings if any oapp bound
2. (If 409 returned) Cancel each booking via POST /api/rest/oapp/{id}/cancel
3. Retry the DELETE

Workflow D — Browse-only integration:
1. GET /api/rest/doctor?use_app_slot=Y                       # discover doctors
2. GET /api/rest/opd_queue_schedule?doctor_code=eq.<code>    # list their schedules
3. (No writes — READONLY marketplace grant suffices)
```

##### Counter transitions across endpoints

How each slot/appointment endpoint touches `opd_queue_schedule.{slot_count, confirm_count, available_count}` and child `opd_qs_slot` rows:

| Endpoint | slot_count | confirm_count | available_count | Child rows |
|---|---|---|---|---|
| `POST /opd_queue_schedule` (create) | = input | 0 | = input | none (lazy) |
| `POST /opd_queue_schedule/{id}/resize` grow | += Δ | unchanged | += Δ | + Δ non-busy rows |
| `POST /opd_queue_schedule/{id}/resize` shrink | -= Δ | unchanged | -= Δ | - Δ non-busy rows (highest queue first) |
| `DELETE /opd_queue_schedule/{id}` | row deleted | row deleted | row deleted | all deleted |
| `POST /oapp/book-slot` | unchanged | +1 | -1 | child marked `slot_busy='Y'` |
| `POST /oapp/{id}/cancel` | unchanged | -1 (floored ≥ 0) | +1 | child marked `slot_busy='N'` |
| `POST /oapp/{id}/confirm` | unchanged | unchanged | unchanged | unchanged (writes `oapp.oapp_confirm_*` only) |
| `POST /opd_queue_schedule/bulk-generate` (per "created" date) | = 1 per new sched | 0 | = 1 per new sched | none (lazy) |

##### Audit logging

Every successful slot operation emits a `PDPALog.Ops` event with these names + payload keys:

| Endpoint | Event name | Payload keys |
|---|---|---|
| Create | `slot.create.ok` | `opd_queue_schedule_id`, `type`, `slot_count` |
| Resize | `slot.resize.ok` | `opd_queue_schedule_id`, `old`, `new`, `added`, `removed` |
| Delete | `slot.delete.ok` | `opd_queue_schedule_id`, `summary_cleanup` (bool) |
| Bulk-generate | `slot.bulkgen.ok` | `composite`, `template`, `created`, `skipped` |
| Any (exception) | `slot.<op>.exception` | `class`, `message` |

Audit events go to the PDPA sink; they do NOT write `hosxp_updatedelta_log`. Per-row `opd_qs_slot` writes are not audited individually (scaffolding tier, by design).

##### Known limitations (v1)

| # | Limitation | Workaround |
|---|---|---|
| 1 | `weeks_of_month` field in bulk-generate is accepted but not parsed yet (all weeks pass) | Use narrower ranges or multiple calls |
| 2 | Per-endpoint marketplace-token grant-rejection tests use the universal token | Manual verification — configure a token without `[opd_queue_schedule]` grant, expect 403 |
| 3 | `description_name` derivation uses English `'doctor:'` / `'clinic:'` prefixes; desktop uses Thai (`'แพทย์ : '`) | Cosmetic; mixed text tolerated, override via subsequent PUT if needed |
| 4 | Bulk-generate holds the critical section for the entire call | Use ranges ≤30 days, schedule during off-hours |
| 5 | No `POST /opd_queue_schedule/{id}/move-slot` (postpone) endpoint | Compose cancel + create, or DELETE + bulk-generate the new date |
| 6 | Slot template (`opd_queue_slot`) and schedule template (`opd_qs_schedule_tmpl`) CRUD not exposed | Desktop-only; discovery via GET works |
| 7 | `oapp_limit` / `depcode_oapp_limit` / `spclty_oapp_limit` (parallel per-clinic-per-date caps) not exposed | Out of scope — separate "Appointment Limits API" spec |
| 8 | Date parser is strict on length (10 chars required) but permissive on separator — `2026/06/15` parses the same as `2026-06-15` | Always send canonical `YYYY-MM-DD` with hyphens |

> **Permissions**: All five endpoints (4 handlers + column PUT guard) require a `marketplace-token` with `[opd_queue_schedule]` in the READWRITE grant. Read endpoints (`GET /opd_queue_schedule*`, `GET /opd_queue_slot`, etc.) accept the table in either READONLY or READWRITE grant. The handlers are server-trusted: they cascade to `opd_qs_slot` / `opd_qs_slot_summary` without requiring those grants in the token (matching the cancel handler's server-trusted side-effects).

---

#### REST API Error Responses

| MessageCode | Meaning | Example Cause |
|-------------|---------|---------------|
| 400 | Bad Request | Invalid JSON body, missing resource ID |
| 403 | Forbidden | Write without marketplace token, table not in grant |
| 404 | Not Found | Table not available, record not found |
| 405 | Method Not Allowed | Unsupported HTTP method |
| 500 | Server Error | Database error, internal error |

---

## Field Type Codes

```
1 = Boolean
2 = Integer
3 = Float
4 = DateTime / Date (ISO 8601 string; see note below)
5 = Time (stored as String HH:mm:ss)
6 = String
7 = Blob/Binary Data (Base64 encoded)
9 = String (long/memo)
```

**Field type code `4` notes**:
- Code `4` is returned for both pure `DATE` (MySQL/MariaDB `DATE`, PostgreSQL `DATE`) and `DATETIME` / `TIMESTAMP` columns. Distinguish by value shape: `YYYY-MM-DD` for dates, `YYYY-MM-DDTHH:mm:ss` for datetimes.
- DateTime values are serialized in the **server's local time zone** (hospital site's local time — typically Asia/Bangkok in Thai deployments). No timezone suffix is attached. Do NOT assume UTC; convert on the client only if you know the server's TZ.

---

### `/api/function` - Server Functions Endpoint

**Purpose**: Execute built-in server-side **support utility functions** that require database access but don't fit the SQL or REST patterns (e.g., generating a unique primary key, reading a hospital system variable). Functions run inside the server process with direct database connection.

**Method**: POST (GET accepted for no-payload functions)

**URL Pattern**: `/api/function?name={function_name}`

**Authentication**: Bearer token (same JWT session token as `/api/sql`)

**Request Format**:
```
POST {bms_url}/api/function?name={function_name}
Authorization: Bearer {session_token}
Content-Type: application/json

{...function-specific payload}
```

**Response Format**:
```json
{
  "MessageCode": 200,
  "Message": "OK",
  "Value": <function-specific return value>
}
```

> **The return-payload field is per-function** — most scalar-returning functions use `Value`, but some return their result under a different field (e.g., `get_cds_xml` → `xmldata`). Always check the function-specific response section below before parsing.

**Publicly documented functions** (stable, intended for application use):

| Function | Purpose | Return field |
|----------|---------|--------------|
| [`get_serialnumber`](#get_serialnumber--generate-unique-integer-primary-key) | Generate unique integer PK before INSERT | `Value` |
| [`get_hosvariable`](#get_hosvariable--read-hospital-system-variable) | Read a `sys_var` configuration value | `Value` |
| [`set_hosvariable`](#sethosvariable--write-hospital-system-variable) | Update a `sys_var` configuration value | *(none)* |
| [`get_cds_xml`](#get_cds_xml--execute-sql-and-return-xml-restricted) | Execute SQL and return XML (restricted) | `xmldata` |

### Full Function Catalogue

The server exposes ~60 named functions. They are grouped below by purpose. For each group, see the linked detailed references further down (patient / serial / hosvariable sections) or treat the table's Required Keys + Return Field columns as the contract. All calls use `POST /api/function?name={name}` with a JSON body.

> **Note on return fields**: Scalar-returning functions use `Value`. Object/array-returning ones use function-specific fields (e.g. `data`, `columns`). Boolean checks use names like `valid`, `allowed`, `is_pregnancy`. The **Return Field** column below is authoritative per function.
>
> **HOSxPDMULite mode**: In the lite build, some functions return stub/default values (e.g. `get_price_*` returns 0, `get_icd10_name` returns a placeholder). Production HOSxP builds return real data.

#### Patient lookup & demographics

| Function | Required keys | Return field | Purpose |
|----------|---------------|--------------|---------|
| `get_patient_info` | `hn` | `data` (object) | Full patient demographic record |
| `get_patient_visit_info` | `vn` | `data` (object) | Full visit record |
| `get_patient_age` | `hn` [, `ref_date`] | `Value`, `age_year` | Age at today or at reference date |
| `get_patient_address` | `hn` | `Value` | Formatted address string |
| `check_patient_allergy` | `hn` | `data` (array), `allergy_count` | Drug-allergy list |
| `check_patient_pregnancy` | `vn` | `is_pregnancy` (bool) | Pregnancy-state check |
| `check_patient_breastfeeding` | `vn` | `is_breastfeeding` (bool) | Breastfeeding-state check |

#### Identifier validators

| Function | Required keys | Return field | Purpose |
|----------|---------------|--------------|---------|
| `validate_hn` | `hn` | `valid` (bool) | HN format check |
| `validate_vn` | `vn` | `valid` (bool) | VN format check |
| `validate_an` | `an` | `valid` (bool) | AN format check |
| `validate_cid` | `cid` | `valid` (bool) | Thai national-ID checksum |

#### Pricing & finance

| Function | Required keys | Return field | Purpose |
|----------|---------------|--------------|---------|
| `get_price_opd` | `vn`, `icode` | `price` | OPD item price for this visit |
| `get_price_ipd` | `an`, `icode` | `price` | IPD item price for this admission |
| `get_price_by_pttype` | `pttype`, `icode` | `price` | Price by patient-type + icode |
| `round_money` | `amount` | `Value` | Apply hospital rounding rules |
| `check_finance_lock` | `vn` | `is_locked` (bool) | Is the visit locked for billing? |
| `get_pttype_for_visit` | `vn`, `icode` | `pttype` | Resolve patient-type for an item on a visit |

#### Inventory / stock

| Function | Required keys | Return field | Purpose |
|----------|---------------|--------------|---------|
| `get_drug_remain_qty` | `department_id`, `icode`, `vn` | `remain_qty` | Remaining drug qty at department for a visit |
| `get_stock_remain_qty` | `icode`, `department_id` | `remain_qty` | General stock remaining at department |

#### Code / name lookups

| Function | Required keys | Return field | Purpose |
|----------|---------------|--------------|---------|
| `get_icd10_name` | `icd10_code` | `name`, `thai_name` | ICD-10 diagnosis name (EN + TH) |
| `get_icd9_name` | `icd9_code` | `name` | ICD-9 procedure name |
| `get_code506` | `icd10_code` | `code506` | Thai CODE-506 classification for an ICD-10 |
| `get_tmb_name` | `changwat_code`, `amphur_code`, `tambon_code` | `tambon_name`, `amphur_name`, `changwat_name` | Thai geography name resolution |
| `get_hospital_info` | *(none)* | `hospital_code`, `hospital_name`, `hospital_name_eng`, `hospital_address`, `hospital_tel`, `hospital_province` | Hospital master data |

#### Lab & diagnostics

| Function | Required keys | Return field | Purpose |
|----------|---------------|--------------|---------|
| `create_lab_order` | `cloud_lab_order_number`, `vn` | *(none)* | Create a lab order from a cloud reference |
| `update_lab_status` | `vn` | *(none)* | Mark lab orders for a visit as completed |
| `get_lab_link_result` | `sys_lab_code_id`, `vn` | `Value` | Get lab-result link/id for a visit |

#### Visit / admission control

| Function | Required keys | Return field | Purpose |
|----------|---------------|--------------|---------|
| `register_new_visit` | `hn` + ovst fields (e.g. `vstdate`, `doctor`, `pttype`) | `vn`, `vstdate`, `vsttime`, `pttype`, `doctor`, `data` | Create a new OPD visit with auto-defaults |
| `finished_opd_wb_webapp` | `vn` | *(none)* | Mark an OPD/WB webapp visit as finished |
| `lock_vn` / `unlock_vn` | `vn` | `locked` (bool) on lock | Concurrency guard on a visit record |
| `lock_key` / `unlock_key` | `key_code` | `locked` (bool) on lock | Generic lock for any record key |
| `resync_vn` / `resync_an` | `vn` / `an` | *(none)* | Force sync visit/admission from BMS Cloud |

#### Notifications

| Function | Required keys | Return field | Purpose |
|----------|---------------|--------------|---------|
| `send_appointment_notify` | `oapp_id` [, `clinic_oapp_notification_id`] | `sent` (bool) | Appointment SMS/LINE notification |
| `add_queue_notify` | `message_type_id`, `hn`, `vn` [, `expired_minute`] | *(none)* | Queue a LINE notification with optional expiry |
| `send_line_notify` | `token`, `message` | `sent` (bool) | Direct LINE message (stub in some builds) |
| `send_sms` | `message`, `phone_list` | `result_text` | Direct SMS (stub in some builds) |

#### Access control & audit

| Function | Required keys | Return field | Purpose |
|----------|---------------|--------------|---------|
| `can_access` | `access_name` | `allowed` (bool) | Check if current user has a feature permission |
| `can_officer_task_access` | `task_code`, `operation_code` | `allowed` (bool) | Check task+operation permission |
| `add_log` | `table_name`, `modify_type`, `detail` | *(none)* | Create an audit-trail entry |
| `set_hosvariable` | `variable_name`, `variable_value` | *(none)* | Update a `sys_var` value (requires operator-level access) |

#### Generic table access

| Function | Required keys | Return field | Purpose |
|----------|---------------|--------------|---------|
| `get_table_columns` | `table_name` | `columns` (array), `column_count` | Introspect a table's columns |
| `get_field_from_table` | `condition_field`, `condition_value`, `select_field`, `table_name` | `Value` | Generic scalar lookup (`SELECT {select_field} FROM {table_name} WHERE {condition_field} = :v`) |
| `get_new_code` | `table_name`, `field_name`, `pattern`, `default_value` [, `width`] | `Value` | Pattern-based code generator for any table |
| `get_new_hn` | *(none)* | `Value` | Generate a new patient HN |

> **Note**: `get_field_from_table`, `get_new_code`, and `get_table_columns` do not enforce the `/api/sql` table blacklist. Treat them as server-privileged operations; do not expose their `table_name` argument to end users unless you sanitize first.

#### Server utilities

| Function | Required keys | Return field | Purpose |
|----------|---------------|--------------|---------|
| `get_server_datetime` | *(none)* | `server_datetime`, `server_date` | Server clock (useful for client-side sync) |
| `get_newguid` | *(none)* | `Value` | Generate a new GUID |

#### Cloud / datacenter bridge (expert use)

These invoke queries against the external BMS Cloud / Datacenter service. Quota and latency are not guaranteed; prefer `/api/sql` against the local tunnel whenever possible.

| Function | Required keys | Return field | Purpose |
|----------|---------------|--------------|---------|
| `cloud_get_data` | `sql` | `data` (array), `record_count` | Row-level query against BMS Cloud |
| `cloud_get_sql_data` | `sql` | `Value` | Single-value query against BMS Cloud |
| `cloud_get_subquery` | `sql` | `Value` | Subquery execution |
| `cloud_get_serial` | `serial_name` | `Value` | Serial number from BMS Cloud |
| `cloud_update_delta` | `sql`, `delta` | `update_result` | Apply delta updates to BMS Cloud |
| `cloud_check_connection` | *(none)* | `connected` (bool) | Cloud connectivity probe |
| `cloud_get_ip` | *(none)* | `ip_address` | Local IP visible to BMS Cloud |
| `datacenter_get_data` | `sql` [, `ip`, `port`, `db`] | `data` (array), `record_count` | Row query against BMS Datacenter |
| `datacenter_get_sql_data` | `sql` | `Value` | Single-value query against BMS Datacenter |

#### Integrations with secret-key validation (restricted)

These functions validate their payloads against an internal server-side secret. Applications cannot call them directly without that secret and will receive a validation error. They are documented here for completeness only.

| Function | Required keys | Return field | Notes |
|----------|---------------|--------------|-------|
| [`get_cds_xml`](#get_cds_xml--execute-sql-and-return-xml-restricted) | `sql`, `sql_key` | `xmldata` | Restricted SQL → XML export. `sql_key` is a server-computed hash; external callers cannot produce it. |
| `get_telemedicine_url` | `cid` (+ internal validation) | `url` | Returns a signed room URL for a patient CID. Performs an internal validation against a secret before returning the URL. |
| `emr_text` | `hn`, `duration_month` (+ internal validation) | `emr_text` | Anonymized EMR-narrative export. Also internally validated. |
| `get_moph_jwt` | *(none)* | `result` | MOPH-platform JWT for sub-system integrations. |
| `check_dga_cid` | `cid`, `first_name`, `last_name`, `birth_date`, `laser_id` | `result_text` | DGA (government health-insurance) eligibility check. |

> **Do not attempt to construct `sql_key` client-side** — the salt is a server-only secret. These functions are typically called by trusted HOSxP modules, not by application add-ons.

**Error Response** (missing or invalid parameters):
```json
{
  "MessageCode": 500,
  "Message": "Invalid Key data for {function_name} {missing_key}"
}
```

---

#### `get_serialnumber` — Generate Unique Integer Primary Key

**Purpose**: Generate a globally unique integer ID for use as a primary key. The server calls the database function `get_serialnumber(serial_name)` and verifies the returned value does not already exist in the specified table/field. This is the standard HOSxP pattern for PK generation — tables do NOT use `AUTO_INCREMENT`.

**Required Keys**: `serial_name`, `table_name`, `field_name`

**Request**:
```bash
POST {bms_url}/api/function?name=get_serialnumber
Authorization: Bearer {session_token}
Content-Type: application/json

{
  "serial_name": "refill_order_id",
  "table_name": "refill_order",
  "field_name": "order_id"
}
```

**Parameters**:

| Key | Type | Description |
|-----|------|-------------|
| `serial_name` | string | The serial name registered in the `serialnumber` table (e.g., `vn`, `ovst_diag_id`, `refill_order_id`) |
| `table_name` | string | The table to check for existence (e.g., `ovst`, `ovstdiag`, `refill_order`) |
| `field_name` | string | The primary key column to check against (e.g., `vn`, `ovst_diag_id`, `order_id`) |

**Response** (success):
```json
{
  "MessageCode": 200,
  "Message": "OK",
  "Value": 1234567
}
```

`Value` is a unique integer guaranteed not to exist in `table_name.field_name`.

**Server-Side Logic** (from `GetSerialNumberChkExistDBC`):
```
1. Call database function: SELECT get_serialnumber('{serial_name}') AS cc
2. Check: SELECT COUNT(*) FROM {table_name} WHERE {field_name} = {result}
3. If result already exists → retry from step 1
4. Return the unique integer
```

**Common Serial Names**:

| serial_name | table_name | field_name | Usage |
|-------------|-----------|------------|-------|
| `vn` | `ovst` | `vn` | OPD visit number |
| `an` | `ipt` | `an` | IPD admission number |
| `ovst_diag_id` | `ovstdiag` | `ovst_diag_id` | OPD diagnosis record |
| `opitemrece_id` | `opitemrece` | `opitemrece_id` | Prescription item |
| `opi_dispense_id` | `opi_dispense` | `opi_dispense_id` | Dispense record |
| `refill_order_id` | `refill_order` | `order_id` | Refill order |
| `refill_schedule_id` | `refill_schedule` | `schedule_id` | Refill schedule |

**Usage Notes**:
- Always call this API immediately before INSERT — do not pre-generate IDs
- The returned integer may be larger than `MAX_INT` (2,147,483,647) for high-volume serials — use `BIGINT` or handle large numbers
- If `table_name` or `field_name` is omitted, the server derives them from `serial_name` (strips last 3 chars for table, uses serial_name as field). Explicitly providing all 3 is recommended.
- The serial name must be registered in the database's `serialnumber` table

**JavaScript Example**:
```typescript
async function getSerialNumber(
  apiUrl: string, bearerToken: string,
  serialName: string, tableName: string, fieldName: string
): Promise<number> {
  const response = await fetch(`${apiUrl}/api/function?name=get_serialnumber`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${bearerToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      serial_name: serialName,
      table_name: tableName,
      field_name: fieldName,
    }),
  })
  const data = await response.json()
  if (data.MessageCode !== 200) throw new Error(data.Message)
  return data.Value
}

// Usage
const orderId = await getSerialNumber(apiUrl, token,
  'refill_order_id', 'refill_order', 'order_id')
// orderId = 1234567 (unique integer, safe to INSERT)
```

---

#### `get_hosvariable` — Read Hospital System Variable

**Purpose**: Read a system-level configuration variable from the `sys_var` table. These variables control hospital-wide settings like hospital name, province code, feature flags, etc.

**Required Keys**: `variable_name`

**Request**:
```bash
POST {bms_url}/api/function?name=get_hosvariable
Authorization: Bearer {session_token}
Content-Type: application/json

{
  "variable_name": "HOSPITAL_NAME"
}
```

**Response** (success):
```json
{
  "MessageCode": 200,
  "Message": "OK",
  "Value": "โรงพยาบาลตัวอย่าง"
}
```

`Value` is the string value of the variable from `sys_var.sys_value`.

**Server-Side Logic** (from `GetHOSVariable_Impl`):
```
1. Query: SELECT sys_value FROM sys_var WHERE sys_name = '{variable_name}'
2. If variable exists → return sys_value
3. If variable doesn't exist → auto-create with empty value, return ''
```

**Common Hospital Variables**:

| Variable Name | Description | Example Value |
|---------------|-------------|---------------|
| `HOSPITAL_NAME` | Hospital name | `โรงพยาบาลตัวอย่าง` |
| `HOSPITAL_PROVINCE` | Province name | `กรุงเทพมหานคร` |
| `HOSCODE` | 5-digit hospital code (MOPH) | `10001` |
| `HOSPCODE` | 9-digit hospital code | `000010001` |
| `DB_VERSION` | HOSxP database version | `4.20240101` |
| `MAX_OPD_QUE` | Max OPD queue number | `999` |

**JavaScript Example**:
```typescript
async function getHosVariable(
  apiUrl: string, bearerToken: string, variableName: string
): Promise<string> {
  const response = await fetch(`${apiUrl}/api/function?name=get_hosvariable`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${bearerToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ variable_name: variableName }),
  })
  const data = await response.json()
  if (data.MessageCode !== 200) throw new Error(data.Message)
  return String(data.Value)
}

// Usage
const hospitalName = await getHosVariable(apiUrl, token, 'HOSPITAL_NAME')
// hospitalName = "โรงพยาบาลตัวอย่าง"
```

---

#### `set_hosvariable` — Write Hospital System Variable

**Purpose**: Update a row in `sys_var`. Creates the variable when it doesn't exist. Intended for operator / admin tooling — regular add-ons should read, not write, hospital-wide config.

**Required Keys**: `variable_name`, `variable_value`

**Request**:
```bash
POST {bms_url}/api/function?name=set_hosvariable
Authorization: Bearer {session_token}
Content-Type: application/json

{
  "variable_name": "SOME_FEATURE_FLAG",
  "variable_value": "enabled"
}
```

**Response** (success):
```json
{ "MessageCode": 200, "Message": "OK" }
```

> **Permission**: The underlying operation typically requires the calling session to have admin rights. Unauthorized sessions get a database-level failure surfaced as a `Database error:` message.

---

#### `get_cds_xml` — Execute SQL and Return XML (Restricted)

**Purpose**: Execute a SQL query and return results as XML-formatted dataset. This function is restricted — it requires a valid `sql_key` which is an MD5 hash of the SQL + a secret salt. Intended for internal system use only (e.g., report generation, data export).

**Required Keys**: `sql`, `sql_key`

**Request**:
```bash
POST {bms_url}/api/function?name=get_cds_xml
Authorization: Bearer {session_token}
Content-Type: application/json

{
  "sql": "SELECT * FROM patient WHERE hn = '000001'",
  "sql_key": "a1b2c3d4e5f6..."
}
```

**Parameters**:

| Key | Type | Description |
|-----|------|-------------|
| `sql` | string | SQL query to execute |
| `sql_key` | string | MD5 hash of `sql + secret_salt` for validation |

**Response** (success):
```json
{
  "MessageCode": 200,
  "Message": "OK",
  "xmldata": "<DATAPACKET>...</DATAPACKET>"
}
```

**Note**: The `sql_key` validation prevents arbitrary SQL execution. The secret salt is not public — this function is for authorized internal tools only. For general SQL queries, use `/api/sql` instead.

---

#### Function Error Handling

All functions return the same error structure:

| MessageCode | Meaning | Cause |
|-------------|---------|-------|
| 200 | Success | Function executed successfully |
| 500 | Invalid Key | Missing required payload keys or invalid sql_key |
| 409 | Server Error | Unhandled exception during function execution |

**Missing key error example**:
```json
{
  "MessageCode": 500,
  "Message": "Invalid Key data for get_serialnumber table_name"
}
```

The `Message` field includes the function name and the name of the missing key, making it easy to diagnose.

---

## LLM Completions API

**Base URL**: `https://ai-api.kube.bmscloud.in.th` (external proxy; separate service from the BMS tunnel at `{bms_url}`)

**Purpose**: OpenAI-compatible chat completions against a pool of hosted and self-hosted LLM providers (DeepSeek, Kimi, MedGemma, Qwen, GPT, etc.) — authenticated by the **BMS session id** rather than the BMS JWT. Intended for AI assistants, summarisers, medical-note generators, and any app that already holds a valid BMS session.

> **Auth note**: The Bearer token for this API is the raw `bms-session-id` (the GUID passed in as `?bms-session-id=...`), NOT the `bms_session_code` JWT used by `/api/sql`, `/api/rest`, and `/api/function`. The proxy validates the session id against the same BMS paste-JSON API you already hit at connect time.

### Endpoint Overview

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/v1/models` | GET | None (public) | List available model ids |
| `/v1/chat/completions` | POST | `Bearer {bms-session-id}` | Chat-style completion (sync or SSE stream) |

### Request — `POST /v1/chat/completions`

Standard OpenAI chat-completions payload:

```json
POST https://ai-api.kube.bmscloud.in.th/v1/chat/completions
Authorization: Bearer {bms-session-id}
Content-Type: application/json

{
  "model": "deepseek",
  "messages": [
    { "role": "system", "content": "You are a clinical documentation assistant." },
    { "role": "user",   "content": "Summarise this lab panel in Thai: ..." }
  ],
  "stream": false,
  "max_tokens": 4096,
  "temperature": 0.3,
  "top_p": 0.9
}
```

| Field | Type | Notes |
|-------|------|-------|
| `model` | string | Model id from `/v1/models` (see catalog below). Unknown ids silently fall back to `deepseek`. |
| `messages` | array | OpenAI shape: `{ role: 'system'\|'user'\|'assistant', content: string }`. |
| `stream` | boolean | `true` → SSE stream, `false`/omitted → single JSON response. |
| `max_tokens` | integer | Default `4096`. |
| `temperature` | number | Optional, `0.0 – 2.0`. |
| `top_p` | number | Optional, `0.0 – 1.0`. |

### Response — Sync (stream=false)

Always OpenAI format regardless of the upstream provider:

```json
{
  "id": "chatcmpl-abc123",
  "object": "chat.completion",
  "model": "deepseek",
  "choices": [
    {
      "index": 0,
      "finish_reason": "stop",
      "message": { "role": "assistant", "content": "Hello, world!" }
    }
  ],
  "usage": {
    "prompt_tokens": 12,
    "completion_tokens": 4,
    "total_tokens": 16
  }
}
```

### Response — Streaming (stream=true)

Server-Sent Events. Each frame is a `data: {json}\n\n` chunk. The stream ends with `data: [DONE]\n\n`:

```
data: {"id":"chatcmpl-abc","object":"chat.completion.chunk","model":"deepseek","choices":[{"delta":{"content":"Hello"},"finish_reason":null}]}

data: {"id":"chatcmpl-abc","object":"chat.completion.chunk","model":"deepseek","choices":[{"delta":{"content":", world!"},"finish_reason":"stop"}]}

data: [DONE]
```

> Streaming responses do **not** include a `usage` block. If you need token accounting, use sync mode.

### Model Discovery — `GET /v1/models`

Public endpoint (no Bearer required):

```json
{
  "object": "list",
  "data": [
    { "id": "deepseek", "object": "model", "owned_by": "deepseek" },
    { "id": "kimi",     "object": "model", "owned_by": "moonshot" },
    { "id": "gemma4",   "object": "model", "owned_by": "bms" }
  ]
}
```

### Model Catalog

Model ids routed by the proxy's current `MODEL_PROVIDER_MAP` (subject to change — always call `/v1/models` for the authoritative list):

| Provider | Accepted ids |
|----------|--------------|
| **kimi** (Anthropic-backend) | `kimi-k2.6`, `kimi-k2.5`, `kimi` |
| **glm5** (max 2 concurrent) | `glm-5`, `glm-5.1`, `glm5`, `glm-4.5-air` |
| **deepseek** *(default fallback)* | `deepseek`, `deepseek-chat` |
| **minimax** | `minimax`, `minimax-m2.7`, `minimax-m2.8` |
| **openai** (native) | `gpt-5.3-codex`, `gpt-4.1`, `openai` |
| **qwen** (Ollama Cloud) | `qwen`, `qwen-3.5`, `qwen3.5`, `qwen3.5:397b`, `qwen3-coder-next:cloud`, `qwen3-coder:480b`, `qwen3-coder` |
| **medgemma** (self-hosted vLLM) | `medgemma`, `google/medgemma-27b-it`, `medgemma-27b` |
| **gemma4** (self-hosted vLLM) | `gemma4`, `gemma-4`, `nvidia/gemma-4-31b-it-nvfp4` |
| **qwen-3.6-unsloth** (self-hosted Unsloth) | `qwen-3.6-unsloth`, `qwen3.6` |

### Authentication Flow (internal, informational)

1. Client sends `Authorization: Bearer <bms-session-id>`
2. Proxy checks Redis cache `bms_session:<sid>` (TTL 1h); on miss calls the BMS paste-JSON API
3. On success the proxy derives `user = "bms-<hospital_code>-<doctor_code>"`, caches it, and writes a user_session mapping
4. Per-request accounting persisted to Redis (running stats) + Postgres `billing-postgres.token_usage` (periodic flush)

### Error Responses

All errors return `application/json`:

| HTTP | `error.type` | Meaning |
|------|--------------|---------|
| 400 | `invalid_request` | Bad JSON, unknown model, malformed messages |
| 401 | `missing_auth` | No/empty Bearer token |
| 401 | `invalid_session` | BMS paste-JSON rejected the session id |
| 429 | *(rate limit)* | Too many requests — respect `Retry-After` header |
| 502 | `api_error` | Upstream provider failed after retries (auto-retried up to 2× with 1s/3s/5s delays) |

Example:

```json
{
  "error": {
    "type": "invalid_request",
    "message": "Unknown model: foo-bar",
    "code": null
  }
}
```

### Operational Characteristics

- **CORS**: `*` origin; methods GET / POST / HEAD / OPTIONS; allowed headers include `Authorization`, `x-api-key`, `anthropic-version`, `x-model`
- **Timeouts**: nginx ingress allows 300s for read/send; the client SDK uses a 290s budget to surface timeout errors cleanly before the ingress cuts the connection
- **Body limit**: 10 MB per request
- **Metrics**: Prometheus at `/metrics` (no auth), human-readable stats at `/stats` (no auth)

### Coder-path Note (internal-only)

The proxy exposes a second path `/qwen-3.6-unsloth/u/<user>/s/<sess>/v1/messages` that accepts **Anthropic-format** requests (for Claude CLI callers) and is **NOT** bms-session authenticated. Application developers should ignore this path — use `/v1/chat/completions` exclusively.

### Client SDK — `src/services/llm.ts`

Three helpers in this template match the API 1:1:

| Helper | Purpose |
|--------|---------|
| `callLlm(messages, options?)` | Non-streaming chat completion. Returns `{ id, model, content, finishReason, usage? }`. |
| `streamLlm(messages, { onDelta, ...options })` | SSE streaming — `onDelta` fires for each content chunk; resolves with the accumulated result. |
| `listLlmModels()` | Lists models from `/v1/models` (public — no auth header sent). |

All three read the session id from the active-session singleton (so stale closures auto-heal after reconnect) and surface failures as toast notifications via the shared `notify` system. They will refuse to call when there is no active session.

**Example (sync)**:

```typescript
import { callLlm } from '@/services/llm'

const res = await callLlm(
  [
    { role: 'system', content: 'You are a clinical documentation assistant.' },
    { role: 'user',   content: 'Summarise: BP 180/110, pulse 120, SpO2 92%' },
  ],
  { model: 'gemma4', temperature: 0.3 },
)

console.log(res.content)     // the assistant reply
console.log(res.usage)       // { prompt_tokens, completion_tokens, total_tokens }
```

**Example (streaming)**:

```typescript
import { streamLlm } from '@/services/llm'

let buffer = ''
const res = await streamLlm(
  [{ role: 'user', content: 'Generate a discharge summary...' }],
  {
    model: 'kimi',
    onDelta: (chunk) => {
      buffer += chunk
      setUiPreview(buffer) // incremental UI update
    },
  },
)

console.log(res.finishReason) // 'stop' when the model completed naturally
console.log(res.content === buffer) // true — `content` is the full accumulation
```

**Example (model picker)**:

```typescript
import { listLlmModels } from '@/services/llm'

const models = await listLlmModels()
// models: [{ id: 'deepseek', object: 'model', owned_by: 'deepseek' }, ...]
```

---

## Thai TTS API

**Base URL**: `https://vox-cpm.bmscloud.in.th` (external service — separate from the BMS tunnel and the LLM proxy)

**Purpose**: OpenAI-`speech`-compatible text-to-speech with a Thai-language model (`voxcpm-thai`), producing 44.1 kHz 16-bit mono audio (WAV or MP3). Includes a rich Thai text-normalization pipeline (abbreviation expansion, Thai digit → Arabic, maiyamok repetition, special symbols, province/loanword pronunciation) that is applied automatically to every synthesis request.

> **Auth**: **NONE required.** The service accepts unauthenticated requests. The OpenAI SDK example passes `api_key="unused"` for compatibility — the field is ignored.

### Endpoint Overview

| Endpoint | Method | Purpose | Response |
|----------|--------|---------|----------|
| `/v1/audio/speech` | POST | Synthesize speech from text | Binary audio (`audio/wav` or `audio/mpeg`) |
| `/v1/voices` | GET | List voice presets | JSON |
| `/v1/models` | GET | List available TTS models | JSON |
| `/v1/text/normalize` | POST | Preview the normalization pipeline without generating audio | JSON |
| `/health` | GET | Server readiness + sample rate | JSON |

### Request — `POST /v1/audio/speech`

```json
POST https://vox-cpm.bmscloud.in.th/v1/audio/speech
Content-Type: application/json

{
  "input": "สวัสดีครับ ขอต้อนรับสู่โรงพยาบาล",
  "model": "voxcpm-thai",
  "voice": "default",
  "response_format": "wav"
}
```

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| `input` | string | ✅ | — | Text to synthesize. **1 – 4096 characters** (configurable server-side via `MAX_TEXT_LENGTH`). |
| `model` | string | ❌ | `voxcpm-thai` | Model id — check `/v1/models` for the current catalog. |
| `voice` | string | ❌ | `default` | One of `default`, `female`, `male`. `default` uses the model's native voice (no cloning); `female`/`male` clone the corresponding reference voice. |
| `response_format` | string | ❌ | `wav` | `wav` or `mp3`. |
| `speed` | float | ❌ | — | Accepted for OpenAI SDK compatibility but **ignored** by the server. |

**Response**: binary audio (not JSON):

| `response_format` | Content-Type | Details |
|-------------------|--------------|---------|
| `wav` | `audio/wav` | 44.1 kHz, 16-bit PCM mono |
| `mp3` | `audio/mpeg` | 192 kbps |

### Request — `GET /v1/voices`

```json
{
  "voices": [
    { "id": "default", "name": "Default (no cloning)" },
    { "id": "female",  "name": "Female" },
    { "id": "male",    "name": "Male" }
  ]
}
```

### Request — `GET /v1/models`

```json
{
  "object": "list",
  "data": [
    { "id": "voxcpm-thai", "object": "model", "owned_by": "local" }
  ]
}
```

### Request — `POST /v1/text/normalize`

Preview the normalization pipeline without generating audio. Useful for debugging how abbreviations / Thai digits / loanwords will be pronounced.

```json
POST /v1/text/normalize
{ "text": "๕๐๐ บาท ฯลฯ" }
```

Response:

```json
{
  "original":   "๕๐๐ บาท ฯลฯ",
  "normalized": "ห้าร้อย บาท และอื่นๆ"
}
```

### Request — `GET /health`

```json
{ "status": "ok", "model": "loaded", "sample_rate": 44100 }
```

### Text Normalization Pipeline (informational)

Every `/v1/audio/speech` request passes through an automatic pipeline before synthesis:

1. Unicode cleanup (zero-width characters, NFC normalization)
2. Special-symbol expansion — e.g. `ฯลฯ` → `และอื่นๆ`, `฿` → `บาท`
3. Maiyamok (`ๆ`) repetition handling
4. 120+ Thai abbreviation expansion
5. Thai digit conversion (`๐–๙` → `0–9`)
6. Context-aware number expansion (cardinal / ordinal / currency / phone / year)
7. Pronunciation rules (province names, common loanwords)

### Operational Characteristics

- **No authentication.** Do not send `Authorization` headers — they are ignored.
- **No documented streaming** — audio is returned as a complete binary payload.
- **Concurrency**: concurrent requests are batched by the underlying `nanovllm-voxcpm` server; voice cloning uses prefix-cached prompts for fast reuse.
- **Error response format is not formally documented** — the client SDK defensively handles `{ detail }`, `{ error: { message } }`, `{ message }`, and plain text bodies.

### Client SDK — `src/services/tts.ts`

Six helpers match the API 1:1:

| Helper | Purpose |
|--------|---------|
| `synthesizeSpeech(text, options?)` | POST `/v1/audio/speech` → `{ blob, contentType, format }`. Validates text is non-empty and ≤ `MAX_TTS_TEXT_LENGTH` before fetch. |
| `playSpeech(text, options?)` | Synthesize + immediately play via `HTMLAudioElement`. Returns a playback handle with `stop()` and an `ended` promise; the Blob URL is auto-revoked on `ended` or `stop()`. |
| `listTtsVoices()` | GET `/v1/voices` → voice presets. |
| `listTtsModels()` | GET `/v1/models` → available TTS models. |
| `normalizeThaiText(text)` | POST `/v1/text/normalize` → `{ original, normalized }`. |
| `checkTtsHealth()` | GET `/health` → readiness probe. |

All six emit user-visible toast notifications on failure via the shared `notify` system (error toast for 5xx / network failures; warning toast for HTTP 429 rate limits).

**Example — synthesize and download**:

```typescript
import { synthesizeSpeech } from '@/services/tts'

const { blob, format } = await synthesizeSpeech(
  'สวัสดีครับ ขอต้อนรับสู่โรงพยาบาล',
  { voice: 'female', response_format: 'mp3' },
)

const url = URL.createObjectURL(blob)
const link = document.createElement('a')
link.href = url
link.download = `welcome.${format}`
link.click()
URL.revokeObjectURL(url)
```

**Example — synthesize and play (most common)**:

```typescript
import { playSpeech } from '@/services/tts'

const playback = await playSpeech('สวัสดีครับ', { voice: 'male' })

// Wait for playback to finish, or stop it early:
await playback.ended
// or: playback.stop()
```

**Example — voice picker + preview**:

```typescript
import { listTtsVoices, playSpeech } from '@/services/tts'

const voices = await listTtsVoices()
// [{ id: 'default', ...}, { id: 'female', ...}, { id: 'male', ...}]

async function previewVoice(voiceId: string) {
  await playSpeech('ทดสอบเสียง', { voice: voiceId })
}
```

**Example — normalization debugging**:

```typescript
import { normalizeThaiText } from '@/services/tts'

const { normalized } = await normalizeThaiText('ผู้ป่วย ๕๐ คน ฯลฯ')
console.log(normalized) // "ผู้ป่วย ห้าสิบ คน และอื่นๆ"
```

---

## Thai ASR API

**Base URL**: `https://asr1.bmscloud.in.th` (external service — separate from the BMS tunnel, LLM proxy, and TTS service)

**Purpose**: Typhoon-ASR backend for Thai (and multilingual) speech transcription. Accepts standard browser audio formats (webm/opus, mp3, wav, m4a, ogg, flac) and returns OpenAI-Whisper-compatible transcriptions with optional word- and segment-level timestamps.

> **Auth**: **NONE required.** The service accepts unauthenticated requests. Do not send Authorization headers — they are ignored.

### Endpoint Overview

| Endpoint | Method | Purpose | Body |
|----------|--------|---------|------|
| `/v1/audio/transcriptions` | POST | **Primary entry point.** OpenAI-Whisper-compatible — language hints, biasing prompts, temperature, response format, timestamp granularities. | `multipart/form-data` |
| `/transcribe` | POST | Typhoon-native simple transcription (file + device). | `multipart/form-data` |
| `/transcribe-with-timestamps` | POST | Typhoon-native transcription with segment timestamps. | `multipart/form-data` |
| `/health` | GET | Server readiness probe. | — |

### Request — `POST /v1/audio/transcriptions`

All requests are `multipart/form-data` (binary upload of the audio file plus form fields).

| Form field | Type | Required | Default | Notes |
|------------|------|----------|---------|-------|
| `file` | file (binary) | ✅ | — | Audio blob. Filename extension drives the server's decoder selection — pass `.wav`/`.mp3`/`.webm`/`.ogg`/`.flac`/`.m4a` explicitly when using `MediaRecorder` Blobs. |
| `model` | string | ❌ | `typhoon-asr-realtime` | Model id. Check the deployment for other options. |
| `language` | string | ❌ | `th` | BCP-47 language code. |
| `prompt` | string | ❌ | — | Context prompt that biases the model toward specific vocabulary (medical terms, proper nouns, abbreviations). |
| `response_format` | string | ❌ | `json` | `json`, `verbose_json`, `text`, `srt`, or `vtt`. |
| `temperature` | float | ❌ | `0.0` | Sampling temperature. |
| `timestamp_granularities` | string | ❌ | — | Comma-separated list of `segment` and/or `word`. Only meaningful with `verbose_json`. |

**Response (response_format: `json`)**:

```json
{ "text": "สวัสดีครับ ขอต้อนรับสู่โรงพยาบาล" }
```

**Response (response_format: `verbose_json`)**:

```json
{
  "text": "Hello world.",
  "language": "en",
  "duration": 2.3,
  "segments": [
    {
      "id": 0,
      "start": 0.0,
      "end": 1.2,
      "text": "Hello",
      "words": [{ "word": "Hello", "start": 0.0, "end": 1.1 }]
    },
    { "id": 1, "start": 1.3, "end": 2.3, "text": "world." }
  ]
}
```

**Response (response_format: `text` / `srt` / `vtt`)**: plain string body with `text/plain` content type. The client SDK wraps this in `{ text: <string>, raw: { text } }` for a uniform return shape.

### Request — `POST /transcribe` and `POST /transcribe-with-timestamps`

Typhoon-native endpoints with a minimal form body.

| Form field | Type | Required | Default | Notes |
|------------|------|----------|---------|-------|
| `file` | file (binary) | ✅ | — | Audio blob. |
| `device` | string | ❌ | `auto` | Inference device — `auto`, `cpu`, `cuda`, etc. |

Returns a Whisper-style JSON body (`text`, plus `segments` on the `-with-timestamps` endpoint).

### Request — `GET /health`

Simple readiness probe; returns server JSON without strict schema guarantees (typically `{ "status": "ok" }`).

### Validation errors

The server responds with HTTP `422` + FastAPI's `{ "detail": [...] }` format for validation failures (unsupported format, missing file, etc.). The client SDK flattens this into a readable error message.

### Client SDK — `src/services/asr.ts`

Five helpers map 1:1 to the documented API plus two MediaRecorder conveniences:

| Helper | Purpose |
|--------|---------|
| `transcribeAudio(file, options?)` | **Primary.** `POST /v1/audio/transcriptions` with all Whisper-compat options. Returns `{ text, segments?, language?, duration?, raw }`. |
| `transcribeAudioTyphoon(file, { withTimestamps?, device? })` | Typhoon-native endpoints (`/transcribe` or `/transcribe-with-timestamps`). |
| `checkAsrHealth()` | `GET /health` probe. |
| `createAsrRecorder({ mimeType?, audioConstraints? })` | Wrap a `MediaRecorder` around the microphone. Returns `{ start, stop, cancel, recorder, stream }`. Track shutdown on `stop()`/`cancel()` — no dangling mic indicators. |
| `recordAndTranscribe(durationMs, options?)` | Convenience — record for `durationMs`, then transcribe. |

All helpers emit user-visible toast notifications on failure (error for 5xx / 422 / network; warning for 429).

**Example — transcribe an uploaded file**:

```typescript
import { transcribeAudio } from '@/services/asr'

const file: File = /* e.g. from <input type="file"> */
const result = await transcribeAudio(file, {
  response_format: 'verbose_json',
  timestamp_granularities: 'segment',
  prompt: 'Medical vocabulary: hypertension, tachycardia.',
})

console.log(result.text)
result.segments?.forEach((s) => console.log(`[${s.start}s] ${s.text}`))
```

**Example — press-to-talk (manual start/stop)**:

```typescript
import { createAsrRecorder, transcribeAudio } from '@/services/asr'

let handle: Awaited<ReturnType<typeof createAsrRecorder>> | null = null

async function onMouseDown() {
  handle = await createAsrRecorder()
  handle.start()
}

async function onMouseUp() {
  if (!handle) return
  const blob = await handle.stop()
  handle = null
  const { text } = await transcribeAudio(blob, { language: 'th' })
  console.log('you said:', text)
}
```

**Example — record a fixed-duration clip**:

```typescript
import { recordAndTranscribe } from '@/services/asr'

// Record 5 s from the microphone, then transcribe.
const result = await recordAndTranscribe(5_000, {
  language: 'th',
  response_format: 'verbose_json',
})
```

**Example — health probe on app boot**:

```typescript
import { checkAsrHealth } from '@/services/asr'

const health = await checkAsrHealth()
if (health.status !== 'ok') {
  console.warn('ASR service not ready')
}
```

---

## Core Components

### Service Layer (`src/services/bmsSession.ts`)

#### Key Functions:

1. **`retrieveBmsSession(sessionId: string)`**
   - Calls HOSxP PasteJSON API with session ID
   - Returns session data including user info and connection config
   - Handles authentication and error states

2. **`executeSqlViaApi(sql, config)`**
   - Executes SQL SELECT queries against hospital database
   - Uses connection config from session data
   - Supports Bearer token authentication
   - Endpoint: `/api/sql`

3. **`extractConnectionConfig(sessionData)`**
   - Extracts API URL from `user_info.bms_url`
   - Extracts authentication key from `user_info.bms_session_code` (or `key_value`)
   - Extracts session expiry from `expired_second`
   - Returns connection configuration object

#### Data Types:

```typescript
interface BmsSessionResponse {
  MessageCode: number;        // 200 = success, 500 = expired
  Message?: string;
  result?: {
    system_info?: {
      version?: string;         // Application version
      environment?: string;     // 'production' or 'development'
    };
    user_info?: {
      name?: string;                    // Full username
      position?: string;                // Position name
      position_id?: string;             // Position standard ID
      hospital_code?: string;           // Hospital code
      doctor_code?: string;             // Doctor code
      department?: string;              // Department name
      location?: string;                // Hospital name
      is_hr_admin?: boolean;            // HR admin flag
      is_director?: boolean;            // Director flag
      bms_url?: string;                 // Public API URL
      bms_session_port?: number;        // Tunnel port number
      bms_session_code?: string;        // JWT authentication token
      bms_database_name?: string;       // Database name
      bms_database_type?: string;       // Database type (e.g., 'mysql')
    };
    key_value?: string;         // JWT token (same as bms_session_code)
    expired_second?: number;    // Session expiry time in seconds (default: 36000 = 10 hours)
  };
}
```

### React Hooks (`src/hooks/useBmsSession.ts`)

#### `useBmsSession()` Hook
Primary React hook for session management:

- **State Management**: Tracks session ID, data, connection config, user info
- **Connection Methods**:
  - `connectSession(sessionId)` - Establishes new session
  - `disconnectSession()` - Clears current session
  - `refreshSession()` - Refreshes existing session
- **Query Execution**:
  - `executeQuery(sql)` - Runs SELECT queries via authenticated API

#### `useQuery()` Hook
Manages SQL SELECT query lifecycle:

- Tracks query data, loading state, errors
- Supports auto-execution on mount
- Provides `execute()` and `reset()` methods

### Session Storage (`src/utils/sessionStorage.ts`)

#### Cookie Management:
- **Storage**: 7-day expiry, secure flag for HTTPS
- **Functions**:
  - `setSessionCookie(sessionId)` - Stores session
  - `getSessionCookie()` - Retrieves stored session
  - `removeSessionCookie()` - Clears session

#### URL Handling:
- `getSessionFromUrl()` - Extracts from URL parameter
- `removeSessionFromUrl()` - Cleans URL after extraction
- `handleUrlSession()` - Combined flow: extract → store → clean

### Context Provider (`src/contexts/BmsSessionContext.tsx`)

Provides global session state via React Context:
- Wraps app with `BmsSessionProvider`
- Access via `useBmsSessionContext()` hook
- Shares session state across all components

## Complete Data Flow

### 1. Session Initialization

```
1. User visits: https://app.example.com/?bms-session-id=ABC123
2. SessionValidator component mounts
3. handleUrlSession() is called:
   - Extracts "ABC123" from URL
   - Stores in cookie (7-day expiry)
   - Removes parameter from URL (clean URL)
4. connectSession("ABC123") is triggered
```

### 2. Session Validation

```
1. retrieveBmsSession("ABC123") called
2. GET request to: https://hosxp.net/phapi/PasteJSON?Action=GET&code=ABC123
3. Response parsed:
   - MessageCode 200: Success → Extract config
   - MessageCode 500: Session expired
   - Other: Error handling
4. extractConnectionConfig() processes response:
   - API URL: result.user_info.bms_url
   - Auth Key: result.user_info.bms_session_code (or result.key_value)
   - Expiry: result.expired_second (default: 36000 seconds / 10 hours)
   - User Info: result.user_info (name, position, hospital, etc.)
   - System Info: result.system_info (version, environment)
```

### 3. API Configuration Extraction

The system extracts configuration from the session response:

```javascript
// API URL extraction:
const apiUrl = result.user_info.bms_url;  // Public API URL (e.g., http://tunnel-url)

// Authentication Key extraction (JWT token):
const apiAuthKey = result.user_info.bms_session_code;  // JWT token
// Alternative: result.key_value (same JWT token)

// Session expiry:
const expirySeconds = result.expired_second;  // Default: 36000 (10 hours)

// Additional connection info:
const databaseName = result.user_info.bms_database_name;  // Database name
const databaseType = result.user_info.bms_database_type;  // Database type
```

### 4. SQL Query Execution (Read)

```
1. Component calls: session.executeQuery(sql)
2. executeSqlViaApi() builds request:
   - URL: {apiUrl}/api/sql?sql={encodedSQL}&app=BMS.Dashboard.React
   - Headers: Authorization: Bearer {apiAuthKey}
3. SQL is minified before transport (comments removed, whitespace compressed)
4. Response handled:
   - 200: Parse JSON data array
   - 401: Unauthorized (invalid key)
   - 502: Bad Gateway (tunnel issue)
   - Other: Error handling
```

## User Roles and Permissions

The session data includes user role information that can be used for authorization:

### Available Role Flags

```typescript
interface UserRoles {
  is_hr_admin: boolean;    // Human Resources administrator
  is_director: boolean;    // Hospital director/management
}
```

### Role-Based Access Control Example

```jsx
function DashboardPanel() {
  const session = useBmsSessionContext();

  // Check user role for dashboard visibility
  const canViewDirectorStats = session.userInfo?.is_director;
  const canViewHRStats = session.userInfo?.is_hr_admin;

  return (
    <div>
      <h1>Hospital Dashboard</h1>
      <GeneralStats />
      {canViewDirectorStats && <DirectorStats />}
      {canViewHRStats && <HRStats />}
    </div>
  );
}
```

### User Identity Information

```typescript
interface UserIdentity {
  name: string;              // Full name
  position: string;          // Job position
  position_id: string;       // Position standard ID
  doctor_code?: string;      // Doctor code (if applicable)
  department: string;        // Department name
  location: string;          // Hospital name
  hospital_code: string;     // Hospital identification code
}
```

## Database Connection Information

The session includes database connection details:

```typescript
interface DatabaseInfo {
  bms_url: string;              // API endpoint URL (tunnel URL)
  bms_session_code: string;     // JWT authentication token
  bms_database_name: string;    // Database name
  bms_database_type: string;    // Database type (e.g., 'mysql', 'PostgreSQL')
}
```

### Using Database Information

```jsx
function DatabaseStatus() {
  const session = useBmsSessionContext();

  return (
    <div>
      <h3>Database Connection</h3>
      <p>Database: {session.userInfo?.bms_database_name}</p>
      <p>Type: {session.userInfo?.bms_database_type}</p>
      <p>API URL: {session.userInfo?.bms_url}</p>
    </div>
  );
}
```

## Database Type Awareness and Compatibility

The BMS Session API supports multiple database types commonly used in HOSxP deployments, including MySQL, MariaDB, and PostgreSQL.

### Database Type Detection

```javascript
// Automatic detection query
const versionQuery = await client.executeQuery('SELECT VERSION() as version');
const version = versionQuery.data.data[0].version.toLowerCase();

// Detection logic
if (version.includes('mysql') || version.includes('mariadb')) {
    return 'mysql'; // MySQL or MariaDB
} else if (version.includes('postgresql') || version.includes('postgres')) {
    return 'postgresql'; // PostgreSQL
} else {
    return 'unknown'; // Other databases
}
```

**Database Types Supported:**
- **MySQL** 5.7+ / 8.0+
- **MariaDB** 10.2+ / 10.3+ / 10.4+ / 10.5+ / 10.6+
- **PostgreSQL** 9.6+ / 10+ / 11+ / 12+ / 13+ / 14+
- **Other**: Fallback to standard SQL with MySQL syntax

### PostgreSQL String Quoting Requirements

**Critical**: PostgreSQL requires single quotes (`'`) for string literals. Double quotes (`"`) are used for identifiers (table/column names).

```sql
-- ✅ Correct PostgreSQL syntax
SELECT * FROM patient WHERE hn = '12345'
SELECT * FROM patient WHERE status = 'active'
SELECT * FROM patient WHERE pname LIKE '%Smith%'

-- ❌ Incorrect (will cause syntax errors)
SELECT * FROM patient WHERE hn = "12345"
SELECT * FROM patient WHERE status = "active"
```

**Best Practice**: Use single quotes for all string literals to ensure compatibility across MySQL, MariaDB, and PostgreSQL.

### Database-Specific SQL Queries

#### Table Structure Queries

**MySQL/MariaDB:**
```sql
DESCRIBE patient
-- Returns: Field, Type, Null, Key, Default, Extra
```

**PostgreSQL:**
```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'patient'
ORDER BY ordinal_position
-- Returns: column_name, data_type, is_nullable, column_default
```

#### Table Listing Queries

**MySQL/MariaDB:**
```sql
SHOW TABLES
-- Returns: Tables_in_database_name (e.g., "Tables_in_hos")
```

**PostgreSQL:**
```sql
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
-- Returns: tablename
```

#### Random Sampling Queries

**MySQL/MariaDB:**
```sql
SELECT * FROM patient ORDER BY RAND() LIMIT 5
```

**PostgreSQL:**
```sql
SELECT * FROM patient ORDER BY RANDOM() LIMIT 5
```

### Field Type Code Mapping

| Field Type | MySQL/MariaDB | PostgreSQL | Field Code |
|------------|---------------|------------|------------|
| Boolean | TINYINT(1) | BOOLEAN | 1 |
| Integer | INT, BIGINT | INTEGER, BIGINT | 2 |
| Float | FLOAT, DOUBLE | REAL, DOUBLE PRECISION | 3 |
| DateTime | DATETIME, TIMESTAMP | TIMESTAMP, DATE | 4 |
| Time | TIME | TIME | 5 |
| String | VARCHAR, TEXT | VARCHAR, TEXT | 6 |
| Blob | BLOB, LONGBLOB | BYTEA | 7 |
| Text | TEXT | TEXT | 9 |

### Database Version Compatibility

#### Minimum Supported Versions
- **MySQL**: 5.7+ (recommended: 8.0+)
- **MariaDB**: 10.2+ (recommended: 10.5+)
- **PostgreSQL**: 9.6+ (recommended: 12+)

#### Feature Support by Version
| Feature | MySQL 5.7 | MySQL 8.0 | MariaDB 10.2 | MariaDB 10.5+ | PostgreSQL 9.6 | PostgreSQL 12+ |
|---------|-----------|-----------|--------------|---------------|----------------|----------------|
| Common Table Expressions (CTE) | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Window Functions | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| JSON Functions | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Regular Expressions | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

## Component Integration

### SessionValidator Component
Entry point for session management:

```jsx
<BmsSessionProvider>
  <SessionValidator onSessionReady={handleReady}>
    {/* Protected content */}
  </SessionValidator>
</BmsSessionProvider>
```

- Shows login UI if no session
- Validates existing sessions
- Manages session lifecycle

### Using Session in Components (Read Operations)

```jsx
function MyComponent() {
  const session = useBmsSessionContext();

  // Check connection status
  if (!session.isConnected) {
    return <div>Not connected</div>;
  }

  // Access user information from session
  const userInfo = session.userInfo;
  console.log("User:", userInfo.name);
  console.log("Position:", userInfo.position);
  console.log("Hospital:", userInfo.location);
  console.log("Department:", userInfo.department);
  console.log("Is Director:", userInfo.is_director);
  console.log("Is HR Admin:", userInfo.is_hr_admin);

  // Access system information
  const systemInfo = session.systemInfo;
  console.log("Version:", systemInfo.version);
  console.log("Environment:", systemInfo.environment);

  // Execute SQL query
  const handleQuery = async () => {
    const result = await session.executeQuery(
      "SELECT COUNT(*) as total FROM patient"
    );

    if (result.ok) {
      console.log("Data:", result.data);
    }
  };
}
```

## Security Considerations

### Authentication
- Session IDs are temporary tokens from HOSxP system
- Bearer token authentication for API calls
- Sessions expire after 10 hours (36000 seconds) by default
  - Expiry time included in session response: `expired_second`
  - MessageCode 500 indicates expired session
- JWT tokens used for API authentication (`bms_session_code`)

### Data Protection
- HTTPS enforced for production
- Cookies use secure flag when on HTTPS
- Session IDs removed from URL after processing

### SQL Injection Prevention
- SQL queries are URL-encoded before transmission
- Backend HOSxP API validates and sanitizes
- **Table name validation**:
  - Blacklisted tables cannot be accessed
  - Maximum 20 tables per query
  - Dots not allowed in table names (prevents cross-database queries)
- **SQL statement whitelist**:
  - Only SELECT, DESCRIBE, EXPLAIN, SHOW, WITH statements allowed
  - Other SQL statements return 403 Forbidden error

### Authorization Levels

#### Level 1: Read-Only Access (JWT Session Only)

- **Endpoints**: `/api/sql` (GET/POST), `/api/rest/{table}` (GET only)
- **Requirements**:
  - Valid session ID
  - Bearer token authentication (`bms_session_code`)
- **Permissions**:
  - Execute SELECT queries via `/api/sql`
  - Read records via `/api/rest` (GET)
  - Use DESCRIBE, EXPLAIN, SHOW statements
  - Read all accessible tables (except blacklisted)

#### Level 2: Read/Write Access (JWT + Marketplace Token)

- **Endpoints**: `/api/rest/{table}` (GET, POST, PUT, DELETE)
- **Requirements**:
  - Valid session ID + Bearer token
  - Valid marketplace token with table grants
- **Permissions**:
  - READONLY grant: GET access to granted tables
  - READWRITE grant: GET, POST, PUT, DELETE access to granted tables
- **How to obtain**: Marketplace tokens are issued through the BMS Marketplace platform (`hosxp-marketplace.bmscloud.in.th`) when registering an add-on application

## Error Handling

### Session Errors
- **Expired Session**: MessageCode 500, prompts re-authentication
- **Invalid Session**: 401 Unauthorized, invalid/missing API key
- **Network Issues**: 502 Bad Gateway, timeout handling (30s default)

### Query Errors (Read)
- SQL syntax errors returned in response with MessageCode 409
- **Blacklisted table access**: Returns validation error
- **Unsupported SQL statement**: Returns 403 error
- **Too many tables**: Returns validation error (max 20 tables)
- **Invalid table name format**: Returns validation error (no dots allowed)
- Connection failures trigger retry logic
- Timeout after 60 seconds (server-side timeout)

## Best Practices

### Session Management
1. Always check `isConnected` before queries
2. Handle session expiry gracefully
3. Clear sessions on logout

### Query Optimization
1. Minify SQL before transport
2. Use parallel queries when possible
3. Implement proper error handling
4. Use LIMIT to restrict result sets
5. Use aggregate functions for statistics

### Privacy-Conscious Design

> **Key Principle**: Design your application to work with non-sensitive, aggregated data.

1. **Use COUNT, SUM, AVG** instead of retrieving individual records
2. **Avoid selecting personal identifiers** (CID, full names, addresses) when not necessary
3. **Use grouping** to show statistics by category rather than individual data
4. **Consider date ranges** for trends rather than specific dates

**Good Examples**:
```sql
-- Statistics by age group
SELECT
  CASE
    WHEN TIMESTAMPDIFF(YEAR, birthday, CURDATE()) < 18 THEN 'Child'
    WHEN TIMESTAMPDIFF(YEAR, birthday, CURDATE()) < 65 THEN 'Adult'
    ELSE 'Senior'
  END as age_group,
  COUNT(*) as patient_count
FROM patient
GROUP BY age_group

-- Monthly visit trends (using ovst = outpatient visits table)
SELECT
  DATE_FORMAT(vstdate, '%Y-%m') as month,
  COUNT(*) as visit_count
FROM ovst
WHERE vstdate >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
GROUP BY month
ORDER BY month

-- Department workload (using kskdepartment for department names)
SELECT
  k.department,
  COUNT(*) as patient_count
FROM ovst o
LEFT JOIN kskdepartment k ON o.cur_dep = k.depcode
WHERE o.vstdate = CURDATE()
GROUP BY k.department
```

### Component Design
1. Use context provider at app root
2. Leverage hooks for state management
3. Implement loading states
4. Show meaningful error messages

## Example Implementations

### Full Component with Read Operations

```jsx
import { useBmsSessionContext, useQuery } from '../hooks/useBmsSession';

function HospitalStats() {
  const session = useBmsSessionContext();
  const query = useQuery(
    "SELECT COUNT(*) as total FROM patient",
    session,
    true // auto-execute
  );

  if (!session.isConnected) {
    return <div>Please connect session</div>;
  }

  if (query.isLoading) {
    return <div>Loading...</div>;
  }

  if (query.error) {
    return <div>Error: {query.error}</div>;
  }

  return (
    <div>
      <h2>Patient Count: {query.data?.[0]?.total || 0}</h2>
      <p>User: {session.userInfo?.name}</p>
      <p>Position: {session.userInfo?.position}</p>
      <p>Hospital: {session.userInfo?.location}</p>
      <p>Department: {session.userInfo?.department}</p>
      <p>System Version: {session.systemInfo?.version}</p>
    </div>
  );
}
```

### Statistical Dashboard Example

```jsx
import { useBmsSessionContext, useQuery } from '../hooks/useBmsSession';

function DashboardStats() {
  const session = useBmsSessionContext();

  // Multiple queries for dashboard
  const patientCount = useQuery(
    "SELECT COUNT(*) as total FROM patient",
    session, true
  );

  const todayVisits = useQuery(
    "SELECT COUNT(*) as total FROM ovst WHERE vstdate = CURDATE()",
    session, true
  );

  const genderStats = useQuery(
    "SELECT sex, COUNT(*) as count FROM patient GROUP BY sex",
    session, true
  );

  if (!session.isConnected) {
    return <div>Please connect session</div>;
  }

  return (
    <div className="dashboard">
      <h1>Hospital Dashboard</h1>

      <div className="stats-grid">
        <div className="stat-card">
          <h3>Total Patients</h3>
          <p>{patientCount.data?.[0]?.total || 'Loading...'}</p>
        </div>

        <div className="stat-card">
          <h3>Today's Visits</h3>
          <p>{todayVisits.data?.[0]?.total || 'Loading...'}</p>
        </div>

        <div className="stat-card">
          <h3>Gender Distribution</h3>
          {genderStats.data?.map(row => (
            <p key={row.sex}>{row.sex}: {row.count}</p>
          ))}
        </div>
      </div>
    </div>
  );
}
```

### Manual Session Connection

```jsx
function LoginForm() {
  const [sessionId, setSessionId] = useState('');
  const session = useBmsSessionContext();

  const handleConnect = async () => {
    const success = await session.connectSession(sessionId);
    if (success) {
      // Store in cookie for persistence
      setSessionCookie(sessionId);
    }
  };

  return (
    <div>
      <input
        value={sessionId}
        onChange={(e) => setSessionId(e.target.value)}
        placeholder="Enter BMS Session ID"
      />
      <button onClick={handleConnect}>
        Connect
      </button>
    </div>
  );
}
```

## Real-World Examples

### Example 1: Get Database Version
```bash
GET /api/sql?sql=SELECT%20VERSION()%20as%20version&app=BMS.Dashboard.React
Authorization: Bearer {session_token}

Response:
{
  "result": {},
  "MessageCode": 200,
  "Message": "OK",
  "RequestTime": "2025-10-20T12:00:00.000Z",
  "data": [{"version": "10.1.14-MariaDB"}],
  "field": [6],
  "field_name": ["version"],
  "record_count": 1
}
```

### Example 2: Get Table Structure
```bash
GET /api/sql?sql=DESCRIBE%20patient&app=BMS.Dashboard.React
Authorization: Bearer {session_token}

Response:
{
  "result": {},
  "MessageCode": 200,
  "Message": "OK",
  "RequestTime": "2025-10-20T12:00:00.000Z",
  "data": [
    {
      "Field": "hn",
      "Type": "varchar(9)",
      "Null": "NO",
      "Key": "PRI",
      "Default": null,
      "Extra": ""
    }
    // ... more fields
  ],
  "field": [6, 6, 6, 6, 6, 6],
  "field_name": ["Field", "Type", "Null", "Key", "Default", "Extra"],
  "record_count": 100
}
```

### Example 3: Aggregate Statistics Query
```bash
POST /api/sql
Authorization: Bearer {session_token}
Content-Type: application/json

{
  "sql": "SELECT sex, COUNT(*) as count FROM patient WHERE birthday IS NOT NULL GROUP BY sex",
  "app": "BMS.Dashboard.React"
}

Response:
{
  "result": {},
  "MessageCode": 200,
  "Message": "OK",
  "RequestTime": "2025-10-20T12:00:00.000Z",
  "data": [
    {"sex": "M", "count": 45230},
    {"sex": "F", "count": 52180}
  ],
  "field": [6, 2],
  "field_name": ["sex", "count"],
  "record_count": 2
}
```

### Example 4: Blacklisted Table Access (Error)
```bash
GET /api/sql?sql=SELECT%20*%20FROM%20opduser%20LIMIT%201&app=BMS.Dashboard.React
Authorization: Bearer {session_token}

Response:
{
  "result": {},
  "MessageCode": 400,
  "Message": "SQL Validation Failed",
  "RequestTime": "2025-10-20T12:00:00.000Z"
}
```

### Example 5: REST API - List OPD Visits with Joins
```bash
GET /api/rest/ovst?select=vn,vstdate,vsttime,patient(pname,fname,lname),doctor(name)&vstdate=eq.2024-06-15&order=vsttime.desc&limit=20
Authorization: Bearer {session_token}

Response:
{
  "MessageCode": 200,
  "Message": "OK",
  "RequestTime": "2025-10-20T12:00:00.000Z",
  "data": [
    {
      "vn": "660615001",
      "vstdate": "2024-06-15",
      "vsttime": "16:30:00",
      "patient.pname": "Mr.",
      "patient.fname": "John",
      "patient.lname": "Doe",
      "doctor.name": "Dr. Smith"
    }
  ],
  "field": [6, 4, 5, 6, 6, 6, 6],
  "field_name": ["vn", "vstdate", "vsttime", "patient.pname", "patient.fname", "patient.lname", "doctor.name"],
  "record_count": 1,
  "limit": 20,
  "offset": 0
}
```

### Example 6: REST API - Get Single Patient
```bash
GET /api/rest/patient/HN0001
Authorization: Bearer {session_token}

Response:
{
  "MessageCode": 200,
  "Message": "OK",
  "RequestTime": "2025-10-20T12:00:00.000Z",
  "data": {
    "hos_guid": "{GUID}",
    "hn": "HN0001",
    "pname": "Mr.",
    "fname": "John",
    "lname": "Doe",
    "sex": "1",
    "birthday": "1990-05-15"
  },
  "field": [6, 6, 6, 6, 6, 6, 4],
  "field_name": ["hos_guid", "hn", "pname", "fname", "lname", "sex", "birthday"]
}
```

### Example 7: REST API - Unavailable Table (Error)
```bash
GET /api/rest/opduser
Authorization: Bearer {session_token}

Response:
{
  "MessageCode": 404,
  "Message": "Table not available: opduser",
  "RequestTime": "2025-10-20T12:00:00.000Z"
}
```

### Example 8: REST API - Write Without Marketplace Token (Error)
```bash
POST /api/rest/oapp
Authorization: Bearer {session_token}
Content-Type: application/json

{ "hn": "HN0001", "nextdate": "2024-07-01", "doctor": "001" }

Response:
{
  "MessageCode": 403,
  "Message": "Write operations require a marketplace token",
  "RequestTime": "2025-10-20T12:00:00.000Z"
}
```

### Example 9: Function API - Generate Serial Number
```bash
POST /api/function?name=get_serialnumber
Authorization: Bearer {session_token}
Content-Type: application/json

{
  "serial_name": "refill_order_id",
  "table_name": "refill_order",
  "field_name": "order_id"
}

Response:
{
  "MessageCode": 200,
  "Message": "OK",
  "Value": 1234567
}
```

### Example 10: Function API - Read Hospital Variable
```bash
POST /api/function?name=get_hosvariable
Authorization: Bearer {session_token}
Content-Type: application/json

{
  "variable_name": "HOSPITAL_NAME"
}

Response:
{
  "MessageCode": 200,
  "Message": "OK",
  "Value": "โรงพยาบาลตัวอย่าง"
}
```

### Example 11: Function API - Missing Key (Error)
```bash
POST /api/function?name=get_serialnumber
Authorization: Bearer {session_token}
Content-Type: application/json

{
  "serial_name": "refill_order_id"
}

Response:
{
  "MessageCode": 500,
  "Message": "Invalid Key data for get_serialnumber table_name"
}
```

## Testing

### Connection Test Query
```sql
SELECT VERSION()
```

### Sample Statistics Queries (Read)
```sql
-- Patient count by gender
SELECT sex, COUNT(*) as count
FROM patient
GROUP BY sex

-- Monthly visit statistics (ovst = outpatient visits)
SELECT
  DATE_FORMAT(vstdate, '%Y-%m') as month,
  COUNT(*) as visits
FROM ovst
WHERE vstdate >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
GROUP BY month
ORDER BY month

-- Department workload today (kskdepartment for department names)
SELECT
  k.department,
  COUNT(*) as patient_count
FROM ovst o
LEFT JOIN kskdepartment k ON o.cur_dep = k.depcode
WHERE o.vstdate = CURDATE()
GROUP BY k.department
ORDER BY patient_count DESC
```

## Troubleshooting

### Common Issues

1. **Session Not Found**
   - Check URL parameter format: `?bms-session-id=VALUE`
   - Verify cookie is set correctly
   - Ensure session hasn't expired

2. **API Connection Failed**
   - Verify network connectivity
   - Check CORS settings if applicable
   - Confirm API URL is accessible

3. **SQL Execution Errors**
   - Validate SQL syntax
   - Check database permissions
   - Verify table/column names
   - Use single quotes for string literals

4. **Unauthorized Access (HTTP 501)**
   - Verify Bearer token is included in request
   - Check session is valid and not expired

## Version History

- **v3.6.0** (Developer Edition):
  - Added [Appointment Domain Endpoints](#appointment-domain-endpoints) extension #5: **confirm appointment** — `POST /api/rest/oapp/{oapp_id}/confirm`
  - Writes the new `oapp.oapp_confirm_*` tracking fields (`oapp_confirm_type_id`, `oapp_confirm_method`, `oapp_confirm_note`, `oapp_confirm_datetime`); `oapp_status_id` is intentionally left unchanged (confirmation is a sub-state of "waiting")
  - FK-validates `oapp_confirm_type_id` against the new `oapp_confirm_type` lookup (default rows: 1=ยืนยันแล้ว, 2=รอยืนยัน); reuses the shared `AppointmentIsMutable` status guard (409 on closed/visited/cancelled)
  - Updated the appointment intro (four → five extensions), the typical-client-workflow sequence, the permissions note, and the counter-transition matrix

- **v3.5.0** (Developer Edition):
  - Expanded the `/api/function` catalogue from 3 to ~60 functions, grouped by purpose: patient lookup, identifier validators, pricing & finance, inventory, code/name lookups, lab, visit control, notifications, access control, generic table access, server utilities, cloud/datacenter bridge, and restricted integrations
  - Added explicit notes that `get_field_from_table`, `get_new_code`, and `get_table_columns` do NOT enforce the `/api/sql` table blacklist — treat them as server-privileged operations
  - Added `set_hosvariable` detailed reference next to `get_hosvariable`
  - Documented HOSxPDMULite-mode behavior: some functions return stub/default values in the lite build
  - Documented restricted-integration functions (`get_cds_xml`, `get_telemedicine_url`, `emr_text`, `get_moph_jwt`, `check_dga_cid`) as requiring server-side secret validation — external add-ons should not call them
  - Clarified that the return-field column in the catalogue is authoritative per function (most use `Value`, but many use domain-specific fields like `data`, `columns`, `is_pregnancy`, `price`, `allowed`, `locked`, `remain_qty`, etc.)

- **v3.4.0** (Developer Edition):
  - Added [Thai ASR API](#thai-asr-api) section documenting the public `asr1.bmscloud.in.th` Typhoon-ASR backend (OpenAI-Whisper-compatible `/v1/audio/transcriptions` + Typhoon-native `/transcribe`, `/transcribe-with-timestamps`, `/health`)
  - Explicitly flagged as **unauthenticated** — do not send an Authorization header
  - Documented multipart/form-data request shape, all response formats (json, verbose_json, text, srt, vtt), timestamp granularities, segment shape with word-level timestamps
  - Client SDK: `transcribeAudio`, `transcribeAudioTyphoon`, `checkAsrHealth`, `createAsrRecorder`, `recordAndTranscribe` in `src/services/asr.ts` — including MediaRecorder wrappers for browser microphone capture with automatic track shutdown
  - Worked examples: upload-file transcription, press-to-talk (manual start/stop), fixed-duration recording, health probe

- **v3.3.0** (Developer Edition):
  - Added [Thai TTS API](#thai-tts-api) section documenting the public `vox-cpm.bmscloud.in.th` speech service (OpenAI-compatible `/v1/audio/speech`, plus `/v1/voices`, `/v1/models`, `/v1/text/normalize`, `/health`)
  - Explicitly flagged as **unauthenticated** — do not send a Bearer header
  - Documented WAV (44.1 kHz 16-bit mono) vs MP3 (192 kbps) output, 4096-character input ceiling, voice presets (default/female/male with cloning semantics)
  - Documented the automatic Thai normalization pipeline stages (abbreviations, Thai digits, maiyamok, special symbols, province names)
  - Client SDK: `synthesizeSpeech`, `playSpeech`, `listTtsVoices`, `listTtsModels`, `normalizeThaiText`, `checkTtsHealth` in `src/services/tts.ts` with worked examples (download-to-file, browser playback, voice picker, normalization debug)

- **v3.2.0** (Developer Edition):
  - Added [LLM Completions API](#llm-completions-api) section documenting the external `ai-api.kube.bmscloud.in.th` proxy (OpenAI-compatible `/v1/chat/completions` + public `/v1/models`)
  - Called out that the LLM proxy uses the **raw `bms-session-id`** as Bearer, NOT the `bms_session_code` JWT used for `/api/sql`/`/api/rest`/`/api/function`
  - Documented model catalog (kimi, deepseek, glm5, minimax, openai, qwen, medgemma, gemma4, qwen-3.6-unsloth), sync JSON response shape, SSE streaming format, error codes, operational characteristics (timeouts, body limit, CORS, metrics)
  - Client SDK: `callLlm`, `streamLlm`, `listLlmModels` in `src/services/llm.ts` — with worked examples
  - Explicitly documented that the `/qwen-3.6-unsloth/u/.../v1/messages` coder path is internal-only and not bms-session authenticated

- **v3.1.0** (Developer Edition):
  - Scoped documentation to the three supported endpoints: `/api/sql` (read-only), `/api/rest` (CRUD), `/api/function` (support utilities)
  - Documented marketplace-token launch semantics: URL-only from HOSxP dashboard / approved addon integration; other environments run in read-only mode with sensitive data auto-encrypted/masked
  - Added marketplace-token parameter name compatibility (`marketplace-token` and `marketplace_token`)
  - Added `/api/sql` additional restrictions: reject `LOAD DATA`, `INTO OUTFILE/DUMPFILE`, `LOAD_FILE`, multi-statement payloads
  - Clarified max-20-tables-per-query scope (includes subqueries, CTEs, joins)
  - Added `text` as a compatibility alias for `string` param binding; documented NULL-on-empty behavior
  - Clarified that `app` parameter is free-form identifier for logging only
  - Added explicit `insert_count` / `update_count` / `delete_count` response fields for `/api/rest` writes
  - Clarified that `/api/function` response field varies per function (`Value` vs `xmldata`, etc.); restricted documented surface to `get_serialnumber`, `get_hosvariable`, `get_cds_xml`
  - Clarified field type code `4` covers both DATE and DATETIME; server-local timezone semantics

- **v3.0.0** (Developer Edition):
  - Added `/api/rest` RESTful CRUD endpoint documentation
  - 110 tables available with config-driven access control
  - Expand/join syntax for automatic table lookups
  - Filter operators (eq, neq, gt, gte, lt, lte, like, in, is)
  - Marketplace token integration for table-level ACL
  - Bulk insert and bulk update support
  - Endpoint overview table

- **v2.0.0** (Developer Edition):
  - Documentation for read-only operations
  - Focus on non-sensitive data access
  - Privacy-conscious design patterns
  - Statistical dashboard examples

- **v1.0.0**: Initial implementation
  - Support for URL parameter, cookie storage
  - HOSxP API integration
  - React hooks and context provider
  - Read-only SQL query execution

---

## HOSxP Database Reference

> **Note**: This section documents key tables in HOSxP database commonly used for dashboard development.

### Core Tables

#### `patient` - Patient Registration
Primary table containing patient demographic data.

| Column | Type | Description |
|--------|------|-------------|
| `hos_guid` | varchar(38) | Primary key (GUID) |
| `hn` | varchar(9) | Hospital Number (unique) |
| `pname` | varchar(25) | Name prefix (Mr., Mrs., etc.) |
| `fname` | varchar(100) | First name |
| `lname` | varchar(100) | Last name |
| `sex` | char(1) | Gender (1=Male, 2=Female) |
| `birthday` | date | Date of birth |
| `bloodgrp` | varchar(20) | Blood group |
| `pttype` | char(2) | Patient type code |
| `nationality` | char(3) | Nationality code |
| `religion` | char(2) | Religion code |
| `occupation` | varchar(4) | Occupation code |
| `firstday` | date | First registration date |
| `last_visit` | date | Last visit date |
| `last_update` | datetime | Last record update |

#### `ovst` - Outpatient Visits
Records of outpatient visits (OPD).

| Column | Type | Description |
|--------|------|-------------|
| `hos_guid` | varchar(38) | Primary key (GUID) |
| `vn` | varchar | Visit Number (unique) |
| `hn` | varchar | Patient HN (FK to patient) |
| `vstdate` | date | Visit date |
| `vsttime` | time | Visit time |
| `doctor` | varchar | Doctor code (FK to doctor) |
| `spclty` | char | Specialty code |
| `cur_dep` | char | Current department code |
| `pttype` | char(2) | Patient type for this visit |
| `main_dep` | char | Main department code |
| `staff` | varchar | Staff who registered |

#### `kskdepartment` - Department Master
Department/clinic reference table.

| Column | Type | Description |
|--------|------|-------------|
| `depcode` | char | Department code (primary key) |
| `department` | varchar | Department name |
| `spclty` | char | Specialty code |
| `doctor_code` | varchar | Default doctor code |
| `hospital_department_id` | int | Hospital department ID |

#### `doctor` - Doctor Master
Doctor/physician reference table.

| Column | Type | Description |
|--------|------|-------------|
| `code` | varchar | Doctor code (primary key) |
| `name` | varchar | Full name |
| `shortname` | varchar | Short name/abbreviation |
| `licenseno` | varchar | Medical license number |
| `department` | varchar | Department name |
| `active` | char | Active status (Y/N) |

### Common Relationships

```
patient.hn ─────────────────┐
                            ↓
ovst.hn ←───────────────────┘
ovst.cur_dep ───────────────→ kskdepartment.depcode
ovst.doctor ────────────────→ doctor.code
```

### Example Join Queries

```sql
-- Visit with patient and department info
SELECT
    o.vn,
    o.vstdate,
    o.vsttime,
    p.hn,
    CONCAT(p.pname, p.fname, ' ', p.lname) as patient_name,
    k.department
FROM ovst o
LEFT JOIN patient p ON o.hn = p.hn
LEFT JOIN kskdepartment k ON o.cur_dep = k.depcode
WHERE o.vstdate = CURDATE()
LIMIT 100

-- Visit counts by department today
SELECT
    k.depcode,
    k.department,
    COUNT(*) as visit_count
FROM ovst o
LEFT JOIN kskdepartment k ON o.cur_dep = k.depcode
WHERE o.vstdate = CURDATE()
GROUP BY k.depcode, k.department
ORDER BY visit_count DESC

-- Doctor workload
SELECT
    d.code,
    d.name as doctor_name,
    COUNT(*) as patient_count
FROM ovst o
LEFT JOIN doctor d ON o.doctor = d.code
WHERE o.vstdate = CURDATE()
GROUP BY d.code, d.name
ORDER BY patient_count DESC
```

---

## Appendix: Recommended Queries for Dashboards

### Patient Statistics
```sql
-- Total registered patients
SELECT COUNT(*) as total FROM patient

-- Patients by age group
SELECT
  CASE
    WHEN TIMESTAMPDIFF(YEAR, birthday, CURDATE()) < 1 THEN 'Infant'
    WHEN TIMESTAMPDIFF(YEAR, birthday, CURDATE()) < 13 THEN 'Child'
    WHEN TIMESTAMPDIFF(YEAR, birthday, CURDATE()) < 20 THEN 'Teenager'
    WHEN TIMESTAMPDIFF(YEAR, birthday, CURDATE()) < 40 THEN 'Young Adult'
    WHEN TIMESTAMPDIFF(YEAR, birthday, CURDATE()) < 60 THEN 'Middle Age'
    ELSE 'Senior'
  END as age_group,
  COUNT(*) as count
FROM patient
WHERE birthday IS NOT NULL
GROUP BY age_group

-- Patients by blood type
SELECT bloodgrp, COUNT(*) as count
FROM patient
WHERE bloodgrp IS NOT NULL AND bloodgrp != ''
GROUP BY bloodgrp
```

### Visit Statistics
```sql
-- Daily visits for the past week (ovst = outpatient visits)
SELECT vstdate, COUNT(*) as visits
FROM ovst
WHERE vstdate >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
GROUP BY vstdate
ORDER BY vstdate

-- Peak hours analysis
SELECT
  HOUR(vsttime) as hour,
  COUNT(*) as visits
FROM ovst
WHERE vstdate = CURDATE()
GROUP BY HOUR(vsttime)
ORDER BY hour
```

### System Health
```sql
-- Database version
SELECT VERSION() as version

-- Table count
SELECT COUNT(*) as table_count
FROM information_schema.tables
WHERE table_schema = DATABASE()

-- Check table structure
DESCRIBE patient
```

---

> **Remember**: Keep the three BMS endpoints in their lanes — **`/api/sql`** for read-only queries, **`/api/rest`** for data modification (CRUD), **`/api/function`** for support utilities. The **[LLM Completions API](#llm-completions-api)** is a separate service at `ai-api.kube.bmscloud.in.th` for chat-style AI completions (uses the raw session id as Bearer, not the JWT). The **[Thai TTS API](#thai-tts-api)** at `vox-cpm.bmscloud.in.th` (speech synthesis) and the **[Thai ASR API](#thai-asr-api)** at `asr1.bmscloud.in.th` (speech transcription) are additional separate services and are **public** (no authentication). Writes on `/api/rest` require a marketplace token with the appropriate table grant — and that token is provided **only when the app is launched from the HOSxP dashboard URL or an approved addon integration**. In any other environment (local dev, direct browser, testing), the app runs in read-only mode and the server automatically encrypts/masks sensitive data. Design accordingly. For access to sensitive data or advanced write operations, consult your system administrator for proper authorization.
