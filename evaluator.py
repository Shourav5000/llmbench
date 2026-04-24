import re
import anthropic


EVAL_PROMPT = """You are an expert AI evaluator. Score the following response on four criteria.

Original prompt: {prompt}

Response to evaluate:
{response}

Score each criterion from 1-10 and return ONLY valid JSON with no markdown:
{{
  "relevance":     <1-10>,
  "clarity":       <1-10>,
  "completeness":  <1-10>,
  "overall":       <1-10>,
  "reasoning":     "<one sentence explaining the overall score>"
}}

Be strict and objective. A score of 10 is exceptional, 7 is good, 5 is average."""


async def evaluate_response(
    client: anthropic.AsyncAnthropic,
    prompt: str,
    response: str,
) -> dict:
    """Use Claude Haiku to evaluate a response — fast and cheap for meta-evaluation."""
    try:
        msg = await client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=300,
            messages=[{
                "role": "user",
                "content": EVAL_PROMPT.format(prompt=prompt, response=response)
            }]
        )
        raw = msg.content[0].text.strip()

        # Strip markdown fences if present
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        raw = raw.strip()

        import json
        scores = json.loads(raw)
        return {
            "relevance":    int(scores.get("relevance",    5)),
            "clarity":      int(scores.get("clarity",      5)),
            "completeness": int(scores.get("completeness", 5)),
            "overall":      int(scores.get("overall",      5)),
            "reasoning":    str(scores.get("reasoning",    "")),
        }
    except Exception as e:
        return {
            "relevance":    5,
            "clarity":      5,
            "completeness": 5,
            "overall":      5,
            "reasoning":    f"Evaluation failed: {e}",
        }
