"""Circuit visualization (FR-15) — render a small BB84-style circuit as PNG."""
import io
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from qiskit import QuantumCircuit


def bb84_circuit_png(n_qubits: int, with_eve: bool = False) -> bytes:
    qc = QuantumCircuit(n_qubits, n_qubits)
    qc.barrier(label="Alice prep")
    for i in range(n_qubits):
        if i % 2 == 0:
            qc.x(i)
        if i % 3 == 0:
            qc.h(i)

    if with_eve:
        qc.barrier(label="Eve")
        for i in range(n_qubits):
            if i % 2 == 1:
                qc.h(i)
        qc.measure(range(n_qubits), range(n_qubits))
        for i in range(n_qubits):
            if i % 2 == 1:
                qc.h(i)

    qc.barrier(label="Bob measure")
    for i in range(n_qubits):
        if i % 2 == 0:
            qc.h(i)
    qc.measure(range(n_qubits), range(n_qubits))

    fig = qc.draw(output="mpl", style="iqp")
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=110, bbox_inches="tight")
    plt.close(fig)
    return buf.getvalue()
