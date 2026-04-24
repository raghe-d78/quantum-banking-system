"""Quantum circuit visualiser — returns base64-encoded PNG images.

Provides preset circuits: Bell, GHZ, and one round of BB84 encoding.
"""
from __future__ import annotations

import base64
import io
import logging
from typing import Dict

import matplotlib
matplotlib.use("Agg")  # non-interactive backend for server use

from qiskit import QuantumCircuit
from qiskit.visualization import circuit_drawer

logger = logging.getLogger(__name__)


def _bell_circuit() -> QuantumCircuit:
    """2-qubit Bell state: (|00⟩ + |11⟩) / √2."""
    qc = QuantumCircuit(2, 2)
    qc.h(0)
    qc.cx(0, 1)
    qc.measure([0, 1], [0, 1])
    return qc


def _ghz_circuit(n: int = 3) -> QuantumCircuit:
    """n-qubit GHZ state: (|00…0⟩ + |11…1⟩) / √2."""
    qc = QuantumCircuit(n, n)
    qc.h(0)
    for i in range(n - 1):
        qc.cx(i, i + 1)
    qc.measure(range(n), range(n))
    return qc


def _bb84_circuit() -> QuantumCircuit:
    """One round of BB84 encoding (Alice bit=1, basis=X → |−⟩)."""
    qc = QuantumCircuit(1, 1)
    qc.x(0)   # encode bit 1
    qc.h(0)   # basis X
    qc.measure(0, 0)
    return qc


PRESET_CIRCUITS: Dict[str, QuantumCircuit] = {
    "bell": _bell_circuit(),
    "ghz": _ghz_circuit(),
    "bb84": _bb84_circuit(),
}


class CircuitVisualizer:
    """Renders Qiskit circuits to base64-encoded PNG strings."""

    def render(self, circuit_name: str = "bell", fmt: str = "png") -> str:
        """Render *circuit_name* and return a base64 string.

        Args:
            circuit_name: One of ``bell``, ``ghz``, ``bb84``.
            fmt: Output format — only ``png`` is currently supported.

        Returns:
            Base64-encoded PNG data (no data-URI prefix).

        Raises:
            ValueError: If *circuit_name* is not a recognised preset.
        """
        if circuit_name not in PRESET_CIRCUITS:
            raise ValueError(
                f"Unknown circuit '{circuit_name}'. "
                f"Available presets: {list(PRESET_CIRCUITS.keys())}"
            )

        qc = PRESET_CIRCUITS[circuit_name]
        buf = io.BytesIO()

        try:
            fig = circuit_drawer(qc, output="mpl", plot_barriers=False)
            fig.savefig(buf, format="png", bbox_inches="tight")
            import matplotlib.pyplot as plt
            plt.close(fig)
        except Exception as exc:  # noqa: BLE001
            logger.warning("mpl render failed (%s); falling back to text→PNG", exc)
            # Fallback: render text representation as PNG via Pillow
            from PIL import Image, ImageDraw

            text_repr = str(qc.draw(output="text"))
            img = Image.new("RGB", (600, 200), color=(255, 255, 255))
            draw = ImageDraw.Draw(img)
            draw.text((10, 10), text_repr, fill=(0, 0, 0))
            img.save(buf, format="PNG")

        buf.seek(0)
        return base64.b64encode(buf.read()).decode("ascii")
