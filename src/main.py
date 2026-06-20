from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Depends, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.staticfiles import StaticFiles

from src.app.config import TEMPLATES_DIR
from src.app.live_events import load_live_dataset, sample_live_events
from src.app.model import load_model, predict_resolution
from src.app.schemas import (
    LiveEventsResponse,
    PredictionRequest,
    PredictionResponse,
    DispatchAlertRequest,
)
from src.app.twilio_client import send_dispatch_alert


@asynccontextmanager
async def lifespan(_: FastAPI):
    """
    Application lifespan context manager.
    Pre-loads the ML model and the live dataset into memory upon startup
    to ensure fast initial responses.
    """
    load_model()
    load_live_dataset()
    yield


app = FastAPI(
    title="Meridian: Live Impact Operations Center",
    version="1.1.0",
    lifespan=lifespan,
)
app.mount("/static", StaticFiles(directory="src/static"), name="static")
templates = Jinja2Templates(directory=str(TEMPLATES_DIR))


@app.get("/", response_class=HTMLResponse, include_in_schema=False)
async def read_root(request: Request):
    return templates.TemplateResponse(
        request=request,
        name="index.html",
        context={},
    )


@app.post("/predict", response_model=PredictionResponse)
@app.post("/api/predict", response_model=PredictionResponse, include_in_schema=False)
async def predict_impact(data: PredictionRequest):
    """
    Predict the resolution time and severity for a given traffic incident.
    Returns estimated clear time, action advisories, and Mappls location routing context.
    """
    return await predict_resolution(data)


@app.get("/api/live-events", response_model=LiveEventsResponse)
async def get_live_events(weather: str = "clear"):
    """
    Fetch a sample of live simulated events from historical data.
    Automatically scores their predicted impact under current (or specified) weather.
    """
    return await sample_live_events(weather=weather)

@app.post("/login")
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    """
    Authenticate an operator for the control room dashboard.
    """
    if form_data.username == "operator" and form_data.password == "hackathon2026":
        return {"access_token": "operator_token_123", "token_type": "bearer"}
    raise HTTPException(status_code=401, detail="Incorrect username or password")


@app.post("/api/dispatch-alert")
async def dispatch_alert(data: DispatchAlertRequest):
    """
    Trigger an automated WhatsApp dispatch alert via Twilio.
    """
    try:
        success = await send_dispatch_alert(
            incident_cause=data.incident_cause,
            severity=data.severity,
            address=data.address,
            eta=data.eta
        )
        return {"status": "success" if success else "failed"}
    except Exception:
        return {"status": "failed"}

if __name__ == "__main__":
    import uvicorn

    uvicorn.run("src.main:app", host="127.0.0.1", port=8000, reload=True)
