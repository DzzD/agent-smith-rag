# Page OCR layout algorithm

This document records the current deterministic page-layout algorithm implemented in
`rag/client/PaddleOcrClient.js`. It is the reference for extracting the layout logic into a future
provider-agnostic `PageOcrLayout` class.

## Goal and input contract

The algorithm converts OCR lines into ordered text blocks without using a language or vision model.
It only depends on page geometry and the original OCR sequence.

Expected input:

```javascript
{
    id: 'L001',
    text: 'Recognized text',
    score: 0.98,
    box: [left, top, right, bottom]
}
```

Coordinates use a top-left origin. `right >= left` and `bottom >= top`. The input array position is
kept as the stable OCR index and is used whenever geometry alone cannot preserve content order.

## Phase 1: build text-line groups

Every OCR line initially forms one group. A group stores its lines and their enclosing box.

Two groups are compatible when their closest vertical boundary lines satisfy both conditions:

1. Their vertical center distance is at most the average line height multiplied by
   `1 + lineSpacingFactor`.
2. Their horizontal intersection divided by the smaller line width is at least
   `horizontalOverlapFactor`.

Only the bottom-most line of the upper group and the top-most line of the lower group are compared.
The growing group envelope is deliberately not used for compatibility because it would make a wide
earlier line extend compatibility into unrelated columns.

Compatible groups are merged until a complete pass performs no merge.

### Split irregular spacing

Groups with at least five lines are checked for an internal spacing rupture:

1. Sort lines geometrically from top to bottom, then left to right.
2. Normalize each consecutive center-to-center distance by the pair's average line height.
3. Compute the median normalized spacing.
4. Split before each distance greater than `median * 1.35`.

This repairs long groups that contain a clear vertical discontinuity while avoiding conclusions from
too few samples.

### Reinject contained orphan groups

After splitting, a smaller group is reinjected into a larger group when at least 95% of the smaller
group's area intersects the larger group. This tolerates OCR boxes protruding by a few pixels.

The merged lines are sorted by their original OCR index, not by geometry. This preserves the OCR
engine's internal sequence for words that belong inside a larger text region.

The resulting preliminary groups receive temporary `Gxxx` identifiers.

## Phase 2: construct column groups

Every preliminary group starts as a column-group candidate. At each iteration, all pairs are
evaluated. The algorithm merges exactly one globally best pair, then recomputes every candidate from
the new state. It does not accept the first pair encountered.

### Pair compatibility

For a pair, determine the upper and lower group geometrically. Compare only:

- the last block of the upper group;
- the first block of the lower group.

The pair is eligible when:

1. Both boundary blocks have positive width.
2. Their horizontal overlap divided by the smaller width reaches
   `readingOrderHorizontalOverlapFactor`.
3. Their left edges, right edges, or horizontal centers are aligned within
   `pageWidth * readingOrderAlignmentTolerance`.

This boundary-block rule prevents a previously enlarged group envelope from attracting blocks from
another column.

### Empty-height score

For an eligible upper group `P` and lower group `C`:

```text
emptyAddedHeight = max(0, top(C) - bottom(P))
emptyToBlockRatio = emptyAddedHeight / height(C)
```

`emptyToBlockRatio` measures the vertical gap introduced by the merge relative to the height of the
candidate block. A value of `1` means that the gap is as high as the candidate; `0.5` means half its
height. A lower value is better. Width is deliberately excluded because an aligned narrow block must
not be penalized merely for joining a wider column.

A candidate is rejected when `emptyToBlockRatio > 4`. The score expresses the cost directly in
multiples of the candidate block height.

### Collision guard

Before accepting a candidate, compare its merged envelope with every third group. Reject the merge
when it introduces a new overlap whose width and height exceed 0.2% of the page dimensions and whose
area exceeds the product of those margins.

Existing overlaps are subtracted. The guard therefore rejects overlap created by the proposed empty
envelope, rather than blaming the merge for OCR boxes that already overlap.

### Global candidate selection

The best candidate is selected lexicographically by:

1. Lowest `emptyToBlockRatio`.
2. Lowest vertical distance between groups.
3. Highest position on the page.
4. Left-most position.
5. Original OCR indices as stable deterministic tie-breakers.

After the selected pair is merged, its child blocks are concatenated in geometric upper-to-lower
group order. Their internal order is never re-sorted. All candidates are then recalculated. This is
the key property that limits dependence on input traversal order.

## Phase 3: determine reading order

The completed column groups are ordered through a precedence graph rather than a direct comparator.
This avoids non-transitive comparisons and unstable sort results.

### Hard vertical precedence

When one group is completely above another (`upper.bottom <= lower.top`), add an edge from the upper
group to the lower group.

### Overlapping-row precedence

For groups whose vertical overlap reaches `readingOrderRowTolerance` relative to the smaller group
height:

- If horizontally separate groups overlap by at least 50% of the smaller height and the smaller
   height is at least 50% of the larger height, they are treated as peer columns and ordered from
   left to right.
- If their boxes overlap horizontally, the group that starts highest comes first.
- If their top positions differ by more than
  `pageHeight * readingOrderAlignmentTolerance`, the group that starts highest comes first.
- Otherwise, they are treated as members of the same row and the left-most group comes first.

Potential edges are sorted geometrically before insertion. An edge is skipped if its reverse path
already exists, preventing cycles.

### Stable topological traversal

Perform a topological traversal of the precedence graph. When several groups have no incoming edge,
choose by top, then left, then original OCR index. Flatten groups in that order while preserving the
child order established during fusion.

Final blocks receive `B001`, `B002`, and subsequent identifiers.

## Current defaults

| Parameter | Default | Meaning |
| --- | ---: | --- |
| `lineSpacingFactor` | `0.75` | Allowed normalized gap between OCR lines |
| `horizontalOverlapFactor` | `0.75` | Initial line-group horizontal overlap |
| `readingOrderAlignmentTolerance` | `0.02` | Alignment tolerance relative to page size |
| `readingOrderHorizontalOverlapFactor` | `0.5` | Column-boundary horizontal overlap |
| `readingOrderRowTolerance` | `0.02` | Minimum vertical overlap for row precedence |
| `maximumEmptyToBlockRatio` / `OCR_MAXIMUM_EMPTY_TO_BLOCK_RATIO` | `4` | Maximum vertical gap relative to candidate height |
| Collision margin | `0.002` | Allowed overlap width/height relative to page size |
| Orphan containment | `0.95` | Required covered fraction of orphan area |

## Invariants to preserve during extraction

- Results must be deterministic for the same geometric input.
- Original OCR order must survive inside a merged group.
- Compatibility must use boundary blocks, never the growing group envelope.
- Every iteration must score all currently valid candidates before selecting one.
- Candidate scores must be recomputed after every merge.
- A merge must not introduce a meaningful overlap with a third group.
- Final reading order must use an acyclic precedence graph.
- Provider concerns such as HTTP calls, retries, image encoding, debug rendering, Markdown generation,
  and Paddle response parsing must remain outside the layout class.

## Proposed `PageOcrLayout` boundary

The future class should accept normalized geometry and return layout data without knowing PaddleOCR,
database models, image buffers, or logging:

```javascript
const layout = new PageOcrLayout(options);
const result = layout.process(lines, { pageWidth, pageHeight });

// Suggested result
{
    lineGroups,     // Result after grouping, splitting, and orphan reinjection
    columnGroups,   // Result after globally scored column fusion
    blocks          // Final flat reading order
}
```

Configuration should be constructor data with the current defaults. `process()` should not mutate
the caller's lines or boxes. Debug consumers may render `lineGroups` or `columnGroups`, but rendering
must not be a responsibility of `PageOcrLayout`.

The extraction should retain focused tests for line spacing, boundary-only compatibility, irregular
spacing splits, 95% orphan reinjection, maximum empty-to-block ratio, global lowest-ratio selection,
collision rejection, fusion-order preservation, and deterministic graph ordering.