(function () {
    const DEFAULT_HEADERS = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://hqporner.com/"
    };


    function getBaseUrl() {
        if (typeof manifest !== "undefined" && manifest && manifest.baseUrl) {
            return manifest.baseUrl.replace(/\/+$/, "");
        }
        return "https://hqporner.com";
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
            const linkEl = block.querySelector("a");
            if (!linkEl) return null;
            const rawHref = linkEl.getAttribute("href");
            if (!rawHref) return null;
            const fullUrl = fixUrl(rawHref);

            const img = block.querySelector("img");
            const title = (img?.getAttribute("alt") || block.querySelector(".icon-title, h3")?.textContent || "Video").trim();

            let posterUrl = "";
            if (img) {
                posterUrl = img.getAttribute("src") || img.getAttribute("data-src") || "";
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
                { name: "Trending", path: "/top" },
                { name: "Top of Month", path: "/top/month" },
                { name: "1080p Porn", path: "/category/1080p-porn" },
                { name: "4K Porn", path: "/category/4k-porn" },
                { name: "Amateur", path: "/category/amateur" },
                { name: "Asian", path: "/category/asian" }
            ];

            const homeData = {};
            await Promise.all(sections.map(async (sec) => {
                try {
                    const res = await http_get(`${getBaseUrl()}${sec.path}/1`, { headers: DEFAULT_HEADERS });
                    if (!res || !res.body) return;
                    const doc = await parseHtml(res.body);
                    const blocks = Array.from(doc.querySelectorAll("div.row section.box.feature:has(span.icon), section.box.feature"));
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
            const searchUrl = `${getBaseUrl()}/?q=${encoded}&p=1`;
            const res = await http_get(searchUrl, { headers: DEFAULT_HEADERS });
            if (!res || !res.body) {
                return cb({ success: false, errorCode: "EMPTY_SEARCH", message: "No data received" });
            }
            const doc = await parseHtml(res.body);
            const blocks = Array.from(doc.querySelectorAll("div.row section.box.feature:has(span.icon), section.box.feature"));
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
            const posterUrl = fixUrl(doc.querySelector("meta[property='og:image']")?.getAttribute("content") || "");
            const desc = doc.querySelector("meta[name='description']")?.getAttribute("content") || "";
            const tags = Array.from(doc.querySelectorAll("section h3 + p a, div.tags a")).map(el => el.textContent.trim()).filter(Boolean);

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
                    episodes: [
                        createEpisode({
                            name: title || "Play Video",
                            url: url,
                            season: 1,
                            episode: 1,
                            posterUrl: posterUrl || ""
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
            const doc = await parseHtml(html);

            const streams = [];

            // 1. Check iframe (mydaddy or direct embed player)
            const iframe = doc.querySelector("iframe[src*='mydaddy'], iframe");
            if (iframe) {
                const src = iframe.getAttribute("src");
                if (src) {
                    const embedUrl = fixUrl(src);
                    try {
                        const embedRes = await http_get(embedUrl, {
                            headers: {
                                "User-Agent": DEFAULT_HEADERS["User-Agent"],
                                "Referer": `${getBaseUrl()}/`
                            }
                        });
                        if (embedRes && embedRes.body) {
                            const embedHtml = embedRes.body;
                            const srcMatch = embedHtml.match(/source\s*:\s*['"]([^'"]+)['"]/i) ||
                                embedHtml.match(/file\s*:\s*['"]([^'"]+)['"]/i) ||
                                embedHtml.match(/<source\s+[^>]*src=['"]([^'"]+)['"]/i);
                            if (srcMatch && srcMatch[1]) {
                                streams.push(createStream({
                                    url: fixUrl(srcMatch[1]),
                                    source: "HQPorner · Direct",
                                    headers: {
                                        "Referer": embedUrl,
                                        "User-Agent": DEFAULT_HEADERS["User-Agent"]
                                    }
                                }));
                            }
                        }
                    } catch (_) { }

                    streams.push(createStream({
                        url: embedUrl,
                        source: "HQPorner · Embed",
                        headers: {
                            "Referer": url,
                            "User-Agent": DEFAULT_HEADERS["User-Agent"]
                        }
                    }));
                }
            }

            // 2. Direct video sources
            const videoSrc = doc.querySelector("video source, video")?.getAttribute("src");
            if (videoSrc) {
                streams.push(createStream({
                    url: fixUrl(videoSrc),
                    source: "HQPorner · Direct Video",
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
