"""Retrieve candidate passages only. NEVER certifies semantic resolution."""
import json,pathlib,re,hashlib
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
p=pathlib.Path('docs/taxonomy/mission');m=json.load(open('docs/taxonomy/final/master-tracking.json'))
translations={'Nafaka':'cereals grain','Unga':'flour','Mikunde':'pulses legumes','Mboga':'vegetables','Matunda':'fruit','Mizizi':'roots','Viazi':'potatoes tubers','Nyama':'meat','Samaki':'fish','Maziwa':'milk dairy','Mayai':'eggs','Mafuta':'oils fats','Viungo':'spices','Vinywaji':'beverages','Vyakula Vilivyopikwa':'prepared meals food','Mbegu':'seeds','Miche':'plants seedlings','Mbolea':'fertilizers','Dawa za Mimea':'pesticides','Zana':'tools','Mashine':'machinery','Umwagiliaji':'irrigation','Kahawa':'coffee','Chai':'tea','Korosho':'cashew nuts','Pamba':'cotton','Tumbaku':'tobacco','Miwa':'sugar cane','Kakao':'cocoa','Nazi':'coconuts','Karafuu':'cloves',"Ng'ombe":'cattle bovine','Mbuzi':'goats','Kondoo':'sheep','Nguruwe':'swine pigs','Kuku':'chickens','Bata':'ducks','Sungura':'rabbits','Nyuki':'bees honey','Ngozi':'hides skins','Maji Safi':'freshwater','Bahari':'marine','Dagaa':'small fish sardines','Kamba':'crustaceans prawns shrimps','Pweza':'octopus','Chaza':'molluscs oysters','Waliokaushwa':'dried','Miti':'trees','Magogo':'logs','Mbao':'timber','Vitambaa':'fabrics textiles','Kitenge':'printed cotton cloth','Khanga':'printed cotton cloth','Nguo':'clothing','Kiume':'men','Kike':'women','Watoto':'children','Wachanga':'infants','Jadi':'traditional','Kazi':'work','Sherehe':'ceremony','Viatu':'footwear shoes','Mifuko':'bags','Urembo':'beauty','Samani':'furniture','Simu za Mkononi':'mobile telephones','Simu za Kawaida':'telephones','Magari Madogo':'passenger cars','Dawa':'medicines','Michoro':'drawings','Vikapu':'baskets','Vikapu':'baskets','Viwanja':'land','Ardhi':'land','Kilimo':'agriculture','Makazi':'residential','Biashara':'commercial','Viwanda':'industrial','Ufugaji':'livestock','Misitu':'forestry','Taasisi':'institutions','Nyumba':'houses','Vyumba':'rooms'}
docs=[]
for name in ['eac-cet-2025','un-cpc21']:
 for page in json.load(open(p/'sources'/f'{name}.pages.json')):
  # Include page and verbatim text; rankings do not assert applicability.
  docs.append({'document':name,**page})
v=TfidfVectorizer(stop_words='english',ngram_range=(1,2),sublinear_tf=True);x=v.fit_transform([d['text'] for d in docs]);queue=[]
for n,r in enumerate(m['leaves']):
 q=r['leaf']
 for a,b in sorted(translations.items(),key=lambda ab:-len(ab[0])):q=re.sub(re.escape(a),b,q,flags=re.I)
 q=re.sub(r'[^\w\s]',' ',q)
 scores=cosine_similarity(v.transform([q]),x).ravel();hits=[]
 for j in scores.argsort()[-4:][::-1]:
  d=docs[j];terms=set(q.lower().split());lines=d['text'].splitlines();best=sorted(range(len(lines)),key=lambda i:len(set(lines[i].lower().split())&terms),reverse=True)[:3];excerpts=['\n'.join(lines[max(0,i-1):i+4]) for i in best]
  hits.append({'document':d['document'],'pdfPage':d['page'],'retrievalScore':round(float(scores[j]),4),'verbatimExcerpts':excerpts,'applicability':'NOT_SEMANTICALLY_ADJUDICATED'})
 queue.append({'sequence':n+1,'categoryId':r['categoryId'],'leaf':r['leaf'],'repository':{'definitionCompleteness':r['definitionCompleteness'],'exactDefinition':r['sourceDefinition'],'inheritedDefinition':r['inheritedDefinition']},'query':q,'searches':[{'method':'FULL_TEXT_TFIDF','corpus':'EAC CET 2022 updated June 2025 + UN CPC2.1','pagesSearched':len(docs),'result':'CANDIDATES_ONLY'}],'candidatePassages':hits,'reviewStatus':'CANDIDATE_EVIDENCE_NOT_ADJUDICATED','exhaustiveReview':False,'canonicalDecision':'UNCHANGED_PENDING_APPLICABILITY_REVIEW','tierStatus':{'repository':'INVENTORIED','tanzania':'NOT_EXHAUSTED','internationalRegulatory':'CET_CORPUS_SEARCHED','standards':'CPC_CORPUS_SEARCHED','industry':'NOT_EXHAUSTED','manufacturer':'NOT_EXHAUSTED','technicalScientific':'NOT_EXHAUSTED'},'missingDecisionEvidence':['Applicable leaf scope and exclusions','Buyer-selectable behavior versus informational characteristics','Selling units versus customs measurement','Optional field applicability'],'UI':None})
(p/'execution-queue.json').write_text(json.dumps(queue,ensure_ascii=False,indent=2)+'\n')
urls={'eac-cet-2025':'https://www.eac.int/documents?controller=download&task=download.file&file=45388100-f05b-4615-b2f8-dc9abfe2e9b7&name=CET%202022%20VERSION%20updated%20June%202025.pdf','un-cpc21':'https://unstats.un.org/unsd/classifications/unsdclassifications/cpcv21.pdf'}
(p/'sources/index.json').write_text(json.dumps([{'document':name,'url':url,'sha256':hashlib.sha256((p/'sources'/f'{name}.pdf').read_bytes()).hexdigest(),'dateRetrieved':'2026-09-30','scope':'Classification/definition reference only; no automatic selector or stock conversion authority'} for name,url in urls.items()],indent=2)+'\n')
print(len(queue),'candidate packets; semantic adjudication not implied')
