# BUSINESS OS — MAREKEBISHO YOTE (ZIP kwa GitHub)

**Imetengenezwa:** 2026-11-04 · **Branch:** `feature/seller-builder-business-modes-quantity-core`
**HEAD wakati wa kuunganisha:** `720bca9` (hakuna commit iliyofanywa — mabadiliko yote ni ya *working tree*)

Zip hii ina **mabadiliko yote ya working tree** ya repo ya SokoHai tayari kupelekwa GitHub:

| Aina | Idadi | Ufafanuzi |
|---|---|---|
| M — mabadiliko ya faili zilizopo | **21** | Zinakuja kama `patches/tracked-changes.patch` **na** nakala kamili kwenye `files/` |
| D — faili zilizofutwa | **10** | Zote ni `taxonomy-draft/out/*` (matokeo ya kuzalishwa upya) — orodha kwenye `DELETED-FILES.txt` |
| ?? — faili mpya | **25** | Business OS shell (4), nav model (1), zana/test tools (20) — nakala kwenye `files/` |

**Jumla ya faili za kuongeza/ku-update: 46.**

---

## Yaliyomo

```
BUSINESS-OS-CHANGES-2026-11-04/
├── README.md                  ← faili hii
├── CHANGE-LIST.txt            ← `git status --porcelain` halisi
├── DELETED-FILES.txt          ← faili 10 za kufutwa
├── FILES-INVENTORY.txt        ← orodha ya faili 46 + ukubwa
├── SHA256SUMS.txt             ← checksums za uthibitisho
├── HEAD.txt / BRANCH.txt      ← hali ya git wakati wa kuunganisha
├── patches/
│   └── tracked-changes.patch  ← `git diff HEAD` (M + D), inatumika kwa `git apply`
└── files/                     ← nakala kamili za faili 46 (njia za repo zimehifadhiwa)
```

---

## Njia A (inayopendekezwa): patch + faili mpya

```bash
# 1) Ingia kwenye clone safi ya repo, kwenye branch sahihi
cd /path/to/SokoHai
git checkout feature/seller-builder-business-modes-quantity-core
git pull

# 2) Hakikisha uko kwenye HEAD ile ile (720bca9)
git rev-parse --short HEAD        # inapaswa kuonyesha 720bca9

# 3) Weka mabadiliko ya faili zilizopo (21 M + 10 D)
git apply --check patches/tracked-changes.patch   # hakiki kwanza
git apply patches/tracked-changes.patch

# 4) Ongeza faili mpya 25 (zinakuja tayari na njia za repo)
cp -r files/. .

# 5) Hakiki
git status --porcelain | cut -c1-2 | sort | uniq -c
# inatarajiwa: 10 D / 21 M / 25 ??

# 6) Commit + push (wewe uamue)
git add -A
git commit -m "Business OS: shell, POS page, nav model, phase-3 repairs, test tools"
git push origin feature/seller-builder-business-modes-quantity-core
```

## Njia B (rahisi): nakala za faili pekee

```bash
cp -r files/. /path/to/SokoHai/
cd /path/to/SokoHai
git rm -r --cached taxonomy-draft/out >/dev/null   # kama bado zipo
git status
```

> Njia A ni salama zaidi kwa sababu patch inathibitisha mabadiliko yalidakwa kutoka HEAD `720bca9` (imejaribiwa: `git apply --check` → OK, na faili 21 zote zimezalishwa **byte-exact**).

---

## Muhimu kujua kabla ya push

1. **Hakuna commit/push/merge/deploy iliyofanywa** kwenye mazingira ya ukaguzi. Zip hii ni kifurushi cha mabadiliko pekee.
2. **Hakuna data ya production, hakuna secrets** — hakuna `.env`, service-account key, `node_modules`, `.tmp/`, logs, wala screenshots za test.
3. `index.html` na `html/*.html` zilizobadilika ni **matokeo ya build** (`python3 tools/build_html.py`); `tools/build_html.py check` ilirudisha **byte-exact OK** kabla ya kuunganisha.
4. Faili 10 za `taxonomy-draft/out/*` zilifutwa — kama unataka kuzihifadhi, futa mistari hiyo kwenye patch kabla ya `git apply`, au tumia `git checkout -- taxonomy-draft/out`.
5. Ukaguzi wa preview ulikuta **0 FAIL** kati ya test cases 56, na **6 BLOCKED** (Cloud Functions/emulator — hazihusiani na code hii; tazama `BUSINESS-OS-PREVIEW-INSPECTION-REPORT.md` nje ya zip hii).
