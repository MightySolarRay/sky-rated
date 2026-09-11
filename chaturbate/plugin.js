(function () {
    const DEFAULT_HEADERS = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
        "X-Requested-With": "XMLHttpRequest"
    };

    function parseRoom(room) {
        try {
            if (!room.username) return null;
            if (room.gender === "s" || room.gender === "m") return null;

            return new MultimediaItem({
                title: `${room.username} ${room.subject ? "· " + room.subject : ""}`.trim(),
                url: `${manifest.baseUrl}/${room.username}`,
                posterUrl: room.img || "",
                type: "livestream",
                isAdult: false,
                                headers: { "Referer": `${manifest.baseUrl}/` }
            });
        } catch (_) {
            return null;
        }
    }

    async function getHome(cb) {
        try {
            const categories = [
                { name: "Featured", path: "/api/ts/roomlist/room-list/?limit=60" },
                { name: "Female", path: "/api/ts/roomlist/room-list/?genders=f&limit=60" },
                { name: "Couples", path: "/api/ts/roomlist/room-list/?genders=c&limit=60" },
                { name: "Asia", path: "/api/ts/roomlist/room-list/?regions=AS&limit=60" },
                { name: "North America", path: "/api/ts/roomlist/room-list/?regions=NA&limit=60" },
                { name: "Europe", path: "/api/ts/roomlist/room-list/?regions=ER&limit=60" },
                { name: "MILF", path: "/api/ts/roomlist/room-list/?hashtags=milf&limit=60" },
                { name: "Teen", path: "/api/ts/roomlist/room-list/?hashtags=teen&limit=60" },
                { name: "Latina", path: "/api/ts/roomlist/room-list/?hashtags=latina&limit=60" }
            ];

            const homeData = {};
            await Promise.all(categories.map(async (cat) => {
                try {
                    const res = await http_get(`${manifest.baseUrl}${cat.path}`, { headers: DEFAULT_HEADERS });
                    if (!res || !res.body) return;
                    const parsed = JSON.parse(res.body);
                    const rooms = parsed.rooms || [];
                    const items = rooms.map(parseRoom).filter(Boolean).slice(0, 16);
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
            const searchUrl = `${manifest.baseUrl}/api/ts/roomlist/room-list/?keywords=${encodeURIComponent(query)}&limit=60&offset=0`;
            const res = await http_get(searchUrl, { headers: DEFAULT_HEADERS });
            if (!res || !res.body) {
                return cb({ success: false, errorCode: "EMPTY_SEARCH", message: "No data received" });
            }
            const parsed = JSON.parse(res.body);
            const rooms = parsed.rooms || [];
            const items = rooms.map(parseRoom).filter(Boolean);
            cb({ success: true, data: items });
        } catch (e) {
            cb({ success: false, errorCode: "SEARCH_ERROR", message: String(e) });
        }
    }

    async function load(url, cb) {
        try {
            const res = await http_get(url, { headers: { ...DEFAULT_HEADERS, "Referer": `${manifest.baseUrl}/` } });
            if (!res || !res.body) {
                return cb({ success: false, errorCode: "LOAD_ERROR", message: "Failed to load room" });
            }
            const doc = await parseHtml(res.body);

            const title = (doc.querySelector("meta[property='og:title']")?.getAttribute("content") || "Live Room").replace("| PornHoarder.tv", "").trim();
            const poster = doc.querySelector("[property='og:image']")?.getAttribute("content") || "";
            const desc = doc.querySelector("meta[property='og:description']")?.getAttribute("content") || "";

            cb({
                success: true,
                data: new MultimediaItem({
                    title,
                    url,
                    posterUrl: poster,
                    type: "livestream",
                    description: desc.trim(),
                    isAdult: false,
                    episodes: [
                        new Episode({
                            name: title || "Play Video",
                            url: url,
                            season: 1,
                            episode: 1,
                            posterUrl: poster || ""
                        })
                    ],
                                        headers: { "Referer": `${manifest.baseUrl}/` }
                })
            });
        } catch (e) {
            cb({ success: false, errorCode: "LOAD_ERROR", message: String(e) });
        }
    }

    async function loadStreams(url, cb) {
        try {
            const username = url.split("/").filter(Boolean).pop();
            if (!username) {
                return cb({ success: false, errorCode: "INVALID_URL", message: "Invalid Chaturbate URL" });
            }

            const apiUrl = `https://chaturbate.com/api/chatvideocontext/${username}/`;
            const res = await http_get(apiUrl, {
                headers: {
                    ...DEFAULT_HEADERS,
                    "Referer": url,
                    "Accept": "application/json"
                }
            });

            if (!res || !res.body) {
                return cb({ success: false, errorCode: "API_ERROR", message: "No stream data received" });
            }

            const parsed = JSON.parse(res.body);
            const m3u8Url = parsed.hls_source;

            if (!m3u8Url) {
                return cb({ success: false, errorCode: "OFFLINE", message: "Model is currently offline" });
            }

            cb({
                success: true,
                data: [
                    new StreamResult({
                        url: m3u8Url,
                        source: "Chaturbate · Live HLS",
                        headers: {
                            "Referer": `${manifest.baseUrl}/`,
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
