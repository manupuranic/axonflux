"""Controlled additive Phase 5B pass; never edits cleanup rows or decisions."""
from __future__ import annotations
import argparse, json, sys, time
from collections import Counter, defaultdict
from pathlib import Path
from uuid import UUID
from sqlalchemy import select, text
ROOT=Path(__file__).resolve().parents[1]; sys.path.insert(0,str(ROOT)) if str(ROOT) not in sys.path else None
from api.ai.cost import calculate_cost
from api.tools.item_combination_cleanup.models import ItemCombinationCleanupRow,ItemCombinationCleanupRun,ItemCombinationCleanupNameSuggestion,ItemCombinationCleanupFieldDecision
from api.tools.item_combination_cleanup.name_semantic import detect,context_qualified,tokens
from api.tools.item_combination_cleanup.name_semantic_eval import build_production_payload,evaluate_name,minimal_edit_violations
from api.tools.item_combination_cleanup.naming_standard import suggest_name_standard
from api.tools.item_combination_cleanup.service import effective_name_for_phase5,generate_phase5_name_suggestions
from config.db import SessionLocal
RUN='49a0b23a-9cc9-4b9c-b487-e80bb4d76f48'; VERSION='phase5b-v2-advisory'
def siblings(name,token,replacement,catalog):
    current=set(tokens(name));current.discard(token.upper());out=[]
    for value in catalog:
        ts=set(tokens(value))
        if replacement.upper() in ts and current&ts:out.append(value)
        if len(out)==5:break
    return out


def prepare_pre_gpt_pipeline(names, purchase_names_by_item):
    """Run every deterministic/read-only candidate stage before semantic evaluation."""
    stage_runtimes = {}

    started = time.monotonic()
    resolved = {item_id for item_id, name in names if suggest_name_standard(name).suggested_name}
    stage_runtimes["deterministic_rules"] = round(time.monotonic() - started, 6)

    started = time.monotonic()
    detected = detect(names)
    stage_runtimes["optimized_detector"] = round(time.monotonic() - started, 6)

    started = time.monotonic()
    qualified = context_qualified(detected, purchase_names_by_item, [name for _, name in names])
    stage_runtimes["context_qualification"] = round(time.monotonic() - started, 6)

    started = time.monotonic()
    candidates = [candidate for candidate in qualified if candidate["item_id"] not in resolved]
    stage_runtimes["remove_deterministic_resolved"] = round(time.monotonic() - started, 6)

    started = time.monotonic()
    grouped = defaultdict(list)
    for candidate in candidates:
        grouped[candidate["item_id"]].append(candidate)
    work = [values[0] for values in grouped.values() if len(values) == 1]
    conflicts = [item_id for item_id, values in grouped.items() if len(values) > 1]
    stage_runtimes["group_final_candidates"] = round(time.monotonic() - started, 6)

    return {
        "counts": {
            "rows": len(names),
            "deterministic_resolved_items": len(resolved),
            "detector_candidates": len(detected),
            "context_qualified_candidates": len(qualified),
            "deterministic_candidates_removed": len(qualified) - len(candidates),
            "final_semantic_candidates": len(candidates),
            "semantic_work_items": len(work),
            "semantic_conflict_items": len(conflicts),
        },
        "stage_runtimes_seconds": stage_runtimes,
        "candidates": candidates,
        "work": work,
        "conflicts": conflicts,
    }


def select_current_checkpoint_records(work, historical_records, *, retry_connection_errors=False):
    """Select current records in work order while retaining an append-only checkpoint."""
    by_item = {}
    for record in historical_records:
        item_id = record["item_id"]
        if item_id in by_item:
            raise RuntimeError(f"duplicate checkpoint item {item_id}")
        by_item[item_id] = record
    def is_retryable(record):
        return retry_connection_errors and record.get("error") == "Connection error."

    selected = [
        by_item[candidate["item_id"]]
        for candidate in work
        if candidate["item_id"] in by_item and not is_retryable(by_item[candidate["item_id"]])
    ]
    missing = [
        candidate
        for candidate in work
        if candidate["item_id"] not in by_item or is_retryable(by_item[candidate["item_id"]])
    ]
    return selected, missing


def replace_checkpoint_record(records, new_record):
    """Replace a retryable item while retaining its failed transport attempts."""
    for index, existing in enumerate(records):
        if existing["item_id"] != new_record["item_id"]:
            continue
        history = list(existing.get("attempt_history", []))
        history.append({key: existing[key] for key in ("error", "latency_seconds") if key in existing})
        new_record["attempt_history"] = history
        records[index] = new_record
        return
    records.append(new_record)


def main():
 p=argparse.ArgumentParser();p.add_argument('--model',default='gpt-4o');p.add_argument('--output',type=Path,default=ROOT/'outputs/phase5b_controlled_production.json');p.add_argument('--checkpoint',type=Path,default=ROOT/'outputs/phase5b_controlled_production.partial.json');p.add_argument('--dry-run',action='store_true');p.add_argument('--dry-run-output',type=Path,default=ROOT/'outputs/phase5b_pre_gpt_dry_run.json');p.add_argument('--retry-connection-errors',action='store_true');a=p.parse_args()
 db=SessionLocal();run=db.get(ItemCombinationCleanupRun,UUID(RUN));
 if not run:raise ValueError('run not found')
 before={'rows':db.query(ItemCombinationCleanupRow).filter_by(run_id=run.id).count(),'decisions':db.query(ItemCombinationCleanupFieldDecision).filter_by(run_id=run.id).count(),'suggestions':db.query(ItemCombinationCleanupNameSuggestion).filter_by(run_id=run.id).count()}
 stage_runtimes={};started=time.monotonic();rows=list(db.scalars(select(ItemCombinationCleanupRow).where(ItemCombinationCleanupRow.run_id==run.id)));base={r.item_id_key:effective_name_for_phase5(db,r) or '' for r in rows};barcode={r.item_id_key:str((r.source_identity or {}).get('barcode') or '') for r in rows}; names=[(r.item_id_key,base[r.item_id_key]) for r in rows];stage_runtimes['accepted_effective_names']=round(time.monotonic()-started,6);purchase_by_barcode=defaultdict(list)
 started=time.monotonic()
 bars=[x for x in barcode.values() if x]
 for b,n in db.execute(text('select barcode,item_name_raw from raw.raw_purchase_itemwise where barcode = ANY(:b) and item_name_raw is not null'),{'b':bars}):purchase_by_barcode[str(b)].append(str(n))
 purchase={item_id:purchase_by_barcode[value] for item_id,value in barcode.items()};stage_runtimes['purchase_context']=round(time.monotonic()-started,6)
 prepared=prepare_pre_gpt_pipeline(names,purchase);stage_runtimes.update(prepared['stage_runtimes_seconds']);candidates=prepared['candidates'];work=prepared['work'];conflicts=prepared['conflicts'];resolved_count=prepared['counts']['deterministic_resolved_items']
 if a.dry_run:
  accepted=db.query(ItemCombinationCleanupFieldDecision).filter_by(run_id=run.id,field_name='name',decision='ACCEPTED').count();report={'run_id':RUN,'mode':'PRE_GPT_DRY_RUN','gpt_calls':0,'effective_names':{'rows':len(rows),'accepted_name_decisions':accepted,'original_name_fallbacks':len(rows)-accepted},'counts':prepared['counts'],'stage_runtimes_seconds':stage_runtimes,'safety_counts':before};a.dry_run_output.parent.mkdir(parents=True,exist_ok=True);a.dry_run_output.write_text(json.dumps(report,indent=2));db.rollback();db.close();print(json.dumps(report,indent=2));return
 det=generate_phase5_name_suggestions(db,run);db.commit()
 old=json.loads(a.checkpoint.read_text()) if a.checkpoint.exists() else {'records':[],'prompt_tokens':0,'completion_tokens':0};_,missing=select_current_checkpoint_records(work,old['records'],retry_connection_errors=a.retry_connection_errors);catalog=[n for _,n in names]
 for c in missing:
  payload=build_production_payload({'item_id':c['item_id'],'effective_item_name':c['name'],'suspicious_token':c['token'],'lexical_neighbor':c['evidence'],'detector_reason':c['reason'],'corroborating_evidence':', '.join(c['context_evidence'])},purchase_names=purchase[c['item_id']],catalog_siblings=siblings(c['name'],c['token'],c['evidence'],catalog));record={'item_id':c['item_id'],'candidate':c,'payload':payload};started=time.monotonic()
  try:
   out,completion=evaluate_name(payload,model=a.model);record['gpt']=out.model_dump();record['validation_errors']=minimal_edit_violations(out,original_item_name=c['name'],suspicious_token=c['token']);old['prompt_tokens']+=completion.prompt_tokens;old['completion_tokens']+=completion.completion_tokens
  except Exception as e:record['error']=str(e)
  record['latency_seconds']=round(time.monotonic()-started,3);replace_checkpoint_record(old['records'],record);a.checkpoint.parent.mkdir(parents=True,exist_ok=True);a.checkpoint.write_text(json.dumps(old,indent=2));print(c['item_id'],flush=True)
 active_records,missing=select_current_checkpoint_records(work,old['records'])
 if missing:return
 existing={(s.item_id_key,s.suggestion_version) for s in db.query(ItemCombinationCleanupNameSuggestion).filter_by(run_id=run.id,suggestion_source='SEMANTIC_V2')};created=0
 for r in active_records:
  g=r.get('gpt',{});
  if g.get('result')!='CORRECTION' or r.get('validation_errors') or (r['item_id'],VERSION) in existing:continue
  c=r['candidate'];db.add(ItemCombinationCleanupNameSuggestion(run_id=run.id,item_id_key=r['item_id'],field_name='name',suggestion_source='SEMANTIC_V2',suggestion_version=VERSION,category='SEMANTIC_ADVISORY',base_value=c['name'],suggested_value=g['suggested_name'],transformations=g['changes'],evidence={'payload':r['payload'],'confidence':g['confidence'],'reason':g['reason'] }));created+=1
 db.commit();after={'rows':db.query(ItemCombinationCleanupRow).filter_by(run_id=run.id).count(),'decisions':db.query(ItemCombinationCleanupFieldDecision).filter_by(run_id=run.id).count(),'suggestions':db.query(ItemCombinationCleanupNameSuggestion).filter_by(run_id=run.id).count()};counts=Counter(r.get('gpt',{}).get('result','INVALID') for r in active_records);report={'run_id':RUN,'deterministic':det,'deterministically_resolved':resolved_count,'semantic_candidates':len(candidates),'semantic_conflicts_skipped':len(conflicts),'semantic_sent':len(work),'semantic_results':dict(counts),'semantic_validation_rejected':sum(bool(r.get('validation_errors')) for r in active_records),'semantic_suggestions_created':created,'tokens':{'prompt':old['prompt_tokens'],'completion':old['completion_tokens'],'cost_usd':calculate_cost('openai',a.model,old['prompt_tokens'],old['completion_tokens']),'scope':'cumulative_append_only_checkpoint'},'checkpoint_history_records':len(old['records']),'pre_gpt_stage_runtimes_seconds':stage_runtimes,'runtime_seconds':round(sum(r['latency_seconds'] for r in active_records),3),'safety_counts_before':before,'safety_counts_after':after,'records':active_records};a.output.write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2));db.close()
if __name__=='__main__':main()
