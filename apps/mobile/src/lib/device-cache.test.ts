import { ApiError } from "./api-error";
import { fetchWithDeviceCache, readCached, writeCached } from "./device-cache";

// expo-sqlite's kv-store is native: stand in an in-memory map with the same sync API.
jest.mock("expo-sqlite/kv-store", () => {
  const data = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      getItemSync: (key: string) => data.get(key) ?? null,
      setItemSync: (key: string, value: string) => void data.set(key, value),
      removeItemSync: (key: string) => void data.delete(key),
    },
  };
});

const numbers = {
  parse: (data: unknown) => {
    if (!Array.isArray(data)) throw new Error("not a list");
    return data as number[];
  },
};
const offline = () => Promise.reject(new ApiError("Can't reach the API", null));

describe("fetchWithDeviceCache", () => {
  it("saves every successful answer, and uses it when offline", async () => {
    await fetchWithDeviceCache("a", numbers, async () => [1, 2]);

    expect(await fetchWithDeviceCache("a", numbers, offline)).toEqual([1, 2]);
  });

  it("also covers a server error (5xx)", async () => {
    writeCached("b", [3]);
    expect(await fetchWithDeviceCache("b", numbers, () => Promise.reject(new ApiError("Down", 503)))).toEqual([3]);
  });

  it("passes a real answer like 404 on, and forgets the saved copy", async () => {
    writeCached("c", [4]);
    const gone = new ApiError("Routine not found.", 404, "RoutineNotFound");

    await expect(fetchWithDeviceCache("c", numbers, () => Promise.reject(gone))).rejects.toBe(gone);
    expect(readCached("c", numbers)).toBeUndefined();
  });

  it("fails when offline with nothing saved", async () => {
    await expect(fetchWithDeviceCache("never", numbers, offline)).rejects.toBeInstanceOf(ApiError);
  });

  it("ignores a saved copy in an old shape", () => {
    writeCached("d", { old: true });
    expect(readCached("d", numbers)).toBeUndefined();
  });
});
