import { computeConfidence } from "@/lib/domain/confidence";
import type {
  AuditEntry,
  Category,
  CustodyEntry,
  Equipment,
  GoogleIntegration,
  ImportJob,
  Item,
  Location,
  OrgSettings,
  Reason,
  StockCount,
  StockCountLine,
  StockLevel,
  Transaction,
  Unit,
  User,
  Verification,
  Warehouse,
} from "@/lib/types";
import { createRng, crockfordCode } from "@/mocks/random";

export interface PromptRecord {
  id: string;
  userId: string;
  itemId: string;
  locationId: string;
  systemQty: number;
  stockVersion: number;
  mode: "confirm" | "blind";
  probability: number;
  createdAt: string;
  answered: boolean;
}

export interface MockDatabase {
  warehouses: Warehouse[];
  locations: Location[];
  categories: Category[];
  units: Unit[];
  items: Item[];
  users: User[];
  reasons: Reason[];
  equipment: Equipment[];
  stock: StockLevel[];
  transactions: Transaction[];
  custody: CustodyEntry[];
  verifications: Verification[];
  counts: StockCount[];
  imports: ImportJob[];
  audit: AuditEntry[];
  settings: OrgSettings;
  google: GoogleIntegration;
  idempotency: Record<string, string>;
  prompts: Record<string, PromptRecord>;
  promptUsage: Record<string, number>;
  consecutiveMatches: Record<string, number>;
}

const DAY = 86_400_000;

const WAREHOUSE_SPEC = [
  { id: "wh_1", code: "GD1", name: "Gudang 1", city: "Cikarang" },
  { id: "wh_2", code: "GD2", name: "Gudang 2", city: "Surabaya" },
  { id: "wh_3", code: "GD3", name: "Gudang 3", city: "Medan" },
];

const ZONES = ["Zona A", "Zona B", "Zona C", "Zona D"];

const UNITS: Unit[] = [
  { id: "un_pcs", name: "Piece", symbol: "pcs", decimals: 0 },
  { id: "un_box", name: "Box", symbol: "box", decimals: 0 },
  { id: "un_set", name: "Set", symbol: "set", decimals: 0 },
  { id: "un_kg", name: "Kilogram", symbol: "kg", decimals: 2 },
  { id: "un_l", name: "Liter", symbol: "L", decimals: 2 },
  { id: "un_m", name: "Meter", symbol: "m", decimals: 2 },
  { id: "un_roll", name: "Roll", symbol: "roll", decimals: 0 },
];

const CATEGORY_NAMES = [
  "Bearing",
  "Seal & O-Ring",
  "Fastener",
  "Elektrikal",
  "Pelumas",
  "Pneumatik",
  "Hidraulik",
  "Alat Tangan",
  "Safety",
  "Consumable",
];

interface ItemTemplate {
  base: string;
  category: string;
  unit: string;
  variants: string[];
  minStock: number[];
  bulk?: boolean;
  value?: number[];
}

const ITEM_TEMPLATES: ItemTemplate[] = [
  {
    base: "Bearing",
    category: "Bearing",
    unit: "pcs",
    variants: [
      "6004-2RS",
      "6202-2RS",
      "6203-2RS",
      "6204-ZZ",
      "6205-2RS",
      "6205-ZZ",
      "6206-2RS",
      "6207-2RS",
      "6208-2RS",
      "6210-2RS",
      "6305-2RS",
      "6306-2RS",
      "6308-2RS",
      "6309-2RS",
      "6310-2RS",
      "NU206",
      "NU208",
      "22208 E",
      "22210 E",
      "UC205",
      "UCP205",
      "UCF206",
    ],
    minStock: [8, 10, 12],
    value: [45_000, 62_000, 78_000],
  },
  {
    base: "Seal O-Ring",
    category: "Seal & O-Ring",
    unit: "pcs",
    variants: [
      "10×2 mm",
      "12×2 mm",
      "14×2,5 mm",
      "16×2,5 mm",
      "18×3 mm",
      "20×3 mm",
      "22×3 mm",
      "25×3 mm",
      "28×4 mm",
      "30×4 mm",
      "35×4 mm",
      "40×5 mm",
      "45×5 mm",
      "50×5 mm",
    ],
    minStock: [10, 20],
    value: [4_500, 8_000],
  },
  {
    base: "Oil Seal",
    category: "Seal & O-Ring",
    unit: "pcs",
    variants: [
      "20×35×6",
      "25×40×7",
      "30×47×7",
      "35×52×7",
      "40×55×8",
      "45×62×8",
      "50×72×8",
      "55×80×10",
      "60×85×10",
    ],
    minStock: [6, 10],
    value: [9_000, 15_000],
  },
  {
    base: "Baut Hex",
    category: "Fastener",
    unit: "pcs",
    variants: [
      "M6×20",
      "M6×30",
      "M8×25",
      "M8×30",
      "M8×50",
      "M10×30",
      "M10×40",
      "M10×60",
      "M12×40",
      "M12×60",
      "M12×80",
      "M16×60",
      "M16×80",
      "M16×100",
      "M20×100",
    ],
    minStock: [50, 100],
    value: [900, 1_200, 2_400],
  },
  {
    base: "Mur Hex",
    category: "Fastener",
    unit: "pcs",
    variants: ["M6", "M8", "M10", "M12", "M14", "M16", "M20", "M24"],
    minStock: [50, 100],
    value: [600, 800, 1_500],
  },
  {
    base: "Ring Plat",
    category: "Fastener",
    unit: "pcs",
    variants: ["M6", "M8", "M10", "M12", "M14", "M16", "M20"],
    minStock: [50],
    value: [400, 500],
  },
  {
    base: "Baut L",
    category: "Fastener",
    unit: "pcs",
    variants: ["M8×40", "M10×50", "M12×60", "M16×70"],
    minStock: [20, 30],
    value: [2_200],
  },
  {
    base: "Kabel NYY",
    category: "Elektrikal",
    unit: "m",
    variants: ["2×1,5 mm", "2×2,5 mm", "3×1,5 mm", "3×2,5 mm", "3×4 mm", "4×4 mm", "4×6 mm"],
    minStock: [20, 30],
    bulk: true,
    value: [14_000, 18_000, 26_000],
  },
  {
    base: "Kontaktor",
    category: "Elektrikal",
    unit: "pcs",
    variants: [
      "9 A 220 V",
      "12 A 220 V",
      "18 A 220 V",
      "25 A 220 V",
      "32 A 380 V",
      "40 A 380 V",
      "65 A 380 V",
    ],
    minStock: [3, 4, 6],
    value: [185_000, 240_000, 320_000],
  },
  {
    base: "Relay",
    category: "Elektrikal",
    unit: "pcs",
    variants: ["12 V 4 pin", "24 V 8 pin", "24 V 14 pin", "110 V 8 pin", "220 V 8 pin"],
    minStock: [6],
    value: [65_000, 85_000],
  },
  {
    base: "Lampu Indikator",
    category: "Elektrikal",
    unit: "pcs",
    variants: [
      "16 mm hijau",
      "16 mm merah",
      "22 mm hijau",
      "22 mm merah",
      "22 mm kuning",
      "22 mm biru",
    ],
    minStock: [8],
    value: [28_000, 32_000],
  },
  {
    base: "MCB",
    category: "Elektrikal",
    unit: "pcs",
    variants: [
      "1P 6 A",
      "1P 10 A",
      "1P 16 A",
      "1P 20 A",
      "2P 16 A",
      "2P 20 A",
      "3P 32 A",
      "3P 40 A",
    ],
    minStock: [4, 6],
    value: [68_000, 145_000],
  },
  {
    base: "Grease",
    category: "Pelumas",
    unit: "box",
    variants: [
      "Gadus S2 400 g",
      "Gadus S3 1 kg",
      "EP2 100 g",
      "EP2 400 g",
      "Moly 1 kg",
      "Lithium 400 g",
      "Food Grade 400 g",
    ],
    minStock: [6, 8],
    value: [68_000, 95_000, 140_000],
  },
  {
    base: "Oli Hidraulik",
    category: "Pelumas",
    unit: "L",
    variants: [
      "ISO VG 32 20 L",
      "ISO VG 46 20 L",
      "ISO VG 68 20 L",
      "ISO VG 46 5 L",
      "ISO VG 68 5 L",
    ],
    minStock: [15, 20],
    bulk: true,
    value: [185_000, 210_000],
  },
  {
    base: "Oli Gear",
    category: "Pelumas",
    unit: "L",
    variants: ["EP 90 4 L", "EP 140 4 L", "ATF 4 L"],
    minStock: [8],
    bulk: true,
    value: [165_000],
  },
  {
    base: "Selang Pneumatik",
    category: "Pneumatik",
    unit: "m",
    variants: ["6 mm", "8 mm", "10 mm", "12 mm", "16 mm"],
    minStock: [15, 20],
    bulk: true,
    value: [9_500, 12_000],
  },
  {
    base: "Fitting Pneumatik",
    category: "Pneumatik",
    unit: "pcs",
    variants: [
      "1/8 inci lurus",
      "1/4 inci lurus",
      "1/4 inci elbow",
      "3/8 inci lurus",
      "3/8 inci elbow",
      "1/2 inci lurus",
      "1/2 inci tee",
    ],
    minStock: [10],
    value: [12_000, 15_000],
  },
  {
    base: "Silinder Pneumatik",
    category: "Pneumatik",
    unit: "pcs",
    variants: ["25×50", "32×100", "32×150", "40×100", "40×150", "50×200"],
    minStock: [2, 3],
    value: [620_000, 780_000],
  },
  {
    base: "Filter Regulator",
    category: "Pneumatik",
    unit: "pcs",
    variants: ["1/4 inci", "3/8 inci", "1/2 inci", "3/4 inci"],
    minStock: [3],
    value: [380_000, 420_000],
  },
  {
    base: "Solenoid Valve",
    category: "Pneumatik",
    unit: "pcs",
    variants: ["5/2 1/4 inci", "5/2 3/8 inci", "3/2 1/4 inci"],
    minStock: [2],
    value: [540_000],
  },
  {
    base: "Selang Hidraulik",
    category: "Hidraulik",
    unit: "m",
    variants: ["1/4 inci", "3/8 inci", "1/2 inci", "3/4 inci", "1 inci"],
    minStock: [10],
    bulk: true,
    value: [48_000, 65_000],
  },
  {
    base: "Coupling Hidraulik",
    category: "Hidraulik",
    unit: "pcs",
    variants: ["1/4 inci", "3/8 inci", "1/2 inci", "3/4 inci"],
    minStock: [4],
    value: [120_000, 150_000],
  },
  {
    base: "Pompa Hidraulik",
    category: "Hidraulik",
    unit: "pcs",
    variants: ["10 cc/rev", "16 cc/rev", "25 cc/rev"],
    minStock: [1],
    value: [3_450_000],
  },
  {
    base: "Kunci Pas",
    category: "Alat Tangan",
    unit: "pcs",
    variants: [
      "8 mm",
      "10 mm",
      "11 mm",
      "12 mm",
      "13 mm",
      "14 mm",
      "17 mm",
      "19 mm",
      "22 mm",
      "24 mm",
    ],
    minStock: [3],
    value: [38_000, 48_000],
  },
  {
    base: "Kunci Sok",
    category: "Alat Tangan",
    unit: "set",
    variants: ["8–22 mm 12 pcs", "10–24 mm 14 pcs", "3/8 inci 20 pcs"],
    minStock: [2],
    value: [420_000],
  },
  {
    base: "Kunci L Set",
    category: "Alat Tangan",
    unit: "set",
    variants: ["1,5–10 mm", "2–12 mm", "TORX T10–T50"],
    minStock: [2],
    value: [145_000, 185_000],
  },
  {
    base: "Tang Kombinasi",
    category: "Alat Tangan",
    unit: "pcs",
    variants: ["6 inci", "7 inci", "8 inci", "10 inci"],
    minStock: [2],
    value: [62_000, 72_000],
  },
  {
    base: "Obeng Set",
    category: "Alat Tangan",
    unit: "set",
    variants: ["6 pcs plus minus", "10 pcs plus minus", "Presisi 12 pcs"],
    minStock: [2],
    value: [135_000],
  },
  {
    base: "Sarung Tangan Nitril",
    category: "Safety",
    unit: "box",
    variants: ["Ukuran S", "Ukuran M", "Ukuran L", "Ukuran XL", "Anti cut M", "Anti cut L"],
    minStock: [6, 10],
    value: [98_000, 110_000],
  },
  {
    base: "Kacamata Safety",
    category: "Safety",
    unit: "pcs",
    variants: ["Bening", "Anti kabut", "Gelap", "Goggle"],
    minStock: [5],
    value: [32_000, 38_000],
  },
  {
    base: "Helm Safety",
    category: "Safety",
    unit: "pcs",
    variants: ["Putih", "Kuning", "Biru", "Merah"],
    minStock: [4],
    value: [78_000, 85_000],
  },
  {
    base: "Sepatu Safety",
    category: "Safety",
    unit: "pcs",
    variants: ["Ukuran 40", "Ukuran 41", "Ukuran 42", "Ukuran 43", "Ukuran 44"],
    minStock: [2],
    value: [385_000],
  },
  {
    base: "Masker Respirator",
    category: "Safety",
    unit: "box",
    variants: ["N95", "KN95", "Dust 3M"],
    minStock: [4],
    value: [210_000],
  },
  {
    base: "Majun Putih",
    category: "Consumable",
    unit: "kg",
    variants: ["1 kg", "5 kg", "10 kg"],
    minStock: [10],
    bulk: true,
    value: [22_000, 25_000],
  },
  {
    base: "Isolasi Listrik",
    category: "Consumable",
    unit: "roll",
    variants: ["Hitam", "Merah", "Kuning", "Hijau", "Biru"],
    minStock: [8],
    value: [8_000, 9_000],
  },
  {
    base: "Batu Gerinda",
    category: "Consumable",
    unit: "pcs",
    variants: ["4 inci potong", "4 inci gerinda", "5 inci potong", "7 inci gerinda"],
    minStock: [10],
    value: [12_000, 14_000],
  },
  {
    base: "Elektroda Las",
    category: "Consumable",
    unit: "box",
    variants: ["E6013 2,6 mm", "E6013 3,2 mm", "E7018 3,2 mm", "Stainless 308 2,6 mm"],
    minStock: [4],
    value: [68_000, 78_000],
  },
  {
    base: "Mata Bor",
    category: "Consumable",
    unit: "set",
    variants: ["1–10 mm HSS", "1–13 mm HSS", "Cobalt 1–10 mm"],
    minStock: [2],
    value: [185_000],
  },
  {
    base: "Tape Teflon",
    category: "Consumable",
    unit: "roll",
    variants: ["12 mm", "19 mm"],
    minStock: [10],
    value: [3_500],
  },
];

const REASON_SPEC = [
  { name: "Maintenance", requiresWo: true },
  { name: "Perbaikan darurat", requiresWo: true },
  { name: "Produksi rutin", requiresWo: false },
  { name: "Pemasangan baru", requiresWo: true },
  { name: "Penggantian berkala", requiresWo: false },
  { name: "Sampel / uji", requiresWo: false },
  { name: "Lainnya", requiresWo: false },
];

const EQUIPMENT_NAMES = [
  "Mesin Press 1",
  "Mesin Press 2",
  "Conveyor Line A",
  "Conveyor Line B",
  "Pompa Hidraulik",
  "Kompresor Udara",
  "Genset Cadangan",
  "Mesin Bubut",
  "Forklift 1",
  "Forklift 2",
];

const WORKER_NAMES = [
  "Budi Santoso",
  "Sari Wulandari",
  "Andi Pratama",
  "Dewi Lestari",
  "Rizky Hidayat",
  "Nur Aisyah",
  "Agus Setiawan",
  "Putri Maharani",
  "Joko Susilo",
  "Maya Anggraini",
  "Fajar Nugroho",
  "Indah Permata",
];

const SUPERVISOR_NAMES = ["Hendra Wijaya", "Rina Astuti"];
const ADMIN_NAME = "Bayu Kurniawan";

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

export function buildSeed(seed = 20261021): MockDatabase {
  const rng = createRng(seed);
  const now = Date.now();

  const warehouses: Warehouse[] = WAREHOUSE_SPEC.map((spec) => ({
    id: spec.id,
    code: spec.code,
    name: spec.name,
    timezone: "Asia/Jakarta",
  }));

  /* ------------------------------- lokasi -------------------------------- */

  const locations: Location[] = [];
  for (const spec of WAREHOUSE_SPEC) {
    const whPath = `${spec.name} · ${spec.city}`;
    locations.push({
      id: spec.id,
      warehouseId: spec.id,
      parentId: null,
      type: "warehouse",
      code: spec.code,
      name: whPath,
      path: whPath,
      active: true,
    });
    for (const zone of ZONES) {
      const zoneCode = zone.replace("Zona ", "");
      const zoneId = `${spec.id}_z${zoneCode.toLowerCase()}`;
      locations.push({
        id: zoneId,
        warehouseId: spec.id,
        parentId: spec.id,
        type: "zone",
        code: zoneCode,
        name: zone,
        path: `${whPath} › ${zone}`,
        active: true,
      });
      const rackCount = spec.id === "wh_1" ? 8 : 5;
      for (let rack = 1; rack <= rackCount; rack += 1) {
        const code = `${zoneCode}-${String(rack).padStart(2, "0")}`;
        const rackId = `${zoneId}_r${rack}`;
        locations.push({
          id: rackId,
          warehouseId: spec.id,
          parentId: zoneId,
          type: "rack",
          code: `Rak ${code}`,
          name: `Rak ${code}`,
          path: `${whPath} › ${zone} › Rak ${code}`,
          active: true,
        });
        if (rack <= 2) {
          for (const bin of ["A", "B"] as const) {
            locations.push({
              id: `${rackId}_b${bin}`,
              warehouseId: spec.id,
              parentId: rackId,
              type: "bin",
              code: `${code}-${bin}`,
              name: `Bin ${code}-${bin}`,
              path: `${whPath} › ${zone} › Rak ${code} › Bin ${code}-${bin}`,
              active: true,
            });
          }
        }
      }
    }
  }

  const storageLocations = locations.filter(
    (location) => location.type === "rack" || location.type === "bin",
  );

  const categories: Category[] = CATEGORY_NAMES.map((name, index) => ({
    id: `cat_${index + 1}`,
    name,
    active: true,
  }));

  /* -------------------------------- user --------------------------------- */

  const users: User[] = [];
  WORKER_NAMES.forEach((name, index) => {
    users.push({
      id: `usr_${index + 1}`,
      code: `WRK${String(index + 1).padStart(2, "0")}`,
      name,
      role: "worker",
      email: null,
      active: true,
      pin: "1122",
      shiftEndsAt: "16:00",
      lastLoginAt: iso(now - rng.int(1, 40) * 3_600_000),
      createdAt: iso(now - rng.int(120, 420) * DAY),
    });
  });
  SUPERVISOR_NAMES.forEach((name, index) => {
    users.push({
      id: `usr_${13 + index}`,
      code: `SPV${String(index + 1).padStart(2, "0")}`,
      name,
      role: "supervisor",
      email: `spv${index + 1}@nemu.local`,
      active: index === 0,
      pin: "1357",
      password: "nemusup123",
      shiftEndsAt: null,
      lastLoginAt: iso(now - rng.int(1, 12) * 3_600_000),
      createdAt: iso(now - rng.int(200, 420) * DAY),
    });
  });
  users.push({
    id: "usr_15",
    code: "ADM01",
    name: ADMIN_NAME,
    role: "admin",
    email: "andi@nemu.local",
    active: true,
    pin: "2468",
    password: "nemuadmin123",
    shiftEndsAt: null,
    lastLoginAt: iso(now - 2 * 3_600_000),
    createdAt: iso(now - 400 * DAY),
  });

  /* -------------------------------- item --------------------------------- */

  const items: Item[] = [];
  let itemIndex = 0;
  for (const template of ITEM_TEMPLATES) {
    const category = categories.find((entry) => entry.name === template.category)!;
    const unit = UNITS.find((entry) => entry.symbol === template.unit)!;
    for (const variant of template.variants) {
      itemIndex += 1;
      const primary = storageLocations[rng.int(0, storageLocations.length - 1)]!;
      items.push({
        id: `itm_${String(itemIndex).padStart(4, "0")}`,
        sku: `${template.category.slice(0, 3).toUpperCase()}-${String(1000 + itemIndex)}`,
        code: crockfordCode(rng),
        name: `${template.base} ${variant}`,
        categoryId: category.id,
        unitId: unit.id,
        minStock: rng.pick(template.minStock),
        unitValue: template.value ? rng.pick(template.value) : null,
        isBulk: Boolean(template.bulk),
        primaryLocationId: primary.id,
        active: itemIndex % 53 !== 0,
        photoUrl: null,
        createdAt: iso(now - rng.int(120, 500) * DAY),
        updatedAt: iso(now - rng.int(1, 90) * DAY),
      });
    }
  }

  // Lengkapi sampai 300 item (fixture realistis, bukan duplikat).
  const FILLER = [
    "Bushing Bronze",
    "Pin Dowel",
    "Spring Washer",
    "Shim Plate 0,5 mm",
    "Gasket Karet",
    "V-Belt A-38",
    "Puli Aluminium 3 inci",
    "Rantai Roller 08B",
    "Sprocket 08B 18T",
    "Klem Selang 1/2 inci",
    "Nipple Kuningan 1/4 inci",
    "Adaptor Pipa 3/4 inci",
    "Kabel Fleksibel 2×1 mm",
    "Terminal Kabel 6 mm",
    "Fuse Holder 10 A",
    "Push Button Hijau",
    "Pilot Lamp 220 V",
    "Thermal Overload 12 A",
    "Timer Relay 220 V",
    "Sensor Proximity 12 mm",
  ];
  while (items.length < 300) {
    itemIndex += 1;
    const category = categories[itemIndex % categories.length]!;
    const unit = UNITS[itemIndex % 3]!;
    const primary = storageLocations[rng.int(0, storageLocations.length - 1)]!;
    items.push({
      id: `itm_${String(itemIndex).padStart(4, "0")}`,
      sku: `GEN-${1000 + itemIndex}`,
      code: crockfordCode(rng),
      name: `${FILLER[itemIndex % FILLER.length]} ${String(itemIndex - 229).padStart(2, "0")}`,
      categoryId: category.id,
      unitId: unit.id,
      minStock: rng.pick([0, 5, 10, 15]),
      unitValue: rng.chance(0.3) ? rng.pick([12_000, 35_000, 120_000]) : null,
      isBulk: unit.symbol === "kg" || unit.symbol === "m",
      primaryLocationId: primary.id,
      active: itemIndex % 61 !== 0,
      photoUrl: null,
      createdAt: iso(now - rng.int(60, 300) * DAY),
      updatedAt: iso(now - rng.int(1, 60) * DAY),
    });
  }

  const reasons: Reason[] = REASON_SPEC.map((reason, index) => ({
    id: `rs_${index + 1}`,
    name: reason.name,
    requiresWo: reason.requiresWo,
    active: index !== 6,
  }));

  const equipment: Equipment[] = EQUIPMENT_NAMES.map((name, index) => ({
    id: `eq_${index + 1}`,
    code: `MCH-${String(index + 1).padStart(2, "0")}`,
    name,
    locationId: null,
    active: index < 8,
  }));

  /* -------------------------------- stok --------------------------------- */

  const stock: StockLevel[] = [];
  for (const item of items) {
    const locationCount = rng.weighted([
      [1, 68],
      [2, 24],
      [3, 8],
    ] as const);
    const used = new Set<string>();
    for (let i = 0; i < locationCount; i += 1) {
      const location =
        i === 0 && item.primaryLocationId
          ? (storageLocations.find((entry) => entry.id === item.primaryLocationId) ??
            storageLocations[0]!)
          : storageLocations[rng.int(0, storageLocations.length - 1)]!;
      if (used.has(location.id)) continue;
      used.add(location.id);
      const qty = item.isBulk
        ? rng.int(4, 220)
        : rng.pick([0, 2, 5, 9, 12, 14, 18, 24, 40, 55, 90, 130]);
      const neverCounted = rng.chance(0.24);
      const lastVerifiedAt = neverCounted ? null : iso(now - rng.int(1, 260) * DAY);
      const txSince = neverCounted ? 0 : rng.int(0, 9);
      const variance = neverCounted ? 0 : rng.chance(0.1) ? rng.next() * 0.2 : 0;
      const confidence = computeConfidence({
        lastVerifiedAt,
        txSinceVerified: txSince,
        lastVarianceRatio: variance,
        needsReview: false,
        now: new Date(now),
      });
      stock.push({
        itemId: item.id,
        locationId: location.id,
        qty,
        version: rng.int(1, 40),
        updatedAt: iso(now - rng.int(1, 25) * DAY),
        lastVerifiedAt,
        lastVerifiedQty: lastVerifiedAt ? Math.max(0, qty + rng.int(-2, 2)) : null,
        txSinceVerified: txSince,
        lastVarianceRatio: variance,
        confidence,
      });
    }
  }

  /* ------------------------------ transaksi ------------------------------ */

  const transactions: Transaction[] = [];
  const workers = users.filter((user) => user.role === "worker");
  const activeItems = items.filter((item) => item.active);
  const activeReasons = reasons.filter((reason) => reason.active);
  const TOTAL_TX = 5000;

  for (let i = 0; i < TOTAL_TX; i += 1) {
    const item = rng.pick(activeItems);
    const level = stock.find((entry) => entry.itemId === item.id);
    if (!level) continue;
    const user = rng.pick(workers);
    const type = rng.weighted<Transaction["type"]>([
      ["issue", 76],
      ["return", 8],
      ["receive", 6],
      ["consume", 6],
      ["adjust", 2],
      ["transfer", 2],
    ] as const);
    const qty = item.isBulk ? rng.int(1, 20) : rng.int(1, 6);
    const reason = rng.pick(activeReasons);
    const ageDays = Math.floor((i / TOTAL_TX) * 90);
    transactions.push({
      id: `tx_${String(i + 1).padStart(6, "0")}`,
      type,
      itemId: item.id,
      fromLocationId: type === "issue" || type === "transfer" ? level.locationId : null,
      toLocationId:
        type === "return" || type === "receive" || type === "transfer" ? level.locationId : null,
      qty,
      userId: user.id,
      reasonId: type === "issue" ? reason.id : null,
      refNo: type === "issue" && reason.requiresWo ? `WO-${rng.int(2100, 2600)}` : null,
      note: null,
      idempotencyKey: `seed-${i}`,
      deviceId: null,
      scanMethod:
        type === "issue"
          ? rng.weighted([
              ["qr_camera", 62],
              ["in_app_scanner", 30],
              ["manual_code", 8],
            ] as const)
          : null,
      custodyId: null,
      equipmentId: type === "consume" ? rng.pick(equipment).id : null,
      outcome: type === "consume" ? "used" : null,
      clientCreatedAt: null,
      createdAt: iso(now - ageDays * DAY - rng.int(0, 20) * 3_600_000),
      reversesId: null,
      reviewStatus: type === "adjust" && rng.chance(0.4) ? "needs_review" : "ok",
    });
  }
  transactions.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  /* ------------------------------- kustodi ------------------------------- */

  const custodyPlan = [
    { worker: 0, item: 0, qty: 2, hours: 6 },
    { worker: 0, item: 3, qty: 1, hours: 9 },
    { worker: 0, item: 7, qty: 1, hours: 30 },
    { worker: 1, item: 11, qty: 4, hours: 3 },
    { worker: 2, item: 15, qty: 2, hours: 34 },
    { worker: 4, item: 20, qty: 1, hours: 2 },
    { worker: 5, item: 24, qty: 6, hours: 12 },
    { worker: 6, item: 30, qty: 3, hours: 40 },
    { worker: 8, item: 36, qty: 2, hours: 5 },
    { worker: 9, item: 41, qty: 1, hours: 18 },
    { worker: 10, item: 47, qty: 5, hours: 72 },
  ];

  const custody: CustodyEntry[] = custodyPlan.map((plan, index) => {
    const item = items[plan.item % items.length]!;
    const level = stock.find((entry) => entry.itemId === item.id)!;
    const user = workers[plan.worker % workers.length]!;
    return {
      id: `cus_${String(index + 1).padStart(4, "0")}`,
      issueTxId: `tx_cus_${index}`,
      userId: user.id,
      itemId: item.id,
      qtyTaken: plan.qty,
      qtyOpen: plan.qty,
      status: "open",
      openedAt: iso(now - plan.hours * 3_600_000),
      closedAt: null,
      lastRemindedAt: null,
      equipmentId: rng.chance(0.5) ? rng.pick(equipment).id : null,
      refNo: `WO-${2200 + index}`,
      fromLocationId: level.locationId,
    };
  });

  /* ----------------------------- verifikasi ------------------------------ */

  const verifications: Verification[] = [];
  for (let i = 0; i < 420; i += 1) {
    const level = stock[rng.int(0, stock.length - 1)]!;
    const user = rng.pick(workers);
    const result = rng.weighted<Verification["result"]>([
      ["match", 70],
      ["mismatch", 14],
      ["skipped", 10],
      ["inconclusive", 6],
    ] as const);
    const systemQty = Math.max(0, level.qty + rng.int(-4, 6));
    const countedQty =
      result === "match"
        ? systemQty
        : result === "mismatch"
          ? Math.max(0, systemQty - rng.int(1, 5))
          : null;
    const reviewStatus =
      result === "mismatch"
        ? rng.chance(0.5)
          ? "pending"
          : rng.chance(0.6)
            ? "approved"
            : "rejected"
        : "none";
    verifications.push({
      id: `ver_${String(i + 1).padStart(4, "0")}`,
      itemId: level.itemId,
      locationId: level.locationId,
      userId: user.id,
      source: rng.weighted([
        ["pick_prompt", 84],
        ["opname", 12],
        ["manual", 4],
      ] as const),
      mode: rng.chance(0.25) ? "blind" : "confirm",
      systemQty,
      stockVersion: Math.max(1, level.version - rng.int(0, 5)),
      countedQty,
      variance: countedQty === null ? null : countedQty - systemQty,
      result,
      triggerTxId: null,
      promptProbability: Number(rng.next().toFixed(3)),
      createdAt: iso(now - rng.int(1, 75) * DAY),
      reviewStatus,
      reviewNote: reviewStatus === "rejected" ? "Hitungan ulang oleh supervisor" : null,
      reviewedBy: reviewStatus === "pending" ? null : users[12]!.id,
      reviewedAt: reviewStatus === "pending" ? null : iso(now - rng.int(1, 20) * DAY),
      adjustTxId: null,
    });
  }

  /* -------------------------------- opname ------------------------------- */

  const counts: StockCount[] = [];
  const zoneB = locations.find((location) => location.id === "wh_1_zb")!;
  const zoneC = locations.find((location) => location.id === "wh_1_zc")!;
  [zoneB, zoneC].forEach((zone, index) => {
    const rackIds = locations
      .filter((location) => location.parentId === zone.id)
      .map((location) => location.id);
    const lines: StockCountLine[] = stock
      .filter((level) => rackIds.includes(level.locationId))
      .slice(0, 14)
      .map((level, lineIndex) => {
        const item = items.find((entry) => entry.id === level.itemId)!;
        const counted =
          index === 0 && lineIndex > 8
            ? null
            : Math.max(0, level.qty + (lineIndex % 4 === 0 ? -2 : 0));
        return {
          id: `scl_${index}_${lineIndex}`,
          itemId: level.itemId,
          locationId: level.locationId,
          systemQty: level.qty,
          countedQty: counted,
          variance: counted === null ? null : counted - level.qty,
          status: counted === null ? "pending" : index === 0 ? "counted" : "approved",
          note: null,
          itemName: item.name,
          itemCode: item.code,
          locationPath: locations.find((location) => location.id === level.locationId)?.path,
          unitSymbol: UNITS.find((unit) => unit.id === item.unitId)?.symbol,
        };
      });
    counts.push({
      id: `cnt_${index + 1}`,
      name: `Opname ${zone.name} · ${index === 0 ? "Oktober" : "September"}`,
      warehouseId: zone.warehouseId,
      zoneId: zone.id,
      blind: index === 1,
      status: index === 0 ? "open" : "review",
      createdBy: users[12]!.id,
      createdAt: iso(now - (index + 1) * 3 * DAY),
      closedAt: null,
      lines,
      source: index === 0 ? "manual" : "needs_count",
    });
  });

  /* --------------------------------- audit ------------------------------- */

  const audit: AuditEntry[] = [];
  for (let i = 0; i < 45; i += 1) {
    const item = items[rng.int(0, items.length - 1)]!;
    const actor = users[rng.int(11, 14)]!;
    audit.push({
      id: `aud_${String(i + 1).padStart(4, "0")}`,
      entity: rng.pick(["item", "location", "reason", "user", "settings"]),
      entityId: item.id,
      action: rng.weighted([
        ["update", 68],
        ["create", 22],
        ["deactivate", 10],
      ] as const),
      before: { name: item.name, minStock: item.minStock },
      after: { name: item.name, minStock: item.minStock + 2 },
      actorId: actor.id,
      actorName: actor.name,
      source: rng.weighted([
        ["dashboard", 66],
        ["csv_import", 20],
        ["sheets_import", 14],
      ] as const),
      createdAt: iso(now - rng.int(1, 45) * DAY),
    });
  }

  const settings: OrgSettings = {
    orgName: "PT Nemu Manufaktur",
    timezone: "Asia/Jakarta",
    locale: "id",
    shiftEndsAt: ["16:00"],
    verifyPromptEnabled: true,
    verifyMaxPerShift: 3,
    verifyCountThreshold: 50,
    verifyPMin: 0.05,
    verifyPMax: 0.8,
    confidenceDecayDays: 90,
    custodyEnabled: true,
    custodyOverdueHours: 24,
    defaultMinStock: 5,
    blindEveryN: 4,
    notifications: { telegram: true, email: false },
    branding: { accent: "#C2410C", logoText: "Nemu" },
  };

  const google: GoogleIntegration = {
    connected: true,
    accountEmail: "gudang@nemu.local",
    folderName: "Nemu - PT Nemu Manufaktur",
    spreadsheetId: "1NemuDemoSpreadsheetId",
    spreadsheetUrl: "https://docs.google.com/spreadsheets/d/1NemuDemoSpreadsheetId/edit",
    schemaVersion: "3",
    appSchemaVersion: "3",
    lastSyncAt: iso(now - 7 * 60_000),
    scopes: ["https://www.googleapis.com/auth/drive.file"],
    protectedRanges: 9,
    checkStatus: "ok",
    checkMessage: null,
    runs: [
      {
        id: "run_1",
        direction: "export",
        status: "ok",
        rows: 100,
        startedAt: iso(now - 7 * 60_000),
        finishedAt: iso(now - 6 * 60_000),
        message: null,
      },
      {
        id: "run_2",
        direction: "export",
        status: "pending",
        rows: 42,
        startedAt: iso(now - 2 * 60_000),
        finishedAt: null,
        message: "Menunggu kuota Sheets",
      },
      {
        id: "run_3",
        direction: "import",
        status: "ok",
        rows: 12,
        startedAt: iso(now - 26 * 3_600_000),
        finishedAt: iso(now - 25 * 3_600_000),
        message: null,
      },
    ],
  };

  return {
    warehouses,
    locations,
    categories,
    units: UNITS,
    items,
    users,
    reasons,
    equipment,
    stock,
    transactions,
    custody,
    verifications,
    counts,
    imports: [],
    audit,
    settings,
    google,
    idempotency: {},
    prompts: {},
    promptUsage: {},
    consecutiveMatches: {},
  };
}
