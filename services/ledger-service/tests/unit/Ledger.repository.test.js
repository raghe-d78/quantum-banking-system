// services/ledger-service/tests/unit/Ledger.repository.test.js
const mockPool = { query: jest.fn() };
jest.mock("/shared/db", () => () => mockPool);

const ledgerRepo = require("../../src/Ledger.repository");

beforeEach(() => jest.clearAllMocks());

describe("ledgerRepository.append() — T2.3", () => {

  test("inserts a CREDIT entry and returns it", async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [{ id:"e1", account_id:"acc1", type:"CREDIT", amount:"500.0000", balance_snapshot:"1500.0000", reference:"DEP-001", created_at: new Date() }]
    });
    const entry = await ledgerRepo.append({ accountId:"acc1", type:"CREDIT", amount:"500.0000", balanceSnapshot:"1500.0000", reference:"DEP-001" });
    expect(entry.type).toBe("CREDIT");
    expect(entry.amount).toBe("500.0000");
    const sql = mockPool.query.mock.calls[0][0].toUpperCase();
    expect(sql).toContain("INSERT");
    expect(sql).not.toContain("UPDATE");
    expect(sql).not.toContain("DELETE");
  });

  test("inserts a DEBIT entry and returns it", async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [{ id:"e2", type:"DEBIT", amount:"100.0000", balance_snapshot:"1400.0000" }]
    });
    const entry = await ledgerRepo.append({ accountId:"acc1", type:"DEBIT", amount:"100.0000", balanceSnapshot:"1400.0000" });
    expect(entry.type).toBe("DEBIT");
  });

  test("throws if type is invalid", async () => {
    await expect(ledgerRepo.append({ accountId:"acc1", type:"INVALID", amount:"100.0000", balanceSnapshot:"500.0000" }))
      .rejects.toThrow("Invalid entry type");
  });

  test("throws if amount is missing", async () => {
    await expect(ledgerRepo.append({ accountId:"acc1", type:"CREDIT", balanceSnapshot:"500.0000" }))
      .rejects.toThrow("amount is required");
  });

  test("throws if accountId is missing", async () => {
    await expect(ledgerRepo.append({ type:"CREDIT", amount:"100.0000", balanceSnapshot:"500.0000" }))
      .rejects.toThrow("accountId is required");
  });
});

describe("ledgerRepository — Append-only enforcement (T2.4)", () => {

  test("has no update() method", () => {
    expect(typeof ledgerRepo.update).toBe("undefined");
  });

  test("has no delete() method", () => {
    expect(typeof ledgerRepo.delete).toBe("undefined");
  });

  test("has no remove() method", () => {
    expect(typeof ledgerRepo.remove).toBe("undefined");
  });

  test("only exposes append(), findByAccountId(), findById()", () => {
    const allowed   = ["append", "findByAccountId", "findById"];
    const actual    = Object.keys(ledgerRepo);
    const forbidden = actual.filter(m => !allowed.includes(m));
    expect(forbidden).toHaveLength(0);
  });
});

describe("ledgerRepository.findByAccountId() — T2.5", () => {

  test("balance_snapshot matches cumulative sum of entries", async () => {
    const mockEntries = [
      { id:"e1", type:"CREDIT", amount:"1000.0000", balance_snapshot:"1000.0000" },
      { id:"e2", type:"DEBIT",  amount:"200.0000",  balance_snapshot:"800.0000"  },
      { id:"e3", type:"CREDIT", amount:"500.0000",  balance_snapshot:"1300.0000" },
    ];
    mockPool.query.mockResolvedValueOnce({ rows: mockEntries });
    const entries = await ledgerRepo.findByAccountId("acc1");
    expect(entries).toHaveLength(3);

    const Decimal = require("decimal.js");
    let running = new Decimal("0");
    for (const e of entries) {
      running = e.type === "CREDIT" ? running.plus(e.amount) : running.minus(e.amount);
      expect(running.toFixed(4)).toBe(e.balance_snapshot);
    }
  });

  test("returns empty array if no entries", async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });
    expect(await ledgerRepo.findByAccountId("acc1")).toEqual([]);
  });
});

describe("ledgerRepository.findById()", () => {

  test("returns entry by id", async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [{ id:"e1", type:"CREDIT" }] });
    expect((await ledgerRepo.findById("e1")).id).toBe("e1");
  });

  test("returns undefined if not found", async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });
    expect(await ledgerRepo.findById("x")).toBeUndefined();
  });
});