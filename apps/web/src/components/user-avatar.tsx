import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Presentation-only avatar with an initials fallback (no external image needed)
 * and an optional journey-status dot. Server- and client-safe: pass the status
 * emoji in via `statusDot` rather than reading meta here.
 */
export function UserAvatar({
  name,
  username,
  image,
  statusDot,
  className,
}: {
  name: string | null | undefined;
  username: string;
  image: string | null | undefined;
  statusDot?: string | null;
  className?: string;
}) {
  return (
    <span className="relative inline-flex shrink-0">
      <Avatar className={className}>
        {image ? <AvatarImage src={image} alt="" /> : null}
        <AvatarFallback>{initials(name, username)}</AvatarFallback>
      </Avatar>
      {statusDot ? (
        <span
          aria-hidden
          className={cn(
            "absolute -right-0.5 -bottom-0.5 rounded-full text-[10px] leading-none",
          )}
        >
          {statusDot}
        </span>
      ) : null}
    </span>
  );
}
