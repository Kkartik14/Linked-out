"use client";

import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { z } from "zod";
import {
  createLInputSchema,
  lTypeSchema,
  visibilitySchema,
  type LDetail,
} from "@linkedout/contracts/v2";

import { createL, errorMessage, fieldErrors, patchL } from "@/lib/api";
import { useMeta } from "@/components/meta-provider";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useComposedPrincipal } from "@/components/session-provider";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const SHAPE = createLInputSchema.shape;

/**
 * Read the wire's own bounds rather than restating them, so raising a limit in the contract
 * needs no edit here. `maxLength` is nullable for a `ZodString` with no `.max()`; these have
 * one, and throwing at import is the right failure if that ever stops being true — a silent
 * fallback would quietly let the counter disagree with what the API accepts.
 */
function maxLengthOf(field: "title" | "story"): number {
  const max = SHAPE[field].maxLength;
  if (max === null) throw new Error(`createLInputSchema.${field} has no max length`);
  return max;
}

const LIMITS = { title: maxLengthOf("title"), story: maxLengthOf("story") } as const;

/**
 * Mirrors `createLInputSchema` from the v2 contract, restated here only to attach the
 * human-facing messages the API's stable field codes don't carry, and to trim before
 * validating. Every bound comes from the contract above. The v2 L has no category,
 * company, tags, or event date — those concepts are gone from the wire.
 */
const formSchema = z.object({
  title: z.string().trim().min(1, "Give your L a title.").max(LIMITS.title),
  story: z.string().trim().min(1, "Tell the story.").max(LIMITS.story),
  type: lTypeSchema,
  visibility: visibilitySchema,
  isAnonymous: z.boolean(),
});
type FormValues = z.infer<typeof formSchema>;

/**
 * What the API applies when a field is omitted. The composer shows a control for each, so
 * it must preselect *something* — but which value is the backend's call (contract v2 §1),
 * so take it from the schema instead of hardcoding `PUBLIC` here. A privacy default is
 * exactly the thing a dumb client should not be choosing.
 */
const WIRE_DEFAULTS = createLInputSchema.parse({ title: "_", story: "_" });

export function LComposer({ initial }: { initial?: LDetail }) {
  const meta = useMeta();
  const router = useRouter();
  const composedAs = useComposedPrincipal();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: initial
      ? {
          title: initial.title,
          story: initial.story,
          type: initial.type,
          visibility: initial.visibility,
          isAnonymous: initial.isAnonymous,
        }
      : {
          title: "",
          story: "",
          type: WIRE_DEFAULTS.type,
          visibility: WIRE_DEFAULTS.visibility,
          isAnonymous: WIRE_DEFAULTS.isAnonymous,
        },
  });

  async function onSubmit(values: FormValues) {
    try {
      const saved = initial ? await patchL(composedAs, initial.id, values) : await createL(composedAs, values);
      toast.success(initial ? "Changes saved." : "Your L is live.");
      router.push(`/ls/${saved.id}`);
      router.refresh();
    } catch (err) {
      const fieldMap = fieldErrors(err);
      const values = form.getValues();
      // Field names come back from the server, so they're external input: narrow with a
      // guard rather than asserting `as keyof FormValues` before the check that earns it.
      const isFormField = (field: string): field is keyof FormValues =>
        Object.hasOwn(values, field);

      let mapped = false;
      for (const [field, message] of Object.entries(fieldMap)) {
        if (!isFormField(field)) continue;
        form.setError(field, { message });
        mapped = true;
      }
      if (!mapped) toast.error(errorMessage(err, "Could not save your L."));
    }
  }

  const titleLen = useWatch({ control: form.control, name: "title" }).length;
  const storyLen = useWatch({ control: form.control, name: "story" }).length;
  const visibility = useWatch({ control: form.control, name: "visibility" });
  const visibilityDesc = meta.visibility.find((v) => v.value === visibility)?.description;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-6">
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <div className="flex items-center justify-between">
                <FormLabel>Title</FormLabel>
                <span className="text-muted-foreground text-xs tabular-nums">
                  {titleLen}/{LIMITS.title}
                </span>
              </div>
              <FormControl>
                <Input placeholder="Rejected after the final round at…" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="story"
          render={({ field }) => (
            <FormItem>
              <div className="flex items-center justify-between">
                <FormLabel>Story</FormLabel>
                <span className="text-muted-foreground text-xs tabular-nums">
                  {storyLen}/{LIMITS.story}
                </span>
              </div>
              <FormControl>
                <Textarea rows={10} placeholder="What happened, and how it felt…" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid gap-6 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="type"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Type</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {meta.lType.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>Which section of your profile it appears in.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="visibility"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Visibility</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {meta.visibility.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {visibilityDesc ? <FormDescription>{visibilityDesc}</FormDescription> : null}
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="isAnonymous"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <FormLabel>Post anonymously</FormLabel>
                <FormDescription>
                  Your name and avatar are hidden — even from your followers.
                </FormDescription>
              </div>
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
            </FormItem>
          )}
        />

        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting
              ? "Saving…"
              : initial
                ? "Save changes"
                : "Share this L"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
