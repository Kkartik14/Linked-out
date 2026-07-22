# LinkedOut product language

LinkedOut is a professional social product for honest career experiences called Ls. This glossary
contains only product terms accepted during the current discovery process; implementation details
belong in the contract and architecture documents.

## Language

**L**:
The core piece of shared career content on LinkedOut.
_Avoid_: Post

**Reaction**:
One of LinkedOut's fixed, platform-provided expressive responses to an L. A person may add multiple
different reactions to the same L.
_Avoid_: Like, custom emoji

**Reaction chip**:
A visible reaction already used on an L that displays its emoji and count and can be tapped to join
or leave that reaction. At most three are shown directly; when more exist, two remain visible and
the rest are represented by `+X`.
_Avoid_: Always-visible reaction button

**Add reaction**:
The `+` control used to choose a reaction. It is the only reaction control shown before an L has
received any reactions.
_Avoid_: Seeded empty reactions

**Saved**:
A person's bookmark state for an L and their corresponding personal Saved destination. It is not
an expressive reaction in the product experience; signed-out attempts continue through login.
_Avoid_: Collection, custom reaction

**Current chapter**:
A person's self-declared current career context, chosen from Interviewing, Building, Working,
Starting Up, Recovering, or Taking a Break. The owner edits it directly on their profile below
Edit profile; it is not a Settings field.
_Avoid_: Journey status, availability status

**Viewer card**:
The signed-in person's compact identity summary at the top of the feed's left rail.
_Avoid_: Profile page

**Grouped search results**:
The live mixed search response that begins with one top-matching L and presents up to three matching
people in a separate People section.
_Avoid_: Personalized recommendations, ungrouped result list

**Builders Helped**:
A retired reputation label that must not be presented as a LinkedOut product metric.
_Avoid_: Reusing or renaming this metric without a new product decision

**Journey timeline / Collections / All profile tab**:
Retired profile concepts. A profile contains one tab for each accepted L type; Saved is the only
bookmark destination.
_Avoid_: Reintroducing hidden routes or compatibility UI for these concepts
