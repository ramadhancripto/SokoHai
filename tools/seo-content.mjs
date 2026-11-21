/* [SEO 2026-11-21] Hand-written public content for the crawlable site (tools/build_seo.mjs).
 * Rules: practical, true for SokoHai as it works today (free listings, chat with sellers, no in-app payment / escrow /
 * delivery switched on), no invented statistics, partners, prices or endorsements. */

export const GUIDES = [
  {
    slug: 'kununua-simu-iliyotumika',
    title: 'Jinsi ya kununua simu iliyotumika kwa usalama',
    description: 'Hatua za kukagua simu iliyotumika kabla ya kulipa: IMEI, betri, skrini, akaunti za simu na mahali salama pa kukutana.',
    cat: 'CAT-12', query: 'simu',
    sections: [
      ['Kabla ya kukutana', '<p>Mwulize muuzaji kupitia chat ya SokoHai maswali ya msingi: simu imetumika muda gani, ina tatizo lolote, inakuja na chaja au boksi, na kwa nini inauzwa. Linganisha bei yake na matangazo mengine ya simu ileile kwenye SokoHai kabla ya kukubaliana.</p>'],
      ['Kagua namba ya IMEI', '<p>Piga <b>*#06#</b> kwenye simu na ulinganishe namba ya IMEI na iliyo kwenye boksi au chini ya betri/trei ya laini. Namba zisipolingana, usinunue. Kama una shaka simu imeripotiwa kuibwa, wasiliana na mtoa huduma wako wa mtandao kabla ya kulipa.</p>'],
      ['Kagua hali ya simu', '<ul><li>Skrini: angalia mistari, madoa na sehemu zisizogusika.</li><li>Betri: chaji kidogo mbele yako; simu isizime ghafla wala kupata joto kupita kiasi.</li><li>Kamera, spika, maikrofoni na vitufe: jaribu vyote.</li><li>Laini na intaneti: weka laini yako upige simu na kufungua ukurasa.</li></ul>'],
      ['Akaunti na usalama wa data', '<p>Hakikisha muuzaji ametoka kwenye akaunti zake (Google au Apple ID) na amerudisha simu kwenye mipangilio ya kiwandani mbele yako. Simu iliyofungwa kwa akaunti ya mtu mwingine haitakufaa.</p>'],
      ['Malipo na kukutana', '<p>Kutana mahali pa wazi na salama mchana. Lipa baada ya kukagua. SokoHai kwa sasa haishikilii malipo (escrow haijawashwa), kwa hiyo usitume pesa kabla ya kuona simu. Ukiona tangazo la kutiliwa shaka, liripoti kwenye app.</p>']
    ]
  },
  {
    slug: 'kuchagua-fundi-umeme',
    title: 'Jinsi ya kuchagua fundi umeme wa kuaminika',
    description: 'Maswali ya kumwuliza fundi umeme, jinsi ya kulinganisha makadirio ya gharama na tahadhari za usalama wa umeme nyumbani.',
    cat: null, query: 'fundi umeme', kind: 'services',
    sections: [
      ['Eleza kazi kwa uwazi', '<p>Kupitia chat, eleza kazi unayotaka (mfano: kuweka soketi mpya, kurekebisha taa, kuunganisha nyumba), mahali ilipo na picha za eneo. Maelezo mazuri humsaidia fundi kukupa makadirio sahihi.</p>'],
      ['Omba makadirio zaidi ya moja', '<p>Linganisha mafundi wawili au watatu wa SokoHai katika eneo lako. Uliza kama bei inajumuisha vifaa, muda wa kazi na kama atarudi kurekebisha tatizo likijitokeza baada ya kazi.</p>'],
      ['Uzoefu na uthibitisho', '<p>Mwulize fundi kuhusu kazi kama hiyo aliyowahi kufanya na kama ana cheti au usajili unaohitajika kwa kazi kubwa za umeme. Kwa kazi ya kuunganisha umeme mpya, fuata taratibu za mamlaka husika za umeme.</p>'],
      ['Usalama kwanza', '<ul><li>Umeme uzimwe kwenye swichi kuu kabla ya kazi.</li><li>Vifaa (waya, swichi, soketi) viwe vya ubora unaofaa.</li><li>Usiruhusu kazi ya umeme bila kinga ya kutosha.</li></ul>'],
      ['Baada ya kazi', '<p>Jaribu kila kitu kabla ya kulipa salio. Andika maoni ya kweli kuhusu huduma ili kuwasaidia wengine.</p>']
    ]
  },
  {
    slug: 'kuuza-haraka-sokohai',
    title: 'Jinsi ya kuandaa tangazo linaloonekana na kuuzika',
    description: 'Mwongozo kwa wauzaji: kichwa kinachoeleza bidhaa, picha nzuri, bei wazi, hali ya stoo na eneo — mambo yanayosaidia tangazo kupatikana kwenye utafutaji.',
    cat: null, query: null,
    sections: [
      ['Kichwa kinachoeleza bidhaa', '<p>Andika jina halisi la bidhaa, chapa, modeli na kipimo muhimu (mfano: "Samsung Galaxy A15 128GB" au "Mchele wa Kyela kilo 25"). Usirudie maneno yaleyale wala kuongeza maneno yasiyohusiana: utafutaji wa SokoHai hushusha matangazo yenye kujaza maneno (keyword stuffing).</p>'],
      ['Picha halisi', '<p>Weka angalau picha mbili za bidhaa yenyewe, kwenye mwanga mzuri. Picha za bidhaa halisi huwapa wanunuzi imani zaidi kuliko picha za mtandaoni.</p>'],
      ['Bei na hali ya stoo', '<p>Weka bei wazi. Sasisha idadi iliyopo stoo: utafutaji unazipa kipaumbele bidhaa zinazopatikana, na tangazo lililoisha stoo hushushwa.</p>'],
      ['Kategoria, maelezo na eneo', '<p>Chagua kategoria sahihi na ujaze vipimo (chapa, rangi, ukubwa). Eleza hali ya bidhaa (mpya au imetumika) na eneo lako; wanunuzi wengi hutafuta bidhaa zilizo karibu nao.</p>'],
      ['Jibu haraka na kwa uaminifu', '<p>Jibu maswali kwenye chat mapema. Taarifa za kweli hupunguza migogoro. Soma <a href="/seller-policy.html">Sera ya Wauzaji</a> na <a href="/community-guidelines.html">Miongozo ya Jumuiya</a>.</p>']
    ]
  }
];

export const PARTNERS_PAGE = {
  title: 'Washirika na viungo vya SokoHai',
  description: 'Jinsi biashara, wasambazaji, vyama vya biashara na wachapishaji wanavyoweza kushirikiana na SokoHai na kuunganisha kurasa zao za umma — kwa uwazi na bila malipo ya viungo.',
  sections: [
    ['Kwa wauzaji na watoa huduma', '<p>Kila muuzaji mwenye matangazo hai ana ukurasa wa umma wa duka kwenye SokoHai. Ndani ya app: <b>Wasifu → Shiriki duka lako</b> unapata kiungo cha duka lako na, ukipenda, beji ya "Tupo SokoHai" ya kuweka kwenye tovuti au blogu yako ya biashara. Ni hiari kabisa.</p>'],
    ['Kwa wasambazaji, vyama vya biashara na jumuiya', '<p>Kama mnawakilisha wauzaji au wazalishaji na mnataka kuwaelekeza wanachama wenu kwenye maduka yao ya SokoHai, wasiliana nasi kupitia <a href="/contact.html">ukurasa wa mawasiliano</a>. Tunaweka orodha ya washirika <b>tu</b> baada ya ruhusa ya maandishi; kwa sasa hakuna mshirika aliyeorodheshwa.</p>'],
    ['Kwa wachapishaji na blogu', '<p>Mnaweza kuunganisha kurasa za umma za SokoHai (kategoria, miongozo, maduka) pale zinapowasaidia wasomaji wenu. Hatulipi, hatunui wala hatubadilishani viungo.</p>'],
    ['Kanuni zetu za viungo', '<ul><li>Hakuna viungo vya kununua, mitandao ya blogu za kutengeneza viungo (PBN), wala maoni ya spam.</li><li>Hakuna viungo vilivyofichwa wala maandishi yaliyofichwa.</li><li>Maandishi ya watumiaji (maelezo ya matangazo, maoni) hayageuzwi kuwa viungo. Kiungo chochote cha mtumiaji kitakachoonyeshwa siku za usoni kitawekwa <code>rel="ugc nofollow"</code>, na kiungo cha tangazo la kulipiwa <code>rel="sponsored"</code>.</li><li>Hatutoi kauli za ushirikiano au uthibitisho wa mtu yeyote bila ruhusa yake.</li></ul>']
  ]
};
