export interface SimulationConfig {
  /** Latensi buatan untuk setiap request API (ms). */
  latencyMs: number;
  /** Paksa 409 stok kurang pada pengambilan berikutnya. */
  force409: boolean;
  /** Stok berubah sebelum jawaban verifikasi (memicu inconclusive). */
  raceOnVerify: boolean;
  /** Putuskan koneksi (SSE & semua request). */
  offline: boolean;
  /** Semua request mengembalikan 401 SESSION_EXPIRED. */
  expireSession: boolean;
  /** Paksa pertanyaan konfirmasi muncul. */
  forcePrompt: boolean;
  /** Paksa mode buta. */
  forceBlind: boolean;
  /** Paksa error 500 pada request berikutnya. */
  forceError: boolean;
}

export const DEFAULT_SIMULATION: SimulationConfig = {
  latencyMs: 120,
  force409: false,
  raceOnVerify: false,
  offline: false,
  expireSession: false,
  forcePrompt: false,
  forceBlind: false,
  forceError: false,
};

export function mergeSimulation(
  current: SimulationConfig,
  patch: Partial<SimulationConfig>,
): SimulationConfig {
  return { ...current, ...patch };
}
