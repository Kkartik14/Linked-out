"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { z } from "zod";
import {
  lTypeSchema,
  visibilitySchema,
  type CreateLInput,
  type LCategory,
  type LDetail,
} from "@linkedout/contracts";

import { createL, errorMessage, fieldErrors, getPopularTags, patchL } from "@/lib/api";
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
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const NO_CATEGORY = "NONE";
const LIMITS = {
  title: 140,
  story: 10_000,
  lessonLearned: 500,
  company: 100,
  tags: 5,
  tag: 30,
} as const;

const formSchema = z.object({
  title: z.string().trim().min(1, "Give your L a title.").max(LIMITS.title),
  story: z.string().trim().min(1, "Tell the story.").max(LIMITS.story),
  lessonLearned: z.string().trim().max(LIMITS.lessonLearned),
  type: lTypeSchema,
  category: z.string(),
  company: z.string().trim().max(LIMITS.company),
  tags: z.array(z.string().min(1).max(LIMITS.tag)).max(LIMITS.tags),
  eventDate: z.string(),
  visibility: visibilitySchema,
  isAnonymous: z.boolean(),
});
type FormValues = z.infer<typeof formSchema>;

function TagsInput({ value, onChange }: { value: string[]; onChange: (tags: string[]) => void }) {
  const [draft, setDraft] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const full = value.length >= LIMITS.tags;
  const query = draft.trim().toLowerCase().replace(/^#/, "");
  const suggestions = useQuery({
    queryKey: ["popular-tags", query],
    queryFn: () => getPopularTags(query, 5),
    enabled: query.length > 0 && query.length <= LIMITS.tag && !full,
  });

  function add(nextTag = draft) {
    const tag = nextTag.trim().toLowerCase().replace(/^#/, "");
    if (!tag || full) {
      setDraft("");
      setError(null);
      return;
    }
    if (tag.length > LIMITS.tag) {
      setError(`Tags must be ${LIMITS.tag} characters or fewer.`);
      return;
    }
    if (!value.includes(tag)) onChange([...value, tag]);
    setDraft("");
    setError(null);
  }

  const options = (suggestions.data?.tags ?? [])
    .map((item) => item.tag)
    .filter((tag) => tag.includes(query) && !value.includes(tag))
    .slice(0, 5);

  return (
    <div className="flex flex-col gap-2">
      {value.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {value.map((tag) => (
            <Badge key={tag} variant="secondary" className="gap-1">
              #{tag}
              <button
                type="button"
                onClick={() => onChange(value.filter((t) => t !== tag))}
                aria-label={`Remove tag ${tag}`}
                className="hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      ) : null}
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add();
          }
        }}
        onBlur={() => add()}
        placeholder={full ? `Maximum of ${LIMITS.tags} tags` : "Add a tag, press Enter"}
        disabled={full}
      />
      {error ? <p className="text-destructive text-xs">{error}</p> : null}
      {options.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {options.map((tag) => (
            <button
              key={tag}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => add(tag)}
              className="text-muted-foreground hover:bg-accent hover:text-foreground rounded-full border px-2 py-0.5 text-xs"
            >
              #{tag}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function LComposer({ initial }: { initial?: LDetail }) {
  const meta = useMeta();
  const router = useRouter();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: initial
      ? {
          title: initial.title,
          story: initial.story,
          lessonLearned: initial.lessonLearned ?? "",
          type: initial.type,
          category: initial.category ?? NO_CATEGORY,
          company: initial.company ?? "",
          tags: initial.tags,
          eventDate: initial.eventDate ? initial.eventDate.slice(0, 10) : "",
          visibility: initial.visibility,
          isAnonymous: initial.isAnonymous,
        }
      : {
          title: "",
          story: "",
          lessonLearned: "",
          type: "L",
          category: NO_CATEGORY,
          company: "",
          tags: [],
          eventDate: "",
          visibility: "PUBLIC",
          isAnonymous: false,
        },
  });

  async function onSubmit(values: FormValues) {
    const input: CreateLInput = {
      title: values.title,
      story: values.story,
      lessonLearned: values.lessonLearned ? values.lessonLearned : null,
      type: values.type,
      category: values.category === NO_CATEGORY ? null : (values.category as LCategory),
      company: values.company ? values.company : null,
      tags: values.tags,
      eventDate: values.eventDate ? new Date(values.eventDate) : null,
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
        const key = field.split("[")[0] as keyof FormValues;
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
  const lessonLen = useWatch({ control: form.control, name: "lessonLearned" }).length;
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
                <Textarea rows={8} placeholder="What happened, and how it felt…" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="lessonLearned"
          render={({ field }) => (
            <FormItem>
              <div className="flex items-center justify-between">
                <FormLabel>Lesson learned (optional)</FormLabel>
                <span className="text-muted-foreground text-xs tabular-nums">
                  {lessonLen}/{LIMITS.lessonLearned}
                </span>
              </div>
              <FormControl>
                <Textarea rows={2} placeholder="What would you tell your past self?" {...field} />
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
            name="category"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Category (optional)</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value={NO_CATEGORY}>None</SelectItem>
                    {meta.lCategory.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>How it&apos;s filtered in the feed.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="company"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Company (optional)</FormLabel>
                <FormControl>
                  <Input placeholder="e.g. Google" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="eventDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>When it happened (optional)</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="tags"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Tags (optional)</FormLabel>
              <FormControl>
                <TagsInput value={field.value} onChange={field.onChange} />
              </FormControl>
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
                  <SelectTrigger className="sm:w-64">
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
