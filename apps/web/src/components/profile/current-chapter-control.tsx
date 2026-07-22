"use client";

import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { journeyStatusSchema, type JourneyStatus, type UserProfile } from "@linkedout/contracts";
import { toast } from "sonner";

import { useMeta } from "@/components/meta-provider";
import {
  assertComposedPrincipal,
  useComposedPrincipal,
  usePrincipal,
} from "@/components/session-provider";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { errorMessage, patchMe } from "@/lib/api";
import { reconcileOwnProfile } from "@/lib/profile-cache";
import { queryKeys } from "@/lib/query-keys";

const NO_CHAPTER = "NONE";

export function CurrentChapterControl({ profile }: { profile: UserProfile }) {
  const meta = useMeta();
  const principal = usePrincipal();
  const composedAs = useComposedPrincipal();
  const queryClient = useQueryClient();
  const router = useRouter();
  const profileKey = queryKeys.profiles.detail(principal, profile.username);

  const mutation = useMutation({
    mutationKey: [...profileKey, "current-chapter"] as const,
    mutationFn: (status: JourneyStatus | null) =>
      patchMe(assertComposedPrincipal(composedAs), { status }),
    onSuccess: (updatedProfile) => {
      void reconcileOwnProfile(queryClient, principal, updatedProfile);
      router.refresh();
      toast.success("Current chapter updated.");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  function updateChapter(value: string) {
    if (mutation.isPending) return;
    mutation.mutate(value === NO_CHAPTER ? null : journeyStatusSchema.parse(value));
  }

  return (
    <div className="grid gap-1.5">
      <Label htmlFor="current-chapter" className="text-muted-foreground text-xs">
        Current chapter
      </Label>
      <Select
        value={profile.status ?? NO_CHAPTER}
        onValueChange={updateChapter}
        disabled={mutation.isPending}
      >
        <SelectTrigger id="current-chapter" size="sm" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_CHAPTER}>Not set</SelectItem>
          {meta.journeyStatus.map((status) => (
            <SelectItem key={status.value} value={status.value}>
              <span aria-hidden>{status.dot}</span> {status.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="sr-only" aria-live="polite">
        {mutation.isPending ? "Updating current chapter…" : ""}
      </span>
    </div>
  );
}
