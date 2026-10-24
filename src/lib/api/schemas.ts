import { z } from "zod";

export const roleSchema = z.enum(["worker", "supervisor", "admin"]);
export const confidenceLevelSchema = z.enum(["high", "medium", "low", "never"]);
export const txTypeSchema = z.enum([
  "issue",
  "return",
  "receive",
  "transfer",
  "adjust",
  "reversal",
  "consume",
]);
export const scanMethodSchema = z.enum(["qr_camera", "in_app_scanner", "manual_code"]);

export const confidenceSchema = z.object({
  score: z.number().min(0).max(100),
  level: confidenceLevelSchema,
  lastVerifiedAt: z.string().nullable(),
  breakdown: z
    .object({
      base: z.number(),
      agePenalty: z.number(),
      movementPenalty: z.number(),
      variancePenalty: z.number(),
      reviewPenalty: z.number(),
      daysSinceVerified: z.number().nullable(),
      txSinceVerified: z.number(),
      cappedNeverCounted: z.boolean(),
    })
    .optional(),
});

export const locationSchema = z.object({
  id: z.string(),
  warehouseId: z.string(),
  parentId: z.string().nullable(),
  type: z.enum(["warehouse", "zone", "rack", "bin"]),
  code: z.string(),
  name: z.string(),
  path: z.string(),
  active: z.boolean(),
});

export const stockLevelSchema = z.object({
  itemId: z.string(),
  locationId: z.string(),
  qty: z.number(),
  version: z.number(),
  updatedAt: z.string(),
  lastVerifiedAt: z.string().nullable(),
  lastVerifiedQty: z.number().nullable(),
  txSinceVerified: z.number(),
  lastVarianceRatio: z.number(),
  confidence: confidenceSchema,
});

export const stockWithLocationSchema = stockLevelSchema.extend({ location: locationSchema });

export const itemSchema = z.object({
  id: z.string(),
  sku: z.string(),
  code: z.string(),
  name: z.string(),
  categoryId: z.string(),
  unitId: z.string(),
  minStock: z.number(),
  /** Batas atas stok wajar; null bila tidak dibatasi. */
  maxStock: z.number().nullable(),
  unitValue: z.number().nullable(),
  isBulk: z.boolean(),
  primaryLocationId: z.string().nullable(),
  active: z.boolean(),
  photoUrl: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const unitSchema = z.object({
  id: z.string(),
  name: z.string(),
  symbol: z.string(),
  decimals: z.number(),
});

export const categorySchema = z.object({ id: z.string(), name: z.string(), active: z.boolean() });

export const userSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  role: roleSchema,
  email: z.string().nullable(),
  active: z.boolean(),
  shiftEndsAt: z.string().nullable(),
  lastLoginAt: z.string().nullable(),
  createdAt: z.string(),
});

export const sessionUserSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  role: roleSchema,
  email: z.string().nullable(),
  shiftEndsAt: z.string().nullable(),
});

export const transactionSchema = z.object({
  id: z.string(),
  type: txTypeSchema,
  itemId: z.string(),
  fromLocationId: z.string().nullable(),
  toLocationId: z.string().nullable(),
  qty: z.number(),
  userId: z.string(),
  reasonId: z.string().nullable(),
  refNo: z.string().nullable(),
  note: z.string().nullable(),
  idempotencyKey: z.string(),
  deviceId: z.string().nullable(),
  scanMethod: scanMethodSchema.nullable(),
  custodyId: z.string().nullable(),
  equipmentId: z.string().nullable(),
  outcome: z.enum(["used", "damaged_lost"]).nullable(),
  clientCreatedAt: z.string().nullable(),
  createdAt: z.string(),
  reversesId: z.string().nullable(),
  reviewStatus: z.enum(["ok", "needs_review"]),
  userName: z.string().optional(),
  itemName: z.string().optional(),
  itemCode: z.string().optional(),
});

export const verificationPromptSchema = z.object({
  promptId: z.string(),
  locationId: z.string(),
  expectedQty: z.number().nullable(),
  stockVersion: z.number(),
  mode: z.enum(["confirm", "blind"]),
  unitSymbol: z.string(),
  itemName: z.string(),
  locationPath: z.string(),
});

export const verificationSchema = z.object({
  id: z.string(),
  itemId: z.string(),
  locationId: z.string(),
  userId: z.string(),
  source: z.enum(["pick_prompt", "opname", "manual"]),
  mode: z.enum(["confirm", "blind"]),
  systemQty: z.number(),
  stockVersion: z.number(),
  countedQty: z.number().nullable(),
  variance: z.number().nullable(),
  result: z.enum(["match", "mismatch", "skipped", "inconclusive"]),
  triggerTxId: z.string().nullable(),
  promptProbability: z.number().nullable(),
  createdAt: z.string(),
  reviewStatus: z.enum(["none", "pending", "approved", "rejected"]),
  reviewNote: z.string().nullable(),
  reviewedBy: z.string().nullable(),
  reviewedAt: z.string().nullable(),
  adjustTxId: z.string().nullable(),
  userName: z.string().optional(),
  itemName: z.string().optional(),
  locationPath: z.string().optional(),
});

export const custodyEntrySchema = z.object({
  id: z.string(),
  issueTxId: z.string(),
  userId: z.string(),
  itemId: z.string(),
  qtyTaken: z.number(),
  qtyOpen: z.number(),
  status: z.enum(["open", "closed"]),
  openedAt: z.string(),
  closedAt: z.string().nullable(),
  lastRemindedAt: z.string().nullable(),
  equipmentId: z.string().nullable(),
  refNo: z.string().nullable(),
  fromLocationId: z.string(),
  ageHours: z.number().optional(),
  overdue: z.boolean().optional(),
  userName: z.string().optional(),
  itemName: z.string().optional(),
  itemCode: z.string().optional(),
  itemUnit: z.string().optional(),
});

export const itemDetailSchema = z.object({
  item: itemSchema,
  stock: z.array(stockWithLocationSchema),
  totalQty: z.number(),
  takenByOthers: z.number(),
  category: categorySchema.nullable(),
  unit: unitSchema.nullable(),
  primaryLocation: locationSchema.nullable(),
});

export const searchResultSchema = z.object({
  item: itemSchema,
  unit: unitSchema.nullable(),
  stock: z.array(stockWithLocationSchema),
  totalQty: z.number(),
  confidence: confidenceSchema,
  primaryLocation: locationSchema.nullable(),
});

export const searchResponseSchema = z.object({
  data: z.array(searchResultSchema),
  nextCursor: z.string().nullable(),
  total: z.number(),
  tookMs: z.number(),
});

/* --------------------------- mutasi: transaksi --------------------------- */

export const createTransactionSchema = z.object({
  itemCode: z.string().min(3).max(32),
  locationId: z.string().min(1),
  type: z.enum(["issue", "return", "receive", "transfer"]),
  qty: z.number().positive().max(100_000),
  reasonId: z.string().nullable().optional(),
  refNo: z.string().max(64).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
  idempotencyKey: z.string().min(8).max(80),
  scanMethod: scanMethodSchema,
  toLocationId: z.string().nullable().optional(),
  equipmentId: z.string().nullable().optional(),
});

export const createTransactionResponseSchema = z.object({
  transaction: transactionSchema,
  duplicate: z.boolean(),
  stock: stockWithLocationSchema,
  custody: custodyEntrySchema.nullable(),
  verificationPrompt: verificationPromptSchema.nullable(),
  message: z.string(),
});

export const reverseResponseSchema = z.object({
  transaction: transactionSchema,
  reversal: transactionSchema,
  stock: stockWithLocationSchema,
});

export const verificationSubmitSchema = z.object({
  promptId: z.string().min(1),
  result: z.enum(["match", "mismatch", "skipped"]),
  countedQty: z.number().min(0).max(1_000_000).nullable().optional(),
  stockVersion: z.number(),
  idempotencyKey: z.string().min(8).max(80),
});

export const verificationSubmitResponseSchema = z.object({
  status: z.enum(["recorded", "inconclusive"]),
  verification: verificationSchema,
  confidence: confidenceSchema,
});

export const custodySettleSchema = z.object({
  outcome: z.enum(["used", "returned", "damaged_lost"]),
  qty: z.number().positive(),
  equipmentId: z.string().nullable().optional(),
  equipmentText: z.string().max(80).nullable().optional(),
  refNo: z.string().max(64).nullable().optional(),
  toLocationId: z.string().nullable().optional(),
  idempotencyKey: z.string().min(8).max(80),
  scanMethod: scanMethodSchema.optional(),
});

export const itemWriteSchema = z.object({
  name: z.string().min(2).max(160),
  sku: z.string().min(2).max(40),
  categoryId: z.string().min(1),
  unitId: z.string().min(1),
  minStock: z.number().min(0).max(1_000_000),
  /**
   * Batas atas stok wajar. Opsional dan boleh null: banyak item memang tidak
   * punya plafon. Dipakai laporan untuk menandai kelebihan stok.
   */
  maxStock: z.number().min(0).max(1_000_000).nullable().optional(),
  // Opsional: form buat item tidak menanyakan harga satuan. Sebelumnya field ini
  // wajib sehingga setiap pembuatan item gagal 400 "Data tidak valid" — tombol
  // Simpan tampak tidak bereaksi.
  unitValue: z.number().min(0).max(1_000_000_000).nullable().optional(),
  isBulk: z.boolean().optional(),
  active: z.boolean().optional(),
  primaryLocationId: z.string().nullable().optional(),
});

export const locationWriteSchema = z.object({
  name: z.string().min(1).max(80),
  code: z.string().min(1).max(24),
  parentId: z.string().nullable(),
  type: z.enum(["warehouse", "zone", "rack", "bin"]),
  active: z.boolean(),
});

export const reasonWriteSchema = z.object({
  name: z.string().min(2).max(80),
  requiresWo: z.boolean(),
  active: z.boolean(),
});

export const loginSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("pin"),
    code: z.string().min(2).max(24),
    pin: z.string().min(4).max(6).regex(/^\d+$/, "PIN harus angka"),
  }),
  z.object({
    mode: z.literal("email"),
    email: z.string().email(),
    password: z.string().min(1).max(128),
  }),
]);

export const loginResponseSchema = z.object({
  user: sessionUserSchema,
  redirectTo: z.string(),
});

export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;
export type VerificationSubmitInput = z.infer<typeof verificationSubmitSchema>;
export type CustodySettleInput = z.infer<typeof custodySettleSchema>;
export type ItemWriteInput = z.infer<typeof itemWriteSchema>;
export type LocationWriteInput = z.infer<typeof locationWriteSchema>;
export type ReasonWriteInput = z.infer<typeof reasonWriteSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
