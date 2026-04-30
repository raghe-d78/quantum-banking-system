# Quantum Random Number Generation (QRNG)

## Overview

The QRNG engine in `services/quantum-service/app/quantum/qrng_engine.py` generates
true random numbers by measuring qubits in equal superposition.

## Mathematical Foundation

### Shannon Entropy

For a fair binary random variable $X \in \{0,1\}$:

$$H(X) = -\sum_{x} P(x)\log_2 P(x) = -\frac{1}{2}\log_2\frac{1}{2} - \frac{1}{2}\log_2\frac{1}{2} = 1 \text{ bit}$$

The Hadamard gate maximises this entropy:

$$H|0\rangle = \frac{|0\rangle + |1\rangle}{\sqrt{2}}$$

$$P(0) = \left|\langle 0 | \frac{|0\rangle + |1\rangle}{\sqrt{2}}\right|^2 = \frac{1}{2}$$

$$P(1) = \left|\langle 1 | \frac{|0\rangle + |1\rangle}{\sqrt{2}}\right|^2 = \frac{1}{2}$$

Each qubit contributes exactly **1 bit of entropy** — the theoretical maximum for a binary random variable.

### Why Quantum Randomness is Different

Classical PRNGs are deterministic: given the seed, the entire sequence is predictable.
Hardware RNGs based on thermal noise are semi-random but subject to environmental biases.

Quantum measurement outcomes are **fundamentally non-deterministic**:
- The Born rule $P(x) = |\langle x|\psi\rangle|^2$ is a postulate of quantum mechanics.
- No hidden variable theory can reproduce quantum statistics (Bell's theorem).
- The randomness cannot be predicted even with unlimited computational resources.

### Min-Entropy

For cryptographic applications, min-entropy $H_\infty$ matters more than Shannon entropy:

$$H_\infty(X) = -\log_2\max_x P(x)$$

For $H|0\rangle$: $H_\infty = -\log_2(1/2) = 1$ bit per qubit — optimal.

## Circuit Implementation

```
     ┌───┐ ┌─┐
q_0: ┤ H ├─┤M├
     └───┘ └─┘
```

The circuit for $n$ qubits applies $H$ to all qubits simultaneously, then measures all in the $Z$-basis.

## Batch Processing

For efficiency, the implementation uses `QRNG_BATCH_SIZE = 8` qubits per circuit:

```python
for chunk in range(0, n_bits, 8):
    circuit = H^8 followed by measurement
    bits.extend(run(circuit, shots=1))
```

Each 8-qubit circuit produces 8 independent random bits in a single simulator call.

## Statistical Tests

The implementation satisfies basic statistical randomness tests:

| Test | Expected | Notes |
|------|----------|-------|
| Frequency (monobit) | $P \approx 0.5$ per bit | Chi-square p-value > 0.01 |
| Block frequency | Uniform per block | Tested in `test_qrng.py` |
| Byte distribution | $[0, 255]$ uniform | Via full 8-bit measurement |

For production use, apply NIST SP 800-22 statistical tests to the raw output.

## Security Notes

- In simulation mode (Qiskit Aer), the randomness comes from the simulator's internal PRNG.
- For true quantum randomness, replace `AerSimulator` with a real quantum hardware backend.
- Consider post-processing with a cryptographic hash (e.g., SHA-3) to smooth any residual bias.
