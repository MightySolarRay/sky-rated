(function () {
    const DEFAULT_HEADERS = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    };

    function fixUrl(url) {
        if (!url) return "";
        if (url.startsWith("//")) return "https:" + url;
        if (url.startsWith("/")) return manifest.baseUrl + url;
        return url;
    }

    function parseBlock(elem) {
        try {
            const titleEl = elem.querySelector("div.thumb_title");
            if (!titleEl) return null;
            const title = titleEl.textContent.trim();
            const linkEl = elem.querySelector("a.th");
            if (!linkEl) return null;
            const rawHref = linkEl.getAttribute("href");
            if (!rawHref) return null;
            const fullUrl = fixUrl(rawHref);

            const img = elem.querySelector("img");
            const posterUrl = img ? fixUrl(img.getAttribute("data-original") || img.getAttribute("src")) : "";

            const durEl = elem.querySelector("div.item_info span");
            let duration = 0;
            if (durEl) {
                const parts = durEl.textContent.trim().split(":");
                if (parts.length === 2) duration = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
            }

            return new MultimediaItem({
                title,
                url: fullUrl,
                posterUrl,
                type: "anime",
                duration,
                isAdult: false,
                                headers: { "Referer": manifest.baseUrl }
            });
        } catch (_) {
            return null;
        }
    }

    async function getHome(cb) {
        try {
            const categories = [
                { name: "Trending", path: "/?mode=async&function=get_block&block_id=custom_list_videos_most_recent_videos&tag_ids&sort_by=post_date" },
                { name: "Most Viewed", path: "/?mode=async&function=get_block&block_id=custom_list_videos_most_recent_videos&tag_ids&sort_by=video_viewed" },
                { name: "Top Rated", path: "/?mode=async&function=get_block&block_id=custom_list_videos_most_recent_videos&tag_ids&sort_by=rating" },
                { name: "Longest", path: "/?mode=async&function=get_block&block_id=custom_list_videos_most_recent_videos&tag_ids&sort_by=duration" }
            ];

            const homeData = {};
            await Promise.all(categories.map(async (cat) => {
                try {
                    const res = await http_get(`${manifest.baseUrl}${cat.path}`, { headers: DEFAULT_HEADERS });
                    if (!res || !res.body) return;
                    const doc = await parseHtml(res.body);
                    const items = Array.from(doc.querySelectorAll("div.item.thumb")).map(parseBlock).filter(Boolean).slice(0, 16);
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
            const searchUrl = `${manifest.baseUrl}/search/${encodeURIComponent(query)}/?temp_skip_items=tag:8754`;
            const res = await http_get(searchUrl, { headers: DEFAULT_HEADERS });
            if (!res || !res.body) {
                return cb({ success: false, errorCode: "EMPTY_SEARCH", message: "No data received" });
            }
            const doc = await parseHtml(res.body);
            const items = Array.from(doc.querySelectorAll("div.item.thumb")).map(parseBlock).filter(Boolean);
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
            const title = titleEl ? titleEl.textContent.trim() : "Rule34 Video";

            const desc = doc.querySelector("div.row em")?.textContent.trim() || doc.querySelector("meta[property='og:description']")?.getAttribute("content") || "";

            const tags = Array.from(doc.querySelectorAll("a.tag_item")).map(el => el.textContent.trim());

            const posterUrl = fixUrl(doc.querySelector("meta[property='og:image']")?.getAttribute("content"));

            const durEl = doc.querySelector("div.item_info:has(svg.custom-time) span") || doc.querySelector("div.item_info span");
            const duration = durEl ? parseInt(durEl.textContent.replace(/\D/g, ""), 10) : 0;

            const actors = Array.from(doc.querySelectorAll("div.col:has(.label) a.item .name")).map(el => new Actor({ name: el.textContent.trim(), role: "Artist" }));

            cb({
                success: true,
                data: new MultimediaItem({
                    title,
                    url,
                    posterUrl,
                    type: "anime",
                    description: desc,
                    tags,
                    duration,
                    isAdult: false,
                                        cast: actors,
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

            const streams = [];
            const videoRegex = /video_alt_url\d*:\s*'([^']+)'/g;
            const primaryRegex = /video_url:\s*'([^']+)'/g;

            let match;
            const collected = new Set();
            while ((match = videoRegex.exec(html)) !== null) {
                collected.add(match[1]);
            }
            while ((match = primaryRegex.exec(html)) !== null) {
                collected.add(match[1]);
            }

            collected.forEach(link => {
                let quality = "HD";
                if (link.includes("2160p") || link.includes("4k")) quality = "4K / 2160p";
                else if (link.includes("1080p")) quality = "1080p";
                else if (link.includes("720p")) quality = "720p";
                else if (link.includes("480p")) quality = "480p";
                else if (link.includes("360p")) quality = "360p";

                streams.push(new StreamResult({
                    url: link,
                    source: `Rule34Video · ${quality}`,
                    headers: {
                        "Referer": `${manifest.baseUrl}/`,
                        "User-Agent": DEFAULT_HEADERS["User-Agent"]
                    }
                }));
            });

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
