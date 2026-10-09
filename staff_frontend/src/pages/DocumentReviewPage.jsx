// Staff — Document review (CV extension): held transactions, document analysis,
// decrypted image preview, release / reject, all documents, signature enrolment.
import { useCallback, useEffect, useRef, useState } from "react";
import api from "../lib/api";
import { Button, Card, Alert, Spinner, Empty, Icon, Pill, KV, Field } from "../components/ui";

const fmt = (n) => (Number(n) || 0).toLocaleString("fr-TN", { minimumFractionDigits: 3 });
const fmtDate = (s) => s ? new Date(s).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
const TONE = { CLEAN: "green", REVIEW: "amber", SUSPICIOUS: "red", PENDING_REVIEW: "amber", RELEASED: "green", REJECTED: "red" };
const errMsg = (e) => e.response?.data?.message ?? e.response?.data?.error ?? e.message;

function useImage(documentId) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let revoke = null;
    if (!documentId) return undefined;
    api.get(`/documents/${documentId}/image`, { responseType: "blob" })
      .then(r => { revoke = URL.createObjectURL(r.data); setUrl(revoke); })
      .catch(() => setUrl(null));
    return () => { if (revoke) URL.revokeObjectURL(revoke); };
  }, [documentId]);
  return url;
}

function Bar({ label, value, invert }) {
  const v = Math.max(0, Math.min(1, Number(value) || 0));
  const bad = invert ? v < 0.5 : v > 0.5;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "150px 1fr 48px", gap: 10, alignItems: "center", fontSize: 12.5 }}>
      <span className="muted">{label}</span>
      <div style={{ height: 8, background: "var(--cream-200)", borderRadius: 4, overflow: "hidden" }}>
        <div style={{ width: `${v * 100}%`, height: "100%", background: bad ? "var(--red-500)" : "var(--green-500)", transition: "width .3s" }} />
      </div>
      <span className="num" style={{ textAlign: "right" }}>{(v * 100).toFixed(0)} %</span>
    </div>
  );
}

function DocumentPanel({ documentId }) {
  const [doc, setDoc] = useState(null);
  const [err, setErr] = useState(null);
  const img = useImage(documentId);
  useEffect(() => { api.get(`/documents/${documentId}`).then(r => setDoc(r.data)).catch(e => setErr(errMsg(e))); }, [documentId]);
  if (err) return <Alert tone="error">{err}</Alert>;
  if (!doc) return <Spinner label="Loading analysis…" />;
  const f = doc.features || {};
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(260px, 420px) 1fr", gap: 20 }}>
      <div>
        {img ? <img src={img} alt="document" style={{ width: "100%", borderRadius: 10, border: "1px solid var(--cream-300)" }} /> : <div className="skeleton" style={{ height: 220 }} />}
        <div className="hint" style={{ marginTop: 6 }}>Decrypted on demand · key source {doc.keySource} · sha256 {doc.sha256?.slice(0, 12)}…</div>
      </div>
      <div style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <Pill tone={TONE[doc.status]}>{doc.status}</Pill>
          <b className="num">risk {Number(doc.riskScore).toFixed(3)}</b>
          {doc.requiresReview && <Pill tone="amber">needs review</Pill>}
          {doc.duplicateOf && <Pill tone="red">duplicate of {doc.duplicateOf.slice(0, 8)}…</Pill>}
        </div>
        {doc.reasons?.length > 0 && <div className="small" style={{ color: "var(--red-600)" }}>{doc.reasons.join(" · ")}</div>}
        <div className="receipt">
          <div className="card-title" style={{ marginBottom: 8 }}>OCR {doc.ocr?.available ? "" : "(unavailable)"}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
            <KV k="Amount" v={doc.ocr?.fields?.amount != null ? `${fmt(doc.ocr.fields.amount)} ${doc.ocr.fields.currency || ""}` : "—"} />
            <KV k="Declared" v={doc.expectedAmount != null ? `${fmt(doc.expectedAmount)} ${doc.expectedCurrency || "TND"}` : "—"} />
            <KV k="Date" v={doc.ocr?.fields?.date || "—"} />
            <KV k="Payee" v={doc.ocr?.fields?.payee || "—"} />
            <KV k="Document no." v={doc.ocr?.fields?.document_number || "—"} />
            <KV k="Bank" v={doc.ocr?.fields?.bank || "—"} />
          </div>
        </div>
        <div className="receipt" style={{ display: "grid", gap: 8 }}>
          <div className="card-title" style={{ marginBottom: 2 }}>Signals</div>
          <Bar label="Tampering" value={f.tampering_score} />
          <Bar label="ELA" value={doc.integrity?.ela_score} />
          <Bar label="Noise inconsistency" value={doc.integrity?.noise_inconsistency} />
          <Bar label="Copy-move" value={doc.integrity?.copy_move} />
          <Bar label="Layout consistency" value={f.layout_consistency} invert />
          <Bar label="Image quality" value={f.document_quality} invert />
          <Bar label="OCR confidence" value={f.ocr_confidence} invert />
          <Bar label="Signature match" value={f.signature_similarity} invert />
          <div className="small muted">amount match {f.amount_match} · date validity {f.date_validity} · duplicate {f.duplicate_score} · {doc.signature?.compared ? "signature compared with enrolled reference" : "no reference signature enrolled"}</div>
        </div>
      </div>
    </div>
  );
}

function HoldsView() {
  const [holds, setHolds] = useState(null);
  const [status, setStatus] = useState("PENDING_REVIEW");
  const [open, setOpen] = useState(null);
  const [busy, setBusy] = useState(null);
  const [note, setNote] = useState("");
  const [toast, setToast] = useState(null);
  const load = useCallback(async () => {
    try { const r = await api.get(`/admin/holds?status=${status}`); setHolds(r.data.holds || []); }
    catch (e) { setToast({ kind: "err", msg: errMsg(e) }); setHolds([]); }
  }, [status]);
  useEffect(() => { load(); }, [load]);

  const decide = async (id, action) => {
    if (!window.confirm(action === "release" ? "Release this transaction? It will be executed now." : "Reject this transaction? The customer keeps the funds.")) return;
    setBusy(id);
    try {
      const r = await api.post(`/admin/holds/${id}/${action}`, { note });
      setToast({ kind: "ok", msg: action === "release" ? `Released · transaction ${r.data.transaction?.transactionId?.slice(0, 8)}…` : "Rejected" });
      setOpen(null); setNote(""); await load();
    } catch (e) { setToast({ kind: "err", msg: `${action} failed: ${errMsg(e)}` }); }
    finally { setBusy(null); setTimeout(() => setToast(null), 6000); }
  };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div className="row">
        <div className="small muted">{holds ? `${holds.length} hold${holds.length === 1 ? "" : "s"}` : ""}</div>
        <div style={{ display: "flex", gap: 8 }}>
          <select className="select" style={{ width: "auto" }} value={status} onChange={e => setStatus(e.target.value)}>
            <option value="PENDING_REVIEW">Pending review</option><option value="RELEASED">Released</option><option value="REJECTED">Rejected</option><option value="all">All</option>
          </select>
          <Button variant="ghost" size="sm" onClick={load}><Icon name="refresh" size={14} /> Refresh</Button>
        </div>
      </div>
      {toast && <Alert tone={toast.kind === "ok" ? "success" : "error"}>{toast.msg}</Alert>}
      {holds === null ? <Spinner /> : holds.length === 0 ? <Empty icon="shield" title="No held transactions" hint="Suspicious documents park the transaction here for manual verification." /> : holds.map(h => (
        <Card key={h.id} pad={false}>
          <div style={{ display: "grid", gridTemplateColumns: "110px 1fr 1fr 130px 150px auto", gap: 14, alignItems: "center", padding: "14px 18px", cursor: "pointer" }} onClick={() => setOpen(open === h.id ? null : h.id)}>
            <Pill tone={TONE[h.status] || "gray"}>{h.status.replace("_", " ")}</Pill>
            <div><div style={{ fontWeight: 600 }}>{h.kind.replace("_", " ")} · {fmt(h.request?.amount)} TND</div><div className="small muted mono">hold {h.id.slice(0, 8)}… · customer {h.user_id}</div></div>
            <div className="small">{h.reason}</div>
            <div>{h.document_status && <Pill tone={TONE[h.document_status]}>{h.document_status}</Pill>}</div>
            <div className="small muted">{fmtDate(h.created_at)}</div>
            <Icon name={open === h.id ? "chevronL" : "chevronR"} size={16} />
          </div>
          {open === h.id && (
            <div style={{ borderTop: "1px solid var(--cream-200)", padding: 18, display: "grid", gap: 16 }}>
              <div className="receipt">
                <div className="card-title" style={{ marginBottom: 6 }}>Parked request</div>
                <pre className="mono" style={{ margin: 0, whiteSpace: "pre-wrap", fontSize: 11.5 }}>{JSON.stringify(h.request, null, 2)}</pre>
              </div>
              {h.document_id && <DocumentPanel documentId={h.document_id} />}
              {h.status === "PENDING_REVIEW" ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 10, alignItems: "end" }}>
                  <Field label="Decision note"><input className="input" value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Verified with the customer by phone" maxLength={300} /></Field>
                  <Button variant="danger" onClick={() => decide(h.id, "reject")} loading={busy === h.id}><Icon name="x" size={15} /> Reject</Button>
                  <Button variant="gold" onClick={() => decide(h.id, "release")} loading={busy === h.id}><Icon name="check" size={15} /> Release &amp; execute</Button>
                </div>
              ) : (
                <div className="small muted">Decided {fmtDate(h.decided_at)} by <span className="mono">{h.decided_by}</span>{h.decision_note ? ` — ${h.decision_note}` : ""}{h.transaction_id ? ` · transaction ${h.transaction_id}` : ""}</div>
              )}
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

function DocumentsView() {
  const [docs, setDocs] = useState(null);
  const [status, setStatus] = useState("");
  const [open, setOpen] = useState(null);
  const load = useCallback(async () => {
    try { const r = await api.get(`/documents?limit=100${status ? `&status=${status}` : ""}`); setDocs(r.data.documents || []); } catch { setDocs([]); }
  }, [status]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div className="row">
        <div className="small muted">{docs ? `${docs.length} documents` : ""}</div>
        <div style={{ display: "flex", gap: 8 }}>
          <select className="select" style={{ width: "auto" }} value={status} onChange={e => setStatus(e.target.value)}>
            <option value="">All statuses</option><option value="CLEAN">Clean</option><option value="REVIEW">Review</option><option value="SUSPICIOUS">Suspicious</option>
          </select>
          <Button variant="ghost" size="sm" onClick={load}><Icon name="refresh" size={14} /> Refresh</Button>
        </div>
      </div>
      {docs === null ? <Spinner /> : docs.length === 0 ? <Empty icon="receipt" title="No documents analysed yet" /> : docs.map(d => (
        <Card key={d.documentId} pad={false}>
          <div style={{ display: "grid", gridTemplateColumns: "100px 1fr 1fr 90px 150px auto", gap: 14, alignItems: "center", padding: "12px 18px", cursor: "pointer" }} onClick={() => setOpen(open === d.documentId ? null : d.documentId)}>
            <Pill tone={TONE[d.status]}>{d.status}</Pill>
            <div className="mono small">{d.documentId}</div>
            <div className="small">{(d.reasons || []).join(" · ") || "—"}</div>
            <div className="num">{Number(d.riskScore).toFixed(2)}</div>
            <div className="small muted">{fmtDate(d.createdAt)}{d.transactionId ? " · linked" : ""}</div>
            <Icon name={open === d.documentId ? "chevronL" : "chevronR"} size={16} />
          </div>
          {open === d.documentId && <div style={{ borderTop: "1px solid var(--cream-200)", padding: 18 }}><DocumentPanel documentId={d.documentId} /></div>}
        </Card>
      ))}
    </div>
  );
}

function SignatureView() {
  const [userId, setUserId] = useState("");
  const [file, setFile] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);
  const enrol = async () => {
    if (!userId || !file) { setMsg({ kind: "err", text: "User id and an image are required." }); return; }
    setBusy(true); setMsg(null);
    try {
      const fd = new FormData(); fd.append("file", file);
      const r = await api.post(`/documents/signatures/${userId.trim()}`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      setMsg({ kind: "ok", text: `Reference signature enrolled for ${r.data.userId}${r.data.bbox ? " (signature region detected)" : " (whole image used)"}.` });
      setFile(null); if (ref.current) ref.current.value = "";
    } catch (e) { setMsg({ kind: "err", text: errMsg(e) }); }
    finally { setBusy(false); }
  };
  return (
    <Card style={{ maxWidth: 640 }}>
      <div className="card-title">Enrol a reference signature</div>
      <p className="small muted" style={{ marginTop: 0 }}>Upload a scanned signature card or a check signed by the customer. Future documents from this customer are compared against it (experimental heuristic).</p>
      <div style={{ display: "grid", gap: 12 }}>
        <Field label="Customer user id"><input className="input mono" value={userId} onChange={e => setUserId(e.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" /></Field>
        <Field label="Signature image (JPEG / PNG)"><input ref={ref} type="file" accept="image/jpeg,image/png" onChange={e => setFile(e.target.files?.[0] || null)} /></Field>
        {msg && <Alert tone={msg.kind === "ok" ? "success" : "error"}>{msg.text}</Alert>}
        <div><Button onClick={enrol} loading={busy}><Icon name="lock" size={15} /> Enrol signature</Button></div>
      </div>
    </Card>
  );
}

export default function DocumentReviewPage({ view = "holds" }) {
  if (view === "documents") return <DocumentsView />;
  if (view === "signatures") return <SignatureView />;
  return <HoldsView />;
}
