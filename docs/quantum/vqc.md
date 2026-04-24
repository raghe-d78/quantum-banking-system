# Variational Quantum Classifier (VQC) for Fraud Detection

## Architecture Overview

The VQC consists of three layers applied sequentially:

```
Input x ──→ Feature Map Φ(x) ──→ Ansatz U(θ) ──→ Measurement ──→ Label
           (data encoding)      (parameterised)    (Z⊗n exp.)
```

## 1. Feature Map

The `ZZFeatureMap` of depth $r$ encodes a $d$-dimensional classical feature vector $\mathbf{x}$ as:

$$|\Phi(\mathbf{x})\rangle = U_\Phi(\mathbf{x})|0^d\rangle$$

where the encoding unitary applies Hadamards followed by controlled-Z-phase rotations:

$$U_\Phi(\mathbf{x}) = \prod_{l=1}^{r} \left(\prod_{i<j} e^{i({\pi - x_i})({\pi - x_j}) Z_i Z_j}\right) \left(\prod_i e^{i x_i Z_i}\right) H^{\otimes d}$$

This creates feature-dependent entanglement that cannot be efficiently classically simulated for large $d$.

## 2. Parameterised Ansatz

The `RealAmplitudes` ansatz $U(\boldsymbol{\theta})$ applies alternating layers of $R_y$ rotations and CNOT entangling gates:

$$U(\boldsymbol{\theta}) = \prod_{l=1}^{L} \left[\prod_{\langle i,j\rangle} \text{CNOT}_{ij}\right] \left[\prod_i R_y(\theta_i^{(l)})\right]$$

For $d = 2$ qubits and $L = 3$ layers: $2 \times 4 = 8$ trainable parameters.

## 3. Prediction

The prediction is:

$$\hat{y} = \text{sign}\left(\langle 0^d | U^\dagger(\boldsymbol{\theta})\,\Phi^\dagger(\mathbf{x})\; Z^{\otimes d} \;\Phi(\mathbf{x})\,U(\boldsymbol{\theta}) | 0^d \rangle\right)$$

In practice, the expectation value is estimated from $N_{\text{shots}}$ circuit samples.

## 4. Parameter-Shift Rule

Gradients of expectation values are computed analytically:

$$\frac{\partial \langle O \rangle}{\partial \theta_k} = \frac{1}{2}\left(\langle O \rangle_{\theta_k + \pi/2} - \langle O \rangle_{\theta_k - \pi/2}\right)$$

This is the **parameter-shift rule** — it gives exact gradients without finite-difference approximation and works on real quantum hardware.

## 5. Loss Function

Cross-entropy loss for binary classification:

$$\mathcal{L}(\boldsymbol{\theta}) = -\frac{1}{N}\sum_{n=1}^{N} \left[y_n \log p_n + (1-y_n)\log(1-p_n)\right]$$

where $p_n = \sigma(\hat{y}_n)$ with sigmoid $\sigma$.

## 6. Optimisation

The current PoC uses **COBYLA** (Constrained Optimisation By Linear Approximations):
- Gradient-free — suitable for noisy simulators.
- No hyperparameter tuning required.
- Converges in $O(d^2)$ function evaluations for smooth objectives.

For better performance, consider:
- **SPSA** (Simultaneous Perturbation Stochastic Approximation) — hardware-compatible.
- **ADAM** with parameter-shift gradients — faster on simulators.

## 7. Training Loop

```python
vqc = VQC(
    sampler=AerSampler(),
    feature_map=ZZFeatureMap(feature_dimension=2, reps=2),
    ansatz=RealAmplitudes(num_qubits=2, reps=3),
    optimizer=COBYLA(maxiter=100),
)
vqc.fit(X_train, y_train)
predictions = vqc.predict(X_test)
```

## 8. Limitations of the PoC

- Trained on a tiny 40-sample synthetic 2D dataset.
- Uses only 2 qubits — real fraud detection needs $d \geq 20$ features.
- Simulator shots add statistical noise; increase `shots` for better accuracy.
- Quantum advantage for classification is not yet established — this demonstrates the *architecture*, not superiority over classical ML.

## 9. Future Work

- Replace synthetic data with real transaction features (PCA-reduced to $d$ qubits).
- Benchmark against classical Random Forest / XGBoost baselines.
- Implement quantum kernel SVM (`QuantumKernel`) as an alternative.
- Run on IBM Quantum hardware once the qubit count is sufficient.
