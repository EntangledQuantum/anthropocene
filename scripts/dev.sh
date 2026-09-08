#!/bin/sh
# The Homebrew bin dir is not always on the PATH of processes launched by
# tooling, and npm's shebang resolves `node` through PATH. Prepend it.
PATH="/opt/homebrew/bin:$PATH"
export PATH
exec npm run dev -- "$@"
