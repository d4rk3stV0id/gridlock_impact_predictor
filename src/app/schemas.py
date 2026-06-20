from pydantic import AliasChoices, BaseModel, Field, field_validator


class PredictionRequest(BaseModel):
    """
    Data model for the incoming JSON payload when requesting an incident impact prediction.
    """
    latitude: float = Field(ge=12.5, le=13.5, description="Greater Bengaluru Latitude Bounds")
    longitude: float = Field(ge=77.2, le=78.0, description="Greater Bengaluru Longitude Bounds")
    vehicle_type: str = Field(
        min_length=1,
        max_length=100,
        validation_alias=AliasChoices("vehicle_type", "vehicle type", "veh_type"),
    )
    corridor: str = Field(min_length=1, max_length=200)
    priority: str = Field(min_length=1, max_length=50)
    event_cause: str = Field(default="unknown", min_length=1, max_length=100)
    description: str = Field(min_length=1, max_length=5000)
    start_datetime: str | None = Field(default=None)
    weather: str = Field(default="clear")

    @field_validator(
        "vehicle_type",
        "corridor",
        "priority",
        "event_cause",
        "description",
    )
    @classmethod
    def strip_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("must not be blank")
        return value


class PredictionResponse(BaseModel):
    """
    Data model for the JSON response returned after an incident impact prediction.
    Includes the model's prediction, severity classification, and routing context.
    """
    status: str = "success"
    estimated_resolution_time_minutes: float
    predicted_duration_minutes: float
    severity_level: str
    coordinates: dict[str, float]
    action_advisory: str
    weather_alert: str = Field(default="Normal Operations")
    description: str
    start_datetime: str | None = Field(default=None)
    formatted_duration: str
    is_hotspot: bool = False
    address: str | None = None
    dispatch_eta: float | None = None
    dispatch_distance: float | None = None


class LiveEvent(BaseModel):
    """
    Data model representing a single simulated live incident in the Active Broadcast feed.
    """
    id: str
    latitude: float
    longitude: float
    event_cause: str
    vehicle_type: str
    corridor: str
    priority: str
    description: str
    predicted_duration_minutes: float
    severity_level: str
    action_advisory: str
    weather_alert: str = Field(default="Normal Operations")
    start_datetime: str | None = Field(default=None)
    formatted_duration: str
    is_hotspot: bool = False
    address: str | None = None
    dispatch_eta: float | None = None
    dispatch_distance: float | None = None


class LiveEventsResponse(BaseModel):
    """
    Data model for the JSON response payload returning a batch of active simulated incidents.
    """
    status: str = "success"
    events: list[LiveEvent]


class DispatchAlertRequest(BaseModel):
    """
    Data model for dispatching automated Twilio WhatsApp alerts.
    """
    incident_cause: str
    severity: str
    address: str
    eta: int | float
