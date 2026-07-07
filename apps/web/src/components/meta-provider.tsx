"use client";

import * as React from "react";
import type {
  JourneyStatus,
  LCategory,
  LType,
  MetaEnumsResponse,
  ReactionType,
} from "@linkedout/contracts";
import { DEFAULT_META } from "@/lib/meta-fallback";

const MetaContext = React.createContext<MetaEnumsResponse>(DEFAULT_META);

export function MetaProvider({
  meta,
  children,
}: {
  meta: MetaEnumsResponse;
  children: React.ReactNode;
}) {
  return <MetaContext.Provider value={meta}>{children}</MetaContext.Provider>;
}

export function useMeta(): MetaEnumsResponse {
  return React.useContext(MetaContext);
}

// ── Pure selectors (take meta, return display strings) ───────────────────────
export function categoryLabel(meta: MetaEnumsResponse, cat: LCategory | null | undefined): string | null {
  if (!cat) return null;
  return meta.lCategory.find((x) => x.value === cat)?.label ?? cat;
}

export function typeLabel(meta: MetaEnumsResponse, type: LType): string {
  return meta.lType.find((x) => x.value === type)?.label ?? type;
}

export function typeSectionLabel(meta: MetaEnumsResponse, type: LType): string {
  return meta.lType.find((x) => x.value === type)?.sectionLabel ?? type;
}

export function reactionOption(meta: MetaEnumsResponse, type: ReactionType) {
  return meta.reactionType.find((x) => x.value === type);
}

export function statusOption(meta: MetaEnumsResponse, status: JourneyStatus | null | undefined) {
  if (!status) return undefined;
  return meta.journeyStatus.find((x) => x.value === status);
}
