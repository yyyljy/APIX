import subprocess
import time
import os
import sys
import argparse
import shutil
import secrets
import urllib.request
import urllib.error

def resolve_npm_bin():
    candidates = ["npm.cmd", "npm"] if os.name == "nt" else ["npm", "npm.cmd"]
    for candidate in candidates:
        if shutil.which(candidate):
            return candidate
    return None

def wait_for_http_ready(urls, timeout_seconds=30, label="service"):
    if isinstance(urls, str):
        urls = [urls]
    if not urls:
        raise ValueError("wait_for_http_ready requires at least one URL")

    deadline = time.time() + timeout_seconds
    last_errors = {}
    while time.time() < deadline:
        for url in urls:
            try:
                with urllib.request.urlopen(url, timeout=2) as response:
                    if 200 <= response.status < 400:
                        return
                    last_errors[url] = f"status={response.status}"
            except Exception as error:
                last_errors[url] = str(error)
        time.sleep(0.5)
    formatted_errors = "; ".join(
        f"{url}: {error}" for url, error in last_errors.items()
    ) or "unknown error"
    raise RuntimeError(f"{label} failed readiness check: {formatted_errors}")

def run_demo():
    """
    Orchestrates the startup of Apix Cloud, Demo Backend, and Demo Frontend.
    """
    parser = argparse.ArgumentParser(description="Run APIX demo services (cloud/backend/frontend).")
    parser.add_argument("--mock-verify", action="store_true", help="Enable mock chain verification for local demo flow.")
    parser.add_argument("--rpc-url", default=os.environ.get("APIX_RPC_URL", "").strip(), help="EVM RPC URL used when mock verification is disabled.")
    parser.add_argument("--jwt-secret", default=os.environ.get("APIX_JWT_SECRET", "").strip(), help="Shared JWT secret for cloud/backend.")
    parser.add_argument("--allowed-origins", default=os.environ.get("APIX_ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"), help="Comma-separated CORS allowlist for Apix Cloud.")
    parser.add_argument("--skip-frontend", action="store_true", help="Skip starting Vite frontend server.")
    parser.add_argument("--readiness-timeout", type=int, default=45, help="Seconds to wait for each service health check.")
    args = parser.parse_args()

    processes = []
    process_labels = []
    
    env = os.environ.copy()
    jwt_secret = args.jwt_secret or secrets.token_urlsafe(32)
    if not args.jwt_secret:
        print("APIX_JWT_SECRET not provided. Generated an ephemeral secret for this run.")
    metrics_token = (env.get("APIX_METRICS_TOKEN", "") or "").strip() or secrets.token_urlsafe(24)
    if not (env.get("APIX_METRICS_TOKEN", "") or "").strip():
        print("APIX_METRICS_TOKEN not provided. Generated an ephemeral token for /metrics.")

    env["APIX_JWT_SECRET"] = jwt_secret
    env["APIX_METRICS_TOKEN"] = metrics_token
    env.setdefault("APIX_ENV", "development")
    env.setdefault("APIX_JWT_KID", "dev-v1")
    env.setdefault("APIX_USE_CLOUD_SESSION_STATE", "true")
    env.setdefault("APIX_SESSION_AUTHORITY_URL", "http://localhost:8080")
    env["APIX_ENABLE_MOCK_VERIFY"] = "true" if args.mock_verify else "false"
    env.setdefault("APIX_MIN_CONFIRMATIONS", "1")
    env["APIX_ALLOWED_ORIGINS"] = args.allowed_origins
    env.setdefault("VITE_API_BASE_URL", "http://localhost:3000")
    env.setdefault("APIX_SESSION_STORE_PATH", os.path.abspath(".tmp/apix-session-store.json"))
    env.setdefault("APIX_VERIFICATION_STORE_PATH", os.path.abspath(".tmp/apix-verification-store.json"))

    if not args.mock_verify:
        if not args.rpc_url:
            print("Error: real verification requires --rpc-url (or APIX_RPC_URL).")
            print("Hint: use --mock-verify for local demonstration mode.")
            sys.exit(1)
        env["APIX_RPC_URL"] = args.rpc_url
    elif args.rpc_url:
        env["APIX_RPC_URL"] = args.rpc_url

    npm_bin = resolve_npm_bin()
    if not npm_bin:
        print("Error: could not find npm in PATH.")
        sys.exit(1)

    os.makedirs(os.path.abspath(".tmp"), exist_ok=True)

    try:
        print("Starting Apix Cloud (Go)...")
        p1 = subprocess.Popen(["go", "run", "main.go"], cwd=os.path.abspath("apix-cloud"), env=env)
        processes.append(p1)
        process_labels.append("apix-cloud")
        
        print("Starting Demo Backend (Node)...")
        p2 = subprocess.Popen([npm_bin, "start"], cwd=os.path.abspath("demo/backend"), env=env)
        processes.append(p2)
        process_labels.append("demo-backend")
        
        if not args.skip_frontend:
            print("Starting Demo Frontend (Vite)...")
            p3 = subprocess.Popen([npm_bin, "run", "dev"], cwd=os.path.abspath("demo/frontend"), env=env)
            processes.append(p3)
            process_labels.append("demo-frontend")

        wait_for_http_ready(
            ["http://127.0.0.1:8080/health", "http://localhost:8080/health"],
            timeout_seconds=args.readiness_timeout,
            label="apix-cloud"
        )
        wait_for_http_ready(
            ["http://127.0.0.1:3000/health", "http://localhost:3000/health"],
            timeout_seconds=args.readiness_timeout,
            label="demo-backend"
        )
        if not args.skip_frontend:
            wait_for_http_ready(
                ["http://127.0.0.1:5173", "http://localhost:5173"],
                timeout_seconds=args.readiness_timeout,
                label="demo-frontend"
            )
        
        print("All services passed readiness checks. Press Ctrl+C to stop.")
        
        # Keep main process alive
        while True:
            for index, (process, label) in enumerate(zip(processes, process_labels)):
                return_code = process.poll()
                if return_code is not None:
                    if return_code != 0:
                        raise RuntimeError(f"{label} exited unexpectedly with code {return_code}")
                    print(f"Warning: {label} launcher exited with code 0; service may continue in a child process.")
                    processes.pop(index)
                    process_labels.pop(index)
                    break
            else:
                try:
                    wait_for_http_ready(
                        ["http://127.0.0.1:8080/health", "http://localhost:8080/health"],
                        timeout_seconds=5,
                        label="apix-cloud"
                    )
                    wait_for_http_ready(
                        ["http://127.0.0.1:3000/health", "http://localhost:3000/health"],
                        timeout_seconds=5,
                        label="demo-backend"
                    )
                except Exception as health_error:
                    raise RuntimeError(f"health probe failed: {health_error}")
            time.sleep(1)
            
    except KeyboardInterrupt:
        print("\nStopping all services...")
        for p in processes:
            # On Windows, terminate might not kill the entire process tree created by npm/shell=True
            # But for development tools this is usually acceptable or requires taskkill
            p.terminate() 
        sys.exit(0)
    except Exception as e:
        print(f"Error: {e}")
        for p in processes:
            p.terminate()
        sys.exit(1)

if __name__ == "__main__":
    run_demo()
