# Singapore Primary School Explorer

Static GitHub Pages site for browsing Singapore primary schools with official directory data, OneMap geocoding, and official MOE P1 queueing or balloting context where machine-accessible.

## What it includes

- Searchable school explorer
- OneMap-based address lookup with 1km and 2km distance context
- Geographic scatter map derived from official addresses
- School detail and comparison panels
- Official data refresh workflow
- GitHub Pages deployment workflow

## Official sources used

- MOE P1 registration overview: `https://www.moe.gov.sg/primary/p1-registration`
- MOE distance rules: `https://www.moe.gov.sg/primary/p1-registration/distance`
- MOE school directory collection: `https://data.gov.sg/collections/457/view`
- General information of schools dataset
- School distinctive programmes dataset
- MOE programmes dataset
- OneMap search API for coordinates and address lookup
- Official MOE vacancies and balloting API when available, otherwise the latest machine-accessible official archived API snapshot

## Scripts

- `npm run dev`: local Vite development server
- `npm run build:data`: fetch official data and regenerate `public/data`
- `npm run build`: production build for GitHub Pages
- `npm run lint`: run ESLint

## Notes

- Balloting information is shown as context, not prediction.
- The live MOE ballot endpoint is often blocked from automated environments. The refresh script falls back to the latest machine-accessible official archived snapshot instead of using unofficial mirrors.
- In the current generated data, the ballot context comes from the official archived MOE snapshot dated `2022-06-30`.
- Deploy builds use the committed `public/data` files so GitHub Pages remains reliable even if external APIs are temporarily unavailable.
