import os

MODELS = [
    {
        "id":           "claude-haiku-4-5-20251001",
        "label":        "Claude Haiku",
        "description":  "Fastest · most cost-efficient",
        "color":        "#00e5a0",
        "input_cost":   float(os.getenv("HAIKU_INPUT_COST",  "0.80")),
        "output_cost":  float(os.getenv("HAIKU_OUTPUT_COST", "4.00")),
    },
    {
        "id":           "claude-sonnet-4-6",
        "label":        "Claude Sonnet",
        "description":  "Balanced performance",
        "color":        "#4da6ff",
        "input_cost":   float(os.getenv("SONNET_INPUT_COST",  "3.00")),
        "output_cost":  float(os.getenv("SONNET_OUTPUT_COST", "15.00")),
    },
    {
        "id":           "claude-opus-4-6",
        "label":        "Claude Opus",
        "description":  "Most capable",
        "color":        "#c77dff",
        "input_cost":   float(os.getenv("OPUS_INPUT_COST",  "15.00")),
        "output_cost":  float(os.getenv("OPUS_OUTPUT_COST", "75.00")),
    },
]

MODEL_MAP = {m["id"]: m for m in MODELS}


def calculate_cost(model_id: str, input_tokens: int, output_tokens: int) -> float:
    """Calculate cost in USD for a single API call."""
    m = MODEL_MAP.get(model_id)
    if not m:
        return 0.0
    input_cost  = (input_tokens  / 1_000_000) * m["input_cost"]
    output_cost = (output_tokens / 1_000_000) * m["output_cost"]
    return round(input_cost + output_cost, 6)
