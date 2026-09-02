#!/usr/bin/env python3
"""Zamienia katalog skanów na statyczne IIIF — bez serwera obrazu.

    python3 tools/make_iiif.py ../scans

Oczekuje układu `<katalog>/<letter_manifestation_ID>/<cokolwiek>.jpg`, np.

    scans/Smith1_letter_91/01.jpg
    scans/Smith1_letter_91/02.jpg

i zapisuje do `iiif/<letter_manifestation_ID>/`:

    manifest.json          IIIF Presentation 3 — opis kart
    <n>/info.json          IIIF Image 3, profil level0
    <n>/<region>/<size>/0/default.jpg    gotowe kafelki

Profil **level0** znaczy: żadnego serwera, tylko pliki. Kafelki są pocięte z góry pod
dokładnie te adresy, o które poprosi przeglądarka, więc całość działa z GitHub Pages,
S3, dowolnego statycznego hostingu — i jest normalnym IIIF-em, więc otworzy to też
Mirador czy Universal Viewer, nie tylko nasz czytnik.

Potem w arkuszu OPUS wystarczy wpisać w kolumnie `iiif_manifest` adres manifestu.

Uwaga na rozmiar: skan strony w 300 dpi to kilkanaście MB kafelków. Repozytorium
GitHuba ma miękki limit 1 GB i 100 GB transferu miesięcznie — przy kilkuset listach
lepiej wrzucić katalog `iiif/` na osobny hosting (R2, S3) i podać tam pełne adresy.
"""

import json
import math
import shutil
import sys
from pathlib import Path

from PIL import Image

TILE = 512
QUALITY = 82
# Skad beda serwowane pliki. Pusty = adresy wzgledne, czyli dziala i lokalnie, i na Pages.
BASE = ""


def scale_factors(w: int, h: int) -> list[int]:
    """Kolejne potęgi dwójki, aż cały obraz zmieści się w jednym kafelku."""
    out, s = [1], 1
    while math.ceil(w / s) > TILE or math.ceil(h / s) > TILE:
        s *= 2
        out.append(s)
    return out


def cut(img: Image.Image, out: Path, base_id: str) -> dict:
    """Tnie jeden obraz na kafelki level0 i zwraca jego info.json."""
    w, h = img.size
    factors = scale_factors(w, h)
    for s in factors:
        step = TILE * s                       # bok regionu w pikselach oryginału
        for ry in range(0, h, step):
            for rx in range(0, w, step):
                rw, rh = min(step, w - rx), min(step, h - ry)
                sw, sh = math.ceil(rw / s), math.ceil(rh / s)
                if sw < 1 or sh < 1:
                    continue
                tile = img.crop((rx, ry, rx + rw, ry + rh)).resize((sw, sh), Image.LANCZOS)
                # Dwa zapisy tego samego kafelka: klienci IIIF 3 proszą o "w,h",
                # część starszych o "w," — 40 kB różnicy, a nie trzeba zgadywać.
                for size in (f"{sw},{sh}", f"{sw},"):
                    d = out / f"{rx},{ry},{rw},{rh}" / size / "0"
                    d.mkdir(parents=True, exist_ok=True)
                    tile.save(d / "default.jpg", "JPEG", quality=QUALITY, optimize=True)

    sizes = [{"width": math.ceil(w / s), "height": math.ceil(h / s)} for s in factors]
    for sz in sizes:                          # cały obraz w każdej skali — na miniatury
        d = out / "full" / f"{sz['width']},{sz['height']}" / "0"
        d.mkdir(parents=True, exist_ok=True)
        img.resize((sz["width"], sz["height"]), Image.LANCZOS).save(
            d / "default.jpg", "JPEG", quality=QUALITY, optimize=True)

    info = {
        "@context": "http://iiif.io/api/image/3/context.json",
        "id": base_id,
        "type": "ImageService3",
        "protocol": "http://iiif.io/api/image",
        "profile": "level0",
        "width": w, "height": h,
        "tiles": [{"width": TILE, "scaleFactors": factors}],
        "sizes": sizes,
    }
    (out / "info.json").write_text(json.dumps(info, indent=1), encoding="utf-8")
    return info


def build(src: Path, dst: Path) -> None:
    letters = sorted(p for p in src.iterdir() if p.is_dir())
    if not letters:
        sys.exit(f"Brak podkatalogów w {src}. Oczekuję {src}/<letter_ID>/<skan>.jpg")

    for d in letters:
        pages = sorted(p for p in d.iterdir()
                       if p.suffix.lower() in {".jpg", ".jpeg", ".png", ".tif", ".tiff"})
        if not pages:
            print(f"  {d.name}: brak obrazów, pomijam")
            continue
        target = dst / d.name
        if target.exists():
            shutil.rmtree(target)
        canvases = []
        for i, page in enumerate(pages, 1):
            img = Image.open(page)
            if img.mode not in ("RGB", "L"):
                img = img.convert("RGB")
            svc = f"{BASE}iiif/{d.name}/{i}"
            info = cut(img, target / str(i), svc)
            canvases.append({
                "id": f"{svc}/canvas", "type": "Canvas",
                "label": {"none": [page.stem]},
                "width": info["width"], "height": info["height"],
                "items": [{
                    "id": f"{svc}/page", "type": "AnnotationPage",
                    "items": [{
                        "id": f"{svc}/annotation", "type": "Annotation", "motivation": "painting",
                        "target": f"{svc}/canvas",
                        "body": {
                            "id": f"{svc}/full/max/0/default.jpg", "type": "Image",
                            "format": "image/jpeg",
                            "width": info["width"], "height": info["height"],
                            "service": [{k: info[k] for k in
                                         ("id", "type", "profile", "width", "height", "tiles", "sizes")}],
                        },
                    }],
                }],
            })
        manifest = {
            "@context": "http://iiif.io/api/presentation/3/context.json",
            "id": f"{BASE}iiif/{d.name}/manifest.json", "type": "Manifest",
            "label": {"none": [d.name]},
            "items": canvases,
        }
        (target / "manifest.json").write_text(
            json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
        n = sum(1 for _ in target.rglob("default.jpg"))
        mb = sum(f.stat().st_size for f in target.rglob("*")) / 1e6
        print(f"  {d.name}: {len(pages)} kart, {n} kafelków, {mb:.1f} MB")
        print(f"    iiif_manifest = {BASE}iiif/{d.name}/manifest.json")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    source = Path(sys.argv[1])
    out_dir = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(__file__).resolve().parent.parent / "iiif"
    out_dir.mkdir(parents=True, exist_ok=True)
    print(f"{source} → {out_dir}")
    build(source, out_dir)
