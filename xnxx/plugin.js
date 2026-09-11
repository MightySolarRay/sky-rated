(function () {
    const DEFAULT_HEADERS = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9"
    };


    function getBaseUrl() {
        if (typeof manifest !== "undefined" && manifest && manifest.baseUrl) {
            return manifest.baseUrl.replace(/\/+$/, "");
        }
        return "https://www.xnxx.com";
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

    function cleanHref(href) {
        if (!href) return "";
        const m = href.match(/^(\/video\-[^\/]+)\/[^\/]+\/[^\/]+\/(.+)$/);
        if (m && m.length === 3) {
            return `${m[1]}/${m[2]}`;
        }
        return href;
    }

    function parseDuration(durationStr) {
        if (!durationStr) return 0;
        let total = 0;
        const hMatch = durationStr.match(/(\d+)\s*h/i);
        const mMatch = durationStr.match(/(\d+)\s*min/i);
        if (hMatch) total += parseInt(hMatch[1], 10) * 60;
        if (mMatch) total += parseInt(mMatch[1], 10);
        return total;
    }

    function parseBlock(block) {
        try {
            const titleEl = block.querySelector("div.thumb-under p a, p.title a");
            if (!titleEl) return null;
            const title = (titleEl.getAttribute("title") || titleEl.textContent || "").trim();
            const rawHref = titleEl.getAttribute("href");
            if (!rawHref) return null;
            const fullUrl = fixUrl(cleanHref(rawHref));

            const img = block.querySelector("div.thumb img, img");
            let posterUrl = "";
            if (img) {
                const dataSrc = img.getAttribute("data-src");
                const src = img.getAttribute("src");
                posterUrl = (dataSrc && !dataSrc.includes("lightbox-blank")) ? dataSrc : (src && !src.includes("lightbox-blank") ? src : "");
            }
            posterUrl = fixUrl(posterUrl);

            const durEl = block.querySelector("span.duration, p.metadata");
            const duration = durEl ? parseDuration(durEl.textContent) : 0;

            return createItem({
                title,
                url: fullUrl,
                posterUrl,
                type: "movie",
                duration,
                isAdult: false,
                                headers: { "Referer": getBaseUrl() }
            });
        } catch (e) {
            return null;
        }
    }

    async function getHome(cb) {
        try {
            const sections = [
                { name: "Trending", path: "/" },
                { name: "Indian", path: "/search/indian" },
                { name: "Desi", path: "/search/desi" },
                { name: "Hot", path: "/hot" },
                { name: "Best", path: "/best" },
                { name: "Amateur", path: "/search/amateur" },
                { name: "Milf", path: "/search/milf" }
            ];

            const homeData = {};
            await Promise.all(sections.map(async (sec) => {
                try {
                    const res = await http_get(`${getBaseUrl()}${sec.path}`, { headers: DEFAULT_HEADERS });
                    if (!res || !res.body) return;
                    const doc = await parseHtml(res.body);
                    const blocks = Array.from(doc.querySelectorAll("div.mozaique div.thumb-block, div.thumb-block"));
                    const items = blocks.map(parseBlock).filter(Boolean).slice(0, 16);
                    if (items.length > 0) {
                        homeData[sec.name] = items;
                    }
                } catch (err) {
                }
            }));

            cb({ success: true, data: homeData });
        } catch (e) {
            cb({ success: false, errorCode: "HOME_ERROR", message: String(e) });
        }
    }

    async function search(query, cb) {
        try {
            const encoded = encodeURIComponent(query);
            const searchUrl = `${getBaseUrl()}/search/${encoded}`;
            const res = await http_get(searchUrl, { headers: DEFAULT_HEADERS });
            if (!res || !res.body) {
                return cb({ success: false, errorCode: "EMPTY_SEARCH", message: "No data received" });
            }
            const doc = await parseHtml(res.body);
            const blocks = Array.from(doc.querySelectorAll("div.mozaique div.thumb-block, div.thumb-block"));
            const items = blocks.map(parseBlock).filter(Boolean);
            cb({ success: true, data: items });
        } catch (e) {
            cb({ success: false, errorCode: "SEARCH_ERROR", message: String(e) });
        }
    }

    async function load(url, cb) {
        try {
            const res = await http_get(url, { headers: DEFAULT_HEADERS });
            if (!res || !res.body) {
                return cb({ success: false, errorCode: "LOAD_ERROR", message: "Unable to load page" });
            }
            const html = res.body;
            const doc = await parseHtml(html);

            const titleEl = doc.querySelector("h2.page-title, .video-title strong, meta[property='og:title']");
            const title = (titleEl ? (titleEl.getAttribute("content") || titleEl.textContent) : "Video").trim();

            const metaPoster = doc.querySelector("meta[property='og:image']")?.getAttribute("content");
            const posterUrl = fixUrl(metaPoster);

            const metaDesc = doc.querySelector("meta[property='og:description']")?.getAttribute("content") ||
                doc.querySelector("p.video-description")?.textContent || "";

            const tags = Array.from(doc.querySelectorAll(".metadata-row.video-tags a, div.video-tags-list a")).map(el => el.textContent.trim()).filter(Boolean);

            const recs = [];
            const relatedMatch = html.match(/var\s+video_related\s*=\s*(\[.*?\]);/s);
            if (relatedMatch) {
                try {
                    const parsedRelated = JSON.parse(relatedMatch[1]);
                    parsedRelated.slice(0, 10).forEach(item => {
                        if (item.u && (item.tf || item.t)) {
                            recs.push(createItem({
                                title: (item.tf || item.t).replace(/\\/g, ""),
                                url: fixUrl(cleanHref(item.u)),
                                posterUrl: fixUrl(item.i),
                                type: "movie",
                                isAdult: false,
                                                                headers: { "Referer": getBaseUrl() }
                            }));
                        }
                    });
                } catch (_) { }
            }

            cb({
                success: true,
                data: createItem({
                    title,
                    url,
                    posterUrl,
                    type: "movie",
                    description: metaDesc.trim(),
                    tags,
                    isAdult: false,
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
            const res = await http_get(url, { headers: DEFAULT_HEADERS });
            if (!res || !res.body) {
                return cb({ success: false, errorCode: "STREAM_ERROR", message: "Failed to load video page" });
            }
            const html = res.body;

            const streams = [];

            const hlsMatch = html.match(/html5player\.setVideoHLS\(['"]([^'"]+)['"]\)/);
            if (hlsMatch && hlsMatch[1]) {
                streams.push(createStream({
                    url: hlsMatch[1],
                    source: "XNXX · HLS Auto",
                    headers: {
                        "Referer": url,
                        "User-Agent": DEFAULT_HEADERS["User-Agent"]
                    }
                }));
            }

            const highMatch = html.match(/html5player\.setVideoUrlHigh\(['"]([^'"]+)['"]\)/);
            if (highMatch && highMatch[1]) {
                streams.push(createStream({
                    url: highMatch[1],
                    source: "XNXX · 720p / High",
                    headers: {
                        "Referer": url,
                        "User-Agent": DEFAULT_HEADERS["User-Agent"]
                    }
                }));
            }

            const lowMatch = html.match(/html5player\.setVideoUrlLow\(['"]([^'"]+)['"]\)/);
            if (lowMatch && lowMatch[1]) {
                streams.push(createStream({
                    url: lowMatch[1],
                    source: "XNXX · 360p / Low",
                    headers: {
                        "Referer": url,
                        "User-Agent": DEFAULT_HEADERS["User-Agent"]
                    }
                }));
            }

            if (streams.length === 0) {
                return cb({ success: false, errorCode: "NO_STREAMS", message: "No stream URLs detected" });
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
