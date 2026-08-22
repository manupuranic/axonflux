"""Read-only Phase 5B long-tail detection and strict semantic contract."""
from __future__ import annotations
import re
from collections import Counter

SEMANTIC_NAME_SCHEMA = {
 "type":"object", "additionalProperties":False,
 "required":["result","confidence","reason"],
 "properties":{
  "result":{"enum":["CORRECTION","NO_CHANGE","UNCERTAIN"]},
  "confidence":{"enum":["HIGH","MEDIUM","LOW"]}, "reason":{"type":"string"},
  "suggested_name":{"type":["string","null"]},
  "changes":{"type":"array","items":{"type":"object","additionalProperties":False,"required":["original_text","replacement_text","change_type"],"properties":{"original_text":{"type":"string"},"replacement_text":{"type":"string"},"change_type":{"enum":["SPELLING","ABBREVIATION","TRUNCATION","STRUCTURAL","OTHER"]}}}}
 }}

def tokens(name: str) -> list[str]: return re.findall(r"[A-Z]{3,}", name.upper())
def detect(names: list[tuple[str,str]]) -> list[dict]:
    vocab=Counter(t for _,n in names for t in tokens(n)); out=[]
    protected={"JAWARI","AVALAKKI","SAJJE","SAJJI","PEANUT","GROUNDNUT","CREM"}
    for item_id,name in names:
        for token in tokens(name):
            if token in protected: continue
            # Precision-first: one clear, much more frequent one-edit peer of similar length.
            close=[word for word,count in vocab.items() if count>=max(12,vocab[token]*8) and abs(len(word)-len(token))<=1 and _distance(word,token)==1]
            if vocab[token]<=3 and len(close)==1: out.append({"item_id":item_id,"name":name,"token":token,"reason":"RARE_NEAR_NEIGHBOR","evidence":close[0]})
            elif token in {"SHOULDE","CHOCOLT","LIQUD"}: out.append({"item_id":item_id,"name":name,"token":token,"reason":"TRUNCATED_LOOKING","evidence":"known suspicious token"})
    return out

def _distance(a: str, b: str) -> int:
    if abs(len(a)-len(b))>1:return 99
    prev=list(range(len(b)+1))
    for i,x in enumerate(a,1):
        cur=[i]
        for j,y in enumerate(b,1): cur.append(min(cur[-1]+1,prev[j]+1,prev[j-1]+(x!=y)))
        prev=cur
    return prev[-1]

def context_qualified(candidates, purchase_names, catalog_names):
    """Keep only candidates corroborated by raw barcode or overlapping catalog context."""
    out=[]; catalog=[(n,set(tokens(n))) for n in catalog_names]; by_token={}
    for n,ts in catalog:
        for t in ts: by_token.setdefault(t,[]).append((n,ts))
    mapping_counts=Counter((x["token"],x["evidence"]) for x in candidates)
    for c in candidates:
        replacement=c["evidence"]
        current=set(tokens(c["name"]))-{c["token"]}
        evidence=[]
        if any(replacement in tokens(n) for n in purchase_names.get(c["item_id"], [])): evidence.append("PURCHASE")
        siblings=[n for n,ts in by_token.get(replacement,[]) if len(current & ts)>=1]
        if siblings: evidence.append("CATALOG_SIBLING")
        if mapping_counts[(c["token"],replacement)]>=2: evidence.append("REPEATED_PATTERN")
        if evidence: out.append({**c,"context_evidence":evidence,"corroborating_catalog":siblings[:2]})
    return out
