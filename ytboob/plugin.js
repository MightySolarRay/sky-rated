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
        return "https://ytboob.com";
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

    function parseDuration(durationStr) {
        if (!durationStr) return 0;
        const parts = durationStr.trim().split(":").map(p => parseInt(p, 10));
        if (parts.length === 2) return parts[0] + Math.round(parts[1] / 60);
        if (parts.length === 3) return (parts[0] * 60) + parts[1];
        return 0;
    }

    function parseBlock(block) {
        try {
            const linkEl = block.querySelector("a");
            if (!linkEl) return null;
            const title = (linkEl.getAttribute("title") || linkEl.textContent || "").trim();
            const href = linkEl.getAttribute("href");
            if (!href) return null;
            const fullUrl = fixUrl(href);

            const img = block.querySelector("img");
            let posterUrl = "";
            if (img) {
                posterUrl = img.getAttribute("src") || img.getAttribute("data-src") || "";
            }
            posterUrl = fixUrl(posterUrl);

            const durEl = block.querySelector("span.duration");
            const duration = durEl ? parseDuration(durEl.textContent) : 0;

            const ratingEl = block.querySelector("span.rating");
            let score = 0;
            if (ratingEl) {
                const rText = ratingEl.textContent.replace("%", "").trim();
                const rNum = parseInt(rText, 10);
                if (!isNaN(rNum)) score = rNum / 10;
            }

            return createItem({
                title,
                url: fullUrl,
                posterUrl,
                type: "movie",
                duration,
                score,
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
                { name: "Trending", path: "/?filter=popular" },
                { name: "Indian / Desi", path: "/category/indian/" },
                { name: "Most Viewed", path: "/?filter=most-viewed" },
                { name: "Longest", path: "/?filter=longest" },
                { name: "Erotic Movies", path: "/category/movie/" },
                { name: "Asian", path: "/category/asian/" },
                { name: "Japanese", path: "/category/japanese/" },
                { name: "Bikini & Glamour", path: "/category/bikini/" },
                { name: "Massage", path: "/category/massage/" },
                { name: "MILF", path: "/category/milf/" }
            ];

            const homeData = {};
            await Promise.all(sections.map(async (sec) => {
                try {
                    const res = await http_get(`${getBaseUrl()}${sec.path}`, { headers: DEFAULT_HEADERS });
                    if (!res || !res.body) return;
                    const doc = await parseHtml(res.body);
                    const blocks = Array.from(doc.querySelectorAll("article.thumb-block"));
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
            // First try Typesense search API used by the site
            try {
                const searchPayload = JSON.stringify({
                    searches: [
                        {
                            collection: "post",
                            highlight_full_fields: "post_title,post_content",
                            page: 1,
                            per_page: 24,
                            q: query,
                            query_by: "post_title,post_content"
                        }
                    ]
                });
                const tsRes = await http_post("https://ts-api.ytboob.com/multi_search?x-typesense-api-key=2mFxuIpLuESx5X1aPGkDOx4ZAtM5jG46", {
                    headers: { "Content-Type": "application/json" },
                    body: searchPayload
                });
                if (tsRes && tsRes.body) {
                    const parsed = JSON.parse(tsRes.body);
                    const hits = parsed?.results?.[0]?.hits;
                    if (Array.isArray(hits) && hits.length > 0) {
                        const items = hits.map(hit => {
                            const doc = hit.document;
                            if (!doc) return null;
                            return createItem({
                                title: doc.post_title,
                                url: fixUrl(doc.permalink),
                                posterUrl: fixUrl(doc.post_thumbnail),
                                type: "movie",
                                isAdult: false,
                                                                headers: { "Referer": getBaseUrl() }
                            });
                        }).filter(Boolean);
                        if (items.length > 0) {
                            return cb({ success: true, data: items });
                        }
                    }
                }
            } catch (_) { }

            // Fallback to standard web search
            const encoded = encodeURIComponent(query);
            const searchUrl = `${getBaseUrl()}/?s=${encoded}`;
            const res = await http_get(searchUrl, { headers: DEFAULT_HEADERS });
            if (!res || !res.body) {
                return cb({ success: false, errorCode: "EMPTY_SEARCH", message: "No data received" });
            }
            const doc = await parseHtml(res.body);
            const blocks = Array.from(doc.querySelectorAll("article.thumb-block"));
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

            const descEl = doc.querySelector("div.video-description p:nth-child(3)") || doc.querySelector("div.video-description");
            const description = (descEl ? descEl.textContent : "") || "";

            const tags = Array.from(doc.querySelectorAll("div.tags-list a")).map(el => el.textContent.trim()).filter(Boolean);

            const scoreEl = doc.querySelector("span.dt_rating_vgs");
            let score = 0;
            if (scoreEl) {
                const s = parseFloat(scoreEl.textContent.trim());
                if (!isNaN(s)) score = s;
            }

            const durEl = doc.querySelector("span.runtime");
            let duration = 0;
            if (durEl) {
                const d = parseInt(durEl.textContent.trim(), 10);
                if (!isNaN(d)) duration = d;
            }

            const recs = [];
            const relatedItems = Array.from(doc.querySelectorAll("article.thumb-block"));
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
                    description: description.trim(),
                    tags,
                    score,
                    duration,
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

            let videoUrl = "";
            const sourceEl = doc.querySelector("video source") || doc.querySelector("source");
            if (sourceEl) {
                videoUrl = sourceEl.getAttribute("src") || "";
            }

            if (!videoUrl) {
                const match = html.match(/(https?:\/\/[^"'\s]+\.(?:mp4|m3u8)[^\s"']*)/i);
                if (match) videoUrl = match[1];
            }

            if (!videoUrl) {
                return cb({ success: false, errorCode: "NO_STREAMS", message: "No stream URL found" });
            }

            cb({
                success: true,
                data: [
                    createStream({
                        url: fixUrl(videoUrl),
                        source: "YTBoob · Direct Video",
                        headers: {
                            "Referer": `${getBaseUrl()}/`,
                            "User-Agent": DEFAULT_HEADERS["User-Agent"]
                        }
                    })
                ]
            });
        } catch (e) {
            cb({ success: false, errorCode: "STREAM_ERROR", message: String(e) });
        }
    }

    globalThis.getHome = getHome;
    globalThis.search = search;
    globalThis.load = load;
    globalThis.loadStreams = loadStreams;
})();
