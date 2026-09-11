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
            const titleEl = block.querySelector("div.data h3 a, div h3 a, div.details a, h3 a");
            if (!titleEl) return null;
            const title = (titleEl.textContent || titleEl.getAttribute("title") || "").trim();
            const href = titleEl.getAttribute("href");
            if (!href) return null;
            const fullUrl = fixUrl(href);

            const img = block.querySelector("div.poster img, div.image img, img");
            let posterUrl = "";
            if (img) {
                posterUrl = img.getAttribute("data-wpfc-original-src") || img.getAttribute("src") || img.getAttribute("data-src") || "";
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
                { name: "Trending", path: "/movies/" },
                { name: "Indian / Desi", path: "/genre/indian/" },
                { name: "Asian", path: "/genre/asian/" },
                { name: "18+ Teens", path: "/genre/18-teens/" },
                { name: "Anal", path: "/genre/anal/" },
                { name: "Milf", path: "/genre/milf/" },
                { name: "Big Boobs", path: "/genre/big-boobs/" },
                { name: "Blowjobs", path: "/genre/blowjobs/" },
                { name: "Lesbian", path: "/genre/lesbian/" },
                { name: "Interracial", path: "/genre/interracial/" }
            ];

            const homeData = {};
            await Promise.all(sections.map(async (sec) => {
                try {
                    const res = await http_get(`${manifest.baseUrl}${sec.path}`, { headers: DEFAULT_HEADERS });
                    if (!res || !res.body) return;
                    const doc = await parseHtml(res.body);
                    const blocks = Array.from(doc.querySelectorAll("div.items > article, div.content div.item, article"));
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
            const searchUrl = `${manifest.baseUrl}/?s=${encoded}`;
            const res = await http_get(searchUrl, { headers: DEFAULT_HEADERS });
            if (!res || !res.body) {
                return cb({ success: false, errorCode: "EMPTY_SEARCH", message: "No data received" });
            }
            const doc = await parseHtml(res.body);
            const blocks = Array.from(doc.querySelectorAll("div.result-item, div.items > article, article"));
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

            const titleEl = doc.querySelector("div.data h1, h1");
            const title = (titleEl ? titleEl.textContent : doc.querySelector("meta[property='og:title']")?.getAttribute("content")) || "Video";

            const metaPoster = doc.querySelector("meta[property='og:image']")?.getAttribute("content");
            const posterUrl = fixUrl(metaPoster);

            const descEl = doc.querySelector("div.wp-content p, meta[property='og:description']");
            const description = (descEl ? (descEl.textContent || descEl.getAttribute("content")) : "") || "";

            const tags = Array.from(doc.querySelectorAll("div.sgeneros a, div.custom_fields a")).map(el => el.textContent.trim()).filter(Boolean);

            const recs = [];
            const relatedItems = Array.from(doc.querySelectorAll("div.owl-carousel article, div.items article"));
            relatedItems.slice(0, 10).forEach(item => {
                const parsed = parseBlock(item);
                if (parsed) recs.push(parsed);
            });

            cb({
                success: true,
                data: new MultimediaItem({
                    title: title.trim(),
                    url,
                    posterUrl,
                    type: "movie",
                    description: description.trim(),
                    tags,
                    isAdult: false,
                                        recommendations: recs,
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

            // Check pettabs / player embeds
            const tabLinks = Array.from(doc.querySelectorAll("div#pettabs ul a, ul.idTabs a, iframe")).map(el => {
                return el.getAttribute("href") || el.getAttribute("src");
            }).filter(Boolean);

            const streams = [];

            for (const link of tabLinks) {
                const fullLink = fixUrl(link);
                if (fullLink.includes(".m3u8")) {
                    streams.push(new StreamResult({
                        url: fullLink,
                        source: "MangoPorn · HLS",
                        headers: {
                            "Referer": url,
                            "User-Agent": DEFAULT_HEADERS["User-Agent"]
                        }
                    }));
                } else if (fullLink.includes("player4me") || fullLink.includes("filemoon") || fullLink.includes("embed")) {
                    // Try fetching player embed to uncover video url
                    try {
                        const embedRes = await http_get(fullLink, { headers: { ...DEFAULT_HEADERS, "Referer": url } });
                        if (embedRes && embedRes.body) {
                            const m3u8Match = embedRes.body.match(/(https?:\/\/[^"'\s]+\.m3u8[^\s"']*)/i);
                            if (m3u8Match) {
                                streams.push(new StreamResult({
                                    url: m3u8Match[1],
                                    source: "MangoPorn · Stream",
                                    headers: {
                                        "Referer": fullLink,
                                        "User-Agent": DEFAULT_HEADERS["User-Agent"]
                                    }
                                }));
                            } else {
                                streams.push(new StreamResult({
                                    url: fullLink,
                                    source: "MangoPorn · Embed Player",
                                    headers: {
                                        "Referer": url,
                                        "User-Agent": DEFAULT_HEADERS["User-Agent"]
                                    }
                                }));
                            }
                        }
                    } catch (_) { }
                }
            }

            // Also check raw video / direct m3u8 in page
            const directMatch = html.match(/(https?:\/\/[^"'\s]+\.m3u8[^\s"']*)/i) || html.match(/(https?:\/\/[^"'\s]+\.mp4[^\s"']*)/i);
            if (directMatch) {
                streams.push(new StreamResult({
                    url: directMatch[1],
                    source: "MangoPorn · Direct",
                    headers: {
                        "Referer": url,
                        "User-Agent": DEFAULT_HEADERS["User-Agent"]
                    }
                }));
            }

            const seen = new Set();
            const unique = streams.filter(s => {
                if (seen.has(s.url)) return false;
                seen.add(s.url);
                return true;
            });

            if (unique.length === 0) {
                return cb({ success: false, errorCode: "NO_STREAMS", message: "No stream URLs found" });
            }

            cb({ success: true, data: unique });
        } catch (e) {
            cb({ success: false, errorCode: "STREAM_ERROR", message: String(e) });
        }
    }

    globalThis.getHome = getHome;
    globalThis.search = search;
    globalThis.load = load;
    globalThis.loadStreams = loadStreams;
})();
