import sys, json
sys.path.insert(0, r"d:\WorkBuddy\resources\app\extensions\genie\out\extension\builtin\buddy-multimodal-generation\scripts")
import os
os.environ["BUDDY_CLOUD_TOKEN"] = "eyJhbGciOiJSUzI1NiIsInR5cCIgOiAiSldUIiwia2lkIiA6ICJteWZFenA3ODNLaV9KQ3g4Vm5jM1hfaXg2alpyYjZDZjVPTWtHWk1QSTNzIn0.eyJleHAiOjE4MDc1MDc2MjEsImlhdCI6MTc4MzY4MzM0OCwiYXV0aF90aW1lIjoxNzc1OTcxNjIwLCJqdGkiOiJhZjNlODkzNC1lZGEyLTQ4NTItOTMxMy1lMDVjODkwMzIyOGUiLCJpc3MiOiJodHRwczovL3d3dy5jb2RlYnVkZHkuY24vYXV0aC9yZWFsbXMvY29waWxvdCIsImF1ZCI6ImFjY291bnQiLCJzdWIiOiJjNzAxZjg3OC1kYWY1LTQ0MjktYWE3OS00ZDUxMjhkNWMyNzQiLCJ0eXAiOiJCZWFyZXIiLCJhenAiOiJjb25zb2xlIiwic2lkIjoiMDIyMmM5MjYtMGQ2YS00MWYxLTgyZjUtYWUyYTIwYzcyYjA4IiwiYWNyIjoiMCIsImFsbG93ZWQtb3JpZ2lucyI6WyIqIl0sInJlYWxtX2FjY2VzcyI6eyJyb2xlcyI6WyJkZWZhdWx0LXJvbGVzIiwib2ZmbGluZV9hY2Nlc3MiLCJ1bWFfYXV0aG9yaXphdGlvbiJdfSwicmVzb3VyY2VfYWNjZXNzIjp7ImFjY291bnQiOnsicm9sZXMiOlsibWFuYWdlLWFjY291bnQiLCJtYW5hZ2UtYWNjb3VudC1saW5rcyIsInZpZXctcHJvZmlsZSJdfX0sInNjb3BlIjoib3BlbmlkIHByb2ZpbGUgb2ZmbGluZV9hY2Nlc3MgZW1haWwiLCJlbWFpbF92ZXJpZmllZCI6ZmFsc2UsIm5pY2tuYW1lIjoiTmVmZXJ0IiwicHJlZmVycmVkX3VzZXJuYW1lIjoiMTMwMDY4MTc1NTYifQ.ElBgjmZ_9NPpsvUFDN5GSxqnLs7Y5xPjsqtbYtGjIsFLtPeJHGO4Z1AqoO2dxT8q41epLz6yFaZh0plB8_eWNWR5rVuNmUX9-ExTBaKzrqMgjGhA2ft80hyfHno8Acps_sgJ5NK04CyDsA7D3q8qba3Q_oiIrYZSjas5uf5TXj8IACiP03JrgSDpLST3hNc6Zf-WSKArhrHCto8wiBg2Wrg1kHAQ2vQSJMw3JcrJ_efRKemB3FpcC8p1uRenfzHLJ9fUoZ8HhBUcebyHRK5W9s2l3mmNEFmPJCNOzoCV0n6L1GuVR0r3I4rw_RT8tw-yIQQDqVYRJqX4FbuzapT9NA"

import importlib.util
spec = importlib.util.spec_from_file_location("buddy_cloud", r"d:\WorkBuddy\resources\app\extensions\genie\out\extension\builtin\buddy-multimodal-generation\scripts\buddy-cloud.py")
buddy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(buddy)

# Try image generation
result = buddy._call_api(
    endpoint=buddy._DEFAULT_ENDPOINT,
    provider=buddy._PROVIDER_MAP["image"]["provider"],
    service=buddy._PROVIDER_MAP["image"]["service"],
    version=buddy._PROVIDER_MAP["image"]["version"],
    action=buddy._PROVIDER_MAP["image"]["submit_action"],
    body={"Prompt": "A sleek dark-themed AI coding interface floating in a pure white void, Apple-style product showcase.", "Seed": 42},
    token=os.environ["BUDDY_CLOUD_TOKEN"]
)
print(json.dumps(result, ensure_ascii=False, indent=2))
