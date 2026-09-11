(function () {
    const DEFAULT_HEADERS = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Cookie": "video_titles_translation=0"
    };


    function getBaseUrl() {
        if (typeof manifest !== "undefined" && manifest && manifest.baseUrl) {
            return manifest.baseUrl.replace(/\/+$/, "");
        }
        return "https://xhamster.com";
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
            const titleEl = block.querySelector("a.video-thumb-info__name") || block.querySelector("a[data-role='thumb-link']");
            if (!titleEl) return null;
            const title = (titleEl.textContent || titleEl.getAttribute("title") || "").trim();
            const href = titleEl.getAttribute("href");
            if (!href) return null;
            const fullUrl = fixUrl(href);

            const img = block.querySelector("img.thumb-image-container__image") || block.querySelector("img");
            let posterUrl = "";
            if (img) {
                posterUrl = img.getAttribute("src") || img.getAttribute("data-src") || "";
            }
            posterUrl = fixUrl(posterUrl);

            const durationEl = block.querySelector("span.thumb-image-container__duration");
            let duration = 0;
            if (durationEl) {
                const parts = durationEl.textContent.trim().split(":").map(p => parseInt(p, 10));
                if (parts.length === 2) duration = parts[0] + Math.round(parts[1] / 60);
                else if (parts.length === 3) duration = (parts[0] * 60) + parts[1];
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
            const sections = [
                { name: "Trending", path: "/newest/?geo=us" },
                { name: "Indian / Desi", path: "/categories/indian?geo=us" },
                { name: "Weekly Most Viewed", path: "/most-viewed/weekly/?geo=us" },
                { name: "Monthly Most Viewed", path: "/most-viewed/monthly/?geo=us" },
                { name: "4K UHD", path: "/4k/?geo=us" },
                { name: "1080p Full HD", path: "/hd/2?quality=1080p&geo=us" },
                { name: "Amateur", path: "/categories/amateur?geo=us" },
                { name: "Homemade", path: "/categories/homemade?geo=us" },
                { name: "Asian", path: "/categories/asian?geo=us" },
                { name: "JAV", path: "/categories/jav?geo=us" },
                { name: "Milf", path: "/categories/milf?geo=us" }
            ];

            const homeData = {};
            await Promise.all(sections.map(async (sec) => {
                try {
                    const res = await http_get(`${getBaseUrl()}${sec.path}`, { headers: DEFAULT_HEADERS });
                    if (!res || !res.body) return;
                    const doc = await parseHtml(res.body);
                    const blocks = Array.from(doc.querySelectorAll("div.thumb-list div.thumb-list__item"));
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
            const cleanQuery = query.replace(/\s+/g, "+");
            const searchUrl = `${getBaseUrl()}/search/${cleanQuery}/?page=1&x_platform_switch=desktop&geo=us`;
            const res = await http_get(searchUrl, { headers: DEFAULT_HEADERS });
            if (!res || !res.body) {
                return cb({ success: false, errorCode: "EMPTY_SEARCH", message: "No data received" });
            }
            const doc = await parseHtml(res.body);
            const blocks = Array.from(doc.querySelectorAll("div.thumb-list div.thumb-list__item"));
            const items = blocks.map(parseBlock).filter(Boolean);
            cb({ success: true, data: items });
        } catch (e) {
            cb({ success: false, errorCode: "SEARCH_ERROR", message: String(e) });
        }
    }

    async function load(url, cb) {
        try {
            const targetUrl = url.includes("?") ? `${url}&geo=us` : `${url}?geo=us`;
            const res = await http_get(targetUrl, { headers: DEFAULT_HEADERS });
            if (!res || !res.body) {
                return cb({ success: false, errorCode: "LOAD_ERROR", message: "Unable to load page" });
            }
            const html = res.body;
            const doc = await parseHtml(html);

            const titleEl = doc.querySelector("div.with-player-container h1") || doc.querySelector("h1");
            const title = (titleEl ? titleEl.textContent : doc.querySelector("meta[property='og:title']")?.getAttribute("content")) || "Video";

            let posterUrl = "";
            const preloadDiv = doc.querySelector("div.xp-preload-image");
            if (preloadDiv) {
                const style = preloadDiv.getAttribute("style") || "";
                const match = style.match(/https?:\/\/[^'")]+\.(?:jpg|png|webp|jpeg)/i);
                if (match) posterUrl = match[0];
            }
            if (!posterUrl) {
                posterUrl = doc.querySelector("meta[property='og:image']")?.getAttribute("content") || "";
            }
            posterUrl = fixUrl(posterUrl);

            const descEl = doc.querySelector("div.controls-info div.ab-info p") || doc.querySelector("meta[name='description']");
            const description = (descEl ? (descEl.textContent || descEl.getAttribute("content")) : "") || "";

            const tags = Array.from(doc.querySelectorAll("div[data-role='video-tags-list'] a")).map(el => el.textContent.trim()).filter(Boolean);

            const actors = Array.from(doc.querySelectorAll("a.entity-author-container__name")).map(aTag => {
                const nameEl = aTag.querySelector("span");
                const name = nameEl ? nameEl.textContent.trim() : aTag.textContent.trim();
                const imgEl = aTag.querySelector("img");
                const image = imgEl ? (imgEl.getAttribute("src") || imgEl.getAttribute("data-src")) : undefined;
                return new Actor({ name, image });
            }).filter(a => a.name);

            const recs = [];
            const relatedItems = Array.from(doc.querySelectorAll("div[data-role='related-item']"));
            relatedItems.slice(0, 10).forEach(item => {
                const nameEl = item.querySelector("a.video-thumb-info__name");
                const linkEl = item.querySelector("a[data-role='thumb-link']");
                const imgEl = item.querySelector("img");
                if (nameEl && linkEl) {
                    recs.push(createItem({
                        title: nameEl.textContent.trim(),
                        url: fixUrl(linkEl.getAttribute("href")),
                        posterUrl: fixUrl(imgEl ? (imgEl.getAttribute("src") || imgEl.getAttribute("data-src")) : ""),
                        type: "movie",
                        isAdult: false,
                                                headers: { "Referer": getBaseUrl() }
                    }));
                }
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
            const targetUrl = url.includes("?") ? `${url}&geo=us` : `${url}?geo=us`;
            const res = await http_get(targetUrl, { headers: DEFAULT_HEADERS });
            if (!res || !res.body) {
                return cb({ success: false, errorCode: "STREAM_ERROR", message: "Failed to load video page" });
            }
            const html = res.body;
            const streams = [];

            // 1. Check link[rel=preload][as=fetch] for m3u8
            const doc = await parseHtml(html);
            const preloadLinks = Array.from(doc.querySelectorAll("link[rel='preload'][as='fetch']"));
            for (const link of preloadLinks) {
                const href = link.getAttribute("href");
                if (href && href.includes(".m3u8")) {
                    streams.push(createStream({
                        url: fixUrl(href),
                        source: "xHamster · HLS Auto",
                        headers: {
                            "Referer": url,
                            "User-Agent": DEFAULT_HEADERS["User-Agent"]
                        }
                    }));
                }
            }

            // 2. Extract from window.initials
            const initialsMatch = html.match(/window\.initials\s*=\s*(\{.*?\});/s);
            if (initialsMatch) {
                try {
                    const parsed = JSON.parse(initialsMatch[1]);
                    const sources = parsed?.xplayerSettings?.sources;
                    if (sources?.hls?.h264?.url) {
                        streams.push(createStream({
                            url: fixUrl(sources.hls.h264.url),
                            source: "xHamster · HLS Master",
                            headers: {
                                "Referer": url,
                                "User-Agent": DEFAULT_HEADERS["User-Agent"]
                            }
                        }));
                    }
                    if (Array.isArray(sources?.standard?.h264)) {
                        sources.standard.h264.forEach(st => {
                            if (st.url) {
                                streams.push(createStream({
                                    url: fixUrl(st.url),
                                    source: `xHamster · ${st.quality || "MP4"}`,
                                    headers: {
                                        "Referer": url,
                                        "User-Agent": DEFAULT_HEADERS["User-Agent"]
                                    }
                                }));
                            }
                        });
                    }
                } catch (_) { }
            }

            // Deduplicate streams
            const seen = new Set();
            const uniqueStreams = streams.filter(s => {
                if (seen.has(s.url)) return false;
                seen.add(s.url);
                return true;
            });

            if (uniqueStreams.length === 0) {
                return cb({ success: false, errorCode: "NO_STREAMS", message: "No stream URLs found" });
            }

            cb({ success: true, data: uniqueStreams });
        } catch (e) {
            cb({ success: false, errorCode: "STREAM_ERROR", message: String(e) });
        }
    }

    globalThis.getHome = getHome;
    globalThis.search = search;
    globalThis.load = load;
    globalThis.loadStreams = loadStreams;
})();
