#!/usr/bin/env python3
"""Update i18n untuk Tema 9+10: copy landing baru, kunci harga/deskripsi."""
import json, io

BASE = "C:/Users/user/Downloads/nemu-frontend/src/i18n/messages"

def load(name):
    with io.open(f"{BASE}/{name}.json", "r", encoding="utf-8") as f:
        return json.load(f)

def dump(name, data):
    with io.open(f"{BASE}/{name}.json", "w", encoding="utf-8", newline="") as f:
        f.write(json.dumps(data, indent=2, ensure_ascii=False).replace("\n", "\r\n") + "\r\n")

ID_LANDING = {
    "badge": "Open Source · Gratis Selamanya · Tanpa Iklan",
    "heroLine1": "Pakai Nemu, ",
    "heroLine2": "Pasti Ketemu.",
    "heroBody": "Gudang Anda kehilangan barang, catatan selisih, dan pelaku misterius? Nemu menutup celah itu: satu scan QR, rekam jejak permanen, dan angka stok yang 100% bisa dipercaya.",
    "ctaDemo": "Mulai Gratis Sekarang",
    "ctaDocs": "Lihat Cara Kerjanya",
    "step1Title": "Tempel QR di Rak",
    "step1Sub": "Pasang kode unik di setiap titik penyimpanan.",
    "step2Title": "Scan & Input",
    "step2Sub": "Cukup pakai browser HP pekerja lapangan.",
    "step3Title": "Stok & Nama Tercatat",
    "step3Sub": "Mutasi stok langsung terupdate otomatis.",
    "featuresTitle": "Didesain untuk operasional gudang yang bergerak cepat",
    "featuresBody": "Tanpa pelatihan berhari-hari, tanpa perangkat pemindai mahal. Cukup gunakan ponsel yang sudah ada di saku pekerja Anda.",
    "featureLog": "Tidak ada angka yang bisa diubah diam-diam",
    "featureLogBody": "Stok bukan sel tabel bebas edit. Ia dihitung dari log transaksi permanen — koreksi wajib melalui jalur transaksi pembalik yang sah.",
    "featureOffline": "Sinyal hilang? Kerja tetap jalan",
    "featureOfflineBody": "Blind spot di sudut gudang bukan masalah. Data masuk antrean lokal di HP dan otomatis terkirim begitu sinyal kembali.",
    "featureLive": "Supervisor tahu dalam hitungan detik",
    "featureLiveBody": "Perubahan stok sekecil apa pun langsung terpantau di dashboard pusat. Tanpa telepon, tanpa buang waktu di grup chat.",
    "featureSheets": "Excel dan Sheets tetap bisa dipakai",
    "featureSheetsBody": "Sinkronisasi master data dari Excel dengan mudah. Jadikan sheets sebagai jendela baca yang aman — bukan database utama.",
}

EN_LANDING = {
    "badge": "Open Source · Free Forever · No Ads",
    "heroLine1": "Use Nemu, ",
    "heroLine2": "it always turns up.",
    "heroBody": "Your warehouse loses stock, counts never reconcile, and there is always an invisible hand. Nemu closes that gap: one QR scan, a permanent trail, and stock figures you can trust 100%.",
    "ctaDemo": "Start Free Now",
    "ctaDocs": "See How It Works",
    "step1Title": "Stick the QR on the Rack",
    "step1Sub": "Put a unique code on every storage point.",
    "step2Title": "Scan & Enter",
    "step2Sub": "Just the browser on the floor worker's phone.",
    "step3Title": "Stock & Name Recorded",
    "step3Sub": "Stock movements update automatically, instantly.",
    "featuresTitle": "Designed for fast-moving warehouse operations",
    "featuresBody": "No days of training, no expensive scanning hardware. Just the phone already in your worker's pocket.",
    "featureLog": "No number changes behind your back",
    "featureLogBody": "Stock is not a free-edit table cell. It is computed from a permanent transaction log — corrections must go through a valid reversing entry.",
    "featureOffline": "Signal drops? Work continues",
    "featureOfflineBody": "A blind spot in the warehouse corner is not a problem. Data queues locally on the phone and syncs itself the moment signal returns.",
    "featureLive": "Supervisors know within seconds",
    "featureLiveBody": "Any stock change, however small, shows up on the central dashboard immediately. No phone calls, no wasted time in group chats.",
    "featureSheets": "Excel and Sheets still work",
    "featureSheetsBody": "Sync master data from Excel with ease. Keep sheets as a safe read window — not the primary database.",
}

def apply(lang, landing, extra):
    data = load(lang)
    data["landing"].update(landing)
    for ns, pairs in extra.items():
        data.setdefault(ns, {}).update(pairs)
    # kunci mati: kartu proof & kredit sudah dihapus dari landing
    for dead in ("madeBy", "proofTitle", "proofRemaining"):
        data["landing"].pop(dead, None)
    dump(lang, data)
    print(lang, "ok")

apply(
    "id",
    ID_LANDING,
    {
        "database": {
            "priceLabel": "Harga (Rp/satuan)",
            "descriptionLabel": "Deskripsi",
            "descriptionPlaceholder": "Kondisi, garansi, catatan supplier…",
        },
        "take": {
            "unitPriceLabel": "Harga per unit (Rp)",
            "optional": "opsional",
            "priceInvalid": "Harga tidak boleh negatif.",
        },
        "reports": {
            "priceHistory": "Tren harga perolehan",
            "priceHistoryEmpty": "Belum ada harga perolehan tercatat",
            "priceHistoryEmptyBody":
                "Isi kolom harga saat menerima barang (scan → Tambah stok) untuk melihat perubahan harga antar tanggal.",
            "priceHistoryPoints": "{count, plural, one {# titik harga} other {# titik harga}}",
            "priceHistoryFromTo": "Dari {from} menjadi {to}",
            "priceHistoryOpenItem": "Lihat item",
            "priceHistoryClose": "Tutup detail harga",
            "priceHistoryDate": "Tanggal",
            "priceHistoryPrice": "Harga",
            "priceHistoryDelta": "Perubahan",
            "priceHistoryQty": "Qty",
        },
        "support": {},
    },
)
apply(
    "en",
    EN_LANDING,
    {
        "database": {
            "priceLabel": "Price (Rp/unit)",
            "descriptionLabel": "Description",
            "descriptionPlaceholder": "Condition, warranty, supplier notes…",
        },
        "take": {
            "unitPriceLabel": "Unit price (Rp)",
            "optional": "optional",
            "priceInvalid": "Price cannot be negative.",
        },
        "reports": {
            "priceHistory": "Acquisition price trend",
            "priceHistoryEmpty": "No purchase prices recorded yet",
            "priceHistoryEmptyBody":
                "Fill in the price when receiving stock (scan → Add stock) to see price changes across dates.",
            "priceHistoryPoints": "{count, plural, one {# price point} other {# price points}}",
            "priceHistoryFromTo": "From {from} to {to}",
            "priceHistoryOpenItem": "View item",
            "priceHistoryClose": "Close price detail",
            "priceHistoryDate": "Date",
            "priceHistoryPrice": "Price",
            "priceHistoryDelta": "Change",
            "priceHistoryQty": "Qty",
        },
        "support": {},
    },
)
