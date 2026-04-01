import argparse
import json
from pathlib import Path

import joblib
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import tensorflow as tf
from sklearn.compose import ColumnTransformer
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
)
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder, OneHotEncoder, StandardScaler
from sklearn.utils.class_weight import compute_class_weight


NUMERIC_FEATURES = [
    "dailyLimitMinutes",
    "bedTimeMinutes",
    "wakeTimeMinutes",
    "gentleNudgesEnabled",
    "dailySummariesEnabled",
    "achievementAlertsEnabled",
    "limitWarningsEnabled",
    "sessionCount",
    "totalScreenMinutes",
    "socialMinutes",
    "productivityMinutes",
    "pickups",
    "unlocks",
    "lateNightMinutes",
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
    "riskLevel",
]

TARGET_COLUMN = "dominantNotificationType"


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
    df[TARGET_COLUMN] = df[TARGET_COLUMN].fillna("none").astype(str)

    return df


def split_dataset(df: pd.DataFrame):
    x = df[NUMERIC_FEATURES + CATEGORICAL_FEATURES].copy()
    y = df[TARGET_COLUMN].astype(str).copy()

    x_train, x_temp, y_train, y_temp = train_test_split(
        x,
        y,
        test_size=0.30,
        random_state=42,
        stratify=y,
    )

    x_valid, x_test, y_valid, y_test = train_test_split(
        x_temp,
        y_temp,
        test_size=0.50,
        random_state=42,
        stratify=y_temp,
    )

    return x_train, x_valid, x_test, y_train, y_valid, y_test


def prepare_targets(
    y_train: pd.Series,
    y_valid: pd.Series,
    y_test: pd.Series,
):
    label_encoder = LabelEncoder()
    y_train_encoded = label_encoder.fit_transform(y_train)
    y_valid_encoded = label_encoder.transform(y_valid)
    y_test_encoded = label_encoder.transform(y_test)

    return y_train_encoded, y_valid_encoded, y_test_encoded, label_encoder


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
    plt.title("Notification Model Training vs Validation Loss")
    plt.legend()
    plt.tight_layout()
    plt.savefig(output_dir / "loss_curve.png")
    plt.close()

    plt.figure(figsize=(8, 5))
    plt.plot(history.history["accuracy"], label="train_accuracy")
    plt.plot(history.history["val_accuracy"], label="val_accuracy")
    plt.xlabel("Epoch")
    plt.ylabel("Accuracy")
    plt.title("Notification Model Training vs Validation Accuracy")
    plt.legend()
    plt.tight_layout()
    plt.savefig(output_dir / "accuracy_curve.png")
    plt.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--data_file",
        type=str,
        default="datasets/aidetoxcoach_app_aligned_notification_model_training_dataset.csv",
        help="Path to the notification model CSV file",
    )
    parser.add_argument(
        "--output_dir",
        type=str,
        default="notification_model_artifacts",
        help="Folder where notification model artifacts will be saved",
    )
    parser.add_argument("--epochs", type=int, default=60)
    parser.add_argument("--batch_size", type=int, default=64)
    args = parser.parse_args()

    data_file = Path(args.data_file)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    tf.keras.utils.set_random_seed(42)
    np.random.seed(42)

    df = load_dataset(data_file)

    x_train_df, x_valid_df, x_test_df, y_train, y_valid, y_test = split_dataset(df)

    y_train_encoded, y_valid_encoded, y_test_encoded, label_encoder = prepare_targets(
        y_train, y_valid, y_test
    )

    preprocessor = build_preprocessor()
    x_train = preprocessor.fit_transform(x_train_df).astype(np.float32)
    x_valid = preprocessor.transform(x_valid_df).astype(np.float32)
    x_test = preprocessor.transform(x_test_df).astype(np.float32)

    class_labels = np.unique(y_train_encoded)
    class_weights_array = compute_class_weight(
        class_weight="balanced",
        classes=class_labels,
        y=y_train_encoded,
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
        y_train_encoded,
        validation_data=(x_valid, y_valid_encoded),
        epochs=args.epochs,
        batch_size=args.batch_size,
        class_weight=class_weight_map,
        callbacks=callbacks,
        verbose=1,
    )

    save_history(history, output_dir)

    test_loss, test_accuracy = model.evaluate(
        x_test,
        y_test_encoded,
        verbose=0,
    )

    y_pred_prob = model.predict(x_test, verbose=0)
    y_pred = np.argmax(y_pred_prob, axis=1)

    report_dict = classification_report(
        y_test_encoded,
        y_pred,
        target_names=label_encoder.classes_,
        output_dict=True,
        zero_division=0,
    )
    report_text = classification_report(
        y_test_encoded,
        y_pred,
        target_names=label_encoder.classes_,
        zero_division=0,
    )
    cm = confusion_matrix(y_test_encoded, y_pred)

    metrics = {
        "test_loss": float(test_loss),
        "test_accuracy": float(test_accuracy),
        "plain_accuracy_score": float(accuracy_score(y_test_encoded, y_pred)),
        "macro_f1": float(f1_score(y_test_encoded, y_pred, average="macro")),
        "weighted_f1": float(f1_score(y_test_encoded, y_pred, average="weighted")),
        "classes": label_encoder.classes_.tolist(),
        "classification_report": report_dict,
        "confusion_matrix": cm.tolist(),
        "train_rows": int(len(x_train_df)),
        "valid_rows": int(len(x_valid_df)),
        "test_rows": int(len(x_test_df)),
        "target_column": TARGET_COLUMN,
        "numeric_features": NUMERIC_FEATURES,
        "categorical_features": CATEGORICAL_FEATURES,
        "notes": [
            "This model predicts the dominant notification strategy for the day.",
            "Classes include none, limit_warning, sleep, and both.",
        ],
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

    test_preview = pd.DataFrame(
        {
            "actual": label_encoder.inverse_transform(y_test_encoded),
            "predicted": label_encoder.inverse_transform(y_pred),
            "confidence": np.max(y_pred_prob, axis=1),
        }
    )
    test_preview.to_csv(output_dir / "prediction_samples.csv", index=False)

    feature_info = {
        "numeric_features": NUMERIC_FEATURES,
        "categorical_features": CATEGORICAL_FEATURES,
        "target_column": TARGET_COLUMN,
        "label_classes": label_encoder.classes_.tolist(),
    }

    with open(output_dir / "feature_info.json", "w", encoding="utf-8") as f:
        json.dump(feature_info, f, indent=2)

    model.save(output_dir / "notification_type_classifier.keras")
    joblib.dump(preprocessor, output_dir / "notification_preprocessor.joblib")
    joblib.dump(label_encoder, output_dir / "notification_label_encoder.joblib")

    print("\nNotification model training finished successfully.")
    print(f"Test accuracy: {test_accuracy:.4f}")
    print(f"Artifacts saved to: {output_dir.resolve()}")


if __name__ == "__main__":
    main()