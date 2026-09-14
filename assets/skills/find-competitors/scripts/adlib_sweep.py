#!/usr/bin/env python3
"""
adlib_sweep.py — sweep the Meta Ad Library by keyword lanes via Apify and aggregate advertisers.

Usage:
  python3 adlib_sweep.py --keywords lanes.txt --outdir adlib --limit 150 --country US        # prints the plan, spends nothing
  python3 adlib_sweep.py --keywords lanes.txt --outdir adlib --limit 150 --country US --yes  # runs the sweep
  python3 adlib_sweep.py --keywords lanes.txt --outdir adlib --aggregate-only

lanes.txt: one query per line (the outcome × mechanism × ingredient grid, see references/query-grid.md).

Needs APIFY_API_TOKEN in .env. Cost: the apify~facebook-ads-scraper actor bills per result; 30 lanes × 150
results is a few dollars. Without --yes the script prints the plan and stops; say it back, get a go, rerun with --yes.

Output:
  <outdir>/<lane>.json          raw ads per lane
  <outdir>/advertisers.md       advertisers ranked by how many lanes they appear in and ad count,
                                with the lanes each one showed up in. This is the candidate list.
"""
import argparse, json, os, sys, urllib.parse, glob, collections
from concurrent.futures import ThreadPoolExecutor

try:
    import requests
    from dotenv import load_dotenv
except ImportError:
    sys.exit("pip3 install requests python-dotenv")

here = os.path.abspath(os.getcwd())
for _ in range(7):
    env = os.path.join(here, ".env")
    if os.path.exists(env): load_dotenv(env); break
    here = os.path.dirname(here)


def run(kw, outdir, limit, country, tok):
    u = ("https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=" + country +
         "&q=" + urllib.parse.quote(kw) + "&search_type=keyword_unordered&media_type=all")
    path = os.path.join(outdir, kw.replace(" ", "_").replace("/", "-") + ".json")
    try:
        r = requests.post(f"https://api.apify.com/v2/acts/apify~facebook-ads-scraper/run-sync-get-dataset-items?token={tok}&timeout=600",
                          json={"startUrls": [{"url": u}], "resultsLimit": limit}, timeout=(30, 660))
        d = r.json() if r.status_code == 200 else []
        if not isinstance(d, list): d = []
        json.dump(d, open(path, "w"))
        print(f"{kw:<40} {r.status_code} {len(d)} ads", flush=True)
    except Exception as e:
        print(kw, "ERR", e, flush=True)


def aggregate(outdir):
    by_page = collections.defaultdict(lambda: dict(lanes=set(), ads=0, page_id=None, longest_active=0, links=set()))
    for f in glob.glob(os.path.join(outdir, "*.json")):
        lane = os.path.basename(f)[:-5].replace("_", " ")
        try: ads = json.load(open(f))
        except Exception: continue
        if not isinstance(ads, list): continue
        for a in ads:
            p = a.get("pageName") or (a.get("snapshot") or {}).get("pageName")
            if not p: continue
            e = by_page[p]; e["lanes"].add(lane); e["ads"] += 1; e["page_id"] = e["page_id"] or a.get("pageId")
            lu = (a.get("snapshot") or {}).get("linkUrl")
            if lu: e["links"].add(urllib.parse.urlparse(lu).netloc)
    rows = sorted(by_page.items(), key=lambda kv: (-len(kv[1]["lanes"]), -kv[1]["ads"]))
    with open(os.path.join(outdir, "advertisers.md"), "w") as f:
        f.write("# Advertisers found across lanes\n\nRanked by number of lanes, then ads seen. Feed the top rows to competitor_signals.py.\n\n")
        f.write("| Advertiser | Lanes | Ads seen | Domains | Lanes hit | Ad Library page |\n|---|---|---|---|---|---|\n")
        for p, e in rows:
            link = f"https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&view_all_page_id={e['page_id']}&search_type=page&sort_data[mode]=total_impressions&sort_data[direction]=desc" if e["page_id"] else ""
            f.write(f"| {p} | {len(e['lanes'])} | {e['ads']} | {', '.join(sorted(e['links']))[:80]} | {', '.join(sorted(e['lanes']))[:120]} | {link} |\n")
    with open(os.path.join(outdir, "advertisers.txt"), "w") as f:
        for p, e in rows: f.write(p + "\n")
    print("wrote", os.path.join(outdir, "advertisers.md"), f"({len(rows)} advertisers)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--keywords", required=True)
    ap.add_argument("--outdir", default="adlib")
    ap.add_argument("--limit", type=int, default=150)
    ap.add_argument("--country", default="US")
    ap.add_argument("--workers", type=int, default=5)
    ap.add_argument("--aggregate-only", action="store_true")
    ap.add_argument("--yes", action="store_true", help="actually run the paid sweep")
    a = ap.parse_args()
    os.makedirs(a.outdir, exist_ok=True)
    if not a.aggregate_only:
        tok = os.environ.get("APIFY_API_TOKEN") or sys.exit("APIFY_API_TOKEN not found in .env or environment")
        lanes = [l.strip() for l in open(a.keywords) if l.strip() and not l.startswith("#")]
        if not a.yes:
            print(f"Plan: {len(lanes)} lanes x up to {a.limit} results = up to {len(lanes) * a.limit} billed results on apify~facebook-ads-scraper (country {a.country}).")
            print(f"Outputs land in {a.outdir}/. Nothing was run. Say the plan back, get a go, then rerun with --yes.")
            sys.exit(2)
        with ThreadPoolExecutor(a.workers) as ex:
            list(ex.map(lambda k: run(k, a.outdir, a.limit, a.country, tok), lanes))
    aggregate(a.outdir)


if __name__ == "__main__":
    main()
