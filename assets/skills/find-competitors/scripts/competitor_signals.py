#!/usr/bin/env python3
"""
competitor_signals.py — score a list of brands on the six strength signals using the Atria API.

Usage:
  python3 competitor_signals.py --names "Brand A" "Brand B" --out sheet.md
  python3 competitor_signals.py --file brands.txt --out sheet.md --json signals.json

brands.txt: one brand name per line (blank lines and # comments ignored).

Needs ATRIA_API_KEY in the workspace .env (or the environment). Rate limit is tight:
~10 calls in quick succession returns 429, so the script pauses and retries.

Signals per brand (all from Atria's brand feed, no spend estimates). Three feed orders are used:
most_impressions (top ads, offer words, reuse), newest (launches in 30 days), oldest (longest-running).
  active_total   active ads right now
  longest_days   days_running of the longest active ad
  launches_30d   active ads with start_date in the last 30 days
  reuse          active ads Atria marks as creative duplicates (re-launched winners), in the top-impression sample
  offer          intro-offer words seen in active ad bodies (%, off, free, trial, quiz)
  verdict        FOLLOW (3+ strong) · WATCH (2) · SKIP (0–1)

Thresholds (edit STRONG below to fit the category):
  active_total >= 50 · longest_days >= 90 · launches_30d >= 10 · reuse >= 5 · offer >= 3
Cost: about 6 to 8 Atria calls per brand. 30 brands is a few minutes with the rate-limit pauses.
"""
import argparse, json, os, re, sys, time, datetime as dt
from collections import Counter

try:
    import requests
except ImportError:
    sys.exit("pip3 install requests python-dotenv  (use --break-system-packages on Homebrew python)")

try:
    from dotenv import load_dotenv
    here = os.path.abspath(os.getcwd())
    for _ in range(7):
        env = os.path.join(here, ".env")
        if os.path.exists(env):
            load_dotenv(env); break
        here = os.path.dirname(here)
except ImportError:
    pass

KEY = os.environ.get("ATRIA_API_KEY")
if not KEY:
    sys.exit("ATRIA_API_KEY not found in .env or environment")
H = {"X-API-Key": KEY}
B = "https://api.tryatria.com/open/v1"
STRONG = dict(active_total=50, longest_days=90, launches_30d=10, reuse=5, offer=3)
OFFER_RX = re.compile(r"(\d{2}% ?off|% off|free (shipping|trial|gift)|buy \d get|bogo|quiz|first[- ]time|intro(ductory)? (offer|price)|money[- ]back|save \$?\d)", re.I)


def get(path, params, tries=5):
    for i in range(tries):
        r = requests.get(B + path, headers=H, params=params, timeout=60)
        if r.status_code == 429:
            time.sleep(20); continue
        r.raise_for_status()
        return r.json().get("data") or {}
    raise RuntimeError(f"429 persisted on {path}")


def search_brand(name):
    items = get("/brand-library/search", {"keyword": name, "page_size": 8}).get("items", [])
    want = name.lower().strip()
    exact = [i for i in items if i.get("name", "").lower().strip() == want]
    close = [i for i in items if want in i.get("name", "").lower()]
    if exact or close:
        return (exact or close)[:1]
    # no name match: do not guess. Report what Atria returned so the user can pick.
    return [dict(_candidates=[i.get("name") for i in items[:6]])]


def brand_ads(bid, status="active", pages=2, order="most_impressions", stop=None):
    out, cur, total = [], None, None
    for _ in range(pages):
        p = {"status": status, "page_size": 50, "order": order}
        if cur: p["cursor"] = cur
        d = get(f"/brand-library/{bid}/ads", p)
        items = d.get("items", []); out += items; cur = d.get("cursor"); total = d.get("total", total)
        time.sleep(0.8)
        if not cur or len(items) < 50: break
        if stop and items and stop(items[-1]): break
    return out, total


def parse_date(s):
    if not s: return None
    try: return dt.datetime.fromisoformat(str(s).replace("Z", "+00:00")).replace(tzinfo=None)
    except Exception: pass
    try: return dt.datetime.utcfromtimestamp(int(s))
    except Exception: return None


def age_days(a, now):
    d = parse_date(a.get("start_date"))
    return (now - d).days if d else 10**6


def score(name):
    hits = search_brand(name)
    if not hits or "_candidates" in hits[0]:
        cands = hits[0]["_candidates"] if hits else []
        return dict(name=name, found=False, error=("no name match; Atria offered: " + ", ".join(cands)) if cands else "no results")
    b = hits[0]; bid = b["id"]
    now = dt.datetime.now(dt.timezone.utc).replace(tzinfo=None)
    act, total = brand_ads(bid, "active", 1, "most_impressions")
    newest, _ = brand_ads(bid, "active", 4, "newest", stop=lambda a: age_days(a, now) > 30)
    oldest, _ = brand_ads(bid, "active", 1, "oldest")
    longest = max([a.get("days_running") or 0 for a in (oldest[:5] + act)] or [0])
    launches = sum(1 for a in newest if age_days(a, now) <= 30)
    if len(newest) >= 200 and launches >= 200: launches = f"{launches}+"
    reuse = sum(1 for a in act if (a.get("creative_duplicates") or 0) > 0)
    offer = sum(1 for a in act if OFFER_RX.search((a.get("body") or "") + " " + (a.get("title") or "")))
    fmts = Counter(a.get("media_format") for a in act)
    top = sorted(oldest[:5] + act, key=lambda a: -(a.get("days_running") or 0))[:3]
    sig = dict(active_total=total if total is not None else len(act), longest_days=longest,
               launches_30d=launches, reuse=reuse, offer=offer)
    def num(x):
        try: return int(str(x).rstrip("+"))
        except Exception: return 0
    strong = [k for k, v in STRONG.items() if num(sig[k]) >= v]
    verdict = "FOLLOW" if len(strong) >= 3 else "WATCH" if len(strong) == 2 else "SKIP"
    return dict(name=b.get("name", name), atria_id=bid, found=True, lifetime_ads=b.get("ad_num"),
                website=b.get("website"), industries=b.get("industries"), **sig,
                strong=strong, verdict=verdict, formats=dict(fmts),
                longest_ads=[dict(days=a.get("days_running"), title=(a.get("title") or "")[:90],
                                  hook=(a.get("body") or "")[:160].replace("\n", " "), link=a.get("link_url")) for a in top])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--names", nargs="*", default=[])
    ap.add_argument("--file")
    ap.add_argument("--out", default="competitor-sheet.md")
    ap.add_argument("--json")
    a = ap.parse_args()
    names = list(a.names)
    if a.file:
        names += [l.strip() for l in open(a.file) if l.strip() and not l.startswith("#")]
    if not names: sys.exit("no brand names given")
    rows = []
    for n in names:
        try:
            r = score(n); rows.append(r)
            print(f"{r.get('name', n):<34} {r.get('verdict', 'NOT FOUND'):<9} active={r.get('active_total')} longest={r.get('longest_days')}d launches30={r.get('launches_30d')} reuse={r.get('reuse')} offer={r.get('offer')}", flush=True)
        except Exception as e:
            rows.append(dict(name=n, found=False, error=str(e))); print(n, "ERR", e, flush=True)
        time.sleep(1.0)
    order = {"FOLLOW": 0, "WATCH": 1, "SKIP": 2}
    rows.sort(key=lambda r: (order.get(r.get("verdict"), 3), -(r.get("active_total") or 0)))
    for target in [a.out, a.json]:
        if target and os.path.dirname(target): os.makedirs(os.path.dirname(target), exist_ok=True)
    with open(a.out, "w") as f:
        f.write(f"# Competitor sheet ({dt.date.today()})\n\nVerdict: FOLLOW = 3+ strong signals · WATCH = 2 · SKIP = 0–1. Thresholds: {STRONG}\n\n")
        f.write("| Brand | Verdict | Active | Longest (d) | Launches 30d | Reuse | Offer | Strong on | Longest-running ad |\n|---|---|---|---|---|---|---|---|---|\n")
        for r in rows:
            if not r.get("found"):
                f.write(f"| {r['name']} | NOT FOUND | | | | | | | {r.get('error', '')} |\n"); continue
            la = r["longest_ads"][0] if r["longest_ads"] else {}
            f.write(f"| {r['name']} | {r['verdict']} | {r['active_total']} | {r['longest_days']} | {r['launches_30d']} | {r['reuse']} | {r['offer']} | {', '.join(r['strong'])} | {la.get('days', '')}d: {la.get('hook', '')[:100]} |\n")
        f.write("\n## Fill in by hand\n\nFor every FOLLOW: UMP (the mechanism they sell) · offer · persona pages · why it matters · what to steal · Amazon review count.\n")
    if a.json: json.dump(rows, open(a.json, "w"), indent=1)
    print("wrote", a.out)


if __name__ == "__main__":
    main()
