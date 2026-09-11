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

    function parseBlock(linkEl) {
        try {
            const title = (linkEl.getAttribute("title") || linkEl.textContent || "").trim();
            const href = linkEl.getAttribute("href");
            if (!href) return null;
            const fullUrl = fixUrl(href);

            let posterUrl = "";
            const style = linkEl.getAttribute("style") || "";
            const bgMatch = style.match(/background-image:\s*url\(['"]?(.*?)['"]?\)/i);
            if (bgMatch) {
                posterUrl = bgMatch[1];
            } else {
                const img = linkEl.querySelector("img");
                if (img) posterUrl = img.getAttribute("src") || img.getAttribute("data-src") || "";
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
                { name: "Trending", path: "/page/1" },
                { name: "Ullu", path: "/ullu-c14/page/1" },
                { name: "PrimePlay", path: "/primeplay-c1/page/1" },
                { name: "Kooku", path: "/kooku/page/1" },
                { name: "Triflicks", path: "/triflicks/page/1" },
                { name: "Rabbit", path: "/rabbit/page/1" },
                { name: "Hunters", path: "/hunters/page/1" },
                { name: "Atragii", path: "/atragii-c8/page/1" }
            ];

            const homeData = {};
            await Promise.all(sections.map(async (sec) => {
                try {
                    const res = await http_get(`${manifest.baseUrl}${sec.path}`, { headers: DEFAULT_HEADERS });
                    if (!res || !res.body) return;
                    const doc = await parseHtml(res.body);
                    const blocks = Array.from(doc.querySelectorAll("div.videos a, div.video-item a"));
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
            const blocks = Array.from(doc.querySelectorAll("div.videos a, div.video-item a"));
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

            cb({
                success: true,
                data: new MultimediaItem({
                    title: title.trim(),
                    url,
                    posterUrl,
                    type: "movie",
                    description: desc.trim(),
                    isAdult: false,
                    episodes: [
                        new Episode({
                            name: title.trim() || "Play Video",
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

            let videoUrl = "";
            const sourceEl = doc.querySelector("#my-video source") || doc.querySelector("video source");
            if (sourceEl) {
                videoUrl = sourceEl.getAttribute("src") || "";
            }

            if (!videoUrl) {
                const match = html.match(/(https?:\/\/[^"'\s]+\.(?:mp4|m3u8)[^\s"']*)/i);
                if (match) videoUrl = match[1];
            }

            if (!videoUrl) {
                const iframe = doc.querySelector("iframe");
                if (iframe) videoUrl = iframe.getAttribute("src") || "";
            }

            if (!videoUrl) {
                return cb({ success: false, errorCode: "NO_STREAMS", message: "No stream URL found" });
            }

            cb({
                success: true,
                data: [
                    new StreamResult({
                        url: fixUrl(videoUrl),
                        source: "Xmaza · Direct Video",
                        headers: {
                            "Referer": url,
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
