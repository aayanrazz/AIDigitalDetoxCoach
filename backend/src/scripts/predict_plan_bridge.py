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

    model = tf.keras.models.load_model(model_dir / "plan_target_regressor.keras")
    preprocessor = joblib.load(model_dir / "plan_preprocessor.joblib")

    df = pd.DataFrame(rows)
    transformed = preprocessor.transform(df).astype(np.float32)
    predictions = model.predict(transformed, verbose=0).reshape(-1)

    outputs = []
    for prediction in predictions:
        outputs.append(
            {
                "predictedTargetDailyLimitMinutes": int(round(float(prediction))),
            }
        )

    print(json.dumps({"predictions": outputs}, indent=2))


if __name__ == "__main__":
    main()