/**
 * Manual regression checklist for media context (run after deploy).
 *
 * Video:
 * - Sora: 2 frames + transition prompt → output matches frames
 * - Kling: 3+ refs + prompt → middle refs considered
 * - Higgsfield: 1 ref + prompt → style/object from ref
 *
 * Photo:
 * - Flux: 2 refs + edit prompt → edits follow refs
 * - Midjourney: prompt only (no refs by design)
 *
 * Audio:
 * - Voice clone: sample + text → voice from sample
 *
 * Text:
 * - GPT: image → follow-up question → model sees previous image
 *
 * Queue:
 * - Async tool: immediate "generating" then "async started"
 * - Stale job >3min: reminder message
 * - Failed Sharpii MJ: Flux fallback when generic failure
 */

export const CONTEXT_REGRESSION_CHECKLIST = [
    'Sora: 2 frames + transition prompt',
    'Kling: 3+ refs + prompt',
    'Higgsfield: 1 ref + prompt',
    'Flux: 2 refs + edit prompt',
    'Voice clone: sample + text',
    'GPT: image then follow-up question',
    'Async: early generating feedback',
    'Sharpii MJ generic failure → Flux fallback',
] as const;
