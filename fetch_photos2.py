# -*- coding: utf-8 -*-
"""补抓/替换质量不佳的地标照片。"""
import json, os, re, time, urllib.parse, urllib.request

BASE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(BASE, "public", "img")
UA = "weather3d/1.0 (contact: local demo; educational)"

WANT = {
    "guangzhou": (["Canton Tower"], ["canton", "tower"]),
    "shenzhen":  (["Ping An Finance Center Shenzhen", "Shenzhen skyline"], ["ping", "shenzhen"]),
    "chengdu":   (["Chengdu skyline", "Chengdu city"], ["chengdu"]),
    "chongqing": (["Hongyadong night", "Chongqing Hongyadong"], ["hongya", "chongqing"]),
    "lasa":      (["Potala Palace", "Potala Palace Lhasa"], ["potala"]),
    "changsha":  (["Changsha skyline", "Changsha city"], ["changsha"]),
    "lanzhou":   (["Zhongshan Bridge Lanzhou", "Lanzhou bridge"], ["bridge", "lanzhou"]),
    "nanjing":   (["Confucius Temple Nanjing", "Fuzimiao"], ["fuzi", "nanjing", "confucius"]),
}


def api(params):
    url = "https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=50) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception as e:
            time.sleep(6 * (attempt + 1))
    return {}


def candidates(term):
    data = api({
        "action": "query", "format": "json", "generator": "search",
        "gsrsearch": term, "gsrlimit": 8, "gsrnamespace": 6,
        "prop": "imageinfo", "iiprop": "url|size|extmetadata", "iiurlwidth": 1200,
    })
    pages = (data.get("query") or {}).get("pages") or {}
    out = []
    for p in pages.values():
        info = (p.get("imageinfo") or [{}])[0]
        url = info.get("thumburl") or info.get("url")
        title = p.get("title", "")
        if not url or not re.search(r"\.(jpe?g)$", title, re.I):
            continue
        meta = info.get("extmetadata") or {}
        out.append({
            "title": title, "url": url, "w": info.get("width") or 0, "h": info.get("height") or 0,
            "license": (meta.get("LicenseShortName") or {}).get("value", ""),
            "artist": re.sub(r"<[^>]+>", "", (meta.get("Artist") or {}).get("value", "")).strip(),
        })
    return out


def score(item, keys):
    t = item["title"].lower()
    s = sum(3 for k in keys if k in t)
    if item["w"] >= 1200:
        s += 1
    if item["h"] > item["w"]:
        s -= 2  # 竖图裁切损失大
    return s


def download(url, path):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=90) as r:
        data = r.read()
    if len(data) < 40000:
        raise ValueError("small")
    open(path, "wb").write(data)
    return len(data)


credits = {}
cp = os.path.join(OUT, "credits.json")
if os.path.exists(cp):
    credits = json.load(open(cp, encoding="utf-8"))

for cid, (terms, keys) in WANT.items():
    best = None
    for t in terms:
        cands = candidates(t)
        cands.sort(key=lambda it: score(it, keys), reverse=True)
        if cands and score(cands[0], keys) >= 3:
            best = cands[0]
            break
        time.sleep(3)
    if not best:
        print("MISS", cid)
        continue
    dst = os.path.join(OUT, cid + ".jpg")
    try:
        n = download(best["url"], dst)
        credits[cid] = {"title": best["title"], "license": best["license"], "artist": best["artist"]}
        print("ok", cid, n, best["title"][:70])
    except Exception as e:
        print("dl fail", cid, e)
    time.sleep(3)

json.dump(credits, open(cp, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("done", len(credits))
