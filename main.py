import asyncio
import os
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone

import anthropic
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from evaluator import evaluate_response
from models import MODELS, calculate_cost
from tracer import get_tracer, log_eval_run

load_dotenv()


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.client  = anthropic.AsyncAnthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
    app.state.tracer  = get_tracer()
    print("[startup] ClaudeEval API ready")
    yield
    await app.state.client.close()
    print("[shutdown] ClaudeEval API stopped")


app = FastAPI(title="ClaudeEval API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class EvalRequest(BaseModel):
    prompt: str
    system_prompt: str = "You are a helpful AI assistant."
    max_tokens: int = 1024


class ModelResult(BaseModel):
    model_id:      str
    model_label:   str
    color:         str
    description:   str
    response:      str
    latency_ms:    float
    input_tokens:  int
    output_tokens: int
    cost_usd:      float
    scores:        dict
    error:         str | None = None


class EvalResponse(BaseModel):
    run_id:    str
    prompt:    str
    timestamp: str
    results:   list[ModelResult]
    winner:    str


async def call_model(
    client: anthropic.AsyncAnthropic,
    model: dict,
    prompt: str,
    system_prompt: str,
    max_tokens: int,
) -> ModelResult:
    """Call a single Claude model and return timed result."""
    start = time.monotonic()
    try:
        msg = await client.messages.create(
            model=model["id"],
            max_tokens=max_tokens,
            system=system_prompt,
            messages=[{"role": "user", "content": prompt}],
        )
        latency_ms    = round((time.monotonic() - start) * 1000, 1)
        response_text = msg.content[0].text
        input_tokens  = msg.usage.input_tokens
        output_tokens = msg.usage.output_tokens
        cost_usd      = calculate_cost(model["id"], input_tokens, output_tokens)

        return ModelResult(
            model_id      = model["id"],
            model_label   = model["label"],
            color         = model["color"],
            description   = model["description"],
            response      = response_text,
            latency_ms    = latency_ms,
            input_tokens  = input_tokens,
            output_tokens = output_tokens,
            cost_usd      = cost_usd,
            scores        = {},
        )

    except Exception as e:
        latency_ms = round((time.monotonic() - start) * 1000, 1)
        return ModelResult(
            model_id      = model["id"],
            model_label   = model["label"],
            color         = model["color"],
            description   = model["description"],
            response      = "",
            latency_ms    = latency_ms,
            input_tokens  = 0,
            output_tokens = 0,
            cost_usd      = 0.0,
            scores        = {"overall": 0},
            error         = str(e),
        )


@app.get("/health")
async def health():
    return {"status": "ok", "service": "claudeeval-api", "models": len(MODELS)}


@app.get("/models")
async def get_models():
    return {"models": MODELS}


@app.post("/evaluate", response_model=EvalResponse)
async def evaluate(request: EvalRequest):
    prompt = request.prompt.strip()
    if not prompt:
        raise HTTPException(status_code=422, detail="Prompt must not be empty")

    run_id    = str(uuid.uuid4())[:8]
    client    = app.state.client
    tracer    = app.state.tracer

    # ── Step 1: Call all models in parallel ──────────────────────
    model_tasks = [
        call_model(client, m, prompt, request.system_prompt, request.max_tokens)
        for m in MODELS
    ]
    results: list[ModelResult] = await asyncio.gather(*model_tasks)

    # ── Step 2: Evaluate successful responses in parallel ─────────
    eval_tasks = []
    for r in results:
        if r.error or not r.response:
            eval_tasks.append(asyncio.coroutine(lambda: {
                "relevance": 0, "clarity": 0,
                "completeness": 0, "overall": 0,
                "reasoning": "Model call failed"
            })())
        else:
            eval_tasks.append(evaluate_response(client, prompt, r.response))

    scores_list = await asyncio.gather(*eval_tasks)

    for result, scores in zip(results, scores_list):
        result.scores = scores

    # ── Step 3: Log to LangSmith ──────────────────────────────────
    for result in results:
        log_eval_run(
            client       = tracer,
            run_id       = run_id,
            prompt       = prompt,
            model_id     = result.model_id,
            model_label  = result.model_label,
            response     = result.response,
            scores       = result.scores,
            latency_ms   = result.latency_ms,
            input_tokens = result.input_tokens,
            output_tokens= result.output_tokens,
            cost_usd     = result.cost_usd,
        )

    # ── Step 4: Pick winner by overall score ─────────────────────
    winner = max(results, key=lambda r: r.scores.get("overall", 0)).model_label

    return EvalResponse(
        run_id    = run_id,
        prompt    = prompt,
        timestamp = datetime.now(timezone.utc).isoformat(),
        results   = results,
        winner    = winner,
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
