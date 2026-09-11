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
        return "https://spankbang.com";
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

    function parseBlock(block) {
        try {
            const linkEl = block.querySelector("a.thumb, a");
            if (!linkEl) return null;
            const href = linkEl.getAttribute("href");
            if (!href) return null;
            const fullUrl = fixUrl(href);

            const img = block.querySelector("a.thumb picture img, img");
            const title = (img?.getAttribute("alt") || block.querySelector(".n, .title")?.textContent || "").trim();

            let posterUrl = "";
            if (img) {
                posterUrl = img.getAttribute("data-src") || img.getAttribute("src") || "";
            }
            posterUrl = fixUrl(posterUrl);

            return createItem({
                title: title || "Video",
                url: fullUrl,
                posterUrl,
                type: "movie",
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
                { name: "Trending", path: "/trending_videos/1" },
                { name: "Indian", path: "/s/indian/1/?o=all" },
                { name: "New Videos", path: "/new_videos/1" },
                { name: "Family XXX", path: "/j2/channel/familyxxx/1" },
                { name: "Brazzers", path: "/ho/channel/brazzers/1" },
                { name: "Japan HDV", path: "/k5/channel/japan+hdv/1" }
            ];

            const homeData = {};
            await Promise.all(sections.map(async (sec) => {
                try {
                    const res = await http_get(`${getBaseUrl()}${sec.path}`, { headers: DEFAULT_HEADERS });
                    if (!res || !res.body) return;
                    const doc = await parseHtml(res.body);
                    const blocks = Array.from(doc.querySelectorAll("div.video-item"));
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
            const searchUrl = `${getBaseUrl()}/s/${encoded}/1/?o=all`;
            const res = await http_get(searchUrl, { headers: DEFAULT_HEADERS });
            if (!res || !res.body) {
                return cb({ success: false, errorCode: "EMPTY_SEARCH", message: "No data received" });
            }
            const doc = await parseHtml(res.body);
            const blocks = Array.from(doc.querySelectorAll("div.video-item"));
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

            const title = doc.querySelector("meta[property='og:title']")?.getAttribute("content") ||
                doc.querySelector("h1")?.textContent || "Video";

            const metaPoster = doc.querySelector("meta[property='og:image']")?.getAttribute("content");
            const posterUrl = fixUrl(metaPoster);

            const metaDesc = doc.querySelector("meta[property='og:description']")?.getAttribute("content") || "";

            cb({
                success: true,
                data: createItem({
                    title: title.trim(),
                    url,
                    posterUrl,
                    type: "movie",
                    description: metaDesc.trim(),
                    isAdult: false,
                    episodes: [
                        createEpisode({
                            name: title.trim() || "Play Video",
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
            const doc = await parseHtml(html);

            const streams = [];

            // 1. Direct video source or container
            const videoSources = Array.from(doc.querySelectorAll("div#video_container video source, video source, video"));
            for (const v of videoSources) {
                const src = v.getAttribute("src");
                if (src) {
                    streams.push(createStream({
                        url: fixUrl(src),
                        source: "Spankbang · Video Stream",
                        headers: {
                            "Referer": url,
                            "User-Agent": DEFAULT_HEADERS["User-Agent"]
                        }
                    }));
                }
            }

            // 2. Stream url in script/json stream_data
            const streamDataMatch = html.match(/var\s+stream_data\s*=\s*(\{.*?\});/s);
            if (streamDataMatch) {
                try {
                    const data = JSON.parse(streamDataMatch[1]);
                    for (const [qual, linkList] of Object.entries(data)) {
                        if (Array.isArray(linkList)) {
                            linkList.forEach(l => {
                                if (l) {
                                    streams.push(createStream({
                                        url: fixUrl(l),
                                        source: `Spankbang · ${qual}`,
                                        headers: {
                                            "Referer": url,
                                            "User-Agent": DEFAULT_HEADERS["User-Agent"]
                                        }
                                    }));
                                }
                            });
                        } else if (typeof linkList === "string" && linkList) {
                            streams.push(createStream({
                                url: fixUrl(linkList),
                                source: `Spankbang · ${qual}`,
                                headers: {
                                    "Referer": url,
                                    "User-Agent": DEFAULT_HEADERS["User-Agent"]
                                }
                            }));
                        }
                    }
                } catch (_) { }
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
