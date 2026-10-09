// Optional supporting-document step of the New Transaction wizard (CV extension).
// Uploads the image to /documents/analyze with the declared amount, shows the
// analysis (status, risk, OCR fields, integrity signals) and hands the
// documentId back to the wizard. Changing the amount invalidates the analysis
// because the backend checks that the document was analysed for that amount.
import { useEffect, useRef, useState } from "react";
import api from "../lib/api";
import { Button, Alert, Icon, Pill, KV } from "./ui";
import { fmtMoney, errorMessage } from "../lib/format";

const STATUS_TONE = { CLEAN: "green", REVIEW: "amber", SUSPICIOUS: "red" };
const REASON_COPY = {
  tampering_signals: "Signs of image manipulation", amount_mismatch: "Amount on the document differs from the amount entered",
  duplicate_document: "This document was already used", invalid_date: "Date is post-dated or too old", layout_anomaly: "Unusual layout",
  low_quality: "Low image quality", ocr_unavailable: "Text could not be read", currency_mismatch: "Currency differs",
};
const MAX_MB = 10;

export default function DocumentUpload({ amount, analysis, onAnalysed, onCleared }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  // Amount changed after analysis → the documentId is no longer valid for this request.
  useEffect(() => {
    if (analysis && Number(analysis.expectedAmount) !== Number(amount)) onCleared?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount]);

  const pick = (f) => {
    setError(null);
    if (!f) return;
    if (!/^image\/(jpeg|png)$/.test(f.type)) { setError("Only JPEG or PNG images are accepted."); return; }
    if (f.size > MAX_MB * 1024 * 1024) { setError(`File is larger than ${MAX_MB} MB.`); return; }
    setFile(f); setPreview(URL.createObjectURL(f)); onCleared?.();
  };

  const analyse = async () => {
    if (!file) return;
    if (!(Number(amount) > 0)) { setError("Enter the amount first so the document can be checked against it."); return; }
    setBusy(true); setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file); fd.append("expectedAmount", Number(amount).toFixed(4)); fd.append("expectedCurrency", "TND"); fd.append("kind", "CHECK");
      const { data } = await api.post("/documents/analyze", fd, { headers: { "Content-Type": "multipart/form-data" }, timeout: 60000 });
      onAnalysed?.(data);
    } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  };

  const clear = () => { setFile(null); setPreview(null); setError(null); onCleared?.(); if (inputRef.current) inputRef.current.value = ""; };

  return (
    <div className="field">
      <label>Supporting document (optional)</label>
      <div className="receipt" style={{ display: "grid", gap: 12 }}>
        {!file && (
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <Button variant="ghost" size="sm" onClick={() => inputRef.current?.click()}><Icon name="receipt" size={15} /> Attach a check or receipt</Button>
            <span className="hint">JPEG or PNG, up to {MAX_MB} MB. We read the amount, date and payee and check the image for tampering.</span>
          </div>
        )}
        <input ref={inputRef} type="file" accept="image/jpeg,image/png" style={{ display: "none" }} onChange={(e) => pick(e.target.files?.[0])} />
        {file && (
          <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 14, alignItems: "start" }}>
            <img src={preview} alt="document preview" style={{ width: 160, height: 100, objectFit: "cover", borderRadius: 8, border: "1px solid var(--cream-300)" }} />
            <div style={{ display: "grid", gap: 8 }}>
              <div className="small"><b>{file.name}</b> · {(file.size / 1024).toFixed(0)} kB</div>
              {!analysis && (
                <div style={{ display: "flex", gap: 8 }}>
                  <Button size="sm" onClick={analyse} loading={busy}><Icon name="search" size={14} /> Analyse document</Button>
                  <Button size="sm" variant="ghost" onClick={clear}>Remove</Button>
                </div>
              )}
              {analysis && (
                <div className="fade-in" style={{ display: "grid", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Pill tone={STATUS_TONE[analysis.status] || "gray"}>{analysis.status}</Pill>
                    <span className="small muted">risk {Number(analysis.riskScore).toFixed(2)} · OCR {analysis.ocr?.available ? `${Math.round((analysis.ocr.mean_confidence || 0) * 100)} %` : "unavailable"}</span>
                    <Button size="sm" variant="link" onClick={clear}>Replace</Button>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
                    <KV k="Amount read" v={analysis.ocr?.fields?.amount != null ? `${fmtMoney(analysis.ocr.fields.amount)} ${analysis.ocr.fields.currency || ""}` : "—"} />
                    <KV k="Date read" v={analysis.ocr?.fields?.date || "—"} />
                    <KV k="Payee" v={analysis.ocr?.fields?.payee || "—"} />
                    <KV k="Tampering" v={`${Math.round((analysis.integrity?.tampering_score || 0) * 100)} %`} />
                  </div>
                  {analysis.reasons?.length > 0 && (
                    <Alert tone={analysis.status === "SUSPICIOUS" ? "error" : "warn"}>
                      {analysis.reasons.map(r => REASON_COPY[r] || r).join(" · ")}
                      {analysis.status === "SUSPICIOUS" && <div className="small" style={{ marginTop: 4 }}>This transaction will be placed on hold for manual verification.</div>}
                    </Alert>
                  )}
                  {analysis.status === "CLEAN" && <Alert tone="success">Document verified. It will be attached to this transaction.</Alert>}
                </div>
              )}
            </div>
          </div>
        )}
        {error && <Alert tone="error">{error}</Alert>}
      </div>
    </div>
  );
}
