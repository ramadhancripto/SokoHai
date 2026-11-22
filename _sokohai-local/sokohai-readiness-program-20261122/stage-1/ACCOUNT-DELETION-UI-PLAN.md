# Account deletion — UI plan (PROPOSAL)

**Date:** 22 Nov 2026.

**Design rules:**

- reuse the existing menu, settings and support-center modal (`130-support-center.js`);
- reuse the existing visual system (white/green, SVG icons);
- bilingual through the existing LMS dictionary;
- no new module family.

## Journeys

**1. Menyu → Mipangilio → "Faragha na data yangu" (Privacy & my data)** — a new section in the existing settings screen:

- "Taarifa zangu" (My information): link to the profile editor;
- "Sahihisha taarifa" (Correct information): profile editor;
- "Omba nakala ya data yangu" (Request a copy of my data): support request, type `data_access`;
- "Ruhusa" (Consents): public-phone switch (existing);
- "Futa akaunti yangu" (Delete my account): flow 2;
- link to the Privacy Policy "Your rights".

**2. "Futa akaunti yangu":**

1. Info screen: what is deleted, what is kept and why, and how long it takes (D1/D2).
2. Blocker check: e.g. "Una oda 1 inayoendelea" (you have 1 open order), "Salio la pochi si 0" (wallet balance is not 0), "Wewe ni wakala wa wanachama 3" (you are an agent for 3 members), each with a link to resolve.
3. Re-authentication:
   - Google → `reauthenticateWithPopup`;
   - e-mail → password field;
   - offline member (PIN) → not self-service (agent or support).
4. Confirmation: type **FUTA** / **DELETE**, plus a checkbox "Nimeelewa" (I understand).
5. Result: "Ombi limepokelewa · Namba SR-XXXX" (request received, reference number), the pending date, and a "Ghairi ombi" (cancel request) button.

**3. Status:**

- the existing "Maombi yangu ya msaada" (my support requests) shows the request with its status (Limepokelewa → Linashughulikiwa → Limekamilika);
- during the pending period a banner appears on sign-in: "Akaunti yako imepangwa kufutwa tarehe … [Ghairi]" (your account is scheduled for deletion on … [Cancel]).

**4. Public web page `/delete-account.html`** (needed for Google Play): static and bilingual. It explains:

- the in-app steps;
- what is kept;
- the timeline;
- how to request without the app (support e-mail, PENDING).

**5. Admin:** the Admin Portal gets a "Maombi ya kufuta akaunti" (account deletion requests) list:

- read-only on Spark;
- shows blockers and a copyable executor command, with no secrets.

## Accessibility

- 44 px targets;
- focus order;
- clear warning text;
- no colour-only status.

Screens will be checked at 360, 390 and 1366 px before approval.
