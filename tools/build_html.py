#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SOKOHAI — HTML BUILD TOOL (Phase 2.7)
=======================================
Inagawanya index.html (faili moja kubwa) kuwa vipande huru vilivyo kwenye
folder `html/`, kila kimoja kikiwa na kazi yake (kama css/ na js/app/).

Matumizi:
    python3 tools/build_html.py split    # (mara moja) gawanya index.html -> html/
    python3 tools/build_html.py build    # kusanya html/ -> index.html
    python3 tools/build_html.py check    # thibitisha html/ inajenga index.html sawa

Kanuni: mkutano wa vipande NI byte-exact — index.html inayotokana na `build`
inalingana 100% na faili ya asili (hakuna mabadiliko ya runtime).
"""
import io
import os
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HTML_DIR = os.path.join(BASE, 'html')
INDEX = os.path.join(BASE, 'index.html')

# Mpangilio WA MUHIMU: kila fragment inaanza kwenye marker yake (ya kipekee).
FRAGMENTS = [
    ('00-head.html',                '<body>'),
    ('01-shell.html',               '<!-- INPUTS KWA AJILI YA FILES -->'),
    ('02-inputs.html',              '<!-- CATEGORY MODAL'),
    ('03-modals-core.html',         '<!-- LOGIN / SIGNUP MODAL'),
    ('04-modal-auth.html',          '<!-- PRODUCT DETAILS MODAL'),
    ('05-modals-market.html',       '<!-- CHAT MODAL'),
    ('06-modals-social.html',       '<!-- USER PAYMENT SETTINGS MODAL'),
    ('07-modal-payment.html',       '<!-- SOKOHAI UNIFIED TRANSPORT REQUEST MODAL'),
    ('08-modal-transport.html',     '<!-- ADMIN SETTINGS MODAL'),
    ('09-admin-sell.html',          '<!-- FOMU YA AGENT'),
    ('10-form-agent.html',          '<!-- FOMU YA KUSAJILI CHOMBO (DEREVA)'),
    ('11-form-driver.html',         '<!-- FOMU YA WAKALA KUSAJILI MWANACHAMA (OFFLINE)'),
    ('12-form-offline.html',        '<!-- FOMU YA KUHARIRI TANGAZO (EDIT MODAL)'),
    ('13-form-edit.html',           '<!-- 1. LEFT SIDEBAR OF SOKOPAY'),
    ('14-haipay.html',              '<!-- MAIN MENU (PLUS BUTTON)'),
    ('15-main-menu.html',           '<!-- 1. Top Row -->'),
    ('16-topnav.html',              '<!-- Kitufe cha Kategoria & Subcategories (chini ya Ads Card) -->'),
    ('17-sliders.html',             '<!-- 5 KPI CARDS ROW -->'),
    ('18-buyer-view.html',          '<!-- 1. HOME -->'),
    ('19-bottomnav.html',           '<!-- RATING & REVIEWS MODAL'),
    ('20-modal-rating.html',        '<!-- ===== SOKOHAI APP ENGINE (Phase 2 refactor) ===== -->'),
    ('21-scripts.html',             None),  # hadi mwisho wa faili
]


def read(path):
    with io.open(path, encoding='utf-8') as f:
        return f.read()


def write(path, s):
    with io.open(path, 'w', encoding='utf-8') as f:
        f.write(s)


def fragment_ranges(text):
    """Rudisha orodha ya (jina, start, end). Marker_i ni MWISHO wa fragment i
    (na mwanzo wa fragment i+1). Fragment 0 inaanza kwenye byte 0."""
    bounds = []
    for name, marker in FRAGMENTS:
        if marker is None:
            bounds.append(len(text))
            continue
        idx = text.find(marker)
        if idx == -1:
            raise SystemExit('MARKER HAIPATIKANI: %r' % marker)
        # hakikisha marker ni ya kipekee katika faili nzima
        if text.count(marker) != 1:
            raise SystemExit('MARKER SI YA KIPEKEE: %r (imeonekana %d x)' % (marker, text.count(marker)))
        bounds.append(idx)

    ranges = []
    prev = 0
    for i, (name, _marker) in enumerate(FRAGMENTS):
        end = bounds[i]
        ranges.append((name, prev, end))
        prev = end
    return ranges


def do_split():
    if not os.path.exists(INDEX):
        raise SystemExit('index.html haipo: %s' % INDEX)
    text = read(INDEX)
    ranges = fragment_ranges(text)
    os.makedirs(HTML_DIR, exist_ok=True)
    total = 0
    for name, start, end in ranges:
        chunk = text[start:end]
        write(os.path.join(HTML_DIR, name), chunk)
        total += len(chunk)
        print('  + %-28s %8d chars' % (name, len(chunk)))
    if total != len(text):
        raise SystemExit('JUMLA HAILINGANI: %d vs %d' % (total, len(text)))
    print('SPLIT OK: %d vipande, %d chars jumla' % (len(ranges), total))


def do_build():
    if not os.path.isdir(HTML_DIR):
        raise SystemExit('Folder ya html/ haipo. Kwanza: python3 tools/build_html.py split')
    names = [n for n, _ in FRAGMENTS]
    parts = []
    for n in names:
        p = os.path.join(HTML_DIR, n)
        if not os.path.exists(p):
            raise SystemExit('Kipande kinakosekana: %s' % p)
        parts.append(read(p))
    write(INDEX, ''.join(parts))
    print('BUILD OK: %d vipande -> index.html (%d chars)' % (len(parts), sum(len(x) for x in parts)))


def do_check():
    if not os.path.exists(INDEX):
        raise SystemExit('index.html haipo')
    current = read(INDEX)
    # jenga kwenye kumbukumbu
    names = [n for n, _ in FRAGMENTS]
    rebuilt = ''.join(read(os.path.join(HTML_DIR, n)) for n in names)
    if rebuilt == current:
        print('CHECK OK: html/ inajenga index.html 100% sawa (byte-exact).')
        return 0
    # onyesha tofauti
    for i, (a, b) in enumerate(zip(rebuilt, current)):
        if a != b:
            print('CHECK FAIL: tofauti ya kwanza kwenye byte %d (rebuild=%r vs current=%r)' % (i, a, b))
            break
    print('urefu: rebuilt=%d current=%d' % (len(rebuilt), len(current)))
    return 1


if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'build'
    if cmd == 'split':
        do_split()
    elif cmd == 'build':
        do_build()
    elif cmd == 'check':
        sys.exit(do_check())
    else:
        print(__doc__)
        sys.exit(1)
