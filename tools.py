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
        self.api_url = os.getenv("MAPS_API_URL", "http://localhost:3000")
        self.api_token = os.getenv(
            "API_SECRET",
            "ed5e429045dda242702c62bb7618f33125eed7f4ee6b4ac02a70762364be198c",
        )
        self.headers = {
            "Authorization": f"Bearer {self.api_token}",
            "Content-Type": "application/json",
        }

    def search_places(
        self,
        query: str,
        location: Optional[str] = None,
        place_type: Optional[str] = None,
        radius: int = 2000,
    ) -> Dict[str, Any]:
        """Backend API call - keep your existing logic"""
        try:
            payload = {
                "query": query,
                "location": location,
                "type": place_type,
                "radius": radius,
            }
            payload = {k: v for k, v in payload.items() if v is not None}

            response = requests.post(
                f"{self.api_url}/search-places",
                headers=self.headers,
                json=payload,
                timeout=30,
            )

            if response.status_code == 200:
                data = response.json()
                places = data.get("places", [])
                return {
                    "success": True,
                    "query": query,
                    "location": location,
                    "total_found": len(places),
                    "places": places,
                    "place_embeds": data.get("place_embeds", []),
                    "map_url": data.get("map_url", ""),
                    "directions_url": data.get("directions_url", ""),
                    "embed_html": data.get("embed_html", ""),
                    "center_coordinates": f"{data.get('center_lat', 0):.4f}, {data.get('center_lng', 0):.4f}",
                    "message": f"Found {len(places)} places for '{query}'" + (f" in {location}" if location else ""),
                }
            else:
                return {
                    "success": False,
                    "query": query,
                    "location": location,
                    "message": f"No places found for '{query}'" + (f" in {location}" if location else ""),
                }
        except Exception as e:
            return {
                "success": False,
                "error": f"Unexpected error: {str(e)}",
                "message": "An unexpected error occurred while searching for places.",
            }

    def get_directions(
        self, origin: str, destination: str, mode: str = "driving"
    ) -> Dict[str, Any]:
        """Get directions from backend API"""
        try:
            payload = {"origin": origin, "destination": destination, "mode": mode.lower()}

            response = requests.post(
                f"{self.api_url}/directions",
                headers=self.headers,
                json=payload,
                timeout=30,
            )

            if response.status_code == 200:
                data = response.json()
                duration = data.get("duration", "Unknown")
                distance = data.get("distance", "Unknown")
                return {
                    "success": True,
                    "origin": origin,
                    "destination": destination,
                    "mode": mode.title(),
                    "duration": duration,
                    "distance": distance,
                    "start_address": data.get("start_address", origin),
                    "end_address": data.get("end_address", destination),
                    "directions_url": data.get("url", ""),
                    "message": f"{mode.title()} directions: {duration} ({distance})",
                }
            else:
                return {
                    "success": False,
                    "origin": origin,
                    "destination": destination,
                    "mode": mode,
                    "message": f"No {mode} route found between these locations.",
                }
        except Exception as e:
            return {
                "success": False,
                "error": f"Unexpected error: {str(e)}",
                "message": "An unexpected error occurred while getting directions",
            }

# Global instance
tools = Tools()


def search_places(query: str, location: str = "", place_type: str = "", radius: int = 2000) -> str:
    """
    Return structured data that tells OpenWebUI to render HTML
    """
    # Get the raw result
    location = location.strip() if location else None
    place_type = place_type.strip() if place_type else None

    result = tools.search_places(query, location, place_type, radius)

    if not result.get("success", False):
        return result.get('message', 'Search failed')

    places = result.get("places", [])
    place_embeds = result.get("place_embeds", [])

    if not places:
        return f"No places found for '{query}'" + (f" in {location}" if location else "")

    # Return a formatted response that includes the HTML embeds
    response_parts = []
    response_parts.append(f"Found {len(places)} places for '{query}'" + (f" in {location}" if location else ""))
    response_parts.append("")

    for i, place in enumerate(places[:5]):  # Limit to 5
        name = place.get("name", "Unknown Place")
        address = place.get("address", "Address not available")
        rating = place.get("rating")

        rating_text = f" (⭐ {rating})" if rating else ""

        response_parts.append(f"{i+1}. **{name}**{rating_text}")
        response_parts.append(f"   📍 {address}")

        # Include the embed HTML directly in the response
        if i < len(place_embeds):
            embed_data = place_embeds[i]
            embed_html = embed_data.get("embed_html", "")
            directions_url = embed_data.get("directions_url", "")

            if embed_html:
                response_parts.append("   " + embed_html)

            if directions_url:
                response_parts.append(f"   🧭 [Get Directions]({directions_url})")

        response_parts.append("")

    return "\n".join(response_parts)


def get_directions(origin: str, destination: str, mode: str = "driving") -> str:
    """Get directions and return HTML-formatted response"""
    result = tools.get_directions(origin, destination, mode)

    if result["success"]:
        return f'''<div>
        <h2>🧭 {result['mode']} Directions</h2>
        <p><strong>📍 From:</strong> {result['start_address']}</p>
        <p><strong>📍 To:</strong> {result['end_address']}</p>
        <p><strong>⏱️ Duration:</strong> {result['duration']}</p>
        <p><strong>📏 Distance:</strong> {result['distance']}</p>
        <p><a href="{result['directions_url']}" target="_blank">🗺️ <strong>View Turn-by-Turn Directions</strong></a></p>
        <p><em>💡 Tip: Click the link above for detailed navigation!</em></p>
        </div>'''
    else:
        error_html = f'<div>❌ <strong>Unable to get directions</strong><br><br>{result["message"]}'
        if result.get("suggestion"):
            error_html += f'<br><br>💡 <strong>Suggestion:</strong> {result["suggestion"]}'
        error_html += '</div>'
        return error_html


def find_nearby(place_type: str, location: str = "", radius: int = 5000) -> str:
    """Find nearby places"""
    return search_places(
        query=place_type,
        location=location,
        place_type=place_type.lower().replace(" ", "_"),
        radius=radius,
    )
