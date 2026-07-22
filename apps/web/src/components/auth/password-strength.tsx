"use client";

import * as React from "react";
import { ZxcvbnFactory } from "@zxcvbn-ts/core";
import * as common from "@zxcvbn-ts/language-common";
import * as english from "@zxcvbn-ts/language-en";

const estimator = new ZxcvbnFactory({
  dictionary: {
    ...common.dictionary,
    ...english.dictionary,
  },
  graphs: common.adjacencyGraphs,
  translations: english.translations,
});

const LEVELS = [
  { label: "Very weak", color: "bg-destructive" },
  { label: "Weak", color: "bg-orange-500" },
  { label: "Fair", color: "bg-amber-500" },
  { label: "Strong", color: "bg-emerald-500" },
  { label: "Very strong", color: "bg-emerald-600" },
] as const;

/** Advisory feedback only; the backend's approved policy remains the source of acceptance. */
export function PasswordStrength({ password }: { password: string }) {
  const result = React.useMemo(() => (password ? estimator.check(password) : null), [password]);
  if (!result) return null;

  const level = LEVELS[result.score] ?? LEVELS[0];
  return (
    <div
      role="meter"
      aria-label="Password strength"
      aria-valuemin={0}
      aria-valuemax={4}
      aria-valuenow={result.score}
      aria-valuetext={level.label}
      className="grid gap-1.5"
    >
      <div aria-hidden="true" className="grid grid-cols-5 gap-1">
        {LEVELS.map((_, index) => (
          <span
            key={index}
            className={`h-1 rounded-full ${index <= result.score ? level.color : "bg-muted"}`}
          />
        ))}
      </div>
      <p className="text-muted-foreground text-xs">
        Password strength: <span className="text-foreground font-medium">{level.label}</span>
      </p>
    </div>
  );
}
