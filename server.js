// server.js - Fixed Bun backend for Maps LLM
import { Hono } from "hono"
import { bearerAuth } from "hono/bearer-auth"
import { cors } from "hono/cors"

const app = new Hono()

// Configuration from environment variables
const config = {
  googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY,
  apiSecret: process.env.API_SECRET,
  port: process.env.PORT || 3000,
}

if (!config.googleMapsApiKey) {
  console.error("❌ GOOGLE_MAPS_API_KEY environment variable is required")
  process.exit(1)
}

if (!config.apiSecret) {
  console.error("❌ API_SECRET environment variable is required")
  process.exit(1)
}

// Rate limiting storage (in-memory)
const rateLimitStore = new Map()

// Custom rate limiter middleware
const customRateLimiter = async (c, next) => {
  const clientIP = c.req.header("x-forwarded-for") || "unknown"
  const now = Date.now()
  const windowMs = 60 * 60 * 1000 // 1 hour
  const maxRequests = 100

  // Clean old requests
  const clientRequests = rateLimitStore.get(clientIP) || []
  const validRequests = clientRequests.filter((time) => now - time < windowMs)

  if (validRequests.length >= maxRequests) {
    return c.json(
      {
        error: "Rate limit exceeded",
        message: `Max ${maxRequests} requests per hour`,
      },
      429
    )
  }

  validRequests.push(now)
  rateLimitStore.set(clientIP, validRequests)

  await next()
}

// Middleware
app.use(
  "*",
  cors({
    origin: [
      "http://localhost:3000",
      "http://localhost:5173",
      "http://127.0.0.1:5173",
    ],
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "OPTIONS"],
  })
)

// Health check (no auth required)
app.get("/health", (c) => {
  return c.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
  })
})

// Protected routes
app.use("/search-places", bearerAuth({ token: config.apiSecret }))
app.use("/directions", bearerAuth({ token: config.apiSecret }))
app.use("/search-places", customRateLimiter)
app.use("/directions", customRateLimiter)

// Google Maps API helper functions
async function callGoogleMapsAPI(endpoint, params) {
  const url = new URL(`https://maps.googleapis.com/maps/api/${endpoint}`)
  url.searchParams.set("key", config.googleMapsApiKey)

  Object.entries(params).forEach(([key, value]) => {
    if (value !== null && value !== undefined) {
      url.searchParams.set(key, value.toString())
    }
  })

  const response = await fetch(url.toString())

  if (!response.ok) {
    throw new Error(
      `Google Maps API error: ${response.status} ${response.statusText}`
    )
  }

  const data = await response.json()

  if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
    throw new Error(
      `Google Maps API status: ${data.status} - ${
        data.error_message || "Unknown error"
      }`
    )
  }

  return data
}

async function geocodeLocation(address) {
  try {
    const data = await callGoogleMapsAPI("geocode/json", {
      address: address,
    })

    if (data.results && data.results.length > 0) {
      return data.results[0].geometry.location
    }
    return null
  } catch (error) {
    console.error("Geocoding error:", error)
    return null
  }
}

async function searchPlaces(
  query,
  location = null,
  radius = 2000,
  placeType = null
) {
  try {
    let locationBias = null

    // Geocode location if provided
    if (location) {
      locationBias = await geocodeLocation(location)
    }

    let data

    if (locationBias) {
      // Use nearby search
      const params = {
        location: `${locationBias.lat},${locationBias.lng}`,
        radius: radius,
        keyword: query,
      }

      if (placeType) {
        params.type = placeType
      }

      data = await callGoogleMapsAPI("place/nearbysearch/json", params)
    } else {
      // Use text search
      data = await callGoogleMapsAPI("place/textsearch/json", {
        query: query,
      })
    }

    return data.results || []
  } catch (error) {
    console.error("Places search error:", error)
    throw error
  }
}

async function getDirections(origin, destination, mode = "driving") {
  try {
    const data = await callGoogleMapsAPI("directions/json", {
      origin: origin,
      destination: destination,
      mode: mode,
      departure_time: "now",
    })

    return data.routes || []
  } catch (error) {
    console.error("Directions error:", error)
    throw error
  }
}

function generateEmbedHtml(places) {
  if (!places || places.length === 0) {
    return ""
  }

  // Create individual iframes for each place (limit to top 5 for performance)
  const placesToShow = places.slice(0, 5)

  return placesToShow.map((place) => {
    const embedUrl =
      `https://www.google.com/maps/embed/v1/place?` +
      `key=${config.googleMapsApiKey}` +
      `&q=place_id:${place.place_id}` +
      `&zoom=15`

    const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination_place_id=${
      place.place_id
    }&destination=${encodeURIComponent(place.name)}`

    return {
      place_id: place.place_id,
      name: place.name,
      embed_html: `<div style="margin-bottom:16px;">
        <iframe
          width="100%"
          height="300"
          frameborder="0"
          style="border:0;border-radius:8px;"
          src="${embedUrl}"
          allowfullscreen
          loading="lazy">
        </iframe>
      </div>`,
      directions_url: directionsUrl,
    }
  })
}

function generateMapUrl(places) {
  if (!places || places.length === 0) {
    return ""
  }

  // Create a search URL that shows multiple results
  const firstPlace = places[0]
  return `https://www.google.com/maps/search/${encodeURIComponent(
    firstPlace.name
  )}/@${firstPlace.location.lat},${firstPlace.location.lng},13z`
}

// API Routes
app.post("/search-places", async (c) => {
  try {
    const body = await c.req.json()
    const { query, location, radius = 2000, type } = body

    if (!query) {
      return c.json({ error: "Query parameter is required" }, 400)
    }

    console.log(
      `🔍 Searching for: "${query}" ${location ? `in ${location}` : ""}`
    )

    const places = await searchPlaces(query, location, radius, type)

    if (places.length === 0) {
      return c.json(
        {
          error: "No places found",
          message: `No results for "${query}"${
            location ? ` in ${location}` : ""
          }`,
        },
        404
      )
    }

    // Process places data
    const processedPlaces = places.slice(0, 10).map((place) => ({
      name: place.name || "",
      address: place.vicinity || place.formatted_address || "",
      rating: place.rating || null,
      price_level: place.price_level || null,
      place_id: place.place_id || "",
      location: place.geometry?.location || { lat: 0, lng: 0 },
      types: place.types || [],
    }))

    // Calculate center point
    const totalLat = processedPlaces.reduce(
      (sum, place) => sum + place.location.lat,
      0
    )
    const totalLng = processedPlaces.reduce(
      (sum, place) => sum + place.location.lng,
      0
    )
    const centerLat = totalLat / processedPlaces.length
    const centerLng = totalLng / processedPlaces.length

    // Generate individual embeds and URLs for each place
    const placeEmbeds = generateEmbedHtml(processedPlaces)
    const mapUrl = generateMapUrl(processedPlaces)

    return c.json({
      places: processedPlaces,
      place_embeds: placeEmbeds, // Array of individual embed data
      map_url: mapUrl,
      directions_url:
        placeEmbeds.length > 0 ? placeEmbeds[0].directions_url : "", // Keep for backward compatibility
      center_lat: centerLat,
      center_lng: centerLng,
      total_results: places.length,
    })
  } catch (error) {
    console.error("Search places error:", error)
    return c.json(
      {
        error: "Search failed",
        message: error.message,
      },
      500
    )
  }
})

app.post("/directions", async (c) => {
  try {
    const body = await c.req.json()
    const { origin, destination, mode = "driving" } = body

    if (!origin || !destination) {
      return c.json({ error: "Origin and destination are required" }, 400)
    }

    console.log(`🗺️ Getting directions: ${origin} → ${destination} (${mode})`)

    const routes = await getDirections(origin, destination, mode)

    if (routes.length === 0) {
      return c.json(
        {
          error: "No directions found",
          message: `No route found from "${origin}" to "${destination}"`,
        },
        404
      )
    }

    const route = routes[0]
    const leg = route.legs[0]

    const directionsUrl = `https://www.google.com/maps/dir/${encodeURIComponent(
      origin
    )}/${encodeURIComponent(destination)}/`

    return c.json({
      directions: route,
      url: directionsUrl,
      duration: leg.duration.text,
      distance: leg.distance.text,
      start_address: leg.start_address,
      end_address: leg.end_address,
      mode: mode,
    })
  } catch (error) {
    console.error("Directions error:", error)
    return c.json(
      {
        error: "Directions failed",
        message: error.message,
      },
      500
    )
  }
})

// LLM integration endpoint
app.post("/llm-function", async (c) => {
  try {
    const body = await c.req.json()
    const { function_name: functionName, parameters = {} } = body

    let endpoint
    if (functionName === "search_places") {
      endpoint = "/search-places"
    } else if (functionName === "get_directions") {
      endpoint = "/directions"
    } else {
      return c.json({ error: "Unknown function name" }, 400)
    }

    const internalUrl = `http://localhost:${config.port}${endpoint}`
    return await app.fetch(
      new Request(internalUrl, {
        method: "POST",
        headers: c.req.header(),
        body: JSON.stringify(parameters),
      })
    )
  } catch (error) {
    console.error("LLM function error:", error)
    return c.json(
      {
        error: "Function call failed",
        message: error.message,
      },
      500
    )
  }
})

// Start server
const port = config.port

export default {
  port: port,
  fetch: app.fetch,
}
