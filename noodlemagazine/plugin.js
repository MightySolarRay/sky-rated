(function () {
    const DEFAULT_HEADERS = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9"
    };

    function fixUrl(url) {
        if (!url) return "";
        if (url.startsWith("//")) return "https:" + url;
        if (url.startsWith("/")) return manifest.baseUrl + url;
        return url;
    }

    function parseBlock(block) {
        try {
            const linkEl = block.querySelector("a");
            if (!linkEl) return null;
            const href = linkEl.getAttribute("href");
            if (!href) return null;
            const fullUrl = fixUrl(href);

            const titleEl = block.querySelector("div.title, div.title a, a");
            const img = block.querySelector("img");
            const title = (titleEl ? titleEl.textContent : img?.getAttribute("alt") || "Video").trim();

            let posterUrl = "";
            if (img) {
                posterUrl = img.getAttribute("data-src") || img.getAttribute("src") || "";
            }
            posterUrl = fixUrl(posterUrl);

            return new MultimediaItem({
                title,
                url: fullUrl,
                posterUrl,
                type: "movie",
                isAdult: false,
                                headers: { "Referer": `${manifest.baseUrl}/` }
            });
        } catch (e) {
            return null;
        }
    }

    async function getHome(cb) {
        try {
            const sections = [
                { name: "Trending", path: "/video/" },
                { name: "Popular", path: "/video/?p=1" },
                { name: "Top", path: "/video/?p=2" }
            ];

            const homeData = {};
            await Promise.all(sections.map(async (sec) => {
                try {
                    const res = await http_get(`${manifest.baseUrl}${sec.path}`, { headers: DEFAULT_HEADERS });
                    if (!res || !res.body) return;
                    const doc = await parseHtml(res.body);
                    const blocks = Array.from(doc.querySelectorAll("div.item"));
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
            const q = encodeURIComponent(query.trim().replace(/\s+/g, "-"));
            const searchUrl = `${manifest.baseUrl}/video/${q}`;
            const res = await http_get(searchUrl, { headers: DEFAULT_HEADERS });
            if (!res || !res.body) {
                return cb({ success: false, errorCode: "EMPTY_SEARCH", message: "No data received" });
            }
            const doc = await parseHtml(res.body);
            const blocks = Array.from(doc.querySelectorAll("div.item"));
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

            const title = doc.querySelector("h1")?.textContent?.trim() || "Video";
            const poster = fixUrl(doc.querySelector("meta[property='og:image']")?.getAttribute("content") || "");
            const desc = doc.querySelector("meta[property='og:description']")?.getAttribute("content") || "";
            const recs = Array.from(doc.querySelectorAll("div.item")).map(parseBlock).filter(Boolean).slice(0, 10);

            cb({
                success: true,
                data: new MultimediaItem({
                    title,
                    url,
                    posterUrl: poster,
                    type: "movie",
                    description: desc.trim(),
                    recommendations: recs,
                    isAdult: false,
                    episodes: [
                        new Episode({
                            name: title || "Play Video",
                            url: url,
                            season: 1,
                            episode: 1,
                            posterUrl: poster || ""
                        })
                    ],
                                        headers: { "Referer": `${manifest.baseUrl}/` }
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

            // Match window.playlist = { ... sources: [ ... ] }
            const playlistMatch = html.match(/window\.playlist\s*=\s*(\{.*?\});/s);
            if (playlistMatch && playlistMatch[1]) {
                try {
                    const playlist = JSON.parse(playlistMatch[1]);
                    if (playlist && Array.isArray(playlist.sources)) {
                        playlist.sources.forEach(s => {
                            if (s.file) {
                                streams.push(new StreamResult({
                                    url: fixUrl(s.file),
                                    source: `NoodleMagazine · ${s.label || "Direct"}`,
                                    headers: {
                                        "Referer": `${manifest.baseUrl}/`,
                                        "User-Agent": DEFAULT_HEADERS["User-Agent"]
                                    }
                                }));
                            }
                        });
                    }
                } catch (_) { }
            }

            // Fallback direct video elements
            const doc = await parseHtml(html);
            const videoSources = Array.from(doc.querySelectorAll("video source, video"));
            for (const v of videoSources) {
                const src = v.getAttribute("src");
                if (src) {
                    streams.push(new StreamResult({
                        url: fixUrl(src),
                        source: "NoodleMagazine · Direct Video",
                        headers: { "Referer": `${manifest.baseUrl}/` }
                    }));
                }
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
