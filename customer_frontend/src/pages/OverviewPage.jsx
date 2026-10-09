// Overview — balance hero, quick actions, recent activity, account details.
import { useEffect, useState } from "react";
import api from "../lib/api";
import { Button, Card, Alert, Spinner, Empty, Icon, Pill, KV } from "../components/ui";
import { fmtMoney, fmtDate, fmtTime, errorMessage, KIND_LABEL } from "../lib/format";

const ACTIONS = [
  { kind: "TRANSFER",         icon: "send", label: "Transfer" },
  { kind: "BILL_PAYMENT",     icon: "bolt", label: "Pay a bill" },
  { kind: "MERCHANT_PAYMENT", icon: "cart", label: "Pay a merchant" },
  { kind: "WITHDRAW",         icon: "cash", label: "Withdraw" },
];

export default function OverviewPage({ onAction, onNavigate, user }) {
  const [balance, setBalance] = useState(null);
  const [recent, setRecent]   = useState(null);
  const [error, setError]     = useState(null);
  const [copied, setCopied]   = useState(false);

  const load = async () => {
    try {
      const [b, t] = await Promise.all([api.get("/balance"), api.get("/transactions?limit=6")]);
      setBalance(b.data); setRecent(t.data.transactions || []); setError(null);
    } catch (e) { setError(errorMessage(e)); }
  };
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, []);

  const copy = async () => { try { await navigator.clipboard.writeText(balance.accountNumber); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ } };

  if (error) return <Alert tone="error">{error} <Button variant="link" size="sm" onClick={load}>Retry</Button></Alert>;
  if (!balance) return <Spinner lg label="Loading your account…" />;

  return (
    <div className="fade-in" style={{ display: "grid", gap: 18 }}>
      <div className="grid cols-3">
        <Card className="hero" style={{ gridColumn: "span 2" }}>
          <div className="eyebrow">Available balance</div>
          <div className="amount num">{fmtMoney(balance.balance)}<small>{balance.currency}</small></div>
          <div className="meta">Hello {user?.name?.split(" ")[0] || user?.username}, your account is <Pill tone={balance.status === "ACTIVE" ? "green" : "red"}>{balance.status}</Pill></div>
          <div style={{ display: "flex", gap: 8, marginTop: 22, flexWrap: "wrap" }}>
            {ACTIONS.map(a => (
              <button key={a.kind} className="btn btn-sm" style={{ background: "rgba(255,255,255,.1)", color: "#fff", border: "1px solid rgba(255,255,255,.15)" }} onClick={() => onAction(a.kind)}>
                <Icon name={a.icon} size={15} /> {a.label}
              </button>
            ))}
          </div>
        </Card>
        <Card>
          <div className="card-title">Account</div>
          <KV k="Holder" v={user?.name || user?.username} />
          <KV k="Currency" v={balance.currency} />
          <KV k="Pending" v={<span className="num">{fmtMoney(balance.pending)}</span>} />
          <div style={{ marginTop: 12 }}>
            <div className="eyebrow" style={{ marginBottom: 6 }}>Account id</div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <code className="mono" style={{ fontSize: 11.5, wordBreak: "break-all", color: "var(--ink-700)" }}>{balance.accountNumber}</code>
              <Button variant="ghost" size="sm" onClick={copy} title="Copy"><Icon name={copied ? "check" : "copy"} size={14} /></Button>
            </div>
            <div className="hint" style={{ marginTop: 6 }}>Share this id to receive transfers.</div>
          </div>
        </Card>
      </div>

      <Card>
        <div className="row" style={{ marginBottom: 6 }}>
          <div className="card-title" style={{ marginBottom: 0 }}>Recent activity</div>
          <Button variant="link" size="sm" onClick={() => onNavigate("history")}>See all <Icon name="chevronR" size={14} /></Button>
        </div>
        {recent === null ? <Spinner /> : recent.length === 0 ? (
          <Empty title="No transactions yet" hint="Your deposits, transfers and payments will show up here." action={<Button size="sm" onClick={() => onAction("TRANSFER")}><Icon name="send" size={14} /> Make a transfer</Button>} />
        ) : recent.map(tx => {
          const inFlow = tx.type === "CREDIT";
          return (
            <div key={tx.id} className="tx-row" style={{ cursor: "pointer" }} onClick={() => onNavigate(`detail:${tx.id}`)}>
              <div className={`tx-ico ${inFlow ? "in" : "out"}`}><Icon name={inFlow ? "arrowDn" : "arrowUp"} size={18} /></div>
              <div>
                <div className="tx-title">{tx.reference || KIND_LABEL[tx.txType] || tx.txType}</div>
                <div className="tx-sub">{KIND_LABEL[tx.txType] || tx.txType} · {fmtDate(tx.createdAt)} {fmtTime(tx.createdAt)}</div>
              </div>
              <div className={`tx-amt num ${inFlow ? "in" : "out"}`}>{inFlow ? "+" : "−"}{fmtMoney(tx.amount)}</div>
            </div>
          );
        })}
      </Card>
    </div>
  );
}
