// New Transaction wizard — one flow for transfers, bill payments, merchant
// payments and withdrawals, backed by POST /transactions.
//   1 Choose  → 2 Details → 3 Review → 4 Done
// Every submit carries an Idempotency-Key so a double click or a retry after
// a network error can never create a second transaction.
import { useEffect, useMemo, useState } from "react";
import api from "../lib/api";
import { Button, Card, Field, Alert, Stepper, KV, Icon, Pill } from "../components/ui";
import { fmtMoney, isUuid, errorMessage, KIND_LABEL } from "../lib/format";
import DocumentUpload from "../components/DocumentUpload";

const KINDS = [
  { key: "TRANSFER",         icon: "send",  title: "Transfer",       sub: "Send money to another Banque account", grad: "linear-gradient(135deg,#1a3a6b,#4a7fc1)" },
  { key: "BILL_PAYMENT",     icon: "bolt",  title: "Pay a bill",     sub: "STEG, SONEDE, Topnet, Ooredoo…",        grad: "linear-gradient(135deg,#1a4a2e,#4a9c6e)" },
  { key: "MERCHANT_PAYMENT", icon: "cart",  title: "Pay a merchant", sub: "Shops and online stores",               grad: "linear-gradient(135deg,#4a1a2e,#9c4a6e)" },
  { key: "WITHDRAW",         icon: "cash",  title: "Withdraw cash",  sub: "Debit your account at the counter",     grad: "linear-gradient(135deg,#3a2a0a,#c9a84c)" },
];
const STEPS = ["Choose", "Details", "Review", "Done"];
const QUICK = [20, 50, 100, 250, 500];
const newKey = () => (crypto.randomUUID ? crypto.randomUUID() : `k-${Date.now()}-${Math.random().toString(36).slice(2)}`);

export default function NewTransactionPage({ initialKind = null, onDone }) {
  const [step, setStep]       = useState(initialKind ? 1 : 0);
  const [kind, setKind]       = useState(initialKind);
  const [balance, setBalance] = useState(null);
  const [payees, setPayees]   = useState([]);
  const [form, setForm]       = useState({ amount: "", destinationAccountId: "", payeeCode: "", referenceNumber: "", reference: "" });
  const [recipient, setRecipient] = useState(null);     // { accountId, name, status }
  const [verifying, setVerifying] = useState(false);
  const [verifyErr, setVerifyErr] = useState(null);
  const [idemKey, setIdemKey] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult]   = useState(null);
  const [error, setError]     = useState(null);
  const [document, setDocument] = useState(null);   // analysis returned by /documents/analyze

  const kindCfg = KINDS.find(k => k.key === kind);
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target?.value ?? e }));

  const balanceTick = step === 3 ? result?.transactionId ?? null : null;
  useEffect(() => { api.get("/balance").then(r => setBalance(r.data)).catch(() => {}); }, [balanceTick]);
  useEffect(() => {
    if (kind === "BILL_PAYMENT" || kind === "MERCHANT_PAYMENT") {
      api.get(`/payees?kind=${kind === "BILL_PAYMENT" ? "BILLER" : "MERCHANT"}`).then(r => setPayees(r.data.payees || [])).catch(() => setPayees([]));
    }
  }, [kind]);

  const payee = useMemo(() => payees.find(p => p.code === form.payeeCode), [payees, form.payeeCode]);
  const amount = Number(form.amount);
  const amountOk = Number.isFinite(amount) && amount > 0;
  const afterBalance = balance ? balance.balance - amount : null;

  const choose = (k) => { setKind(k); setForm({ amount: "", destinationAccountId: "", payeeCode: "", referenceNumber: "", reference: "" }); setRecipient(null); setVerifyErr(null); setError(null); setResult(null); setDocument(null); setStep(1); };

  const verifyRecipient = async () => {
    const id = form.destinationAccountId.trim();
    setVerifyErr(null); setRecipient(null);
    if (!isUuid(id)) { setVerifyErr("Enter the recipient's full account id (UUID)."); return; }
    if (balance && id === balance.accountNumber) { setVerifyErr("That is your own account."); return; }
    setVerifying(true);
    try { const { data } = await api.get(`/accounts/verify/${id}`); setRecipient(data); }
    catch (e) { setVerifyErr(e.response?.status === 404 ? "No account with this id." : errorMessage(e)); }
    finally { setVerifying(false); }
  };

  const detailsValid = () => {
    if (!amountOk) return "Enter an amount greater than zero.";
    if (kind === "TRANSFER" && !recipient) return "Verify the recipient first.";
    if ((kind === "BILL_PAYMENT" || kind === "MERCHANT_PAYMENT") && !payee) return "Choose a payee.";
    if (kind === "BILL_PAYMENT" && !form.referenceNumber.trim()) return "Enter the reference number printed on your bill.";
    if (balance && amount > balance.balance) return "Amount exceeds your available balance.";
    return null;
  };

  const goReview = () => { const v = detailsValid(); if (v) { setError(v); return; } setError(null); setIdemKey(newKey()); setStep(2); };

  const submit = async () => {
    setSubmitting(true); setError(null);
    const body = { kind, amount: amount.toFixed(4) };
    if (kind === "TRANSFER") { body.destinationAccountId = recipient.accountId; body.reference = form.reference || undefined; }
    if (kind === "BILL_PAYMENT" || kind === "MERCHANT_PAYMENT") { body.payeeCode = payee.code; body.referenceNumber = form.referenceNumber || undefined; body.reference = form.reference || undefined; }
    if (kind === "WITHDRAW") body.note = form.reference || undefined;
    if (document?.documentId) body.documentId = document.documentId;
    try {
      const { data } = await api.post("/transactions", body, { headers: { "Idempotency-Key": idemKey } });
      setResult(data.data); setStep(3);
    } catch (e) {
      setError(errorMessage(e));
    } finally { setSubmitting(false); }
  };

  const reset = () => { setKind(null); setRecipient(null); setResult(null); setError(null); setStep(0); };

  return (
    <div className="fade-in" style={{ maxWidth: 760, margin: "0 auto" }}>
      <Stepper steps={STEPS} current={step} />

      {step === 0 && (
        <div className="grid cols-2">
          {KINDS.map(k => (
            <button key={k.key} className="kind-card" onClick={() => choose(k.key)}>
              <div className="kind-ico" style={{ background: k.grad }}><Icon name={k.icon} size={22} /></div>
              <div><b>{k.title}</b><span>{k.sub}</span></div>
            </button>
          ))}
        </div>
      )}

      {step === 1 && kindCfg && (
        <Card>
          <div className="row" style={{ marginBottom: 20, paddingBottom: 16, borderBottom: "1px solid var(--cream-200)" }}>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <div className="kind-ico" style={{ width: 42, height: 42, borderRadius: 12, display: "grid", placeItems: "center", color: "#fff", background: kindCfg.grad }}><Icon name={kindCfg.icon} size={20} /></div>
              <div><div style={{ fontWeight: 700, fontSize: 16 }}>{kindCfg.title}</div><div className="small muted">{kindCfg.sub}</div></div>
            </div>
            {balance && <div style={{ textAlign: "right" }}><div className="eyebrow">Available</div><div className="num" style={{ fontWeight: 700 }}>{fmtMoney(balance.balance)} {balance.currency}</div></div>}
          </div>

          <div style={{ display: "grid", gap: 18 }}>
            {kind === "TRANSFER" && (
              <Field label="Recipient account id" error={verifyErr} hint={recipient ? null : "Paste the recipient's account id, then verify."}>
                <div style={{ display: "flex", gap: 8 }}>
                  <input className={`input mono ${verifyErr ? "invalid" : ""}`} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" value={form.destinationAccountId}
                         onChange={(e) => { set("destinationAccountId")(e); setRecipient(null); }} onKeyDown={(e) => e.key === "Enter" && verifyRecipient()} />
                  <Button variant="ghost" onClick={verifyRecipient} loading={verifying}><Icon name="search" size={15} /> Verify</Button>
                </div>
                {recipient && (
                  <div className="alert success" style={{ marginTop: 8 }}>
                    <Icon name="check" size={16} />
                    <div><b>{recipient.name}</b> · {recipient.currency} · <Pill tone={recipient.status === "ACTIVE" ? "green" : "red"}>{recipient.status}</Pill></div>
                  </div>
                )}
              </Field>
            )}

            {(kind === "BILL_PAYMENT" || kind === "MERCHANT_PAYMENT") && (
              <>
                <Field label={kind === "BILL_PAYMENT" ? "Biller" : "Merchant"}>
                  <select className="select" value={form.payeeCode} onChange={set("payeeCode")}>
                    <option value="">Select…</option>
                    {[...new Set(payees.map(p => p.category))].map(cat => (
                      <optgroup key={cat} label={cat}>
                        {payees.filter(p => p.category === cat).map(p => <option key={p.code} value={p.code}>{p.name}</option>)}
                      </optgroup>
                    ))}
                  </select>
                </Field>
                <Field label={kind === "BILL_PAYMENT" ? "Reference number" : "Receipt / order number (optional)"} hint={payee?.referenceHint}>
                  <input className="input mono" value={form.referenceNumber} onChange={set("referenceNumber")} placeholder={payee?.referenceHint || "Reference"} maxLength={64} />
                </Field>
              </>
            )}

            <Field label="Amount">
              <div className="amount-input">
                <input className="input num" type="number" min="0.001" step="0.001" inputMode="decimal" placeholder="0.000" value={form.amount} onChange={set("amount")} />
                <span className="cur">TND</span>
              </div>
              <div className="chips" style={{ marginTop: 8 }}>
                {QUICK.map(q => <button key={q} className={`chip ${Number(form.amount) === q ? "on" : ""}`} onClick={() => setForm(f => ({ ...f, amount: String(q) }))}>{q} TND</button>)}
                {balance && <button className="chip" onClick={() => setForm(f => ({ ...f, amount: String(balance.balance) }))}>Max</button>}
              </div>
            </Field>

            <Field label={kind === "WITHDRAW" ? "Note (optional)" : "Message to recipient (optional)"}>
              <input className="input" value={form.reference} onChange={set("reference")} maxLength={100} placeholder={kind === "WITHDRAW" ? "e.g. Counter withdrawal" : "e.g. Rent — October"} />
            </Field>

            <DocumentUpload amount={amount} analysis={document} onAnalysed={setDocument} onCleared={() => setDocument(null)} />

            {error && <Alert tone="error">{error}</Alert>}
          </div>

          <div className="row" style={{ marginTop: 24 }}>
            <Button variant="ghost" onClick={reset}><Icon name="chevronL" size={16} /> Back</Button>
            <Button onClick={goReview}>Review <Icon name="chevronR" size={16} /></Button>
          </div>
        </Card>
      )}

      {step === 2 && kindCfg && (
        <Card>
          <div style={{ textAlign: "center", marginBottom: 20 }}>
            <div className="eyebrow">Review</div>
            <div className="display" style={{ fontSize: 22, marginTop: 4 }}>Confirm your {kindCfg.title.toLowerCase()}</div>
          </div>
          <div className="receipt">
            <KV k="Type" v={KIND_LABEL[kind]} />
            {kind === "TRANSFER" && <KV k="To" v={<>{recipient?.name}<div className="mono muted" style={{ fontWeight: 400 }}>{recipient?.accountId}</div></>} />}
            {payee && <KV k={kind === "BILL_PAYMENT" ? "Biller" : "Merchant"} v={payee.name} />}
            {form.referenceNumber && <KV k="Reference number" v={form.referenceNumber} mono />}
            {form.reference && <KV k="Message" v={form.reference} />}
            {document && <KV k="Document" v={<><Pill tone={document.status === "CLEAN" ? "green" : document.status === "REVIEW" ? "amber" : "red"}>{document.status}</Pill> <span className="mono muted" style={{ fontWeight: 400 }}>{document.documentId.slice(0, 8)}…</span></>} />}
            <KV k="Amount" v={<span className="num" style={{ fontSize: 18 }}>{fmtMoney(amount)} TND</span>} />
            <KV k="Fees" v="0.000 TND" />
            {afterBalance !== null && <KV k="Balance after" v={<span className="num">{fmtMoney(afterBalance)} TND</span>} />}
          </div>
          <div className="alert info" style={{ marginTop: 14 }}><Icon name="shield" size={16} /><div>Protected by an idempotency key <span className="mono">{idemKey?.slice(0, 8)}…</span>. If the network drops, retrying will never charge you twice.</div></div>
          {error && <div style={{ marginTop: 12 }}><Alert tone="error">{error}</Alert></div>}
          <div className="row" style={{ marginTop: 22 }}>
            <Button variant="ghost" onClick={() => setStep(1)} disabled={submitting}><Icon name="chevronL" size={16} /> Edit</Button>
            <Button variant="gold" onClick={submit} loading={submitting}><Icon name="lock" size={15} /> Confirm {fmtMoney(amount)} TND</Button>
          </div>
        </Card>
      )}

      {step === 3 && result?.held && (
        <Card className="fade-in" style={{ textAlign: "center" }}>
          <div className="success-ring" style={{ background: "var(--amber-100)", color: "var(--amber-600)" }}><Icon name="shield" size={32} /></div>
          <div className="display" style={{ fontSize: 24 }}>Under review</div>
          <p className="muted" style={{ margin: "6px 0 20px", maxWidth: 520, marginInline: "auto" }}>
            Your {KIND_LABEL[result.kind]?.toLowerCase()} of <b className="num" style={{ color: "var(--ink-900)" }}>{fmtMoney(result.amount)} {result.currency}</b> was not executed.
            The attached document needs manual verification by the bank. No money has left your account.
          </p>
          <div className="receipt" style={{ textAlign: "left", maxWidth: 480, margin: "0 auto" }}>
            <KV k="Hold reference" v={result.holdId} mono />
            <KV k="Reason" v={result.reason} />
            <KV k="Document" v={<><Pill tone="red">{result.documentStatus}</Pill> <span className="mono muted" style={{ fontWeight: 400 }}>{result.documentId?.slice(0, 8)}…</span></>} />
            <KV k="Date" v={new Date(result.timestamp).toLocaleString("en-GB")} />
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 22 }}>
            <Button variant="ghost" onClick={() => onDone?.("overview")}><Icon name="home" size={15} /> Back to overview</Button>
            <Button onClick={reset}><Icon name="plus" size={15} /> New transaction</Button>
          </div>
        </Card>
      )}

      {step === 3 && result && !result.held && (
        <Card className="fade-in" style={{ textAlign: "center" }}>
          <div className="success-ring"><Icon name="check" size={32} stroke={3} /></div>
          <div className="display" style={{ fontSize: 24 }}>{result.replayed ? "Already processed" : "Transaction complete"}</div>
          <p className="muted" style={{ margin: "6px 0 20px" }}>
            {KIND_LABEL[result.kind]} of <b className="num" style={{ color: "var(--ink-900)" }}>{fmtMoney(result.amount)} {result.currency}</b>
            {result.counterparty?.name ? <> to <b style={{ color: "var(--ink-900)" }}>{result.counterparty.name}</b></> : null}
          </p>
          <div className="receipt" style={{ textAlign: "left", maxWidth: 480, margin: "0 auto" }}>
            <KV k="Transaction id" v={result.transactionId} mono />
            <KV k="Date" v={new Date(result.timestamp).toLocaleString("en-GB")} />
            {result.reference && <KV k="Reference" v={result.reference} />}
            {result.documentId && <KV k="Document" v={result.documentId} mono />}
            <KV k="New balance" v={<span className="num">{fmtMoney(result.newBalance)} {result.currency}</span>} />
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 22 }}>
            <Button variant="ghost" onClick={() => onDone?.("history")}><Icon name="clock" size={15} /> View history</Button>
            <Button onClick={reset}><Icon name="plus" size={15} /> New transaction</Button>
          </div>
        </Card>
      )}
    </div>
  );
}
