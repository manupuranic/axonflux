"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ReactNode } from "react";

interface KpiCardProps {
  title: string;
  value: string | number;
  accent?: "green" | "yellow" | "red" | "blue" | "purple";
  icon?: ReactNode;
  subtitle?: string;
}

const accentColors = {
  green: "border-l-4 border-l-green-500",
  yellow: "border-l-4 border-l-yellow-500",
  red: "border-l-4 border-l-red-500",
  blue: "border-l-4 border-l-blue-500",
  purple: "border-l-4 border-l-purple-500",
};

export function KpiCard({
  title,
  value,
  accent = "blue",
  icon,
  subtitle,
}: KpiCardProps) {
  return (
    <Card className={accentColors[accent]}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-gray-700">
          {title}
        </CardTitle>
        {icon && <div className="text-2xl">{icon}</div>}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-gray-900">{value}</div>
        {subtitle && (
          <p className="text-xs text-gray-500 mt-1">{subtitle}</p>
        )}
      </CardContent>
    </Card>
  );
}
