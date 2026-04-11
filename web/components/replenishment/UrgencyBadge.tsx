"use client";

import { Badge } from "@/components/ui/badge";

interface UrgencyBadgeProps {
  daysOfCover: number | null | undefined;
  leadTimeDays: number | null | undefined;
}

export function UrgencyBadge({ daysOfCover, leadTimeDays }: UrgencyBadgeProps) {
  if (daysOfCover === null || daysOfCover === undefined) {
    return <Badge variant="outline">No Data</Badge>;
  }

  if (leadTimeDays && daysOfCover < leadTimeDays) {
    return <Badge variant="destructive">Urgent</Badge>;
  }

  if (leadTimeDays && daysOfCover < leadTimeDays * 1.5) {
    return <Badge variant="secondary">Low</Badge>;
  }

  return <Badge variant="outline">OK</Badge>;
}
