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
        return "https://dirtyship.com";
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
                { name: "Indian / Desi", path: "/category/indian-1/" },
                { name: "OnlyFans", path: "/category/onlyfans-k/" },
                { name: "Fansly", path: "/category/fansly-i/" },
                { name: "TikTok", path: "/category/tiktok-a1/" },
                { name: "Twitter Leaks", path: "/category/twitter-a1/" },
                { name: "Instagram", path: "/category/instagram-def/" },
                { name: "Amateur", path: "/category/amateur-fg/" },
                { name: "Cosplayer", path: "/category/cosplayer-xy/" },
                { name: "Celebrity", path: "/category/celebrity-fg/" }
            ];

            const homeData = {};
            await Promise.all(sections.map(async (sec) => {
                try {
                    const res = await http_get(`${getBaseUrl()}${sec.path}`, { headers: DEFAULT_HEADERS });
                    if (!res || !res.body) return;
                    const doc = await parseHtml(res.body);
                    const blocks = Array.from(doc.querySelectorAll("li.thumi"));
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
            const searchUrl = `${getBaseUrl()}/?search_param=all&s=${encoded}`;
            const res = await http_get(searchUrl, { headers: DEFAULT_HEADERS });
            if (!res || !res.body) {
                return cb({ success: false, errorCode: "EMPTY_SEARCH", message: "No data received" });
            }
            const doc = await parseHtml(res.body);
            const blocks = Array.from(doc.querySelectorAll("li.thumi"));
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

            const tags = Array.from(doc.querySelectorAll("p.data-row a")).map(el => el.textContent.trim()).filter(Boolean);

            const actors = Array.from(doc.querySelectorAll("div.content-data ul.post_performers a")).map(aTag => {
                const name = aTag.getAttribute("title") || aTag.textContent.trim();
                const img = aTag.querySelector("img");
                const image = img ? img.getAttribute("src") : undefined;
                return new Actor({ name, image });
            }).filter(a => a.name);

            const recs = [];
            const relatedItems = Array.from(doc.querySelectorAll("li.thumi"));
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
                    tags,
                    isAdult: false,
                                        cast: actors,
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

            let videoSource = "";
            const sourceEl = doc.querySelector("div.embed-responsive source") || doc.querySelector("video source");
            if (sourceEl) {
                videoSource = sourceEl.getAttribute("src") || "";
            }

            if (!videoSource) {
                const wpfpDiv = doc.querySelector("div[id^='wpfp_']");
                if (wpfpDiv) {
                    const rawDataItem = wpfpDiv.getAttribute("data-item");
                    if (rawDataItem) {
                        try {
                            const cleaned = rawDataItem.replace(/&quot;/g, '"').replace(/\\\//g, "/");
                            const json = JSON.parse(cleaned);
                            if (json.sources && json.sources[0] && json.sources[0].src) {
                                videoSource = json.sources[0].src;
                            }
                        } catch (_) { }
                    }
                }
            }

            if (!videoSource) {
                const m3u8Match = html.match(/(https?:\/\/[^"'\s]+\.m3u8[^\s"']*)/i) || html.match(/(https?:\/\/[^"'\s]+\.mp4[^\s"']*)/i);
                if (m3u8Match) {
                    videoSource = m3u8Match[1];
                }
            }

            if (!videoSource) {
                return cb({ success: false, errorCode: "NO_STREAMS", message: "No stream URL found" });
            }

            cb({
                success: true,
                data: [
                    createStream({
                        url: fixUrl(videoSource),
                        source: "DirtyShip · Direct",
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
