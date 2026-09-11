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
            const linkEl = post.querySelector("h3 a") || post.querySelector("a");
            if (!linkEl) return null;
            const title = (linkEl.textContent || linkEl.getAttribute("title") || "").trim();
            const href = linkEl.getAttribute("href");
            if (!href) return null;
            const fullUrl = fixUrl(href);

            const img = post.querySelector("img");
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
                                headers: { "Referer": manifest.baseUrl }
            });
        } catch (e) {
            return null;
        }
    }

    async function fetchCategory(baseUrl, catId) {
        try {
            const formData = `action=grid_ajax_load_more&cat_id=${catId}&current_posts=0&type=`;
            const res = await http_post(`${baseUrl}/wp-admin/admin-ajax.php`, {
                headers: {
                    ...DEFAULT_HEADERS,
                    "Content-Type": "application/x-www-form-urlencoded"
                },
                body: formData
            });
            if (!res || !res.body) return [];
            const doc = await parseHtml(res.body);
            const posts = Array.from(doc.querySelectorAll("div.home_post_cont, div.post"));
            return posts.map(parseBlock).filter(Boolean).slice(0, 16);
        } catch (_) {
            return [];
        }
    }

    async function getHome(cb) {
        try {
            const cats = [
                { name: "Trending MMS", base: manifest.baseUrl, id: 4 },
                { name: "Desi Shorts", base: "https://shorts.desisins.com", id: -1 },
                { name: "Viral Indian", base: manifest.baseUrl, id: 19 },
                { name: "Desi Models", base: manifest.baseUrl, id: 2 },
                { name: "Solo Desi", base: manifest.baseUrl, id: 8 },
                { name: "Live Show", base: manifest.baseUrl, id: 7 },
                { name: "Roleplay", base: manifest.baseUrl, id: 426 },
                { name: "Premium Desi", base: manifest.baseUrl, id: 668 }
            ];

            const homeData = {};
            await Promise.all(cats.map(async (cat) => {
                const items = await fetchCategory(cat.base, cat.id);
                if (items.length > 0) {
                    homeData[cat.name] = items;
                }
            }));

            // If empty ajax response, fallback to homepage scraping
            if (Object.keys(homeData).length === 0) {
                const res = await http_get(manifest.baseUrl, { headers: DEFAULT_HEADERS });
                if (res && res.body) {
                    const doc = await parseHtml(res.body);
                    const posts = Array.from(doc.querySelectorAll("div.home_post_cont, article.post"));
                    const items = posts.map(parseBlock).filter(Boolean).slice(0, 20);
                    if (items.length > 0) {
                        homeData["Trending Desi"] = items;
                    }
                }
            }

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
            const posts = Array.from(doc.querySelectorAll("div.home_post_cont, article.post"));
            const items = posts.map(parseBlock).filter(Boolean);
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

            const metaPoster = doc.querySelector("meta[property='og:image']")?.getAttribute("content") || "";
            const desc = doc.querySelector("div.g1-meta")?.textContent || doc.querySelector("meta[property='og:description']")?.getAttribute("content") || "";

            cb({
                success: true,
                data: new MultimediaItem({
                    title: title.trim(),
                    url,
                    posterUrl: fixUrl(metaPoster),
                    type: "movie",
                    description: desc.trim(),
                    isAdult: false,
                    episodes: [
                        new Episode({
                            name: title.trim() || "Play Video",
                            url: url,
                            season: 1,
                            episode: 1,
                            posterUrl: fixUrl(metaPoster) || ""
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

            let luluDocId = "";
            const luluMatch = html.match(/docid=([a-zA-Z0-9]+)/i) || html.match(/lulustream\.com\/[e\/]+([a-zA-Z0-9]+)/i);
            if (luluMatch) {
                luluDocId = luluMatch[1];
            }

            const streams = [];
            if (luluDocId) {
                const luluUrl = `https://lulustream.com/e/${luluDocId}`;
                streams.push(new StreamResult({
                    url: luluUrl,
                    source: "Desisins · LuluStream",
                    headers: {
                        "Referer": `${manifest.baseUrl}/`,
                        "User-Agent": DEFAULT_HEADERS["User-Agent"]
                    }
                }));
            }

            // Also check standard video sources or iframes
            const iframe = doc.querySelector("iframe");
            if (iframe) {
                const src = iframe.getAttribute("src");
                if (src) {
                    streams.push(new StreamResult({
                        url: fixUrl(src),
                        source: "Desisins · Embed Player",
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
