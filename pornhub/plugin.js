(function () {
    const DEFAULT_HEADERS = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Cookie": "hasVisited=1; accessAgeDisclaimerPH=1"
    };


    function getBaseUrl() {
        if (typeof manifest !== "undefined" && manifest && manifest.baseUrl) {
            return manifest.baseUrl.replace(/\/+$/, "");
        }
        return "https://www.pornhub.com";
    }

    function createItem(s) {
        try { return new MultimediaItem(s); } catch (e) { return s; }
    }
    function createEpisode(s) {
        try { return new Episode(s); } catch (e) { return s; }
    }
    function createStream(s) {
        try { return new StreamResult(s); } catch (e) { return s; }
    }

    function fixUrl(url) {
        if (!url) return "";
        if (url.startsWith("//")) return "https:" + url;
        if (url.startsWith("/")) return getBaseUrl() + url;
        return url;
    }

    function parseItem(elem) {
        try {
            const link = elem.querySelector("a.thumbnailTitle") || elem.querySelector("a[href*='view_video.php']");
            if (!link) return null;
            const rawHref = link.getAttribute("href");
            if (!rawHref) return null;
            const fullUrl = fixUrl(rawHref);

            const img = elem.querySelector("img");
            const title = (link.getAttribute("data-title") || (img ? img.getAttribute("alt") : "") || link.textContent || "").trim();
            if (!title || /^\d+:\d+$/.test(title)) return null;

            let poster = "";
            if (img) {
                const med = img.getAttribute("data-mediumthumb");
                const src = img.getAttribute("src");
                poster = (med && !med.includes("data:image")) ? med : (src && !src.includes("data:image") ? src : "");
            }
            poster = fixUrl(poster);

            const durEl = elem.querySelector("var.duration");
            let duration = 0;
            if (durEl) {
                const parts = durEl.textContent.trim().split(":");
                if (parts.length === 2) duration = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
            }

            return createItem({
                title,
                url: fullUrl,
                posterUrl: poster,
                type: "movie",
                duration,
                isAdult: false,
                                headers: { "Referer": `${getBaseUrl()}/` }
            });
        } catch (e) {
            return null;
        }
    }

    async function getHome(cb) {
        try {
            const categories = [
                { name: "Trending", path: "/video" },
                { name: "HD Porn", path: "/hd" },
                { name: "18-25", path: "/categories/teen" },
                { name: "Amateur", path: "/video?c=3" },
                { name: "Anal", path: "/video?c=35" },
                { name: "Asian", path: "/video?c=1" },
                { name: "Big Ass", path: "/video?c=4" },
                { name: "Blonde", path: "/video?c=9" },
                { name: "Brunette", path: "/video?c=11" },
                { name: "MILF", path: "/video?c=29" },
                { name: "Mature", path: "/video?c=28" },
                { name: "Ebony", path: "/video?c=17" }
            ];

            const homeData = {};
            await Promise.all(categories.map(async (cat) => {
                try {
                    const res = await http_get(`${getBaseUrl()}${cat.path}`, { headers: DEFAULT_HEADERS });
                    if (!res || !res.body) return;
                    const doc = await parseHtml(res.body);
                    const blocks = Array.from(doc.querySelectorAll("ul#videoSearchResult li.pcVideoListItem, div.gridWrapper li.pcVideoListItem"));
                    const items = blocks.map(parseItem).filter(Boolean).slice(0, 16);
                    if (items.length > 0) {
                        homeData[cat.name] = items;
                    }
                } catch (_) { }
            }));

            cb({ success: true, data: homeData });
        } catch (e) {
            cb({ success: false, errorCode: "HOME_ERROR", message: String(e) });
        }
    }

    async function search(query, cb) {
        try {
            const searchUrl = `${getBaseUrl()}/video/search?search=${encodeURIComponent(query)}`;
            const res = await http_get(searchUrl, { headers: DEFAULT_HEADERS });
            if (!res || !res.body) {
                return cb({ success: false, errorCode: "EMPTY_SEARCH", message: "No response received" });
            }
            const doc = await parseHtml(res.body);
            const blocks = Array.from(doc.querySelectorAll("div.gridWrapper li.pcVideoListItem, ul#videoSearchResult li.pcVideoListItem"));
            const items = blocks.map(parseItem).filter(Boolean);
            cb({ success: true, data: items });
        } catch (e) {
            cb({ success: false, errorCode: "SEARCH_ERROR", message: String(e) });
        }
    }

    async function load(url, cb) {
        try {
            const res = await http_get(url, { headers: { ...DEFAULT_HEADERS, "Referer": url } });
            if (!res || !res.body) {
                return cb({ success: false, errorCode: "LOAD_ERROR", message: "Failed to load page" });
            }
            const doc = await parseHtml(res.body);

            const titleEl = doc.querySelector("h1");
            const title = titleEl ? titleEl.textContent.trim() : "Video";

            let poster = "";
            const noscriptTag = doc.querySelector("noscript:has(img.videoElementPoster)");
            if (noscriptTag) {
                const subDoc = await parseHtml(noscriptTag.innerHTML || noscriptTag.textContent);
                poster = subDoc.querySelector("img")?.getAttribute("src") || "";
            } else {
                poster = doc.querySelector("img.videoElementPoster")?.getAttribute("src") || "";
            }
            poster = fixUrl(poster);

            const desc = doc.querySelector("meta[property='og:description']")?.getAttribute("content") || "";
            const tags = Array.from(doc.querySelectorAll("div.tagsWrapper a")).map(el => el.textContent.trim()).filter(Boolean);

            const durEl = doc.querySelector("var.duration");
            let duration = 0;
            if (durEl) {
                const parts = durEl.textContent.trim().split(":");
                if (parts.length === 2) duration = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
            }

            const actors = Array.from(doc.querySelectorAll("a.pstar-list-btn")).map(el => new Actor({ name: el.textContent.trim() }));
            const recs = Array.from(doc.querySelectorAll("li.pcVideoListItem")).map(parseItem).filter(Boolean).slice(0, 10);

            cb({
                success: true,
                data: createItem({
                    title,
                    url,
                    posterUrl: poster,
                    type: "movie",
                    description: desc.trim(),
                    tags,
                    duration,
                    isAdult: false,
                                        cast: actors,
                    recommendations: recs,
                    episodes: [
                        createEpisode({
                            name: title || "Play Video",
                            url: url,
                            season: 1,
                            episode: 1,
                            posterUrl: poster || ""
                        })
                    ],
                    headers: { "Referer": `${getBaseUrl()}/` }
                })
            });
        } catch (e) {
            cb({ success: false, errorCode: "LOAD_ERROR", message: String(e) });
        }
    }

    async function loadStreams(url, cb) {
        try {
            const res = await http_get(url, { headers: { ...DEFAULT_HEADERS, "Referer": `${getBaseUrl()}/` } });
            if (!res || !res.body) {
                return cb({ success: false, errorCode: "STREAM_ERROR", message: "Failed to load page" });
            }

            const flashvarsMatch = res.body.match(/var\s+flashvars_\d+\s*=\s*(\{.*?\});/s) || res.body.match(/var\s+flashvars\s*=\s*(\{.*?\});/s);
            if (!flashvarsMatch || !flashvarsMatch[1]) {
                return cb({ success: false, errorCode: "NO_FLASHVARS", message: "Could not locate flashvars" });
            }

            let flashData;
            try {
                flashData = JSON.parse(flashvarsMatch[1]);
            } catch (err) {
                return cb({ success: false, errorCode: "JSON_PARSE_ERROR", message: "Failed to parse flashvars" });
            }

            const mediaDefinitions = flashData.mediaDefinitions || [];
            const streams = [];

            mediaDefinitions.forEach(item => {
                if (item.videoUrl) {
                    const quality = String(item.quality || "Auto");
                    const format = String(item.format || "").toLowerCase();
                    streams.push(createStream({
                        url: item.videoUrl,
                        source: `PornHub · ${quality.toUpperCase()} (${format.toUpperCase()})`,
                        headers: {
                            "Referer": `${getBaseUrl()}/`,
                            "User-Agent": DEFAULT_HEADERS["User-Agent"]
                        }
                    }));
                }
            });

            if (streams.length === 0) {
                return cb({ success: false, errorCode: "NO_STREAMS", message: "No streams detected in mediaDefinitions" });
            }

            cb({ success: true, data: streams });
        } catch (e) {
            cb({ success: false, errorCode: "STREAM_ERROR", message: String(e) });
        }
    }

    globalThis.getHome = getHome;
    globalThis.search = search;
    globalThis.load = load;
    globalThis.loadStreams = loadStreams;
})();
