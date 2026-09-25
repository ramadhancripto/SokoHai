# READ-ONLY, unauthenticated, metadata-only inventory of production `creatives`. No writes. GET requests only.
import json, urllib.request, urllib.parse
BASE="https://firestore.googleapis.com/v1/projects/sokonet-3b847/databases/(default)/documents/"
FIELDS=["ownerId","status","title","createdAt","updatedAt","publishedVersion","version","basicType","publicationType","campaignName","destination"]
def list_all(coll):
    out=[]; tok=None
    while True:
        q=[("pageSize","300")]+[("mask.fieldPaths",f) for f in FIELDS]+([("pageToken",tok)] if tok else [])
        with urllib.request.urlopen(BASE+coll+"?"+urllib.parse.urlencode(q),timeout=30) as r: j=json.load(r)
        out+=j.get("documents",[]); tok=j.get("nextPageToken")
        if not tok: return out
def val(v):
    if v is None: return None
    for k in ("stringValue","integerValue","timestampValue","booleanValue","doubleValue"):
        if k in v: return v[k]
    if "mapValue" in v: return {k:val(x) for k,x in v["mapValue"].get("fields",{}).items()}
    if "nullValue" in v: return None
    return str(v)[:60]
docs=list_all("creatives")
rows=[]
for d in docs:
    f=d.get("fields",{}); g=lambda k: val(f.get(k))
    rows.append({"id":d["name"].split("/")[-1],"docCreateTime":d.get("createTime"),"docUpdateTime":d.get("updateTime"),
      **{k:g(k) for k in FIELDS}})
rows.sort(key=lambda r:r["docCreateTime"] or "")
json.dump(rows,open("prod_creatives_inventory.json","w"),indent=1)
print("creatives total:",len(rows))
for r in rows:
    dest=r["destination"] or {}
    print(f'{r["id"]}  created={r["docCreateTime"][:19]}  updated={r["docUpdateTime"][:19]}  owner={str(r["ownerId"])[:10]}…  status={r["status"]}  pubVer={r["publishedVersion"]}  type={r["basicType"]}  title={str(r["title"])[:40]!r}  dest={str(dest.get("url") or dest.get("type") or "")[:40]}')
