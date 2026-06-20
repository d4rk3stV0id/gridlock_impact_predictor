import httpx
import logging
from src.app.config import MAPPLS_REST_KEY

logger = logging.getLogger(__name__)

HQ_LAT = 12.9830
HQ_LON = 77.5906
TIMEOUT = 5.0  # seconds

async def get_reverse_geocode(lat: float, lon: float) -> str | None:
    """
    Fetch the human-readable address for a given latitude/longitude using the
    Mappls Reverse Geocoding API. Returns None if the API key is missing or
    the request fails.
    """
    if not MAPPLS_REST_KEY:
        return None
    url = f"https://apis.mappls.com/advancedmaps/v1/{MAPPLS_REST_KEY}/rev_geocode?lat={lat}&lng={lon}"
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            response = await client.get(url)
            response.raise_for_status()
            data = response.json()
            if data and "results" in data and len(data["results"]) > 0:
                return data["results"][0].get("formatted_address")
    except Exception as e:
        logger.warning(f"Mappls reverse geocode failed for ({lat}, {lon}): {e}")
    return None


async def get_dispatch_eta(target_lat: float, target_lon: float) -> tuple[float | None, float | None]:
    """
    Query the Mappls Advanced Routing API to determine the driving ETA (in minutes)
    and distance (in km) from the Operations HQ to the incident coordinates.
    Returns (None, None) if the request fails or key is missing.
    """
    if not MAPPLS_REST_KEY:
        return None, None
    url = f"https://apis.mappls.com/advancedmaps/v1/{MAPPLS_REST_KEY}/route_adv/driving/{HQ_LON},{HQ_LAT};{target_lon},{target_lat}"
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            response = await client.get(url)
            response.raise_for_status()
            data = response.json()
            if data and "routes" in data and len(data["routes"]) > 0:
                route = data["routes"][0]
                duration_sec = route.get("duration")
                distance_m = route.get("distance")
                
                eta_minutes = round(duration_sec / 60.0, 1) if duration_sec is not None else None
                distance_km = round(distance_m / 1000.0, 1) if distance_m is not None else None
                return eta_minutes, distance_km
    except Exception as e:
        logger.warning(f"Mappls dispatch ETA failed for ({target_lat}, {target_lon}): {e}")
    return None, None
