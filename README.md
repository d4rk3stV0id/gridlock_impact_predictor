# Meridian: AI-Powered Tactical Traffic Control Room

![Meridian Banner](https://img.shields.io/badge/Status-Active-brightgreen) ![Python](https://img.shields.io/badge/Python-3.11%2B-blue) ![FastAPI](https://img.shields.io/badge/FastAPI-0.103%2B-009688) ![Machine Learning](https://img.shields.io/badge/ML-XGBoost-orange)

Meridian represents a fundamental shift in urban traffic management—moving from passive monitoring to an active, tactical response system. Built with a dual-role architecture, it serves both as a public Citizen Reporting Portal and a highly secured Control Room for traffic operators. By bridging the gap between raw predictive data and actionable dispatch operations, Meridian drastically reduces incident clearance times and minimizes compounding congestion.

## Core Features

* **Role-Based Architecture:** Seamlessly shifts between a public-facing Citizen Portal (for incident reporting and viewing resolved logs) and a secured Operator Workspace.
* **Tactical Kanban Interface:** An interactive, state-machine Kanban board allows control room operators to manage live traffic incidents through varying response phases.
* **Dynamic System Analytics:** A real-time, session-driven dashboard powered by Chart.js. It actively calculates Average Clearance Times, tracks the percentage of Severe Risk incidents, and tallies deployed units as operators manage the Kanban tracker.
* **Optimized Predictive Engine:** An XGBoost Regressor optimized with Pseudo-Huber loss and `TransformedTargetRegressor` continuously predicts incident clearance times. Deep dataset optimizations have successfully **reduced the MAE score by ~50%** (from 97 to 47 minutes).
* **Automated Weather Scaling (Open-Meteo):** Integrates real-time weather data. During critical events (like heavy rain), the system automatically scales predicted congestion durations around known chronic flooding hubs (e.g., Central Silk Board, Hebbal Flyover).
* **Location Intelligence (Mappls API):** Translates raw geographic coordinates into precise street addresses and calculates actual driving ETAs for emergency response units.
* **Automated Dispatch (Twilio API):** Automatically dispatches formatted WhatsApp alerts to field units when an operator escalates a Kanban card to the "Active" phase, delivering exact ETA, location, and severity data.

## Tech Stack

* **Backend:** Python, FastAPI, Uvicorn
* **Frontend:** HTML5, Vanilla JavaScript, Tailwind CSS, Leaflet.js, Chart.js
* **Machine Learning:** Pandas, Scikit-Learn, XGBoost, Optuna
* **Integrations:** MapMyIndia (Mappls), Twilio (WhatsApp API), Open-Meteo

## Local Setup & Installation

Follow these steps to run the application locally on your machine.

### 1. Clone the Repository
```bash
git clone [https://github.com/YOUR_USERNAME/meridian-impact-predictor.git](https://github.com/YOUR_USERNAME/meridian-impact-predictor.git)
cd meridian-impact-predictor

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

By default, the application loads the **Citizen View**. To access the operator-only features—including the Tactical Kanban Tracker, Regional Operations Ledger, and the System Analytics Dashboard—click the **LOGIN** button in the top right corner of the navigation bar.

Authenticate using the default operator credentials:

* **Username:** `operator`
* **Password:** `hackathon2026`
