import os
import logging
from src.app.schemas import SitRepRequest

logger = logging.getLogger(__name__)

async def generate_sitrep(data: SitRepRequest) -> str:
    """
    Generates a Situation Report (Sit-Rep) using Gemini if an API key is available,
    otherwise returns a highly realistic mock report.
    """
    api_key = os.environ.get("GEMINI_API_KEY")
    
    prompt = f"""
    You are an AI assistant for a traffic control room operator. 
    Based on the following incident data, generate a brief, professional Situation Report (Sit-Rep) 
    and a recommended action plan. Keep it under 4 sentences.
    
    Incident Type: {data.incident_type}
    Location: {data.location}
    Severity: {data.severity}
    Estimated Clearance: {data.clearance_time} minutes
    Weather: {data.weather}
    Notes: {data.notes}
    """

    if api_key:
        try:
            # We use the google-genai package for real requests
            from google import genai
            client = genai.Client(api_key=api_key)
            response = client.models.generate_content(
                model='gemini-2.5-flash',
                contents=prompt,
            )
            return response.text
        except Exception as e:
            logger.error(f"Gemini API generation failed: {e}")
            # Fall back to mock
            pass
            
    # Mock fallback
    action = "Dispatch traffic police to direct vehicles."
    if "Fire" in data.incident_type or "Fire" in data.notes:
        action = "Dispatch Fire Brigade immediately."
    elif data.severity.lower() in ["high", "critical", "severe"]:
        action = "Dispatch rapid response team and notify local hospital to prepare for potential casualties."

    weather_note = ""
    if data.weather.lower() != "clear":
        weather_note = f" Note that {data.weather} conditions may impede recovery efforts."

    mock_response = f"Situation Report: A {data.severity} severity {data.incident_type} has occurred at {data.location}. Estimated clearance time is {data.clearance_time} minutes.{weather_note} Recommended Action: {action} Broadcast advisory on public channels to avoid the corridor."
    
    return mock_response
