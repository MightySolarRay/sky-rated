(function () {
    const DEFAULT_HEADERS = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    };


    function getBaseUrl() {
        if (typeof manifest !== "undefined" && manifest && manifest.baseUrl) {
            return manifest.baseUrl.replace(/\/+$/, "");
        }
        return "https://www.eporner.com";
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

    function parseItem(elem) {
        try {
            const titleEl = elem.querySelector("p.mbtit a");
            if (!titleEl) return null;
            const title = (titleEl.textContent || "").trim();
            const rawHref = titleEl.getAttribute("href");
            if (!rawHref) return null;
            const fullUrl = fixUrl(rawHref);

            const img = elem.querySelector("div.mbimg img");
            let posterUrl = "";
            if (img) {
                const dataSrc = img.getAttribute("data-src");
                const src = img.getAttribute("src");
                posterUrl = (dataSrc && !dataSrc.startsWith("data:")) ? dataSrc : src;
            }
            posterUrl = fixUrl(posterUrl);

            const durEl = elem.querySelector("span.mblength");
            let duration = 0;
            if (durEl) {
                const txt = durEl.textContent.trim();
                const parts = txt.split(":");
                if (parts.length === 2) duration = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
                else if (parts.length === 3) duration = parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60 + parseInt(parts[2], 10);
            }

            return createItem({
                title,
                url: fullUrl,
                posterUrl,
                type: "movie",
                duration,
                isAdult: false,
                                headers: { "Referer": getBaseUrl() }
            });
        } catch (e) {
            return null;
        }
    }

    async function getHome(cb) {
        try {
            const categories = [
                { name: "Trending", path: "/" },
                { name: "Most Viewed", path: "/most-viewed/" },
                { name: "Top Rated", path: "/top-rated/" },
                { name: "Longest", path: "/longest/" },
                { name: "Cowgirl", path: "/tag/cowgirl/" },
                { name: "Housewives", path: "/cat/housewives/" }
            ];

            const homeData = {};
            await Promise.all(categories.map(async (cat) => {
                try {
                    const res = await http_get(`${getBaseUrl()}${cat.path}`, { headers: DEFAULT_HEADERS });
                    if (!res || !res.body) return;
                    const doc = await parseHtml(res.body);
                    const blocks = Array.from(doc.querySelectorAll("div#vidresults div.mb"));
                    const items = blocks.map(parseItem).filter(Boolean).slice(0, 16);
                    if (items.length > 0) {
                        homeData[cat.name] = items;
                    }
                } catch (_) { }
            }));

            cb({ success: true, data: homeData });
        } catch (e) {
            cb({ success: false, errorCode: "HOME_ERROR", message: String(e) });
        }
    }

    async function search(query, cb) {
        try {
            const formatted = encodeURIComponent(query.replace(/\s+/g, "-"));
            const searchUrl = `${getBaseUrl()}/search/${formatted}/`;
            const res = await http_get(searchUrl, { headers: DEFAULT_HEADERS });
            if (!res || !res.body) {
                return cb({ success: false, errorCode: "EMPTY_SEARCH", message: "No data received" });
            }
            const doc = await parseHtml(res.body);
            const blocks = Array.from(doc.querySelectorAll("div#vidresults div.mb"));
            const items = blocks.map(parseItem).filter(Boolean);
            cb({ success: true, data: items });
        } catch (e) {
            cb({ success: false, errorCode: "SEARCH_ERROR", message: String(e) });
        }
    }

    async function load(url, cb) {
        try {
            const res = await http_get(url, { headers: DEFAULT_HEADERS });
            if (!res || !res.body) {
                return cb({ success: false, errorCode: "LOAD_ERROR", message: "Failed to load page" });
            }
            const doc = await parseHtml(res.body);

            const titleEl = doc.querySelector("h1");
            const title = titleEl ? titleEl.textContent.trim() : "Video";

            const metaPoster = doc.querySelector("meta[property='og:image']")?.getAttribute("content")
                || doc.querySelector("video#EPvideo")?.getAttribute("poster");
            const posterUrl = fixUrl(metaPoster);

            const desc = doc.querySelector("meta[property='og:description']")?.getAttribute("content") || "";

            const tags = Array.from(doc.querySelectorAll("div#video-info-tags ul li.vit-category a")).map(el => el.textContent.trim());

            const durEl = doc.querySelector("span.vid-length");
            const duration = durEl ? parseInt(durEl.textContent.replace(/\D/g, ""), 10) : 0;

            const actors = Array.from(doc.querySelectorAll("span.valor a")).map(el => new Actor({ name: el.textContent.trim() }));

            const recs = Array.from(doc.querySelectorAll("div#relateddiv div.mb")).map(parseItem).filter(Boolean).slice(0, 10);

            cb({
                success: true,
                data: createItem({
                    title,
                    url,
                    posterUrl,
                    type: "movie",
                    description: desc.trim(),
                    tags,
                    duration,
                    isAdult: false,
                                        cast: actors,
                    recommendations: recs,
                    episodes: [
                        createEpisode({
                            name: title || "Play Video",
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
            const vidMatch = url.match(/(?:embed|video)-([a-zA-Z0-9]+)/);
            if (!vidMatch || !vidMatch[1]) {
                return cb({ success: false, errorCode: "INVALID_URL", message: "Could not find video ID" });
            }
            const vid = vidMatch[1];
            const embedUrl = `${getBaseUrl()}/embed/${vid}/`;

            const embedRes = await http_get(embedUrl, { headers: { ...DEFAULT_HEADERS, "Referer": url } });
            if (!embedRes || !embedRes.body) {
                return cb({ success: false, errorCode: "EMBED_FAILED", message: "Could not fetch embed page" });
            }

            const hashMatch = embedRes.body.match(/EP\.video\.player\.hash\s*=\s*'([^']+)'/);
            if (!hashMatch || !hashMatch[1]) {
                return cb({ success: false, errorCode: "HASH_NOT_FOUND", message: "Video hash missing" });
            }

            const rawHash = hashMatch[1];
            let convertedHash = "";
            for (let i = 0; i < rawHash.length; i += 8) {
                const chunk = rawHash.substring(i, i + 8);
                convertedHash += parseInt(chunk, 16).toString(36);
            }

            const xhrUrl = `${getBaseUrl()}/xhr/video/${vid}?hash=${convertedHash}&domain=www.eporner.com&pixelRatio=1&playerWidth=0&playerHeight=0&fallback=false&embed=true&supportedFormats=hls,dash,h265,vp9,av1,mp4&_=${Date.now()}`;

            const xhrRes = await http_get(xhrUrl, {
                headers: {
                    ...DEFAULT_HEADERS,
                    "Referer": embedUrl,
                    "X-Requested-With": "XMLHttpRequest"
                }
            });

            if (!xhrRes || !xhrRes.body) {
                return cb({ success: false, errorCode: "XHR_FAILED", message: "Could not fetch stream links" });
            }

            const streams = [];
            const jsonText = xhrRes.body;

            // Direct MP4 Qualities
            const mp4Regex = /"labelShort"\s*:\s*"(\d{3,4}p)[^"]*"\s*,\s*"src"\s*:\s*"([^"]+)"/g;
            let m;
            while ((m = mp4Regex.exec(jsonText)) !== null) {
                const quality = m[1];
                const videoUrl = m[2];
                if (!videoUrl.includes("/dload/")) {
                    streams.push(createStream({
                        url: videoUrl,
                        source: `EPorner · ${quality}`,
                        headers: {
                            "Referer": getBaseUrl(),
                            "User-Agent": DEFAULT_HEADERS["User-Agent"]
                        }
                    }));
                }
            }

            // HLS fallback
            const hlsMatch = jsonText.match(/"srcFallback"\s*:\s*"(https?:\/\/[^"]+\.m3u8[^"]*)"/);
            if (hlsMatch && hlsMatch[1]) {
                streams.push(createStream({
                    url: hlsMatch[1],
                    source: "EPorner · HLS Auto",
                    headers: {
                        "Referer": getBaseUrl(),
                        "User-Agent": DEFAULT_HEADERS["User-Agent"]
                    }
                }));
            }

            if (streams.length === 0) {
                return cb({ success: false, errorCode: "NO_STREAMS", message: "No streams found" });
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
