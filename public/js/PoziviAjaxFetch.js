// PoziviAjaxFetch.js
// Modul za komunikaciju sa backend-om koristeci fetch API.

const PoziviAjaxFetch = (function () {
    async function parseResponseBody(response) {
        const contentType = response.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
            try {
                return await response.json();
            } catch (_) {
                return null;
            }
        }

        // Fallback: pokusaj procitati tekst i vratiti ga kao poruku
        try {
            const text = await response.text();
            return text ? { message: text } : null;
        } catch (_) {
            return null;
        }
    }


    
    function request(method, url, body, callback) {
        const options = {
            method,
            cache: "no-store",
            headers: {
                "Accept": "application/json",
            },
        };

        if (body !== undefined) {
            options.headers["Content-Type"] = "application/json";
            options.body = JSON.stringify(body);
        }

        fetch(url, options)
            .then(async (response) => {
                const data = await parseResponseBody(response);
                callback(response.status, data);
            })
            .catch((err) => {
                // Network / CORS / DNS / offline...
                callback(0, { message: err?.message || "Network error" });
            });
    }

    return {
        getScenarios: function (callback) {
            request("GET", "/api/scenarios", undefined, callback);
        },

        updateScenarioStatus: function (scenarioId, status, callback) {
            request(
                "PUT",
                `/api/scenarios/${encodeURIComponent(scenarioId)}/status`,
                { status },
                callback
            );
        },

        postScenario: function (title, callback) {
            const body = {};
            if (typeof title === "string") body.title = title;
            request("POST", "/api/scenarios", body, callback);
        },

        deleteScenario: function (scenarioId, callback) {
            request(
                "DELETE",
                `/api/scenarios/${encodeURIComponent(scenarioId)}`,
                undefined,
                callback
            );
        },

        lockLine: function (scenarioId, lineId, userId, callback) {
            request(
                "POST",
                `/api/scenarios/${encodeURIComponent(scenarioId)}/lines/${encodeURIComponent(lineId)}/lock`,
                { userId },
                callback
            );
        },

        updateLine: function (scenarioId, lineId, userId, newText, callback) {
            request(
                "PUT",
                `/api/scenarios/${encodeURIComponent(scenarioId)}/lines/${encodeURIComponent(lineId)}`,
                { userId, newText },
                callback
            );
        },

        lockCharacter: function (scenarioId, characterName, userId, callback) {
            request(
                "POST",
                `/api/scenarios/${encodeURIComponent(scenarioId)}/characters/lock`,
                { userId, characterName },
                callback
            );
        },

        updateCharacter: function (scenarioId, userId, oldName, newName, callback) {
            request(
                "POST",
                `/api/scenarios/${encodeURIComponent(scenarioId)}/characters/update`,
                { userId, oldName, newName },
                callback
            );
        },

        getDeltas: function (scenarioId, since, callback) {
            const sinceValue = Number.isFinite(Number(since)) ? Number(since) : 0;
            request(
                "GET",
                `/api/scenarios/${encodeURIComponent(scenarioId)}/deltas?since=${encodeURIComponent(sinceValue)}`,
                undefined,
                callback
            );
        },

        releaseLineLocks: function (userId, callback) {
            request(
                "POST",
                "/api/locks/release",
                { userId },
                callback
            );
        },

        getScenario: function (scenarioId, callback) {
            request(
                "GET",
                `/api/scenarios/${encodeURIComponent(scenarioId)}`,
                undefined,
                callback
            );
        },
    };
})();
