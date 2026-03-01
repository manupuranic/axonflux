from collections.abc import Iterable

import pandas as pd

from utils.helpers import normalize_column


class IngestionValidationError(ValueError):
    """Raised when a source file does not match the expected report format."""


def validate_required_columns(
    *,
    df: pd.DataFrame,
    required_columns: Iterable[str] | None,
    file_label: str,
) -> None:
    if not required_columns:
        return

    normalized_columns = {normalize_column(column) for column in df.columns}
    missing_columns = [
        column
        for column in required_columns
        if normalize_column(column) not in normalized_columns
    ]

    if missing_columns:
        missing = ", ".join(missing_columns)
        raise IngestionValidationError(
            f"Missing required column(s): {missing}. "
            f"This does not look like a valid {file_label} file."
        )
