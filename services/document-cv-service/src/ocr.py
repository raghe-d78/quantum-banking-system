"""
OCR module & confidence extraction (spec §5).

Tesseract (via pytesseract) returns word boxes with per-word confidences.
Fields are located with regular expressions over the recognised text and
each field's confidence is the mean confidence of the words that matched.
If the tesseract binary is missing the module degrades: ocr_available=False,
all confidences 0, which the risk policy treats as "unverified", not "fraud".

Fields (spec §5): document_number, date, payee, amount, currency, bank.
"""
from __future__ import annotations
import logging
import re
import shutil
from dataclasses import dataclass, field
from datetime import date, datetime

import numpy as np

from .config import TESSERACT_LANGS

log = logging.getLogger("cv.ocr")

TESSERACT_AVAILABLE = shutil.which("tesseract") is not None

BANKS = ["BIAT", "BNA", "STB", "ATTIJARI", "AMEN BANK", "UIB", "BH BANK", "ZITOUNA", "ATB", "UBCI", "BTK", "QNB", "BANQUE", "BANK"]
CURRENCY_RE = re.compile(r"\b(TND|DT|DINARS?|EUR|€|USD|\$)\b", re.I)
AMOUNT_RE   = re.compile(r"(?<![\d/])(\d{1,3}(?:[ .,]\d{3})*(?:[.,]\d{1,3})?|\d+(?:[.,]\d{1,3})?)(?![\d/])")
DATE_RES    = [
    (re.compile(r"\b(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})\b"), "dmy"),
    (re.compile(r"\b(\d{4})[/.\-](\d{1,2})[/.\-](\d{1,2})\b"), "ymd"),
]
DOCNO_RE    = re.compile(r"\b(?:N[°o]?\s*[:.]?\s*)?(\d{6,12})\b")
PAYEE_HINTS = [r"pay(?:ez)?\s+(?:to\s+the\s+order\s+of|à\s+l'ordre\s+de|a\s+l'ordre\s+de|to)\s*[:\-]?\s*(.+)", r"ordre\s+de\s*[:\-]?\s*(.+)", r"b[ée]n[ée]ficiaire\s*[:\-]?\s*(.+)"]
AMOUNT_HINTS = [r"(?:montant|amount|somme)\s*[:\-]?\s*", r"(?:TND|DT)\s*"]


@dataclass
class Word:
    text: str
    conf: float
    x: int
    y: int
    w: int
    h: int
    line: tuple


@dataclass
class OCRResult:
    available: bool
    words: list[Word] = field(default_factory=list)
    text: str = ""
    fields: dict = field(default_factory=dict)        # name -> value
    confidences: dict = field(default_factory=dict)   # name -> 0..1
    mean_confidence: float = 0.0


def run_tesseract(gray: np.ndarray) -> list[Word]:
    import pytesseract
    data = pytesseract.image_to_data(gray, lang=TESSERACT_LANGS, config="--oem 3 --psm 6", output_type=pytesseract.Output.DICT)
    words = []
    for i, txt in enumerate(data["text"]):
        t = (txt or "").strip()
        if not t:
            continue
        try:
            conf = float(data["conf"][i])
        except (TypeError, ValueError):
            conf = -1
        if conf < 0:
            continue
        words.append(Word(t, conf / 100.0, int(data["left"][i]), int(data["top"][i]), int(data["width"][i]), int(data["height"][i]),
                          (int(data["block_num"][i]), int(data["par_num"][i]), int(data["line_num"][i]))))
    return words


def _lines(words: list[Word]) -> list[list[Word]]:
    out: dict = {}
    for w in words:
        out.setdefault(w.line, []).append(w)
    return [sorted(v, key=lambda w: w.x) for _, v in sorted(out.items())]


def _conf_of(words: list[Word], needle: str) -> float:
    toks = [w for w in words if w.text and w.text in needle]
    return float(np.mean([w.conf for w in toks])) if toks else 0.0


def parse_amount(s: str) -> float | None:
    s = s.strip().replace(" ", "")
    if not s:
        return None
    # "1.250,500" / "1,250.500" / "1250,5" / "1250.500"
    if "," in s and "." in s:
        if s.rfind(",") > s.rfind("."):
            s = s.replace(".", "").replace(",", ".")
        else:
            s = s.replace(",", "")
    elif "," in s:
        head, _, tail = s.rpartition(",")
        s = (head.replace(",", "") + "." + tail) if len(tail) in (1, 2, 3) and head else s.replace(",", "")
    try:
        v = float(s)
        return v if 0 < v < 1e9 else None
    except ValueError:
        return None


def parse_date(m: re.Match, kind: str) -> date | None:
    try:
        if kind == "dmy":
            d, mth, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        else:
            y, mth, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
        return date(y, mth, d)
    except ValueError:
        return None


def extract_fields(words: list[Word]) -> tuple[dict, dict]:
    """Regex field extraction over OCR text. Returns (fields, confidences)."""
    lines = _lines(words)
    line_texts = [" ".join(w.text for w in ln) for ln in lines]
    full = "\n".join(line_texts)
    fields: dict = {}
    conf: dict = {}

    # currency
    m = CURRENCY_RE.search(full)
    if m:
        cur = m.group(1).upper()
        fields["currency"] = "TND" if cur in ("DT", "DINAR", "DINARS", "TND") else ("EUR" if cur in ("EUR", "€") else "USD")
        conf["currency"] = _conf_of(words, m.group(1))

    # amount: prefer a number following an amount hint or followed by a currency; else the largest decimal number
    candidates: list[tuple[float, float, int]] = []  # (value, conf, priority)
    for ln, txt in zip(lines, line_texts):
        for hint in AMOUNT_HINTS:
            for hm in re.finditer(hint + r"(\d[\d .,]*)", txt, re.I):
                v = parse_amount(hm.group(1))
                if v is not None:
                    candidates.append((v, _conf_of(ln, hm.group(1)), 3))
        for am in AMOUNT_RE.finditer(txt):
            after = txt[am.end():am.end() + 6]
            v = parse_amount(am.group(1))
            if v is None:
                continue
            pri = 2 if CURRENCY_RE.match(after.strip()) else (1 if ("," in am.group(1) or "." in am.group(1)) else 0)
            candidates.append((v, _conf_of(ln, am.group(1)), pri))
    if candidates:
        best = max(candidates, key=lambda c: (c[2], c[0]))
        fields["amount"] = round(best[0], 3)
        conf["amount"] = best[1]

    # date
    for rx, kind in DATE_RES:
        dm = rx.search(full)
        if dm:
            d = parse_date(dm, kind)
            if d:
                fields["date"] = d.isoformat()
                conf["date"] = _conf_of(words, dm.group(0))
                break

    # document number: prefer one near "N°"
    nm = re.search(r"N[°o]?\s*[:.]?\s*(\d{6,12})", full, re.I) or DOCNO_RE.search(full)
    if nm:
        fields["document_number"] = nm.group(1)
        conf["document_number"] = _conf_of(words, nm.group(1))

    # payee
    for txt, ln in zip(line_texts, lines):
        for hint in PAYEE_HINTS:
            pm = re.search(hint, txt, re.I)
            if pm:
                name = re.sub(r"[^A-Za-zÀ-ÿ' .-]", " ", pm.group(1)).strip()
                name = re.split(r"\s{2,}|\s(?:montant|amount|somme|TND|DT)\b", name, 1, flags=re.I)[0].strip()
                if 2 <= len(name) <= 60:
                    fields["payee"] = name
                    conf["payee"] = _conf_of(ln, name)
                    break
        if "payee" in fields:
            break

    # bank
    up = full.upper()
    for b in BANKS:
        if b in up:
            fields["bank"] = b
            conf["bank"] = _conf_of(words, b.split()[0])
            break

    return fields, conf


def ocr(gray: np.ndarray) -> OCRResult:
    if not TESSERACT_AVAILABLE:
        return OCRResult(available=False)
    try:
        words = run_tesseract(gray)
    except Exception as e:  # noqa: BLE001
        log.warning("tesseract failed: %s", e)
        return OCRResult(available=False)
    fields, confs = extract_fields(words)
    mean_conf = float(np.mean([w.conf for w in words])) if words else 0.0
    return OCRResult(available=True, words=words, text="\n".join(" ".join(w.text for w in ln) for ln in _lines(words)),
                     fields=fields, confidences={k: round(v, 4) for k, v in confs.items()}, mean_confidence=round(mean_conf, 4))


def date_validity(doc_date_iso: str | None, today: date | None = None, stale_days: int = 180) -> tuple[float, str]:
    """1.0 valid, 0.5 unknown, 0.0 post-dated or stale. Returns (score, reason)."""
    if not doc_date_iso:
        return 0.5, "no_date"
    today = today or date.today()
    try:
        d = datetime.fromisoformat(doc_date_iso).date()
    except ValueError:
        return 0.5, "unparseable"
    if d > today:
        return 0.0, "post_dated"
    if (today - d).days > stale_days:
        return 0.0, "stale"
    return 1.0, "valid"


def amount_match(ocr_amount: float | None, expected: float | None, tol: float = 0.01) -> tuple[float, str]:
    """1.0 match within tol, 0.0 mismatch, 0.5 when either side is unknown."""
    if ocr_amount is None or expected is None:
        return 0.5, "unknown"
    if expected <= 0:
        return 0.5, "unknown"
    rel = abs(ocr_amount - expected) / expected
    return (1.0, "match") if rel <= tol else (0.0, f"mismatch({rel:.2%})")
