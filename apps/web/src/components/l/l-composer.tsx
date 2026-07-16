"use client";

import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { z } from "zod";
import {
  lTypeSchema,
  visibilitySchema,
  type CreateLInput,
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
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const LIMITS = { title: 140, story: 10_000 } as const;

/**
 * Mirrors `createLInputSchema` from the v2 contract, restated here only to attach the
 * human-facing messages the API's stable field codes don't carry. The v2 L has no
 * category, company, tags, or event date — those concepts are gone from the wire.
 */
const formSchema = z.object({
  title: z.string().trim().min(1, "Give your L a title.").max(LIMITS.title),
  story: z.string().trim().min(1, "Tell the story.").max(LIMITS.story),
  type: lTypeSchema,
  visibility: visibilitySchema,
  isAnonymous: z.boolean(),
});
type FormValues = z.infer<typeof formSchema>;

export function LComposer({ initial }: { initial?: LDetail }) {
  const meta = useMeta();
  const router = useRouter();

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
          type: "L",
          visibility: "PUBLIC",
          isAnonymous: false,
        },
  });

  async function onSubmit(values: FormValues) {
    const input: CreateLInput = {
      title: values.title,
      story: values.story,
      type: values.type,
      visibility: values.visibility,
      isAnonymous: values.isAnonymous,
    };

    try {
      const saved = initial ? await patchL(initial.id, input) : await createL(input);
      toast.success(initial ? "Changes saved." : "Your L is live.");
      router.push(`/ls/${saved.id}`);
      router.refresh();
    } catch (err) {
      const fieldMap = fieldErrors(err);
      let mapped = false;
      for (const [field, message] of Object.entries(fieldMap)) {
        const key = field as keyof FormValues;
        if (key in form.getValues()) {
          form.setError(key, { message });
          mapped = true;
        }
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
