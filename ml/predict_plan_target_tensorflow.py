import argparse
import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import tensorflow as tf


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model_dir", type=str, default="plan_model_artifacts")
    parser.add_argument("--input_json", type=str, required=True)
    args = parser.parse_args()

    model_dir = Path(args.model_dir)

    model = tf.keras.models.load_model(model_dir / "plan_target_regressor.keras")
    preprocessor = joblib.load(model_dir / "plan_preprocessor.joblib")

    with open(args.input_json, "r", encoding="utf-8") as f:
        payload = json.load(f)

    if isinstance(payload, dict):
        payload = [payload]

    df = pd.DataFrame(payload)
    transformed = preprocessor.transform(df).astype(np.float32)
    predictions = model.predict(transformed, verbose=0).reshape(-1)

    outputs = []
    for row, prediction in zip(payload, predictions):
        outputs.append(
            {
                "input": row,
                "predictedTargetDailyLimitMinutes": int(round(float(prediction))),
            }
        )

    print(json.dumps(outputs, indent=2))


if __name__ == "__main__":
    main()