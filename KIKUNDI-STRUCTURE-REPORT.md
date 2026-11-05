# KIKUNDI CHA SOKOHAI — Muundo wa Sasa (Structure Report)

**Tarehe:** 2026-11-04
**Repo:** `SokoHai` @ HEAD `03a6811` (working tree)
**Aina ya ripoti:** Uchunguzi wa msimbo halisi — hakuna mabadiliko yaliyofanywa
**Vyanzo:** `js/app/69-chat-groups.js`, `js/app/73-group-soga.js`, `js/app/74-group-order-system.js`, `firestore.rules`

> Ripoti hii inaonyesha **jinsi kikundi kilivyojengwa KWA SASA** — muundo wa data, majukumu (roles), ruhusa, mzunguko wa maisha (lifecycle), na UI. Sehemu ya 8 ni **ukaguzi wa ukweli**, na **imejaribiwa kwenye Firestore emulator halisi** (sio kusoma msimbo pekee) — angalia §8.0.

---

## 1. Muhtasari kwa sekunde 30

Kikundi cha SokoHai si "kikundi cha ujumbe" tu — ni **chombo cha biashara** chenye:

- **Hati kuu** `chatGroups/{gid}` (mipangilio ya kikundi)
- **Wanachama** kama subcollection `members/{uid}` (sio array — kila mtu na hati yake)
- **Mialiko** `invitations/{uid}` (kuzuia duplicates: doc ID = uid)
- **Matukio** `events/{autoId}` (log ya kila kitu kinachotokea)
- **Mazungumzo** yanayorejea `conversations/conv_group_{gid}`
- **Oda za Pamoja** `groupOrders/{goid}` (zimefungwa kwa flag kwa sasa)

Kaulimbiu iliyowekwa kwenye msimbo: **§44 — hakuna duplicates** (conv ID ni deterministic, invite doc ID ni uid, member doc ID ni uid).

---

## 2. Mchoro wa muundo (data structure)

```
chatGroups/{gid}                        ← hati kuu ya kikundi
│
├── members/{uid}                       ← mwanachama = hati MOJA kwa kila mtu
│     userId, role, status, joinedAt,
│     invitedBy, leftAt, approvedBy, approvedAt, rejectedBy
│
├── invitations/{uid}                   ← mwaliko (ID = uid wa mwalikwa → hakuna dup)
│     status: pending|accepted|declined
│     groupId, invitedBy, invitedAt, targetUid, respondedAt
│
├── events/{autoId}                     ← log ya matukio (append-only)
│     type, actorUid, targetUid, note, at, goid
│
├── messages/{msgId}                    ← IMEUNGWAMSHWA kwenye sheria, HAIJATUMIKA kwenye msimbo
│
└── groupOrders/{goid}                  ← Oda za Pamoja (server-only writes)
      └── {sub=**}                      ← pledges, offers, n.k.

conversations/conv_group_{gid}          ← chombo cha mazungumzo (deterministic ID)
└── messages/{msgId}                    ← msimbo UNAANDIKA hapa (angalia §8)
      senderUid, senderName, text, at, mentions, replyTo, threadRootId

sharedContexts/{gid}                    ← context ya biashara (nakala tepe)
      type, contextId, contextName, createdBy, participants
```

**Kanuni:** `gid` = `g_<base36 time>_<random5>`; `conversationId` = `conv_group_<gid>` — hutengenezwa mara moja, hakuna utafutaji wa "je, ipo?" (no dup).

---

## 3. Hati kuu: `chatGroups/{gid}`

Imetengenezwa na `skhGroupCreate()` (`69-chat-groups.js:61`):

| Field | Aina | Thamani / maana |
|---|---|---|
| `name` | string | Jina (lazima ≥ 3 herufi) |
| `description` | string | Maelezo mafupi |
| `groupType` | string | `TEMPORARY_COMMERCE` (default) \| `PERMANENT_COMMUNITY` |
| `category` | string | default `general` |
| `contextType` | string | `GENERAL` \| `GROUP_BUY` \| `WHOLESALE` \| `TRANSPORT` \| `PRODUCT` \| `SERVICE` |
| `contextId` | string\|null | ID ya bidhaa/oda inayohusiana |
| `visibility` | string | `public` (default) \| `private` |
| `joinPolicy` | string | `open` (default) \| `request` |
| `invitePolicy` | string | `everyone` (default) \| `admins` |
| `sendPolicy` | string | `everyone` (default) \| `admins` |
| `status` | string | `ACTIVE` \| `ARCHIVED` \| `COMPLETED` \| `CANCELLED` |
| `createdBy` / `ownerId` | string | uid wa muundaji (mmiliki) |
| `createdAt` / `updatedAt` / `archivedAt` | ISO string | |
| `memberCount` | number | huanza 1, husawazishwa kwa read-modify-write |
| `conversationId` | string | `conv_group_{gid}` |
| `sharedContext` | map | `{type, contextId, contextName, createdBy, participants[]}` |
| `limits.maxMsgsPerMinute` | number | default 20 (anti-spam) |
| `discoverable` | bool | sheria inaisoma (default `true` ikiwa haipo) |

**Muhimu:** kikundi hakina array ya `members` — wanachama ni subcollection. Sheria za Firestore zinaruhusu pia `admins[]` kwenye hati kuu (helper `isGroupOwner`), lakini **msimbo wa sasa hauandiki `admins`** — kinatumika `createdBy`/`ownerId` pekee.

---

## 4. Majukumu (Roles) — 5 halisi

Kutoka `69-chat-groups.js:57-60`:

| Role | Ruhusa |
|---|---|
| `owner` | Kila kitu. **Mmoja tu** — kubadilisha ni kwa `skhGroupTransferOwnership()`, sio `setRole()` |
| `admin` | Kusimamia wanachama, kuidhinisha, kufuta, kubadilisha mipangilio |
| `moderator` | Uzuiaji/kudhibiti maudhui (`canModerate`) |
| `organizer` | Kuandaa Oda za Pamoja (`canOrganize`) |
| `member` | Kuandika ujumbe (kulingana na `sendPolicy`) |

Vizuizi vya msimbo:

```js
canManage(role)   = owner | admin
canModerate(role) = owner | admin | moderator
canOrganize(role) = owner | admin | organizer
roleOf(mem)       = mem.status === 'active' ? (mem.role || 'member') : null
```

**Hali ya mwanachama:** `active` · `pending` · `left` — role inahesabiwa TU ikiwa `status === 'active'`.

---

## 5. Mzunguko wa maisha (Lifecycle)

### 5.1 Kuunda — `skhGroupCreate(cfg)` → `69:61`

```
1. Hakiki: mtumiaji ameingia + jina ≥ herufi 3
2. Tengeneza gid + hati ya kikundi (fields za §3)
3. Andika conversations/conv_group_{gid}   ← (angalia §8: hii inakatwa)
4. Andika sharedContexts/{gid}
5. Andika members/{uid} = {role:'owner', status:'active', invitedBy:null}
6. logEvent('group_created')
7. return {id, data}
```

### 5.2 KuALIKA — `skhGroupInvite(gid, targetUid)` → `69:1395`

Vizuizi kwa mpangilio:

1. Huwezi kujialika mwenyewe
2. Kikundi lazima `status === 'ACTIVE'`
3. **Blocklist inaheshimiwa** — `chatBlocks/{me__target}` au `{target__me}` → kataza
4. Wewe lazima uwe mwanachama
5. `invitePolicy === 'admins'` → owner/admin tu
6. Lengo likiwa tayari `active`/`pending` → `{dup:true}`
7. Mwaliko uliopo `pending` → `{already:true}`
8. Andika `invitations/{targetUid}` + `logEvent('member_invited')`

### 5.3 Kukubali / Kukataa — `69:1450-1470`

`{status:'accepted'|'declined', respondedAt}` → kisha member doc `active`.

### 5.4 Kujiunga — `skhGroupJoin(gid)` → `69:111`

```
status !== ACTIVE              → kataza
tayari active                 → {already:true}   (§44 no dup)
tayari pending                → {pending:true}
public + joinPolicy 'open'    → member active MARA MOJA
vinginevyo                    → member PENDING (admin aidhinisha)
```

### 5.5 Kuidhinisha — `skhGroupApproveJoin(gid, targetUid, approve)` → `69:1487`

Owner/admin tu. `approve` → `status:'active'`, `approvedBy`, `approvedAt`, `memberCount+1`, `syncConvParticipants(+1)`.

### 5.6 Kusimamia wanachama

| Function | Mstari | Nani |
|---|---|---|
| `skhGroupSetRole(gid, uid, role)` | 1303 | owner tu |
| `skhGroupRemoveMember(...)` | ~1280 | owner/admin |
| `skhGroupLeave(gid)` | 156 | mwanachama mwenyewe |
| `skhGroupTransferOwnership(gid, uid)` | 203 | owner |
| `skhGroupArchive(gid, status)` | 1319 | owner/admin |
| `skhGroupUpdateInfo(gid, patch)` | 225 | owner/admin |

### 5.7 Mazungumzo — `skhGroupSendMessage(gid, text, opts)` → `69:285`

```
1. Hakiki uanachama + sendPolicy + rate limit (maxMsgsPerMinute, default 20/dk)
2. extractMentions() → @jina / @wote
3. addDoc(conversations/conv_group_{gid}/messages, {senderUid, senderName, text, at, mentions})
4. Sasisha lastMessage + unread kwa wanachama wengine (RMW)
```

Zaidi ya ujumbe: `skhGroupSendTyped` (363) · `skhGroupVotePoll` (449) · `skhGroupClosePoll` (474) · `skhGroupToggleReaction` (490) · `skhGroupSetAvatar` (511) — avatar ni **emoji**, hakuna Storage.

---

## 6. UI — jinsi mtumiaji anavyoijenga

**Njia:** Soga (Chat) → kitufe `+` → **Kikundi kipya** (`data-spm="creategrp"`) → `openCreateModal()` (`69:1793`)

Fomu (`buildCreateModal()`, `69:1809`) ina sehemu hizi kwa mpangilio:

| # | Kipengele | Field |
|---|---|---|
| 1 | Jina | `#skhGrpName` (lazima) |
| 2 | Maelezo | `#skhGrpDesc` |
| 3 | **Chagua Contacts** | `skhContactPicker({multi:true})` — search, role filters, "Chagua wote" |
| 4 | Aina ya kikundi | `#skhGrpType` — Ya muda / Community |
| 5 | Mwonekano | `#skhGrpVis` — Hadharani / Binafsi |
| 6 | Nani anaweza kujiunga | `#skhGrpJoin` — Wazi / Omba idhini |
| 7 | Context ya biashara | `#skhGrpCtxType` + `#skhGrpCtxId` |
| 8 | **UNDA KIKUNDI** | `#skhGrpDoCreate` |

Baada ya kuunda: walioteuliwa wanapewa mwaliko mmoja mmoja (`for` loop ya `skhGroupInvite`), toast inaonyesha idadi iliyofanikiwa, kisha `skhOpenGroupSoga(gid)` inafungua kikundi.

**Ndani ya kikundi** (`73-group-soga.js:327`): kichwa + wanachama (`members` subcollection, `73:63`) + soga + Oda za Pamoja (`73:785`) + vitufe vya Jiunge Sasa kwa wasio wanachama.

---

## 7. Matrix ya ruhusa (msimbo + sheria)

| Kitendo | Msimbo (client guard) | Firestore Rules |
|---|---|---|
| Kusoma kikundi | — | `public` + `discoverable != false`, AU mwanachama, AU admin, AU muundaji |
| Kuunda kikundi | mtumiaji ameingia | `createdBy == uid` |
| Kubadilisha kikundi | owner/admin | `isAdmin()` au owner; `createdBy` haiwezi kubadilika |
| Kufuta kikundi | — | **`allow delete: if false`** (hakuna kufuta — archiving tu) |
| Kusoma members | — | admin, mwanachama, au owner |
| Kuongeza member | owner/admin, au self-join | owner, AU **self + public + role:'member'** |
| Kubadilisha member | owner/admin | owner, AU self ikibadilisha `role/status/approvedBy` **bila kubadilisha** |
| Kufuta member | owner/admin, au aondoke | owner, AU self |
| Kusoma events | — | admin/mwanachama/owner |
| Kuandika events | mwanachama | mwanachama + `actorId`/`senderId` = uid |
| Mialiko | mwanachama, + `invitePolicy` | owner au mwanachama kuandika; **msomaji = owner au `inviteeId`/`invitedUid`** |
| groupOrders | flag `chatGroupOrders` | **`write: false`** — server (Cloud Functions) pekee |

---

## 8. ⚠️ UKAGUZI WA UKWELI — msimbo vs sheria

### 8.0 Ushahidi halisi (Firestore emulator, `firestore.rules` halisi)

Nilijaribu kila hatua dhidi ya sheria halisi kwa kutumia Auth + Firestore emulator. Matokeo ni **facts, sio makisio**:

| # | Jaribio | Matokeo |
|---|---|---|
| 1 | `chatGroups/{gid}` create | ✅ **OK** |
| 2 | `members/{owner}` create | ✅ **OK** |
| 3 | `conversations/conv_group_{gid}` na **mtu 1** (kama msimbo unavyoandika) | ❌ **403** ← G1 |
| 4 | ujumbe kwa **`senderUid`** (kama msimbo unavyoandika) | ❌ **403** ← G2 |
| 4b | ujumbe kwa `senderId` lakini conv haipo | ❌ **403** (G1 inazuia) |
| 5 | `invitations/{uid}` write kwa `targetUid` | ✅ OK |
| 5b | **mwalikwa** anasoma mwaliko wake | ❌ **403** ← G3 |
| 6 | self-join kikundi **private** (`pending`) | ❌ **403** ← G4 |
| 7 | self-join kikundi **public** | ✅ **OK** |

### 8.0b Suluhisho zipi zinafanya kazi (zimejaribiwa)

| Jaribio | Matokeo |
|---|---|
| Conversation na **washiriki 2** | ✅ OK |
| Ujumbe kwa `senderId` kwenye conv iliyopo | ✅ **OK** |
| Mwanachama wa 2 anatuma ujumbe | ✅ **OK** |
| `chatGroups/{id}/messages` kwa `senderId` | ✅ **OK** (njia iliyoruhusiwa na sheria) |
| `chatGroups/{id}/messages` kwa `senderUid` | ❌ 403 |
| Mwaliko ukiwa na **`inviteeId`** → mwalikwa anasoma | ✅ **OK** |

### 8.0c ⛔ Kizuizi kikubwa zaidi (kimegundulika kwa jaribio)

| Jaribio | Matokeo |
|---|---|
| Conversation na **washiriki 3** | ❌ **403** |
| Conversation na 2 → **kuongeza wa 3** | ❌ **403** (participants haiwezi kubadilika) |
| Mwanachama wa 3 anatuma ujumbe | ❌ **403** |

**Maana yake:** kwa sheria za sasa, mazungumzo ya kikundi yanaweza kuwepo **na watu 2 TU**, na **hakiwezi kukua** kuongeza wa tatu. Kwa hiyo "group chat" ya kweli (watu 3+) **haiwezekani** kabisa kwa sasa — sio tatizo la UI, ni la sheria.

---

### 8.1 Uchambuzi wa msimbo (msimbo vs sheria)

### G1 — Hati ya mazungumzo ya kikundi haiwezi kuundwa ❌

```js
// 69-chat-groups.js:96  (skhGroupCreate)
setDoc(conversations/conv_group_{gid}, { type:'group', participants: [uid()] })   // 1 participant
```

```js
// firestore.rules:636  (conversations create)
request.resource.data.participants.size() == 2      // LAZIMA iwe 2
```

**Matokeo:** `1 != 2` → **create inakataliwa**. Msimbo umeifunga kwa `try/catch` → inashindwa kimya kimya. Hakuna sheria maalum ya `conv_group` (nimehakiki: `grep conv_group firestore.rules` → hakuna).

### G2 — Ujumbe wa kikundi unakataliwa ❌

```js
// 69-chat-groups.js:311
addDoc(conversations/conv_group_{gid}/messages, { senderUid: uid(), ... })
```

```js
// firestore.rules:780-783
request.resource.data.senderId == request.auth.uid                                   // msimbo unaandika senderUid ❌
&& get(...conversations/$(convId)).data.participants.hasAny([request.auth.uid])      // hati haipo (G1) ❌
```

**Matokeo:** masharti **mawili** yanashindwa. Ujumbe hautaandikwa.

### G3 — Mwalikwa hawezi kuona mwaliko wake ❌

```js
// 69-chat-groups.js:1424
setDoc(chatGroups/{gid}/invitations/{targetUid}, { status:'pending', invitedBy, targetUid })   // hakuna inviteeId
```

```js
// firestore.rules:1570-1571
resource.data.get('inviteeId','') == request.auth.uid || resource.data.get('invitedUid','') == request.auth.uid
```

**Matoleo:** `targetUid` ≠ `inviteeId`/`invitedUid`. Mwalikwa si owner wala mwanachama → **read inakataliwa** → `skhMyGroupInvitations()` hairudishi kitu. Mialiko "inatumwa" lakini haionekani.

### G4 — Kujiunga kwa "Omba idhini" kwenye kikundi binafsi hakuandikiki ❌

```js
// firestore.rules:1545-1549
allow create: if ... (memberUid == uid && groupOf(id).get('visibility','public') == 'public' && role == 'member')
```

`skhGroupJoin` inaandika `status:'pending'` kwa kikundi cha `private` — lakini sheria inaruhusu **self-create kwa public pekee**. Kwa `private`, hata ombi halitaandikwa.

### G5 — `chatGroups/{id}/messages` ipo kwenye sheria lakini haitumiki ✅⚠️

Sheria (1560-1566) inaruhusu mwanachama kuandika ujumbe kwenye `chatGroups/{id}/messages` kwa `senderId` — **njia hii ni sahihi na iko tayari**, lakini msimbo hauandiki hapo. Hii ni njia ya asili ya kurekebisha G2.

### G6 — Jina la field la events halilingani (haizuii) ⚠️

Msimbo unaandika `actorUid` (`69:47`), sheria inaangalia `actorId`/`senderId` — lakini kwa default `request.auth.uid`, hivyo **inapita**. Ni kutokwenda sawa kwa majina tu.

### Ushahidi wa haraka

```bash
grep -n "conv_group" firestore.rules          # → hakuna sheria maalum
grep -n "participants.size() == 2" firestore.rules   # → 636
grep -n "inviteeId\|invitedUid" firestore.rules      # → 1570,1571,1574
grep -rn "senderUid" js/app/69-chat-groups.js | head  # → msimbo wa ujumbe
```

### Kinachofanya kazi KWELI kwa sasa

| Kipengele | Hali |
|---|---|
| Kuunda kikundi (hati kuu) | ✅ |
| Owner membership (`role:'owner'`) | ✅ |
| Kujiunga kikundi cha `public` + `open` | ✅ |
| Roles, kuondoa, kuachana, kubadilisha mmiliki | ✅ |
| Archiving / status | ✅ |
| Event log | ✅ |
| Kikundi kuonekana kwenye Discover/`skhMyGroups` | ✅ (public) |
| **Mazungumzo ndani ya kikundi** | ❌ G1 + G2 |
| **Mialiko kuonekana kwa mwalikwa** | ❌ G3 |
| **Ombi la kujiunga (private)** | ❌ G4 |
| Oda za Pamoja | ⛔ flag `chatGroupOrders` = false (imezimwa kwa makusudi) |

---

## 9. Jinsi ya kujenga kikundi — hatua kwa hatua

### A. Kupitia UI (mtumiaji wa kawaida)

1. Fungua **Soga / Chat**
2. Bonyeza **`+`** juu kulia
3. Chagua **Kikundi kipya**
4. Jaza **jina** (≥ herufi 3) na maelezo
5. **Chagua Contacts** → chagua watu → Done
6. Chagua: aina, mwonekano, sheria ya kujiunga, context ya biashara
7. Bonyeza **UNDA KIKUNDI**
8. Kikundi kinafunguka; walioteuliwa wanapokea mwaliko

### B. Kupitia API (msimbo)

```js
// 1. Unda
const { id: gid } = await skhGroupCreate({
  name: 'Tununue Mchele — Tabora',
  description: 'Group order ya mchele kwa jumla',
  groupType: 'TEMPORARY_COMMERCE',
  visibility: 'public',
  joinPolicy: 'open',
  contextType: 'WHOLESALE'
});

// 2. Alika (mmoja mmoja — ID = uid, hakuna dup)
await skhGroupInvite(gid, targetUid);

// 3. Upande wa mwalikwa
const invites = await skhMyGroupInvitations();     // ← G3: haitafanya kazi kwa sasa
await skhGroupJoin(gid);                            // au kubali mwaliko

// 4. Idhinisha (kikundi cha 'request')
await skhGroupApproveJoin(gid, targetUid, true);

// 5. Tuma ujumbe
await skhGroupSendMessage(gid, 'Habari za mchele?');   // ← G2: haitafanya kazi kwa sasa

// 6. Simamia
await skhGroupSetRole(gid, targetUid, 'admin');
await skhGroupLeave(gid);
```

### C. Muhimu kwa sasa

Kujenga kikundi **kinafanikiwa** (hati, mmiliki, wanachama wa public). Lakini **mazungumzo na mialiko havitafanya kazi** hadi G1–G3 kurekebishwa. Kwa hivyo: usimwambie mtumiaji "kikundi kiko tayari kwa mazungumzo" kwa sasa.

---

## 10. Mapendekezo (yanahitaji idhini yako)

Kila moja inagusa eneo ulilozuia (**Firestore Rules** / **membership logic**), hivyo **sitafanya bila idhini**:

| # | Pendekezo | Inarekebisha | Athari |
|---|---|---|---|
| 1 | Ruhusu conversations create kwa group (`participants.size() >= 1` ikiwa `type=='group'`, au sheria maalum `conv_group_*`) | G1 | Rules change |
| 2 | Andika ujumbe kwenye `chatGroups/{id}/messages` (njia iliyokwisha ruhusiwa) au tumia `senderId` | G2 | Client tu — **hakuna rules change** |
| 3 | Ongeza `inviteeId` kwenye hati ya mwaliko (au rules isome `targetUid`) | G3 | Client tu (pendekezo la bei nafuu) |
| 4 | Ruhusu self-create ya member `pending` kwa `private` | G4 | Rules change |
| 5 | Sawazisha `actorUid` → `actorId` | G6 | Client tu |

**Pendekezo langu:** namba 2, 3, 5 ni marekebisho ya client pekee — hayagusi sheria, ni salama. Namba 1 na 4 zinahitaji idhini yako ya wazi kwa sababu zinabadilisha `firestore.rules`.

---

## 11. Ramani ya faili

| Faili | Mistari | Ina nini |
|---|---|---|
| `js/app/69-chat-groups.js` | ~1960 | Injini kuu: create/join/invite/members/roles/messages/group orders |
| `js/app/73-group-soga.js` | — | UI ya ndani ya kikundi, ufunguzi (`skhOpenGroupSoga:327`) |
| `js/app/74-group-order-system.js` | — | Mfumo wa Oda za Pamoja (flag OFF) |
| `js/app/68-chat-discover.js` | 116 | Vikundi vya public kwenye Discover (**haitumiki** — module haijaloadiwa) |
| `firestore.rules` | 1525-1595 | Sheria zote za vikundi |
| `firestore.rules` | 630-640, 778-797 | Conversations (G1, G2 zinazuka hapa) |
