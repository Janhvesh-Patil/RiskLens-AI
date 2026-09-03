import numpy as np
from sklearn.base import BaseEstimator, TransformerMixin

class AmountTransformer(BaseEstimator, TransformerMixin):
    def __init__(self):
        return None

    def fit(self, X, y=None):
        return self

    def transform(self, X):
        X = X.copy()
        X["Amount"] = X["Amount"].apply(np.log1p)
        return X