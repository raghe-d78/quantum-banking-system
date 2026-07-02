# Graph Report - .  (2026-05-01)

## Corpus Check
- 85 files · ~438,571 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 173 nodes · 128 edges · 69 communities detected
- Extraction: 89% EXTRACTED · 10% INFERRED · 1% AMBIGUOUS · INFERRED: 13 edges (avg confidence: 0.82)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Auth Context & Protected Routes|Auth Context & Protected Routes]]
- [[_COMMUNITY_Money Value Object|Money Value Object]]
- [[_COMMUNITY_Transaction History & Export|Transaction History & Export]]
- [[_COMMUNITY_Project Vision & Tech Stack|Project Vision & Tech Stack]]
- [[_COMMUNITY_Account Repository (CRUD)|Account Repository (CRUD)]]
- [[_COMMUNITY_Transfer Page Wizard|Transfer Page Wizard]]
- [[_COMMUNITY_Transaction Detail View|Transaction Detail View]]
- [[_COMMUNITY_Create Transaction Form|Create Transaction Form]]
- [[_COMMUNITY_Update Profile Page|Update Profile Page]]
- [[_COMMUNITY_Users Admin Page|Users Admin Page]]
- [[_COMMUNITY_Vite Frontend HTML Entries|Vite Frontend HTML Entries]]
- [[_COMMUNITY_Root App Shell|Root App Shell]]
- [[_COMMUNITY_Reusable InputField UI|Reusable InputField UI]]
- [[_COMMUNITY_Customer Dashboard Page|Customer Dashboard Page]]
- [[_COMMUNITY_Withdraw Page Flow|Withdraw Page Flow]]
- [[_COMMUNITY_API Gateway Server & Proxy|API Gateway Server & Proxy]]
- [[_COMMUNITY_Identity Auth Service|Identity Auth Service]]
- [[_COMMUNITY_Staff Deposit Page|Staff Deposit Page]]
- [[_COMMUNITY_Customer Balance Page|Customer Balance Page]]
- [[_COMMUNITY_CSVPDF Export Service|CSV/PDF Export Service]]
- [[_COMMUNITY_Account Transaction Service|Account Transaction Service]]
- [[_COMMUNITY_Ledger Repository Insert|Ledger Repository Insert]]
- [[_COMMUNITY_Account API Tests|Account API Tests]]
- [[_COMMUNITY_API Gateway Proxy Service|API Gateway Proxy Service]]
- [[_COMMUNITY_Identity User Service|Identity User Service]]
- [[_COMMUNITY_Identity Auth API Tests|Identity Auth API Tests]]
- [[_COMMUNITY_Identity Users API Tests|Identity Users API Tests]]
- [[_COMMUNITY_Shared DB Pool|Shared DB Pool]]
- [[_COMMUNITY_Staff Admin Dashboard|Staff Admin Dashboard]]
- [[_COMMUNITY_Staff Register Form|Staff Register Form]]
- [[_COMMUNITY_Frontend Boilerplate READMEs|Frontend Boilerplate READMEs]]
- [[_COMMUNITY_Misplaced PDFs (junk)|Misplaced PDFs (junk)]]
- [[_COMMUNITY_eslint.config.js|eslint.config.js]]
- [[_COMMUNITY_vite.config.js|vite.config.js]]
- [[_COMMUNITY_main.jsx|main.jsx]]
- [[_COMMUNITY_api.js|api.js]]
- [[_COMMUNITY_test-import.js|test-import.js]]
- [[_COMMUNITY_account.repository.js|account.repository.js]]
- [[_COMMUNITY_account.service.js|account.service.js]]
- [[_COMMUNITY_app.js|app.js]]
- [[_COMMUNITY_server.js|server.js]]
- [[_COMMUNITY_auth.middleware.js|auth.middleware.js]]
- [[_COMMUNITY_account.service.test.js|account.service.test.js]]
- [[_COMMUNITY_auth.middleware.js|auth.middleware.js]]
- [[_COMMUNITY_account.routes.js|account.routes.js]]
- [[_COMMUNITY_auth.routes.js|auth.routes.js]]
- [[_COMMUNITY_health.test.js|health.test.js]]
- [[_COMMUNITY_jest.config.js|jest.config.js]]
- [[_COMMUNITY_app.js|app.js]]
- [[_COMMUNITY_reco.js|reco.js]]
- [[_COMMUNITY_routes.js|routes.js]]
- [[_COMMUNITY_server.js|server.js]]
- [[_COMMUNITY_user.repository.js|user.repository.js]]
- [[_COMMUNITY_auth.middleware.js|auth.middleware.js]]
- [[_COMMUNITY_user.repository.test.js|user.repository.test.js]]
- [[_COMMUNITY_auth.service.test.js|auth.service.test.js]]
- [[_COMMUNITY_Ledger.repository.js|Ledger.repository.js]]
- [[_COMMUNITY_server.js|server.js]]
- [[_COMMUNITY_Ledger.repository.test.js|Ledger.repository.test.js]]
- [[_COMMUNITY_Money.test.js|Money.test.js]]
- [[_COMMUNITY_eslint.config.js|eslint.config.js]]
- [[_COMMUNITY_vite.config.js|vite.config.js]]
- [[_COMMUNITY_main.jsx|main.jsx]]
- [[_COMMUNITY_api.js|api.js]]
- [[_COMMUNITY_Customer Frontend Background Image|Customer Frontend Background Image]]
- [[_COMMUNITY_Staff Portal Login Page Background Image|Staff Portal Login Page Background Image]]
- [[_COMMUNITY_Vite Logo (Customer Frontend)|Vite Logo (Customer Frontend)]]
- [[_COMMUNITY_Vite Logo (Staff Frontend)|Vite Logo (Staff Frontend)]]
- [[_COMMUNITY_React Logo (Staff Frontend)|React Logo (Staff Frontend)]]

## God Nodes (most connected - your core abstractions)
1. `Money` - 13 edges
2. `useAuth()` - 9 edges
3. `Quantum Banking System (project)` - 9 edges
4. `TransactionModal()` - 5 edges
5. `CreateTransaction()` - 3 edges
6. `fmtDateLong()` - 3 edges
7. `LoginPage()` - 3 edges
8. `UpdateProfilePage()` - 3 edges
9. `resolveStaffLookup()` - 3 edges
10. `Hybrid Quantum-Classical Security` - 3 edges
11. `App()` - 2 edges
12. `CustomerDashboard()` - 2 edges
13. `ProtectedRoute()` - 2 edges
14. `InputField()` - 2 edges
15. `AuthProvider()` - 2 edges

## Surprising Connections (you probably didn't know these)
- `Customer Frontend HTML Entry` --semantically_similar_to--> `Staff Frontend HTML Entry`  [INFERRED] [semantically similar]
  customer_frontend/index.html → staff_frontend/index.html
- `Customer Frontend README (Vite+React template boilerplate)` --semantically_similar_to--> `Staff Frontend README (Vite+React template boilerplate)`  [INFERRED] [semantically similar]
  customer_frontend/README.md → staff_frontend/README.md
- `CustomerDashboard()` --calls--> `useAuth()`  [INFERRED]
  customer_frontend\src\components\CustomerDashboard.jsx → staff_frontend\src\contexts\AuthContext.jsx
- `ProtectedRoute()` --calls--> `useAuth()`  [INFERRED]
  customer_frontend\src\components\ProectedRoute.jsx → staff_frontend\src\contexts\AuthContext.jsx
- `UpdateProfilePage()` --calls--> `useAuth()`  [INFERRED]
  staff_frontend\src\pages\UpdateProfilePage.jsx → staff_frontend\src\contexts\AuthContext.jsx
- `ProtectedRoute()` --calls--> `useAuth()`  [INFERRED]
  staff_frontend\src\components\ProtectedRoute.jsx → staff_frontend\src\contexts\AuthContext.jsx
- `AdminDashboardComponent()` --calls--> `useAuth()`  [INFERRED]
  staff_frontend\src\components\dashboard\Admin.jsx → staff_frontend\src\contexts\AuthContext.jsx
- `EmployeeDashboard()` --calls--> `useAuth()`  [INFERRED]
  staff_frontend\src\components\dashboard\EmployeeDashboard.jsx → staff_frontend\src\contexts\AuthContext.jsx
- `LoginPage()` --calls--> `useAuth()`  [INFERRED]
  staff_frontend\src\pages\Loginpage.jsx → staff_frontend\src\contexts\AuthContext.jsx
- `resolveStaffLookup()` --calls--> `findById()`  [INFERRED]
  services\account-service\src\routes.js → services\account-service\src\repositories\account.repository.js

## Hyperedges (group relationships)
- **Quantum Banking Tech Stack** — readme_tech_flask, readme_tech_qiskit, readme_tech_postgres, readme_tech_react, readme_tech_vite, readme_tech_tailwind, readme_tech_docker [EXTRACTED 1.00]
- **Two Vite+React Frontend Apps (twin scaffold)** — customer_index_html, staff_index_html, customer_readme_template_doc, staff_readme_template_doc [INFERRED 0.90]

## Communities

### Community 0 - "Auth Context & Protected Routes"
Cohesion: 0.12
Nodes (8): AdminDashboardComponent(), AuthProvider(), useAuth(), CustomerDashboard(), EmployeeDashboard(), LoginPage(), ProtectedRoute(), ProtectedRoute()

### Community 1 - "Money Value Object"
Cohesion: 0.24
Nodes (1): Money

### Community 2 - "Transaction History & Export"
Cohesion: 0.31
Nodes (6): exportPDF(), fmt(), fmtDateLong(), fmtTime(), normalizeType(), TransactionModal()

### Community 3 - "Project Vision & Tech Stack"
Cohesion: 0.24
Nodes (10): Fraud Detection, Hybrid Quantum-Classical Security, Quantum Banking System (project), Docker, Flask (backend tech, mentioned in README), PostgreSQL, Qiskit (quantum SDK), React (+2 more)

### Community 4 - "Account Repository (CRUD)"
Cohesion: 0.25
Nodes (3): findById(), findByUserId(), resolveStaffLookup()

### Community 5 - "Transfer Page Wizard"
Cohesion: 0.4
Nodes (2): initSteps(), TransferPage()

### Community 6 - "Transaction Detail View"
Cohesion: 0.5
Nodes (2): fmt(), TransactionDetail()

### Community 7 - "Create Transaction Form"
Cohesion: 0.83
Nodes (3): CreateTransaction(), emptyForm(), fmt()

### Community 8 - "Update Profile Page"
Cohesion: 0.67
Nodes (2): Section(), UpdateProfilePage()

### Community 9 - "Users Admin Page"
Cohesion: 0.5
Nodes (0): 

### Community 10 - "Vite Frontend HTML Entries"
Cohesion: 0.5
Nodes (4): Customer Frontend HTML Entry, Customer main.jsx (HTML script entry), Staff Frontend HTML Entry, Staff main.jsx (HTML script entry)

### Community 11 - "Root App Shell"
Cohesion: 0.67
Nodes (1): App()

### Community 12 - "Reusable InputField UI"
Cohesion: 0.67
Nodes (1): InputField()

### Community 13 - "Customer Dashboard Page"
Cohesion: 0.67
Nodes (1): Dashboard()

### Community 14 - "Withdraw Page Flow"
Cohesion: 0.67
Nodes (0): 

### Community 15 - "API Gateway Server & Proxy"
Cohesion: 0.67
Nodes (0): 

### Community 16 - "Identity Auth Service"
Cohesion: 0.67
Nodes (0): 

### Community 17 - "Staff Deposit Page"
Cohesion: 0.67
Nodes (0): 

### Community 18 - "Customer Balance Page"
Cohesion: 1.0
Nodes (0): 

### Community 19 - "CSV/PDF Export Service"
Cohesion: 1.0
Nodes (0): 

### Community 20 - "Account Transaction Service"
Cohesion: 1.0
Nodes (0): 

### Community 21 - "Ledger Repository Insert"
Cohesion: 1.0
Nodes (0): 

### Community 22 - "Account API Tests"
Cohesion: 1.0
Nodes (0): 

### Community 23 - "API Gateway Proxy Service"
Cohesion: 1.0
Nodes (0): 

### Community 24 - "Identity User Service"
Cohesion: 1.0
Nodes (0): 

### Community 25 - "Identity Auth API Tests"
Cohesion: 1.0
Nodes (0): 

### Community 26 - "Identity Users API Tests"
Cohesion: 1.0
Nodes (0): 

### Community 27 - "Shared DB Pool"
Cohesion: 1.0
Nodes (0): 

### Community 28 - "Staff Admin Dashboard"
Cohesion: 1.0
Nodes (0): 

### Community 29 - "Staff Register Form"
Cohesion: 1.0
Nodes (0): 

### Community 30 - "Frontend Boilerplate READMEs"
Cohesion: 1.0
Nodes (2): Customer Frontend README (Vite+React template boilerplate), Staff Frontend README (Vite+React template boilerplate)

### Community 31 - "Misplaced PDFs (junk)"
Cohesion: 1.0
Nodes (2): Unknown PDF (fjfjjff.pdf - misplaced in pages dir), Unknown PDF (,mf.pdf - misplaced in pages dir)

### Community 32 - "eslint.config.js"
Cohesion: 1.0
Nodes (0): 

### Community 33 - "vite.config.js"
Cohesion: 1.0
Nodes (0): 

### Community 34 - "main.jsx"
Cohesion: 1.0
Nodes (0): 

### Community 35 - "api.js"
Cohesion: 1.0
Nodes (0): 

### Community 36 - "test-import.js"
Cohesion: 1.0
Nodes (0): 

### Community 37 - "account.repository.js"
Cohesion: 1.0
Nodes (0): 

### Community 38 - "account.service.js"
Cohesion: 1.0
Nodes (0): 

### Community 39 - "app.js"
Cohesion: 1.0
Nodes (0): 

### Community 40 - "server.js"
Cohesion: 1.0
Nodes (0): 

### Community 41 - "auth.middleware.js"
Cohesion: 1.0
Nodes (0): 

### Community 42 - "account.service.test.js"
Cohesion: 1.0
Nodes (0): 

### Community 43 - "auth.middleware.js"
Cohesion: 1.0
Nodes (0): 

### Community 44 - "account.routes.js"
Cohesion: 1.0
Nodes (0): 

### Community 45 - "auth.routes.js"
Cohesion: 1.0
Nodes (0): 

### Community 46 - "health.test.js"
Cohesion: 1.0
Nodes (0): 

### Community 47 - "jest.config.js"
Cohesion: 1.0
Nodes (0): 

### Community 48 - "app.js"
Cohesion: 1.0
Nodes (0): 

### Community 49 - "reco.js"
Cohesion: 1.0
Nodes (0): 

### Community 50 - "routes.js"
Cohesion: 1.0
Nodes (0): 

### Community 51 - "server.js"
Cohesion: 1.0
Nodes (0): 

### Community 52 - "user.repository.js"
Cohesion: 1.0
Nodes (0): 

### Community 53 - "auth.middleware.js"
Cohesion: 1.0
Nodes (0): 

### Community 54 - "user.repository.test.js"
Cohesion: 1.0
Nodes (0): 

### Community 55 - "auth.service.test.js"
Cohesion: 1.0
Nodes (0): 

### Community 56 - "Ledger.repository.js"
Cohesion: 1.0
Nodes (0): 

### Community 57 - "server.js"
Cohesion: 1.0
Nodes (0): 

### Community 58 - "Ledger.repository.test.js"
Cohesion: 1.0
Nodes (0): 

### Community 59 - "Money.test.js"
Cohesion: 1.0
Nodes (0): 

### Community 60 - "eslint.config.js"
Cohesion: 1.0
Nodes (0): 

### Community 61 - "vite.config.js"
Cohesion: 1.0
Nodes (0): 

### Community 62 - "main.jsx"
Cohesion: 1.0
Nodes (0): 

### Community 63 - "api.js"
Cohesion: 1.0
Nodes (0): 

### Community 64 - "Customer Frontend Background Image"
Cohesion: 1.0
Nodes (1): Customer Frontend Background Image

### Community 65 - "Staff Portal Login Page Background Image"
Cohesion: 1.0
Nodes (1): Staff Portal Login Page Background Image

### Community 66 - "Vite Logo (Customer Frontend)"
Cohesion: 1.0
Nodes (1): Vite Logo (Customer Frontend)

### Community 67 - "Vite Logo (Staff Frontend)"
Cohesion: 1.0
Nodes (1): Vite Logo (Staff Frontend)

### Community 68 - "React Logo (Staff Frontend)"
Cohesion: 1.0
Nodes (1): React Logo (Staff Frontend)

## Ambiguous Edges - Review These
- `Unknown PDF (,mf.pdf - misplaced in pages dir)` → `Unknown PDF (fjfjjff.pdf - misplaced in pages dir)`  [AMBIGUOUS]
  customer_frontend/src/pages/,mf.pdf · relation: semantically_similar_to

## Knowledge Gaps
- **17 isolated node(s):** `Flask (backend tech, mentioned in README)`, `PostgreSQL`, `React`, `Vite`, `Tailwind CSS` (+12 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Customer Balance Page`** (2 nodes): `BalancePage()`, `BalancePage.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `CSV/PDF Export Service`** (2 nodes): `fmt()`, `Export.service.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Account Transaction Service`** (2 nodes): `Transaction.service.js`, `formatTx()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Ledger Repository Insert`** (2 nodes): `insertEntry()`, `ledger.repository.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Account API Tests`** (2 nodes): `makeToken()`, `account.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `API Gateway Proxy Service`** (2 nodes): `proxyRequest()`, `proxy.service.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Identity User Service`** (2 nodes): `User.service.js`, `safeUser()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Identity Auth API Tests`** (2 nodes): `getAdminToken()`, `auth.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Identity Users API Tests`** (2 nodes): `users.test.js`, `token()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Shared DB Pool`** (2 nodes): `createPool()`, `index.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Staff Admin Dashboard`** (2 nodes): `AdminDashboard()`, `AdminDashboard.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Staff Register Form`** (2 nodes): `RegisterForm()`, `RegisterForm.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Frontend Boilerplate READMEs`** (2 nodes): `Customer Frontend README (Vite+React template boilerplate)`, `Staff Frontend README (Vite+React template boilerplate)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Misplaced PDFs (junk)`** (2 nodes): `Unknown PDF (fjfjjff.pdf - misplaced in pages dir)`, `Unknown PDF (,mf.pdf - misplaced in pages dir)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `eslint.config.js`** (1 nodes): `eslint.config.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `vite.config.js`** (1 nodes): `vite.config.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `main.jsx`** (1 nodes): `main.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `api.js`** (1 nodes): `api.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `test-import.js`** (1 nodes): `test-import.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `account.repository.js`** (1 nodes): `account.repository.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `account.service.js`** (1 nodes): `account.service.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `app.js`** (1 nodes): `app.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `server.js`** (1 nodes): `server.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `auth.middleware.js`** (1 nodes): `auth.middleware.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `account.service.test.js`** (1 nodes): `account.service.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `auth.middleware.js`** (1 nodes): `auth.middleware.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `account.routes.js`** (1 nodes): `account.routes.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `auth.routes.js`** (1 nodes): `auth.routes.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `health.test.js`** (1 nodes): `health.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `jest.config.js`** (1 nodes): `jest.config.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `app.js`** (1 nodes): `app.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `reco.js`** (1 nodes): `reco.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `routes.js`** (1 nodes): `routes.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `server.js`** (1 nodes): `server.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `user.repository.js`** (1 nodes): `user.repository.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `auth.middleware.js`** (1 nodes): `auth.middleware.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `user.repository.test.js`** (1 nodes): `user.repository.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `auth.service.test.js`** (1 nodes): `auth.service.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Ledger.repository.js`** (1 nodes): `Ledger.repository.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `server.js`** (1 nodes): `server.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Ledger.repository.test.js`** (1 nodes): `Ledger.repository.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Money.test.js`** (1 nodes): `Money.test.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `eslint.config.js`** (1 nodes): `eslint.config.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `vite.config.js`** (1 nodes): `vite.config.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `main.jsx`** (1 nodes): `main.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `api.js`** (1 nodes): `api.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Customer Frontend Background Image`** (1 nodes): `Customer Frontend Background Image`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Staff Portal Login Page Background Image`** (1 nodes): `Staff Portal Login Page Background Image`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Vite Logo (Customer Frontend)`** (1 nodes): `Vite Logo (Customer Frontend)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Vite Logo (Staff Frontend)`** (1 nodes): `Vite Logo (Staff Frontend)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `React Logo (Staff Frontend)`** (1 nodes): `React Logo (Staff Frontend)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Unknown PDF (,mf.pdf - misplaced in pages dir)` and `Unknown PDF (fjfjjff.pdf - misplaced in pages dir)`?**
  _Edge tagged AMBIGUOUS (relation: semantically_similar_to) - confidence is low._
- **Why does `useAuth()` connect `Auth Context & Protected Routes` to `Update Profile Page`?**
  _High betweenness centrality (0.012) - this node is a cross-community bridge._
- **Why does `UpdateProfilePage()` connect `Update Profile Page` to `Auth Context & Protected Routes`?**
  _High betweenness centrality (0.004) - this node is a cross-community bridge._
- **Are the 7 inferred relationships involving `useAuth()` (e.g. with `CustomerDashboard()` and `ProtectedRoute()`) actually correct?**
  _`useAuth()` has 7 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Flask (backend tech, mentioned in README)`, `PostgreSQL`, `React` to the rest of the system?**
  _17 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Auth Context & Protected Routes` be split into smaller, more focused modules?**
  _Cohesion score 0.12 - nodes in this community are weakly interconnected._