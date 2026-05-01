# BB84 Circuit Visualizations (FR-15)

These PNGs are produced live by `quantum-service` via:

```
GET /qkd/visualize?n_qubits=N&with_eve=true|false
```

The endpoint clamps `n_qubits` to **16** server-side (resource guard).
Renderer: `qiskit.QuantumCircuit.draw(output="mpl", style="iqp")` with
matplotlib's headless **Agg** backend, dpi=110, tight bounding box.

## Files

| File | n_qubits | Eve | Notes |
|---|---|---|---|
| `bb84_circuit_no_eve.png` | 4 | ❌ | Honest channel: Alice → Bob |
| `bb84_circuit_with_eve.png` | 4 | ✅ | Intercept-resend attack visualized |
| `bb84_circuit_no_eve_8q.png` | 8 | ❌ | Same protocol, more qubits |
| `bb84_circuit_with_eve_8q.png` | 8 | ✅ | Same with Eve, more qubits |

## What you're looking at

The circuit is grouped by **barriers** with labels:

1. **`Alice prep`** — `X` gates encode bit=1 in the rectilinear basis;
   `H` gates encode the diagonal basis. Together these prepare the
   four BB84 states |0⟩, |1⟩, |+⟩, |−⟩.

2. **`Eve`** *(only in with-eve images)* — `H` to switch into Eve's
   randomly chosen basis, an intermediate **measurement** (which
   irreversibly collapses the state), then `H` to attempt to undo —
   this is exactly where information leaks.

3. **`Bob measure`** — `H` to switch to Bob's randomly chosen basis,
   followed by the final measurement Bob will publicly compare bases
   over.

After the run, sifting keeps positions where Alice's basis ==
Bob's basis. With Eve present, ~25% of those sifted bits will
disagree (textbook intercept-resend QBER) — and on real IBM Heron-r2
hardware we measured up to **0.50 QBER** with Eve vs **0.00 without**
(see CHANGELOG Phase 3.5).

## Reproduce

```powershell
docker compose -f infrastructure/docker-compose.yml up -d quantum-service
curl http://localhost:3005/qkd/visualize?n_qubits=4               -o no_eve.png
curl http://localhost:3005/qkd/visualize?n_qubits=4&with_eve=true -o with_eve.png
```
