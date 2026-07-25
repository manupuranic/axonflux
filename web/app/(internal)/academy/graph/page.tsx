"use client";

import { useMemo } from "react";
import { useProgress } from "@/lib/academy/progress";
import { recommendNext } from "@/lib/academy/topics";
import { SynapseMap } from "@/components/academy/SynapseMap";
import { Card, Eyebrow } from "@/components/academy/ui";

export default function GraphPage() {
  const { confidenceOf } = useProgress();
  const recommended = useMemo(
    () => recommendNext(confidenceOf, 3).map((t) => t.id),
    [confidenceOf],
  );

  return (
    <Card className="p-5">
      <Eyebrow>Project knowledge graph</Eyebrow>
      <p className="mt-1 max-w-2xl text-sm text-gray-500">
        Every major concept in AxonFlux and its prerequisite wiring. Hover a node to
        light up its neighborhood; click to open the topic. This graph IS your
        curriculum — a topic is ready to learn when everything pointing into it
        has color.
      </p>
      <div className="mt-4">
        <SynapseMap confidenceOf={confidenceOf} recommendedIds={recommended} height="640px" />
      </div>
    </Card>
  );
}
