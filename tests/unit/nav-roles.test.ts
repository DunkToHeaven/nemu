import { describe, expect, it } from "vitest";
import { DATABASE_TABS, NAV_ITEMS, navForRole } from "@/lib/nav";

describe("menu per role (WB-05, kriteria 6)", () => {
  it("worker tidak melihat menu supervisor atau admin", () => {
    const labels = navForRole("worker").map((item) => item.labelKey);
    expect(labels).not.toContain("nav.transactions");
    expect(labels).not.toContain("nav.counts");
    expect(labels).not.toContain("nav.reports");
    expect(labels).not.toContain("nav.database");
    expect(labels).not.toContain("nav.settings");
    expect(labels).not.toContain("nav.audit");
  });

  it("worker melihat alur inti", () => {
    const labels = navForRole("worker").map((item) => item.labelKey);
    for (const key of ["nav.home", "nav.search", "nav.scan", "nav.history", "nav.custody"]) {
      expect(labels).toContain(key);
    }
  });

  it("supervisor melihat laporan dan opname, bukan pengaturan", () => {
    const labels = navForRole("supervisor").map((item) => item.labelKey);
    expect(labels).toContain("nav.transactions");
    expect(labels).toContain("nav.counts");
    expect(labels).toContain("nav.reports");
    expect(labels).toContain("nav.database");
    expect(labels).not.toContain("nav.settings");
    expect(labels).not.toContain("nav.audit");
    expect(labels).not.toContain("nav.integrations");
  });

  it("admin melihat semuanya", () => {
    expect(navForRole("admin")).toHaveLength(NAV_ITEMS.length);
  });

  it("tab Database admin-only disembunyikan dari supervisor", () => {
    const supervisorTabs = DATABASE_TABS.filter((tab) => !tab.adminOnly).map((tab) => tab.href);
    expect(supervisorTabs).toContain("/app/database/items");
    expect(supervisorTabs).not.toContain("/app/database/lokasi");
    expect(supervisorTabs).not.toContain("/app/database/pengguna");
    expect(supervisorTabs).not.toContain("/app/database/impor");
  });

  it("tidak ada href ganda", () => {
    const hrefs = NAV_ITEMS.map((item) => item.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});
