import subprocess
import time
import os
import sys
import argparse
import shutil
import secrets
import urllib.request
import urllib.error

def read_env_secret_file(path: str, label: str) -> str:
    if not path:
        return '';
    try:
        with open(path, "r", encoding="utf-8") as file:
            value = file.read().strip()
        if value:
            return value
    except FileNotFoundError:
        raise RuntimeError(f"{label} file not found: {path}")
    except Exception as error:
        raise RuntimeError(f"failed to read {label} file: {error}")
    raise RuntimeError(f"{label} file is empty: {path}")


def load_env_file(path: str, env: dict) -> None:
    if not path:
        return

    if not os.path.exists(path):
        return

    if not os.path.isfile(path):
        raise RuntimeError(f"{path} is not a regular file")

    try:
        with open(path, "r", encoding="utf-8") as file:
            for line_no, raw_line in enumerate(file, start=1):
                line = raw_line.strip()
                if not line or line.startswith("#"):
                    continue

                if line.startswith("export "):
                    line = line[len("export "):].strip()

                if "=" not in line:
                    raise RuntimeError(f"invalid env line in {path}:{line_no}")

                key, value = line.split("=", 1)
                key = key.strip()
                if not key or key in env:
                    continue

                value = value.strip()
                if value.startswith('"') and value.endswith('"'):
                    value = value[1:-1]
                elif value.startswith("'") and value.endswith("'"):
                    value = value[1:-1]

                if "#" in value:
                    value = value.split("#", 1)[0].strip()

                env[key] = value
    except Exception as error:
        raise RuntimeError(f"failed to read env file {path}: {error}")

def resolve_verification_rpc_url(env: dict, cli_file: str) -> str:
    if cli_file.strip():
        return read_env_secret_file(cli_file, "APIX_VERIFICATION_RPC_URL")

    env_url = env.get("APIX_VERIFICATION_RPC_URL", "").strip()
    if env_url:
        return env_url

    env_file = env.get("APIX_VERIFICATION_RPC_URL_FILE", "").strip()
    if env_file:
        return read_env_secret_file(env_file, "APIX_VERIFICATION_RPC_URL")

    return ""

def resolve_npm_bin():
    candidates = ["npm.cmd", "npm"] if os.name == "nt" else ["npm", "npm.cmd"]
    for candidate in candidates:
        if shutil.which(candidate):
            return candidate
    return None


def ensure_frontend_ready(cwd: str, npm_bin: str, env: dict) -> None:
    candidates = [
        os.path.join(cwd, "node_modules", ".bin", "vite"),
        os.path.join(cwd, "node_modules", ".bin", "vite.cmd")
    ]
    if any(os.path.isfile(candidate) for candidate in candidates):
        return

    print("Frontend dependencies not installed; running npm install (demo/frontend)...")
    subprocess.run(
        [npm_bin, "install"],
        cwd=cwd,
        env=env,
        check=True
    )


def ensure_backend_ready(cwd: str, npm_bin: str, env: dict) -> None:
    candidates = [
        os.path.join(cwd, "node_modules", ".bin", "tsx"),
        os.path.join(cwd, "node_modules", ".bin", "tsx.cmd")
    ]
    if any(os.path.isfile(candidate) for candidate in candidates):
        return

    print("Backend dependencies not installed; running npm install (demo/backend)...")
    subprocess.run(
        [npm_bin, "install"],
        cwd=cwd,
        env=env,
        check=True
    )

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
    Orchestrates the startup of Demo Backend and Demo Frontend.
    """
    parser = argparse.ArgumentParser(description="Run APIX demo services (backend/frontend).")
    parser.add_argument(
        "--env-file",
        default="",
        help="Path to env file to load before startup."
    )
    parser.add_argument(
        "--verification-rpc-file",
        default="",
        help="Path to file containing verification RPC URL (preferred for local demo and CI)."
    )
    parser.add_argument("--jwt-secret", default="", help="Shared JWT secret used by backend.")
    parser.add_argument("--allowed-origins", default="", help="Comma-separated CORS allowlist for backend.")
    parser.add_argument("--skip-frontend", action="store_true", help="Skip starting Vite frontend server.")
    parser.add_argument("--readiness-timeout", type=int, default=45, help="Seconds to wait for each service health check.")
    args = parser.parse_args()

    processes = []
    process_labels = []
    
    env = os.environ.copy()

    project_root = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), os.pardir))
    if args.env_file:
        load_env_file(os.path.abspath(args.env_file), env)
    else:
        load_env_file(os.path.join(project_root, ".env"), env)
        load_env_file(os.path.join(project_root, "demo", "backend", ".env"), env)

    args.jwt_secret = args.jwt_secret.strip() or env.get("APIX_JWT_SECRET", "").strip()
    args.allowed_origins = args.allowed_origins.strip() or env.get(
        "APIX_ALLOWED_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173"
    ).strip()

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
    env.setdefault("APIX_MIN_CONFIRMATIONS", "1")
    env.setdefault("APIX_CHAIN_ID", "43114")
    env.setdefault("APIX_NETWORK", "eip155:43114")
    env.setdefault("APIX_PAYMENT_CURRENCY", "AVAX")
    env.setdefault("APIX_PAYMENT_AMOUNT", "0.100000000000000000")
    env.setdefault("APIX_PAYMENT_AMOUNT_WEI", "100000000000000000")
    env.setdefault("APIX_PAYMENT_RECIPIENT", "0x71C7656EC7ab88b098defB751B7401B5f6d8976F")
    env["APIX_ALLOWED_ORIGINS"] = args.allowed_origins
    env.setdefault("VITE_API_BASE_URL", "http://localhost:3000")
    env.setdefault("VITE_AVALANCHE_CHAIN_ID", "43114")
    env.setdefault("VITE_AVALANCHE_NETWORK_NAME", "Avalanche C-Chain")
    env.setdefault("VITE_AVALANCHE_RPC_URL", "https://api.avax.network/ext/bc/C/rpc")
    env.setdefault("VITE_AVALANCHE_BLOCK_EXPLORER", "https://snowtrace.io")
    env.setdefault("APIX_SESSION_STORE_PATH", os.path.abspath(".tmp/apix-session-store.json"))
    env.setdefault("APIX_VERIFICATION_STORE_PATH", os.path.abspath(".tmp/apix-verification-store.json"))

    verification_rpc_url = resolve_verification_rpc_url(env, args.verification_rpc_file)
    if not verification_rpc_url:
        fallback_rpc = env.get("VITE_AVALANCHE_RPC_URL", "").strip()
        if fallback_rpc:
            verification_rpc_url = fallback_rpc
            print("Warning: APIX_VERIFICATION_RPC_URL not set. Using VITE_AVALANCHE_RPC_URL for local demo (rate-limited, non-production).")
        else:
            print("Error: verification requires APIX_VERIFICATION_RPC_URL or APIX_VERIFICATION_RPC_URL_FILE.")
            sys.exit(1)
    env["APIX_VERIFICATION_RPC_URL"] = verification_rpc_url

    npm_bin = resolve_npm_bin()
    if not npm_bin:
        print("Error: could not find npm in PATH.")
        sys.exit(1)

    os.makedirs(os.path.abspath(".tmp"), exist_ok=True)
    frontend_dir = os.path.abspath("demo/frontend")
    backend_dir = os.path.abspath("demo/backend")

    try:
        ensure_backend_ready(backend_dir, npm_bin, env)

        print("Starting Demo Backend (Node)...")
        p2 = subprocess.Popen([npm_bin, "start"], cwd=backend_dir, env=env)
        processes.append(p2)
        process_labels.append("demo-backend")
        
        if not args.skip_frontend:
            ensure_frontend_ready(frontend_dir, npm_bin, env)
            print("Starting Demo Frontend (Vite)...")
            p3 = subprocess.Popen([npm_bin, "run", "dev"], cwd=frontend_dir, env=env)
            processes.append(p3)
            process_labels.append("demo-frontend")

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
