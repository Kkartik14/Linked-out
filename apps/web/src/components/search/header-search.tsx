"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Search } from "lucide-react";
import type { LCard, UserSummary } from "@linkedout/contracts";

import { searchLs, searchUsers } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { usePrincipal } from "@/components/session-provider";
import { cn } from "@/lib/utils";

const DEBOUNCE_MS = 180;

interface SearchOption {
  key: string;
  group: "ls" | "users";
  href: string;
  label: string;
  detail?: string;
  seeAll?: boolean;
}

function allLsHref(query: string): string {
  return `/search?q=${encodeURIComponent(query)}`;
}

function allUsersHref(query: string): string {
  return `/search?q=${encodeURIComponent(query)}&type=users`;
}

function lOption(l: LCard): SearchOption {
  return {
    key: `l:${l.id}`,
    group: "ls",
    href: `/ls/${l.id}`,
    label: l.title,
    detail: l.isAnonymous ? "Anonymous builder" : (l.author?.name ?? l.author?.username),
  };
}

function userOption(user: UserSummary): SearchOption {
  return {
    key: `user:${user.id}`,
    group: "users",
    href: `/u/${user.username}`,
    label: user.name ?? user.username,
    detail: `@${user.username}`,
  };
}

export function HeaderSearch() {
  const router = useRouter();
  const principal = usePrincipal();
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listboxId = React.useId();
  const lsHeadingId = React.useId();
  const usersHeadingId = React.useId();

  const [rawQuery, setRawQuery] = React.useState("");
  const [debouncedQuery, setDebouncedQuery] = React.useState("");
  const [focused, setFocused] = React.useState(false);
  const [dismissed, setDismissed] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(-1);
  const query = rawQuery.trim();

  React.useEffect(() => {
    const timeout = window.setTimeout(
      () => setDebouncedQuery(query),
      query ? DEBOUNCE_MS : 0,
    );
    return () => window.clearTimeout(timeout);
  }, [query]);

  React.useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setFocused(false);
        setActiveIndex(-1);
      }
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, []);

  const settled = query.length > 0 && query === debouncedQuery;
  const ls = useQuery({
    queryKey: queryKeys.search.preview.ls(principal, debouncedQuery),
    queryFn: ({ signal }) => searchLs(debouncedQuery, undefined, 1, { signal }),
    enabled: debouncedQuery.length > 0,
    staleTime: 30_000,
  });
  const users = useQuery({
    queryKey: queryKeys.search.preview.users(principal, debouncedQuery),
    queryFn: ({ signal }) => searchUsers(debouncedQuery, undefined, 3, { signal }),
    enabled: debouncedQuery.length > 0,
    staleTime: 30_000,
  });

  const options = React.useMemo<SearchOption[]>(() => {
    if (!settled) return [];
    return [
      ...(ls.data?.data.slice(0, 1).map(lOption) ?? []),
      {
        key: "all:ls",
        group: "ls",
        href: allLsHref(query),
        label: `See all Ls for “${query}”`,
        seeAll: true,
      },
      ...(users.data?.data.slice(0, 3).map(userOption) ?? []),
      {
        key: "all:users",
        group: "users",
        href: allUsersHref(query),
        label: `See all people for “${query}”`,
        seeAll: true,
      },
    ];
  }, [ls.data, query, settled, users.data]);

  const open = focused && !dismissed && query.length > 0;
  const busy = !settled || ls.isPending || users.isPending;
  const activeOption = activeIndex >= 0 ? options[activeIndex] : undefined;

  function activate(option: SearchOption) {
    setFocused(false);
    setActiveIndex(-1);
    router.push(option.href);
  }

  function moveActive(direction: 1 | -1) {
    if (options.length === 0) return;
    setDismissed(false);
    setActiveIndex((current) => {
      if (current < 0) return direction === 1 ? 0 : options.length - 1;
      return Math.min(options.length - 1, Math.max(0, current + direction));
    });
  }

  const status = busy
    ? "Searching…"
    : ls.isError && users.isError
      ? "Search previews are unavailable. Open the full search to try again."
      : `${ls.data?.data.length ?? 0} L results and ${users.data?.data.length ?? 0} people results.`;

  return (
    <div ref={wrapperRef} className="relative hidden sm:block">
      <form
        role="search"
        aria-label="Site search"
        onSubmit={(event) => {
          event.preventDefault();
          if (activeOption) activate(activeOption);
          else if (query) activate({ key: "all:ls", group: "ls", href: allLsHref(query), label: query });
        }}
      >
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-label="Search Ls and people"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-activedescendant={activeOption ? `${listboxId}-option-${activeIndex}` : undefined}
          value={rawQuery}
          maxLength={100}
          onChange={(event) => {
            setRawQuery(event.target.value);
            setActiveIndex(-1);
            setDismissed(false);
          }}
          onFocus={() => {
            setFocused(true);
            setDismissed(false);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              moveActive(event.key === "ArrowDown" ? 1 : -1);
            } else if (event.key === "Escape") {
              event.preventDefault();
              setDismissed(true);
              setActiveIndex(-1);
              inputRef.current?.focus();
            } else if (event.key === "Tab") {
              setFocused(false);
              setActiveIndex(-1);
            }
          }}
          placeholder="Search Ls, people…"
          className="border-input bg-muted/50 focus-visible:ring-ring/50 h-9 w-44 rounded-md border py-1 pr-3 pl-8 text-sm outline-none focus-visible:ring-[3px] focus-visible:bg-background md:w-56"
        />
      </form>

      {open ? (
        <div className="bg-popover absolute top-[calc(100%+0.5rem)] right-0 z-50 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-xl border shadow-lg">
          <div
            id={listboxId}
            role="listbox"
            aria-label="Search suggestions"
            aria-busy={busy}
            className="max-h-[min(32rem,70vh)] overflow-y-auto p-1.5"
          >
            {settled ? (
              <>
                <SearchGroup
                  group="ls"
                  label="Ls"
                  headingId={lsHeadingId}
                  listboxId={listboxId}
                  options={options}
                  activeIndex={activeIndex}
                  onActivate={activate}
                  onActiveChange={setActiveIndex}
                />
                <SearchGroup
                  group="users"
                  label="People"
                  headingId={usersHeadingId}
                  listboxId={listboxId}
                  options={options}
                  activeIndex={activeIndex}
                  onActivate={activate}
                  onActiveChange={setActiveIndex}
                />
              </>
            ) : null}
          </div>
          <p role="status" className={cn("px-3 py-2 text-xs", busy ? "text-muted-foreground" : "sr-only")}>
            {status}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function SearchGroup({
  group,
  label,
  headingId,
  listboxId,
  options,
  activeIndex,
  onActivate,
  onActiveChange,
}: {
  group: SearchOption["group"];
  label: string;
  headingId: string;
  listboxId: string;
  options: SearchOption[];
  activeIndex: number;
  onActivate: (option: SearchOption) => void;
  onActiveChange: (index: number) => void;
}) {
  return (
    <div role="group" aria-labelledby={headingId}>
      <p id={headingId} className="text-muted-foreground px-2 pt-2 pb-1 text-xs font-medium">
        {label}
      </p>
      {options.map((option, index) =>
        option.group === group ? (
          <div
            key={option.key}
            id={`${listboxId}-option-${index}`}
            role="option"
            tabIndex={-1}
            aria-selected={activeIndex === index}
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => onActivate(option)}
            onMouseMove={() => onActiveChange(index)}
            className={cn(
              "flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-sm outline-none",
              activeIndex === index && "bg-accent",
              option.seeAll && "text-muted-foreground",
            )}
          >
            <span className="min-w-0">
              <span className="block truncate font-medium">{option.label}</span>
              {option.detail ? (
                <span className="text-muted-foreground block truncate text-xs">{option.detail}</span>
              ) : null}
            </span>
            {option.seeAll ? <ArrowRight aria-hidden className="size-4 shrink-0" /> : null}
          </div>
        ) : null,
      )}
    </div>
  );
}
