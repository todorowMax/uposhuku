# SEO pages

Server-rendered pages for search, outside the map layout (no MapLibre). Indexing as a whole is closed until the owner
turns it on (see "Switch").

## Pages

| URL | Route | What it renders |
| --- | --- | --- |
| `/p/<id>` (direct visit, refresh, search) | `app/(site)/p/[id]` | `h1` with the name, specialty, city, bio, tags (links to the catalog), works, reviews (verified ones marked). `ProfilePage` + `Person` JSON-LD, `knowsAbout` from tags, `aggregateRating` only from verified reviews and only when there is one. Unknown or unpublished profile: 404 |
| `/p/<id>` (opened from the map) | `app/(map)/@modal/(.)p/[id]` | Intercepting route: the old profile dialog over the map, no reload. Slot `modal` in `app/(map)/layout.tsx` |
| `/poslugy/<tag>` and `/poslugy/<tag>/<city>` | `app/(site)/poslugy` | `h1` like "Розробка лендингів у Львові", performers visible on the map for the tag (and city), open public requests count, median budget, neighbouring cities, related tags, `BreadcrumbList` + `ItemList`. Unknown tag or city: 404 |
| `/` | `app/(map)/page.tsx` | Adds `Organization` and `WebSite` JSON-LD only. No visible change |
| `/zapyt/<id>` | `app/zapyt` | See `docs/features/requests.md` |

## Rules

- Public profile DTO: `lib/profile/public.ts` (`PublicProfile`), explicit field list, no email, user id internals or coordinates. Photo only as an
  `/api/uploads/...` URL; a legacy data URL is never inlined (initials are drawn instead). Moving photos to R2 is a follow-up.
- Catalog performers are the ones on the map: published profile and placement tier 2 or higher (same rule as `/api/map/performers`).
  Requests counted: open, author allowed sharing (`channel_opt_in`), tagged with the tag (and city). Median budget is over those with a budget.
- Catalog slugs and headings: `lib/tags/catalog.ts` (slug defaults to the tag id; heading defaults to the tag label). City locative:
  `cityLocative` in `lib/map/cities.ts`. Pure logic: `lib/seo/catalog.ts`; data: `lib/server/catalog-repo.ts`.
- A catalog page is indexable with 3 or more real performers (`MIN_INDEXABLE_PERFORMERS`; `demo-` seed users do not count), otherwise
  `noindex, follow`. `app/sitemap.ts` lists profiles and only the indexable catalog pages.
- New tags need no catalog work: a tag without a written heading uses its label. Add a heading in `lib/tags/catalog.ts` when the label reads badly with "у <місті>".

## Switch

`lib/seo/indexing.ts`: open only with `DEPLOY_ENV=production` and `SEO_INDEXING=on`. Closed everywhere else; pages here never override that
(a thin catalog page uses `siteRobots()` while closed).
