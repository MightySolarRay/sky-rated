(function () {
    const DEFAULT_HEADERS = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    };


    function getBaseUrl() {
        if (typeof manifest !== "undefined" && manifest && manifest.baseUrl) {
            return manifest.baseUrl.replace(/\/+$/, "");
        }
        return "https://missav.live";
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
            const link = elem.querySelector("a[href*='/en/'], a[href*='/dm'], a.text-secondary");
            if (!link) return null;
            const fullUrl = fixUrl(link.getAttribute("href"));

            const titleEl = elem.querySelector("div.my-2 a, div.title a, a.text-secondary");
            let title = (titleEl ? titleEl.textContent : link.textContent || "").trim();
            if (!title) return null;

            const blacklist = ["Recent update", "Contact", "Support", "DMCA", "Home"];
            if (blacklist.some(b => title.toLowerCase() === b.toLowerCase())) return null;

            const isUncensored = /uncensored[-_ ]?leak/i.test(elem.innerHTML);
            if (isUncensored && !title.toLowerCase().startsWith("uncensored")) {
                title = `Uncensored - ${title}`;
            }

            const img = elem.querySelector("img");
            const posterUrl = img ? fixUrl(img.getAttribute("data-src") || img.getAttribute("src")) : "";

            return createItem({
                title,
                url: fullUrl,
                posterUrl,
                type: "movie",
                isAdult: false,
                                headers: { "Referer": getBaseUrl() }
            });
        } catch (_) {
            return null;
        }
    }

    async function getHome(cb) {
        try {
            const categories = [
                { name: "Trending", path: "/dm169/en/weekly-hot?sort=weekly_views" },
                { name: "Monthly Hot", path: "/dm263/en/monthly-hot?sort=views" },
                { name: "Newly Added", path: "/en/new?sort=published_at" },
                { name: "English Subtitles", path: "/en/english-subtitle" },
                { name: "Uncensored Leak", path: "/dm628/en/uncensored-leak" },
                { name: "FC2", path: "/dm150/en/fc2" },
                { name: "Tokyo Hot", path: "/dm29/en/tokyohot" },
                { name: "HEYZO", path: "/dm1198483/en/heyzo" },
                { name: "Caribbeancom", path: "/dm3959622/en/caribbeancom" }
            ];

            const homeData = {};
            await Promise.all(categories.map(async (cat) => {
                try {
                    const res = await http_get(`${getBaseUrl()}${cat.path}`, { headers: DEFAULT_HEADERS });
                    if (!res || !res.body) return;
                    const doc = await parseHtml(res.body);
                    const blocks = Array.from(doc.querySelectorAll("div.grid.grid-cols-2 > div, div.thumbnail.group"));
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
            const searchUrl = `${getBaseUrl()}/en/search/${encodeURIComponent(query)}`;
            const res = await http_get(searchUrl, { headers: DEFAULT_HEADERS });
            if (!res || !res.body) {
                return cb({ success: false, errorCode: "EMPTY_SEARCH", message: "No data received" });
            }
            const doc = await parseHtml(res.body);
            const blocks = Array.from(doc.querySelectorAll("div.grid.grid-cols-2 > div, div.thumbnail.group"));
            const items = blocks.map(parseItem).filter(Boolean);
            cb({ success: true, data: items });
        } catch (e) {
            cb({ success: false, errorCode: "SEARCH_ERROR", message: String(e) });
        }
    }

    async function load(url, cb) {
        try {
            const res = await http_get(url, { headers: DEFAULT_HEADERS });
            if (!res || !res.body) {
                return cb({ success: false, errorCode: "LOAD_ERROR", message: "Failed to load page" });
            }
            const doc = await parseHtml(res.body);

            const titleEl = doc.querySelector("h1.text-base") || doc.querySelector("h1") || doc.querySelector("meta[property='og:title']");
            const title = (titleEl ? (titleEl.textContent || titleEl.getAttribute("content")) : "MissAV Video").trim();

            const posterUrl = fixUrl(doc.querySelector("meta[property='og:image']")?.getAttribute("content"));
            const desc = doc.querySelector("meta[name='description']")?.getAttribute("content") || "";

            const tags = Array.from(doc.querySelectorAll("div.space-y-2 a[href*='/genres/'], div.space-y-2 a[href*='/tags/']")).map(el => el.textContent.trim());

            const actors = Array.from(doc.querySelectorAll("div.space-y-2 a[href*='/actresses/']")).map(el => new Actor({ name: el.textContent.trim() }));

            const recs = Array.from(doc.querySelectorAll("div.grid.grid-cols-2 > div, div.thumbnail.group")).map(parseItem).filter(Boolean).slice(0, 10);

            cb({
                success: true,
                data: createItem({
                    title,
                    url,
                    posterUrl,
                    type: "movie",
                    description: desc.trim(),
                    tags,
                    isAdult: false,
                                        cast: actors,
                    recommendations: recs,
                    episodes: [
                        createEpisode({
                            name: title || "Play Video",
                            url: url,
                            season: 1,
                            episode: 1,
                            posterUrl: posterUrl || ""
                        })
                    ],
                    headers: { "Referer": getBaseUrl() }
                })
            });
        } catch (e) {
            cb({ success: false, errorCode: "LOAD_ERROR", message: String(e) });
        }
    }

    async function loadStreams(url, cb) {
        try {
            const res = await http_get(url, { headers: { ...DEFAULT_HEADERS, "Referer": getBaseUrl() } });
            if (!res || !res.body) {
                return cb({ success: false, errorCode: "STREAM_ERROR", message: "Failed to load video page" });
            }

            const html = res.body;
            let unpacked = "";
            if (typeof getAndUnpack === "function") {
                unpacked = getAndUnpack(html);
            } else {
                unpacked = html;
            }

            const playlistIdMatch = unpacked.match(/\/([a-f0-9\-]{36})\//i) || html.match(/\/([a-f0-9\-]{36})\//i);
            if (!playlistIdMatch || !playlistIdMatch[1]) {
                return cb({ success: false, errorCode: "NO_PLAYLIST", message: "Could not find Surrit playlist ID" });
            }

            const playlistId = playlistIdMatch[1];
            const streamUrl = `https://surrit.com/${playlistId}/playlist.m3u8`;

            cb({
                success: true,
                data: [
                    createStream({
                        url: streamUrl,
                        source: "MissAV · Surrit HLS",
                        headers: {
                            "Referer": `${getBaseUrl()}/`,
                            "User-Agent": DEFAULT_HEADERS["User-Agent"]
                        }
                    })
                ]
            });
        } catch (e) {
            cb({ success: false, errorCode: "STREAM_ERROR", message: String(e) });
        }
    }

    globalThis.getHome = getHome;
    globalThis.search = search;
    globalThis.load = load;
    globalThis.loadStreams = loadStreams;
})();
