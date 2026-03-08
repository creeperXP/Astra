from fastapi import APIRouter
from pydantic import BaseModel

from config import EMBED_DIM

router = APIRouter()

# Placeholder: real impl would load sklearn/joblib model and feature vector -> mastery
INSTITUTIONAL_PRIOR = 0.72


class PredictRequest(BaseModel):
    node_id: str
    feature_vector: list[float]


@router.post("/predict")
def predict_mastery(req: PredictRequest):
    if len(req.feature_vector) < 5:
        return {
            "mastery_probability": INSTITUTIONAL_PRIOR,
            "institutional_prior": INSTITUTIONAL_PRIOR,
        }
    # Weighted prior: first two as GPA/experience proxy
    import numpy as np
    w = np.array([0.3, 0.25, 0.2, 0.15, 0.1])
    v = np.array(req.feature_vector[:5])
    p = float(np.clip(np.dot(w, v), 0, 1))
    return {
        "mastery_probability": p,
        "institutional_prior": INSTITUTIONAL_PRIOR,
    }
