jest.doMock("../../src/transaction.service", () => ({ listTransactions: jest.fn() }))
const txService = require("../../src/transaction.service")
const exportService = require("../../src/Export.service")

const tx = (over = {}) => ({ id: "L1", transactionId: "T1", date: "01 Jan 2026", type: "CREDIT", txType: "DEPOSIT", amount: 10, balanceSnapshot: 10, reference: "ok", initiatedBy: "Staff", ...over })

beforeEach(() => jest.clearAllMocks())

test("HTML export escapes user-controlled reference (XSS)", async () => {
  txService.listTransactions.mockResolvedValue([tx({ reference: `<img src=x onerror="alert(1)">` })])
  const html = await exportService.exportPDF("u", {}, { name: "<b>Bob</b>" })
  expect(html).not.toContain("<img src=x")
  expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;")
  expect(html).toContain("&lt;b&gt;Bob&lt;/b&gt;")
})

test("CSV export neutralises formula injection and quotes", async () => {
  txService.listTransactions.mockResolvedValue([tx({ reference: `=HYPERLINK("http://evil")` })])
  const csv = (await exportService.exportCSV("u", {})).toString("utf-8")
  expect(csv).toContain(`"'=HYPERLINK(""http://evil"")"`)
})

test("export pages through the 100-row API limit", async () => {
  const page = Array.from({ length: 100 }, (_, i) => tx({ id: "L" + i }))
  txService.listTransactions.mockResolvedValueOnce(page).mockResolvedValueOnce([tx({ id: "last" })])
  const csv = (await exportService.exportCSV("u", {})).toString("utf-8")
  expect(txService.listTransactions).toHaveBeenCalledTimes(2)
  expect(txService.listTransactions.mock.calls[1][1]).toMatchObject({ offset: 100, limit: 100 })
  expect(csv.split("\r\n")).toHaveLength(1 + 101)
})
