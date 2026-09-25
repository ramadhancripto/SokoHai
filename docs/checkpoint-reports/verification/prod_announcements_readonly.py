# READ-ONLY, unauthenticated, metadata-only. GET only.
import json, urllib.request, urllib.parse
BASE="https://firestore.googleapis.com/v1/projects/sokonet-3b847/databases/(default)/documents/"
F=["status","active","archived","creativeId","advertiserId","headline","moderationStatus"]
out=[];tok=None;code=None
try:
  while True:
    q=[("pageSize","300")]+[("mask.fieldPaths",f) for f in F]+([("pageToken",tok)] if tok else [])
    with urllib.request.urlopen(BASE+"announcements?"+urllib.parse.urlencode(q),timeout=30) as r: j=json.load(r); code=r.status
    out+=j.get("documents",[]); tok=j.get("nextPageToken")
    if not tok: break
except Exception as e: print("announcements list:",e)
cre={r["id"] for r in json.load(open("prod_creatives_inventory.json"))}
g=lambda d,k:(list(d.get("fields",{}).get(k,{}).values()) or [None])[0]
linked=[d for d in out if g(d,"creativeId") in cre]
print("announcements readable:",len(out),"| with creativeId:",sum(1 for d in out if g(d,"creativeId")),"| referencing the 30 creatives:",len(linked))
for d in out:
  if g(d,"creativeId"): print("  ",d["name"].split("/")[-1],g(d,"status"),g(d,"creativeId"),d.get("createTime","")[:19])
json.dump([{"id":d["name"].split("/")[-1],"createTime":d.get("createTime"),**{k:g(d,k) for k in F}} for d in out],open("prod_announcements_inventory.json","w"),indent=1)
