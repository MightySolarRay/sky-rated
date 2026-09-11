(function () {
    const API_BASE = "https://store.externulls.com";
    const DEFAULT_HEADERS = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
        "Referer": "https://beeg.com/"
    };


    function getBaseUrl() {
        if (typeof manifest !== "undefined" && manifest && manifest.baseUrl) {
            return manifest.baseUrl.replace(/\/+$/, "");
        }
        return "https://beeg.com";
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

    function parseApiItem(item) {
        try {
            const id = item.id || (item.file && item.file.id);
            if (!id) return null;

            let title = "";
            let desc = "";
            const dataArr = (item.file && item.file.data) || item.data || [];
            dataArr.forEach(d => {
                if (d.cd_file === "story_title" || d.cd_file === "title") title = d.cd_value;
                if (d.cd_file === "story_desc" || d.cd_file === "desc") desc = d.cd_value;
            });
            if (!title) title = `Video #${id}`;

            const hls = (item.file && item.file.hls_resources && item.file.hls_resources.fl_cdn_multi) || (item.hls_resources && item.hls_resources.fl_cdn_multi) || "";

            const posterUrl = `https://thumbs.externulls.com/photos/${id}/preview.webp`;

            return createItem({
                title: title.trim(),
                url: `https://beeg.com/${id}###${hls}`,
                posterUrl,
                type: "movie",
                description: desc.trim(),
                isAdult: false,
                                headers: { "Referer": "https://beeg.com/" }
            });
        } catch (_) {
            return null;
        }
    }

    async function getHome(cb) {
        try {
            const categories = [
                { name: "Trending", url: `${API_BASE}/facts/tag?id=27173&limit=36&offset=0` },
                { name: "Anal", url: `${API_BASE}/facts/tag?slug=Anal&limit=36&offset=0` },
                { name: "Big Tits", url: `${API_BASE}/facts/tag?slug=BigTits&limit=36&offset=0` },
                { name: "Big Ass", url: `${API_BASE}/facts/tag?slug=BigAss&limit=36&offset=0` },
                { name: "MILF", url: `${API_BASE}/facts/tag?slug=MILF&limit=36&offset=0` },
                { name: "Japanese", url: `${API_BASE}/facts/tag?slug=Japanese&limit=36&offset=0` },
                { name: "Lesbian", url: `${API_BASE}/facts/tag?slug=Lesbian&limit=36&offset=0` },
                { name: "Blowjob", url: `${API_BASE}/facts/tag?slug=Blowjob&limit=36&offset=0` },
                { name: "Creampie", url: `${API_BASE}/facts/tag?slug=Creampie&limit=36&offset=0` },
                { name: "POV", url: `${API_BASE}/facts/tag?slug=POV&limit=36&offset=0` }
            ];

            const homeData = {};
            await Promise.all(categories.map(async (cat) => {
                try {
                    const res = await http_get(cat.url, { headers: DEFAULT_HEADERS });
                    if (!res || !res.body) return;
                    const parsed = JSON.parse(res.body);
                    const files = parsed.fc_facts || parsed.files || [];
                    const items = files.map(parseApiItem).filter(Boolean);
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
            const searchUrl = `${API_BASE}/facts/tag?slug=${encodeURIComponent(query)}&limit=36&offset=0`;
            const res = await http_get(searchUrl, { headers: DEFAULT_HEADERS });
            if (!res || !res.body) {
                return cb({ success: false, errorCode: "EMPTY_SEARCH", message: "No data received" });
            }
            const parsed = JSON.parse(res.body);
            const files = parsed.fc_facts || parsed.files || [];
            const items = files.map(parseApiItem).filter(Boolean);
            cb({ success: true, data: items });
        } catch (e) {
            cb({ success: false, errorCode: "SEARCH_ERROR", message: String(e) });
        }
    }

    async function load(url, cb) {
        try {
            const parts = url.split("###");
            const cleanUrl = parts[0];
            const cachedHls = parts[1] || "";
            const idMatch = cleanUrl.match(/beeg\.com\/(\d+)/);
            if (!idMatch || !idMatch[1]) {
                return cb({ success: false, errorCode: "INVALID_URL", message: "Invalid Beeg URL" });
            }
            const id = idMatch[1];

            const apiUrl = `${API_BASE}/facts/file/${id}`;
            const res = await http_get(apiUrl, { headers: DEFAULT_HEADERS });
            if (!res || !res.body) {
                return cb({ success: false, errorCode: "LOAD_FAILED", message: "Failed to load video details" });
            }
            const root = JSON.parse(res.body);
            const file = root.file || (root.fc_facts && root.fc_facts[0]) || {};

            let title = "";
            let desc = "";
            (file.data || []).forEach(d => {
                if (d.cd_file === "story_title" || d.cd_file === "title") title = d.cd_value;
                if (d.cd_file === "story_desc" || d.cd_file === "desc") desc = d.cd_value;
            });
            if (!title) title = `Beeg Video #${id}`;

            const tags = (root.tags || []).map(t => (t.data || []).map(x => x.td_value)).flat().filter(Boolean);

            cb({
                success: true,
                data: createItem({
                    title: title.trim(),
                    url: `${cleanUrl}###${cachedHls}`,
                    posterUrl: `https://thumbs.externulls.com/photos/${id}/preview.webp`,
                    type: "movie",
                    description: desc.trim(),
                    tags,
                    isAdult: false,
                    episodes: [
                        createEpisode({
                            name: title.trim() || "Play Video",
                            url: `${cleanUrl}###${cachedHls}`,
                            season: 1,
                            episode: 1,
                            posterUrl: `https://thumbs.externulls.com/photos/${id}/preview.webp` || ""
                        })
                    ],
                                        headers: { "Referer": "https://beeg.com/" }
                })
            });
        } catch (e) {
            cb({ success: false, errorCode: "LOAD_ERROR", message: String(e) });
        }
    }

    async function loadStreams(url, cb) {
        try {
            const parts = url.split("###");
            const cleanUrl = parts[0];
            let hls = parts[1] || "";

            if (!hls) {
                const idMatch = cleanUrl.match(/beeg\.com\/(\d+)/);
                if (idMatch && idMatch[1]) {
                    const res = await http_get(`${API_BASE}/facts/file/${idMatch[1]}`, { headers: DEFAULT_HEADERS });
                    if (res && res.body) {
                        const root = JSON.parse(res.body);
                        hls = (root.file && root.file.hls_resources && root.file.hls_resources.fl_cdn_multi)
                            || (root.fc_facts && root.fc_facts[0] && root.fc_facts[0].hls_resources && root.fc_facts[0].hls_resources.fl_cdn_multi)
                            || "";
                    }
                }
            }

            if (!hls) {
                return cb({ success: false, errorCode: "NO_STREAMS", message: "No stream found for Beeg" });
            }

            cb({
                success: true,
                data: [
                    createStream({
                        url: `https://video.beeg.com/${hls}`,
                        source: "Beeg · HLS Adaptive",
                        headers: {
                            "Referer": "https://beeg.com/",
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
