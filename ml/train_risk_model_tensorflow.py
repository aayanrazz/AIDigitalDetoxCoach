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
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix
from sklearn.preprocessing import LabelEncoder, OneHotEncoder, StandardScaler
from sklearn.utils.class_weight import compute_class_weight


NUMERIC_FEATURES = [
    "isWeekend",
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
    "communicationMinutes",
    "productivityMinutes",
    "educationMinutes",
    "streamingMinutes",
    "gamingMinutes",
    "otherMinutes",
    "pickups",
    "unlocks",
    "lateNightMinutes",
    "avgSessionMinutes",
    "longestSessionMinutes",
    "peakHour",
    "sevenDayAvgScreenMinutes",
    "yesterdayScore",
    "overLimitMinutes",
    "monitoredAppCount",
    "overLimitAppsCount",
    "topExceededMinutes",
]

CATEGORICAL_FEATURES = [
    "dayOfWeek",
    "focusPrimary",
    "focusSecondary",
    "theme",
]

TARGET_COLUMN = "riskLevel"


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


def load_data(data_dir: Path):
    train_df = pd.read_csv(data_dir / "aidetoxcoach_app_aligned_daily_train.csv")
    valid_df = pd.read_csv(data_dir / "aidetoxcoach_app_aligned_daily_valid.csv")
    test_df = pd.read_csv(data_dir / "aidetoxcoach_app_aligned_daily_test.csv")
    return train_df, valid_df, test_df


def validate_columns(df: pd.DataFrame):
    required = set(NUMERIC_FEATURES + CATEGORICAL_FEATURES + [TARGET_COLUMN])
    missing = sorted(required - set(df.columns))
    if missing:
        raise ValueError(f"Missing required columns: {missing}")


def prepare_xy(
    df: pd.DataFrame,
    label_encoder: Optional[LabelEncoder] = None,
    fit_label_encoder: bool = False,
):
    validate_columns(df)

    x = df[NUMERIC_FEATURES + CATEGORICAL_FEATURES].copy()
    y = df[TARGET_COLUMN].astype(str).copy()

    x[NUMERIC_FEATURES] = x[NUMERIC_FEATURES].fillna(0)
    x[CATEGORICAL_FEATURES] = x[CATEGORICAL_FEATURES].fillna("Unknown")

    if fit_label_encoder:
        label_encoder = LabelEncoder()
        y_encoded = label_encoder.fit_transform(y)
        return x, y_encoded, label_encoder

    if label_encoder is None:
        raise ValueError("label_encoder must be provided when fit_label_encoder=False")

    y_encoded = label_encoder.transform(y)
    return x, y_encoded


def build_model(input_dim: int, num_classes: int):
    model = tf.keras.Sequential(
        [
            tf.keras.layers.Input(shape=(input_dim,)),
            tf.keras.layers.Dense(128, activation="relu"),
            tf.keras.layers.BatchNormalization(),
            tf.keras.layers.Dropout(0.30),
            tf.keras.layers.Dense(64, activation="relu"),
            tf.keras.layers.BatchNormalization(),
            tf.keras.layers.Dropout(0.20),
            tf.keras.layers.Dense(32, activation="relu"),
            tf.keras.layers.Dense(num_classes, activation="softmax"),
        ]
    )

    model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=0.001),
        loss="sparse_categorical_crossentropy",
        metrics=["accuracy"],
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
    plt.title("Training vs Validation Loss")
    plt.legend()
    plt.tight_layout()
    plt.savefig(output_dir / "loss_curve.png")
    plt.close()

    plt.figure(figsize=(8, 5))
    plt.plot(history.history["accuracy"], label="train_accuracy")
    plt.plot(history.history["val_accuracy"], label="val_accuracy")
    plt.xlabel("Epoch")
    plt.ylabel("Accuracy")
    plt.title("Training vs Validation Accuracy")
    plt.legend()
    plt.tight_layout()
    plt.savefig(output_dir / "accuracy_curve.png")
    plt.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--data_dir",
        type=str,
        default="datasets",
        help="Folder containing the corrected dataset CSV files",
    )
    parser.add_argument(
        "--output_dir",
        type=str,
        default="risk_model_artifacts",
        help="Folder where trained artifacts will be saved",
    )
    parser.add_argument("--epochs", type=int, default=60)
    parser.add_argument("--batch_size", type=int, default=64)
    args = parser.parse_args()

    data_dir = Path(args.data_dir)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    tf.keras.utils.set_random_seed(42)
    np.random.seed(42)

    train_df, valid_df, test_df = load_data(data_dir)

    x_train_df, y_train, label_encoder = prepare_xy(
        train_df,
        fit_label_encoder=True,
    )
    x_valid_df, y_valid = prepare_xy(
        valid_df,
        label_encoder=label_encoder,
    )
    x_test_df, y_test = prepare_xy(
        test_df,
        label_encoder=label_encoder,
    )

    preprocessor = build_preprocessor()
    x_train = preprocessor.fit_transform(x_train_df).astype(np.float32)
    x_valid = preprocessor.transform(x_valid_df).astype(np.float32)
    x_test = preprocessor.transform(x_test_df).astype(np.float32)

    class_labels = np.unique(y_train)
    class_weights_array = compute_class_weight(
        class_weight="balanced",
        classes=class_labels,
        y=y_train,
    )
    class_weight_map = {
        int(label): float(weight)
        for label, weight in zip(class_labels, class_weights_array)
    }

    model = build_model(
        input_dim=x_train.shape[1],
        num_classes=len(label_encoder.classes_),
    )

    callbacks = [
        tf.keras.callbacks.EarlyStopping(
            monitor="val_loss",
            patience=8,
            restore_best_weights=True,
        ),
        tf.keras.callbacks.ReduceLROnPlateau(
            monitor="val_loss",
            factor=0.5,
            patience=4,
            min_lr=1e-5,
        ),
    ]

    history = model.fit(
        x_train,
        y_train,
        validation_data=(x_valid, y_valid),
        epochs=args.epochs,
        batch_size=args.batch_size,
        class_weight=class_weight_map,
        callbacks=callbacks,
        verbose=1,
    )

    save_history(history, output_dir)

    test_loss, test_accuracy = model.evaluate(x_test, y_test, verbose=0)
    y_pred_prob = model.predict(x_test, verbose=0)
    y_pred = np.argmax(y_pred_prob, axis=1)

    report_dict = classification_report(
        y_test,
        y_pred,
        target_names=label_encoder.classes_,
        output_dict=True,
        zero_division=0,
    )
    report_text = classification_report(
        y_test,
        y_pred,
        target_names=label_encoder.classes_,
        zero_division=0,
    )
    cm = confusion_matrix(y_test, y_pred)

    metrics = {
        "test_loss": float(test_loss),
        "test_accuracy": float(test_accuracy),
        "plain_accuracy_score": float(accuracy_score(y_test, y_pred)),
        "classes": label_encoder.classes_.tolist(),
        "classification_report": report_dict,
        "confusion_matrix": cm.tolist(),
        "input_feature_count": int(x_train.shape[1]),
        "numeric_features": NUMERIC_FEATURES,
        "categorical_features": CATEGORICAL_FEATURES,
        "target_column": TARGET_COLUMN,
        "train_rows": int(len(train_df)),
        "valid_rows": int(len(valid_df)),
        "test_rows": int(len(test_df)),
    }

    with open(output_dir / "metrics.json", "w", encoding="utf-8") as f:
        json.dump(metrics, f, indent=2)

    with open(output_dir / "classification_report.txt", "w", encoding="utf-8") as f:
        f.write(report_text)

    pd.DataFrame(
        cm,
        index=[f"true_{c}" for c in label_encoder.classes_],
        columns=[f"pred_{c}" for c in label_encoder.classes_],
    ).to_csv(output_dir / "confusion_matrix.csv")

    model.save(output_dir / "risk_classifier.keras")
    joblib.dump(preprocessor, output_dir / "preprocessor.joblib")
    joblib.dump(label_encoder, output_dir / "label_encoder.joblib")

    feature_info = {
        "numeric_features": NUMERIC_FEATURES,
        "categorical_features": CATEGORICAL_FEATURES,
        "all_input_columns": NUMERIC_FEATURES + CATEGORICAL_FEATURES,
        "label_classes": label_encoder.classes_.tolist(),
        "notes": [
            "userId and dayKey are intentionally excluded to reduce leakage and improve generalization.",
            "riskLevel is the main first-stage target for AIDetoxCoach.",
        ],
    }
    with open(output_dir / "feature_info.json", "w", encoding="utf-8") as f:
        json.dump(feature_info, f, indent=2)

    print("\nTraining finished successfully.")
    print(f"Test accuracy: {test_accuracy:.4f}")
    print(f"Artifacts saved to: {output_dir.resolve()}")


if __name__ == "__main__":
    main()