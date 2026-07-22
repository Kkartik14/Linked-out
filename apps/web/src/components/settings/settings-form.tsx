"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  avatarContentTypeSchema,
  type UserProfile,
} from "@linkedout/contracts";

import { errorMessage, patchMe, presignAvatar } from "@/lib/api";
import { UserAvatar } from "@/components/user-avatar";
import { assertComposedPrincipal, useComposedPrincipal } from "@/components/session-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const MAX_BYTES = 5 * 1024 * 1024;

export function SettingsForm({ user }: { user: UserProfile }) {
  const router = useRouter();
  const composedAs = useComposedPrincipal();

  const [name, setName] = React.useState(user.name ?? "");
  const [bio, setBio] = React.useState(user.bio ?? "");
  const [image, setImage] = React.useState(user.image);
  const [saving, setSaving] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await patchMe(assertComposedPrincipal(composedAs), {
        name: name.trim() || null,
        bio: bio.trim() || null,
      });
      toast.success("Profile updated.");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleFile(file: File) {
    // `file.type` is untrusted browser input: validate it with the contract schema.
    const contentType = avatarContentTypeSchema.safeParse(file.type);
    if (!contentType.success) {
      toast.error("Use a JPEG, PNG, or WebP image.");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("Image must be under 5 MB.");
      return;
    }
    setUploading(true);
    try {
      const presign = await presignAvatar(assertComposedPrincipal(composedAs), {
        contentType: contentType.data,
        contentLength: file.size,
      });
      const put = await fetch(presign.uploadUrl, {
        method: "PUT",
        headers: presign.headers,
        body: file,
      });
      if (!put.ok) throw new Error("Upload failed. Please try again.");
      const updated = await patchMe(assertComposedPrincipal(composedAs), { image: presign.publicUrl });
      setImage(updated.image ?? presign.publicUrl);
      toast.success("Avatar updated.");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setUploading(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <UserAvatar name={name || user.name} username={user.username} image={image} className="size-16 text-lg" />
        <div className="flex flex-col gap-1">
          {/* A real <button>: `disabled` on a Slot'd <label> is inert, so the
              control stayed clickable mid-upload and accepted a second file. */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? "Uploading…" : "Change avatar"}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            disabled={uploading}
            tabIndex={-1}
            aria-hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
              e.target.value = "";
            }}
          />
          <span className="text-muted-foreground text-xs">JPEG, PNG, or WebP · up to 5 MB</span>
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="username">Username</Label>
        <Input id="username" value={user.username} disabled />
        <span className="text-muted-foreground text-xs">@{user.username}</span>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          autoComplete="name"
        />
      </div>

      <div className="grid gap-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="bio">Bio</Label>
          <span className="text-muted-foreground text-xs tabular-nums">{bio.length}/280</span>
        </div>
        <Textarea
          id="bio"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          maxLength={280}
          rows={3}
          placeholder="A short line about where you are in your journey."
        />
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
