// src/components/ui/InputField.jsx
// Reusable input — use across Login, Register, and any other form

export default function InputField({ label, type = "text", placeholder, value, onChange }) {
  return (
    <div style={styles.wrapper}>
      <label style={styles.label}>{label}</label>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        style={styles.input}
      />
    </div>
  );
}

const styles = {
  wrapper: { display: "flex", flexDirection: "column", gap: 8 },
  label:   { color: "rgba(255,255,255,0.75)", fontSize: 14, fontFamily: "inherit" },
  input: {
    padding: "14px 16px",
    borderRadius: 8,
    border: "1px solid rgba(255,255,255,0.2)",
    background: "rgba(0,0,0,0.35)",
    color: "#fff",
    fontSize: 15,
    outline: "none",
    fontFamily: "inherit",
    transition: "border-color 0.2s",
  },
};