import argparse
import json
from pathlib import Path
from typing import Optional

import matplotlib
matplotlib.use("Agg")

import joblib
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import tensorflow as tf
from sklearn.compose import ColumnTransformer
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import OneHotEncoder, StandardScaler


NUMERIC_FEATURES = [
    "dailyLimitMinutes",
    "bedTimeMinutes",
    "wakeTimeMinutes",
    "gentleNudgesEnabled",
    "dailySummariesEnabled",
    "achievementAlertsEnabled",
    "limitWarningsEnabled",
    "googleFitConnected",
    "sessionCount",
    "totalScreenMinutes",
    "socialMinutes",
    "productivityMinutes",
    "pickups",
    "unlocks",
    "lateNightMinutes",
    "avgSessionMinutes",
    "longestSessionMinutes",
    "peakHour",
    "sevenDayAvgScreenMinutes",
    "yesterdayScore",
    "overLimitMinutes",
    "score",
    "overLimitAppsCount",
    "topExceededMinutes",
]

CATEGORICAL_FEATURES = [
    "focusPrimary",
    "focusSecondary",
    "theme",
    "riskLevel",
]

TARGET_COLUMN = "targetDailyLimitMinutes"


def build_preprocessor():
    try:
        categorical_encoder = OneHotEncoder(
            handle_unknown="ignore",
            sparse_output=False,
        )
    except TypeError:
        categorical_encoder = OneHotEncoder(
            handle_unknown="ignore",
            sparse=False,
        )

    return ColumnTransformer(
        transformers=[
            ("num", StandardScaler(), NUMERIC_FEATURES),
            ("cat", categorical_encoder, CATEGORICAL_FEATURES),
        ]
    )


def validate_columns(df: pd.DataFrame):
    required = set(NUMERIC_FEATURES + CATEGORICAL_FEATURES + [TARGET_COLUMN])
    missing = sorted(required - set(df.columns))
    if missing:
        raise ValueError(f"Missing required columns: {missing}")


def load_dataset(csv_path: Path):
    df = pd.read_csv(csv_path)
    validate_columns(df)

    df = df.copy()
    df[NUMERIC_FEATURES] = df[NUMERIC_FEATURES].fillna(0)
    df[CATEGORICAL_FEATURES] = df[CATEGORICAL_FEATURES].fillna("Unknown")
    df[TARGET_COLUMN] = df[TARGET_COLUMN].fillna(df[TARGET_COLUMN].median())

    return df


def split_dataset(df: pd.DataFrame):
    x = df[NUMERIC_FEATURES + CATEGORICAL_FEATURES].copy()
    y = df[TARGET_COLUMN].astype(float).copy()

    stratify_labels = df["riskLevel"].astype(str)

    x_train, x_temp, y_train, y_temp = train_test_split(
        x,
        y,
        test_size=0.30,
        random_state=42,
        stratify=stratify_labels,
    )

    temp_stratify = x_temp["riskLevel"].astype(str)

    x_valid, x_test, y_valid, y_test = train_test_split(
        x_temp,
        y_temp,
        test_size=0.50,
        random_state=42,
        stratify=temp_stratify,
    )

    return x_train, x_valid, x_test, y_train, y_valid, y_test


def build_model(input_dim: int):
    model = tf.keras.Sequential(
        [
            tf.keras.layers.Input(shape=(input_dim,)),
            tf.keras.layers.Dense(128, activation="relu"),
            tf.keras.layers.BatchNormalization(),
            tf.keras.layers.Dropout(0.25),
            tf.keras.layers.Dense(64, activation="relu"),
            tf.keras.layers.BatchNormalization(),
            tf.keras.layers.Dropout(0.15),
            tf.keras.layers.Dense(32, activation="relu"),
            tf.keras.layers.Dense(1, activation="linear"),
        ]
    )

    model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=0.001),
        loss="mse",
        metrics=["mae"],
    )
    return model


def save_history(history, output_dir: Path):
    history_df = pd.DataFrame(history.history)
    history_df.to_csv(output_dir / "training_history.csv", index=False)

    plt.figure(figsize=(8, 5))
    plt.plot(history.history["loss"], label="train_loss")
    plt.plot(history.history["val_loss"], label="val_loss")
    plt.xlabel("Epoch")
    plt.ylabel("Loss")
    plt.title("Plan Model Training vs Validation Loss")
    plt.legend()
    plt.tight_layout()
    plt.savefig(output_dir / "loss_curve.png")
    plt.close()

    plt.figure(figsize=(8, 5))
    plt.plot(history.history["mae"], label="train_mae")
    plt.plot(history.history["val_mae"], label="val_mae")
    plt.xlabel("Epoch")
    plt.ylabel("MAE")
    plt.title("Plan Model Training vs Validation MAE")
    plt.legend()
    plt.tight_layout()
    plt.savefig(output_dir / "mae_curve.png")
    plt.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--data_file",
        type=str,
        default="datasets/aidetoxcoach_app_aligned_plan_model_training_dataset.csv",
        help="Path to the plan model CSV file",
    )
    parser.add_argument(
        "--output_dir",
        type=str,
        default="plan_model_artifacts",
        help="Folder where plan model artifacts will be saved",
    )
    parser.add_argument("--epochs", type=int, default=80)
    parser.add_argument("--batch_size", type=int, default=64)
    args = parser.parse_args()

    data_file = Path(args.data_file)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    tf.keras.utils.set_random_seed(42)
    np.random.seed(42)

    df = load_dataset(data_file)

    x_train_df, x_valid_df, x_test_df, y_train, y_valid, y_test = split_dataset(df)

    preprocessor = build_preprocessor()
    x_train = preprocessor.fit_transform(x_train_df).astype(np.float32)
    x_valid = preprocessor.transform(x_valid_df).astype(np.float32)
    x_test = preprocessor.transform(x_test_df).astype(np.float32)

    model = build_model(input_dim=x_train.shape[1])

    callbacks = [
        tf.keras.callbacks.EarlyStopping(
            monitor="val_loss",
            patience=10,
            restore_best_weights=True,
        ),
        tf.keras.callbacks.ReduceLROnPlateau(
            monitor="val_loss",
            factor=0.5,
            patience=5,
            min_lr=1e-5,
        ),
    ]

    history = model.fit(
        x_train,
        y_train.values.astype(np.float32),
        validation_data=(x_valid, y_valid.values.astype(np.float32)),
        epochs=args.epochs,
        batch_size=args.batch_size,
        callbacks=callbacks,
        verbose=1,
    )

    save_history(history, output_dir)

    test_loss, test_mae = model.evaluate(
        x_test,
        y_test.values.astype(np.float32),
        verbose=0,
    )

    y_pred = model.predict(x_test, verbose=0).reshape(-1)
    y_pred = np.round(y_pred).astype(int)

    metrics = {
        "test_loss_mse": float(test_loss),
        "test_mae": float(test_mae),
        "test_rmse": float(np.sqrt(mean_squared_error(y_test, y_pred))),
        "test_r2": float(r2_score(y_test, y_pred)),
        "train_rows": int(len(x_train_df)),
        "valid_rows": int(len(x_valid_df)),
        "test_rows": int(len(x_test_df)),
        "target_column": TARGET_COLUMN,
        "numeric_features": NUMERIC_FEATURES,
        "categorical_features": CATEGORICAL_FEATURES,
        "prediction_note": "Predictions are rounded to integer minutes for practical detox plan use.",
    }

    with open(output_dir / "metrics.json", "w", encoding="utf-8") as f:
        json.dump(metrics, f, indent=2)

    comparison_df = pd.DataFrame(
        {
            "actual_targetDailyLimitMinutes": y_test.values,
            "predicted_targetDailyLimitMinutes": y_pred,
            "absolute_error": np.abs(y_test.values - y_pred),
        }
    )
    comparison_df.to_csv(output_dir / "prediction_samples.csv", index=False)

    feature_info = {
        "numeric_features": NUMERIC_FEATURES,
        "categorical_features": CATEGORICAL_FEATURES,
        "target_column": TARGET_COLUMN,
        "notes": [
            "This model predicts the next detox target daily limit in minutes.",
            "Text outputs like task titles and aiInsight are intentionally excluded from this first plan model.",
        ],
    }

    with open(output_dir / "feature_info.json", "w", encoding="utf-8") as f:
        json.dump(feature_info, f, indent=2)

    model.save(output_dir / "plan_target_regressor.keras")
    joblib.dump(preprocessor, output_dir / "plan_preprocessor.joblib")

    print("\nPlan target model training finished successfully.")
    print(f"Test MAE: {test_mae:.4f}")
    print(f"Artifacts saved to: {output_dir.resolve()}")


if __name__ == "__main__":
    main()