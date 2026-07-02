# Hybrid Quantum-Classical Banking Security System
## Development Plan & Specifications

---

## 1. Project Overview

| Attribute | Value |
|---|---|
| Project Type | Research & Development — Proof of Concept |
| Domain | Quantum Computing / Cybersecurity / FinTech |
| Approach | Hybrid System (Classical + Quantum) |
| Deliverable | Functional prototype + comprehensive documentation |
| Duration | 8 weeks — 4 sprints of 2 weeks each |
| Team Size | 2 students |
| Methodology | Agile — SCRUM |
| Institution | Faculty of Sciences of Bizerte, University of Carthage |

---

## 2. System Architecture

### Logical Zones

**Zone 1 — Public & Edge Security (Quantum-Resistant Connectivity)**
- Load balancer + API Gateway entry point
- QKD-based KMS simulating BB84 for quantum-resistant encryption keys
- Serves: web, mobile, and institutional clients

**Zone 2 — Application Services (Stateless Microservices)**
- Identity Service — JWT authentication (RBAC)
- Account & Transaction Orchestrator — Saga pattern for distributed consistency
- Redis cluster — caching layer
- Apache Kafka — event-driven communication bus

**Zone 3 — Quantum Intelligence Module (Hybrid Fraud Detection)**
- Classical ML — feature extraction pipeline
- QNN / VQC (Qiskit simulator) — complex fraud pattern detection
- Output: quantum-enhanced risk score per transaction

**Zone 4 — Data & Infrastructure (Distributed Persistence)**
- Immutable append-only ledger — full auditability
- CockroachDB / distributed SQL — sharded, fault-tolerant storage
- Audit logs consumer via Kafka

---

## 3. Technical Stack

| Layer | Technology |
|---|---|
| Quantum Framework | IBM Qiskit (local Aer simulator + IBM Quantum free tier) |
| Backend | Node.js microservices |
| Database | CockroachDB (ACID, distributed SQL) |
| Event Streaming | Apache Kafka + Zookeeper |
| Caching | Redis |
| Containerisation | Docker (Docker Compose) |
| Authentication | JWT (access + refresh tokens), bcrypt password hashing |
| API Design | REST, Swagger / OpenAPI |
| Frontend | Web UI (responsive, role-based dashboards) |
| Financial Precision | Decimal.js (19, 4) — zero rounding errors |
| Version Control | Git |
| Diagrams | Draw.io / Lucidchart / PlantUML / Mermaid |

---

## 4. Quantum Components

### 4.1 Quantum Random Number Generation (QRNG)
- **Mechanism:** Hadamard gate → qubit superposition → measurement → true random bit
- **Implementation:** Qiskit quantum circuits (simulator or real hardware)
- **Application in system:** Replaces PRNG-based JWT token generation; provides a verifiably higher entropy floor for cryptographic keys

### 4.2 Quantum Key Distribution — BB84 Protocol
- **Protocol:** Bennett & Brassard 1984
- **Security basis:** No-cloning theorem + measurement-disturbance principle
- **Eavesdropper detection:** QBER > 11% threshold triggers alert
- **Security model:** Information-theoretic (unconditionally secure regardless of adversary compute power)
- **Application in system:** Secures API Gateway ↔ Core Banking inter-service communication; mitigates "Harvest Now, Decrypt Later" (HNDL) attacks

### 4.3 Quantum Machine Learning (QML) — Fraud Detection
- **Model 1:** Variational Quantum Classifier (VQC) — parametrised quantum circuit trained via COBYLA / Adam optimisation
- **Model 2:** Quantum Support Vector Machine (QSVM) — quantum kernel function measuring inner products in exponentially large feature space
- **Framework:** Qiskit (NISQ-era simulator)
- **Limitation acknowledged:** QML does not yet consistently outperform classical baselines on NISQ hardware; project is empirical investigation

---

## 5. Functional Requirements

### Authentication
| ID | Requirement |
|---|---|
| FR-01 | System shall support user login with email and password |
| FR-02 | System shall generate JWT tokens for authenticated sessions |
| FR-03 | System shall implement a token refresh mechanism |

### Transaction Management
| ID | Requirement |
|---|---|
| FR-05 | System shall allow creation of simulated transactions |
| FR-06 | System shall display transaction history with filtering capabilities |
| FR-07 | System shall assign unique IDs to each transaction |
| FR-08 | System shall store transaction metadata for subsequent analysis |

### Fraud Detection
| ID | Requirement |
|---|---|
| FR-09 | System shall classify transactions using quantum ML models (Neural Network) |
| FR-10 | System shall provide confidence scores for all predictions |

### Quantum Services
| ID | Requirement |
|---|---|
| FR-13 | System shall generate quantum random numbers on demand via Qiskit circuits |
| FR-14 | System shall simulate BB84 with and without an eavesdropper |
| FR-15 | System shall visualise quantum circuits in the web interface |
| FR-16 | System shall execute NN classifier and return predictions |

### Monitoring & Analytics
| ID | Requirement |
|---|---|
| FR-17 | System shall display a real-time dashboard with KPIs |
| FR-18 | System shall log all security events with timestamps |
| FR-19 | System shall track performance metrics (response times, model accuracy) |
| FR-20 | System shall generate comparative analysis reports |

---

## 6. Non-Functional Requirements

| Quality Attribute | Requirement |
|---|---|
| Performance | < 200 ms API response for classical operations; quantum circuit execution within simulator constraints |
| Scalability | Multiple concurrent users; managed quantum job queuing |
| Availability | High uptime; fast failure recovery via Docker; automated database backups |
| Security | HTTPS (production); JWT with expiry; bcrypt hashing; rate limiting; input validation |
| Usability | Responsive design; intuitive UI; accessible error messages |
| Maintainability | Modular architecture; > 60% test coverage; Swagger / OpenAPI docs |
| Portability | Docker-based; cloud-agnostic; environment-variable configuration |

---

## 7. System Actors

| Actor | Needs | Pain Points |
|---|---|---|
| AccountHandler | Secure authentication, fast transactions | Fear of fraud, complex login |
| Bank Employee | Real-time anomaly detection, low false-positive rate | Alert fatigue, novel fraud patterns |
| System Administrator | Monitoring, performance metrics, system health | Complex integrations, opaque quantum processes |
| Research Jury | Reproducibility, comparative analysis, quantum explainability | Quantum complexity, unclear classical–quantum trade-offs |

---

## 8. Product Backlog

### Summary

| Feature | User Stories | Story Points | Estimated Hours |
|---|---|---|---|
| F1 — Authentication | 2 | 7 | 14 |
| F2 — User & Account Management | 8 | 26 | 18 |
| F3 — Transaction Management | 6 | 25 | 56 |
| F4 — Fraud Detection & Monitoring | 7 | 39 | 62 |
| **TOTAL** | **23** | **121** | **242** |

---

### Feature 1 — Authentication

| ID | User Story | Priority | SP | Hours |
|---|---|---|---|---|
| US-1.1 | As a user, I want to log in using my email and password so that I can access the bank system | HIGH | 5 | 10 |
| US-1.2 | As a logged-in user, I want to log out so that I can securely end my session | MEDIUM | 2 | 4 |

---

### Feature 2 — User & Account Management

| ID | User Story | Priority | SP | Hours |
|---|---|---|---|---|
| US-2.1 | As a logged-in user, I want to view my personal information | MEDIUM | 3 | 6 |
| US-2.2 | As a logged-in user, I want to update my personal information | MEDIUM | 3 | 6 |
| US-2.3 | As an administrator, I want to create customer/employee accounts | HIGH | 5 | 10 |
| US-2.4 | As an administrator, I want to manage user accounts (update info and roles) | MEDIUM | 3 | 6 |
| US-2.5 | As an administrator, I want to deactivate user accounts | HIGH | 5 | 10 |
| US-2.6 | As an administrator, I want to delete user accounts permanently | LOW | 3 | 6 |

---

### Feature 3 — Transaction Management

| ID | User Story | Priority | SP | Hours |
|---|---|---|---|---|
| US-3.1 | As an employee, I want to deposit money into an account | HIGH | 5 | 10 |
| US-3.2 | As an AccountHandler, I want to create a banking transaction (deposit, withdrawal, transfer, payment, purchase) | HIGH | 8 | 16 |
| US-3.3 | As an AccountHandler, I want to view my transaction history | HIGH | 5 | 10 |
| US-3.4 | As an AccountHandler, I want to view full details of a transaction | MEDIUM | 3 | 6 |
| US-3.5 | As an AccountHandler, I want to filter transactions by date, type, or amount | MEDIUM | 4 | 8 |
| US-3.7 | As an AccountHandler, I want to export my transactions (PDF) | LOW | 3 | 6 |

---

### Feature 4 — Fraud Detection

| ID | User Story | Priority | SP | Hours |
|---|---|---|---|---|
| US-4.1 | [System] Automatically analyse transactions for fraud using Neural Networks | HIGH | 13 | 26 |
| US-4.2 | [System] Automatically assign risk level (Low / Medium / High / Critical) to each transaction | HIGH | 5 | 10 |
| US-4.3 | As an employee, I want to monitor suspicious activities | HIGH | 5 | 10 |
| US-4.4 | As an employee/administrator, I want to view fraud reports and trends | MEDIUM | 4 | 8 |
| US-4.5 | As an administrator, I want to cancel a fraudulent transaction | MEDIUM | 4 | 8 |
| US-4.6 | As an administrator, I want to view security logs | MEDIUM | 4 | 8 |
| US-4.7 | As an administrator, I want to protect users via transaction cancellation | MEDIUM | 5 | 10 |

---

## 9. Sprint Planning

| Sprint | Phase | Core Objective | Key Deliverables |
|---|---|---|---|
| Sprint 1 | Foundation, Auth & User Management | Establish secure environment and identity management | Docker environment, CockroachDB schema, JWT/RBAC API |
| Sprint 2 | Core Ledger & Events | Build high-integrity financial engine and data pipeline | ACID Ledger engine, Kafka Broker, Audit Consumer Service |
| Sprint 3 | Quantum Security (QKD) | Secure inter-service communication via quantum key simulation | BB84 Protocol Simulator, Key Management Service (KMS) |
| Sprint 4 | Quantum Intelligence (QNN) | Implement AI-driven fraud detection using quantum circuits | Hybrid QNN Model (Qiskit), Fraud Validation Pipeline |

---

## 10. Sprint 1 — Foundation, Auth & User Management

### Objective
Deliver a walking skeleton validating an end-to-end workflow from user creation to account consultation.

### Sprint Backlog

#### US-1.1 — Login

| Task ID | Task | Estimation | Owner |
|---|---|---|---|
| T1.2 | Define User entity (UUID, email, password, role) and create `users` table in CockroachDB | 1h | Raghed |
| T1.3 | Define endpoints POST /auth/staff/login and /auth/customer/login with request/response format | 2h | Seif |
| T1.4 | Validate email & password; compare hashed password using bcrypt | 3h | Seif |
| T1.5 | Create JWT token with userId and role | 1h | Seif |
| T1.6 | Validate email/password format | 1h | Seif |
| T1.7 | Route login request to Identity Service via API Gateway | 2h | Raghed |
| T1.8 | Create login page with email/password fields (Staff and AccountHandler) | 3h | Raghed |
| T1.9 | Connect staff login page to /auth/staff/login endpoint | 1h | Raghed |
| T1.10 | Connect AccountHandler login page to /auth/customer/login endpoint | 1h | Raghed |
| T1.11 | Redirect user after successful login | 2h | Seif |
| T1.12 | Test login success, failure, and unauthorized access | 1h | Raghed |

#### US-2.3 — Create User (Admin)

| Task ID | Task | Estimation | Owner |
|---|---|---|---|
| T2.1 | Define Account entity (id, user_id, balance, currency) | 1h | Raghed |
| T2.2 | Create `accounts` table | 1h | Raghed |
| T2.3 | Define POST /admin/users endpoint | 2h | Seif |
| T2.4 | Save user with role | 2h | Seif |
| T2.5 | Hash password using bcrypt | 2h | Seif |
| T2.6 | Validate input & ensure unique email | 1h | Seif |
| T2.7 | Secure endpoint with JWT + role guard | 2h | Seif |
| T2.8 | Auto-create bank account when AccountHandler role is assigned | 3h | Raghed |
| T2.9 | Set default balance (0.000) | 2h | Raghed |
| T2.10 | Ensure user + account creation is atomic (transaction) | 1h | Raghed |
| T2.11 | Create Admin, Employee and AccountHandler dashboards; restrict access to authenticated users | 7h | Raghed |
| T2.12 | Create user creation form (name, email, role, password) | 3h | Raghed |
| T2.13 | Connect form to /admin/users | 1h | Raghed |
| T2.14 | Display account balance after AccountHandler login | 3h | Raghed |
| T2.15 | Retrieve account info from backend | 2h | Seif |
| T2.16 | Test creation, security, auto account, balance display | 3h | Raghed |

#### US-2.4 — Manage User Accounts (Admin)

| Task ID | Task | Estimation | Owner |
|---|---|---|---|
| T3.1 | Implement GET /admin/users — retrieve list of users | 1h | Raghed |
| T3.2 | Implement GET /admin/users/:id — retrieve user details | 1h | Raghed |
| T3.3 | Implement PUT /admin/users/:id — update user info (email, role, status) | 2h | Raghed |
| T3.4 | Secure endpoints — accessible only by ADMIN (JWT + role) | 1h | Raghed |
| T3.5 | Create user management page (list view) | 2h | Seif |
| T3.6 | Create user update form | 1h | Seif |
| T3.7 | Connect UI to /admin/users backend | 1h | Seif |
| T3.8 | Test user retrieval, update, and access denial for non-admins | 1h | Seif |

#### US-2.2 — Update Personal Profile

| Task ID | Task | Estimation | Owner |
|---|---|---|---|
| T4.1 | Implement GET /users/me — retrieve current user's information | 1h | Seif |
| T4.2 | Implement PUT /users/me — update personal information | 2h | Seif |
| T4.3 | Implement password hashing on password update | 1h | Seif |
| T4.4 | Ensure users can only update their own data (JWT-based authorization) | 1h | Seif |
| T4.5 | Create profile page (view and edit) | 2h | Raghed |
| T4.6 | Connect profile page to /users/me | 1h | Raghed |
| T4.7 | Test profile update, password update, secure access | 1h | Raghed |

---

## 11. Sprint 2 — Core Ledger & Event-Driven Infrastructure

### Objective
Implement a professional Double-Entry Ledger with an immutable append-only audit trail and an Apache Kafka event pipeline feeding the future Quantum Detection Layer.

### Architectural Highlights
- **Accounting model:** Double-entry ledger — every debit has a matching credit
- **Ledger table:** `account_ledger` (ID, Account_ID, Type, Amount, Balance_Snapshot, Timestamp) — append-only, no UPDATE or DELETE
- **Precision:** Decimal.js with (19, 4) type to prevent rounding errors
- **Concurrency:** Pessimistic locking (SELECT FOR UPDATE) for withdrawal/transfer
- **Consistency:** Full ACID compliance via CockroachDB transactions with rollback logic
- **Events:** Every successful transaction emits a JSON event to Kafka topic `transaction.events`
- **Audit:** Audit-Worker (Node.js Kafka Consumer) persists events to `audit_logs` table

### Sprint Backlog

#### US-3.1 — Deposit (Employee → AccountHandler)

| Task ID | Task | Estimation | Owner |
|---|---|---|---|
| T1.1 | Configure Decimal.js for zero rounding errors | 1h | Raghed |
| T1.2 | Create `account_ledger` table (append-only) | 2h | Seif |
| T1.3 | Implement POST /accounts/:id/deposit with atomic balance update + ledger entry | 3h | Seif |
| T1.4 | Create deposit form; connect to /accounts/:id/deposit with real-time validation | 2h | Seif |
| T1.5 | Test deposit flow | 1h | Seif |

#### US-3.2 — Withdrawal & Transfer (AccountHandler)

| Task ID | Task | Estimation | Owner |
|---|---|---|---|
| T2.1 | Implement POST /accounts/:id/withdraw with Pessimistic Locking | 2h | Raghed |
| T2.2 | Ensure atomic operations (ledger + balance update) | 3h | Raghed |
| T2.3 | Reject invalid, negative, and overdraft operations | 1h | Raghed |
| T2.4 | Implement POST /transfer — debit Account A and credit Account B in single SQL transaction | 1h | Raghed |
| T2.5 | Implement rollback logic — if credit step fails, debit automatically reverts | 2h | Seif |
| T2.5b | Implement daily transfer limits and basic fraud checks (e.g., cannot transfer to own account) | 1h | Raghed |
| T2.6 | Create withdraw and transfer pages; connect to backend | 1h | Raghed |
| T2.7 | Test withdrawal, edge cases, race conditions, transfer | 1h | Raghed |

#### US-3.3 — Transaction History

| Task ID | Task | Estimation | Owner |
|---|---|---|---|
| T3.1 | Implement GET /transactions | 2h | Seif |
| T3.2 | Return ledger entries for authenticated user | 3h | Raghed |
| T3.3 | Create transaction list page | 2h | Raghed |
| T3.4 | Connect frontend to backend endpoints | 1h | Raghed |
| T3.5 | Test transaction list | 7h | Raghed |

#### US-3.4 — Transaction Detail View

| Task ID | Task | Estimation | Owner |
|---|---|---|---|
| T4.1 | Implement GET /transactions/:id | 3h | Raghed |
| T4.2 | Create detail view page | 1h | Raghed |
| T4.3 | Connect frontend to backend endpoint | 3h | Raghed |
| T4.4 | Test details page | 2h | Seif |

#### US-3.5 — Filters & Export

| Task ID | Task | Estimation | Owner |
|---|---|---|---|
| T5.1 | Add filters (date / type / amount) to transaction history | 3h | Raghed |
| T6.1 | Add PDF export button | TBD | TBD |

#### Data Infrastructure & Quality Assurance

| Task ID | Task | Estimation | Owner |
|---|---|---|---|
| T7.1 | Deploy Kafka + Zookeeper via Docker; initialise topics `transaction.events` and `audit.logs` | TBD | TBD |
| T7.2 | Develop Kafka Producer — every successful transaction emits a JSON event | TBD | TBD |
| T7.3 | Develop Audit-Worker (Node.js Consumer) — reads Kafka events and persists to `audit_logs` | TBD | TBD |
| T7.4 | Configure CockroachDB for massive audit log indexing (by Kafka Partition/Offset) | TBD | TBD |
| T7.5 | Load test — simulate 100 simultaneous deposits; verify final balance consistency | TBD | TBD |
| T7.6 | Verify Audit-Worker crash recovery (exactly-once resumption) | TBD | TBD |

---

## 12. Sprint 3 — Quantum Key Distribution (QKD / BB84)

### Objective
Implement a PoC for Quantum Key Distribution using the BB84 protocol to secure inter-service communication between the API Gateway and Core Banking services. Directly addresses "Harvest Now, Decrypt Later" (HNDL) vulnerability.

### Deliverables
- BB84 Protocol Simulator (with and without eavesdropper simulation)
- Key Management Service (KMS) consuming BB84-generated keys
- QBER calculation and eavesdropper detection alert
- Quantum circuit visualisation in the web UI

---

## 13. Sprint 4 — Quantum Neural Network (QNN) Fraud Detection

### Objective
Implement AI-driven fraud detection using hybrid classical-quantum circuits. Provide a side-by-side empirical comparison of classical vs. quantum fraud-detection models.

### Deliverables
- Hybrid QNN Model (Qiskit VQC / QSVM)
- Fraud Validation Pipeline consuming Kafka `transaction.events`
- Risk score output: Low / Medium / High / Critical per transaction
- Confidence score returned with every prediction
- Comparative analysis report (classical baseline vs. quantum model)

---

## 14. API Endpoint Reference

| Method | Endpoint | Description | Access |
|---|---|---|---|
| POST | /auth/staff/login | Staff login | Public |
| POST | /auth/customer/login | AccountHandler login | Public |
| GET | /users/me | Get own profile | Authenticated |
| PUT | /users/me | Update own profile | Authenticated |
| POST | /admin/users | Create new user | Admin |
| GET | /admin/users | List all users | Admin |
| GET | /admin/users/:id | Get user details | Admin |
| PUT | /admin/users/:id | Update user | Admin |
| POST | /accounts/:id/deposit | Deposit into account | Employee |
| POST | /accounts/:id/withdraw | Withdraw from account | AccountHandler |
| POST | /transfer | Transfer between accounts | AccountHandler |
| GET | /transactions | List transactions | AccountHandler |
| GET | /transactions/:id | Transaction detail | AccountHandler |

---

## 15. SCRUM Roles & Ceremonies

### Role Distribution

| Role | Assigned To | Responsibilities |
|---|---|---|
| Product Owner | Mme Rahma Ferjeni | Defines vision; prioritises backlog; accepts deliverables |
| Scrum Master | Seif Badreddine | Facilitates sprints; removes impediments |
| Dev Team | Raghed Saidani & Seif Badreddine | Implements features; writes code, documentation, and tests |
| Stakeholders | Faculty / Jury | Provides feedback; evaluates final deliverable |

### Ceremony Schedule

| Ceremony | Duration | Purpose |
|---|---|---|
| Sprint Planning | 2 hours | Select backlog items; define sprint goal |
| Daily Stand-up | 15 min/day | Progress update; identify blockers |
| Development Work | 10 days | Implementation; testing; documentation |
| Sprint Review | 1 hour | Demonstrate work to supervisor |
| Sprint Retrospective | 1 hour | Reflect; identify process improvements |

---

## 16. UML Artefacts Planned

| Diagram Type | Coverage |
|---|---|
| Use Case Diagram | System functionality from user perspective; actors and system boundaries |
| Class Diagram | Static structure: classes, attributes, methods, relationships |
| Sequence Diagram | Authentication flow, quantum service calls, async job queuing |
| Component Diagram | Client / API Gateway / Classical / Quantum layer separation |
| Deployment Diagram | Docker-based physical deployment; PostgreSQL, Redis, Backend, Frontend; network ports |

---

*Document extracted from PFE Report — Hybrid Quantum-Classical System for Banking Security and Fraud Detection, Faculty of Sciences of Bizerte, Academic Year 2025/2026.*
