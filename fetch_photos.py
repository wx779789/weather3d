# -*- coding: utf-8 -*-
"""从 Wikimedia Commons 抓取各城市地标照片（自由许可），用于城市选择卡片海报。"""
import json, os, re, sys, time, urllib.parse, urllib.request

BASE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(BASE, "public", "img")
os.makedirs(OUT, exist_ok=True)

UA = "weather3d/1.0 (contact: local demo; educational)"

CITIES = [
    ("beijing",   "Tiananmen gate"),
    ("shanghai",  "Oriental Pearl Tower"),
    ("guangzhou", "Canton Tower"),
    ("shenzhen",  "Ping An Finance Centre"),
    ("chengdu",   "Chengdu Tianfu Tower"),
    ("xian",      "Giant Wild Goose Pagoda"),
    ("hangzhou",  "Leifeng Pagoda"),
    ("chongqing", "Hongyadong Chongqing"),
    ("wuhan",     "Yellow Crane Tower"),
    ("haerbin",   "Saint Sophia Cathedral Harbin"),
    ("lasa",      "Potala Palace"),
    ("tianjin",   "Tianjin Eye"),
    ("nanjing",   "Fuzimiao Nanjing"),
    ("changsha",  "Changsha IFS Tower"),
    ("lanzhou",   "Zhongshan Bridge Lanzhou"),
    ("shaoxing",  "Bazi Bridge Shaoxing"),
    ("xiamen",    "Xiamen Shimao Straits Towers"),
    ("putian",    "Guanghua Temple Putian"),
]


def api(params):
    qs = urllib.parse.urlencode(params)
    url = "https://commons.wikimedia.org/w/api.php?" + qs
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=45) as r:
        return json.loads(r.read().decode("utf-8"))


def search(term):
    data = api({
        "action": "query", "format": "json", "generator": "search",
        "gsrsearch": term, "gsrlimit": 6, "gsrnamespace": 6,
        "prop": "imageinfo", "iiprop": "url|extmetadata", "iiurlwidth": 1100,
    })
    pages = (data.get("query") or {}).get("pages") or {}
    best = None
    for p in pages.values():
        info = (p.get("imageinfo") or [{}])[0]
        url = info.get("thumburl") or info.get("url")
        if not url:
            continue
        title = p.get("title", "")
        if not re.search(r"\.(jpe?g|png)$", title, re.I):
            continue
        w = info.get("thumbwidth") or info.get("width") or 0
        if w < 600:
            continue
        meta = info.get("extmetadata") or {}
        lic = (meta.get("LicenseShortName") or {}).get("value", "")
        artist = re.sub(r"<[^>]+>", "", (meta.get("Artist") or {}).get("value", "")).strip()
        best = {"title": title, "url": url, "license": lic, "artist": artist}
        break
    return best


def download(url, path):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        data = r.read()
    if len(data) < 20000:
        raise ValueError("too small %d" % len(data))
    with open(path, "wb") as f:
        f.write(data)
    return len(data)


credits = {}
for cid, term in CITIES:
    dst = os.path.join(OUT, cid + ".jpg")
    if os.path.exists(dst) and os.path.getsize(dst) > 20000:
        print("skip", cid)
        continue
    got = None
    for t in (term, term + " China", term.split()[0]):
        try:
            got = search(t)
            if got:
                break
        except Exception as e:
            print("search fail", cid, t, e)
            time.sleep(2)
    if not got:
        print("MISS", cid)
        continue
    try:
        n = download(got["url"], dst)
        credits[cid] = {k: got[k] for k in ("title", "license", "artist")}
        print("ok", cid, n, got["title"][:60])
    except Exception as e:
        print("dl fail", cid, e)

with open(os.path.join(OUT, "credits.json"), "w", encoding="utf-8") as f:
    json.dump(credits, f, ensure_ascii=False, indent=1)
print("done", len(credits))
