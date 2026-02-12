import subprocess
import os
import sys

def build_sdk():
    """
    Builds the Apix SDK using npm run build.
    """
    sdk_path = os.path.abspath("apix-sdk-node")
    
    print(f"Building SDK in {sdk_path}...")
    
    try:
        # npm install first to ensure dependencies
        subprocess.check_call(["npm", "install"], cwd=sdk_path, shell=True)
        
        # npm run build
        subprocess.check_call(["npm", "run", "build"], cwd=sdk_path, shell=True)
        
        # Create pack for local testing (optional but good for demo/backend linkage)
        # subprocess.check_call(["npm", "pack"], cwd=sdk_path, shell=True)
        
        print("SDK Build Successful.")
        
    except subprocess.CalledProcessError as e:
        print(f"Error building SDK: {e}")
        sys.exit(1)

if __name__ == "__main__":
    build_sdk()
