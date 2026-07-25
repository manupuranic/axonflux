"use client";

import { ArchitectureMap } from "@/components/academy/ArchitectureMap";
import { Eyebrow } from "@/components/academy/ui";

export default function ArchitecturePage() {
  return (
    <div>
      <Eyebrow>Architecture explorer</Eyebrow>
      <p className="mb-4 mt-1 max-w-2xl text-sm text-gray-500">
        The whole system on one screen. Every block is clickable — purpose,
        responsibilities, why this design, what was rejected, and the interview
        questions each component invites.
      </p>
      <ArchitectureMap />
    </div>
  );
}
