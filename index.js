import { file, serve } from "bun"

const API_KEY = process.env.GOOGLE_MAPS_API_KEY
if (!API_KEY) throw new Error("Missing GOOGLE_MAPS_API_KEY")

// Common CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
}

// Helper to wrap responses with CORS
function withCORS(body, init) {
  return new Response(body, {
    ...init,
    headers: {
      ...(init.headers || {}),
      ...corsHeaders,
    },
  })
}

const geocode = async (location) => {
  if (!location || /^-?\d+\.?\d*,-?\d+\.?\d*$/.test(location)) return location

  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
    location
  )}&key=${API_KEY}`
  const response = await fetch(url)
  const data = await response.json()

  if (data.status !== "OK" || !data.results?.length) {
    throw new Error(`Geocoding failed for "${location}"`)
  }

  const { lat, lng } = data.results[0].geometry.location
  return `${lat},${lng}`
}

const formatPlace = (place) => ({
  id: place.place_id,
  name: place.name,
  address: place.formatted_address,
  rating: place.rating,
  priceLevel: place.price_level,
  types: place.types,
  location: place.geometry.location,
  photoReference: place.photos?.[0]?.photo_reference,
  openNow: place.opening_hours?.open_now,
  mapLink: `https://www.google.com/maps/search/?api=1&query=${place.geometry.location.lat},${place.geometry.location.lng}`,
  embedUrl: `https://www.google.com/maps/embed/v1/place?key=${API_KEY}&q=${place.geometry.location.lat},${place.geometry.location.lng}`,
})

serve({
  port: 3000,

  fetch: async (req) => {
    const url = new URL(req.url)

    // Handle OPTIONS preflight
    if (req.method === "OPTIONS") {
      return withCORS(null, { status: 204 })
    }

    // Health check
    if (url.pathname === "/health") {
      return withCORS("OK")
    }

    // Serve OpenAPI JSON
    if (url.pathname === "/openapi.json") {
      return withCORS(await file("./openapi.json").text(), {
        headers: { "Content-Type": "application/json" },
      })
    }

    // Search places
    if (url.pathname === "/api/places/search" && req.method === "GET") {
      const { searchParams } = url
      const query = searchParams.get("query")
      const radius = searchParams.get("radius") || "50000"
      const type = searchParams.get("type")
      let location = searchParams.get("location")

      if (!query) {
        return withCORS(
          JSON.stringify({ error: "Query parameter is required" }),
          { status: 400 }
        )
      }

      const params = new URLSearchParams({ query, key: API_KEY })

      if (location) {
        location = await geocode(location)
        if (typeof location === "string") {
          params.append("location", location)
          params.append("radius", radius)
        }
      }

      if (type) params.append("type", type)

      const response = await fetch(
        `https://maps.googleapis.com/maps/api/place/textsearch/json?${params}`
      )
      const data = await response.json()

      if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
        return withCORS(
          JSON.stringify({
            error: "Google Places API error",
            status: data.status,
            message: data.error_message || "Unknown error",
          }),
          { status: 500 }
        )
      }

      return withCORS(
        JSON.stringify({
          results: data.results.map(formatPlace),
          status: data.status,
        }),
        { headers: { "Content-Type": "application/json" } }
      )
    }

    // Place details
    if (url.pathname === "/api/places/details" && req.method === "GET") {
      const placeId = url.searchParams.get("place_id")

      if (!placeId) {
        return withCORS(
          JSON.stringify({ error: "place_id parameter is required" }),
          { status: 400 }
        )
      }

      const apiUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&key=${API_KEY}&fields=name,formatted_address,formatted_phone_number,website,rating,reviews,opening_hours,photos,geometry`
      const response = await fetch(apiUrl)
      const data = await response.json()

      if (data.status !== "OK") {
        return withCORS(
          JSON.stringify({
            error: "Google Places API error",
            status: data.status,
          }),
          { status: 500 }
        )
      }

      return withCORS(JSON.stringify(data.result), {
        headers: { "Content-Type": "application/json" },
      })
    }

    return withCORS("Not Found", { status: 404 })
  },

  error(error) {
    console.error(error)
    return withCORS("Internal Server Error", { status: 500 })
  },
})

console.log("🚀 API server running on http://localhost:3000")
