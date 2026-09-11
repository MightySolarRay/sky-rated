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
        return "https://sxyprn.com";
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
            const rawTitle = block.querySelector("div.post_text")?.textContent || "";
            const title = rawTitle.replace(/(?:NEW|1080p|720p|Full HD.*)/ig, "").split("#")[0].trim();
            const linkEl = block.querySelector("a[href*='/post/'], a");
            if (!linkEl) return null;
            const href = linkEl.getAttribute("href");
            if (!href) return null;
            const fullUrl = fixUrl(href);

            const img = block.querySelector("div.post_vid_thumb img, img");
            let posterUrl = "";
            if (img) {
                posterUrl = img.getAttribute("data-src") || img.getAttribute("src") || "";
            }
            posterUrl = fixUrl(posterUrl);

            return createItem({
                title: title || "Video",
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
                { name: "Trending", path: "/Hardcore.html?sm=trending" },
                { name: "Latest", path: "/Hardcore.html?sm=latest" },
                { name: "Views", path: "/Hardcore.html?sm=views" },
                { name: "Orgasmic", path: "/Hardcore.html?sm=orgasmic" }
            ];

            const homeData = {};
            await Promise.all(sections.map(async (sec) => {
                try {
                    const res = await http_get(`${getBaseUrl()}${sec.path}`, { headers: DEFAULT_HEADERS });
                    if (!res || !res.body) return;
                    const doc = await parseHtml(res.body);
                    const blocks = Array.from(doc.querySelectorAll("div.post_el_small"));
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
            const formattedQuery = encodeURIComponent(query.trim().replace(/\s+/g, "-"));
            const searchUrl = `${getBaseUrl()}/${formattedQuery}.html`;
            const res = await http_get(searchUrl, { headers: DEFAULT_HEADERS });
            if (!res || !res.body) {
                return cb({ success: false, errorCode: "EMPTY_SEARCH", message: "No data received" });
            }
            const doc = await parseHtml(res.body);
            const blocks = Array.from(doc.querySelectorAll("div.post_el_small"));
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

            const title = (doc.querySelector("title")?.textContent?.split(" on the SexyPorn")[0] ||
                doc.querySelector("h1")?.textContent || "Video").trim();

            const poster = fixUrl(doc.querySelector("meta[property='og:image']")?.getAttribute("content") || "");
            const desc = doc.querySelector("meta[property='og:description']")?.getAttribute("content") || "";
            const tags = Array.from(doc.querySelectorAll("a.hash_link")).map(el => el.textContent.trim().replace(/^#/, "")).filter(Boolean);

            cb({
                success: true,
                data: createItem({
                    title,
                    url,
                    posterUrl: poster,
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
                            posterUrl: poster || ""
                        })
                    ],
                                        headers: { "Referer": getBaseUrl() }
                })
            });
        } catch (e) {
            cb({ success: false, errorCode: "LOAD_ERROR", message: String(e) });
        }
    }

    function sumDigits(str) {
        let sum = 0;
        for (let i = 0; i < str.length; i++) {
            if (!isNaN(parseInt(str[i], 10))) {
                sum += parseInt(str[i], 10);
            }
        }
        return sum;
    }

    function generateToken(ss, host, es) {
        const raw = `${ss}-${host}-${es}`;
        const b64 = btoa(raw);
        return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, ".");
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

            const vnfoEl = doc.querySelector(".vidsnfo");
            const dataVnfo = vnfoEl?.getAttribute("data-vnfo");

            if (dataVnfo) {
                try {
                    const parsedVnfo = JSON.parse(dataVnfo);
                    const host = "sxyprn.com";
                    for (const key of Object.keys(parsedVnfo)) {
                        const relPath = parsedVnfo[key];
                        const parts = relPath.split("/");
                        if (parts.length >= 8) {
                            const ss = sumDigits(parts[6]);
                            const es = sumDigits(parts[7]);
                            const token = generateToken(ss, host, es);

                            parts[1] = parts[1] + "8/" + token;
                            const ts = parseInt(parts[5], 10);
                            if (!isNaN(ts)) {
                                parts[5] = String(ts - (ss + es));
                            }
                            const cdn8url = `https://${host}${parts.join("/")}`;

                            // Check redirect
                            const headRes = await http_get(cdn8url, {
                                headers: {
                                    "User-Agent": DEFAULT_HEADERS["User-Agent"],
                                    "Referer": url
                                }
                            });
                            if (headRes && headRes.url && headRes.url !== cdn8url) {
                                streams.push(createStream({
                                    url: headRes.url,
                                    source: "SxyPrn · Direct MP4",
                                    headers: { "Referer": url }
                                }));
                            } else {
                                streams.push(createStream({
                                    url: cdn8url,
                                    source: "SxyPrn · CDN Stream",
                                    headers: { "Referer": url }
                                }));
                            }
                        }
                    }
                } catch (_) { }
            }

            // Fallback: check video source elements
            const videoSources = Array.from(doc.querySelectorAll("video source, video"));
            for (const v of videoSources) {
                const src = v.getAttribute("src");
                if (src) {
                    streams.push(createStream({
                        url: fixUrl(src),
                        source: "SxyPrn · Direct",
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
