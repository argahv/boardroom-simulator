"""
Seed a LangSmith dataset from local boardroom simulation fixtures.

Usage:
  export LANGSMITH_API_KEY=...
  export LANGSMITH_ENDPOINT=https://api.smith.langchain.com
  python scripts/seed_langsmith_dataset.py

Creates/updates dataset name: Simulation
Adds minimal examples for regression/eval gating.
"""
from __future__ import annotations

import json
from pathlib import Path

try:
    from langsmith import Client
except Exception as exc:  # pragma: no cover
    raise SystemExit(f"LangSmith SDK unavailable: {exc}")


DATASET_NAME = "Simulation"


def _example_messages(background: str, goal: str):
    return [
        {"role": "system", "content": "You are a boardroom negotiation simulator."},
        {"role": "user", "content": json.dumps({"background": background, "goal": goal})},
    ]


def main() -> None:
    client = Client()

    datasets = list(client.list_datasets(dataset_name=DATASET_NAME))
    if datasets:
        dataset = datasets[0]
    else:
        dataset = client.create_dataset(
            dataset_name=DATASET_NAME,
            description="Regression set for boardroom simulator reliability",
        )

    examples = [
        {
            "inputs": {
                "messages": _example_messages(
                    "SaaS partnership under legal pressure",
                    "Reach phased rollout agreement",
                ),
                "tools": [],
            },
            "outputs": {
                "message": {
                    "role": "assistant",
                    "content": "{""status"": ""ok""}",
                }
            },
        },
        {
            "inputs": {
                "messages": _example_messages(
                    "Security compliance dispute",
                    "Avoid deadlock while preserving legal safety",
                ),
                "tools": [],
            },
            "outputs": {
                "message": {
                    "role": "assistant",
                    "content": "{""status"": ""ok""}",
                }
            },
        },
    ]

    for ex in examples:
        client.create_example(
            dataset_id=dataset.id,
            inputs=ex["inputs"],
            outputs=ex["outputs"],
        )

    print(f"Seeded dataset '{DATASET_NAME}' with {len(examples)} examples")


if __name__ == "__main__":
    main()
