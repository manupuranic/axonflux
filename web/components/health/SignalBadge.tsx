"use client";

import { Badge } from "@/components/ui/badge";

interface SignalBadgeProps {
  fast?: boolean | null;
  slow?: boolean | null;
  dead?: boolean | null;
  spike?: boolean | null;
}

export function SignalBadge({ fast, slow, dead, spike }: SignalBadgeProps) {
  const badges = [];

  if (fast) badges.push({ label: "Fast", variant: "default" as const });
  if (slow) badges.push({ label: "Slow", variant: "secondary" as const });
  if (dead) badges.push({ label: "Dead", variant: "destructive" as const });
  if (spike) badges.push({ label: "Spike", variant: "outline" as const });

  if (badges.length === 0) {
    return <Badge variant="outline">Normal</Badge>;
  }

  return (
    <div className="flex gap-1 flex-wrap">
      {badges.map((badge) => (
        <Badge key={badge.label} variant={badge.variant}>
          {badge.label}
        </Badge>
      ))}
    </div>
  );
}
