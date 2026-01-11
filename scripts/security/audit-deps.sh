#!/bin/bash
#
# Dependency Security Audit Script for Mail Queue
# Runs comprehensive security checks on all dependencies
#
# Usage:
#   ./audit-deps.sh              # Run full audit
#   ./audit-deps.sh --ci         # CI mode (exit 1 on critical issues)
#   ./audit-deps.sh --fix        # Attempt to fix vulnerabilities
#   ./audit-deps.sh --report     # Generate detailed report
#

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
REPORT_DIR="$PROJECT_ROOT/security-reports"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Flags
CI_MODE=false
FIX_MODE=false
REPORT_MODE=false
EXIT_CODE=0

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --ci)
            CI_MODE=true
            shift
            ;;
        --fix)
            FIX_MODE=true
            shift
            ;;
        --report)
            REPORT_MODE=true
            shift
            ;;
        -h|--help)
            echo "Usage: $0 [--ci] [--fix] [--report]"
            echo ""
            echo "Options:"
            echo "  --ci      CI mode - exit 1 on critical vulnerabilities"
            echo "  --fix     Attempt to automatically fix vulnerabilities"
            echo "  --report  Generate detailed HTML/JSON reports"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

log() {
    local level=$1
    local message=$2
    local color=$NC

    case $level in
        "INFO") color=$BLUE ;;
        "SUCCESS") color=$GREEN ;;
        "WARNING") color=$YELLOW ;;
        "ERROR") color=$RED ;;
    esac

    echo -e "${color}[$level]${NC} $message"
}

check_prerequisites() {
    log "INFO" "Checking prerequisites..."

    if ! command -v pnpm &> /dev/null; then
        log "ERROR" "pnpm is required but not installed"
        exit 1
    fi

    if ! command -v node &> /dev/null; then
        log "ERROR" "Node.js is required but not installed"
        exit 1
    fi
}

run_pnpm_audit() {
    log "INFO" "Running pnpm audit..."

    cd "$PROJECT_ROOT"

    # Run audit and capture output
    local audit_output
    if audit_output=$(pnpm audit --json 2>&1); then
        log "SUCCESS" "No vulnerabilities found by pnpm audit"
    else
        local critical_count=$(echo "$audit_output" | jq '.metadata.vulnerabilities.critical // 0' 2>/dev/null || echo "0")
        local high_count=$(echo "$audit_output" | jq '.metadata.vulnerabilities.high // 0' 2>/dev/null || echo "0")
        local moderate_count=$(echo "$audit_output" | jq '.metadata.vulnerabilities.moderate // 0' 2>/dev/null || echo "0")
        local low_count=$(echo "$audit_output" | jq '.metadata.vulnerabilities.low // 0' 2>/dev/null || echo "0")

        log "WARNING" "Vulnerabilities found: Critical=$critical_count, High=$high_count, Moderate=$moderate_count, Low=$low_count"

        if [[ "$critical_count" -gt 0 ]]; then
            log "ERROR" "Critical vulnerabilities detected!"
            EXIT_CODE=1
        fi

        if [[ "$REPORT_MODE" == "true" ]]; then
            mkdir -p "$REPORT_DIR"
            echo "$audit_output" > "$REPORT_DIR/pnpm-audit-$TIMESTAMP.json"
            log "INFO" "Report saved to $REPORT_DIR/pnpm-audit-$TIMESTAMP.json"
        fi
    fi
}

run_npm_audit_per_package() {
    log "INFO" "Running per-package audit..."

    local packages=("api" "worker" "dashboard" "db" "core" "sdk-js")

    for pkg in "${packages[@]}"; do
        local pkg_dir="$PROJECT_ROOT/packages/$pkg"
        if [[ -d "$pkg_dir" ]]; then
            log "INFO" "Auditing packages/$pkg..."
            cd "$pkg_dir"

            if pnpm audit --audit-level=critical 2>&1 | grep -q "critical"; then
                log "ERROR" "Critical vulnerabilities in packages/$pkg"
                EXIT_CODE=1
            fi
        fi
    done
}

check_outdated() {
    log "INFO" "Checking for outdated dependencies..."

    cd "$PROJECT_ROOT"

    local outdated_output
    if outdated_output=$(pnpm outdated --format json 2>&1); then
        log "SUCCESS" "All dependencies are up to date"
    else
        log "WARNING" "Some dependencies are outdated"

        if [[ "$REPORT_MODE" == "true" ]]; then
            mkdir -p "$REPORT_DIR"
            echo "$outdated_output" > "$REPORT_DIR/outdated-$TIMESTAMP.json"
        fi
    fi
}

fix_vulnerabilities() {
    if [[ "$FIX_MODE" != "true" ]]; then
        return
    fi

    log "INFO" "Attempting to fix vulnerabilities..."

    cd "$PROJECT_ROOT"

    # Run pnpm update to get latest compatible versions
    pnpm update --latest || true

    log "INFO" "Re-running audit after fix attempt..."
    run_pnpm_audit
}

check_known_vulnerabilities() {
    log "INFO" "Checking for known vulnerable packages..."

    cd "$PROJECT_ROOT"

    # List of known vulnerable packages to check
    local vulnerable_packages=(
        "lodash<4.17.21"
        "minimist<1.2.6"
        "node-fetch<2.6.7"
        "glob-parent<5.1.2"
        "trim-newlines<3.0.1"
    )

    for pkg in "${vulnerable_packages[@]}"; do
        local pkg_name=$(echo "$pkg" | cut -d'<' -f1)
        if pnpm list "$pkg_name" 2>/dev/null | grep -q "$pkg_name"; then
            log "WARNING" "Found potentially vulnerable package: $pkg_name"
        fi
    done
}

generate_sbom() {
    if [[ "$REPORT_MODE" != "true" ]]; then
        return
    fi

    log "INFO" "Generating Software Bill of Materials (SBOM)..."

    cd "$PROJECT_ROOT"
    mkdir -p "$REPORT_DIR"

    # Generate dependency tree
    pnpm list --depth=10 --json > "$REPORT_DIR/sbom-$TIMESTAMP.json" 2>/dev/null || true

    log "INFO" "SBOM saved to $REPORT_DIR/sbom-$TIMESTAMP.json"
}

print_summary() {
    echo ""
    echo "=================================="
    echo "Security Audit Summary"
    echo "=================================="
    echo ""

    if [[ $EXIT_CODE -eq 0 ]]; then
        log "SUCCESS" "All security checks passed"
    else
        log "ERROR" "Security issues detected - review the output above"

        if [[ "$CI_MODE" == "true" ]]; then
            log "ERROR" "CI mode enabled - failing build"
        fi
    fi

    if [[ "$REPORT_MODE" == "true" ]]; then
        echo ""
        log "INFO" "Reports saved to: $REPORT_DIR"
    fi
}

main() {
    log "INFO" "Starting security audit for Mail Queue..."
    echo ""

    check_prerequisites
    run_pnpm_audit
    run_npm_audit_per_package
    check_outdated
    check_known_vulnerabilities
    fix_vulnerabilities
    generate_sbom
    print_summary

    if [[ "$CI_MODE" == "true" ]]; then
        exit $EXIT_CODE
    fi
}

main
