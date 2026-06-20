import random
from datetime import datetime, timedelta
from functools import lru_cache

import pandas as pd
import asyncio

from src.app.config import DATA_DIR
from src.app.model import calculate_severity, predict_minutes, generate_advisory, apply_weather_modifier, generate_weather_alert, translate_description, format_duration, check_hotspot, load_model
from src.app.schemas import LiveEvent, LiveEventsResponse, PredictionRequest
from src.app.mappls_client import get_reverse_geocode, get_dispatch_eta


LIVE_EVENT_COLUMNS = [
    "id",
    "latitude",
    "longitude",
    "veh_type",
    "corridor",
    "priority",
    "event_cause",
    "description",
    "start_datetime",
]


def find_dataset():
    """
    Locate the single anonymized incident CSV file in the data directory.
    Raises an error if zero or multiple CSVs are found.
    """
    csv_files = sorted(DATA_DIR.glob("*.csv"))
    if len(csv_files) != 1:
        raise RuntimeError(
            f"Expected exactly one CSV file in {DATA_DIR}, found {len(csv_files)}."
        )
    return csv_files[0]


@lru_cache(maxsize=1)
def load_live_dataset() -> pd.DataFrame:
    """
    Load, clean, and cache the incident dataset into a Pandas DataFrame.
    Filters out invalid coordinates and fills missing values with safe defaults.
    Cached in memory to speed up subsequent live feed sampling requests.
    """
    dataset = pd.read_csv(find_dataset(), usecols=LIVE_EVENT_COLUMNS)
    dataset["latitude"] = pd.to_numeric(dataset["latitude"], errors="coerce")
    dataset["longitude"] = pd.to_numeric(dataset["longitude"], errors="coerce")
    dataset = dataset.dropna(subset=["latitude", "longitude"])
    dataset = dataset[
        dataset["latitude"].between(-90, 90)
        & dataset["longitude"].between(-180, 180)
    ].copy()

    defaults = {
        "id": "UNASSIGNED",
        "veh_type": "others",
        "corridor": "Non-corridor",
        "priority": "Low",
        "event_cause": "others",
        "description": "Traffic disruption reported.",
    }
    for column, default in defaults.items():
        dataset[column] = dataset[column].fillna(default).astype(str).str.strip()
        dataset.loc[dataset[column] == "", column] = default

    if dataset.empty:
        raise RuntimeError("The dataset contains no valid live-event coordinates.")
    return dataset


async def sample_live_events(weather: str = "clear") -> LiveEventsResponse:
    """
    Simulate a real-time stream of incidents by sampling from historical data.
    Automatically scores the sampled incidents using the ML model and retrieves
    live Mappls routing/address information for each.
    """
    dataset = load_live_dataset()
    actual_count = random.randint(3, 6)
    sample = dataset.sample(n=min(actual_count, len(dataset)), replace=False)
    
    offsets = sorted([random.randint(10, 1080) for _ in range(len(sample))])
    current_time = datetime.now()
    synthetic_times = [(current_time - timedelta(minutes=off)).isoformat() for off in offsets]

    requests = [
        PredictionRequest(
            latitude=float(row.latitude),
            longitude=float(row.longitude),
            vehicle_type=row.veh_type,
            corridor=row.corridor,
            priority=row.priority,
            event_cause=row.event_cause,
            description=translate_description(row.description),
            start_datetime=synthetic_time,
            weather=weather,
        )
        for row, synthetic_time in zip(sample.itertuples(index=False), synthetic_times)
    ]
    predictions = predict_minutes(requests)

    async def fetch_mappls_data(lat, lon):
        address_task = get_reverse_geocode(lat, lon)
        eta_task = get_dispatch_eta(lat, lon)
        address, (dispatch_eta, dispatch_distance) = await asyncio.gather(address_task, eta_task)
        return address, dispatch_eta, dispatch_distance

    mappls_results = await asyncio.gather(*[fetch_mappls_data(float(row.latitude), float(row.longitude)) for row in sample.itertuples(index=False)])

    events = []
    bundle = load_model()
    for request, row, minutes, (address, dispatch_eta, dispatch_distance) in zip(requests, sample.itertuples(index=False), predictions, mappls_results):
        is_hotspot = check_hotspot(float(row.latitude), float(row.longitude), bundle.spatial_clusterer)
        final_minutes = apply_weather_modifier(minutes, row.event_cause, weather)
        weather_alert = generate_weather_alert(float(row.latitude), float(row.longitude), weather, is_hotspot)
        severity = calculate_severity(final_minutes)
        advisory = generate_advisory(final_minutes, row.veh_type, row.event_cause)
        formatted_dur = format_duration(final_minutes)
        events.append(
            LiveEvent(
                id=row.id,
                latitude=float(row.latitude),
                longitude=float(row.longitude),
                event_cause=row.event_cause.replace("_", " ").title(),
                vehicle_type=row.veh_type.replace("_", " ").title(),
                corridor=row.corridor,
                priority=row.priority,
                description=request.description,
                predicted_duration_minutes=round(final_minutes, 2),
                severity_level=severity,
                action_advisory=advisory,
                weather_alert=weather_alert,
                start_datetime=request.start_datetime,
                formatted_duration=formatted_dur,
                is_hotspot=is_hotspot,
                address=address,
                dispatch_eta=dispatch_eta,
                dispatch_distance=dispatch_distance,
            )
        )
    return LiveEventsResponse(events=events)
