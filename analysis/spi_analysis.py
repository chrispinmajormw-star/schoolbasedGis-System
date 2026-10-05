"""Statistical validation of the School Preparedness Index.

Usage:
    pip install pandas numpy scipy
    python spi_analysis.py school_preparedness.csv

The CSV comes from the web app (Download CSV) or http://localhost:4000/api/export.csv
Checks: Cronbach's alpha, expert-vs-equal weight comparison, random weight perturbation.
"""
import sys
import numpy as np
import pandas as pd
from scipy.stats import spearmanr

WEIGHTS = {
    "emergency_plan": 12, "emergency_contacts": 8, "evacuation_route": 10,
    "evacuation_signage": 5, "safe_assembly_point": 10, "disaster_drill": 12,
    "teachers_trained_pct": 12, "early_warning": 12, "first_aid_kit": 10,
    "fire_extinguisher": 9,
}
ITEMS = list(WEIGHTS)


def load(path):
    df = pd.read_csv(path).dropna(subset=["spi"]).copy()
    for c in ITEMS:
        if c == "teachers_trained_pct":
            df[c] = df[c].astype(float) / 100
        else:
            df[c] = df[c].astype(str).str.lower().isin(["true", "t", "1"]).astype(float)
    return df


def spi(df, weights):
    w = np.array([weights[i] for i in ITEMS], dtype=float)
    return 100 * (df[ITEMS].values @ w) / w.sum()


def cronbach_alpha(x):
    x = np.asarray(x, dtype=float)
    k = x.shape[1]
    item_var = x.var(axis=0, ddof=1).sum()
    total_var = x.sum(axis=1).var(ddof=1)
    return np.nan if total_var == 0 else (k / (k - 1)) * (1 - item_var / total_var)


def klass(v):
    return np.where(v >= 80, "high", np.where(v >= 60, "moderate", "low"))


def main(path):
    df = load(path)
    n = len(df)
    print(f"Assessed schools: {n}")
    if n < 5:
        print("Need at least 5 assessed schools for meaningful statistics.")
        return

    expert = spi(df, WEIGHTS)
    equal = spi(df, {i: 1 for i in ITEMS})
    print(f"\nMean SPI (expert weights): {expert.mean():.1f}   (equal weights): {equal.mean():.1f}")
    print(f"Cronbach's alpha (10 items): {cronbach_alpha(df[ITEMS]):.2f}  (>= 0.70 is acceptable)")

    rho, p = spearmanr(expert, equal)
    changed = (klass(expert) != klass(equal)).sum()
    print(f"\nExpert vs equal weights: Spearman rho = {rho:.3f} (p = {p:.3g}); class changes: {changed}/{n}")

    rng = np.random.default_rng(42)
    base = np.array([WEIGHTS[i] for i in ITEMS], dtype=float)
    rhos, flips = [], []
    for _ in range(1000):
        w = base * rng.uniform(0.5, 1.5, size=len(base))
        alt = 100 * (df[ITEMS].values @ w) / w.sum()
        rhos.append(spearmanr(expert, alt)[0])
        flips.append((klass(expert) != klass(alt)).mean())
    print(f"1000 random weight perturbations (+/-50%): median rho = {np.median(rhos):.3f}, "
          f"5th percentile = {np.percentile(rhos, 5):.3f}, mean share of schools changing class = {np.mean(flips):.1%}")

    print("\nIndicator coverage (share of schools meeting each):")
    print((df[ITEMS].mean() * 100).round(0).astype(int).sort_values().to_string())


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
