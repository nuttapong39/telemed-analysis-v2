// =============================================================================
// BMS Session KPI Dashboard - Type Definitions (T018)
// =============================================================================

// ---------------------------------------------------------------------------
// Enums / Union Types
// ---------------------------------------------------------------------------

/** Supported database backends */
export type DatabaseType = 'mysql' | 'postgresql';

/** WebSocket / polling connection lifecycle */
export type SessionState = 'idle' | 'disconnected' | 'connecting' | 'connected' | 'expired';

/** Async data-fetch lifecycle */
export type QueryState = 'idle' | 'loading' | 'success' | 'error';

// ---------------------------------------------------------------------------
// Core domain models
// ---------------------------------------------------------------------------

export interface SystemInfo {
  version: string;
  environment: string;
}

export interface UserInfo {
  name: string;
  position: string;
  positionId: number;
  hospitalCode: string;
  doctorCode: string;
  department: string;
  location: string;
  isHrAdmin: boolean;
  isDirector: boolean;
}

export interface ConnectionConfig {
  apiUrl: string;
  bearerToken: string;
  databaseType: DatabaseType;
  appIdentifier: string;
}

// ---------------------------------------------------------------------------
// Raw API response shapes
// ---------------------------------------------------------------------------

/** Shape returned by the BMS session endpoint (PasteJSON) */
export interface BmsSessionResponse {
  MessageCode: number;
  Message: string;
  RequestTime: string;
  result?: {
    system_info?: {
      version?: string;
      environment?: string;
    };
    user_info?: {
      name?: string;
      position?: string;
      position_id?: number;
      hospital_code?: string;
      doctor_code?: string;
      department?: string;
      location?: string;
      is_hr_admin?: boolean;
      is_director?: boolean;
      bms_url?: string;
      bms_session_port?: number;
      bms_session_code?: string;
      bms_database_name?: string;
      bms_database_type?: string;
    };
    key_value?: string;
    expired_second?: number;
  };
}

/** Shape returned by the SQL query API */
export interface SqlApiResponse {
  result: Record<string, unknown>;
  MessageCode: number;
  Message: string;
  RequestTime: string;
  data?: Record<string, unknown>[];
  field?: number[];
  field_name?: string[];
  record_count?: number;
}

/** Allowed value types for parameter binding on /api/sql */
export type SqlParamValueType =
  | 'string'
  | 'integer'
  | 'float'
  | 'date'
  | 'time'
  | 'datetime'
  | 'text'; // compatibility alias for `string`

/** A single bound parameter sent in the `params` map */
export interface SqlParam {
  value: string | number;
  value_type: SqlParamValueType;
}

/** Map of named parameters keyed by placeholder name (without the leading colon) */
export type SqlParams = Record<string, SqlParam>;

/** Shape sent to the SQL query API */
export interface SqlApiRequest {
  sql: string;
  app: string;
  params?: SqlParams;
  'marketplace-token'?: string;
}

/**
 * Shape returned by the BMS `/api/function?name=...` endpoint.
 *
 * Most functions put their return value in `Value`, but some use top-level
 * fields instead (e.g. `get_cds_xml` returns the payload as `xmldata`). Keep
 * well-known fields typed explicitly; unknown extras go through the index
 * signature.
 */
export interface BmsFunctionResponse {
  MessageCode: number;
  Message: string;
  RequestTime?: string;
  /** Generic return slot used by `get_hosvariable`, `get_serialnumber`, ... */
  Value?: unknown;
  /** XML payload returned by `get_cds_xml` */
  xmldata?: string;
  [extra: string]: unknown;
}

/**
 * Shape returned by `/api/rest` write operations (POST/PUT/DELETE).
 * Count fields are optional because the server only fills the one matching
 * the operation (`insert_count` for POST, `update_count` for PUT, etc.).
 */
export interface RestApiResponse {
  MessageCode: number;
  Message: string;
  RequestTime?: string;
  insert_count?: number;
  update_count?: number;
  delete_count?: number;
  data?: Record<string, unknown>[];
  [extra: string]: unknown;
}

// ---------------------------------------------------------------------------
// LLM Completions API (external — ai-api.kube.bmscloud.in.th)
// ---------------------------------------------------------------------------

/** One message in an OpenAI-style chat completion exchange. */
export interface LlmChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Optional tuning parameters for a chat completion call. */
export interface LlmChatOptions {
  /** Model id (e.g. `deepseek`, `kimi`, `gemma4`). Unknown ids fall back to `deepseek`. */
  model?: string;
  /** Sampling temperature (0.0 – 2.0). */
  temperature?: number;
  /** Nucleus sampling threshold (0.0 – 1.0). */
  top_p?: number;
  /** Max tokens the server may generate (default 8192). */
  max_tokens?: number;
  /** AbortSignal to cancel an in-flight request. */
  signal?: AbortSignal;
}

/** Token-usage block returned on non-streaming completions. */
export interface LlmUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

/** Normalised result returned by `callLlm` / `streamLlm`. */
export interface LlmChatResponse {
  /** Server-assigned completion id. */
  id: string;
  /** Model id reported by the server (may differ from the requested id
   *  when the server falls back to a default). */
  model: string;
  /** Full assistant-reply text (joined across streamed deltas). */
  content: string;
  /** Why the server stopped generating (`stop`, `length`, etc.). Null for
   *  interrupted streams. */
  finishReason: string | null;
  /** Token accounting — only present on non-streaming responses. */
  usage?: LlmUsage;
}

/** A model entry from `/v1/models`. */
export interface LlmModel {
  id: string;
  object: 'model';
  owned_by?: string;
}

// ---------------------------------------------------------------------------
// TTS API (external — vox-cpm.bmscloud.in.th)
// ---------------------------------------------------------------------------

/** Voice preset id accepted by `/v1/audio/speech`. */
export type TtsVoice = 'default' | 'female' | 'male' | (string & {});

/** Audio container format supported by the TTS server. */
export type TtsResponseFormat = 'wav' | 'mp3';

/** Optional tuning parameters for a synthesis call. */
export interface TtsSynthesisOptions {
  /** Model id (default: `voxcpm-thai`). */
  model?: string;
  /** Voice preset — `default` uses the model's native voice (no cloning). */
  voice?: TtsVoice;
  /** Audio container format (default `wav`). */
  response_format?: TtsResponseFormat;
  /** Abort signal to cancel an in-flight request. */
  signal?: AbortSignal;
}

/** Voice entry from `/v1/voices`. */
export interface TtsVoiceInfo {
  id: string;
  name: string;
}

/** Model entry from the TTS server's `/v1/models`. */
export interface TtsModelInfo {
  id: string;
  object: 'model';
  owned_by?: string;
}

/** Result of `synthesizeSpeech` — the audio payload plus metadata. */
export interface TtsSynthesisResult {
  /** Binary audio, ready to be wrapped in a Blob URL or decoded. */
  blob: Blob;
  /** MIME type returned by the server (`audio/wav` or `audio/mpeg`). */
  contentType: string;
  /** Which format the server reports — matches the requested `response_format`. */
  format: TtsResponseFormat;
}

/** Result of `/v1/text/normalize`. */
export interface TtsNormalizeResult {
  original: string;
  normalized: string;
}

/** Result of `/health`. */
export interface TtsHealthStatus {
  status: string;
  model: string;
  sample_rate: number;
}

// ---------------------------------------------------------------------------
// ASR API (external — asr1.bmscloud.in.th, Typhoon ASR backend)
// ---------------------------------------------------------------------------

/** Output envelope returned by the OpenAI-compatible `/v1/audio/transcriptions`. */
export type AsrResponseFormat = 'json' | 'verbose_json' | 'text' | 'srt' | 'vtt';

/** One timestamped segment of a verbose transcription. */
export interface AsrSegment {
  id?: number;
  start: number;
  end: number;
  text: string;
  /** Per-word timestamps, present when `timestamp_granularities` includes `word`. */
  words?: AsrWord[];
  [extra: string]: unknown;
}

/** One timestamped word inside a segment. */
export interface AsrWord {
  word: string;
  start: number;
  end: number;
  [extra: string]: unknown;
}

/** Optional tuning parameters for a transcription call. */
export interface AsrTranscriptionOptions {
  /** Model id (default: `typhoon-asr-realtime`). */
  model?: string;
  /** BCP-47 language code; default `th`. Pass `null`/empty for auto-detect if the server supports it. */
  language?: string;
  /** Context prompt that biases the transcription (e.g. medical vocabulary, proper nouns). */
  prompt?: string;
  /** Envelope format (default `json` → `{ text }`; `verbose_json` → `{ text, segments, … }`). */
  response_format?: AsrResponseFormat;
  /** Sampling temperature — higher = more variation. Default `0.0`. */
  temperature?: number;
  /** Comma-separated list of `"word"` and/or `"segment"`. */
  timestamp_granularities?: string;
  /** Caller-supplied file name used in the multipart boundary (default inferred from File.name or 'audio.webm'). */
  filename?: string;
  /** Abort signal to cancel the in-flight request. */
  signal?: AbortSignal;
}

/** Normalised result returned by `transcribeAudio`. */
export interface AsrTranscriptionResult {
  /** Full transcription text. */
  text: string;
  /** Segment-level timestamps (present when `response_format: 'verbose_json'` or using `/transcribe-with-timestamps`). */
  segments?: AsrSegment[];
  /** Detected / used language code. */
  language?: string;
  /** Audio duration in seconds, when reported by the server. */
  duration?: number;
  /** Raw JSON body returned by the server, for advanced consumers that need fields not in this shape. */
  raw: Record<string, unknown>;
}

/** Options for the lower-level Typhoon-specific endpoints. */
export interface TyphoonTranscribeOptions {
  /** Device to run inference on (`auto`, `cpu`, `cuda`, …). Default `auto`. */
  device?: string;
  /** Include per-segment timestamps (uses `/transcribe-with-timestamps` when true, `/transcribe` otherwise). */
  withTimestamps?: boolean;
  /** Caller-supplied file name for the multipart part. */
  filename?: string;
  /** AbortSignal to cancel the request. */
  signal?: AbortSignal;
}

/** Result of `/health` on the ASR server. */
export interface AsrHealthStatus {
  status?: string;
  [extra: string]: unknown;
}

// ---------------------------------------------------------------------------
// Parsed / normalised models
// ---------------------------------------------------------------------------

/** Generic wrapper for parsed query results */
export interface QueryResult<T> {
  data: T[];
  fieldNames: string[];
  fieldTypes: number[];
  recordCount: number;
  messageCode: number;
  message: string;
  requestTime: string;
}

/** Authenticated session after successful handshake */
export interface Session {
  sessionId: string;
  apiUrl: string;
  bearerToken: string;
  databaseType: DatabaseType;
  databaseName: string;
  expirySeconds: number;
  connectedAt: Date;
  userInfo: UserInfo;
  systemInfo: SystemInfo;
  isLocalApi: boolean;
}

// ---------------------------------------------------------------------------
// KPI / Dashboard data models
// ---------------------------------------------------------------------------

export interface KpiSummary {
  opdVisitCount: number;
  ipdPatientCount: number;
  erVisitCount: number;
  activeDepartmentCount: number;
  timestamp: Date;
}

export interface DepartmentWorkload {
  departmentCode: string;
  departmentName: string;
  visitCount: number;
}

export interface DoctorWorkload {
  doctorCode: string;
  doctorName: string;
  patientCount: number;
}

export interface VisitTrend {
  date: string;
  visitCount: number;
}

export interface HourlyDistribution {
  hour: number;
  visitCount: number;
}

export interface DemographicBreakdown {
  ageGroups: { group: string; count: number }[];
  genderDistribution: { gender: string; count: number }[];
  dataSource: 'patient' | 'ovst_patient_record';
}

export interface PatientTypeDistribution {
  pttypeCode: string;
  pttypeName: string;
  visitCount: number;
}

/** Recent visit record for the overview dashboard */
export interface RecentVisit {
  vn: string
  hn: string
  vstdate: string
  vsttime: string
  departmentName: string
  doctorName: string
}

/** Overview statistics beyond the 4 main KPIs */
export interface OverviewStats {
  totalRegisteredPatients: number
  totalVisitsThisMonth: number
  totalVisitsLastMonth: number
  avgDailyVisitsThisMonth: number
  totalDoctors: number
  totalDepartments: number
}

// ---------------------------------------------------------------------------
// MOPH Promt notification API (external — morpromt2c.moph.go.th)
// ---------------------------------------------------------------------------

/**
 * A LINE Flex Message payload as accepted by the MOPH Promt `send-now` and
 * bulk `send-message` endpoints. `contents` is a bubble/carousel object whose
 * shape is defined by the LINE Messaging API — we keep it permissive so the
 * caller can pass any valid bubble structure verbatim.
 */
export interface MophFlexMessage {
  type: 'flex';
  altText: string;
  contents: Record<string, unknown>;
}

/** Input to `buildMophFlexBubble` — matches the shape in the spec §5. */
export interface MophFlexBubbleInput {
  /** Header title (white text on the header band). */
  title: string;
  /** Optional sub-header line rendered with the optional icon. */
  subHeader?: string;
  /** Body text paragraph. */
  text: string;
  /** URL the footer CTA button opens. */
  confirmUrl: string;
  /** Optional icon rendered next to the sub-header (external URL). */
  iconUrl?: string;
  /** Header band colour. Defaults to `#1E88E5` per spec. */
  headerColor?: string;
  /** Body band colour. Defaults to `#F5F5F5` per spec. */
  bodyColor?: string;
  /** Footer CTA label. Defaults to `ยืนยัน`. */
  confirmLabel?: string;
  /** Optional override for `altText` — defaults to `title`. */
  altText?: string;
}

/** Response shape from the bulk-upload step. */
export interface MophUploadResponse {
  file_id: string;
  [extra: string]: unknown;
}

/**
 * Normalised result from a MOPH send call. Spec §2 defines success as
 * `status === 200 && body.toLowerCase().includes('success')`; we surface both
 * so callers can inspect either dimension.
 */
export interface MophSendResult {
  success: boolean;
  status: number;
  /** Raw response body as received (the Promt API returns plain JSON/text). */
  body: string;
  /** Parsed body when it was valid JSON; undefined otherwise. */
  parsed?: unknown;
}
