"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Plus } from "lucide-react";

export interface RowItem {
  description: string;
  amount: string;
}

interface DynamicRowsProps {
  nameLabel: string;   // "Description" | "Customer Name"
  rows: RowItem[];
  onChange: (rows: RowItem[]) => void;
  disabled?: boolean;
}

export function DynamicRows({ nameLabel, rows, onChange, disabled }: DynamicRowsProps) {
  const addRow = () => onChange([...rows, { description: "", amount: "" }]);

  const updateRow = (index: number, field: keyof RowItem, value: string) => {
    const updated = rows.map((r, i) => (i === index ? { ...r, [field]: value } : r));
    onChange(updated);
  };

  const removeRow = (index: number) => {
    onChange(rows.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      {rows.map((row, i) => (
        <div key={i} className="flex flex-col sm:flex-row gap-1.5 sm:gap-2">
          {/* Description — full width on mobile, flex-1 on desktop */}
          <Input
            placeholder={nameLabel}
            value={row.description}
            onChange={(e) => updateRow(i, "description", e.target.value)}
            disabled={disabled}
            className="h-9 text-sm flex-1"
          />
          {/* Amount + remove on same row (both mobile and desktop) */}
          <div className="flex gap-1.5 items-center">
            <Input
              placeholder="0"
              type="number"
              min={0}
              step={0.01}
              value={row.amount}
              onChange={(e) => updateRow(i, "amount", e.target.value)}
              disabled={disabled}
              className="h-9 text-sm text-right flex-1 sm:flex-none sm:w-28"
            />
            {!disabled && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0 text-gray-400 hover:text-red-500"
                onClick={() => removeRow(i)}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      ))}
      {!disabled && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 text-xs text-blue-600 hover:text-blue-700 px-0"
          onClick={addRow}
        >
          <Plus className="h-3 w-3 mr-1" />
          Add row
        </Button>
      )}
    </div>
  );
}

/** Sum the amounts from DynamicRows form state */
export function sumRows(rows: RowItem[]): number {
  return rows.reduce((acc, r) => acc + (parseFloat(r.amount) || 0), 0);
}
