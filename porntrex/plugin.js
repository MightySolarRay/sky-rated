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
        return "https://www.porntrex.com";
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

            const titleEl = block.querySelector("p.inf a, .title a, a.thumb");
            const title = (titleEl ? (titleEl.textContent || titleEl.getAttribute("title")) : "Video").trim();

            const img = block.querySelector("img.cover, img");
            let posterUrl = "";
            if (img) {
                posterUrl = img.getAttribute("data-src") || img.getAttribute("src") || "";
            }
            posterUrl = fixUrl(posterUrl);

            return createItem({
                title,
                url: fullUrl,
                posterUrl,
                type: "movie",
                isAdult: false,
                                headers: { "Referer": `${getBaseUrl()}/` }
            });
        } catch (e) {
            return null;
        }
    }

    async function getHome(cb) {
        try {
            const sections = [
                { name: "Trending", path: "/" },
                { name: "4K Porn", path: "/categories/4k-porn/" },
                { name: "Amateur", path: "/categories/amateur/" },
                { name: "Asian", path: "/categories/asian/" },
                { name: "Milf", path: "/categories/milf/" },
                { name: "Busty", path: "/categories/busty/" }
            ];

            const homeData = {};
            await Promise.all(sections.map(async (sec) => {
                try {
                    const res = await http_get(`${getBaseUrl()}${sec.path}`, { headers: DEFAULT_HEADERS });
                    if (!res || !res.body) return;
                    const doc = await parseHtml(res.body);
                    const blocks = Array.from(doc.querySelectorAll("div.video-preview-screen.video-item, div.video-item"));
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
            const cleanQuery = encodeURIComponent(query.trim().replace(/\s+/g, "-"));
            const searchUrl = `${getBaseUrl()}/search/${cleanQuery}/`;
            const res = await http_get(searchUrl, { headers: DEFAULT_HEADERS });
            if (!res || !res.body) {
                return cb({ success: false, errorCode: "EMPTY_SEARCH", message: "No data received" });
            }
            const doc = await parseHtml(res.body);
            const blocks = Array.from(doc.querySelectorAll("div.video-preview-screen.video-item, div.video-item"));
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

            const title = doc.querySelector("p.title-video, h1")?.textContent?.trim() || "Video";
            const poster = fixUrl(doc.querySelector("#tab_screenshots img.thumb, meta[property='og:image']")?.getAttribute("data-src") ||
                doc.querySelector("meta[property='og:image']")?.getAttribute("content") || "");
            const desc = doc.querySelector("div.videodesc em.des-link, meta[property='og:description']")?.textContent?.trim() || "";
            const tags = Array.from(doc.querySelectorAll("div.js-categories a.js-cat, div.items-holder a")).map(el => el.textContent.trim()).filter(Boolean);

            cb({
                success: true,
                data: createItem({
                    title,
                    url,
                    posterUrl: poster,
                    type: "movie",
                    description: desc,
                    tags,
                    isAdult: false,
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
            const res = await http_get(url, { headers: DEFAULT_HEADERS });
            if (!res || !res.body) {
                return cb({ success: false, errorCode: "STREAM_ERROR", message: "Failed to load video page" });
            }
            const html = res.body;

            const streams = [];

            // Match video_url: '...'
            const videoUrlMatch = html.match(/video_url:\s*'([^']+)'/i);
            if (videoUrlMatch && videoUrlMatch[1]) {
                streams.push(createStream({
                    url: fixUrl(videoUrlMatch[1]),
                    source: "Porntrex · Direct Video",
                    headers: {
                        "Referer": `${getBaseUrl()}/`,
                        "User-Agent": DEFAULT_HEADERS["User-Agent"]
                    }
                }));
            }

            // Fallback check video elements
            const doc = await parseHtml(html);
            const videoSources = Array.from(doc.querySelectorAll("video source, video"));
            for (const v of videoSources) {
                const src = v.getAttribute("src");
                if (src) {
                    streams.push(createStream({
                        url: fixUrl(src),
                        source: "Porntrex · Video Stream",
                        headers: {
                            "Referer": `${getBaseUrl()}/`,
                            "User-Agent": DEFAULT_HEADERS["User-Agent"]
                        }
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
