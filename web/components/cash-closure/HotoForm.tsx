"use client";

import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { DynamicRows, sumRows } from "./DynamicRows";
import type { RowItem } from "./DynamicRows";
import {
  DenominationGrid,
  denomStateToRecord,
  recordToDenomState,
  getDenomTotal,
} from "./DenominationGrid";
import type { DenomState } from "./DenominationGrid";
import { ReconciliationSummary } from "./ReconciliationSummary";
import { api } from "@/lib/api";
import type { HotoResponse } from "@/types/api";

interface HotoFormProps {
  initialData?: HotoResponse | null;
  isAdmin?: boolean;
  onSaved: (record: HotoResponse) => void;
  onVerify?: (id: string, status: "verified" | "rejected", notes: string) => Promise<void>;
}

interface FormState {
  closure_date: string;
  opening_cash: string;
  net_sales: string;
  sodexo_collection: string;
  manual_billings: RowItem[];
  old_balance_collections: RowItem[];
  distributor_expiry: string;
  oil_crush: string;
  other_income: string;
  pluxee_amount: string;
  paytm_amount: string;
  phonepe_amount: string;
  card_amount: string;
  credits_given: RowItem[];
  returns_amount: string;
  expenses: RowItem[];
  denominations: DenomState;
  notes: string;
}

function toStr(v: number | null | undefined): string {
  return v != null ? String(v) : "";
}

function toFloat(s: string): number | null {
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function rowsFromApi(items: { description: string; amount: number }[]): RowItem[] {
  return items.map((i) => ({ description: i.description, amount: String(i.amount) }));
}

function rowsToApi(rows: RowItem[]) {
  return rows
    .filter((r) => r.description || r.amount)
    .map((r) => ({ description: r.description, amount: parseFloat(r.amount) || 0 }));
}

function buildInitialState(data?: HotoResponse | null): FormState {
  if (!data) {
    return {
      closure_date: new Date().toISOString().slice(0, 10),
      opening_cash: "",
      net_sales: "",
      sodexo_collection: "",
      manual_billings: [],
      old_balance_collections: [],
      distributor_expiry: "",
      oil_crush: "",
      other_income: "",
      pluxee_amount: "",
      paytm_amount: "",
      phonepe_amount: "",
      card_amount: "",
      credits_given: [],
      returns_amount: "",
      expenses: [],
      denominations: {},
      notes: "",
    };
  }
  return {
    closure_date: data.closure_date,
    opening_cash: toStr(data.opening_cash),
    net_sales: toStr(data.net_sales),
    sodexo_collection: toStr(data.sodexo_collection),
    manual_billings: rowsFromApi(data.manual_billings),
    old_balance_collections: rowsFromApi(data.old_balance_collections),
    distributor_expiry: toStr(data.distributor_expiry),
    oil_crush: toStr(data.oil_crush),
    other_income: toStr(data.other_income),
    pluxee_amount: toStr(data.pluxee_amount),
    paytm_amount: toStr(data.paytm_amount),
    phonepe_amount: toStr(data.phonepe_amount),
    card_amount: toStr(data.card_amount),
    credits_given: rowsFromApi(data.credits_given),
    returns_amount: toStr(data.returns_amount),
    expenses: rowsFromApi(data.expenses),
    // Merge legacy opening+sales fields into a single denomination state.
    // New records only populate denominations_opening; old records may have both.
    denominations: recordToDenomState(
      Object.fromEntries(
        Object.entries({ ...data.denominations_opening }).map(([k, v]) => [
          k,
          v + (data.denominations_sales[k] ?? 0),
        ])
      )
    ),
    notes: data.notes ?? "",
  };
}

function n(s: string): number {
  return parseFloat(s) || 0;
}

/** Section label used throughout the two-column layout */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
      {children}
    </p>
  );
}

/** A single labelled numeric input row */
function AmountRow({
  label,
  value,
  onChange,
  disabled,
  placeholder = "0",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2 py-1.5">
      <label className="text-sm text-gray-700 leading-tight flex-1">{label}</label>
      <Input
        type="number"
        min={0}
        step={0.01}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-24 sm:w-32 h-9 text-right text-sm shrink-0"
      />
    </div>
  );
}

function TotalRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between py-2 border-t mt-2">
      <span className="text-sm font-semibold text-gray-800">{label}</span>
      <span className="text-base font-bold tabular-nums text-gray-900">
        ₹{value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
      </span>
    </div>
  );
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

export function HotoForm({ initialData, isAdmin, onSaved, onVerify }: HotoFormProps) {
  const isLocked = initialData?.status === "verified";

  const [form, setForm] = useState<FormState>(() =>
    buildInitialState(initialData)
  );
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyNotes, setVerifyNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  // Track whether the form has unsaved local changes
  const isDirtyRef = useRef(false);
  // Skip auto-save on initial mount
  const isFirstRender = useRef(true);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // When parent refreshes initialData (tab-focus reload), reset form only if
  // no local unsaved changes — avoids wiping mid-entry content.
  useEffect(() => {
    if (isFirstRender.current) return;
    if (!isDirtyRef.current && initialData) {
      setForm(buildInitialState(initialData));
      setSaveStatus("idle");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialData]);

  // Auto-save: 2 seconds after any form change
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (isLocked) return;

    isDirtyRef.current = true;
    setSaveStatus("saving");

    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(async () => {
      try {
        await api.hoto.saveDraft(buildPayload());
        isDirtyRef.current = false;
        setSaveStatus("saved");
        setLastSavedAt(new Date());
      } catch {
        setSaveStatus("error");
      }
    }, 2000);

    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form]);

  const set = useCallback(
    <K extends keyof FormState>(key: K) =>
      (value: FormState[K]) =>
        setForm((prev) => ({ ...prev, [key]: value })),
    []
  );

  // Live computed totals
  const totals = useMemo(() => {
    const inside =
      n(form.opening_cash) +
      n(form.net_sales) +
      n(form.sodexo_collection) +
      sumRows(form.manual_billings) +
      sumRows(form.old_balance_collections) +
      n(form.distributor_expiry) +
      n(form.oil_crush) +
      n(form.other_income);

    const outside =
      n(form.pluxee_amount) +
      n(form.paytm_amount) +
      n(form.phonepe_amount) +
      n(form.card_amount) +
      sumRows(form.credits_given) +
      n(form.returns_amount) +
      sumRows(form.expenses);

    const expected = inside - outside;

    const denomTotal = getDenomTotal(form.denominations);

    return { inside, outside, expected, denomTotal };
  }, [form]);

  function buildPayload() {
    return {
      closure_date: form.closure_date,
      opening_cash: toFloat(form.opening_cash),
      net_sales: toFloat(form.net_sales),
      sodexo_collection: toFloat(form.sodexo_collection),
      manual_billings: rowsToApi(form.manual_billings),
      old_balance_collections: rowsToApi(form.old_balance_collections),
      distributor_expiry: toFloat(form.distributor_expiry),
      oil_crush: toFloat(form.oil_crush),
      other_income: toFloat(form.other_income),
      pluxee_amount: toFloat(form.pluxee_amount),
      paytm_amount: toFloat(form.paytm_amount),
      phonepe_amount: toFloat(form.phonepe_amount),
      card_amount: toFloat(form.card_amount),
      credits_given: rowsToApi(form.credits_given),
      returns_amount: toFloat(form.returns_amount),
      expenses: rowsToApi(form.expenses),
      // physical_cash_counted is derived from denomination count — no manual input
      physical_cash_counted: totals.denomTotal > 0 ? totals.denomTotal : null,
      denominations_opening: denomStateToRecord(form.denominations),
      denominations_sales: {},
      notes: form.notes || null,
    };
  }

  async function handleDraft() {
    setSaving(true);
    setError(null);
    try {
      const result = await api.hoto.saveDraft(buildPayload());
      onSaved(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const result = await api.hoto.submit(buildPayload());
      onSaved(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Submit failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Date + status header */}
      <div className="flex items-end gap-3">
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">
            Date
          </label>
          <Input
            type="date"
            value={form.closure_date}
            onChange={(e) => set("closure_date")(e.target.value)}
            disabled={isLocked}
            className="w-40 sm:w-44 h-9"
          />
        </div>
        {initialData && (
          <div className="mb-0.5">
            <StatusBadge status={initialData.status} />
          </div>
        )}
      </div>

      {/* Two-column INSIDE / OUTSIDE layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── INSIDE COUNTER ── */}
        <Card>
          <CardHeader className="pb-2 px-3 sm:px-6 pt-4 sm:pt-6">
            <CardTitle className="text-base text-green-700">
              Inside Counter
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-0.5 px-3 sm:px-6 pb-4 sm:pb-6">
            <AmountRow
              label="Cash in Hand (C/F)"
              value={form.opening_cash}
              onChange={set("opening_cash")}
              disabled={isLocked}
            />
            <AmountRow
              label="Net Sales (from billing)"
              value={form.net_sales}
              onChange={set("net_sales")}
              disabled={isLocked}
            />
            <AmountRow
              label="SODEXO Collection"
              value={form.sodexo_collection}
              onChange={set("sodexo_collection")}
              disabled={isLocked}
            />

            <Separator className="my-2" />
            <SectionLabel>Manual Billings</SectionLabel>
            <DynamicRows
              nameLabel="Description"
              rows={form.manual_billings}
              onChange={set("manual_billings")}
              disabled={isLocked}
            />

            <Separator className="my-2" />
            <SectionLabel>Old Balance Collections</SectionLabel>
            <DynamicRows
              nameLabel="Customer Name"
              rows={form.old_balance_collections}
              onChange={set("old_balance_collections")}
              disabled={isLocked}
            />

            <Separator className="my-2" />
            <AmountRow
              label="Distributor Expiry Return"
              value={form.distributor_expiry}
              onChange={set("distributor_expiry")}
              disabled={isLocked}
            />
            <AmountRow
              label="Oil Crush Income"
              value={form.oil_crush}
              onChange={set("oil_crush")}
              disabled={isLocked}
            />
            <AmountRow
              label="Other Income"
              value={form.other_income}
              onChange={set("other_income")}
              disabled={isLocked}
            />

            <TotalRow label="Total Inside" value={totals.inside} />
          </CardContent>
        </Card>

        {/* ── OUTSIDE COUNTER ── */}
        <Card>
          <CardHeader className="pb-2 px-3 sm:px-6 pt-4 sm:pt-6">
            <CardTitle className="text-base text-orange-700">
              Outside Counter
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-0.5 px-3 sm:px-6 pb-4 sm:pb-6">
            <SectionLabel>Digital Collections</SectionLabel>
            <AmountRow
              label="PLUXEE / Sodexo"
              value={form.pluxee_amount}
              onChange={set("pluxee_amount")}
              disabled={isLocked}
            />
            <AmountRow
              label="Paytm"
              value={form.paytm_amount}
              onChange={set("paytm_amount")}
              disabled={isLocked}
            />
            <AmountRow
              label="PhonePe"
              value={form.phonepe_amount}
              onChange={set("phonepe_amount")}
              disabled={isLocked}
            />
            <AmountRow
              label="Card"
              value={form.card_amount}
              onChange={set("card_amount")}
              disabled={isLocked}
            />

            <Separator className="my-2" />
            <SectionLabel>Credits Given</SectionLabel>
            <DynamicRows
              nameLabel="Customer Name"
              rows={form.credits_given}
              onChange={set("credits_given")}
              disabled={isLocked}
            />

            <Separator className="my-2" />
            <AmountRow
              label="Returns"
              value={form.returns_amount}
              onChange={set("returns_amount")}
              disabled={isLocked}
            />

            <Separator className="my-2" />
            <SectionLabel>Expenses</SectionLabel>
            <DynamicRows
              nameLabel="Description"
              rows={form.expenses}
              onChange={set("expenses")}
              disabled={isLocked}
            />

            <TotalRow label="Total Outside" value={totals.outside} />
          </CardContent>
        </Card>
      </div>

      {/* Reconciliation Summary */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">
          Reconciliation
        </h3>
        <ReconciliationSummary
          inside={totals.inside}
          outside={totals.outside}
          expected={totals.expected}
          denomTotal={totals.denomTotal}
        />
      </div>

      {/* Denomination Count */}
      <Card>
        <CardHeader className="pb-2 px-3 sm:px-6 pt-4 sm:pt-6">
          <CardTitle className="text-base">Denomination Count</CardTitle>
        </CardHeader>
        <CardContent className="px-3 sm:px-6 pb-4 sm:pb-6">
          <DenominationGrid
            denominations={form.denominations}
            onChange={set("denominations")}
            disabled={isLocked}
          />
        </CardContent>
      </Card>

      {/* Notes */}
      <div>
        <label className="text-sm font-medium text-gray-700 block mb-1">
          Notes
        </label>
        <textarea
          value={form.notes}
          onChange={(e) => set("notes")(e.target.value)}
          disabled={isLocked}
          rows={3}
          placeholder="Any remarks, discrepancies, special events..."
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>

      {/* Error message */}
      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {error}
        </p>
      )}

      {/* Action buttons */}
      {!isLocked && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
          {/* Auto-save status */}
          <span className="text-xs text-gray-400 order-last sm:order-first">
            {saveStatus === "saving" && "Saving…"}
            {saveStatus === "saved" && lastSavedAt && (
              <>
                ✓ Auto-saved at{" "}
                {lastSavedAt.toLocaleTimeString("en-IN", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </>
            )}
            {saveStatus === "error" && (
              <span className="text-red-500">Auto-save failed — tap Save Draft</span>
            )}
          </span>
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={handleDraft}
              disabled={saving || submitting}
              className="h-10 sm:h-9 w-full sm:w-auto"
            >
              {saving ? "Saving…" : "Save Draft"}
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={saving || submitting}
              className="h-10 sm:h-9 w-full sm:w-auto"
            >
              {submitting ? "Submitting…" : "Submit HOTO"}
            </Button>
          </div>
        </div>
      )}

      {isLocked && (
        <p className="text-sm text-center text-gray-400">
          This HOTO has been verified and is now locked.
        </p>
      )}

      {/* Admin: verify / reject panel — shown when record is submitted */}
      {isAdmin && onVerify && initialData?.status === "submitted" && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
          <p className="text-sm font-semibold text-amber-800">Admin Review</p>
          <input
            type="text"
            placeholder="Verification note (optional)"
            value={verifyNotes}
            onChange={(e) => setVerifyNotes(e.target.value)}
            disabled={verifying}
            className="w-full h-10 rounded-md border border-input bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          />
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            <Button
              type="button"
              className="h-10 sm:h-9 w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white"
              disabled={verifying}
              onClick={async () => {
                setVerifying(true);
                setError(null);
                try {
                  await onVerify(initialData.id, "verified", verifyNotes);
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Verify failed");
                } finally {
                  setVerifying(false);
                }
              }}
            >
              {verifying ? "…" : "Verify HOTO"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-10 sm:h-9 w-full sm:w-auto border-red-300 text-red-600 hover:bg-red-50"
              disabled={verifying}
              onClick={async () => {
                setVerifying(true);
                setError(null);
                try {
                  await onVerify(initialData.id, "rejected", verifyNotes);
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Reject failed");
                } finally {
                  setVerifying(false);
                }
              }}
            >
              Reject
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft: "bg-gray-100 text-gray-600",
    submitted: "bg-yellow-100 text-yellow-700",
    verified: "bg-green-100 text-green-700",
    rejected: "bg-red-100 text-red-600",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium capitalize ${
        styles[status] ?? "bg-gray-100 text-gray-600"
      }`}
    >
      {status}
    </span>
  );
}
