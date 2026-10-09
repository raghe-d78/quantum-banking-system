# Chapter 2 — Requirements Analysis and System Design

## Introduction

This chapter presents the analysis and design of the proposed banking system. It outlines the system's functional and non-functional requirements, identifies the main actors, and provides a global vision of the system through diagrams and architectural choices. Additionally, it introduces the product backlog and describes the sprint planning adopted to ensure an incremental and efficient development process.

---

## Global Use Case Diagram

*(Use case diagram section included in the original PDF as a figure)*

---

## Requirements Specification

### Stakeholders and User Profiles

| Actor | Needs | Pain Points |
|---|---|---|
| AccountHandler | Secure authentication, fast transactions | Fear of fraud, complex login |
| Bank Employee | Real-time anomaly detection, low false-positive rate | Alert fatigue, novel fraud patterns |
| System Administrator | Monitoring, performance metrics, system health | Complex integrations, opaque quantum processes |
| Research Jury | Reproducibility, comparative analysis, quantum explainability | Quantum complexity, unclear classical–quantum trade-offs |

---

## Functional Requirements

### Authentication System

- FR-01 … FR-04 (login, JWT, optional QRNG, refresh)

### Transaction Management

- FR-05 … FR-08

### Fraud Detection

- FR-09, FR-10

### Quantum Services

- FR-13 … FR-16 (QRNG via Qiskit, BB84 sim, circuit visualisation, NN classifier)

### Monitoring & Analytics

- FR-17 … FR-20

---

## Non-Functional Requirements

| NFR Category | Requirement |
|---|---|
| Performance | Sub-second response for standard transactions; quantum endpoints ≤ 3 s |
| Scalability | Horizontal scaling of stateless microservices; DB sharding-ready |
| Availability | 99.9% uptime target; health-check endpoints on all services |
| Security | JWT authentication, TLS in transit, secrets via env, no hard-coded credentials |
| Usability | Intuitive SPA for customers and staff; WCAG 2.1 AA compliance target |
| Maintainability | Modular microservice architecture; ≥ 60% unit-test coverage per service |
| Portability | Docker-compose for local dev; Kubernetes-ready manifests for production |

---

## Complete Product Backlog

| Feature | Stories | Story Points | Estimated Hours |
|---|---|---|---|
| F1 Auth | 2 stories | 7 SP | 14 h |
| F2 User & Account Mgmt | 8 stories | 26 SP | 18 h |
| F3 Transactions | 6 stories | 25 SP | 56 h |
| F4 Fraud Detection | 7 stories | 39 SP | 62 h |
| **TOTAL** | **23 stories** | **121 SP** | **242 h** |

---

## Feature 1 — Authentication

| Story | Priority | Story Points | Estimated Hours |
|---|---|---|---|
| US-1.1 — Login | HIGH | 5 SP | 10 h |
| US-1.2 — Logout | MEDIUM | 2 SP | 4 h |

---

## Feature 2 — User and Account Management

- View and update personal information
- Create customer accounts
- Create employee accounts
- Manage users
- Deactivate users
- Delete users

---

## Feature 3 — Transaction Management

- Deposit
- Create transaction
- Transaction history
- Transaction details
- Filter transactions
- Export PDF

---

## Feature 4 — Fraud Detection

- Automatic fraud analysis (Neural Network)
- Risk assignment
- Suspicious activity monitoring
- Fraud reports
- Cancel fraudulent transaction
- Security logs

---

## Global Physical Architecture (SOA / Stateless Microservices — 4 Zones)

### Zone 1 — Public & Edge Security Zone

- Load Balancer
- API Gateway
- QKD KMS (BB84 simulation, Shor-resistant symmetric keys)

### Zone 2 — Application Services Zone

- Identity Service
- Account / Transaction Orchestrator
- Redis cluster
- Kafka
- Saga pattern

### Zone 3 — Quantum Intelligence Module

- Classical AI pipeline + QNN PoC (VQC, Qiskit simulator) → quantum-enhanced risk score

### Zone 4 — Data & Infrastructure Zone

- Immutable Ledger DB (append-only)
- Distributed SQL DB (CockroachDB / TiDB)

---

## Project Planning

**Duration:** 14 weeks | **7 two-week sprints** | Gantt chart included in original PDF.
