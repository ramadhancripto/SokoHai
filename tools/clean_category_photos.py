#!/usr/bin/env python3
"""[R13-C 2026-11] Category photos -> one consistent set in assets/img/categories/clean/.
Originals in assets/img/categories/ are never modified or deleted.
- 4:3 centre crop; photos that carry baked-in rounded white corners are inset first
- WebP quality 82, max 1200x900 (no upscaling: sources are 340x255 today)
Usage: python3 tools/clean_category_photos.py [--check]"""
import os, sys
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets/img/categories'); OUT = os.path.join(SRC, 'clean')
# files that are watermarked / off-subject are NOT cleaned (never shown)
REJECTED = {'svc-construction', 'svc-rental', 'huduma', 'vitabu', 'vito', 'kale', 'maagizo', 'svc-coaching', 'svc-writing', 'svc-website'}
def rounded(im):
    w, h = im.size
    return all(min(im.getpixel(p)) > 235 for p in [(1, 1), (w - 2, 1), (1, h - 2), (w - 2, h - 2)])
def clean(path):
    im = Image.open(path).convert('RGB'); w, h = im.size
    if rounded(im):
        dx, dy = int(w * .07), int(h * .07); im = im.crop((dx, dy, w - dx, h - dy)); w, h = im.size
    tw = min(w, int(h * 4 / 3)); th = int(tw * 3 / 4)
    l, t = (w - tw) // 2, (h - th) // 2; im = im.crop((l, t, l + tw, t + th))
    im.thumbnail((1200, 900)); return im
names = sorted(f[:-5] for f in os.listdir(SRC) if f.endswith('.webp') and f[:-5] not in REJECTED)
if '--check' in sys.argv:
    missing = [n for n in names if not os.path.exists(os.path.join(OUT, n + '.webp'))]
    print('clean photos:', len(names) - len(missing), '/', len(names)); sys.exit(1 if missing else 0)
os.makedirs(OUT, exist_ok=True)
for n in names:
    clean(os.path.join(SRC, n + '.webp')).save(os.path.join(OUT, n + '.webp'), 'WEBP', quality=82, method=6)
print('wrote', len(names), 'photos to', OUT)
