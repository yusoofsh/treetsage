import { test, expect, describe } from "bun:test";

const BASE_URL = "http://localhost:3000";

describe("Places API", () => {
  test("health check", async () => {
    const response = await fetch(`${BASE_URL}/health`);
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(text).toBe("OK");
  });

  test("search with location name", async () => {
    const response = await fetch(
      `${BASE_URL}/api/places/search?query=pizza&location=New York&radius=5000`
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.results).toBeArray();
    expect(data.results.length).toBeGreaterThan(0);
    expect(data.results[0]).toHaveProperty("name");
    expect(data.results[0]).toHaveProperty("address");
    expect(data.results[0]).toHaveProperty("mapLink");
  });

  test("search with coordinates", async () => {
    const response = await fetch(
      `${BASE_URL}/api/places/search?query=restaurant&location=40.7128,-74.0060&radius=1000&type=restaurant`
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.results).toBeArray();
  });

  test("search without location", async () => {
    const response = await fetch(
      `${BASE_URL}/api/places/search?query=Starbucks`
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.results).toBeArray();
  });

  test("place details", async () => {
    // First get a place ID
    const searchResponse = await fetch(
      `${BASE_URL}/api/places/search?query=pizza&location=New York&radius=5000`
    );
    const searchData = await searchResponse.json();

    if (searchData.results?.[0]?.id) {
      const placeId = searchData.results[0].id;
      const response = await fetch(
        `${BASE_URL}/api/places/details?place_id=${placeId}`
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toHaveProperty("name");
    }
  });

  test("missing query parameter", async () => {
    const response = await fetch(`${BASE_URL}/api/places/search`);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Query parameter is required");
  });

  test("missing place_id parameter", async () => {
    const response = await fetch(`${BASE_URL}/api/places/details`);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("place_id parameter is required");
  });

  test("404 endpoint", async () => {
    const response = await fetch(`${BASE_URL}/nonexistent`);

    expect(response.status).toBe(500);
  });
});
