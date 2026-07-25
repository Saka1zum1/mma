#!/usr/bin/env bash
# Run the Linux e2e suite in Docker against the prebuilt image, no rebuild needed
# for test-only changes (specs/config/scripts are live-mounted via the dev overlay).
#
# Usage:
#   scripts/e2e.sh                                  # full suite, single container
#   scripts/e2e.sh test/e2e/foo.test.ts [more...]   # only the given spec files
#   scripts/e2e.sh --shard [N]                      # full suite split across N containers (default 3)
#   scripts/e2e.sh --mock [...]                     # add --mock (any position before specs) to
#                                                   #   monkey-patch Street View (deterministic, no network)
#   scripts/e2e.sh --web [...]                      # run the same specs against the web-serve
#                                                   #   build in Chrome instead of the native shell
#
# Rebuild the image first (after app source changes) with: scripts/e2e-build.sh
set -uo pipefail
# Git Bash (Windows) rewrites args that look like absolute paths (e.g. /repo/...) into
# Windows paths before they reach docker. Disable that; harmless on Linux hosts.
export MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*'
cd "$(dirname "$0")/.."

# Leading flags, any order: --mock enables the test-side Street View monkey-patch,
# --web swaps the native-shell runner for the web-serve one (Chrome over HTTP IPC).
MOCK_ENV=()
RUNNER="sh /repo/scripts/internal/e2e-native.sh"
while :; do
	case "${1:-}" in
	--mock)
		MOCK_ENV=(-e MMA_TEST_MOCK_SV=1)
		shift
		;;
	--web)
		RUNNER="sh /repo/scripts/internal/e2e-web.sh"
		shift
		;;
	*) break ;;
	esac
done

COMPOSE="docker compose -f docker-compose.e2e.yml -f docker-compose.e2e.dev.yml"

if [ "${1:-}" = "--shard" ]; then
	N="${2:-3}"
	echo "Running e2e suite across $N parallel containers..."
	pids=()
	for i in $(seq 1 "$N"); do
		$COMPOSE run "${MOCK_ENV[@]}" --rm e2e $RUNNER --shard "$i/$N" >"shard-$i.log" 2>&1 &
		pids+=("$!")
	done
	rc=0
	for idx in "${!pids[@]}"; do
		i=$((idx + 1))
		if wait "${pids[$idx]}"; then
			echo "shard $i/$N: PASS"
		else
			echo "shard $i/$N: FAIL (see shard-$i.log)"
			rc=1
		fi
		grep -E "Spec Files:" "shard-$i.log" | tail -1
	done
	exit $rc
fi

# Subset: prefix each spec file with --spec. No args => full suite.
args=()
for s in "$@"; do args+=(--spec "$s"); done
exec $COMPOSE run "${MOCK_ENV[@]}" --rm e2e $RUNNER "${args[@]}"
