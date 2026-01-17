import pandas as pd

def clean(val):
    if pd.isna(val):
        return None

    # Fix float IDs like 2796.0 -> "2796"
    if isinstance(val, float) and val.is_integer():
        return str(int(val))

    return str(val) if isinstance(val, (int, float)) else val



def normalize_column(col: str) -> str:
    return (
        col.replace("\xa0", " ")
           .replace("\n", " ")
           .strip()
    )