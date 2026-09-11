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
        return "https://vsex.in";
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
            const titleEl = block.querySelector("h2.th-title") || block.querySelector("a.th-title");
            if (!titleEl) return null;
            const title = (titleEl.textContent || "").trim();
            const linkEl = block.querySelector("a");
            if (!linkEl) return null;
            const fullUrl = fixUrl(linkEl.getAttribute("href"));

            const img = block.querySelector("img");
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
                { name: "4K UHD", path: "/4k/" },
                { name: "Brazzers", path: "/brazzers/" },
                { name: "Reality Kings", path: "/realitykings/" },
                { name: "Naughty America", path: "/naughtyamerica/" },
                { name: "Bangbros", path: "/bangbros/" },
                { name: "Evil Angel", path: "/evilangel/" },
                { name: "Mofos", path: "/mofos/" },
                { name: "Pure Taboo", path: "/puretaboo/" },
                { name: "Team Skeet", path: "/teamskeet/" },
                { name: "All Genres", path: "/generos/" }
            ];

            const homeData = {};
            await Promise.all(sections.map(async (sec) => {
                try {
                    const res = await http_get(`${getBaseUrl()}${sec.path}`, { headers: DEFAULT_HEADERS });
                    if (!res || !res.body) return;
                    const doc = await parseHtml(res.body);
                    const blocks = Array.from(doc.querySelectorAll("div.thumb"));
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
            const searchUrl = `${getBaseUrl()}/index.php?do=search&subaction=search&search_start=0&full_search=0&story=${encoded}`;
            const res = await http_get(searchUrl, { headers: DEFAULT_HEADERS });
            if (!res || !res.body) {
                return cb({ success: false, errorCode: "EMPTY_SEARCH", message: "No data received" });
            }
            const doc = await parseHtml(res.body);
            const blocks = Array.from(doc.querySelectorAll("div.thumb"));
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

            const titleEl = doc.querySelector("h1");
            const title = (titleEl ? titleEl.textContent : doc.querySelector("meta[property='og:title']")?.getAttribute("content")) || "Video";

            const metaPoster = doc.querySelector("meta[property='og:image']")?.getAttribute("content");
            const posterUrl = fixUrl(metaPoster);

            const metaDesc = doc.querySelector("meta[property='og:description']")?.getAttribute("content") || "";

            const tags = Array.from(doc.querySelectorAll("div.full-tags a")).map(el => el.textContent.trim()).filter(Boolean);

            const recs = [];
            const relatedItems = Array.from(doc.querySelectorAll("div.floats.clearfix div.thumb, div.related-news div.thumb"));
            relatedItems.slice(0, 10).forEach(item => {
                const parsed = parseBlock(item);
                if (parsed) recs.push(parsed);
            });

            cb({
                success: true,
                data: createItem({
                    title: title.trim(),
                    url,
                    posterUrl,
                    type: "movie",
                    description: metaDesc.trim(),
                    tags,
                    isAdult: false,
                                        recommendations: recs,
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

            const iframe = doc.querySelector("iframe");
            if (!iframe) {
                return cb({ success: false, errorCode: "NO_IFRAME", message: "No player iframe found" });
            }

            let iframeUrl = fixUrl(iframe.getAttribute("src"));
            const iframeRes = await http_get(iframeUrl, { headers: { ...DEFAULT_HEADERS, "Referer": url } });
            if (!iframeRes || !iframeRes.body) {
                return cb({ success: false, errorCode: "IFRAME_ERROR", message: "Failed to load player iframe" });
            }

            const iframeHtml = iframeRes.body;
            const redirectMatch = iframeHtml.match(/url=(https?:\/\/[^"'>]+)/i);
            const playerUrl = redirectMatch ? redirectMatch[1] : iframeUrl;

            // Resolve filemoon or embed if present
            const streams = [];
            const m3u8Match = playerUrl.match(/(https?:\/\/[^"'\s]+\.m3u8[^\s"']*)/i) || iframeHtml.match(/(https?:\/\/[^"'\s]+\.m3u8[^\s"']*)/i);
            if (m3u8Match) {
                streams.push(createStream({
                    url: m3u8Match[1],
                    source: "VSex · HLS Auto",
                    headers: {
                        "Referer": iframeUrl,
                        "User-Agent": DEFAULT_HEADERS["User-Agent"]
                    }
                }));
            } else {
                streams.push(createStream({
                    url: playerUrl,
                    source: "VSex · Embed Stream",
                    headers: {
                        "Referer": url,
                        "User-Agent": DEFAULT_HEADERS["User-Agent"]
                    }
                }));
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
