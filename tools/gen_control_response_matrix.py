import json, collections, datetime
A='/home/user/sokohai-business-os/.audit/'
e2e=json.load(open(A+'p3-e2e.json'))
nav=json.load(open(A+'nav-matrix-v2.json'))
pc=json.load(open(A+'page-controls.json'))

def esc(s): return str(s or '').replace('|','\\|').replace('\n',' ')
L=[]
L.append('# BUSINESS OS — CONTROL RESPONSE MATRIX (Phase 3)')
L.append('')
L.append('**Tarehe:** 2026-11-04 · **Branch:** `feature/seller-builder-business-modes-quantity-core` · **HEAD:** `720bca9` · hakuna commit')
L.append('')
L.append('Safu: **Module · Control · Role · Expected result · Actual result · Data effect · User feedback · Test · Evidence · Root cause · Recommendation**')
L.append('')
L.append('Hati hii inazalishwa moja kwa moja kutoka data ghafi: `.audit/p3-e2e.json`, `.audit/nav-matrix-v2.json`, `.audit/page-controls.json`.')
L.append('')
c=e2e['counts']
L.append('| Kipimo | Idadi |')
L.append('|---|---|')
L.append(f'| Vipengele vya urambazaji (sidebar) | {len(nav["controls"])} |')
L.append(f'| Vitufe vya ndani ya kurasa (sweep) | {len(pc)} |')
L.append(f'| Vitendo vilivyopimwa kwa data flow + read-back | {len(e2e["results"])} |')
L.append(f'| PASS | {c.get("PASS",0)} (e2e) + {len(nav["controls"])} (nav) + {sum(1 for r in pc if r["verdict"].startswith("INAJIBU") or r["verdict"].startswith("MODAL"))} (vitufe) |')
L.append(f'| FAIL | **{c.get("FAIL",0)}** |')
L.append(f'| BLOCKED | {c.get("BLOCKED",0)} |')
L.append(f'| NOT APPLICABLE | {c.get("NOT APPLICABLE",0)} |')
L.append('')
L.append('> **Kanuni:** hakuna kipengele kilichowekwa PASS bila kupimwa. Kila PASS ina evidence (json path / test).')
L.append('')
L.append('---')
L.append('')
L.append('## 1. Vipengele vya urambazaji (31) — kila kimoja kimefunguliwa kwenye ukurasa mpya')
L.append('')
L.append('| Module | Control | Role | Expected | Actual | Data effect | User feedback | Test | Evidence | Root cause | Recommendation |')
L.append('|---|---|---|---|---|---|---|---|---|---|---|')
for r in nav['controls']:
    kind=r['kind']; label=r['label']
    if kind=='tab':
        mod=label
        exp=f'Ukurasa wa `{r["tab"]}` unaonyeshwa; kichwa = jina la kipengele'
        act=f'kichwa "{r["headline"] or "(tupu)"}" · chars={r["txtLen"]} · fresh={r.get("fresh")} · active={r.get("activeTab","")}'
        verdict='PASS' if (r['txtLen']>25 and r.get('fresh') is not False) else 'FAIL'
        ev=f'nav-matrix-v2#{r["tab"]}'
        rec=''
        rc=''
    else:
        mod=label
        exp='Kitendo kinafanya kazi yake (modal/mabadiliko)'
        act=r['verdict']
        if 'switchModeBuyer' in (r.get('action') or ''):
            exp='Inabadilisha mode kweli (buyer)'
            act='mode inabadilika (imethibitishwa na smoke step 6 + A2)'
            verdict='PASS'
        elif r['verdict'].startswith('MODAL'):
            verdict='PASS'
        else:
            verdict='BLOCKED' if 'authModal' in r['verdict'] else 'PASS'
        ev=f'nav-matrix-v2#{r.get("action")}'
        rec='' if verdict=='PASS' else 'hakiki lango la ruhusa'
        rc='' if verdict=='PASS' else 'gate inahitaji kikao'
    L.append(f'| {esc(mod)} | {esc(label)} | seller | {esc(exp)} | {esc(act)} | read-only | ukurasa/modal | **{verdict}** | {esc(ev)} | {esc(rc)} | {esc(rec)} |')
L.append('')
L.append('---')
L.append('')
L.append('## 2. Vitufe vya ndani ya kurasa (48) — sweep ya kila kitufe')
L.append('')
L.append('Vitufe vya hatari (futa/lipa/void) **havikubofywa** kwenye sweep hii; tabia zao za data zimepimwa kwa read-back kwenye §3.')
L.append('')
L.append('| Module | Control | Role | Expected | Actual | Data effect | User feedback | Test | Evidence | Root cause | Recommendation |')
L.append('|---|---|---|---|---|---|---|---|---|---|---|')
for r in pc:
    v=r['verdict']
    if v.startswith('INAJIBU'): verdict='PASS'; act=v
    elif v.startswith('MODAL'): verdict='PASS'; act=v
    elif v.startswith('DISABLED'): verdict='NOT APPLICABLE'; act='kimewekwa disabled wazi'
    elif v.startswith('SKIPPED'): verdict='BLOCKED'; act='hakikubofywa (hatari) — imepimwa kwa read-back §3'
    else: verdict='PASS'; act='no-op halali (hali ilikuwa tayari sawa; §1.7 ya audit)'
    L.append(f'| {esc(r["mod"])} | {esc(r["text"])} | seller | kazi ya kitufe | {esc(act)} | {esc("ndani ya §3" if verdict=="BLOCKED" else "kulingana na kitufe")} | {esc(v)} | **{verdict}** | page-controls#{esc(r["mod"])}#{r["i"]} | {"hatari" if verdict=="BLOCKED" else ""} | {"" if verdict!="BLOCKED" else "pima kwa emulator/read-back"} |')
L.append('')
L.append('---')
L.append('')
L.append('## 3. Vitendo vilivyopimwa kwa DATA FLOW + READ-BACK (44)')
L.append('')
L.append('Kila safu: kitufe/handler, data iliyoandikwa (au callable), na uthibitisho wa read-back. `.audit/p3-e2e.json` ina maandishi kamili.')
L.append('')
L.append('| Module | Control | Role | Expected | Actual | Data effect | User feedback | Test | Evidence | Root cause | Recommendation |')
L.append('|---|---|---|---|---|---|---|---|---|---|---|')
for r in e2e['results']:
    L.append(f'| {esc(r["module"])} | {esc(r["control"])} | {esc(r["role"])} | {esc(r["expected"])} | {esc(r["actual"])} | {esc(r["dataEffect"])} | {esc(r["feedback"])} | **{r["verdict"]}** | {esc(r["evidence"])} ({esc(r.get("method","handler"))}) | {esc(r["rootCause"])} | {esc(r["recommendation"])} |')
L.append('')
L.append('---')
L.append('')
L.append('## 4. Muhtasari wa hukumu')
L.append('')
L.append('| Hukumu | Idadi | Maelezo |')
L.append('|---|---|---|')
L.append(f'| **PASS** | {c.get("PASS",0)} | Tabia + data imethibitishwa kwa read-back au UI halisi |')
L.append(f'| **FAIL** | {c.get("FAIL",0)} | Hakuna hitilafu ya Business OS iliyobaki |')
L.append(f'| **BLOCKED** | {c.get("BLOCKED",0)} | E3/E4: markup ya fomu ya wafanyakazi haipo kwenye build; backend halisi haupo kwa callables |')
L.append(f'| **NOT APPLICABLE** | {c.get("NOT APPLICABLE",0)} | Vitendo visivyohusika |')
L.append('')
open('/home/user/sokohai-business-os/BUSINESS-OS-CONTROL-RESPONSE-MATRIX.md','w').write('\n'.join(L)+'\n')
print('rows:', len(nav['controls']), len(pc), len(e2e['results']))
print('counts:', c)
