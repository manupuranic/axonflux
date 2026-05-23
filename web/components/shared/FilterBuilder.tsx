"use client";

import { useMemo, useState } from "react";
import { Plus, X, Filter as FilterIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  type FilterCondition,
  type FilterFieldSpec,
  type FilterOp,
  defaultOpForField,
  newCondition,
  opsForField,
} from "@/types/filters";

interface FilterBuilderProps {
  /** Field allowlist this table supports. */
  fields: FilterFieldSpec[];
  /** Active (applied) conditions. */
  value: FilterCondition[];
  /** Called when the user clicks Apply or Clear or removes a chip. */
  onApply: (next: FilterCondition[]) => void;
}

/**
 * Notion/Linear-style filter builder.
 *
 * Conditions are rendered as editable rows: [field] [op] [value] [×]. Users
 * add rows via "Add filter" and apply the batch via Apply. Draft state lives
 * inside this component so typing doesn't trigger a refetch on every keystroke.
 *
 * Why a local draft + Apply button (instead of refetching onChange):
 * - Pagination resets to page 0 on each apply. Per-keystroke refetches would
 *   thrash the server with wide queries the user doesn't actually want yet.
 * - Operator changes mid-edit shouldn't fire requests until value is also
 *   coherent. Apply is the user's "I'm done" signal.
 */
export function FilterBuilder({ fields, value, onApply }: FilterBuilderProps) {
  const [draft, setDraft] = useState<FilterCondition[]>(value);
  const [showAdd, setShowAdd] = useState(false);

  const fieldByKey = useMemo(() => {
    const m: Record<string, FilterFieldSpec> = {};
    for (const f of fields) m[f.key] = f;
    return m;
  }, [fields]);

  // Dirty = draft differs from applied. We compare ignoring local-only `id`s
  // because reordering by id should not light up Apply.
  const isDirty = useMemo(() => {
    const norm = (cs: FilterCondition[]) =>
      cs.map((c) => `${c.key}:${c.op}:${c.value}`).join("|");
    return norm(draft) !== norm(value);
  }, [draft, value]);

  const addCondition = (field: FilterFieldSpec) => {
    setDraft((d) => [...d, newCondition(field)]);
    setShowAdd(false);
  };

  const updateAt = (idx: number, patch: Partial<FilterCondition>) => {
    setDraft((d) => d.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  };

  const removeAt = (idx: number) => {
    setDraft((d) => d.filter((_, i) => i !== idx));
  };

  const clearAll = () => {
    setDraft([]);
    onApply([]);
  };

  return (
    <div className="space-y-3">
      {/* Header row */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <FilterIcon className="h-4 w-4" />
          Filters
          {draft.length > 0 && (
            <span className="text-xs text-gray-500 font-normal">
              ({draft.length})
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowAdd((v) => !v)}
          >
            <Plus className="h-3.5 w-3.5 mr-1" /> Add filter
          </Button>
          <Button
            size="sm"
            disabled={!isDirty}
            onClick={() => onApply(draft)}
          >
            Apply
          </Button>
          {(draft.length > 0 || value.length > 0) && (
            <Button size="sm" variant="ghost" onClick={clearAll}>
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Add-filter field picker (small popover) */}
      {showAdd && (
        <div className="flex flex-wrap gap-1.5 rounded-md border border-dashed border-gray-300 bg-gray-50 p-2">
          <span className="self-center text-xs text-gray-500 mr-1">Pick a field:</span>
          {fields.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => addCondition(f)}
              className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-100 hover:border-gray-400 transition-colors"
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {/* Condition rows */}
      {draft.length === 0 ? (
        <p className="text-sm text-gray-400 italic">
          No filters applied. Click <span className="font-medium text-gray-600">Add filter</span> to slice this table.
        </p>
      ) : (
        <div className="space-y-1.5">
          {draft.map((c, idx) => {
            const field = fieldByKey[c.key];
            if (!field) return null;
            const ops = opsForField(field);

            return (
              <div
                key={c.id}
                className="flex flex-wrap items-center gap-2 rounded-md border border-gray-200 bg-white px-2 py-1.5"
              >
                {/* Field selector — lets user retarget without removing the row */}
                <select
                  value={c.key}
                  onChange={(e) => {
                    const next = fieldByKey[e.target.value];
                    if (!next) return;
                    updateAt(idx, {
                      key: next.key,
                      op: defaultOpForField(next),
                      value:
                        next.type === "enum" && next.options?.length
                          ? next.options[0].value
                          : next.type === "bool"
                          ? "true"
                          : "",
                    });
                  }}
                  className="h-7 rounded border border-gray-300 bg-white px-2 text-xs font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400"
                >
                  {fields.map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.label}
                    </option>
                  ))}
                </select>

                {/* Op selector — narrowed by field type */}
                <select
                  value={c.op}
                  onChange={(e) =>
                    updateAt(idx, { op: e.target.value as FilterOp })
                  }
                  className="h-7 rounded border border-gray-300 bg-white px-2 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
                >
                  {ops.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>

                {/* Value input — typed by field */}
                <ValueInput
                  field={field}
                  value={c.value}
                  onChange={(v) => updateAt(idx, { value: v })}
                />

                {field.unit && (
                  <span className="text-xs text-gray-500">{field.unit}</span>
                )}

                <button
                  type="button"
                  aria-label="Remove filter"
                  onClick={() => removeAt(idx)}
                  className="ml-auto rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Value input — branch by field type ──────────────────────────────────────

interface ValueInputProps {
  field: FilterFieldSpec;
  value: string;
  onChange: (next: string) => void;
}

function ValueInput({ field, value, onChange }: ValueInputProps) {
  if (field.type === "bool") {
    return (
      <select
        value={value || "true"}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 rounded border border-gray-300 bg-white px-2 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
      >
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    );
  }

  if (field.type === "enum" && field.options?.length) {
    return (
      <select
        value={value || field.options[0].value}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 rounded border border-gray-300 bg-white px-2 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
      >
        {field.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }

  return (
    <Input
      type={field.type === "number" ? "number" : "text"}
      inputMode={field.type === "number" ? "numeric" : undefined}
      placeholder={field.placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-7 w-32 text-xs"
    />
  );
}
