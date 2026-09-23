# 🔗 SEO — Viungo vya Umma vya Bidhaa (Google)

Huu ni mwongozo wa jinsi bidhaa za SokoHai zinavyopata **viungo vya umma**
(public URLs) ambavyo Google inaweza kuviona na kuviweka kwenye matokeo ya
utafutaji wakati mfumo ukiwa kwenye **production**.

---

## 1) Umbo la kiungo

Kila bidhaa sasa ina kiungo cha kudumu cha aina hii:

```
https://<domain-yako>/p/<id-ya-bidhaa>
```

Mfano:

```
https://sokohai.co.tz/p/Ab12Cd34Ef56
```

Kiungo hicho:
- Hufungua **bidhaa hiyo husika** moja kwa moja (deep-link).
- Huweza **kushirikiwa** kwa WhatsApp/SMS/barua pepe.
- Hukaa **sawa** hata baada ya bidhaa kubadilishwa picha/bei.

Pia kuna aina ya pili (hash) inayotumika ndani ya app:
`https://<domain>/#/product/<id>`. Zote mbili zinafanya kazi.

---

## 2) Vitu ambavyo tayari vimewekwa (code imebadilishwa)

| Sehemu | Nini kimefanyika |
|---|---|
| `js/app/07-product.js` | `openProduct` sasa inaweka URL ya bidhaa kwenye address bar; deep-link (`#/product/{id}` na `/p/{id}`) hufunguliwa kwenye kufungua ukurasa. |
| `html/05-modals-market.html` | Kitufe cha **🔗 share** kimeongezwa kwenye modal ya bidhaa — kinakili kiungo cha umma. |
| `html/00-head.html` | Meta tags za SEO zimeongezwa: `description`, `og:title`, `og:description`, `og:image`, `og:url`, `canonical`. Zinasasishwa kwa kila bidhaa. |
| `functions/index.js` | Function mpya ya **`sitemapXml`** inayotoa sitemap ya XML kwa Google. |
| `robots.txt` | Faili ya robots.txt imeongezwa (kwenye mzizi wa hosting). |
| `firebase.json` | Tayari ina `cleanUrls: true` + rewrite ya SPA (`**` → `/index.html`), kwa hiyo `/p/{id}` inapelekwa kwenye app bila hitilafu. |

---

## 3) Hatua za kufanya unapopeleka production

### A. Weka domain halisi
1. Katika `robots.txt`, badilisha `<DOMAIN>` kuwa domain yako (mfano `sokohai.co.tz`).
2. Katika `functions/.env` ongeza:

   ```
   PUBLIC_BASE_URL=https://sokohai.co.tz
   ```

### B. Pakiwa (deploy)
```bash
firebase deploy --only functions,hosting
```

### C. Sajili sitemap kwenye Google
1. Ingia Google Search Console: https://search.google.com/search-console
2. Ongeza property ya domain yako.
3. Enda **Sitemaps** → weka:

   ```
   https://<domain-yako>/sitemap.xml
   ```

> **Maelezo ya `/sitemap.xml`:** Ili `/sitemap.xml` ifanye kazi kama URL ya kawaida,
> unatakiwa kuongeza rewrite kwenye `firebase.json` inayopeleka `/sitemap.xml` kwenye
> function ya `sitemapXml`. Mfano wa rewrites:

```json
"rewrites": [
  { "source": "/sitemap.xml", "function": "sitemapXml" },
  { "source": "**", "destination": "/index.html" }
]
```

   Baada ya kuongeza hivyo, pakia tena (`firebase deploy --only hosting`).

> **Njia mbadala (bila rewrite):** Unaweza kuwasilisha URL ya function moja kwa moja:
> `https://sitemapxml-<project-id>.europe-west1.cloudfunctions.app/sitemapXml`
> kwenye Google Search Console.

---

## 4) Jinsi Google "huona" bidhaa

Google inaweza kufanya hivi:

1. **Crawl** kiungo `/p/{id}` (kutoka sitemap au kwa kukishiriki).
2. **Render** JavaScript (app hufungua bidhaa hiyo na kujaza `<title>` + meta tags).
3. **Index** ukurasa kwa jina la bidhaa + maelezo.

**Muhimu:**
- Kiungo kinapaswa kuwa na **id halisi** ya bidhaa inayopatikana Firestore.
- Bidhaa iliyofutwa inaonyesha ujumbe "bidhaa haipatikani" — hiyo ni sawa.

---

## 5) Vidokezo vya ziada kwa SEO bora

- **Maelezo ya bidhaa** (description) ndiyo muhimu — hakikisha wauzaji wanaandika
  maelezo mazuri.
- **Picha** za bidhaa zinatumika kama `og:image` (Open Graph) kwenye WhatsApp/Facebook.
- Kwa **matokeo bora**, panga sitemap isasishwe mara kwa mara (Google hupitia tena).
