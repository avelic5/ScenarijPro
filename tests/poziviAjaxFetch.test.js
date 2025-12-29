const PoziviAjaxFetch = require("../public/js/PoziviAjaxFetch");

function makeHeaders(contentType) {
  return {
    get: (name) => {
      if (!name) return null;
      if (String(name).toLowerCase() === "content-type") return contentType;
      return null;
    },
  };
}

function makeFetchResponse({ status, contentType, jsonData, textData, jsonThrows = false }) {
  return {
    status,
    headers: makeHeaders(contentType),
    json: async () => {
      if (jsonThrows) throw new Error("Invalid JSON");
      return jsonData;
    },
    text: async () => textData,
  };
}

function flushPromises() {
  return new Promise((resolve) => setImmediate(resolve));
}

describe("PoziviAjaxFetch (Zadatak 2)", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  test("modul izlaže obavezne metode", () => {
    expect(typeof PoziviAjaxFetch).toBe("object");
    expect(typeof PoziviAjaxFetch.postScenario).toBe("function");
    expect(typeof PoziviAjaxFetch.lockLine).toBe("function");
    expect(typeof PoziviAjaxFetch.updateLine).toBe("function");
    expect(typeof PoziviAjaxFetch.lockCharacter).toBe("function");
    expect(typeof PoziviAjaxFetch.updateCharacter).toBe("function");
    expect(typeof PoziviAjaxFetch.getDeltas).toBe("function");
    expect(typeof PoziviAjaxFetch.getScenario).toBe("function");
  });

  test("postScenario šalje POST /api/scenarios i zove callback(status,obj)", async () => {
    fetch.mockResolvedValue(
      makeFetchResponse({
        status: 200,
        contentType: "application/json",
        jsonData: { id: 1, title: "X", content: [] },
      })
    );

    const cb = jest.fn();
    PoziviAjaxFetch.postScenario("X", cb);
    await flushPromises();

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe("/api/scenarios");
    expect(options.method).toBe("POST");
    expect(options.headers.Accept).toMatch(/application\/json/i);
    expect(options.headers["Content-Type"]).toMatch(/application\/json/i);
    expect(JSON.parse(options.body)).toEqual({ title: "X" });

    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(200, { id: 1, title: "X", content: [] });
  });

  test("lockLine šalje POST /api/scenarios/:id/lines/:lineId/lock sa userId", async () => {
    fetch.mockResolvedValue(
      makeFetchResponse({
        status: 200,
        contentType: "application/json",
        jsonData: { message: "Linija je uspjesno zakljucana!" },
      })
    );

    const cb = jest.fn();
    PoziviAjaxFetch.lockLine(2, 5, 7, cb);
    await flushPromises();

    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe("/api/scenarios/2/lines/5/lock");
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body)).toEqual({ userId: 7 });
    expect(cb).toHaveBeenCalledWith(200, { message: "Linija je uspjesno zakljucana!" });
  });

  test("updateLine šalje PUT /api/scenarios/:id/lines/:lineId sa userId i newText", async () => {
    fetch.mockResolvedValue(
      makeFetchResponse({
        status: 200,
        contentType: "application/json",
        jsonData: { message: "Linija je uspjesno azurirana!" },
      })
    );

    const cb = jest.fn();
    const newText = ["A", "B"];
    PoziviAjaxFetch.updateLine(3, 9, 11, newText, cb);
    await flushPromises();

    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe("/api/scenarios/3/lines/9");
    expect(options.method).toBe("PUT");
    expect(JSON.parse(options.body)).toEqual({ userId: 11, newText });
    expect(cb).toHaveBeenCalledWith(200, { message: "Linija je uspjesno azurirana!" });
  });

  test("deleteLine šalje DELETE /api/scenarios/:id/lines/:lineId sa userId", async () => {
    fetch.mockResolvedValue(
      makeFetchResponse({
        status: 200,
        contentType: "application/json",
        jsonData: { message: "Linija je uspjesno obrisana!" },
      })
    );

    const cb = jest.fn();
    PoziviAjaxFetch.deleteLine(3, 9, 11, cb);
    await flushPromises();

    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe("/api/scenarios/3/lines/9");
    expect(options.method).toBe("DELETE");
    expect(JSON.parse(options.body)).toEqual({ userId: 11 });
    expect(cb).toHaveBeenCalledWith(200, { message: "Linija je uspjesno obrisana!" });
  });

  test("lockCharacter šalje POST /api/scenarios/:id/characters/lock", async () => {
    fetch.mockResolvedValue(
      makeFetchResponse({
        status: 200,
        contentType: "application/json",
        jsonData: { message: "Ime lika je uspjesno zakljucano!" },
      })
    );

    const cb = jest.fn();
    PoziviAjaxFetch.lockCharacter(1, "HERO", 4, cb);
    await flushPromises();

    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe("/api/scenarios/1/characters/lock");
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body)).toEqual({ userId: 4, characterName: "HERO" });
    expect(cb).toHaveBeenCalledWith(200, { message: "Ime lika je uspjesno zakljucano!" });
  });

  test("updateCharacter šalje POST /api/scenarios/:id/characters/update", async () => {
    fetch.mockResolvedValue(
      makeFetchResponse({
        status: 200,
        contentType: "application/json",
        jsonData: { message: "Ime lika je uspjesno promijenjeno!" },
      })
    );

    const cb = jest.fn();
    PoziviAjaxFetch.updateCharacter(8, 2, "OLD", "NEW", cb);
    await flushPromises();

    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe("/api/scenarios/8/characters/update");
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body)).toEqual({ userId: 2, oldName: "OLD", newName: "NEW" });
    expect(cb).toHaveBeenCalledWith(200, { message: "Ime lika je uspjesno promijenjeno!" });
  });

  test("getDeltas šalje GET /api/scenarios/:id/deltas?since= i normalizuje since na broj", async () => {
    fetch.mockResolvedValue(
      makeFetchResponse({
        status: 200,
        contentType: "application/json",
        jsonData: { deltas: [] },
      })
    );

    const cb = jest.fn();
    PoziviAjaxFetch.getDeltas(6, "abc", cb);
    await flushPromises();

    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe("/api/scenarios/6/deltas?since=0");
    expect(options.method).toBe("GET");
    expect(cb).toHaveBeenCalledWith(200, { deltas: [] });
  });

  test("getScenario šalje GET /api/scenarios/:id", async () => {
    fetch.mockResolvedValue(
      makeFetchResponse({
        status: 200,
        contentType: "application/json",
        jsonData: { id: 1, title: "T", status: "U radu", content: [] },
      })
    );

    const cb = jest.fn();
    PoziviAjaxFetch.getScenario(1, cb);
    await flushPromises();

    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe("/api/scenarios/1");
    expect(options.method).toBe("GET");
    expect(cb).toHaveBeenCalledWith(200, { id: 1, title: "T", status: "U radu", content: [] });
  });

  test("ako fetch pukne (nema servera), callback se pozove sa status=0", async () => {
    fetch.mockRejectedValue(new Error("Network down"));

    const cb = jest.fn();
    PoziviAjaxFetch.getScenario(1, cb);
    await flushPromises();

    expect(cb).toHaveBeenCalledTimes(1);
    const [status, data] = cb.mock.calls[0];
    expect(status).toBe(0);
    expect(data).toHaveProperty("message");
  });

  test("ako server vrati text/plain, modul vraća {message: text}", async () => {
    fetch.mockResolvedValue(
      makeFetchResponse({
        status: 500,
        contentType: "text/plain",
        textData: "Oops",
      })
    );

    const cb = jest.fn();
    PoziviAjaxFetch.getScenario(1, cb);
    await flushPromises();

    expect(cb).toHaveBeenCalledWith(500, { message: "Oops" });
  });

  test("ako je content-type JSON ali json() baci grešku, callback dobije objekat", async () => {
    fetch.mockResolvedValue(
      makeFetchResponse({
        status: 400,
        contentType: "application/json",
        jsonThrows: true,
      })
    );

    const cb = jest.fn();
    PoziviAjaxFetch.postScenario("X", cb);
    await flushPromises();

    const [status, data] = cb.mock.calls[0];
    expect(status).toBe(400);
    expect(data).toBeTruthy();
    expect(typeof data).toBe("object");
  });
});
