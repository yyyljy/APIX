import subprocess
import os
import sys
import shutil

def build_sdk():
    """
    Builds the Apix SDK using npm run build.
    """
    sdk_path = os.path.abspath("apix-sdk-node")
    npm_bin = "npm.cmd" if os.name == "nt" else "npm"
    if shutil.which(npm_bin) is None:
        print(f"Error: could not find {npm_bin} in PATH")
        sys.exit(1)
    
    print(f"Building SDK in {sdk_path}...")
    
    try:
        # npm install first to ensure dependencies
        subprocess.check_call([npm_bin, "install"], cwd=sdk_path)
        
        # npm run build
        subprocess.check_call([npm_bin, "run", "build"], cwd=sdk_path)
        
        # Create pack for local testing (optional but good for demo/backend linkage)
        # subprocess.check_call([npm_bin, "pack"], cwd=sdk_path)
        
        print("SDK Build Successful.")
        
    except subprocess.CalledProcessError as e:
        print(f"Error building SDK: {e}")
        sys.exit(1)

if __name__ == "__main__":
    build_sdk()
