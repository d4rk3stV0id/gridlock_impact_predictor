import os
from pathlib import Path
from dotenv import load_dotenv

SRC_DIR = Path(__file__).resolve().parents[1]
PROJECT_ROOT = SRC_DIR.parent
load_dotenv(PROJECT_ROOT / ".env")

TEMPLATES_DIR = SRC_DIR / "templates"
MODELS_DIR = SRC_DIR / "models"
MODEL_PATH = MODELS_DIR / "traffic_impact_model.joblib"
SPATIAL_CLUSTERER_PATH = MODELS_DIR / "spatial_clusterer.joblib"
DATA_DIR = PROJECT_ROOT / "data"

# Used only for legacy pipeline-only artifacts. New model bundles store these values.
DEFAULT_CENTER_LAT = 12.987356310526247
DEFAULT_CENTER_LON = 77.5954268560625

MAPPLS_REST_KEY = os.getenv("MAPPLS_REST_KEY")

TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN")
TWILIO_FROM_NUMBER = os.getenv("TWILIO_FROM_NUMBER")
TWILIO_TO_NUMBER = os.getenv("TWILIO_TO_NUMBER")
