"""Synthetic check images for tests (no real documents needed)."""
from __future__ import annotations
import io
from PIL import Image, ImageDraw, ImageFont


def _font(size):
    for p in ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"):
        try:
            return ImageFont.truetype(p, size)
        except OSError:
            continue
    return ImageFont.load_default()


def make_check(amount="1250.500", date="08/10/2026", payee="Yasmine Trabelsi", number="123456", bank="BIAT",
               signature=True, size=(1400, 620), tamper_patch=False) -> bytes:
    img = Image.new("RGB", size, (248, 246, 240))
    d = ImageDraw.Draw(img)
    big, med = _font(34), _font(26)
    d.rectangle([20, 20, size[0] - 20, size[1] - 20], outline=(40, 60, 100), width=3)
    d.text((50, 50), f"{bank} BANK", font=big, fill=(20, 30, 60))
    d.text((size[0] - 420, 50), f"N° {number}", font=med, fill=(20, 30, 60))
    d.text((size[0] - 420, 100), f"Date : {date}", font=med, fill=(20, 30, 60))
    d.text((50, 180), f"Payez a l'ordre de : {payee}", font=med, fill=(20, 30, 60))
    d.text((50, 260), f"Montant : {amount} TND", font=big, fill=(20, 30, 60))
    d.text((50, 340), "La somme de mille deux cent cinquante dinars et 500 millimes", font=med, fill=(20, 30, 60))
    if signature:
        # hand-written-looking stroke in the bottom-right
        pts = [(size[0] - 380 + i * 6, 500 + int(40 * __import__("math").sin(i / 3.0)) + (i % 7)) for i in range(55)]
        d.line(pts, fill=(10, 10, 60), width=4)
        d.line([(p[0], p[1] + 12) for p in pts[::2]], fill=(10, 10, 60), width=2)
    if tamper_patch:
        # paste a differently compressed, noisy patch over the amount (simulated splice)
        patch = Image.effect_noise((260, 60), 60).convert("RGB")
        buf = io.BytesIO(); patch.save(buf, "JPEG", quality=35); patch = Image.open(buf).convert("RGB")
        img.paste(patch, (190, 255))
    out = io.BytesIO(); img.save(out, "JPEG", quality=90)
    return out.getvalue()
