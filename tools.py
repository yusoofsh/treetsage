"""
title: Google Maps Places Search
author: Yusoof Moh
author_url: https://github.com/yusoofsh
version: 1.0.0
license: MIT
requirements: requests
"""

import requests
import os
from typing import Dict, Any, Optional

class Tools:
    def __init__(self):
        # Configuration - these should match your Bun backend .env
        self.api_url = os.getenv("MAPS_API_URL", "http://localhost:3000")
        self.api_token = os.getenv("API_SECRET", "your-secure-secret-key-here")

        self.headers = {
            "Authorization": f"Bearer {self.api_token}",
            "Content-Type": "application/json"
        }

        # Verify connection on initialization
        self._verify_connection()

    def _verify_connection(self):
        """Verify the backend is accessible"""
        try:
            response = requests.get(f"{self.api_url}/health", timeout=5)
            if response.status_code == 200:
                print(f"✅ Connected to Maps API at {self.api_url}")
            else:
                print(f"⚠️ Maps API health check failed: {response.status_code}")
        except Exception as e:
            print(f"❌ Cannot connect to Maps API: {e}")

    def search_places(
        self,
        query: str,
        location: Optional[str] = None,
        type: Optional[str] = None,
        radius: int = 2000
    ) -> Dict[str, Any]:
        """
        Search for places using Google Maps API via Bun backend.

        Args:
            query: Search query for places (e.g., "restaurants", "coffee shops")
            location: Location bias (e.g., "New York, NY", "San Francisco, CA")
            type: Type of place (restaurant, gas_station, hospital, etc.)
            radius: Search radius in meters (default: 2000)

        Returns:
            Dictionary containing places data, map URL, and embed HTML
        """
        try:
            payload = {
                "query": query,
                "location": location,
                "type": type,
                "radius": radius
            }

            # Remove None values
            payload = {k: v for k, v in payload.items() if v is not None}

            print(f"🔍 Searching for: {query}" + (f" in {location}" if location else ""))

            response = requests.post(
                f"{self.api_url}/search-places",
                headers=self.headers,
                json=payload,
                timeout=30
            )

            if response.status_code == 200:
                data = response.json()

                # Format the response for the LLM
                places_info = []
                for i, place in enumerate(data['places'][:8], 1):  # Show top 8 places
                    rating_str = f" ⭐{place['rating']}" if place.get('rating') else ""
                    price_str = f" {'💰' * place['price_level']}" if place.get('price_level') else ""

                    places_info.append(
                        f"{i}. **{place['name']}**{rating_str}{price_str}\n"
                        f"   📍 {place['address']}"
                    )

                # Create a rich response
                result = {
                    "success": True,
                    "query": query,
                    "location": location,
                    "total_found": len(data['places']),
                    "places_summary": "\n\n".join(places_info),
                    "map_url": data['map_url'],
                    "embed_html": data['embed_html'],
                    "center_coordinates": f"{data['center_lat']:.4f}, {data['center_lng']:.4f}",
                    "message": f"Found {len(data['places'])} places for '{query}'" + (f" in {location}" if location else "")
                }

                return result

            elif response.status_code == 404:
                return {
                    "success": False,
                    "query": query,
                    "location": location,
                    "message": f"No places found for '{query}'" + (f" in {location}" if location else ""),
                    "suggestion": "Try a different search term or expand your search area."
                }
            elif response.status_code == 401:
                return {
                    "success": False,
                    "error": "Authentication failed",
                    "message": "API token is invalid. Check your configuration."
                }
            elif response.status_code == 429:
                return {
                    "success": False,
                    "error": "Rate limit exceeded",
                    "message": "Too many requests. Please wait a moment before trying again."
                }
            else:
                return {
                    "success": False,
                    "error": f"API request failed: {response.status_code}",
                    "message": response.text[:200] if response.text else "Unknown error"
                }

        except requests.exceptions.Timeout:
            return {
                "success": False,
                "error": "Request timeout",
                "message": "The request took too long. Google Maps might be slow right now."
            }
        except requests.exceptions.ConnectionError:
            return {
                "success": False,
                "error": "Connection error",
                "message": f"Cannot connect to the backend API at {self.api_url}. Make sure it's running."
            }
        except Exception as e:
            return {
                "success": False,
                "error": f"Unexpected error: {str(e)}",
                "message": "An unexpected error occurred while searching for places."
            }

    def get_directions(
        self,
        origin: str,
        destination: str,
        mode: str = "driving"
    ) -> Dict[str, Any]:
        """
        Get directions between two locations.

        Args:
            origin: Starting location (address, landmark, or coordinates)
            destination: Destination location (address, landmark, or coordinates)
            mode: Travel mode ("driving", "walking", "transit", "bicycling")

        Returns:
            Dictionary containing directions data and URL
        """
        try:
            payload = {
                "origin": origin,
                "destination": destination,
                "mode": mode
            }

            print(f"🗺️ Getting {mode} directions: {origin} → {destination}")

            response = requests.post(
                f"{self.api_url}/directions",
                headers=self.headers,
                json=payload,
                timeout=30
            )

            if response.status_code == 200:
                data = response.json()

                # Extract key information
                duration = data.get('duration', 'Unknown')
                distance = data.get('distance', 'Unknown')

                return {
                    "success": True,
                    "origin": origin,
                    "destination": destination,
                    "mode": mode.title(),
                    "duration": duration,
                    "distance": distance,
                    "start_address": data.get('start_address', origin),
                    "end_address": data.get('end_address', destination),
                    "directions_url": data['url'],
                    "message": f"{mode.title()} directions: {duration} ({distance})"
                }

            elif response.status_code == 404:
                return {
                    "success": False,
                    "origin": origin,
                    "destination": destination,
                    "mode": mode,
                    "message": f"No {mode} route found between these locations.",
                    "suggestion": "Try a different travel mode or check the addresses."
                }
            else:
                return {
                    "success": False,
                    "error": f"API request failed: {response.status_code}",
                    "message": response.text[:200] if response.text else "Unknown error"
                }

        except requests.exceptions.RequestException as e:
            return {
                "success": False,
                "error": f"Network error: {str(e)}",
                "message": "Failed to get directions from the backend API"
            }
        except Exception as e:
            return {
                "success": False,
                "error": f"Unexpected error: {str(e)}",
                "message": "An unexpected error occurred while getting directions"
            }

# Global instance
tools = Tools()

def search_places(
    query: str,
    location: str = "",
    type: str = "",
    radius: int = 2000
) -> str:
    """
    Search for places and return formatted results with map links.

    Use this when users ask about finding places, locations, businesses, or services.
    Examples: "find restaurants", "where can I get coffee", "gas stations nearby"
    """
    # Clean up parameters
    location = location.strip() if location else None
    type = type.strip() if type else None

    result = tools.search_places(query, location, type, radius)

    if result["success"]:
        # Create a rich, formatted response
        response = f"""🗺️ **{result['message']}**

{result['places_summary']}

**📍 Map & Directions:**
• [View all locations on Google Maps]({result['map_url']})
• Center coordinates: {result['center_coordinates']}
• Search radius: {radius/1000:.1f} km

💡 **Tip**: Click the map link to see all locations, get directions, check hours, read reviews, and see photos!
"""

        if location:
            response += f"\n🎯 **Search Area**: {location}"

        return response
    else:
        error_response = f"❌ **{result['message']}**"

        if result.get('suggestion'):
            error_response += f"\n\n💡 **Suggestion**: {result['suggestion']}"

        if result.get('error'):
            error_response += f"\n\n🔧 **Error Details**: {result['error']}"

        return error_response

def get_directions(
    origin: str,
    destination: str,
    mode: str = "driving"
) -> str:
    """
    Get directions between two locations.

    Use this when users ask for directions, routes, or how to get somewhere.
    Examples: "directions to", "how do I get to", "route from A to B"
    """
    # Validate mode
    valid_modes = ["driving", "walking", "transit", "bicycling"]
    if mode.lower() not in valid_modes:
        mode = "driving"
    else:
        mode = mode.lower()

    result = tools.get_directions(origin, destination, mode)

    if result["success"]:
        response = f"""🧭 **{result['mode']} Directions**

**📍 From**: {result['start_address']}
**📍 To**: {result['end_address']}

**⏱️ Duration**: {result['duration']}
**📏 Distance**: {result['distance']}

**🗺️ [View Turn-by-Turn Directions]({result['directions_url']})**

💡 **Tip**: Click the link above for detailed navigation, traffic conditions, and alternative routes!
"""
        return response
    else:
        error_response = f"❌ **Unable to get directions**\n\n{result['message']}"

        if result.get('suggestion'):
            error_response += f"\n\n💡 **Suggestion**: {result['suggestion']}"

        return error_response

def find_nearby(
    type: str,
    location: str = "",
    radius: int = 5000
) -> str:
    """
    Find nearby places of a specific type.

    Optimized for common searches like "nearby gas stations", "closest hospital", etc.
    """
    return search_places(
        query=type,
        location=location,
        type=type.lower().replace(" ", "_"),
        radius=radius
    )
