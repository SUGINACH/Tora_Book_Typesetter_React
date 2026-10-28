import type { Settings } from './main-settings';
import type { RenderedPage, AuditFinding, TraceEvent, PageGeometry, ColumnGeometry } from './layout';

// === Worker Protocol ===

export type WorkerRequest =
  | TypesetRequest
  | CancelRequest
  | GetHtmlRequest
  | DiagnoseRequest
  | FontCheckRequest;

export interface TypesetRequest {
  type: 'typeset';
  jobId: string;
  text: string;
  settings: Settings;
  enableTrace?: boolean;
}

export interface CancelRequest {
  type: 'cancel';
  jobId: string;
}

export interface GetHtmlRequest {
  type: 'getHTML';
  jobId: string;
}

export interface DiagnoseRequest {
  type: 'diagnose';
  jobId: string;
}

export interface FontCheckRequest {
  type: 'font-check';
  fonts: readonly string[];
}

export type WorkerResponse =
  | ProgressUpdate
  | TypesetComplete
  | TypesetError
  | HtmlResponse
  | DiagnoseResponse
  | FontCheckResponse
  | CancelledResponse;

export interface ProgressUpdate {
  type: 'progress';
  jobId: string;
  stage: TypesetStage;
  percent: number;
  message?: string;
}

export type TypesetStage =
  | 'parsing'
  | 'font-loading'
  | 'measuring'
  | 'line-breaking'
  | 'column-balancing'
  | 'page-breaking'
  | 'footnote-placement'
  | 'ornament-placement'
  | 'finalizing';

export interface TypesetComplete {
  type: 'done';
  jobId: string;
  pages: RenderedPage[];
  pageCount: number;
  outputHash: string;
  findings: AuditFinding[];
  traceLog?: TraceEvent[];
  durationMs: number;
}

export interface TypesetError {
  type: 'error';
  jobId: string;
  message: string;
  stack?: string;
}

export interface HtmlResponse {
  type: 'html';
  jobId: string;
  html: string;
}

export interface DiagnoseResponse {
  type: 'diagnose';
  jobId: string;
  inputs: unknown;
  findings: AuditFinding[];
  traceLog: TraceEvent[];
}

export interface FontCheckResponse {
  type: 'font-check';
  available: string[];
  missing: string[];
}

export interface CancelledResponse {
  type: 'cancelled';
  jobId: string;
}

// Re-export types from other files
export type { Settings, RenderedPage, AuditFinding, TraceEvent, PageGeometry, ColumnGeometry };
