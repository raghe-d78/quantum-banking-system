# Document Computer-Vision Extension — Technical Reference

**Phase 7 of the Quantum Banking System.** This document explains, end to end,
how uploaded financial documents (checks, receipts, bills) are analysed, how the
result gates a transaction, how the extracted features reach the quantum
fraud classifier, how the data is stored and protected, and how to run and
verify all of it. It implements the *Technical Specification: CV Extension*
and fills the gaps that specification left open (document ↔ transaction
linking, storage and encryption, the "suspended transaction" state, training
data, cross-checks, duplicates, transport).

---

## Table of contents

1. [What it does in one paragraph](#1-what-it-does-in-one-paragraph)
2. [Architecture](#2-architecture)
3. [End-to-end flows](#3-end-to-end-flows)
4. [The analysis pipeline, stage by stage](#4-the-analysis-pipeline-stage-by-stage)
5. [The CV feature vector](#5-the-cv-feature-vector)
6. [Document risk policy](#6-document-risk-policy)
7. [Transaction gating and held transactions](#7-transaction-gating-and-held-transactions)
8. [Integration with the quantum fraud pipeline (feature schema v2)](#8-integration-with-the-quantum-fraud-pipeline-feature-schema-v2)
9. [Storage, encryption and privacy](#9-storage-encryption-and-privacy)
10. [Data model](#10-data-model)
11. [API reference](#11-api-reference)
12. [Configuration](#12-configuration)
13. [Frontends](#13-frontends)
14. [Running it](#14-running-it)
15. [Testing and verification](#15-testing-and-verification)
16. [Evaluation: with vs without CV features](#16-evaluation-with-vs-without-cv-features)
17. [Security considerations](#17-security-considerations)
18. [Limitations and calibration notes](#18-limitations-and-calibration-notes)
19. [Mapping to the original specification](#19-mapping-to-the-original-specification)
20. [File map](#20-file-map)

---

## 1. What it does in one paragraph

A customer attaches a photo or scan of a check to a transfer, payment or
withdrawal in the New Transaction wizard. The gateway streams the image to a
new Python microservice, **document-cv-service**, which validates it, cleans
it up with OpenCV, reads the amount, date, payee, document number and bank
with Tesseract OCR, looks for signs of image manipulation, measures layout
and quality, compares the signature against an enrolled reference, checks
the OCR amount against the amount the customer typed, checks the date, and
checks whether the same document was uploaded before. It turns all of that
into a **9-number feature vector**, a **risk score** and a **status**
(`CLEAN`, `REVIEW`, `SUSPICIOUS`), encrypts and stores the image, persists
the analysis, and publishes a `document.analyzed` Kafka event. When the
customer confirms the transaction, account-service locks the document row,
verifies ownership and single use, and either **executes** the transaction
(linking the document to the ledger rows) or **parks it as a held
transaction** for staff. The fraud-service joins the document features to
the transaction features (schema v2, 17 dimensions) and scores both the
classical model and the Variational Quantum Classifier. Staff review holds in
the portal with the decrypted image and every signal, and release or reject.

---

## 2. Architecture

```
 Customer SPA                  api-gateway (3000)                 document-cv-service (3008)
 ┌──────────────┐  multipart   ┌──────────────────┐   raw body    ┌────────────────────────────┐
 │ New tx wizard│ ───────────► │ JWT · RBAC       │ ────────────► │ validate → preprocess      │
 │  + Attach    │              │ 12 MB passthrough│               │ OCR → integrity → layout   │
 │    document  │ ◄─────────── │                  │ ◄──────────── │ signature → cross-checks   │
 └──────┬───────┘   analysis   └────────┬─────────┘   analysis    │ phash → features → risk    │
        │ documentId                    │                         │ encrypt → store → publish  │
        ▼                               ▼                         └──────┬──────────┬──────────┘
 POST /transactions {documentId}  account-service (3002)                 │          │ document.analyzed
        │                         ┌──────────────────────────┐           │          ▼
        └───────────────────────► │ lock document (FOR UPDATE)│   fraud_db│      Kafka
                                  │ owner? unused? amount ok? │  ◄────────┘        │
                                  │ hold policy → execute OR  │  document_analyses │
                                  │ held_transactions         │                    │
                                  └──────────┬───────────────┘                     │
                                             │ transaction.events {documentId}      │
                                             ▼                                      │
                                  fraud-service (3007) ◄────────────────────────────┘
                                  features v2 = 7 tx + has_document + 9 CV
                                  → StandardScaler/PCA → ZZFeatureMap → VQC
                                  → blend with logistic regression → alert
                                             ▲
 Staff SPA ── Document review ── /admin/holds ── release / reject ── account-service
            ── Analysed documents ── /documents, /documents/:id/image (decrypted on demand)
            ── Signature enrolment ── /documents/signatures/:userId
```

**One CockroachDB cluster.** `document_analyses` lives in `fraud_db`, the
ledger in `ledger_db`, accounts in `account_db`. Because it is one cluster,
account-service can lock the document row and write the ledger in **one SQL
transaction**, and fraud-service can read the features with a plain `SELECT`.
No distributed transaction, no cache coherence problem.

**The image never enters the database.** Only metadata, features and a
wrapped data key do. The ciphertext lives on the `documents_data` volume.

---

## 3. End-to-end flows

### 3.1 Upload and analysis (UC-01)

1. The wizard posts `multipart/form-data` with `file`, `expectedAmount`,
   `expectedCurrency=TND`, `kind=CHECK` to `POST /documents/analyze`.
2. The gateway verifies the JWT, keeps the body raw (`express.raw`, 12 MB
   cap) and forwards it with the original `Content-Type` boundary.
3. document-cv-service runs the pipeline (§4), encrypts the cleaned image
   (§9), inserts `document_analyses`, publishes `document.analyzed`, and
   returns the analysis (§11). Typical latency on a 1400×620 check: 0.6 to
   1.5 s on one CPU core, dominated by Tesseract.
4. The wizard shows status, risk, the OCR fields and the reasons. If the
   customer changes the amount, the analysis is discarded because the
   backend requires the document to have been analysed for the declared
   amount.

### 3.2 Attaching to a transaction

1. The wizard sends `POST /transactions` with the usual body plus
   `documentId` and an `Idempotency-Key`.
2. Inside the money transaction, account-service:
   - `SELECT … FOR UPDATE` on `fraud_db.document_analyses` (no two
     transactions can claim one document);
   - checks the owner is the caller, `transaction_id IS NULL` (single use),
     and `expected_amount` equals the declared amount;
   - evaluates the hold policy (§7).
3. **Executed:** ledger rows carry `document_id`, the document row gets
   `transaction_id`, and the outbox event carries `documentId`. Response
   `201` with `documentId`.
4. **Held:** the full request body is parked in `held_transactions`,
   nothing touches the ledger, response `202 { held: true, holdId, reason }`.

### 3.3 Staff review

1. `GET /admin/holds` lists pending holds with the document status.
2. The staff portal opens the hold: parked request, decrypted image
   (`GET /documents/:id/image`), OCR fields, every integrity signal.
3. `POST /admin/holds/:id/release` re-runs the parked request **on behalf
   of the customer** with the staff member as `initiated_by`; the ledger,
   outbox and document link are written exactly as in 3.2. `…/reject` only
   marks the hold. Both are idempotent: a decided hold answers `409`.

### 3.4 Fraud scoring

The outbox relay publishes `transaction.events` with `documentId`. The
fraud consumer reads `document_analyses.features` by id, builds the 17-dim
vector (§8), scores both models, blends, and opens an alert if High or
Critical. `POST /fraud/score` accepts `documentId` or an inline `document`
object for ad-hoc scoring.

---

## 4. The analysis pipeline, stage by stage

All code is under `services/document-cv-service/src/`. Every stage is pure
(bytes or arrays in, numbers out) except storage and events, so each one is
unit-tested in isolation.

### 4.1 Validation and acquisition — `preprocess.validate_and_decode`

| Check | Rule | Error code |
|---|---|---|
| Empty | no bytes | `EMPTY_FILE` |
| Size | > `DOCUMENT_MAX_BYTES` (10 MB) | `FILE_TOO_LARGE` (413 at the API) |
| Format | magic bytes must be JPEG (`FF D8 FF`) or PNG; the MIME header is ignored | `UNSUPPORTED_FORMAT` |
| Integrity | `PIL.Image.verify()` then a real decode | `CORRUPT_IMAGE` |
| Bomb | `Image.MAX_IMAGE_PIXELS = 40 MP` | `IMAGE_TOO_LARGE` |
| Minimum size | < 200×100 px | `IMAGE_TOO_SMALL` |

The image is then **re-encoded** to JPEG q=92 after applying the EXIF
orientation. Re-encoding strips every metadata block (EXIF, GPS, XMP,
ICC) so the stored copy carries nothing the camera added.

### 4.2 Preprocessing — `preprocess.preprocess`

1. **Resize** so the longest side is ≤ 1600 px (`DOCUMENT_WORK_MAX_SIDE`).
   OCR accuracy plateaus above ~300 dpi equivalent; this bounds CPU time.
2. **Perspective correction.** Canny edges → dilate → external contours.
   The largest contour that is a 4-point polygon and covers ≥ 40 % of the
   frame is treated as the document outline and warped flat with
   `cv2.getPerspectiveTransform`. Photos of a check on a desk come out
   rectangular; flat scans are untouched.
3. **Grayscale + denoise.** `fastNlMeansDenoising(h=7)`: removes sensor
   noise without smearing strokes.
4. **Deskew.** Otsu threshold → coordinates of ink pixels → `minAreaRect`
   angle. If |angle| is between 0.3° and 15°, rotate with cubic
   interpolation. Larger angles are assumed intentional (landscape vs
   portrait) and left alone.
5. **Contrast.** CLAHE (clip 2.0, 8×8 tiles) evens out shadows, then
   min-max normalisation to 0–255.

### 4.3 Quality metrics — `preprocess.quality_metrics`

Four sub-scores in [0, 1], combined by **geometric mean** so one bad
dimension drags the whole score down:

| Sub-score | Measure | Full marks at |
|---|---|---|
| sharpness | variance of the Laplacian | ≥ 300 |
| exposure | 1 − |mean − 150| / 150 | mean ≈ 150 (paper) |
| contrast | std-dev / 55 | ≥ 55 |
| resolution | pixels / (1200×600) | ≥ 0.72 MP |

`document_quality` is one of the nine features.

### 4.4 OCR and field extraction — `ocr.py`

- Engine: Tesseract 5 via `pytesseract.image_to_data`, `--oem 3 --psm 6`,
  languages `eng+fra` (Tunisian checks mix French and digits). Every word
  comes back with a box and a confidence (0–100, scaled to 0–1).
- Words are grouped into lines by Tesseract's `(block, paragraph, line)`
  ids; field extraction works on line text.
- **Fields and heuristics**

  | Field | How it is found | Confidence |
  |---|---|---|
  | `currency` | `TND`, `DT`, `DINAR(S)`, `EUR`, `€`, `USD`, `$` | conf of the matched word |
  | `amount` | numbers after hints (`Montant`, `Amount`, `Somme`, `TND`) rank first; then numbers followed by a currency; then the largest decimal number. Parsing accepts `1 250,500`, `1.250,500`, `1,250.50` | mean conf of the digits |
  | `date` | `dd/mm/yyyy`, `dd.mm.yyyy`, `yyyy-mm-dd` (validated as a real date) | conf of the token |
  | `document_number` | 6–12 digits, preferring those after `N°` | conf of the token |
  | `payee` | text after `Payez à l'ordre de`, `Pay to the order of`, `Bénéficiaire`, cut at the next field keyword | mean conf of the name |
  | `bank` | dictionary of Tunisian banks (BIAT, BNA, STB, Attijari, Amen, UIB, BH, Zitouna, ATB, UBCI, BTK, QNB) | conf of the token |

- `ocr_confidence` = mean word confidence over the page;
  `amount_confidence` = confidence of the amount field (0 when absent).
- **Degradation.** If the `tesseract` binary is missing, `available=false`,
  all confidences are 0, and the risk policy sends the document to
  `REVIEW` instead of guessing (§6). The health endpoint reports `ocr`.

### 4.5 Integrity analysis — `integrity.analyse`

Four independent manipulation signals, each in [0, 1], higher = more
suspicious:

1. **Error-Level Analysis (`ela_score`, weight 0.40).** The page is
   re-saved as JPEG q=90 and the absolute difference to the input is
   computed. Regions that were pasted in from another source (different
   original compression) show a different error level. The difference is
   averaged per 32×32 block; the score combines the spread of the hottest
   block over the median and the fraction of blocks more than 3× the
   median. The median is floored at 0.5 grey levels so that flat paper
   (median error ≈ 0) does not turn every text block into an "outlier".
2. **Noise inconsistency (`noise_inconsistency`, 0.25).** Variance of the
   Laplacian is computed on 64×64 blocks that contain ink (flat paper is
   skipped). A genuine scan has a fairly uniform noise floor; a spliced
   patch brings its own sensor and compression noise. The coefficient of
   variation across blocks above 0.8 is mapped linearly to [0, 1].
3. **Blockiness (`blockiness`, 0.15).** Ratio of pixel-difference energy on
   the 8-pixel JPEG grid to off-grid energy. Double compression and
   misaligned splices raise it.
4. **Copy-move (`copy_move`, 0.20).** ORB keypoints are matched against
   the same image (k=3, skipping the self-match). Matches with a
   consistent, non-trivial offset indicate a region duplicated inside the
   document (a classic way to clone a digit). The score grows with the
   size of the dominant offset cluster.

`tampering_score = 0.40·ela + 0.25·noise + 0.15·blockiness + 0.20·copy_move`.

### 4.6 Layout consistency — `integrity.layout_consistency`

Uses the OCR word boxes. For every text line with ≥ 2 words, fit a line
through the word baselines and record its angle and the median word
height. `layout_consistency = 1 − 0.5·min(1, σ_angle/3°) − 0.5·min(1, CV_height)`.
Printed forms score ≈ 0.85–0.95; pasted text at a slightly different
angle or size drops it.

### 4.7 Signature analysis — `signature.py` (experimental)

1. **Locate.** Otsu threshold of the bottom-right 45 % × 35 % of the page,
   close with a wide kernel, connected components. A component is a
   signature candidate when it is wide (≥ 15 % of the region), sparse
   (fill ratio 5–55 %) and stroke-like (aspect ≥ 1.5). The largest wins.
2. **Describe.** The crop is normalised to 128×64 and described by a
   HOG-style descriptor: 9-bin gradient-orientation histograms over 16×16
   cells, L2-normalised (288 dims).
3. **Compare.** `similarity = 0.5·cosine(HOG) + 0.5·min(1, 2·ORB_match_ratio)`
   against the customer's enrolled reference. The ORB term checks local
   stroke structure; the HOG term checks global shape.
4. **Enrolment.** Staff upload a signature card or a signed check
   (`POST /documents/signatures/:userId`); the same locator extracts the
   crop, falling back to the whole image.
5. **Neutrality.** With no enrolled reference the feature is 0.5 and
   `compared=false`; a present-but-unmatched signature with a reference
   missing scores 0.2.

### 4.8 Cross-checks — `ocr.amount_match`, `ocr.date_validity`, `pipeline.perceptual_hash`

These are not in the original specification and are the strongest cheap
signals the system has:

| Feature | Value | Meaning |
|---|---|---|
| `amount_match` | 1.0 | OCR amount within 1 % of the declared amount |
|  | 0.5 | either side unknown (OCR failed, no amount declared) |
|  | 0.0 | mismatch |
| `date_validity` | 1.0 | date ≤ today and ≤ 180 days old (`DOCUMENT_STALE_DAYS`) |
|  | 0.5 | no date read |
|  | 0.0 | post-dated or stale |
| `duplicate_score` | 1.0 | perceptual hash (pHash, 64-bit DCT) within Hamming distance 6 of an earlier document |
|  | 0.0 | otherwise |

The perceptual hash is robust to re-scanning, resizing and recompression,
so the same physical check photographed twice is still caught, which is the
real-world "double deposit" fraud.

### 4.9 Feature vector, risk and status — `features.py`

See §5 and §6.

---

## 5. The CV feature vector

`CV_FEATURE_SCHEMA_VERSION = "cv-features-v1"`, nine floats in a fixed
order, identical in document-cv-service and fraud-service:

| # | Name | Range | Direction | Source |
|---|---|---|---|---|
| 1 | `ocr_confidence` | 0–1 | higher = better | §4.4 |
| 2 | `amount_confidence` | 0–1 | higher = better | §4.4 |
| 3 | `document_quality` | 0–1 | higher = better | §4.3 |
| 4 | `tampering_score` | 0–1 | higher = worse | §4.5 |
| 5 | `signature_similarity` | 0–1 | higher = better, 0.5 neutral | §4.7 |
| 6 | `layout_consistency` | 0–1 | higher = better | §4.6 |
| 7 | `amount_match` | {0, 0.5, 1} | 1 = matches | §4.8 |
| 8 | `date_validity` | {0, 0.5, 1} | 1 = valid | §4.8 |
| 9 | `duplicate_score` | {0, 1} | 1 = duplicate | §4.8 |

The first six are the specification's vector; the last three are the
additions. When a transaction has **no document**, fraud-service uses the
neutral vector `[0, 0, 0, 0, 0.5, 0.5, 0.5, 0.5, 0]` plus
`has_document = 0`, so "no document" is learnt as uninformative, not as
suspicious.

---

## 6. Document risk policy

`features.risk_score` is a transparent weighted sum of *suspicion* terms:

```
risk = 0.35 · tampering_score
     + 0.20 · (1 − amount_match)
     + 0.15 · duplicate_score
     + 0.10 · (1 − date_validity)
     + 0.10 · (1 − layout_consistency)
     + 0.05 · (1 − document_quality)
     + 0.05 · (1 − signature_similarity)
```

Status thresholds follow the specification's decision matrix (§11):

| risk | status | meaning |
|---|---|---|
| < 0.30 | `CLEAN` | automatic processing |
| 0.30 – 0.70 | `REVIEW` | processed, logged, visible to staff |
| ≥ 0.70 | `SUSPICIOUS` | transaction held for manual verification |

Two overrides make the policy safe by construction:

- A document that could not be read (`ocr_confidence = 0`) is never
  `CLEAN`; it becomes `REVIEW`.
- A hard finding lifts the verdict to at least `REVIEW` whatever the
  weighted score says: `duplicate_document`, `amount_mismatch` or
  `invalid_date` (the check is outside its validity window).
  `requires_review` is therefore `status != CLEAN`.

`reasons` lists the triggered conditions (`tampering_signals`,
`amount_mismatch`, `duplicate_document`, `invalid_date`, `layout_anomaly`,
`low_quality`, `ocr_unavailable`, `currency_mismatch`) so the UI can
explain the verdict in plain words.

---

## 7. Transaction gating and held transactions

In `account.service.js`:

```
checkDocument(client, documentId, owner, declaredAmount)
   FOR UPDATE on fraud_db.document_analyses
   → NOT_FOUND | FORBIDDEN (other owner) | DOCUMENT_ALREADY_USED (409)
   → VALIDATION_ERROR when expected_amount ≠ declared amount
holdDecision(doc)
   status ∈ DOCUMENT_HOLD_ON_STATUS           (default SUSPICIOUS)
   or reasons ∩ DOCUMENT_HOLD_ON_REASONS ≠ ∅  (default duplicate_document, amount_mismatch)
   → reason string, else null
```

A held transaction stores the **exact request body** (minus `documentId`,
kept in its own column), the customer, the account, the reason and the
document's risk. Release re-executes that body through the same
`executeRequestTx` used by `POST /transactions`, with `onBehalfOf` set to
the customer (so the account ownership rule still holds) and the staff
member as `initiated_by`. Because release runs inside `withTransaction`,
the hold decision, the ledger rows, the balance update, the outbox event
and the document link commit together, or not at all.

Why hold instead of reserving funds: a reservation would need a pending
ledger state and partial-balance semantics across every read path. Parking
the request keeps the ledger append-only and the balance exact; the
customer sees the hold in the overview banner and under
`GET /transactions/holds`.

---

## 8. Integration with the quantum fraud pipeline (feature schema v2)

`fraud-features-v2` has 17 dimensions:

```
[ log1p_amount, hour_sin, hour_cos, dow_sin, dow_cos, rolling_24h_count, log1p_rolling_24h_sum ]   7 transaction features
[ has_document ]                                                                                1 flag
[ ocr_confidence … duplicate_score ]                                                            9 CV features (§5)
```

- `features.build_features(redis, event, cv)` concatenates them; `cv` is
  the document's `features` JSON, fetched by `store.get_document_features`
  when the event carries `documentId`.
- Both models are trained on the v2 synthetic dataset (`dataset.py`):
  35 % of normal and 55 % of fraudulent rows carry a document; fraudulent
  documents have elevated tampering, frequent amount mismatches, invalid
  dates and occasional duplicates. The generator is deliberately described
  as synthetic in the comparative report.
- The VQC pipeline is unchanged: `StandardScaler → PCA(17 → 4) →
  ZZFeatureMap(4) → RealAmplitudes → COBYLA`. Changing the schema version
  invalidates the stored bundles, so the first boot retrains (about one to
  two minutes on CPU; the bundles persist on the `fraud_models` volume).
- The decision policy stays the Phase 6.1 blend
  (`0.7 × classical + 0.3 × quantum`, `FRAUD_QUANTUM_WEIGHT`).

---

## 9. Storage, encryption and privacy

Checks are personal financial documents, so the service uses **envelope
encryption** (`crypto.py`):

```
DEK  (32 bytes, per document)   ← BB84-derived from the quantum KMS when reachable
                                   (POST /kms/keys, then the read-once GET), else os.urandom
image ─AES-256-GCM(DEK, nonce, aad=document_id)─► ciphertext   → /data/documents/<id>.bin
DEK   ─AES-256-GCM(MK,  nonce, aad=document_id)─► wrapped_dek  → document_analyses.wrapped_dek
MK   = DOCUMENT_MASTER_KEY (32 bytes, base64 or hex)            → only in the service's environment
```

- The `document_id` is bound as associated data, so a ciphertext or a
  wrapped key cannot be swapped between documents.
- Rotating the master key means re-wrapping the small DEKs, not
  re-encrypting images.
- The KMS path gives the quantum layer a concrete production role: each
  stored document is protected by a key whose randomness came from a BB84
  session (`key_source = bb84-kms`, `kms_kid` recorded). Customers do not
  hold staff tokens, so their uploads use `os.urandom` unless the service
  is given a staff credential; the source is always recorded.
- The blob store writes to a temp file and `os.replace`s it (atomic), and
  `fsync`s before renaming.
- Images are decrypted **only** on `GET /documents/:id/image`, served with
  `Cache-Control: private, no-store`, to the owner or staff.
- The stored copy is the re-encoded JPEG with all metadata removed (§4.1).
- In production (`APP_ENV=production`) the service refuses to start without
  `DOCUMENT_MASTER_KEY`.

---

## 10. Data model

`fraud_db.document_analyses` (one row per upload)

| Column | Purpose |
|---|---|
| `document_id` UUID PK | returned to the client |
| `owner_user_id` | uploader; ownership checks |
| `kind`, `mime`, `size_bytes`, `sha256` | file identity |
| `phash` CHAR(16) | perceptual hash for duplicate detection |
| `status`, `risk_score`, `requires_review`, `reasons` | verdict (§6) |
| `features` JSONB | the 9 CV features (§5), read by fraud-service |
| `ocr`, `integrity`, `quality`, `signature` JSONB | full diagnostics for staff |
| `expected_amount`, `expected_currency` | what the customer declared |
| `duplicate_of` | earlier document id when a duplicate |
| `transaction_id` | set when attached (single use) |
| `enc_nonce`, `wrapped_dek`, `wrap_nonce`, `key_source`, `kms_kid` | envelope (§9) |
| `reviewed_by`, `reviewed_at`, `review_note` | staff annotation |

`fraud_db.signature_templates` — `user_id` PK, HOG `descriptor` JSONB,
`crop_png` BYTES, `enrolled_by`, `enrolled_at`.

`ledger_db.held_transactions` — `id`, `user_id`, `account_id`, `kind`,
`request` JSONB, `document_id`, `reason`, `risk_score`, `status`
(`PENDING_REVIEW | RELEASED | REJECTED`), `decided_by`, `decided_at`,
`decision_note`, `transaction_id`.

`ledger_db.ledger_entries.document_id` — new nullable column on every leg.

Fresh clusters get all of this from `scripts/init-db.sql`; existing ones
apply `scripts/migrations/003_cv_extension.sql` (`make db-migrate`).

---

## 11. API reference

All routes go through the gateway and require a Bearer token.

### Documents

| Method and path | Role | Body / params | Returns |
|---|---|---|---|
| `POST /documents/analyze` | any | multipart: `file` (JPEG/PNG ≤ 10 MB), `expectedAmount?`, `expectedCurrency?`, `kind?` | `201` analysis (below); `400` with `EMPTY_FILE`, `UNSUPPORTED_FORMAT`, `CORRUPT_IMAGE`, `IMAGE_TOO_SMALL`, `IMAGE_TOO_LARGE`; `413 FILE_TOO_LARGE`; `415` if not multipart |
| `GET /documents/:id` | owner or staff | | analysis |
| `GET /documents/:id/image` | owner or staff | | decrypted `image/jpeg` |
| `GET /documents?status=&owner=&limit=` | staff | | `{ documents: [...] }` |
| `POST /documents/:id/review` | staff | `{ note }` | marks reviewed |
| `POST /documents/signatures/:userId` | staff | multipart `file` | `201 { ok, userId, bbox, descriptorDim }` |
| `GET /documents/signatures/:userId` | staff | | `{ enrolled }` |

Analysis object (abridged):

```json
{
  "documentId": "24f81613-…", "ownerUserId": "…", "kind": "CHECK",
  "status": "CLEAN", "riskScore": 0.1933, "requiresReview": false, "reasons": [],
  "features": { "ocr_confidence": 0.92, "amount_confidence": 0.91, "document_quality": 0.72,
                "tampering_score": 0.41, "signature_similarity": 0.5, "layout_consistency": 0.88,
                "amount_match": 1, "date_validity": 1, "duplicate_score": 0 },
  "featureNames": ["ocr_confidence", "…"], "featureSchemaVersion": "cv-features-v1",
  "ocr": { "available": true, "fields": { "amount": 320, "currency": "TND", "date": "2026-10-08",
           "payee": "Karim Ben Ali", "document_number": "778812", "bank": "BIAT" },
           "confidences": { "amount": 0.91, "date": 0.95, "payee": 0.90 }, "mean_confidence": 0.92 },
  "integrity": { "ela_score": 0.52, "noise_inconsistency": 0.31, "blockiness": 0.0, "copy_move": 0.0, "tampering_score": 0.41 },
  "quality": { "document_quality": 0.72, "sharpness": 1, "exposure": 0.8, "contrast": 0.6, "resolution": 1, "skew_deg": 0, "perspective_corrected": true },
  "signature": { "present": true, "bbox": [998, 441, 328, 95], "similarity": 0.5, "compared": false },
  "expectedAmount": 320, "expectedCurrency": "TND", "duplicateOf": null, "transactionId": null,
  "createdAt": "2026-10-09T10:01:12+00:00", "keySource": "os.urandom", "sha256": "…"
}
```

### Transactions and holds

| Method and path | Role | Notes |
|---|---|---|
| `POST /transactions` | any | accepts `documentId`; `201` executed, `202 { held: true, holdId, reason, documentStatus }` when parked; `409 DOCUMENT_ALREADY_USED`; `403` when the document belongs to someone else |
| `GET /transactions/holds?status=` | any | the caller's holds |
| `GET /admin/holds?status=PENDING_REVIEW|RELEASED|REJECTED|all` | staff | holds joined with the document status |
| `POST /admin/holds/:id/release` | staff | `{ note }` → executes; returns the transaction |
| `POST /admin/holds/:id/reject` | staff | `{ note }` |
| `GET /ledger/transactions/:txId` | staff | legs now include `document_id` |
| `POST /fraud/score` | staff | accepts `documentId` or inline `document` |

Kafka: `document.analyzed` `{ type: "DOCUMENT_ANALYZED", documentId, ownerUserId, kind, status, riskScore, requiresReview, reasons, features, featureSchemaVersion, timestamp }`.

---

## 12. Configuration

| Variable | Default | Where | Purpose |
|---|---|---|---|
| `DOCUMENT_MASTER_KEY` | dev fallback | cv-service | 32-byte master key (base64/hex); required in production |
| `DOCUMENT_STORE_DIR` | `/data/documents` | cv-service | ciphertext volume |
| `DOCUMENT_MAX_BYTES` | 10 MB | cv-service | upload cap |
| `DOCUMENT_MAX_PIXELS` | 40 MP | cv-service | decompression-bomb guard |
| `DOCUMENT_WORK_MAX_SIDE` | 1600 | cv-service | working resolution |
| `DOCUMENT_REVIEW_THRESHOLD` / `DOCUMENT_SUSPICIOUS_THRESHOLD` | 0.30 / 0.70 | cv-service | status cut-offs |
| `DOCUMENT_DUPLICATE_HAMMING` | 6 | cv-service | pHash distance for duplicates |
| `DOCUMENT_STALE_DAYS` | 180 | cv-service | date validity window |
| `TESSERACT_LANGS` | `eng+fra` | cv-service | OCR languages |
| `KMS_SERVICE_URL` | `http://kms-service:3006` | cv-service | quantum DEK source |
| `DOCUMENT_KAFKA_ENABLED` / `DOCUMENT_TOPIC` | true / `document.analyzed` | cv-service | event publishing |
| `DOCUMENT_HOLD_ON_STATUS` | `SUSPICIOUS` | account-service | statuses that hold |
| `DOCUMENT_HOLD_ON_REASONS` | `duplicate_document,amount_mismatch` | account-service | reasons that hold |
| `DOCUMENT_CV_SERVICE_URL` | `http://document-cv-service:3008` | gateway | upstream |
| `UPLOAD_LIMIT` | `12mb` | gateway | raw multipart cap |

---

## 13. Frontends

**Customer wizard** (`customer_frontend/src/components/DocumentUpload.jsx`):
an optional "Supporting document" block on the Details step for every kind.
Pick a JPEG/PNG → preview → *Analyse document* (sends the typed amount) →
status pill, risk, OCR amount/date/payee, tampering percentage, reasons in
plain language. The review step shows the document; the confirm request
carries `documentId`. A `202` renders the **Under review** screen with the
hold reference and reason, and the Overview shows a banner while holds are
pending.

**Staff portal** (`staff_frontend/src/pages/DocumentReviewPage.jsx`), under
a new *Documents* group for admins and employees:
- *Document review*: pending/released/rejected holds, the parked request,
  the decrypted image, OCR fields, signal bars, a decision note, and
  *Release & execute* / *Reject*.
- *Analysed documents*: every upload with status, risk, reasons, link state.
- *Signature enrolment*: customer id + image.

---

## 14. Running it

```bash
# 1. Build and start the whole stack (adds document-cv-service on :3008)
cd infrastructure && cp .env.example .env
#    set DOCUMENT_MASTER_KEY=$(openssl rand -base64 32) in .env for anything but a demo
docker compose up -d --build
docker compose ps                   # wait for (healthy); fraud-service retrains on v2 the first time

# 2. Existing cluster? apply the migration
make db-migrate                     # runs scripts/migrations/*.sql, 003 adds the CV tables

# 3. Smoke test
TOKEN=$(curl -s -X POST localhost:3000/auth/customer/login -H 'Content-Type: application/json' \
        -d '{"username":"<customer>","password":"<pw>"}' | jq -r .token)
curl -s -F file=@check.jpg -F expectedAmount=320.0000 -F expectedCurrency=TND \
     -H "Authorization: Bearer $TOKEN" localhost:3000/documents/analyze | jq '{status,riskScore,reasons,ocr:.ocr.fields}'

# 4. Frontends
cd customer_frontend && npm run dev     # New transaction → Details → Supporting document
cd staff_frontend    && npm run dev     # Documents → Document review
```

Direct service health: `GET :3008/health` reports `ocr: true|false` and the
feature schema; `GET :3008/ready` checks the database.

---

## 15. Testing and verification

| Layer | Command | What it proves |
|---|---|---|
| cv-service unit (19 tests) | `cd services/document-cv-service && python -m pytest tests -q` | validation and EXIF stripping, deskew, quality, amount/date parsing, field extraction, tampering detection on a spliced patch, layout scoring, signature detection and self-similarity, risk thresholds, envelope round-trip and tamper detection, full pipeline on a synthetic check (OCR assertions run when Tesseract is installed) |
| account-service unit (92) | `cd services/account-service && npm test` | document gate: clean executes and links, suspicious holds with nothing written, reasons policy, ownership/reuse/amount/format checks, release executes as staff, reject, 409/403/404 |
| fraud-service unit (15) | `cd services/fraud-service && python -m pytest tests -q` | v2 vector shape and neutrality, dataset v2 planting |
| gateway unit (28) | `cd services/api-gateway && npm test` | multipart passthrough with boundary, 415 on JSON, staff-only listing and enrolment |
| **CV end-to-end (36 checks)** | `make e2e-cv` | the whole flow against the live stack, see below |
| API regression (72) / UI (11) | `make e2e-api`, `make e2e-ui` | nothing else regressed; the wizard attaches and analyses a document; staff opens the decrypted image |

`make e2e-cv` generates four synthetic checks (clean, spliced patch, wrong
amount, stale date) and verifies: 415 and 401 handling; OCR reads
`320.000 TND`, `2026-10-08`, payee, number and bank; status `CLEAN`;
ownership (403 for another customer), image decryption for the owner,
staff-only listing; attaching executes the transfer and links the document;
re-use is refused (409); the ledger legs carry `document_id`; re-uploading
the same check is flagged as a duplicate and the transaction is **held**
with no balance change; amount mismatch and stale date are detected; the
spliced patch raises the tampering score; staff list, reject (then 409 on a
second decision) and release a hold, after which the balance and the
reconciliation are exact; the fraud scorer joins the document into a
17-dimension v2 vector; both models report `fraud-features-v2`; signature
enrolment and comparison work. The run that produced the numbers in this
document passed 36/36.

---

## 16. Evaluation: with vs without CV features

`python -m src.eval_compare` (fraud-service) now prints an `ablation` block:
the classical model trained and evaluated on the full 17 features, on the
7 transaction features only, and the 9 CV features alone on rows that
have a document. On the synthetic generator all three sit at ROC-AUC ≈ 1.0,
which says only that the planted signals are separable, not that the CV
module detects real forgeries. The honest reading: the plumbing is correct
(features reach both models, the ablation harness works), the measurement
has to be redone on real labelled scans before any claim about detection
power is made. The VQC side of the comparison is unchanged from
`docs/comparative-analysis.md`.

---

## 17. Security considerations

- Uploads are authenticated at the gateway and again in the service; the
  body is bounded (12 MB raw, 10 MB file) and never parsed by the gateway.
- Magic-byte detection, `Image.verify`, pixel-count limit and minimum size
  stop malformed, oversized and decompression-bomb images before OpenCV.
- Metadata is stripped by re-encoding; the original bytes are never stored.
- Images are encrypted at rest with per-document keys wrapped by a master
  key that only the CV service holds; decryption is on demand, to the owner
  or staff, with `no-store` caching.
- Documents are single-use and owner-bound at the database row level
  (`FOR UPDATE`), so a document cannot be replayed, shared or raced.
- The `expected_amount` check closes the "analyse for 10, spend 10 000"
  loophole.
- A held transaction writes nothing to the ledger; release goes through the
  same atomic path and records the staff member.
- Everything is logged with the request id propagated by the gateway.

---

## 18. Limitations and calibration notes

- **Tampering heuristics are heuristics.** ELA, noise and blockiness are
  sensitive to how an image was produced. On the synthetic test checks the
  clean image already scores `tampering ≈ 0.40` and the spliced one
  `≈ 0.45`; the weights and the 0.30/0.70 thresholds must be calibrated on
  real scans and photos from the bank's actual capture channels before
  going live. The `integrity` block exposes every sub-signal for that.
- **OCR is layout-agnostic.** Field extraction relies on keyword hints and
  number patterns; a bank-specific template (zones per bank) would be more
  reliable and is a natural next step.
- **Signature verification is experimental**, as the specification says:
  HOG + ORB similarity is a heuristic, not a forensic method, and it needs
  a clean enrolled reference per customer.
- **Synthetic training data** (§16).
- **No queue.** Analysis is synchronous (≈ 1 s). For high volume, move the
  pipeline behind a worker consuming `document.uploaded` and let the wizard
  poll; the API shapes already allow it.
- **Retention.** There is no automatic deletion yet; add a retention job
  that removes blobs and rows after the regulatory period.

---

## 19. Mapping to the original specification

| Spec section | Implementation |
|---|---|
| §2 architecture: Frontend → Gateway → CV service → features → PCA → quantum encoding → VQC | §2, §8 |
| §3 UC-01 upload → validate → preprocess → OCR → tampering/signature → features → QNN | §3.1, §4 |
| §4.1 JPG/PNG ≤ 10 MB, resize, denoise, perspective, rotation, contrast, normalise | §4.1–4.2 |
| §5 OCR fields with confidences | §4.4 |
| §6 integrity (regions, fonts/alignment, compression artefacts) | §4.5–4.6 |
| §7 signature similarity (experimental) | §4.7 |
| §8 six-feature vector | §5 (+3 cross-check features) |
| §9–10 append CV features to transaction vector → PCA → feature map → VQC | §8 |
| §11 decision matrix 0.30 / 0.70, suspended transaction + manual verification | §6, §7 |
| §12 Python, OpenCV, Tesseract, Qiskit | FastAPI + OpenCV + Tesseract; Qiskit untouched |
| §13 `POST /api/cv/analyze` + Kafka `DocumentAnalyzed` | `POST /documents/analyze` + `document.analyzed` |
| §17 MVP items | all delivered; "advanced" items delivered: signature, Kafka, deployment, ablation harness |
| Gaps the spec left | document ↔ transaction linking, single use, amount consistency, holds with staff release, encrypted storage with quantum keys, duplicates, date validity, multipart transport, synthetic data v2 |

---

## 20. File map

```
services/document-cv-service/
  Dockerfile, requirements.txt
  src/app.py          FastAPI routes, auth wiring, envelope + storage + events
  src/config.py       environment knobs
  src/auth.py         JWT dependency (same contract as the other services)
  src/preprocess.py   validation, EXIF strip, resize, perspective, denoise, deskew, CLAHE, quality
  src/ocr.py          Tesseract, field extraction, amount/date parsing, cross-checks
  src/integrity.py    ELA, noise, blockiness, copy-move, layout consistency
  src/signature.py    locate, describe (HOG), compare (HOG + ORB)
  src/features.py     feature vector, risk formula, status, reasons
  src/pipeline.py     orchestration + perceptual hash
  src/crypto.py       envelope encryption, KMS data keys
  src/store.py        CockroachDB + blob store
  src/events.py       Kafka producer
  tests/              19 unit tests + synthetic check generator
services/account-service/src/repositories/document.repository.js   document lock/link, holds
services/account-service/src/account.service.js                    checkDocument, holdDecision, executeRequestTx, decideHold
services/fraud-service/src/features.py, dataset.py, eval_compare.py v2 schema, data, ablation
services/api-gateway/src/app.js                                     multipart passthrough, /documents, /admin/holds
scripts/init-db.sql, scripts/migrations/003_cv_extension.sql        schema
scripts/e2e/cv-workflow.mjs, scripts/e2e/make_checks.py             end-to-end verification
customer_frontend/src/components/DocumentUpload.jsx                 wizard step
staff_frontend/src/pages/DocumentReviewPage.jsx                     staff pages
```
