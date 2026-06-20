import argparse
import math
from pathlib import Path

import joblib
import numpy as np
import optuna
import pandas as pd
import xgboost as xgb
from sklearn.cluster import KMeans
from sklearn.compose import ColumnTransformer, TransformedTargetRegressor
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics import mean_absolute_error
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder

from src.app.config import DATA_DIR, MODEL_PATH, SPATIAL_CLUSTERER_PATH


def find_dataset() -> Path:
    """
    Locate the single anonymized incident CSV file in the data directory.
    """
    csv_files = sorted(DATA_DIR.glob("*.csv"))
    if len(csv_files) != 1:
        raise RuntimeError(
            f"Expected exactly one CSV file in {DATA_DIR}, found {len(csv_files)}."
        )
    return csv_files[0]


def prepare_data(csv_file: Path):
    """
    Load and preprocess the training dataset.
    Extracts time features, handles missing values, and adds spatial encodings.
    """
    df = pd.read_csv(csv_file).dropna(axis=1, how="all")
    id_columns = [
        column
        for column in df.columns
        if column.lower() == "id" or column.lower().endswith("_id")
    ]
    df = df.drop(columns=id_columns, errors="ignore")

    for column in ("start_datetime", "modified_datetime"):
        df[column] = pd.to_datetime(df[column], format="mixed", errors="coerce")
    df = df.dropna(subset=["start_datetime", "modified_datetime"])

    df["duration_mins"] = (
        df["modified_datetime"] - df["start_datetime"]
    ).dt.total_seconds() / 60
    df = df[df["duration_mins"].between(0, 420)]
    if df.empty:
        raise RuntimeError("No valid training rows remain after duration filtering.")

    df["description"] = df["description"].fillna("")
    for column in ("veh_type", "corridor", "priority", "event_cause"):
        df[column] = df[column].fillna("unknown")

    for column in ("latitude", "longitude"):
        df[column] = pd.to_numeric(df[column], errors="coerce")
        df[column] = df[column].fillna(df[column].median())

    center_lat = float(df["latitude"].mean())
    center_lon = float(df["longitude"].mean())
    angle = math.pi / 4
    df["rot45_lat"] = (
        df["latitude"] * math.cos(angle) - df["longitude"] * math.sin(angle)
    )
    df["rot45_lon"] = (
        df["latitude"] * math.sin(angle) + df["longitude"] * math.cos(angle)
    )
    df["distance_to_center"] = np.hypot(
        df["latitude"] - center_lat,
        df["longitude"] - center_lon,
    )

    hour = df["start_datetime"].dt.hour
    df["hour_sin"] = np.sin(2 * np.pi * hour / 24)
    df["hour_cos"] = np.cos(2 * np.pi * hour / 24)

    dow = df["start_datetime"].dt.dayofweek
    df["dow_sin"] = np.sin(2 * np.pi * dow / 7)
    df["dow_cos"] = np.cos(2 * np.pi * dow / 7)
    df["is_weekend"] = (dow >= 5).astype(float)
    df["is_rush_hour"] = ((hour >= 8) & (hour <= 10) | (hour >= 17) & (hour <= 20)).astype(float)

    month = df["start_datetime"].dt.month
    df["month_sin"] = np.sin(2 * np.pi * month / 12)
    df["month_cos"] = np.cos(2 * np.pi * month / 12)

    features = [
        "description",
        "veh_type",
        "corridor",
        "priority",
        "event_cause",
        "latitude",
        "longitude",
        "rot45_lat",
        "rot45_lon",
        "distance_to_center",
        "hour_sin",
        "hour_cos",
        "dow_sin",
        "dow_cos",
        "is_weekend",
        "is_rush_hour",
        "month_sin",
        "month_cos",
        "distance_to_nearest_hotspot",
    ]
    return df, features, center_lat, center_lon


def fit_spatial_clusterer(train_df: pd.DataFrame) -> KMeans:
    """
    Train an unsupervised KMeans clusterer to automatically identify the top
    5 historical congestion hotspots from the training coordinates.
    """
    coords = train_df[["latitude", "longitude"]].values
    clusterer = KMeans(n_clusters=5, random_state=42, n_init=10)
    clusterer.fit(coords)
    return clusterer


def add_hotspot_distance(df: pd.DataFrame, clusterer: KMeans) -> pd.DataFrame:
    """
    Add a feature column calculating the minimum distance from each incident
    to the nearest learned spatial hotspot.
    """
    coords = df[["latitude", "longitude"]].values
    distances = clusterer.transform(coords)
    df = df.copy()
    df["distance_to_nearest_hotspot"] = distances.min(axis=1)
    return df


def build_pipeline(device: str, params: dict | None = None) -> Pipeline:
    """
    Construct the scikit-learn preprocessing and XGBoost regression pipeline.
    Combines text vectorization, categorical encoding, and numeric scaling.
    """
    categorical_features = ["veh_type", "corridor", "priority", "event_cause"]
    numeric_features = [
        "latitude",
        "longitude",
        "rot45_lat",
        "rot45_lon",
        "distance_to_center",
        "hour_sin",
        "hour_cos",
        "dow_sin",
        "dow_cos",
        "is_weekend",
        "is_rush_hour",
        "month_sin",
        "month_cos",
        "distance_to_nearest_hotspot",
    ]
    preprocessor = ColumnTransformer(
        transformers=[
            ("text", TfidfVectorizer(max_features=150, ngram_range=(1, 2)), "description"),
            (
                "cat",
                OneHotEncoder(handle_unknown="ignore"),
                categorical_features,
            ),
            ("num", "passthrough", numeric_features),
        ]
    )

    xgb_params = {
        "tree_method": "hist",
        "device": device,
        "objective": "reg:squarederror",
        "n_estimators": 300,
        "max_depth": 7,
        "learning_rate": 0.05,
        "subsample": 0.8,
        "colsample_bytree": 0.8,
        "random_state": 42,
    }
    if params:
        xgb_params.update(params)

    regressor = xgb.XGBRegressor(**xgb_params)
    model = TransformedTargetRegressor(
        regressor=regressor,
        func=np.log1p,
        inverse_func=np.expm1,
    )
    return Pipeline([("preprocessor", preprocessor), ("model", model)])


def run_optuna_study(
    train_x: pd.DataFrame,
    train_y: pd.Series,
    test_x: pd.DataFrame,
    test_y: pd.Series,
    device: str,
    n_trials: int = 100,
) -> dict:
    """
    Execute a Bayesian hyperparameter optimization search using Optuna
    to find the best XGBoost tree configurations.
    """
    optuna.logging.set_verbosity(optuna.logging.WARNING)

    def objective(trial: optuna.Trial) -> float:
        params = {
            "learning_rate": trial.suggest_float("learning_rate", 0.005, 0.3, log=True),
            "max_depth": trial.suggest_int("max_depth", 3, 14),
            "subsample": trial.suggest_float("subsample", 0.5, 1.0),
            "colsample_bytree": trial.suggest_float("colsample_bytree", 0.3, 1.0),
            "n_estimators": trial.suggest_int("n_estimators", 100, 1200, step=50),
            "min_child_weight": trial.suggest_int("min_child_weight", 1, 10),
            "gamma": trial.suggest_float("gamma", 0.0, 5.0),
            "reg_alpha": trial.suggest_float("reg_alpha", 1e-8, 10.0, log=True),
            "reg_lambda": trial.suggest_float("reg_lambda", 1e-8, 10.0, log=True),
        }
        pipeline = build_pipeline(device, params)
        pipeline.fit(train_x, train_y)

        fitted_regressor = pipeline.named_steps["model"].regressor_
        fitted_regressor.set_params(device="cpu")
        predictions = pipeline.predict(test_x)
        mae = mean_absolute_error(test_y, predictions)
        fitted_regressor.set_params(device=device)
        return mae

    study = optuna.create_study(direction="minimize", study_name="meridian_xgb_tuning")
    study.optimize(objective, n_trials=n_trials, show_progress_bar=True)

    print(f"\n--- Optuna Study Complete ---")
    print(f"Best MAE: {study.best_value:.2f} minutes")
    print(f"Best params: {study.best_params}")
    return study.best_params


def main():
    parser = argparse.ArgumentParser(description="Train the traffic impact model.")
    parser.add_argument(
        "--device",
        choices=("cpu", "cuda"),
        default="cuda",
        help="XGBoost training device (default: cuda).",
    )
    parser.add_argument(
        "--skip-optuna",
        action="store_true",
        help="Skip Optuna hyperparameter search and use defaults.",
    )
    args = parser.parse_args()

    csv_file = find_dataset()
    print(f"Loading data from {csv_file}")
    df, feature_cols, center_lat, center_lon = prepare_data(csv_file)

    train_df, test_df, train_y, test_y = train_test_split(
        df,
        df["duration_mins"],
        test_size=0.2,
        random_state=42,
    )

    # Fit spatial clusterer on training data only (prevents leakage)
    print("Fitting spatial hotspot clusterer (k=5)...")
    clusterer = fit_spatial_clusterer(train_df)
    train_df = add_hotspot_distance(train_df, clusterer)
    test_df = add_hotspot_distance(test_df, clusterer)

    train_x = train_df[feature_cols]
    test_x = test_df[feature_cols]

    # Optuna hyperparameter search
    best_params = None
    if not args.skip_optuna:
        print(f"\nRunning Optuna Bayesian search (20 trials) on {args.device}...")
        best_params = run_optuna_study(train_x, train_y, test_x, test_y, args.device)

    # Final training with best parameters
    pipeline = build_pipeline(args.device, best_params)
    print(f"\nTraining final model on {args.device} with {len(train_x)} rows")
    pipeline.fit(train_x, train_y)

    fitted_regressor = pipeline.named_steps["model"].regressor_
    fitted_regressor.set_params(device="cpu")
    predictions = pipeline.predict(test_x)
    mae = mean_absolute_error(test_y, predictions)
    print(f"Final Validation MAE: {mae:.2f} minutes")
    fitted_regressor.set_params(device=args.device)

    # Save model bundle
    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(
        {
            "pipeline": pipeline,
            "center_lat": center_lat,
            "center_lon": center_lon,
        },
        MODEL_PATH,
    )
    print(f"Saved model bundle to {MODEL_PATH}")

    # Save spatial clusterer
    joblib.dump(clusterer, SPATIAL_CLUSTERER_PATH)
    print(f"Saved spatial clusterer to {SPATIAL_CLUSTERER_PATH}")


if __name__ == "__main__":
    main()
