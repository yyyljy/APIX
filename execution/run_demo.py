import subprocess
import time
import os
import sys

def run_demo():
    """
    Orchestrates the startup of Apix Cloud, Demo Backend, and Demo Frontend.
    """
    processes = []
    
    env = os.environ.copy()
    env.setdefault("APIX_JWT_SECRET", "apix-dev-local-secret-change-me")
    env.setdefault("APIX_JWT_KID", "dev-v1")
    env.setdefault("APIX_ENABLE_MOCK_VERIFY", "true")
    env.setdefault("APIX_MIN_CONFIRMATIONS", "1")

    try:
        print("Starting Apix Cloud (Go)...")
        p1 = subprocess.Popen(["go", "run", "main.go"], cwd=os.path.abspath("apix-cloud"), env=env)
        processes.append(p1)
        
        print("Starting Demo Backend (Node)...")
        p2 = subprocess.Popen(["npm.cmd", "start"], cwd=os.path.abspath("demo/backend"), env=env)
        processes.append(p2)
        
        print("Starting Demo Frontend (Vite)...")
        p3 = subprocess.Popen(["npm.cmd", "run", "dev"], cwd=os.path.abspath("demo/frontend"), env=env)
        processes.append(p3)
        
        print("All services started. Press Ctrl+C to stop.")
        
        # Keep main process alive
        while True:
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
