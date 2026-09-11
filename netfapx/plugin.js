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

            const img = linkEl.querySelector("img");
            const title = (img?.getAttribute("alt") || block.querySelector("h2, .entry-title")?.textContent || "Video").trim();

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
                                headers: { "Referer": `${manifest.baseUrl}/` }
            });
        } catch (e) {
            return null;
        }
    }

    async function getHome(cb) {
        try {
            const sections = [
                { name: "Trending", path: "/" },
                { name: "Step Mom", path: "/tag/step-mom" },
                { name: "Milf", path: "/category/milf" },
                { name: "Big Ass", path: "/category/big-ass" },
                { name: "Big Tits", path: "/category/big-tits" },
                { name: "Asian", path: "/category/asian" }
            ];

            const homeData = {};
            await Promise.all(sections.map(async (sec) => {
                try {
                    const res = await http_get(`${manifest.baseUrl}${sec.path}`, { headers: DEFAULT_HEADERS });
                    if (!res || !res.body) return;
                    const doc = await parseHtml(res.body);
                    const blocks = Array.from(doc.querySelectorAll("article"));
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
            const searchUrl = `${manifest.baseUrl}/page/1/?s=${encoded}`;
            const res = await http_get(searchUrl, { headers: DEFAULT_HEADERS });
            if (!res || !res.body) {
                return cb({ success: false, errorCode: "EMPTY_SEARCH", message: "No data received" });
            }
            const doc = await parseHtml(res.body);
            const blocks = Array.from(doc.querySelectorAll("article"));
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
            const desc = doc.querySelector("div.textbox h2 + div p, meta[property='og:description']")?.textContent?.trim() || "";
            const tags = Array.from(doc.querySelectorAll("div.infovideo p a")).map(el => el.textContent.trim()).filter(Boolean);

            cb({
                success: true,
                data: new MultimediaItem({
                    title,
                    url,
                    posterUrl: poster,
                    type: "movie",
                    description: desc,
                    tags,
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
            const doc = await parseHtml(html);

            const streams = [];

            // 1. Post ID AJAX stream retrieval
            const postIdMatch = html.match(/"postId"\s*:\s*"(\d+)"/i);
            if (postIdMatch && postIdMatch[1]) {
                const postId = postIdMatch[1];
                try {
                    const ajaxRes = await http_post(`${manifest.baseUrl}/wp-admin/admin-ajax.php`, {
                        headers: {
                            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                            "X-Requested-With": "XMLHttpRequest",
                            "Referer": url,
                            "Origin": manifest.baseUrl
                        },
                        body: `action=get_video_url&idpost=${postId}`
                    });
                    if (ajaxRes && ajaxRes.body) {
                        const streamUrl = ajaxRes.body.trim();
                        if (streamUrl.startsWith("http")) {
                            streams.push(new StreamResult({
                                url: streamUrl,
                                source: "NetFapX · Video Stream",
                                headers: {
                                    "Referer": url,
                                    "User-Agent": DEFAULT_HEADERS["User-Agent"]
                                }
                            }));
                        }
                    }
                } catch (_) { }
            }

            // 2. Direct video sources or iframes
            const videoSources = Array.from(doc.querySelectorAll("video source, video"));
            for (const v of videoSources) {
                const src = v.getAttribute("src");
                if (src) {
                    streams.push(new StreamResult({
                        url: fixUrl(src),
                        source: "NetFapX · Direct Video",
                        headers: { "Referer": url }
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
