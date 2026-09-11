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

    function parseBlock(post) {
        try {
            const linkEl = post.querySelector("a");
            if (!linkEl) return null;
            const title = (linkEl.getAttribute("title") || linkEl.textContent || "").trim();
            const href = linkEl.getAttribute("href");
            if (!href) return null;
            const fullUrl = fixUrl(href);

            const img = post.querySelector("img");
            let posterUrl = "";
            if (img) {
                posterUrl = img.getAttribute("src") || img.getAttribute("data-src") || "";
            }
            posterUrl = fixUrl(posterUrl);

            return new MultimediaItem({
                title,
                url: fullUrl,
                posterUrl,
                type: "movie",
                isAdult: false,
                                headers: { "Referer": manifest.baseUrl }
            });
        } catch (e) {
            return null;
        }
    }

    async function getHome(cb) {
        try {
            const sections = [
                { name: "Latest Videos", path: "/page/1" },
                { name: "Hot Web Series", path: "/hot-web-series/page/1" },
                { name: "Hot Short Film", path: "/hot-short-film/page/1" },
                { name: "Ullu Originals", path: "/ullu/page/1" },
                { name: "ALTBalaji", path: "/alt-balaji/page/1" },
                { name: "Hots Live", path: "/hotslive/page/1" }
            ];

            const homeData = {};
            await Promise.all(sections.map(async (sec) => {
                try {
                    const res = await http_get(`${manifest.baseUrl}${sec.path}`, { headers: DEFAULT_HEADERS });
                    if (!res || !res.body) return;
                    const doc = await parseHtml(res.body);
                    const blocks = Array.from(doc.querySelectorAll("div.video-item, div.post, article"));
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
            const res = await http_get(`${manifest.baseUrl}/?s=${encoded}`, { headers: DEFAULT_HEADERS });
            if (!res || !res.body) {
                return cb({ success: false, errorCode: "EMPTY_SEARCH", message: "No data received" });
            }
            const doc = await parseHtml(res.body);
            const blocks = Array.from(doc.querySelectorAll("div.video-item, div.post, article"));
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

            const titleEl = doc.querySelector("div#video-about h2") || doc.querySelector("h1");
            const title = (titleEl ? titleEl.textContent : doc.querySelector("meta[property='og:title']")?.getAttribute("content")) || "Video";

            const metaPoster = doc.querySelector("div.video-player meta[itemprop='thumbnailUrl']")?.getAttribute("content") ||
                doc.querySelector("meta[property='og:image']")?.getAttribute("content") || "";

            const desc = doc.querySelector("div.more p, meta[property='og:description']")?.textContent || "";

            cb({
                success: true,
                data: new MultimediaItem({
                    title: title.trim(),
                    url,
                    posterUrl: fixUrl(metaPoster),
                    type: "movie",
                    description: desc.trim(),
                    isAdult: false,
                    episodes: [
                        new Episode({
                            name: title.trim() || "Play Video",
                            url: url,
                            season: 1,
                            episode: 1,
                            posterUrl: fixUrl(metaPoster) || ""
                        })
                    ],
                                        headers: { "Referer": manifest.baseUrl }
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

            const embedMeta = doc.querySelector("div.video-player meta[itemprop='embedURL']") ||
                doc.querySelector("div.video-player meta[itemprop='contentURL']") ||
                doc.querySelector("iframe");

            const embedUrl = embedMeta ? (embedMeta.getAttribute("content") || embedMeta.getAttribute("src")) : "";

            const streams = [];

            if (embedUrl) {
                const fullEmbed = fixUrl(embedUrl);
                streams.push(new StreamResult({
                    url: fullEmbed,
                    source: "DesiXFlix · Player Embed",
                    headers: {
                        "Referer": url,
                        "User-Agent": DEFAULT_HEADERS["User-Agent"]
                    }
                }));
            }

            // Also check video tag
            const videoEl = doc.querySelector("video source, video");
            if (videoEl) {
                const src = videoEl.getAttribute("src");
                if (src) {
                    streams.push(new StreamResult({
                        url: fixUrl(src),
                        source: "DesiXFlix · Direct Video",
                        headers: {
                            "Referer": url,
                            "User-Agent": DEFAULT_HEADERS["User-Agent"]
                        }
                    }));
                }
            }

            if (streams.length === 0) {
                return cb({ success: false, errorCode: "NO_STREAMS", message: "No stream URLs found" });
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
