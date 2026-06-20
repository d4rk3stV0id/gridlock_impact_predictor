# Gridlock 2.0: Active Traffic Command & ML-Driven Dispatch Operations

![Gridlock 2.0 Banner](https://img.shields.io/badge/Status-Active-brightgreen) ![Python](https://img.shields.io/badge/Python-3.11%2B-blue) ![FastAPI](https://img.shields.io/badge/FastAPI-0.103%2B-009688) ![Machine Learning](https://img.shields.io/badge/ML-XGBoost-orange)

Gridlock 2.0 represents a fundamental shift in urban traffic management—moving from passive monitoring to an active, tactical response system. Built specifically for control room operators, it serves as a central hub for predicting, managing, and resolving live traffic incidents in real-time. By bridging the gap between raw data and actionable dispatch operations, Gridlock 2.0 drastically reduces incident clearance times and minimizes compounding congestion.

## Core Features

* **Tactical Kanban Interface:** An interactive, drag-and-drop Kanban board allows control room operators to manage live traffic incidents through varying response phases.
* **XGBoost Predictive Engine:** Continuously predicts incident clearance times based on historical data, optimized with Pseudo-Huber loss and a `TransformedTargetRegressor`.
* **Dynamic Weather Scaling (Open-Meteo):** Integrates real-time weather data. During critical events (like heavy rain), the system automatically scales predicted congestion durations around known flooding hubs (e.g., Silk Board, Hebbal Flyover).
* **Location Intelligence (Mappls API):** Translates raw geographic coordinates into precise street addresses and calculates actual driving ETAs for emergency response units.
* **Automated Dispatch (Twilio API):** Automatically dispatches formatted WhatsApp alerts to field units when an operator escalates a Kanban card to the "Active" phase, containing exact ETA, location, and severity data.

## Tech Stack

* **Backend:** Python, FastAPI, Uvicorn
* **Frontend:** HTML5, Vanilla JavaScript, Tailwind CSS, Leaflet.js
* **Machine Learning:** Pandas, Scikit-Learn, XGBoost, Optuna
* **Integrations:** MapMyIndia (Mappls), Twilio (WhatsApp API), Open-Meteo

## Local Setup & Installation

Follow these steps to run the application locally on your machine.

### 1. Clone the Repository
```bash
git clone https://github.com/YOUR_USERNAME/gridlock-impact-predictor.git
cd gridlock-impact-predictor
```

### 2. Set Up a Virtual Environment
```bash
# Create the virtual environment
python -m venv .venv

# Activate it (Windows)
.venv\Scripts\activate
# Activate it (macOS/Linux)
source .venv/bin/activate
```

### 3. Install Dependencies
```bash
pip install -r requirements.txt
```

### 4. Configure Environment Variables
You will need API keys for Mappls and Twilio to enable full functionality.
1. Copy the provided `.env.example` file to a new file named `.env`.
2. Open `.env` and fill in your actual credentials:
```env
MAPPLS_REST_KEY="your_api_key_here"

TWILIO_ACCOUNT_SID="your_account_sid_here"
TWILIO_AUTH_TOKEN="your_auth_token_here"
TWILIO_FROM_NUMBER="whatsapp:+TWILIOPROVIDEDNUMBER"
TWILIO_TO_NUMBER="whatsapp:+91YOURPHONENUMBER"
```

### 5. Run the Application
Start the FastAPI server:
```bash
uvicorn src.main:app --reload
```
Navigate to `http://127.0.0.1:8000` in your web browser.

## Operator Access
To access the operator-only features (such as assigning incidents to the dispatch tracker), click the **LOGIN** button in the top right corner of the application interface and authenticate using your operator credentials (default - username:operator password:hackathon2026).
