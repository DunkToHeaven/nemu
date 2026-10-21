/** Tipe domain bersama klien + lapisan mock. Mengikuti PRD bagian 9 & 12. */

export type Role = "worker" | "supervisor" | "admin";

export const ROLE_RANK: Record<Role, number> = { worker: 1, supervisor: 2, admin: 3 };

export function hasRole(role: Role, required: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[required];
}

export type TxType =
  | "issue"
  | "return"
  | "receive"
  | "transfer"
  | "adjust"
  | "reversal"
  | "consume";

export type ScanMethod = "qr_camera" | "in_app_scanner" | "manual_code";

export type ConfidenceLevel = "high" | "medium" | "low" | "never";

export interface User {
  id: string;
  code: string;
  name: string;
  role: Role;
  email: string | null;
  active: boolean;
  /** Hanya ada di lapisan mock. Di backend nyata: argon2id. */
  pin?: string;
  password?: string;
  shiftEndsAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
}

export type LocationType = "warehouse" | "zone" | "rack" | "bin";

export interface Warehouse {
  id: string;
  code: string;
  name: string;
  timezone: string;
}

export interface Location {
  id: string;
  warehouseId: string;
  parentId: string | null;
  type: LocationType;
  code: string;
  name: string;
  /** "Gudang 1 › Zona B › Rak B-03" */
  path: string;
  active: boolean;
}

export interface Category {
  id: string;
  name: string;
  active: boolean;
}

export interface Unit {
  id: string;
  name: string;
  symbol: string;
  decimals: number;
}

export interface Item {
  id: string;
  sku: string;
  /** Kode QR Crockford base32, tidak pernah berubah (LB-05). */
  code: string;
  name: string;
  categoryId: string;
  unitId: string;
  minStock: number;
  unitValue: number | null;
  isBulk: boolean;
  primaryLocationId: string | null;
  active: boolean;
  photoUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Confidence {
  score: number;
  level: ConfidenceLevel;
  lastVerifiedAt: string | null;
  /** Komponen skor untuk tombol "Kenapa?" (CF-01). Opsional di respons ringkas. */
  breakdown?: ConfidenceBreakdown;
}

export interface ConfidenceBreakdown {
  base: number;
  agePenalty: number;
  movementPenalty: number;
  variancePenalty: number;
  reviewPenalty: number;
  daysSinceVerified: number | null;
  txSinceVerified: number;
  cappedNeverCounted: boolean;
}

export interface StockLevel {
  itemId: string;
  locationId: string;
  qty: number;
  version: number;
  updatedAt: string;
  lastVerifiedAt: string | null;
  lastVerifiedQty: number | null;
  txSinceVerified: number;
  lastVarianceRatio: number;
  confidence: Confidence;
}

export interface StockWithConfidence extends StockLevel {
  location: Location;
}

export interface Transaction {
  id: string;
  type: TxType;
  itemId: string;
  fromLocationId: string | null;
  toLocationId: string | null;
  qty: number;
  userId: string;
  reasonId: string | null;
  refNo: string | null;
  note: string | null;
  idempotencyKey: string;
  deviceId: string | null;
  scanMethod: ScanMethod | null;
  custodyId: string | null;
  equipmentId: string | null;
  outcome: "used" | "damaged_lost" | null;
  clientCreatedAt: string | null;
  createdAt: string;
  reversesId: string | null;
  reviewStatus: "ok" | "needs_review";
  /** Hanya di mock: untuk tampilan "oleh siapa" tanpa join. */
  userName?: string;
  itemName?: string;
  itemCode?: string;
}

export type CustodyStatus = "open" | "closed";

export interface CustodyEntry {
  id: string;
  issueTxId: string;
  userId: string;
  itemId: string;
  qtyTaken: number;
  qtyOpen: number;
  status: CustodyStatus;
  openedAt: string;
  closedAt: string | null;
  lastRemindedAt: string | null;
  equipmentId: string | null;
  refNo: string | null;
  fromLocationId: string;
  /** Usia entri dalam jam, dihitung lapisan mock. */
  ageHours?: number;
  overdue?: boolean;
  userName?: string;
  itemName?: string;
  itemCode?: string;
  itemUnit?: string;
}

export type VerificationResult = "match" | "mismatch" | "skipped" | "inconclusive";

export type VerificationMode = "confirm" | "blind";

export type VerificationSource = "pick_prompt" | "opname" | "manual";

export interface Verification {
  id: string;
  itemId: string;
  locationId: string;
  userId: string;
  source: VerificationSource;
  mode: VerificationMode;
  systemQty: number;
  stockVersion: number;
  countedQty: number | null;
  variance: number | null;
  result: VerificationResult;
  triggerTxId: string | null;
  promptProbability: number | null;
  createdAt: string;
  reviewStatus: "none" | "pending" | "approved" | "rejected";
  reviewNote: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  adjustTxId: string | null;
  userName?: string;
  itemName?: string;
  locationPath?: string;
}

export interface VerificationPrompt {
  promptId: string;
  locationId: string;
  /** null = mode buta (CV-07). */
  expectedQty: number | null;
  stockVersion: number;
  mode: VerificationMode;
  unitSymbol: string;
  itemName: string;
  locationPath: string;
}

export interface Reason {
  id: string;
  name: string;
  requiresWo: boolean;
  active: boolean;
}

export interface Equipment {
  id: string;
  code: string;
  name: string;
  locationId: string | null;
  active: boolean;
}

export interface AuditEntry {
  id: string;
  entity: string;
  entityId: string;
  action: "create" | "update" | "deactivate" | "delete" | "restore";
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  actorId: string;
  actorName: string;
  source: "dashboard" | "sheets_import" | "csv_import" | "system";
  createdAt: string;
}

export interface StockCountLine {
  id: string;
  itemId: string;
  locationId: string;
  systemQty: number;
  countedQty: number | null;
  variance: number | null;
  status: "pending" | "counted" | "approved" | "rejected";
  note: string | null;
  itemName?: string;
  itemCode?: string;
  locationPath?: string;
  unitSymbol?: string;
}

export interface StockCount {
  id: string;
  name: string;
  warehouseId: string;
  zoneId: string | null;
  blind: boolean;
  status: "open" | "review" | "closed";
  createdBy: string;
  createdAt: string;
  closedAt: string | null;
  lines: StockCountLine[];
  source: "manual" | "needs_count";
  createdByName?: string;
  locationPath?: string;
}

export interface ImportRow {
  row: number;
  status: "new" | "update" | "error";
  sku: string;
  name: string;
  message: string | null;
  data: Record<string, string>;
}

export interface ImportJob {
  id: string;
  entity: "items" | "locations" | "users" | "equipment";
  filename: string;
  status: "preview" | "applied" | "failed";
  createdAt: string;
  appliedAt: string | null;
  totalRows: number;
  newRows: number;
  updatedRows: number;
  errorRows: number;
  rows: ImportRow[];
}

export interface SyncRun {
  id: string;
  direction: "export" | "import";
  status: "ok" | "pending" | "failed";
  rows: number;
  startedAt: string;
  finishedAt: string | null;
  message: string | null;
}

export interface GoogleIntegration {
  connected: boolean;
  accountEmail: string | null;
  folderName: string | null;
  spreadsheetId: string | null;
  spreadsheetUrl: string | null;
  schemaVersion: string;
  appSchemaVersion: string;
  lastSyncAt: string | null;
  scopes: string[];
  protectedRanges: number;
  checkStatus: "ok" | "warning" | "error" | "unknown";
  checkMessage: string | null;
  runs: SyncRun[];
}

export interface OrgSettings {
  orgName: string;
  timezone: string;
  locale: "id" | "en";
  shiftEndsAt: string[];
  verifyPromptEnabled: boolean;
  verifyMaxPerShift: number;
  verifyCountThreshold: number;
  verifyPMin: number;
  verifyPMax: number;
  confidenceDecayDays: number;
  custodyEnabled: boolean;
  custodyOverdueHours: number;
  defaultMinStock: number;
  blindEveryN: number;
  notifications: { telegram: boolean; email: boolean };
  branding: { accent: string; logoText: string };
}

export interface SystemStatus {
  version: string;
  activeUsers: number;
  lastBackupAt: string | null;
  sheetsSync: "ok" | "pending" | "failed" | "disconnected";
  pendingOutbox: number;
  uptimeHours: number;
}

export interface DashboardKpis {
  totalItems: number;
  totalQty: number;
  belowMin: number;
  transactionsToday: number;
  needsReview: number;
  openCounts: number;
  highConfidencePct: number;
  overdueCustody: number;
  myCustodyCount: number;
  myTx7d: number;
  myPendingQueue: number;
}

export interface UsagePoint {
  date: string;
  qty: number;
  tx: number;
}

export interface RankedUsage {
  id: string;
  label: string;
  qty: number;
  tx: number;
  meta?: string;
}

export interface ReportBundle {
  rangeDays: number;
  trend: UsagePoint[];
  topItems: RankedUsage[];
  byUser: RankedUsage[];
  byReason: RankedUsage[];
  confidence: {
    high: number;
    medium: number;
    low: number;
    never: number;
    total: number;
    needsCount: {
      itemId: string;
      itemName: string;
      locationPath: string;
      score: number;
      qty: number;
    }[];
  };
  deadStock: {
    itemId: string;
    name: string;
    lastMovedAt: string | null;
    qty: number;
    daysIdle: number;
  }[];
  custody: {
    openEntries: number;
    avgHoldHours: number;
    returnRate: number;
    overdue: number;
    byEquipment: RankedUsage[];
  };
}

export interface LiveEvent {
  id: string;
  type:
    | "stock.changed"
    | "tx.created"
    | "alert.created"
    | "sync.status"
    | "verification.created"
    | "custody.changed";
  at: string;
  payload: Record<string, unknown>;
}

export interface SessionUser {
  id: string;
  code: string;
  name: string;
  role: Role;
  email: string | null;
  shiftEndsAt: string | null;
}

export interface ApiError {
  error: { code: string; message: string; details?: Record<string, unknown> };
}

export interface Page<T> {
  data: T[];
  nextCursor: string | null;
  total: number;
}
