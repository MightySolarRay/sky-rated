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
            const href = post.getAttribute("href") || post.querySelector("a")?.getAttribute("href");
            if (!href) return null;
            const fullUrl = fixUrl(href);

            const titleEl = post.querySelector("h2.title, h2, h3, .title");
            const title = (titleEl ? titleEl.textContent : post.getAttribute("title") || "").trim();

            const img = post.querySelector("div.thumbnail-container img, img");
            let posterUrl = "";
            if (img) {
                posterUrl = img.getAttribute("src") || img.getAttribute("data-src") || "";
            }
            posterUrl = fixUrl(posterUrl);

            return new MultimediaItem({
                title: title || "Video",
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
                { name: "Trending", path: "/" },
                { name: "Ullu", path: "/channel/ullu/" },
                { name: "Altt", path: "/channel/altt/" },
                { name: "Feel", path: "/channel/feel/" },
                { name: "Kooku", path: "/channel/kooku/" },
                { name: "PrimePlay", path: "/channel/primeplay/" },
                { name: "HitPrime", path: "/channel/hitprime/" }
            ];

            const homeData = {};
            await Promise.all(sections.map(async (sec) => {
                try {
                    const res = await http_get(`${manifest.baseUrl}${sec.path}`, { headers: DEFAULT_HEADERS });
                    if (!res || !res.body) return;
                    const doc = await parseHtml(res.body);
                    const cards = Array.from(doc.querySelectorAll("a.video-card, .video-card"));
                    const items = cards.map(parseBlock).filter(Boolean).slice(0, 16);
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
            const res = await http_get(`${manifest.baseUrl}/page/1/?s=${encoded}`, { headers: DEFAULT_HEADERS });
            if (!res || !res.body) {
                return cb({ success: false, errorCode: "EMPTY_SEARCH", message: "No data received" });
            }
            const doc = await parseHtml(res.body);
            const cards = Array.from(doc.querySelectorAll("a.video-card, .video-card"));
            const items = cards.map(parseBlock).filter(Boolean);
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

            const title = doc.querySelector("h1.video-title, h1")?.textContent?.trim() || "Video";
            const posterUrl = fixUrl(doc.querySelector("meta[property^='og:image']")?.getAttribute("content") || "");
            const desc = doc.querySelector("div.description")?.textContent?.replace(/^Description/i, "")?.trim() || "";

            cb({
                success: true,
                data: new MultimediaItem({
                    title,
                    url,
                    posterUrl,
                    type: "movie",
                    description: desc,
                    isAdult: false,
                    episodes: [
                        new Episode({
                            name: title || "Play Video",
                            url: url,
                            season: 1,
                            episode: 1,
                            posterUrl: posterUrl || ""
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

            const streams = [];

            // 1. Direct video source
            const videoSources = Array.from(doc.querySelectorAll("video source, video"));
            for (const v of videoSources) {
                const src = v.getAttribute("src");
                if (src) {
                    streams.push(new StreamResult({
                        url: fixUrl(src),
                        source: "YMaal · Direct Video",
                        headers: {
                            "Referer": url,
                            "User-Agent": DEFAULT_HEADERS["User-Agent"]
                        }
                    }));
                }
            }

            // 2. Iframe embeds
            const iframes = Array.from(doc.querySelectorAll("iframe"));
            for (const iframe of iframes) {
                const src = iframe.getAttribute("src");
                if (src) {
                    streams.push(new StreamResult({
                        url: fixUrl(src),
                        source: "YMaal · Embed Player",
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
