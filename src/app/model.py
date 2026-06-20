from dataclasses import dataclass
from datetime import datetime
from functools import lru_cache
import math
from typing import Any

import joblib
import numpy as np
import pandas as pd
from deep_translator import GoogleTranslator
import asyncio
from src.app.mappls_client import get_reverse_geocode, get_dispatch_eta

from src.app.config import (
    DEFAULT_CENTER_LAT,
    DEFAULT_CENTER_LON,
    MODEL_PATH,
    SPATIAL_CLUSTERER_PATH,
)
from src.app.schemas import PredictionRequest, PredictionResponse

HOTSPOTS = [
    (12.9176, 77.6226), # Central Silk Board
    (13.0354, 77.5975), # Hebbal Flyover
    (12.9304, 77.6784), # ORR Bellandur Axis
    (13.0040, 77.6650), # Tin Factory Junction
]

def check_hotspot(lat: float, lon: float, spatial_clusterer: Any = None) -> bool:
    """
    Check if a given coordinate falls within a predefined hotspot radius.
    Uses the fitted KMeans spatial clusterer if available, otherwise falls back
    to an exact distance check against hardcoded hotspot center coordinates.
    """
    if spatial_clusterer is not None:
        coords = np.array([[lat, lon]])
        distances = spatial_clusterer.transform(coords)
        if float(distances.min()) <= 0.0135:
            return True

    for h_lat, h_lon in HOTSPOTS:
        dist = math.hypot(lat - h_lat, lon - h_lon)
        if dist <= 0.0135:
            return True
    return False


@dataclass(frozen=True)
class ModelBundle:
    pipeline: Any
    center_lat: float
    center_lon: float
    spatial_clusterer: Any


@lru_cache(maxsize=1)
def load_model() -> ModelBundle:
    """
    Load the trained XGBoost model pipeline and Spatial Clusterer from disk.
    Results are cached in memory to avoid repetitive IO.
    Throws a RuntimeError if the model binary is missing.
    """
    if not MODEL_PATH.is_file():
        raise RuntimeError(
            f"Model file not found: {MODEL_PATH}. Run `py -m src.train` first."
        )

    spatial_clusterer = None
    if SPATIAL_CLUSTERER_PATH.is_file():
        spatial_clusterer = joblib.load(SPATIAL_CLUSTERER_PATH)

    artifact = joblib.load(MODEL_PATH)
    if isinstance(artifact, dict) and "pipeline" in artifact:
        bundle = ModelBundle(
            pipeline=artifact["pipeline"],
            center_lat=float(artifact["center_lat"]),
            center_lon=float(artifact["center_lon"]),
            spatial_clusterer=spatial_clusterer,
        )
    else:
        bundle = ModelBundle(
            pipeline=artifact,
            center_lat=DEFAULT_CENTER_LAT,
            center_lon=DEFAULT_CENTER_LON,
            spatial_clusterer=spatial_clusterer,
        )

    # Prediction does not need CUDA and CPU inference avoids device mismatch warnings.
    model = getattr(bundle.pipeline, "named_steps", {}).get("model")
    fitted_regressor = getattr(model, "regressor_", None)
    if fitted_regressor is not None and hasattr(fitted_regressor, "set_params"):
        fitted_regressor.set_params(device="cpu")

    return bundle


def build_feature_record(
    payload: PredictionRequest,
    center_lat: float,
    center_lon: float,
    spatial_clusterer: Any = None,
) -> dict[str, float | str]:
    """
    Convert a prediction request payload into the exact feature format required
    by the XGBoost pipeline. Includes rotating coordinates by 45 degrees,
    extracting distance from center, and encoding cyclical time features (sin/cos).
    """
    angle = math.pi / 4
    latitude = payload.latitude
    longitude = payload.longitude

    if payload.start_datetime:
        try:
            dt = pd.to_datetime(payload.start_datetime)
            hour = dt.hour
            dow = dt.dayofweek
            month = dt.month
        except Exception:
            now = datetime.now().astimezone()
            hour = now.hour
            dow = now.weekday()
            month = now.month
    else:
        now = datetime.now().astimezone()
        hour = now.hour
        dow = now.weekday()
        month = now.month

    hour_sin = math.sin(2 * math.pi * hour / 24)
    hour_cos = math.cos(2 * math.pi * hour / 24)
    dow_sin = math.sin(2 * math.pi * dow / 7)
    dow_cos = math.cos(2 * math.pi * dow / 7)
    is_weekend = 1.0 if dow >= 5 else 0.0
    is_rush_hour = 1.0 if (8 <= hour <= 10 or 17 <= hour <= 20) else 0.0
    month_sin = math.sin(2 * math.pi * month / 12)
    month_cos = math.cos(2 * math.pi * month / 12)

    record = {
        "description": payload.description,
        "veh_type": payload.vehicle_type.lower().strip(),
        "corridor": payload.corridor.lower().strip(),
        "priority": payload.priority.lower().strip(),
        "event_cause": payload.event_cause.lower().strip(),
        "latitude": latitude,
        "longitude": longitude,
        "rot45_lat": latitude * math.cos(angle) - longitude * math.sin(angle),
        "rot45_lon": latitude * math.sin(angle) + longitude * math.cos(angle),
        "distance_to_center": math.hypot(
            latitude - center_lat,
            longitude - center_lon,
        ),
        "hour_sin": hour_sin,
        "hour_cos": hour_cos,
        "dow_sin": dow_sin,
        "dow_cos": dow_cos,
        "is_weekend": is_weekend,
        "is_rush_hour": is_rush_hour,
        "month_sin": month_sin,
        "month_cos": month_cos,
    }

    # Compute distance to nearest learned spatial hotspot
    if spatial_clusterer is not None:
        coords = np.array([[latitude, longitude]])
        distances = spatial_clusterer.transform(coords)
        record["distance_to_nearest_hotspot"] = float(distances.min())
    else:
        record["distance_to_nearest_hotspot"] = 0.0

    return record


def predict_minutes(payloads: list[PredictionRequest]) -> list[float]:
    bundle = load_model()
    features = pd.DataFrame(
        [
            build_feature_record(
                payload,
                center_lat=bundle.center_lat,
                center_lon=bundle.center_lon,
                spatial_clusterer=bundle.spatial_clusterer,
            )
            for payload in payloads
        ]
    )
    predictions = bundle.pipeline.predict(features)
    return [max(0.0, float(value)) for value in predictions]


def calculate_severity(minutes: float) -> str:
    """
    Categorize the severity of an incident based on its predicted clearance time.
    """
    if minutes < 45:
        return "Low Impact"
    if minutes <= 120:
        return "Moderate Delay"
    return "Severe Congestion Risk"


def generate_advisory(minutes: float, vehicle_type: str, event_cause: str) -> str:
    """
    Generate tactical, action-oriented advisory messages for the control room
    operators based on the cause of the incident and its expected duration.
    """
    veh = vehicle_type.lower().strip()
    cause = event_cause.lower().strip()

    if cause in ["water_logging", "water logging"]:
        return "HYDRO ALERT: Severe flooding detected. Dispatch municipal drainage pumps and utility assets to coordinates immediately."
        
    if cause in ["tree_fall", "tree fall"]:
        return "OBSTRUCTION ALERT: Fallen tree blocking gridway. Dispatch emergency chainsaw response units and municipal clearance teams."
        
    if cause == "accident":
        return "EMERGENCY RESPONSE: Collision incident logged. Coordinate emergency services dispatch and initiate upstream lane diversions."

    if cause in ["debris"]:
        return "ROAD CLEARANCE: Debris reported on carriageway. Dispatch municipal sweepers and alert approaching traffic."
        
    if cause in ["protest", "public_event", "public event", "vip_movement", "vip movement", "procession"]:
        return "TRAFFIC CONTROL: Major gathering or VIP movement. Alert traffic police for manual route diversion and crowd management."
        
    if cause in ["fog / low visibility", "fog", "low visibility"]:
        return "HAZARD: Low visibility conditions. Activate electronic warning signs and reduce corridor speed limits."
        
    if cause in ["pot_holes", "pot holes", "road_conditions", "road conditions"]:
        return "INFRASTRUCTURE: Road surface degradation causing bottleneck. Log for emergency patching and dispatch warning barricades."
        
    if cause == "construction":
        return "WORK ZONE: Active construction slowing flow. Verify barricade placement and update navigation providers."

    # Heavy vehicle handling (whether breakdown or congestion)
    if veh in ["heavy_vehicle", "heavy vehicle", "truck", "bmtc_bus", "bmtc bus", "ksrtc_bus", "ksrtc bus", "private_bus", "private bus"]:
        if minutes > 45:
            return "CRITICAL DISPATCH: Heavy transport blockage causing major delay. Deploy heavy-duty towing cranes immediately."
        return "HEAVY ASSET DISPATCH: Large vehicle stalled. Coordinate heavy-duty tow crane standby."
        
    if cause in ["vehicle_breakdown", "vehicle breakdown"]:
        return "TOW DISPATCH: Light vehicle breakdown. Dispatch standard roadside assistance and tow truck to clear active lane."
        
    if minutes > 60:
        return "CONGESTION MANAGEMENT: Severe volume delay. Increase green-light timing on parallel arterial corridors."

    return "MONITOR: Standard patrol tracking. Normal corridor throughput expected to resume shortly."


def apply_weather_modifier(minutes: float, cause: str, weather: str) -> float:
    cause = cause.lower().strip()
    if weather == "heavy_rain" and cause in ["water_logging", "accident", "congestion"]:
        return minutes * 1.35
    if weather == "light_rain" and cause in ["water_logging", "accident", "congestion"]:
        return minutes * 1.15
    return minutes

def format_duration(minutes: float) -> str:
    if minutes < 60:
        return f"{int(minutes)} min"
    return f"{round(minutes / 60, 1)} hours"

def translate_description(text: str) -> str:
    try:
        translated = GoogleTranslator(source='auto', target='en').translate(text)
        return translated if translated else text
    except Exception:
        return text

def generate_weather_alert(lat: float, lon: float, weather: str, is_hotspot: bool) -> str:
    if weather == "heavy_rain" and is_hotspot:
        return "CRITICAL CHOKEPOINT: High risk of localized flash flooding. Prioritize immediate asset intervention."
    return "Normal Weather Conditions"

async def predict_resolution(payload: PredictionRequest) -> PredictionResponse:
    """
    Orchestrate the full end-to-end prediction pipeline for a single request:
    1. Translate the operator's description to English.
    2. Run the core XGBoost inference.
    3. Apply rule-based modifiers (weather, hotspots).
    4. Fetch location context asynchronously from Mappls.
    """
    bundle = load_model()
    translated_desc = translate_description(payload.description)
    payload.description = translated_desc
    
    base_minutes = predict_minutes([payload])[0]
    final_minutes = apply_weather_modifier(base_minutes, payload.event_cause, payload.weather)
    is_hotspot = check_hotspot(payload.latitude, payload.longitude, bundle.spatial_clusterer)
    weather_alert = generate_weather_alert(payload.latitude, payload.longitude, payload.weather, is_hotspot)

    rounded_minutes = round(final_minutes, 2)
    formatted_dur = format_duration(final_minutes)
    severity = calculate_severity(final_minutes)
    advisory = generate_advisory(final_minutes, payload.vehicle_type, payload.event_cause)

    address_task = get_reverse_geocode(payload.latitude, payload.longitude)
    eta_task = get_dispatch_eta(payload.latitude, payload.longitude)
    address, (dispatch_eta, dispatch_distance) = await asyncio.gather(address_task, eta_task)

    return PredictionResponse(
        estimated_resolution_time_minutes=rounded_minutes,
        predicted_duration_minutes=rounded_minutes,
        severity_level=severity,
        coordinates={"lat": payload.latitude, "lng": payload.longitude},
        action_advisory=advisory,
        weather_alert=weather_alert,
        description=translated_desc,
        start_datetime=payload.start_datetime,
        formatted_duration=formatted_dur,
        is_hotspot=is_hotspot,
        address=address,
        dispatch_eta=dispatch_eta,
        dispatch_distance=dispatch_distance,
    )
