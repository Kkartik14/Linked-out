import { lTypeSchema, type LType } from '@linkedout/contracts';

import type { LDeletePlan, ReputationDelta } from './ls.types';

export function reputationForType(type: LType): ReputationDelta {
  const delta: ReputationDelta = { lsShared: 1 };
  if (type === 'STORY') delta.storiesShared = 1;
  return delta;
}

export function reputationDeltaForTypeChange(
  from: LType,
  to: LType | undefined,
): ReputationDelta {
  if (to === undefined || to === from) return {};
  const before = reputationForType(from);
  const after = reputationForType(to);
  const delta: ReputationDelta = {};
  const storiesShared = (after.storiesShared ?? 0) - (before.storiesShared ?? 0);
  if (storiesShared !== 0) delta.storiesShared = storiesShared;
  return delta;
}

export function planLDelete(): LDeletePlan {
  return {
    reputationByType: Object.fromEntries(
      lTypeSchema.options.map((type) => [type, reputationForType(type)]),
    ) as LDeletePlan['reputationByType'],
  };
}
