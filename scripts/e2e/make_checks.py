#!/usr/bin/env python3
"""Generate synthetic sample checks for the CV end-to-end run (needs Pillow).

    python3 scripts/e2e/make_checks.py            # writes scripts/e2e/samples/*.jpg
    python3 scripts/e2e/make_checks.py --seed 42  # reproducible layout

Every run draws a fresh layout (paper tint, bank logo block, text offsets) so the
perceptual hash differs from previous runs: the service keeps a global duplicate
index, and re-uploading last run's clean check would be (correctly) flagged as a
duplicate and parked for review. clean.jpg and tampered.jpg share a layout (so
the tampering comparison is controlled), the others get their own; uploading clean.jpg
twice is what the duplicate scenario relies on.

clean.jpg     320.000 TND, dated 08/10/2026, payee Karim Ben Ali
tampered.jpg  same, with a spliced noisy patch over the amount
mismatch.jpg  9 500.000 TND (declared amount will be 320)
stale.jpg     45.000 TND dated 01/01/2024 (older than 180 days)
"""
import io, math, os, random, sys
from PIL import Image, ImageDraw, ImageFont

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "samples")


def _font(size):
    for p in ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
              "C:/Windows/Fonts/arial.ttf", "/System/Library/Fonts/Supplemental/Arial.ttf"):
        try:
            return ImageFont.truetype(p, size)
        except OSError:
            continue
    return ImageFont.load_default()


def layout(seed=None) -> dict:
    """Run-specific visual variation (see module docstring). Same seed → same layout."""
    rng = random.Random(seed)
    return {
        "paper": (rng.randint(228, 252), rng.randint(226, 250), rng.randint(214, 244)),
        "ink": (rng.randint(10, 40), rng.randint(20, 60), rng.randint(60, 120)),
        # dark logo block in the empty strip between the amount-in-words line and the signature, never over OCR fields
        "logo": (rng.randint(40, 760), rng.randint(415, 440), rng.randint(120, 460), rng.randint(24, 60)),  # x, y, w, h
        "band": (rng.randint(28, 56), rng.randint(6, 22), rng.randint(40, 200)),  # MICR-like band: offset from bottom, thickness, grey
        "size": (rng.randint(1300, 1560), rng.randint(620, 760)),
        "guilloche": [(rng.randint(0, 1400), rng.randint(0, 600), rng.randint(200, 700), rng.randint(120, 400), rng.choice(["ellipse", "rect"]))
                      for _ in range(4)],  # pale security-pattern shapes behind the text
        "dx": rng.randint(-20, 60), "dy": rng.randint(-20, 50),
        "bank": rng.choice(["BIAT", "BNA", "STB", "ATTIJARI", "AMEN", "UIB", "BH", "ZITOUNA"]),
    }


def make_check(amount="1250.500", date="08/10/2026", payee="Yasmine Trabelsi", number="123456", bank=None,
               signature=True, size=(1400, 620), tamper_patch=False, lay=None) -> bytes:
    lay = lay or layout(0); bank = bank or lay["bank"]; ink = lay["ink"]; dx, dy = lay["dx"], lay["dy"]; size = lay.get("size", size)
    img = Image.new("RGB", size, lay["paper"]); d = ImageDraw.Draw(img); big, med = _font(34), _font(26)
    pale = tuple(max(0, c - 18) for c in lay["paper"])
    for gx, gy, gw, gh, shape in lay.get("guilloche", []):
        (d.ellipse if shape == "ellipse" else d.rectangle)([gx, gy, gx + gw, gy + gh], fill=pale)
    d.rectangle([20, 20, size[0] - 20, size[1] - 20], outline=ink, width=3)
    lx, ly, lw, lh = lay["logo"]; d.rectangle([lx, ly, lx + lw, ly + lh], fill=ink); d.text((lx + 10, ly + 2), bank, font=_font(max(12, lh - 10)), fill=lay["paper"])
    bo, bt, bg = lay["band"]; d.rectangle([40, size[1] - bo - bt, size[0] - 40, size[1] - bo], fill=(bg, bg, bg))
    d.text((50 + dx, 50 + dy), f"{bank} BANK", font=big, fill=ink)
    d.text((size[0] - 420, 50 + dy), f"N° {number}", font=med, fill=ink)
    d.text((size[0] - 420, 100 + dy), f"Date : {date}", font=med, fill=ink)
    d.text((50 + dx, 180 + dy), f"Payez a l'ordre de : {payee}", font=med, fill=ink)
    d.text((50 + dx, 260 + dy), f"Montant : {amount} TND", font=big, fill=ink)
    d.text((50 + dx, 340 + dy), "La somme de mille deux cent cinquante dinars et 500 millimes", font=med, fill=ink)
    if signature:
        pts = [(size[0] - 380 + i * 6, 500 + int(40 * math.sin(i / 3.0)) + (i % 7)) for i in range(55)]
        d.line(pts, fill=(10, 10, 60), width=4); d.line([(p[0], p[1] + 12) for p in pts[::2]], fill=(10, 10, 60), width=2)
    if tamper_patch:
        patch = Image.effect_noise((260, 60), 60).convert("RGB")
        buf = io.BytesIO(); patch.save(buf, "JPEG", quality=35); patch = Image.open(buf).convert("RGB")
        img.paste(patch, (190 + dx, 255 + dy))
    out = io.BytesIO(); img.save(out, "JPEG", quality=90); return out.getvalue()


if __name__ == "__main__":
    seed = int(sys.argv[sys.argv.index("--seed") + 1]) if "--seed" in sys.argv else random.SystemRandom().randrange(1 << 31)
    out = sys.argv[sys.argv.index("--out") + 1] if "--out" in sys.argv else OUT
    os.makedirs(out, exist_ok=True); L = [layout(seed * 4 + i) for i in range(4)]   # one layout per check
    open(f"{out}/clean.jpg", "wb").write(make_check(amount="320.000", payee="Karim Ben Ali", number="778812", lay=L[0]))
    open(f"{out}/tampered.jpg", "wb").write(make_check(amount="320.000", payee="Karim Ben Ali", number="778812", tamper_patch=True, lay=L[0]))  # same layout as clean: only the patch differs
    open(f"{out}/mismatch.jpg", "wb").write(make_check(amount="9500.000", payee="Karim Ben Ali", number="778814", lay=L[2]))
    open(f"{out}/stale.jpg", "wb").write(make_check(amount="45.000", date="01/01/2024", payee="STEG", number="778815", lay=L[3]))
    print(f"4 sample checks written to {out} (layout seed {seed})", file=sys.stderr)
