# The query grid

Competitors are found by mechanism, not by category. "Stress relief supplement" is the worst query in any grid because it returns the category's grey middle. The grid crosses three word lists, and the strong brands show up in several cells at once.

## Build the three lists

Take them from the segment grid if one exists (the `odf` skill), otherwise from the brief and ten minutes with the reviews.

1. **Outcome words**, in the market's own language, one per sub-outcome that matters. Not the label ("sleep"), the phrase a buyer types ("wake up at 3am", "can't stay asleep", "puffy face", "rage at my kids").
2. **Mechanism words**, the beliefs the market already holds about the cause: cortisol, hormones, gut, nervous system, inflammation, blood sugar, estrogen, testosterone, thyroid. These are Belief facets, and they are also the UMPs competitors sell.
3. **Ingredient words**, the star and its likely partners, plus the two or three ingredients the category's big brands lead with.

## Cross them

Not every combination. Use these shapes:

- outcome alone (the plain phrase): `wake up at 3am`
- mechanism + outcome: `cortisol belly`, `cortisol 3am`
- mechanism + product word: `cortisol supplement`, `cortisol gummies`
- ingredient alone: `saffron supplement`, `magnesium glycinate sleep`
- ingredient + outcome: `ashwagandha sleep`
- the demographic word when it is a market on its own: `perimenopause supplement`, `menopause belly`

Aim for 25 to 40 lanes. Fewer than 20 misses brands; more than 50 returns the same advertisers again.

## Worked grid (fictional evening gummy: saffron, magnesium glycinate, rhodiola)

```
# outcome phrases
wake up at 3am
can't stay asleep
racing mind at night
puffy face morning
rage at my kids
stress eating at night
no energy after 40
# mechanism + outcome
cortisol belly
cortisol 3am
cortisol face
high cortisol symptoms
hormone balance sleep
nervous system regulation
# mechanism + product
cortisol supplement
cortisol gummies
cortisol reset
# ingredients
saffron supplement
saffron mood
magnesium glycinate sleep
rhodiola energy
ashwagandha sleep
ashwagandha cortisol
l-theanine
# demographic markets
perimenopause supplement
menopause belly
menopause mood swings
sleep supplement women over 40
```

## Reading the aggregate

`adlib_sweep.py` writes `advertisers.md` ranked by how many lanes each advertiser appeared in. Read it like this:

- **Many lanes, many ads:** a mechanism brand. Score it first.
- **One lane, many ads:** a single-angle brand or a lane that is really a different market (a menopause brand in the "menopause belly" lane). Score it if the lane is in your focus order.
- **Many lanes, few ads:** an affiliate or advertorial page pushing several products. Check the link domains column; the domains are the real brands.
- **Pages with community-style names** ("The Blood Sugar Journal", "Cholesterol Relief Community") are advertorial fronts. Follow the domain, not the page.

Drop retailers, marketplaces, and apps unless the brief says otherwise.

## The Amazon door

Amazon is a demand signal off Meta and a source of brand names the ad sweeps miss. For each outcome and ingredient word, search Amazon, take two result pages, and pull ASIN, title, rating, review count, price, and the sponsored flag with a page script in the in-app browser. Dedupe sponsored against organic. Rank by relevance times review count. Brand names in the top ten of two or more searches go into the signal check. Review count and velocity become the sixth column on the sheet.

Apify has Amazon search-result actors if the browser route is slow, but they bill per result and the browser route was free and fast for 12 categories.
