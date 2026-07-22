# LinkedOut (Working Name)

> **Document role:** product vision and vocabulary. The original MVP implementation choices have
> been reconciled with the shipped v1 product as of 1.1.4 (2026-07-23). For exact wire behavior, use
> `docs/api-contract-v1.md`; for runtime structure, use `ARCHITECTURE.md`.

## Vision

Build the most authentic professional network on the internet.

Unlike LinkedIn, which only showcases achievements, LinkedOut captures the entire journey—rejections, layoffs, failed startups, production incidents, pivots, and the lessons that came from them.

The platform should become the place where builders document their careers honestly.

**Positioning**

> LinkedIn for your Ls.

---

# Product Philosophy

People don't grow because of their wins.

People grow because of the Ls they survive.

The product should celebrate resilience, learning, and transparency—not failure itself.

Every profile should answer one question:

> "Who are you becoming?"

instead of

> "Where do you work?"

---

# Target Users

Initial audience:

* Software Engineers
* Founders
* Designers
* Product Managers
* Students
* Job Seekers
* Indie Hackers

These users naturally accumulate stories worth sharing.

---

# Core Object

The platform revolves around **Ls**.

An L is any meaningful career event.

Examples:

* Rejected after final interview
* Laid off
* Failed startup
* Production outage
* Lost biggest customer
* Burned out
* Pivoted company
* Got ghosted
* Built something nobody used

The platform is known for Ls, but users can also document wins so their overall journey has context.

---

# MVP Features

## Authentication

* Google Login
* GitHub Login
* Email and password (with email verification via an emailed 8-digit one-time code, and OTP-based
  password reset) — feature 1.1.3
* Username
* Profile Picture
* Bio

---

## Create an L

Fields:

* Title
* Story
* Type
* Anonymous Toggle
* Visibility

  * Public
  * Followers
  * Private

Anonymity is separate from visibility. The public contract deliberately does not collect category, company, tags,
or a separate “when it happened” date.

Accepted types are exactly L, Win, Story, Scar, Plot Twist, and Battle.

---

## Feed

Global feed of Ls.

Sorting:

* Latest
* Most Popular
* Most Helpful

The public feed has no category filter. Discovery rails add the viewer card, People to Follow, Top Ls
for a seven-day interaction window, and a stable L of the day.

Each card contains:

* Author
* Title
* Story Preview
* Type
* Reactions
* Comments

---

## Reactions

No likes.

Reaction types:

* 💔 Been There
* 💡 Helpful
* 🔥 Respect
* 😂 Pain
* 📌 Saved

---

## Comments

Threaded discussion.

Focus should be:

"I experienced this too."

instead of arguments.

---

# User Profile

Profiles are the heart of the product.

Instead of LinkedIn sections, every profile contains About plus exactly six type tabs. The initial
tab is L; there is no All tab or separate timeline.

## About

Short bio.

---

## Ls

The neutral home for career experiences that do not need a more specific type.

---

## Wins

Positive career moments that give the honest story context.

---

## Stories

Long-form experiences.

Examples:

* Failed YC
* Biggest Production Incident
* My First Startup
* Leaving My Job

---

## Battles

Current ongoing struggles.

Examples:

* Interviewing
* Looking for PMF
* Learning Rust
* Building MVP
* Hiring First Engineer

---

## Scars

Permanent moments that shaped the user.

Examples:

* Rejected 150 times
* Startup failed
* Burned Out
* Lost Biggest Customer
* Production Outage

---

## Plot Twists

Unexpected turns.

Examples:

* Layoff
* Career Change
* Pivot
* Moving Countries
* Quitting FAANG

---

# Current chapter

Every user may declare their current career context directly from their own profile, below Edit
profile. It is not edited in Settings.

Examples:

🟡 Interviewing

🔵 Building

🟢 Working

🟣 Starting Up

🔴 Recovering

⚫ Taking a Break

---

# Search

Search should be a first-class feature.

Examples:

"Failed Google Interview"

"Startup Pivot"

"Production Outage"

"Layoff"

"Burnout"

"First Customer"

Users should discover authentic stories instead of polished blog posts.

---

# Notifications

Avoid vanity metrics.

Instead of:

"10 people liked your post."

Use:

"34 builders related to your story."

"Your production incident helped 18 people."

"Someone started following you."

---

# Reputation

No emphasis on followers.

Instead surface:

* Stories Shared
* Ls Shared

The goal is usefulness.

---


# Design Principles

The platform should feel:

* Honest
* Calm
* Human
* Reflective
* Minimal

Avoid:

* Corporate language
* Recruiter-focused UX
* Flex culture
* Engagement bait

---

# Tech Stack

Frontend

* Next.js 16 App Router
* React 19
* Tailwind CSS v4
* shadcn/ui
* TanStack Query

Backend

* NestJS 11 modular monolith
* Shared Zod v4 contracts

Database

* PostgreSQL 16
* Prisma ORM with raw SQL migrations for FTS, indexes, and triggers

Authentication

* Backend-owned Google/GitHub OAuth
* Email and password with an emailed 8-digit OTP (verification + password reset); Argon2id hashing,
  reuses the OAuth session handoff (feature 1.1.3)
* httpOnly access and rotating refresh cookies (current)
* Accepted one-origin BFF/session boundary; backend lifecycle implemented, browser cutover pending

Storage

* Cloudflare R2 / S3

Deployment

* Next.js-compatible web hosting
* Private NestJS API hosting
* Managed PostgreSQL such as Neon

---

# Shipped MVP scope

* Authentication
* Profiles
* Create L
* Feed
* Comments
* Reactions
* Search
* Follows
* Notifications
* Feed discovery rails


# future scope (don't add in current)

* Career graphs
* Company pages (based on community stories)
* Analytics
* Weekly digests
* Mobile apps

---
