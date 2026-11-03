# SokoHai — Chat: Kichwa, Upau wa Kuandika na Simu (Sauti + Video) · 2026-11-02

Ombi lako:
1. ndani ya chat **hakuna kitufe cha kurudi** — kirekebishwe;
2. **kichwa cha juu** (unachat na nani) kimekaa vibaya — kirekebishwe;
3. **upau wa kuandika** hauonekani vizuri, hasa **kutuma voice note**;
4. kwa juu, **parallel na jina**: **simu ya sauti** na **simu ya video**;
5. chini kwenye upau wa kuandika: **emoji/reaction** na **biashara (trade)** zote ziwe ndani;
6. simu ziwe **halisi za mtandao (online)** kama WhatsApp / FB / TikTok — sio kitufe cha kuonyesha.

Yote yamefanyika. Simu ni **WebRTC halisi** (sio UI ya uongo).

---

## 1. Kichwa cha chat (top bar)

| Kabla | Baada |
|---|---|
| Kitufe kidogo cha `<` bila maandishi | **Kitufe "Rudi"** chenye nembo + neno (simuni: nembo pekee) |
| Avata ilikuwa ikoni ya "bubble" (haikuonyeshi mtu) | **Avata halisi**: herufi mbili za mwanzo au picha ya mtu (kupitia `skhUserAvatar`) |
| Jina 14px, sehemu ya chini tupu | Jina **15px nzito** + mstari wa hali wenye **doti ya kijani** (mf. "• Muuzaji · Kariakoo") |
| — | **Simu ya sauti** 📞 na **simu ya video** 📹 karibu na jina, kisha tafuta na menyu |

Mpangilio: `[Rudi] [Avata] [Jina + hali] .......... [Sauti] [Video] [Tafuta] [⋮]`
Kwenye simu: tafuta imehamia kwenye menyu ya `⋮` ili jina lipate nafasi.

## 2. Upau wa kuandika (typing bar)

Mstari MMOJA: `[+] [🙂] [ andika ujumbe… ] [🎤] [🛒] [Tuma]`

- **`+`** — Kamera, Picha & Video, Hati, Mahali (kama zamani).
- **`🙂` Emoji & hisia** — gridi ya emoji 48 (nyuso, mikono, mioyo, 🔥💯🎉, na emoji za biashara 🛒📦🚚💰) zinazoingia kwenye ujumbe mahali pa cursor.
- **`🎤` Voice note** — zamani ilikuwa ikoni ya **simu** isiyoeleweka, na `alert()` ilikuwa ikizuia kila mara. Sasa:
  - kitufe cha kipaza sauti (mic) kinadunda **nyekundu** wakati wa kurekodi;
  - **chip** inaonekana juu ya upau: `● 0:12 Inarekodi… [Acha na tuma]`;
  - kupakia na kutuma sauti kunaendelea kama zamani (hakuna mantiki iliyobadilishwa).
- **`🛒` Biashara** — menyu ndani ya upau: **Tuma Bidhaa**, **Tuma Oda**, **Toa Ofa / Pendekeza Bei**, **Tuma Mahali (Pickup)** — vyote vinaita functions zilizopo tayari.
- **Tuma** — kitufe kikubwa cha kijani (44px) kilicho sawa kila mahali.

## 3. Simu za mtandao (WebRTC) — halisi

| Kipengele | Hali |
|---|---|
| Simu ya **sauti** | ✅ `getUserMedia({audio})` + `RTCPeerConnection` |
| Simu ya **video** | ✅ video ya mwenzako **skrini yote**, kamera yako kwenye dirisha dogo (pip) |
| Simu inayoingia | ✅ skrini kamili: avata, jina, "Simu ya video inayoingia…", **Kubali / Kataa**, mlio + mtetemo |
| Muda wa simu | ✅ `0:07`, `1:24` … |
| Vitufe ndani ya simu | ✅ Mkrofoni (zimaa/waka), Kamera, **Geuza kamera**, Spikaa, **Kata** (nyekundu) |
| Kukataa / kukatwa | ✅ upande wa pili unapata hali halisi ("Amekataa simu" / "Simu imeisha") |
| Kuficha | ✅ kitufe cha jicho — simu inaendelea |
| Kuzima media | ✅ mic/camera zinaachiliwa simu ikiisha (hakuna kamera inayokaa imewaka) |

### Vifaa na usanifu

- **Signalling:** `calls/{callId}` ndani ya Firestore (`offer`, `answer`, `fromCandidates`,
  `toCandidates`, `state`) — `onSnapshot` kwa mwito unaoingia.
- **Fallback ya kifaa kimoja:** `BroadcastChannel` (tabo mbili za kivinjari kimoja) —
  hutumika kwa majaribio na wakati Firestore haijaruhusu bado.
- **ICE:** STUN ya Google kwa default. **TURN** inaweza kuwekwa bila kubadilisha code:
  ```html
  <script>window.SKH_CALL_ICE = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'turn:turn.example.com:3478', username: '…', credential: '…' }
  ];</script>
  ```

### ⚠️ Mambo mawili ya kuwashwa (yanahitaji idhini yako — SIKUPELEKA)

1. **Firestore rules za `calls`** (bila hivi, simu zinaita tu ndani ya kifaa kimoja).
   Pendekezo (lazima liidhinishwe kabla ya deploy):
   ```
   match /calls/{callId} {
     allow create: if request.auth != null
                   && request.resource.data.from == request.auth.uid;
     allow read, update: if request.auth != null
                   && (resource.data.from == request.auth.uid
                       || resource.data.to == request.auth.uid);
     allow delete: if false;
   }
   ```
2. **TURN server** kwa simu za mtandao wa simu (CGNAT). Bila TURN, simu za WiFi/WiFi
   zinafanya kazi; baadhi ya mitandao ya simu zitashindikana — app inasema hivyo wazi
   ("Simu imeshindikana — angalia mtandao").

**Ukubwa wa matarajio kwa uwazi:** simu inaita tu ikiwa mwenzako **yupo ndani ya app**
(hakuna push notification / FCM ringing bado). Kufikia "inaita hata app imefungwa"
kunahitaji Cloud Functions + FCM (+ ikiwezekana Twilio kwa simu za nje) — phase tofauti.

---

## Faili

| Faili | Kazi |
|---|---|
| `css/48-chat-shell.css` | **MPYA** — kichwa cha chat + upau wa kuandika + popovers |
| `css/49-call-ui.css` | **MPYA** — skrini za simu (inayoingia, video, sauti) |
| `js/app/104-chat-shell.js` | **MPYA** — emoji/hisia, menyu ya biashara, chip ya kurekodi |
| `js/app/105-calls.js` | **MPYA** — injini ya WebRTC + UI + Firestore/BroadcastChannel signalling |
| `js/app/34-chat-core.js` | `toggleVoiceRecord()` imerekebishwa (chip + mic nyekundu; hakuna `alert`) |
| `js/app/32-i18n.js`, `js/18-icons.js` | keys + ikoni mpya (`mic`, `video`, `phone-call`, `smile`, `speaker`) |
| `index.html` | markup mpya ya kichwa/composer + `<link>`/`<script>` mbili |

## Uthibitisho (zote zimeendeshwa)

| Mtihani | Matokeo |
|---|---|
| **`tools/test_calls_webrtc.mjs`** (mpya) — vifaa viwili halisi, kamera/mic za uongo | **20/20** |
| `tools/test_chat_compact.mjs` | **37/37** |
| `tools/test_chat_nego_cards.mjs` | **33/33** |
| `tools/test_fullscreen_pages.mjs` | **399/399** |
| `tools/test_post_cards.mjs` | **60/60** |
| `tools/bottom_nav_verify.mjs` | **12/12** |
| `tools/test_ad_card_styling.mjs` | **14/14** |

Mtihani wa simu huthibitisha hasa: simu inaita kwa mwenzako, anakubali, **pande zote
mbili zinaunganishwa (`connected`)**, **video halisi inapokelewa pande zote mbili**
(`videoWidth > 0`), muda unahesabiwa, mkrofoni inazimika, kukata simu kunafika kwa
mwenzako, kamera/mic zinaachiliwa, simu ya sauti inafanya kazi, kukataa kunafika, na
vitufe vinaingia kwenye skrini ya simu (390×844).

Picha: `audit-shots/chat-shell-desktop.png`, `chat-shell-mobile.png`,
`chat-shell-emoji-*.png`, `chat-shell-trade-*.png`,
`call-incoming-desktop.png`, `call-incoming-mobile.png`,
`call-video-desktop.png`, `call-video-mobile.png`, `call-video-receiver.png`,
`call-audio-desktop.png`.

## Jinsi ya kujaribu
```bash
node tools/build_dist.mjs
source /home/user/pw.sh
node tools/test_calls_webrtc.mjs     # simu halisi kati ya tabo mbili
```
Kwa mkono: fungua mazungumzo → bofya 📞 au 📹 juu kulia.
