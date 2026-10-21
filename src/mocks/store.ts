import { computeConfidence } from "@/lib/domain/confidence";
import type { LiveEvent, Role, StockLevel, User } from "@/lib/types";
import { buildSeed, type MockDatabase, type PromptRecord } from "@/mocks/seed";
import { DEFAULT_SIMULATION, type SimulationConfig } from "@/mocks/simulation";

export interface SessionRecord {
  token: string;
  userId: string;
  role: Role;
  issuedAt: number;
  expiresAt: number;
}

interface Store {
  db: MockDatabase;
  sessions: Map<string, SessionRecord>;
  simulation: SimulationConfig;
  events: LiveEvent[];
  subscribers: Set<(event: LiveEvent) => void>;
  attempts: Map<string, { count: number; lockedUntil: number | null }>;
  promptCounter: number;
}

const globalRef = globalThis as unknown as { __nemuStore?: Store };

function createStore(): Store {
  return {
    db: buildSeed(),
    sessions: new Map(),
    simulation: { ...DEFAULT_SIMULATION },
    events: [],
    subscribers: new Set(),
    attempts: new Map(),
    promptCounter: 0,
  };
}

export function store(): Store {
  if (!globalRef.__nemuStore) globalRef.__nemuStore = createStore();
  return globalRef.__nemuStore;
}

export function resetStore(): void {
  const current = store();
  globalRef.__nemuStore = { ...createStore(), simulation: { ...current.simulation } };
}

export function data(): MockDatabase {
  return store().db;
}

export function sim(): SimulationConfig {
  return store().simulation;
}

export function updateSimulation(patch: Partial<SimulationConfig>): SimulationConfig {
  store().simulation = { ...store().simulation, ...patch };
  return store().simulation;
}

/* ------------------------------- sesi ------------------------------------ */

const SESSION_TTL = 8 * 3_600_000;

export function createSession(user: User): SessionRecord {
  const token = `nemu_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  const record: SessionRecord = {
    token,
    userId: user.id,
    role: user.role,
    issuedAt: Date.now(),
    expiresAt: Date.now() + SESSION_TTL,
  };
  store().sessions.set(token, record);
  return record;
}

export function sessionFromToken(token: string | undefined): SessionRecord | null {
  if (!token) return null;
  const record = store().sessions.get(token);
  if (!record) return null;
  if (record.expiresAt < Date.now()) {
    store().sessions.delete(token);
    return null;
  }
  return record;
}

export function sessionUser(record: SessionRecord): User | null {
  return data().users.find((user) => user.id === record.userId) ?? null;
}

export function revokeSession(token: string | undefined): void {
  if (token) store().sessions.delete(token);
}

export function expireAllSessions(): void {
  store().sessions.clear();
}

/* -------------------------------- event bus ------------------------------ */

let eventSeq = 0;

export function emit(type: LiveEvent["type"], payload: Record<string, unknown>): LiveEvent {
  eventSeq += 1;
  const event: LiveEvent = {
    id: `${Date.now()}-${eventSeq}`,
    type,
    at: new Date().toISOString(),
    payload,
  };
  const state = store();
  state.events = [event, ...state.events].slice(0, 300);
  for (const listener of state.subscribers) {
    try {
      listener(event);
    } catch {
      state.subscribers.delete(listener);
    }
  }
  return event;
}

export function subscribe(listener: (event: LiveEvent) => void): () => void {
  const state = store();
  state.subscribers.add(listener);
  return () => {
    state.subscribers.delete(listener);
  };
}

export function recentEvents(limit = 50): LiveEvent[] {
  return store().events.slice(0, limit);
}

/* -------------------------------- pertanyaan ----------------------------- */

export function savePrompt(prompt: PromptRecord): void {
  data().prompts[prompt.id] = prompt;
}

export function nextPromptId(): string {
  const state = store();
  state.promptCounter += 1;
  return `prm_${state.promptCounter}_${Math.random().toString(36).slice(2, 7)}`;
}

export function shiftKey(userId: string, now = new Date()): string {
  return `${now.toISOString().slice(0, 10)}:${userId}`;
}

export function promptsUsedThisShift(userId: string): number {
  return data().promptUsage[shiftKey(userId)] ?? 0;
}

export function bumpPromptsUsed(userId: string): void {
  const key = shiftKey(userId);
  data().promptUsage[key] = (data().promptUsage[key] ?? 0) + 1;
}

export function consecutiveMatches(userId: string): number {
  return data().consecutiveMatches[userId] ?? 0;
}

export function setConsecutiveMatches(userId: string, value: number): void {
  data().consecutiveMatches[userId] = value;
}

/* -------------------------------- keyakinan ------------------------------ */

export function refreshConfidence(itemId: string, locationId: string): void {
  const level = data().stock.find(
    (entry) => entry.itemId === itemId && entry.locationId === locationId,
  );
  if (!level) return;
  const pendingMismatch = data().verifications.some(
    (verification) =>
      verification.itemId === itemId &&
      verification.locationId === locationId &&
      verification.result === "mismatch" &&
      verification.reviewStatus === "pending",
  );
  const settings = data().settings;
  const result = computeConfidence(
    {
      lastVerifiedAt: level.lastVerifiedAt,
      txSinceVerified: level.txSinceVerified,
      lastVarianceRatio: level.lastVarianceRatio,
      needsReview: pendingMismatch,
    },
    {
      decayDays: settings.confidenceDecayDays,
      ageWeight: 40,
      movementWeight: 2,
      varianceWeight: 100,
      reviewPenalty: 10,
      neverCountedCap: 30,
      highThreshold: 80,
      mediumThreshold: 50,
    },
  );
  level.confidence = result;
}

export function ensureStockLevel(itemId: string, locationId: string): StockLevel {
  const existing = data().stock.find(
    (entry) => entry.itemId === itemId && entry.locationId === locationId,
  );
  if (existing) return existing;
  const created: StockLevel = {
    itemId,
    locationId,
    qty: 0,
    version: 0,
    updatedAt: new Date().toISOString(),
    lastVerifiedAt: null,
    lastVerifiedQty: null,
    txSinceVerified: 0,
    lastVarianceRatio: 0,
    confidence: computeConfidence({
      lastVerifiedAt: null,
      txSinceVerified: 0,
      lastVarianceRatio: 0,
      needsReview: false,
    }),
  };
  data().stock.push(created);
  return created;
}

/* --------------------------------- audit --------------------------------- */

export function addAudit(entry: {
  entity: string;
  entityId: string;
  action: "create" | "update" | "deactivate" | "delete" | "restore";
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  actorId: string;
  source?: "dashboard" | "sheets_import" | "csv_import" | "system";
}): void {
  const actor = data().users.find((user) => user.id === entry.actorId);
  data().audit.unshift({
    id: `aud_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    entity: entry.entity,
    entityId: entry.entityId,
    action: entry.action,
    before: entry.before,
    after: entry.after,
    actorId: entry.actorId,
    actorName: actor?.name ?? "Sistem",
    source: entry.source ?? "dashboard",
    createdAt: new Date().toISOString(),
  });
}
