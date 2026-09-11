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
        return "https://www.youjizz.com";
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
            const titleEl = block.querySelector("div.video-title a, a");
            if (!titleEl) return null;
            const title = (titleEl.textContent || titleEl.getAttribute("title") || "Video").trim();
            const rawHref = titleEl.getAttribute("href");
            if (!rawHref) return null;
            const fullUrl = fixUrl(rawHref);

            const img = block.querySelector("img");
            let posterUrl = "";
            if (img) {
                posterUrl = img.getAttribute("data-original") || img.getAttribute("data-src") || img.getAttribute("src") || "";
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
                { name: "Trending", path: "/trending" },
                { name: "Most Popular", path: "/most-popular" },
                { name: "Newest Clips", path: "/newest-clips" },
                { name: "Top Rated Month", path: "/top-rated-month" },
                { name: "Random", path: "/random" }
            ];

            const homeData = {};
            await Promise.all(sections.map(async (sec) => {
                try {
                    const res = await http_get(`${getBaseUrl()}${sec.path}/1.html`, { headers: DEFAULT_HEADERS });
                    if (!res || !res.body) return;
                    const doc = await parseHtml(res.body);
                    const blocks = Array.from(doc.querySelectorAll("div.video-thumb"));
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
            const searchUrl = `${getBaseUrl()}/search/${encoded}-1.html?`;
            const res = await http_get(searchUrl, { headers: DEFAULT_HEADERS });
            if (!res || !res.body) {
                return cb({ success: false, errorCode: "EMPTY_SEARCH", message: "No data received" });
            }
            const doc = await parseHtml(res.body);
            const blocks = Array.from(doc.querySelectorAll("div.video-thumb"));
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

            const posterUrl = fixUrl(doc.querySelector("meta[property='og:image']")?.getAttribute("content") || "");
            const desc = doc.querySelector("meta[property='og:description']")?.getAttribute("content") || "";
            const tags = Array.from(doc.querySelectorAll("div.tag-list li a")).map(el => el.textContent.trim()).filter(Boolean);

            cb({
                success: true,
                data: createItem({
                    title: title.trim(),
                    url,
                    posterUrl,
                    type: "movie",
                    description: desc.trim(),
                    tags,
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

            // Match "quality":"...","filename":"..." patterns
            const regex = /"quality"\s*:\s*"([^"]+)"\s*,\s*"filename"\s*:\s*"([^"]+)"/gi;
            let match;
            while ((match = regex.exec(html)) !== null) {
                const quality = match[1];
                let videoFile = match[2].replace(/\\/g, "");
                if (!videoFile.startsWith("http")) {
                    videoFile = "https://" + videoFile;
                }
                streams.push(createStream({
                    url: videoFile,
                    source: `YouJizz · ${quality}p`,
                    headers: {
                        "Referer": `${getBaseUrl()}/`,
                        "User-Agent": DEFAULT_HEADERS["User-Agent"]
                    }
                }));
            }

            if (streams.length === 0) {
                const videoSrc = (await parseHtml(html)).querySelector("video source, video")?.getAttribute("src");
                if (videoSrc) {
                    streams.push(createStream({
                        url: fixUrl(videoSrc),
                        source: "YouJizz · Direct",
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
