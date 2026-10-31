#!/usr/bin/env node
// SokoHai — taxonomy DRAFT generator (read-only over the live sources).
// Usage: node taxonomy-draft/build_taxonomy_draft.mjs [--check]
// Reads: shared/canonical-taxonomy-data.js, shared/product-taxonomy-browser.mjs,
//        js/app/00-bootstrap.js (skh.advancedCategories, skh.serviceDataMap) — never writes them.
// Writes: taxonomy-draft/out/* only. Deterministic (fixed timestamp) so diffs are reviewable.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { SOURCES, SECTORS, OVERLAY_POLICY, REGULATORY_FLAGS, RESEARCH_DATE } from './src/research.mjs';
import { NEW_CATEGORIES, NEW_SUBCATEGORIES, SUBSUB_GROUPINGS, DEFAULT_TYPE_TO_LEAF, MULTI_LEAF, REG_ASSIGN } from './src/additions.mjs';
import { SERVICE_SUBCATEGORIES, SERVICE_LEGACY_EXTRA } from './src/services.mjs';
import { LEGACY_CATEGORIES } from './src/legacy.mjs';
import { UNIT_ADDITIONS, UNIT_RULES, UNIT_LEGACY_MAP, COMMON_PRODUCT_ATTRIBUTES, COMMON_SERVICE_ATTRIBUTES, VARIANT_FAMILIES, VARIANT_RULES_GLOBAL } from './src/model.mjs';
import { CATEGORY_NAMES, LEAF_NAMES } from './src/i18n-existing.mjs';
import { PRIORITY_TYPES } from './src/types-priority.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUT = path.join(HERE, 'out');
const STAMP = `${RESEARCH_DATE}T00:00:00.000Z`;
const GEN = 'taxonomy-draft-generator@v1';
const require = createRequire(import.meta.url);

export async function loadInputs() {
  const canon = require(path.join(ROOT, 'shared/canonical-taxonomy-data.js'));
  const browser = (await import(pathToFileURL(path.join(ROOT, 'shared/product-taxonomy-browser.mjs')).href)).default;
  const src = fs.readFileSync(path.join(ROOT, 'js/app/00-bootstrap.js'), 'utf8');
  const grab = (name) => {
    const i = src.indexOf(name + ' = {'); if (i < 0) throw new Error('missing ' + name);
    let j = i + (name + ' = ').length, d = 0, k = j;
    for (; k < src.length; k++) { const ch = src[k]; if (ch === '{') d++; else if (ch === '}') { d--; if (!d) { k++; break; } } }
    // Object literal from our own repo source (static data, no calls) — evaluated in isolation.
    return Function('"use strict";return (' + src.slice(j, k) + ')')();
  };
  return { canon, browser, adv: grab('skh.advancedCategories'), svc: grab('skh.serviceDataMap') };
}

export const slug = (s) => String(s).normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, '')
  .toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 48);
const splitName = (s) => { const [sw, en] = String(s).split('|'); return { sw: (sw || '').trim(), en: (en || sw || '').trim() }; };

export async function build() {
  const { canon, browser, adv, svc } = await loadInputs();
  const nodes = []; const byId = new Map(); const issues = [];
  const add = (n) => {
    if (byId.has(n.id)) { issues.push({ kind: 'DUPLICATE_ID', id: n.id }); return byId.get(n.id); }
    const full = {
      id: n.id, parentId: n.parentId ?? null, level: n.level, levelName: ['SECTOR', 'CATEGORY', 'SUBCATEGORY', 'SUBSUBCATEGORY', 'PRODUCT_SERVICE_TYPE'][n.level],
      name: n.name, displayName: n.displayName, description: n.description || '', status: n.status || 'ACTIVE',
      visibility: n.visibility || 'PUBLIC', type: n.type, origin: n.origin, sourceRefs: n.sourceRefs || [],
      regulatory: n.regulatory || [], externalRefs: n.externalRefs || {}, aliases: n.aliases || [],
      icon: { ref: null, placeholder: `icon:${n.id}` }, i18nStatus: n.i18nStatus || 'DRAFT_NEEDS_NATIVE_REVIEW',
      allowsOther: !!n.allowsOther, extension: n.extension || null, review: n.review || [],
      currentParentId: n.currentParentId ?? undefined, canonicalRef: n.canonicalRef ?? undefined,
      createdAt: STAMP, updatedAt: STAMP, createdBy: GEN, updatedBy: GEN,
    };
    Object.keys(full).forEach((k) => full[k] === undefined && delete full[k]);
    nodes.push(full); byId.set(full.id, full); return full;
  };
  const EXT = { allowOther: true, allowOtherSpecify: true, allowSuggestType: true, allowSuggestSubcategory: true, allowSuggestClassification: true, workflow: 'WF-TAXONOMY-PROPOSAL-v1' };

  // ---- Level 0 sectors
  const catSector = {};
  for (const s of SECTORS) {
    add({ id: s.id, level: 0, name: s.en, displayName: { sw: s.sw, en: s.en }, type: s.system ? 'system' : 'both', origin: 'PROPOSED', status: s.system ? 'SYSTEM' : 'PROPOSED', sourceRefs: ['SRC-ISIC', 'SRC-GOOGLE-PT'], externalRefs: { isicSections: s.isic }, description: `Sekta: ${s.sw}` });
    for (const c of s.cats) { if (catSector[c]) issues.push({ kind: 'CAT_IN_TWO_SECTORS', id: c }); catSector[c] = s.id; }
  }

  // ---- Level 1 existing categories
  const reg = canon.CATEGORY_REGISTRY;
  const kindToType = { PRODUCT_DOMAIN: 'product', SERVICE_DOMAIN: 'service', PROPERTY_DOMAIN: 'product', MINERAL_RESOURCE_DOMAIN: 'product', FALLBACK: 'system', OVERLAY: 'overlay' };
  const catDecisions = {
    'CAT-16': { proposedKind: 'SERVICE_DOMAIN', action: 'NEEDS_HUMAN_DECISION', why: 'Imeandikwa PRODUCT_DOMAIN lakini haina leaves; maudhui yake ni huduma za usafiri (CPC 64–68).' },
    'CAT-19': { proposedKind: 'HYBRID_DOMAIN', action: 'NEEDS_HUMAN_DECISION', why: 'SERVICE_DOMAIN yenye leaves 17 za bidhaa (dawa/vifaa tiba). Pendekezo: type=both, bila kubadilisha ID.' },
  };
  const catIds = Object.values(reg).map((c) => c.id);
  for (const c of Object.values(reg)) {
    if (c.kind === 'OVERLAY') continue; // overlays become listing dimensions (OVERLAY_POLICY)
    const nm = splitName(CATEGORY_NAMES[c.id] || c.displayName);
    const dec = catDecisions[c.id];
    const type = c.id === 'CAT-19' ? 'both' : c.id === 'CAT-16' ? 'service' : kindToType[c.kind];
    add({ id: c.id, parentId: catSector[c.id], level: 1, name: c.displayName, displayName: nm, type, origin: 'CANONICAL', canonicalRef: { categoryId: c.id, kind: c.kind },
      status: c.kind === 'FALLBACK' ? 'SYSTEM' : 'ACTIVE', review: dec ? [dec] : [], description: `${nm.sw} — ${nm.en}` });
    if (!catSector[c.id]) issues.push({ kind: 'CAT_WITHOUT_SECTOR', id: c.id });
  }
  for (const nc of NEW_CATEGORIES) {
    add({ id: nc.id, parentId: nc.sector, level: 1, name: nc.en, displayName: { sw: nc.sw, en: nc.en }, type: nc.type, origin: 'PROPOSED', status: 'PROPOSED',
      sourceRefs: nc.sourceRefs, regulatory: nc.regulatory, description: nc.description, review: [{ action: 'NEW', why: nc.rationale, note: nc.flagsNote || null }] });
    if (catSector[nc.id] !== nc.sector) issues.push({ kind: 'NEW_CAT_SECTOR_MISMATCH', id: nc.id });
  }

  // ---- Level 2 existing leaves
  const leafId = {}; // cat|leafName -> id
  const leafNodes = [];
  for (const [cat, leaves] of Object.entries(browser.productLeaves)) {
    const names = (LEAF_NAMES[cat] || '').split('\n').filter(Boolean);
    if (names.length !== leaves.length) issues.push({ kind: 'I18N_COUNT_MISMATCH', id: cat, expected: leaves.length, got: names.length });
    leaves.forEach((leaf, i) => {
      const id = `SC-${cat}-${slug(leaf)}`;
      const dn = names[i] ? splitName(names[i]) : { sw: leaf, en: leaf };
      const type = cat === 'CAT-19' ? 'product' : (byId.get(cat)?.type || 'product');
      const n = add({ id, parentId: cat, level: 2, name: leaf, displayName: dn, type: type === 'both' ? 'product' : type, origin: 'CANONICAL', canonicalRef: { categoryId: cat, subcategory: leaf }, allowsOther: true, extension: EXT, aliases: [leaf] });
      leafId[`${cat}|${leaf}`] = n.id; leafNodes.push(n);
    });
  }
  // CAT-19 product leaves sit in productLeaves; branchContexts (SERVICE/CONTEXT_ONLY) become review notes
  for (const [cat, ctx] of Object.entries(browser.branchContexts || {})) {
    for (const [branch, mode] of Object.entries(ctx)) {
      const n = byId.get(cat); if (n) n.review.push({ action: 'BRANCH_CONTEXT', branch, mode, why: mode === 'SERVICE' ? 'Branch ya huduma ndani ya category ya bidhaa — inaelekezwa kwenye service domain husika.' : 'Muktadha (si leaf) — unakuwa attribute ya listing.' });
    }
  }

  // ---- Level 2 new subcategories in existing cats + new cats + services
  const typeRows = [];
  const addTypes = (parent, cat, types, origin, kindType, sourceRefs) => {
    for (const t of types) {
      const dn = splitName(t);
      const id = `PT-${cat}-${slug(byId.get(parent).displayName.sw)}_${slug(dn.sw)}`.slice(0, 110);
      add({ id, parentId: parent, level: 4, name: dn.en, displayName: dn, type: kindType, origin, status: 'PROPOSED', sourceRefs, allowsOther: false });
      typeRows.push({ id, parent, cat, origin });
    }
  };
  const addSub = (cat, sw, en, opts = {}) => {
    const id = `SC-${cat}-${slug(sw)}`;
    const n = add({ id, parentId: cat, level: 2, name: en, displayName: { sw, en }, type: opts.type || 'product', origin: 'PROPOSED', status: 'PROPOSED',
      sourceRefs: opts.sourceRefs || [], regulatory: opts.regulatory || [], externalRefs: opts.cpc ? { cpcDivision: opts.cpc } : {}, allowsOther: true, extension: EXT,
      description: opts.description || '', review: opts.rationale || opts.note ? [{ action: 'NEW', why: opts.rationale || '', note: opts.note || null }] : [], aliases: opts.aliases || [] });
    leafId[`${cat}|+${sw}`] = id; leafNodes.push(n); return n;
  };
  for (const ns of NEW_SUBCATEGORIES) {
    const n = addSub(ns.parent, ns.sw, ns.en, { sourceRefs: ns.sourceRefs, rationale: ns.rationale, note: ns.note, regulatory: ns.regulatory });
    addTypes(n.id, ns.parent, ns.types, 'PROPOSED', 'product', ns.sourceRefs);
  }
  for (const nc of NEW_CATEGORIES) for (const [sw, en, types] of nc.subs) {
    const n = addSub(nc.id, sw, en, { sourceRefs: nc.sourceRefs, regulatory: nc.regulatory });
    addTypes(n.id, nc.id, types, 'PROPOSED', 'product', nc.sourceRefs);
  }
  const svcLegacyIndex = {};
  for (const [cat, subs] of Object.entries(SERVICE_SUBCATEGORIES)) for (const s of subs) {
    const n = addSub(cat, s.sw, s.en, { type: 'service', cpc: s.cpc, sourceRefs: ['SRC-UN-CPC'], note: s.note, regulatory: s.regulatory || (cat === 'CAT-22' ? ['REG-UNVERIFIED-FIN'] : []), aliases: (s.legacy || []).map((l) => l.slice(l.indexOf('/') + 1)) });
    if (s.absorbs) n.review.push({ action: 'MERGE', why: `Inapokea huduma kutoka ${s.absorbs}` });
    addTypes(n.id, cat, s.types, 'PROPOSED', 'service', ['SRC-UN-CPC']);
    for (const l of s.legacy || []) { if (svcLegacyIndex[l]) issues.push({ kind: 'SERVICE_LEGACY_TWICE', id: l }); svcLegacyIndex[l] = n.id; }
  }
  for (const [k, v] of Object.entries(SERVICE_LEGACY_EXTRA)) svcLegacyIndex[k] = leafId[`${v.target}|+${v.sub}`];

  // ---- Level 3 sub-subcategory groupings (target structure; current parent recorded)
  for (const g of SUBSUB_GROUPINGS) {
    const gid = leafId[`${g.parent}|${g.groupLeaf}`]; if (!gid) { issues.push({ kind: 'GROUP_LEAF_MISSING', id: g.groupLeaf }); continue; }
    byId.get(gid).review.push({ action: 'BECOMES_GROUP', why: g.rationale });
    for (const ch of g.children) {
      const cid = leafId[`${g.parent}|${ch}`]; if (!cid) { issues.push({ kind: 'GROUP_CHILD_MISSING', id: `${g.parent}|${ch}` }); continue; }
      const c = byId.get(cid); c.currentParentId = c.parentId; c.parentId = gid; c.level = 3; c.levelName = 'SUBSUBCATEGORY';
      c.review.push({ action: 'REPARENT', why: `Mzazi mpya: ${g.groupLeaf}` });
    }
  }

  // ---- Level 4 existing product types (IDs unchanged)
  const multiLeaf = [];
  for (const p of Object.values(canon.PRODUCT_TYPE_REGISTRY)) {
    let leafName = p.subcategory; let review = [];
    if (leafName === 'default') {
      const m = DEFAULT_TYPE_TO_LEAF[p.categoryId]?.[p.label];
      if (!m) { issues.push({ kind: 'DEFAULT_TYPE_UNMAPPED', id: p.id }); leafName = null; }
      else if (m === '*') { leafName = MULTI_LEAF[p.categoryId][0]; review.push({ action: 'SHARED_TYPE', alsoListedUnder: MULTI_LEAF[p.categoryId].slice(1).map((l) => leafId[`${p.categoryId}|${l}`]) }); multiLeaf.push(p.id); }
      else { leafName = m; review.push({ action: 'MAP', why: 'Type ya category-level (default) imepewa leaf.' }); }
    }
    const parent = leafName ? leafId[`${p.categoryId}|${leafName}`] : p.categoryId;
    if (!parent) issues.push({ kind: 'TYPE_PARENT_MISSING', id: p.id, leaf: leafName });
    add({ id: p.id, parentId: parent || p.categoryId, level: 4, name: p.label, displayName: { sw: p.label, en: p.label }, type: 'product', origin: 'CANONICAL', status: p.status || 'ACTIVE',
      canonicalRef: { productTypeId: p.productTypeId, branch: p.branch, subcategory: p.subcategory }, i18nStatus: 'SOURCE_LABEL_ONLY', review });
    typeRows.push({ id: p.id, parent, cat: p.categoryId, origin: 'CANONICAL' });
  }

  // ---- Level 4 priority type pack for existing leaves without types
  for (const [cat, leaves] of Object.entries(PRIORITY_TYPES)) for (const [leaf, types] of Object.entries(leaves)) {
    const lid = leafId[`${cat}|${leaf}`]; if (!lid) { issues.push({ kind: 'PRIORITY_LEAF_MISSING', id: `${cat}|${leaf}` }); continue; }
    const existing = new Set(nodes.filter((n) => n.parentId === lid && n.level === 4).map((n) => n.displayName.en.toLowerCase()));
    addTypes(lid, cat, types.filter((t) => !existing.has(splitName(t).en.toLowerCase())), 'PROPOSED', 'product', ['SRC-TZ-ECON', 'SRC-GOOGLE-PT']);
  }

  // ---- "Other" nodes: every final branch (level 2/3 node with no level-2/3 children) gets OTHER type; every category gets OTHER subcategory
  const hasSubChildren = new Set(nodes.filter((n) => n.level === 2 || n.level === 3).map((n) => n.parentId));
  const finals = nodes.filter((n) => (n.level === 2 || n.level === 3) && !hasSubChildren.has(n.id));
  for (const f of finals) {
    add({ id: `OTHER-${f.id}`, parentId: f.id, level: 4, name: 'Other (Specify)', displayName: { sw: 'Nyingine (Taja)', en: 'Other (Specify)' }, type: f.type, origin: 'SYSTEM', status: 'SYSTEM', visibility: 'PUBLIC', allowsOther: true, extension: { ...EXT, requiresFreeText: true, routesTo: 'taxonomyProposals' }, i18nStatus: 'HUMAN' });
  }
  for (const c of nodes.filter((n) => n.level === 1)) {
    const id = `OTHER-SC-${c.id}`;
    add({ id, parentId: c.id, level: 2, name: 'Other subcategory (Specify)', displayName: { sw: `Kitengo kingine (Taja)`, en: 'Other subcategory (Specify)' }, type: c.type === 'both' ? 'both' : c.type, origin: 'SYSTEM', status: 'SYSTEM', allowsOther: true, extension: { ...EXT, requiresFreeText: true, routesTo: 'taxonomyProposals' }, i18nStatus: 'HUMAN' });
    add({ id: `OTHER-${id}`, parentId: id, level: 4, name: 'Other (Specify)', displayName: { sw: 'Nyingine (Taja)', en: 'Other (Specify)' }, type: c.type === 'both' ? 'both' : c.type, origin: 'SYSTEM', status: 'SYSTEM', allowsOther: true, extension: { ...EXT, requiresFreeText: true, routesTo: 'taxonomyProposals' }, i18nStatus: 'HUMAN' });
  }

  // ---- Regulatory flags
  for (const r of REG_ASSIGN) {
    const targets = r.leaves === '*' ? nodes.filter((n) => n.parentId === r.cat && n.level === 2 && n.origin !== 'SYSTEM') : r.leaves.map((l) => byId.get(leafId[`${r.cat}|${l}`]));
    if (r.leaves === '*') { const c = byId.get(r.cat); c.regulatory = [...new Set([...c.regulatory, ...r.flags])]; }
    for (const t of targets) { if (!t) { issues.push({ kind: 'REG_TARGET_MISSING', id: `${r.cat}|${r.leaves}` }); continue; } t.regulatory = [...new Set([...t.regulatory, ...r.flags])]; }
  }
  for (const n of nodes) for (const f of n.regulatory) if (!REGULATORY_FLAGS[f]) issues.push({ kind: 'UNKNOWN_REG_FLAG', id: n.id, flag: f });

  // ---- Legacy mapping (advancedCategories: 25 cats / 120 subs)
  const resolve = (defaultCat, target) => {
    if (target.startsWith('@')) return { nodeId: null, overlay: target };
    let cat = defaultCat, leaf = target;
    if (target.includes('|')) [cat, leaf] = target.split('|');
    if (leaf === 'OTHER') return { nodeId: `OTHER-SC-${cat}` };
    return { nodeId: leafId[`${cat}|${leaf}`] || null };
  };
  const legacyRows = [];
  for (const [lc, v] of Object.entries(adv)) {
    const m = LEGACY_CATEGORIES[lc];
    if (!m) { legacyRows.push({ legacyCategory: lc, legacySub: null, action: 'NEEDS_HUMAN_DECISION', targetNodeId: null, note: 'Haikupangwa kwenye legacy.mjs' }); continue; }
    legacyRows.push({ legacyCategory: lc, legacySub: null, action: m.action, targetCategory: m.cat, targetNodeId: m.cat.startsWith('@') ? null : m.cat, overlay: m.overlay || null, currentBrowserMapping: browser.mappings[lc] || null });
    for (const sub of Object.keys(v.subcategories || {})) {
      const t = m.subs[sub];
      if (!t) { legacyRows.push({ legacyCategory: lc, legacySub: sub, action: 'NEEDS_HUMAN_DECISION', targetNodeId: null, note: 'Hakuna lengo' }); continue; }
      const r = resolve(m.cat.startsWith('@') ? 'CAT-44' : m.cat, t);
      const note = m.notes?.[sub] || null;
      const action = note && /NEEDS_HUMAN_DECISION/.test(note) ? 'NEEDS_HUMAN_DECISION' : (r.overlay ? 'LEGACY_ALIAS' : (m.action === 'SPLIT' ? 'MAP' : m.action));
      if (!r.nodeId && !r.overlay) issues.push({ kind: 'LEGACY_TARGET_UNRESOLVED', id: `${lc} / ${sub}`, target: t });
      legacyRows.push({ legacyCategory: lc, legacySub: sub, action, targetNodeId: r.nodeId, overlay: r.overlay || null, note, filters: v.subcategories[sub].filters || [], stockTypes: v.subcategories[sub].stockTypes || [] });
      if (r.nodeId && byId.get(r.nodeId)) byId.get(r.nodeId).aliases.push(`${sub} (legacy)`);
    }
  }
  for (const lc of Object.keys(LEGACY_CATEGORIES)) if (!adv[lc]) issues.push({ kind: 'LEGACY_MAP_FOR_UNKNOWN_CATEGORY', id: lc });
  // serviceDataMap (4 groups / 19 cats / 72 subs)
  const svcRows = [];
  for (const [g, cats] of Object.entries(svc)) for (const [c, subs] of Object.entries(cats)) for (const s of Object.keys(subs)) {
    const key = `${c}/${s}`; const nodeId = svcLegacyIndex[key] || null;
    svcRows.push({ group: g, legacyCategory: c, legacySub: s, action: nodeId ? 'MAP' : 'NEEDS_HUMAN_DECISION', targetNodeId: nodeId, filters: subs[s].filters || [] });
  }
  for (const k of Object.keys(svcLegacyIndex)) { const c = k.slice(0, k.indexOf('/')), s = k.slice(k.indexOf('/') + 1); if (!Object.values(svc).some((cats) => cats[c] && cats[c][s])) issues.push({ kind: 'SERVICE_LEGACY_KEY_UNKNOWN', id: k }); }

  // ---- Attribute coverage matrix (per category)
  const D = canon.PRODUCT_TYPE_DEFINITIONS;
  const familyOf = (cat) => Object.entries(VARIANT_FAMILIES).find(([, f]) => f.cats.includes(cat))?.[0] || null;
  const coverage = [];
  for (const c of nodes.filter((n) => n.level === 1)) {
    const desc = nodes.filter((n) => n.id !== c.id && isDesc(n, c.id, byId));
    const subs = desc.filter((n) => (n.level === 2 || n.level === 3) && n.origin !== 'SYSTEM');
    const types = desc.filter((n) => n.level === 4 && n.origin !== 'SYSTEM');
    const subsWithTypes = subs.filter((s) => types.some((t) => t.parentId === s.id));
    const defs = D[c.id] || {};
    const attrs = new Set(); const opts = new Set(); const filters = new Set(); let branchDefs = 0;
    for (const [b, d] of Object.entries(defs)) { branchDefs++; (d.attributes || []).forEach((a) => attrs.add(a)); Object.keys(d.options || {}).forEach((o) => opts.add(o)); (d.filters || []).forEach((f) => filters.add(f)); }
    coverage.push({ categoryId: c.id, sector: c.parentId, nameSw: c.displayName.sw, type: c.type, origin: c.origin,
      subcategories: subs.length, subcategoriesWithTypes: subsWithTypes.length, types: types.length,
      typeCoveragePct: subs.length ? Math.round((subsWithTypes.length / subs.length) * 100) : 0,
      definedBranches: branchDefs, attributes: attrs.size, optionGroups: opts.size, filters: filters.size,
      commonAttributeTemplate: c.type === 'service' ? 'SERVICE' : c.type === 'system' ? '-' : c.type === 'both' ? 'PRODUCT+SERVICE' : 'PRODUCT',
      variantFamily: familyOf(c.id), regulatory: [...new Set([...c.regulatory, ...subs.flatMap((s) => s.regulatory)])].join(' '),
      otherNodes: desc.filter((n) => n.origin === 'SYSTEM').length,
      i18nDraftLeaves: subs.filter((s) => s.i18nStatus !== 'SOURCE_LABEL_ONLY').length });
  }

  // [2026-10-31] An alias equal to the node's own sw/en name adds nothing to search; drop it
  // (and exact repeats). Real alternative names and "(legacy)" labels stay.
  for (const n of nodes) {
    const own = new Set([n.displayName.sw, n.displayName.en].map((x) => String(x).toLowerCase().trim()));
    const seen = new Set();
    n.aliases = (n.aliases || []).filter((a) => { const k = String(a).toLowerCase().trim(); if (!k || own.has(k) || seen.has(k)) return false; seen.add(k); return true; });
  }

  // ---- Duplicate / overlap report
  const dup = { sameEnglishNameAcrossCategories: [], duplicateTypeLabels: [], overlayLikeLeaves: [], serviceLeavesInProductDomains: [], attributeLikeLeaves: [], manualOverlaps: MANUAL_OVERLAPS };
  const byEn = {};
  for (const n of nodes.filter((x) => (x.level === 2 || x.level === 3) && x.origin !== 'SYSTEM')) (byEn[n.displayName.en.toLowerCase()] ||= []).push(n.id);
  for (const [k, ids] of Object.entries(byEn)) if (ids.length > 1) dup.sameEnglishNameAcrossCategories.push({ name: k, ids });
  const byLabel = {};
  for (const n of nodes.filter((x) => x.level === 4 && x.origin !== 'SYSTEM')) (byLabel[n.displayName.en.toLowerCase()] ||= []).push(n.id);
  for (const [k, ids] of Object.entries(byLabel)) if (ids.length > 1) dup.duplicateTypeLabels.push({ label: k, ids, resolution: 'Weka type moja ya msingi + alsoListedUnder, au badilisha label kuonyesha muktadha (si kufuta).' });
  // [2026-10-31] One alias on several nodes makes seller search ambiguous. Reported for an
  // admin decision (not merged): search shows every match with its full path meanwhile.
  dup.ambiguousAliases = [];
  const byAlias = {};
  for (const n of nodes) for (const a of n.aliases || []) { const k = String(a).toLowerCase().trim(); if (!k) continue; (byAlias[k] ||= new Set()).add(n.id); }
  for (const [alias, ids] of Object.entries(byAlias)) if (ids.size > 1) dup.ambiguousAliases.push({ alias, ids: [...ids].sort(), status: 'NEEDS_ADMIN_DECISION', interim: 'Search inaonyesha nodes zote na path kamili; muuzaji anachagua.' });
  dup.ambiguousAliases.sort((a, b) => a.alias.localeCompare(b.alias));
  for (const n of leafNodes) {
    if (n.origin !== 'CANONICAL') continue;
    if (/(used(?! for)|second-hand|mitumba|refurbished|salvaged)/i.test(n.name)) dup.overlayLikeLeaves.push({ id: n.id, name: n.name, overlay: 'CAT-39 condition', proposal: 'Baki kama leaf (mitumba ni soko kubwa) + weka condition attribute; buyer filter ya condition iwe chanzo kikuu.' });
    if (/(bulk|trade|wholesale)/i.test(n.name)) dup.overlayLikeLeaves.push({ id: n.id, name: n.name, overlay: 'CAT-40 saleMode', proposal: 'LEGACY_ALIAS → saleMode=bulk/trade; leaf ifichwe kwenye menu baada ya migration.' });
    if (/(rental|for rent|for lease|for sale|sale context)/i.test(n.name)) dup.attributeLikeLeaves.push({ id: n.id, name: n.name, attribute: 'listingType', proposal: 'Badili kuwa listingType ∈ {sale, rent, lease}.' });
    if (/(oem|aftermarket|profile|state|grading)/i.test(n.name)) dup.attributeLikeLeaves.push({ id: n.id, name: n.name, attribute: /oem|aftermarket/i.test(n.name) ? 'partOrigin' : 'qualityState/profile', proposal: 'Ni attribute, si aina ya bidhaa.' });
    if (/services?$/i.test(n.name) && byId.get(n.parentId)?.type === 'product') dup.serviceLeavesInProductDomains.push({ id: n.id, name: n.name, proposal: 'MERGE kwenye service domain husika; leaf ibaki kama alias hadi bidhaa zihamishwe.' });
    if (/— PRODUCTS$/.test(n.name)) dup.attributeLikeLeaves.push({ id: n.id, name: n.name, attribute: 'label-suffix', proposal: 'Ondoa "— PRODUCTS" kwenye displayName (ID haibadiliki).' });
  }

  // ---- Missing-classification report
  const missing = {
    subcategoriesWithoutTypes: coverage.filter((c) => c.type !== 'system').map((c) => ({ categoryId: c.categoryId, missing: c.subcategories - c.subcategoriesWithTypes, of: c.subcategories })).filter((x) => x.missing > 0),
    categoriesWithoutAttributeDefinitions: coverage.filter((c) => c.definedBranches === 0 && c.type !== 'system').map((c) => c.categoryId),
    typesWithSourceLabelOnly: nodes.filter((n) => n.i18nStatus === 'SOURCE_LABEL_ONLY').length,
    legacyNeedsHumanDecision: legacyRows.filter((r) => r.action === 'NEEDS_HUMAN_DECISION').length + svcRows.filter((r) => r.action === 'NEEDS_HUMAN_DECISION').length,
    unverifiedRegulators: Object.entries(REGULATORY_FLAGS).filter(([, f]) => !f.source).map(([k]) => k),
    categoryDecisions: Object.entries(catDecisions).map(([id, d]) => ({ id, ...d })),
  };

  // ---- Counts
  const counts = { byLevel: {}, byOrigin: {}, bySector: {}, byType: {} };
  for (const n of nodes) { counts.byLevel[n.levelName] = (counts.byLevel[n.levelName] || 0) + 1; counts.byOrigin[n.origin] = (counts.byOrigin[n.origin] || 0) + 1; counts.byType[n.type] = (counts.byType[n.type] || 0) + 1; }
  for (const s of nodes.filter((n) => n.level === 0)) {
    const d = nodes.filter((n) => isDesc(n, s.id, byId));
    counts.bySector[s.id] = { name: s.displayName.sw, categories: d.filter((n) => n.level === 1).length, subcategories: d.filter((n) => (n.level === 2 || n.level === 3) && n.origin !== 'SYSTEM').length, types: d.filter((n) => n.level === 4 && n.origin !== 'SYSTEM').length, otherNodes: d.filter((n) => n.origin === 'SYSTEM').length };
  }
  counts.legacy = { advancedCategories: Object.keys(adv).length, advancedSubcategories: legacyRows.filter((r) => r.legacySub).length, serviceSubcategories: svcRows.length,
    legacyByAction: legacyRows.reduce((a, r) => ((a[r.action] = (a[r.action] || 0) + 1), a), {}), serviceByAction: svcRows.reduce((a, r) => ((a[r.action] = (a[r.action] || 0) + 1), a), {}) };
  counts.multiLeafTypes = multiLeaf.length;

  const dataset = {
    meta: { schema: 'sokohai.taxonomy.draft/v1', status: 'DRAFT — NOT USED BY RUNTIME', generatedAt: STAMP, generator: GEN, researchDate: RESEARCH_DATE,
      levels: ['SECTOR', 'CATEGORY', 'SUBCATEGORY', 'SUBSUBCATEGORY', 'PRODUCT_SERVICE_TYPE', 'SPECIFIC_CLASSIFICATION (attribute values — not stored as nodes)'],
      idPolicy: 'IDs ni thabiti na hazitumiki tena: CAT-xx (zilizopo), SC-<cat>-<slug> (zilizogandishwa mara ya kwanza), PT-* (zilizopo hazibadiliki), OTHER-*. Kubadilisha jina hakubadilishi ID.',
      sourceOfTruth: 'Baada ya idhini: Firestore taxonomyNodes (admin-managed) → generated shared/*.mjs; mpaka hapo shared/canonical-taxonomy-data.js inabaki chanzo cha runtime.' },
    sources: SOURCES, sectors: SECTORS, overlays: OVERLAY_POLICY, regulatoryFlags: REGULATORY_FLAGS,
    nodes,
    attributes: { common: { product: COMMON_PRODUCT_ATTRIBUTES, service: COMMON_SERVICE_ATTRIBUTES }, registryCount: Object.keys(canon.ATTRIBUTE_REGISTRY).length },
    units: { existing: canon.UNIT_REGISTRY, additions: UNIT_ADDITIONS, rules: UNIT_RULES, legacyMap: UNIT_LEGACY_MAP },
    variants: { families: VARIANT_FAMILIES, rules: VARIANT_RULES_GLOBAL },
  };
  return { dataset, legacyRows, svcRows, coverage, dup, missing, counts, issues, typeRows };
}

function isDesc(n, ancestorId, byId) { let p = n.parentId, guard = 0; while (p && guard++ < 10) { if (p === ancestorId) return true; p = byId.get(p)?.parentId; } return false; }

// Overlaps found by manual review of the 743 leaves (not regex-detectable).
const MANUAL_OVERLAPS = [
  { ids: ['SC-CAT-01-NAFAKA_UNGA_MIKUNDE', 'SC-CAT-03-NAFAKA', 'SC-CAT-03-MIKUNDE_PULSES'], kind: 'context', resolution: 'KEEP both: CAT-01 = rejareja ya mlaji, CAT-03 = zao/bidhaa ghafi ya jumla. Buyer search iunganishe kwa alias.' },
  { ids: ['SC-CAT-01-MAYAI', 'SC-CAT-04-MAYAI'], kind: 'context', resolution: 'KEEP: CAT-04 = mzalishaji/trei za shambani; CAT-01 = rejareja. Mwongozo wa seller unahitajika.' },
  { ids: ['SC-CAT-01-NYAMA', 'SC-CAT-04-NYAMA'], kind: 'context', resolution: 'Kama juu.' },
  { ids: ['SC-CAT-01-SAMAKI_SEAFOOD', 'SC-CAT-05-SAMAKI_WA_BAHARI'], kind: 'context', resolution: 'KEEP; CAT-05 ni chanzo/jumla.' },
  { ids: ['SC-CAT-12-TABLETS_MOBILE_COMPUTING', 'SC-CAT-13-TABLETS_HYBRID_COMPUTERS'], kind: 'duplicate', resolution: 'MERGE pendekezo: tablets → CAT-12; hybrids (2-in-1) → CAT-13. NEEDS_HUMAN_DECISION.' },
  { ids: ['SC-CAT-13-SERVERS', 'SC-CAT-13-SERVERS_DATA_CENTER_EQUIPMENT'], kind: 'duplicate', resolution: 'MERGE → "Servers & Data Center Equipment"; "Servers" kuwa alias.' },
  { ids: ['SC-CAT-13-SOFTWARE_LICENSES', 'SC-CAT-38-SOFTWARE', 'SC-CAT-38-SOFTWARE_LICENSE'], kind: 'duplicate', resolution: 'MERGE → CAT-38; CAT-13 leaf iwe alias.' },
  { ids: ['SC-CAT-13-PROJECTORS_PRESENTATION', 'SC-CAT-37-PROJECTORS_PRESENTATION_PRODUCTS'], kind: 'duplicate', resolution: 'MERGE → CAT-13; CAT-37 alias.' },
  { ids: ['SC-CAT-11-CABLES_ADAPTERS_CONNECTORS', 'SC-CAT-13-CABLES_ADAPTERS'], kind: 'overlap', resolution: 'KEEP kwa muktadha (AV vs IT) + cross-link.' },
  { ids: ['SC-CAT-11-POWER_BACKUP_DEVICES', 'SC-CAT-13-UPS_COMPUTER_POWER', 'SC-CAT-34-UPS_SYSTEMS', 'SC-CAT-34-INVERTERS_BACKUP_POWER'], kind: 'overlap', resolution: 'Canonical: CAT-34; zingine alias. NEEDS_HUMAN_DECISION.' },
  { ids: ['SC-CAT-34-SOLAR_BATTERIES_ENERGY_STORAGE', 'SC-CAT-34-BATTERY_PACKS_ENERGY_STORAGE_SYSTEMS', 'SC-CAT-34-BATTERIES_GENERAL', 'SC-CAT-11-BATTERIES_CHARGERS'], kind: 'overlap', resolution: 'Tofautisha kwa attribute chemistry/use; MERGE ya leaves mbili za storage inapendekezwa.' },
  { ids: ['SC-CAT-12-GPS_TRACKING_DEVICES', 'SC-CAT-36-GPS_TRACKING'], kind: 'duplicate', resolution: 'MERGE → CAT-12 (TCRA); CAT-36 alias.' },
  { ids: ['SC-CAT-14-VEHICLE_ACCESSORIES', 'SC-CAT-15-VEHICLE_ACCESSORIES'], kind: 'duplicate', resolution: 'MERGE → CAT-15.' },
  { ids: ['SC-CAT-15-AIR_INTAKE_EXHAUST', 'SC-CAT-15-EXHAUST_EMISSION'], kind: 'overlap', resolution: 'Gawa: Air Intake peke yake + Exhaust & Emission.' },
  { ids: ['SC-CAT-11-CAMERAS_IMAGING', 'SC-CAT-37-PHOTOGRAPHY_EQUIPMENT'], kind: 'overlap', resolution: 'Mlaji → CAT-11; studio/kitaalamu → CAT-37.' },
  { ids: ['SC-CAT-19-VETERINARY_HEALTH_PRODUCTS', 'SC-CAT-04-ANIMAL_HEALTH_PRODUCTS', 'SC-CAT-31-PET_HEALTH_PRODUCTS_NON_MEDICINE'], kind: 'overlap', resolution: 'Dawa (TMDA) → CAT-19; zisizo dawa → CAT-04/CAT-31.' },
  { ids: ['SC-CAT-08-BABY_PERSONAL_CARE', 'SC-CAT-30-BABY_WIPES_HYGIENE', 'SC-CAT-30-BABY_BATH_PRODUCTS'], kind: 'overlap', resolution: 'Canonical CAT-30; CAT-08 alias.' },
  { ids: ['SC-CAT-09-CLEANING_HOUSEHOLD_SUPPLIES', 'SC-CAT-35-HYGIENE_CLEANING_PRODUCTS', 'SC-CAT-35-CLEANING_CHEMICALS'], kind: 'overlap', resolution: 'Rejareja ya nyumbani → CAT-09; viwanda/taasisi → CAT-35.' },
  { ids: ['SC-CAT-27-BEADS_JEWELLERY_ARTISTIC_ACCESSORIES', 'SC-CAT-28-TRADITIONAL_JEWELLERY_ORNAMENTS', 'SC-CAT-29-WEDDING_JEWELLERY_ACCESSORIES', 'SC-CAT-07-VITO_SAA'], kind: 'context', resolution: 'KEEP kwa muktadha; jewellery ya biashara ya kawaida → CAT-07 Vito & Saa (mpya).' },
  { ids: ['SC-CAT-01-FOOD_PACKAGING', 'SC-CAT-08-BEAUTY_PACKAGING', 'SC-CAT-19-HEALTH_PACKAGING', 'SC-CAT-29-GIFT_PACKAGING', 'SC-CAT-32-PACKAGING_MAILING_STATIONERY'], kind: 'scattered', resolution: 'Weka alias kwenye CAT-49 (mpya); leaves zibaki.' },
  { ids: ['SC-CAT-36-ACCESS_CONTROL', 'SC-CAT-36-ACCESS_CREDENTIALS', 'SC-CAT-36-IDENTIFICATION_ACCESS_PRODUCTS'], kind: 'overlap', resolution: 'MERGE credentials + identification.' },
  { ids: ['SC-CAT-08-BEAUTY_SERVICES', 'SC-CAT-17-UREMBO_UNYOAJI'], kind: 'service_in_product', resolution: 'MERGE → CAT-17.' },
];

async function main() {
  const r = await build();
  const check = process.argv.includes('--check');
  const files = {
    'sokohai-taxonomy-v1.draft.json': r.dataset,
    'legacy-mapping.draft.json': { advancedCategories: r.legacyRows, serviceDataMap: r.svcRows },
    'reports.draft.json': { counts: r.counts, duplicates: r.dup, missing: r.missing, generatorIssues: r.issues },
  };
  const csv = [Object.keys(r.coverage[0]).join(',')].concat(r.coverage.map((c) => Object.values(c).map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))).join('\n') + '\n';
  if (check) {
    for (const [f, v] of Object.entries(files)) { const p = path.join(OUT, f); if (!fs.existsSync(p) || fs.readFileSync(p, 'utf8') !== JSON.stringify(v, null, 1) + '\n') { console.error('STALE', f); process.exit(1); } }
    console.log('taxonomy-draft outputs up to date'); return;
  }
  fs.mkdirSync(OUT, { recursive: true });
  for (const [f, v] of Object.entries(files)) fs.writeFileSync(path.join(OUT, f), JSON.stringify(v, null, 1) + '\n');
  fs.writeFileSync(path.join(OUT, 'coverage-matrix.draft.csv'), csv);
  const kids = {}; for (const n of r.dataset.nodes) (kids[n.parentId ?? 'ROOT'] ||= []).push(n);
  const lines = ['# SokoHai taxonomy v1 — DRAFT hierarchy', '', 'Kila mstari: ID · Kiswahili / English · [type, origin]. Nodes za OTHER zimefupishwa.', ''];
  const walk = (id, depth) => { for (const n of kids[id] || []) { if (n.origin === 'SYSTEM' && n.level === 4) continue; lines.push(`${'  '.repeat(depth)}- ${n.id} · ${n.displayName.sw} / ${n.displayName.en} [${n.type}, ${n.origin === n.status ? n.origin : n.origin + '/' + n.status}]`); walk(n.id, depth + 1); } };
  walk('ROOT', 0);
  fs.writeFileSync(path.join(OUT, 'hierarchy.draft.md'), lines.join('\n') + '\n');
  const tq = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const types = r.dataset.nodes.filter((n) => n.level === 4);
  fs.writeFileSync(path.join(OUT, 'types.draft.csv'), ['id,parentId,categoryId,nameSw,nameEn,type,origin,status,i18nStatus'].concat(types.map((n) => { let c = n; while (c && c.level > 1) c = r.dataset.nodes.find((x) => x.id === c.parentId); return [n.id, n.parentId, c?.id, n.displayName.sw, n.displayName.en, n.type, n.origin, n.status, n.i18nStatus].map(tq).join(','); })).join('\n') + '\n');
  const mrows = [['source', 'legacyCategory', 'legacySub', 'action', 'targetNodeId', 'overlay', 'note']].concat(r.legacyRows.map((x) => ['advancedCategories', x.legacyCategory, x.legacySub, x.action, x.targetNodeId, x.overlay, x.note]), r.svcRows.map((x) => ['serviceDataMap', `${x.group}/${x.legacyCategory}`, x.legacySub, x.action, x.targetNodeId, '', '']));
  fs.writeFileSync(path.join(OUT, 'legacy-mapping.draft.csv'), mrows.map((row) => row.map(tq).join(',')).join('\n') + '\n');
  console.log(JSON.stringify({ nodes: r.dataset.nodes.length, byLevel: r.counts.byLevel, byOrigin: r.counts.byOrigin, legacy: r.counts.legacy, issues: r.issues.length }, null, 1));
  if (r.issues.length) console.log('ISSUES', JSON.stringify(r.issues.slice(0, 40), null, 1));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
