import httpx
import logging
from src.app.config import TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER, TWILIO_TO_NUMBER

logger = logging.getLogger(__name__)

async def send_dispatch_alert(incident_cause: str, severity: str, address: str, eta: int | float, agency: str = "Police") -> bool:
    """
    Send an automated WhatsApp dispatch alert via Twilio REST API.
    """
    if not all([TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER, TWILIO_TO_NUMBER]):
        logger.warning("Twilio credentials missing. Dispatch alert skipped.")
        return False
        
    url = f"https://api.twilio.com/2010-04-01/Accounts/{TWILIO_ACCOUNT_SID}/Messages.json"
    
    # Custom message formatting based on agency
    if agency.lower() == "fire":
        message = f"🚒 MERIDIAN FIRE DISPATCH: {severity} {incident_cause} reported at {address}. Unit ETA: {eta} mins. Proceed with caution."
    elif agency.lower() == "ambulance":
        message = f"🚑 MERIDIAN EMS DISPATCH: {severity} {incident_cause} at {address}. Medical assistance required. Unit ETA: {eta} mins."
    else:
        message = f"🚓 MERIDIAN POLICE DISPATCH: {severity} {incident_cause} reported at {address}. Secure the scene. Unit ETA: {eta} mins."
    
    payload = {
        "From": TWILIO_FROM_NUMBER,
        "To": TWILIO_TO_NUMBER,
        "Body": message
    }
    
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                url,
                auth=(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN),
                data=payload
            )
            if response.status_code != 201:
                logger.error(f"Twilio error response: {response.text}")
            response.raise_for_status()
            return True
    except Exception as e:
        logger.error(f"Twilio dispatch alert failed: {e}")
        return False
