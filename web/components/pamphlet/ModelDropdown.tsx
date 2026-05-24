"use client";
import { useEffect, useState } from "react";
import { listModels } from "@/lib/pamphlet/api";
import { ModelInfo } from "@/lib/pamphlet/types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Props {
  value: string;
  onChange: (provider: string, model: string) => void;
}

export function ModelDropdown({ value, onChange }: Props) {
  const [models, setModels] = useState<ModelInfo[]>([]);

  useEffect(() => {
    listModels().then(setModels).catch(console.error);
  }, []);

  return (
    <Select
      value={value}
      onValueChange={(val) => {
        const m = models.find((m) => `${m.provider}:${m.model}` === val);
        if (m) onChange(m.provider, m.model);
      }}
    >
      <SelectTrigger className="h-7 text-xs w-52">
        <SelectValue placeholder="Select model" />
      </SelectTrigger>
      <SelectContent>
        {models.map((m) => (
          <SelectItem key={`${m.provider}:${m.model}`} value={`${m.provider}:${m.model}`} className="text-xs">
            {m.display_name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
