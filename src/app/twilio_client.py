import httpx
import logging
from src.app.config import TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER, TWILIO_TO_NUMBER

logger = logging.getLogger(__name__)

async def send_dispatch_alert(incident_cause: str, severity: str, address: str, eta: int | float) -> bool:
    """
    Send an automated WhatsApp dispatch alert via Twilio REST API.
    """
    if not all([TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER, TWILIO_TO_NUMBER]):
        logger.warning("Twilio credentials missing. Dispatch alert skipped.")
        return False
        
    url = f"https://api.twilio.com/2010-04-01/Accounts/{TWILIO_ACCOUNT_SID}/Messages.json"
    message = f"🚨 MERIDIAN DISPATCH: {severity} {incident_cause} reported at {address}. Unit ETA: {eta} mins."
    
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
