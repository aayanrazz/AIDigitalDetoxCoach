import argparse
import json
import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import tensorflow as tf


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model_dir", required=True)
    args = parser.parse_args()

    model_dir = Path(args.model_dir)
    payload = json.load(sys.stdin)

    rows = payload.get("rows", [])
    if not isinstance(rows, list) or not rows:
        print(json.dumps({"predictions": [], "error": "No input rows received."}))
        sys.exit(1)

    model = tf.keras.models.load_model(
        model_dir / "notification_type_classifier.keras"
    )
    preprocessor = joblib.load(model_dir / "notification_preprocessor.joblib")
    label_encoder = joblib.load(model_dir / "notification_label_encoder.joblib")

    df = pd.DataFrame(rows)
    transformed = preprocessor.transform(df).astype(np.float32)
    probabilities = model.predict(transformed, verbose=0)

    predictions = []
    for probs in probabilities:
        predicted_index = int(np.argmax(probs))
        predicted_label = label_encoder.inverse_transform([predicted_index])[0]
        confidence = float(np.max(probs))
        class_probabilities = {
            label: float(prob)
            for label, prob in zip(label_encoder.classes_, probs.tolist())
        }

        predictions.append(
            {
                "predictedNotificationType": predicted_label,
                "confidence": confidence,
                "classProbabilities": class_probabilities,
            }
        )

    print(json.dumps({"predictions": predictions}, indent=2))


if __name__ == "__main__":
    main()