#!/usr/bin/env bash
# Refuses a commit whose ADDED lines look like a secret (JWT/Supabase keys, Stripe-style keys,
# Anthropic API keys, GitHub tokens, service-role keys, a Supabase URL next to a key). Run before every commit:
#   bash tools/dev/secret-check.sh && git commit ...
set -euo pipefail
added=$(git diff --cached -U0 --no-color -- . ':(exclude)tools/dev/secret-check.sh' | grep -E '^\+' | grep -vE '^\+\+\+ ' || true)
if echo "$added" | grep -nE 'eyJ[A-Za-z0-9_-]{10,}|(^|[^A-Za-z])sk_[A-Za-z0-9]{8,}|sk-ant-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|service_role|supabase\.co[^ ]*(key|apikey|anon)' ; then
  echo "✗ secret-like string in the staged changes — commit refused" >&2; exit 1
fi
echo "✓ no secret-like strings in the staged changes"
