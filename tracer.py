import os
from datetime import datetime, timezone


def get_tracer():
    """Return a LangSmith tracer if API key is set, else None."""
    api_key = os.getenv("LANGCHAIN_API_KEY", "")
    if not api_key or api_key == "your_langsmith_key_here":
        return None
    try:
        from langsmith import Client
        return Client(api_key=api_key)
    except Exception:
        return None


def log_eval_run(
    client,
    run_id: str,
    prompt: str,
    model_id: str,
    model_label: str,
    response: str,
    scores: dict,
    latency_ms: float,
    input_tokens: int,
    output_tokens: int,
    cost_usd: float,
):
    """Log a single model evaluation run to LangSmith."""
    if client is None:
        return

    project = os.getenv("LANGCHAIN_PROJECT", "claudeeval")

    try:
        client.create_run(
            name=f"eval_{model_label.replace(' ', '_').lower()}",
            run_type="llm",
            project_name=project,
            inputs={"prompt": prompt},
            outputs={"response": response},
            extra={
                "run_id":        run_id,
                "model_id":      model_id,
                "model_label":   model_label,
                "latency_ms":    latency_ms,
                "input_tokens":  input_tokens,
                "output_tokens": output_tokens,
                "cost_usd":      cost_usd,
                "scores":        scores,
                "timestamp":     datetime.now(timezone.utc).isoformat(),
            },
            error=None,
        )
    except Exception as e:
        print(f"[langsmith] logging failed for {model_label}: {e}")
