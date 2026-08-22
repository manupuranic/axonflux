#!/usr/bin/env node
/**
 * Academy referential-integrity check.
 *
 * Academy V2 is a reference graph: capabilities point at topic ids, civilization
 * nodes point at topic ids, decisions point at principle ids, and so on. The
 * TypeScript compiler validates the SHAPE of those arrays but not their
 * CONTENTS — every id is just a string, so a typo or a renamed topic produces
 * a silently dead link that type-checks perfectly and renders as a blank panel.
 *
 * This script is the missing half of the build. Run it whenever Academy content
 * changes; the academy-keeper skill runs it as its verification step.
 *
 *   node scripts/validate-academy.mjs
 *
 * Exits non-zero on any dangling reference.
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import ts from "typescript";

const here = dirname(fileURLToPath(import.meta.url));
const A = join(here, "..", "lib", "academy");

const read = (f) => readFileSync(join(A, f), "utf8");

/** Top-level `id: "..."` declarations in a data module. */
const ids = (src) => [...src.matchAll(/^\s{2,4}id: "([^"]+)"/gm)].map((m) => m[1]);

/** All values of a named string-array field, flattened. */
const refs = (src, field) =>
  [...src.matchAll(new RegExp(`${field}:\\s*\\[([^\\]]*)\\]`, "g"))]
    .flatMap((m) => [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]));

/** Values of a single optional string field, e.g. featureId: "x". */
const singles = (src, field) =>
  [...src.matchAll(new RegExp(`${field}:\\s*"([^"]+)"`, "g"))].map((m) => m[1]);

const src = {
  topicsData: read("topics-data-backend.ts"),
  topicsMlAi: read("topics-ml-ai.ts"),
  topicsCs: read("topics-cs.ts"),
  topicsSystems: read("topics-systems.ts"),
  features: read("features.ts"),
  architecture: read("architecture.ts"),
  challenges: read("challenges.ts"),
  capabilities: read("capabilities.ts"),
  civilization: read("civilization.ts"),
  decisions: read("decisions.ts"),
  journal: read("journal.ts"),
  dna: read("dna.ts"),
};

const allTopicSrc = [src.topicsData, src.topicsMlAi, src.topicsCs, src.topicsSystems];

const known = {
  topic: new Set(allTopicSrc.flatMap(ids)),
  feature: new Set(ids(src.features)),
  arch: new Set(ids(src.architecture)),
  challenge: new Set(ids(src.challenges)),
  capability: new Set(ids(src.capabilities)),
  civNode: new Set(ids(src.civilization)),
  decision: new Set(ids(src.decisions)),
  journal: new Set(ids(src.journal)),
  principle: new Set(ids(src.dna)),
};

const problems = [];
const check = (label, values, set, kind) => {
  for (const v of values) {
    if (!set.has(v)) problems.push(`${label}: unknown ${kind} id "${v}"`);
  }
};

// Topic graph — prereq/unlock edges must resolve, or the learning path silently
// drops nodes and topologicalLayers() produces a wrong ordering.
for (const s of allTopicSrc) {
  check("topics.prereqs", refs(s, "prereqs"), known.topic, "topic");
  check("topics.unlocks", refs(s, "unlocks"), known.topic, "topic");
}

// Synapse map collisions — two topics at the same coordinate render on top of
// each other, which looks like a missing node rather than a bug.
const seenPos = new Map();
for (const s of allTopicSrc) {
  let currentId = null;
  for (const m of s.matchAll(/id: "([\w-]+)",|pos: \{ x: (\d+), y: (\d+) \}/g)) {
    if (m[1]) {
      currentId = m[1];
      continue;
    }
    const key = `${m[2]},${m[3]}`;
    if (seenPos.has(key)) {
      problems.push(
        `synapse map: "${currentId}" collides with "${seenPos.get(key)}" at (${key})`,
      );
    } else {
      seenPos.set(key, currentId);
    }
  }
}

// Capability graph
check("capabilities.requiredTopicIds", refs(src.capabilities, "requiredTopicIds"), known.topic, "topic");
check("capabilities.archNodeIds", refs(src.capabilities, "archNodeIds"), known.arch, "arch node");
check("capabilities.rebuildChallengeIds", refs(src.capabilities, "rebuildChallengeIds"), known.challenge, "challenge");
check("capabilities.decisionRecordIds", refs(src.capabilities, "decisionRecordIds"), known.decision, "decision");
check("capabilities.journalEntryIds", refs(src.capabilities, "journalEntryIds"), known.journal, "journal entry");
check("capabilities.principleRefs", refs(src.capabilities, "principleRefs"), known.principle, "principle");
check("capabilities.prereqCapabilities", refs(src.capabilities, "prereqCapabilities"), known.capability, "capability");
check("capabilities.unlocksCapabilities", refs(src.capabilities, "unlocksCapabilities"), known.capability, "capability");
check("capabilities.featureId", singles(src.capabilities, "featureId"), known.feature, "feature");

// Civilization trees
check("civilization.topicIds", refs(src.civilization, "topicIds"), known.topic, "topic");
check("civilization.prereqNodes", refs(src.civilization, "prereqNodes"), known.civNode, "civilization node");

// Decision history
check("decisions.principleRefs", refs(src.decisions, "principleRefs"), known.principle, "principle");
check("decisions.capabilityIds", refs(src.decisions, "capabilityIds"), known.capability, "capability");
check("decisions.archNodeIds", refs(src.decisions, "archNodeIds"), known.arch, "arch node");

// Journal
check("journal.capabilityId", singles(src.journal, "capabilityId"), known.capability, "capability");

// DNA examples may reference several kinds — accept a match in any of them.
const anyKnown = new Set([
  ...known.arch,
  ...known.capability,
  ...known.decision,
  ...known.topic,
  ...known.feature,
]);
check("dna.examples", refs(src.dna, "examples"), anyKnown, "arch/capability/decision/topic/feature");

// Content-gap honesty: a civilization node with no topics must say so.
const nodeBlocks = src.civilization.split(/\n  \{\n/).slice(1);
for (const block of nodeBlocks) {
  const id = block.match(/id: "([^"]+)"/)?.[1];
  if (!id) continue;
  const empty = /topicIds: \[\]/.test(block);
  const flagged = /contentGap: true/.test(block);
  if (empty && !flagged) {
    problems.push(`civilization: node "${id}" has no topics but is not marked contentGap`);
  }
  if (!empty && flagged) {
    problems.push(`civilization: node "${id}" is marked contentGap but does have topics`);
  }
}

// Markup safety — Next's Link and CapabilityChip both render <a>. A link-like
// component nested inside Link is valid JSX but invalid HTML, so React reports
// a hydration error only in the browser. Catch that call-site shape at build
// time across every Academy page/component.
const uiRoots = [
  join(here, "..", "app", "(internal)", "academy"),
  join(here, "..", "components", "academy"),
];
const tsxFiles = [];
const collectTsx = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) collectTsx(path);
    else if (entry.isFile() && entry.name.endsWith(".tsx")) tsxFiles.push(path);
  }
};
for (const root of uiRoots) collectTsx(root);

for (const path of tsxFiles) {
  const source = ts.createSourceFile(
    path,
    readFileSync(path, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const tagName = (node) => node.tagName?.getText(source);
  const visit = (node) => {
    if (ts.isJsxElement(node) && tagName(node.openingElement) === "Link") {
      const inspectDescendants = (descendant) => {
        if (descendant !== node) {
          const nestedTag = ts.isJsxElement(descendant)
            ? tagName(descendant.openingElement)
            : ts.isJsxSelfClosingElement(descendant)
              ? tagName(descendant)
              : null;
          if (nestedTag === "Link" || nestedTag === "CapabilityChip") {
            const { line, character } = source.getLineAndCharacterOfPosition(
              descendant.getStart(source),
            );
            problems.push(
              `academy markup: ${path}:${line + 1}:${character + 1} nests ${nestedTag} inside Link`,
            );
          }
        }
        ts.forEachChild(descendant, inspectDescendants);
      };
      ts.forEachChild(node, inspectDescendants);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

const counts = Object.entries(known)
  .map(([k, v]) => `${v.size} ${k}`)
  .join(", ");

if (problems.length) {
  console.error(`\n✗ Academy referential integrity FAILED (${problems.length} problem(s))\n`);
  for (const p of problems) console.error(`  - ${p}`);
  console.error(`\nindexed: ${counts}\n`);
  process.exit(1);
}

console.log(`✓ Academy referential integrity OK — ${counts}`);
