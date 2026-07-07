# LinkedOut (Working Name)

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
* Username
* Profile Picture
* Bio

---

## Create an L

Fields:

* Title
* Story
* Category
* Lesson Learned
* Date
* Company (optional)
* Tags
* Anonymous Toggle
* Visibility

  * Public
  * Followers
  * Private
  * Anonymous

---

## Feed

Global feed of Ls.

Sorting:

* Latest
* Trending
* Most Helpful

Filters:

* Interviews
* Startups
* Layoffs
* Production
* Career
* Learning

Each card contains:

* Author
* Title
* Story Preview
* Lesson
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

Instead of LinkedIn sections, every profile contains:

## About

Short bio.

---

## L Journey

Chronological timeline of career events.

Example:

Applied to Google

↓

Rejected

↓

Built Side Project

↓

Launched Startup

↓

Failed

↓

Joined Swiggy

↓

Laid Off

↓

Building Again

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

## Character Development

Lessons accumulated over time.

Examples:

* Ship before perfect.
* Talk to customers.
* Don't overengineer.
* Measure everything.
* Sleep before deploying.

---

## Checkpoints

Major milestones.

Examples:

* First Internship
* First Salary
* First OSS Contribution
* 100th Rejection
* First Customer
* Raised Funding

---

## Collections

Collections group related Ls.

Examples:

My Startup Journey

Google Interview Journey

Life at Swiggy

Building Voice AI

Interview Season

---

# Journey Status

Every user has a current status.

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

"Someone started following your journey."

---

# Reputation

No emphasis on followers.

Instead surface:

* Stories Shared
* Lessons Shared
* Builders Helped
* Ls Shared
* Collections Created

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

* Next.js
* Tailwind CSS
* shadcn/ui

Backend

* Next.js API Routes (initially)

Database

* PostgreSQL
* Prisma ORM

Authentication

* Auth.js

Storage

* Cloudflare R2 / S3

Deployment

* Vercel
* Supabase / Neon

---

# Roadmap

Phase 1

* Authentication
* Profiles
* Create L
* Feed
* Comments
* Reactions
* Search


# future scope (don't add in current)

* Career graphs
* Public journey pages
* Company pages (based on community stories)
* Analytics
* Weekly digests
* Mobile apps

---

