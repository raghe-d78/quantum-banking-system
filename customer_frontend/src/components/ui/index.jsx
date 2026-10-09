// Small UI primitives built on theme.css classes.
import Icon from "./Icon";

export const Button = ({ variant = "primary", size, block, loading, children, className = "", ...rest }) => (
  <button className={`btn btn-${variant} ${size === "sm" ? "btn-sm" : ""} ${block ? "btn-block" : ""} ${className}`} disabled={loading || rest.disabled} {...rest}>
    {loading ? <span className="spinner" style={{ width: 14, height: 14 }} /> : null}
    {children}
  </button>
);

export const Card = ({ pad = true, hover, className = "", children, ...rest }) => (
  <div className={`card ${pad ? "pad" : ""} ${hover ? "hover" : ""} ${className}`} {...rest}>{children}</div>
);

export const Field = ({ label, hint, error, children }) => (
  <div className="field">
    {label && <label>{label}</label>}
    {children}
    {error ? <span className="hint error">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
  </div>
);

export const Pill = ({ tone = "gray", children }) => <span className={`pill ${tone}`}>{children}</span>;

export const Alert = ({ tone = "info", children }) => (
  <div className={`alert ${tone}`} role={tone === "error" ? "alert" : "status"}>
    <Icon name={tone === "error" ? "alert" : tone === "success" ? "check" : "shield"} size={16} style={{ marginTop: 1, flexShrink: 0 }} />
    <div>{children}</div>
  </div>
);

export const Spinner = ({ label, lg }) => (
  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: 40, color: "var(--ink-400)" }}>
    <div className={`spinner ${lg ? "lg" : ""}`} />
    {label && <span className="small">{label}</span>}
  </div>
);

export const Empty = ({ icon = "receipt", title, hint, action }) => (
  <div className="empty">
    <div className="big"><Icon name={icon} size={34} /></div>
    <div style={{ fontWeight: 600, color: "var(--ink-700)" }}>{title}</div>
    {hint && <div className="small" style={{ marginTop: 4 }}>{hint}</div>}
    {action && <div style={{ marginTop: 14 }}>{action}</div>}
  </div>
);

export const Stepper = ({ steps, current }) => (
  <div className="stepper" aria-label="progress">
    {steps.map((s, i) => (
      <div key={s} style={{ display: "contents" }}>
        <div className={`step ${i < current ? "done" : i === current ? "active" : ""}`}>
          <span className="dot">{i < current ? <Icon name="check" size={13} stroke={3} /> : i + 1}</span>
          <span className="label">{s}</span>
        </div>
        {i < steps.length - 1 && <div className={`step-line ${i < current ? "done" : ""}`} />}
      </div>
    ))}
  </div>
);

export const KV = ({ k, v, mono }) => (
  <div className="kv"><span className="k">{k}</span><span className={`v ${mono ? "mono" : ""}`}>{v}</span></div>
);

export { Icon };
