import requests
import sys

BASE_URL = "http://localhost:3000"

def test_402_response():
    print("Testing 402 Response...")
    try:
        response = requests.get(f"{BASE_URL}/apix-product")
        
        if response.status_code != 402:
            print(f"FAILED: Expected 402, got {response.status_code}")
            return False
            
        auth_header = response.headers.get("WWW-Authenticate")
        if not auth_header:
            print("FAILED: Missing WWW-Authenticate header")
            return False
            
        if 'Apix realm="Apix Protected"' not in auth_header:
            print(f"FAILED: Invalid WWW-Authenticate header: {auth_header}")
            return False
            
        print("SUCCESS: 402 Response valid.")
        return True
    except Exception as e:
        print(f"Error connecting to backend: {e}")
        return False

def test_200_success():
    print("Testing 200 Success flow...")
    
    # 1. Delegated Verification (TxHash)
    headers = {
        "Authorization": "Apix 0x123456789abcdef"
    }
    jwt_token = ""
    
    try:
        print("  Sending TxHash...")
        response = requests.get(f"{BASE_URL}/apix-product", headers=headers)
        
        if response.status_code != 200:
            print(f"  FAILED: Expected 200, got {response.status_code}")
            print(f"  Response: {response.text}")
            return False
            
        data = response.json()
        if data.get("method") != "Apix":
            print("  FAILED: Response method mismatch")
            return False
            
        jwt_token = data.get("proof")
        if not jwt_token or len(jwt_token) < 50:
             print(f"  FAILED: Invalid JWT token received: {jwt_token}")
             return False
             
        print("  SUCCESS: Delegated Verification passed. JWT received.")
        
    except Exception as e:
        print(f"  Error connecting to backend: {e}")
        return False

    # 2. Session Validation (JWT)
    print("  Sending JWT...")
    headers_jwt = {
        "Authorization": f"Apix {jwt_token}"
    }
    
    try:
        response = requests.get(f"{BASE_URL}/apix-product", headers=headers_jwt)
        
        if response.status_code != 200:
            print(f"  FAILED: Expected 200 with JWT, got {response.status_code}")
            print(f"  Response: {response.text}")
            return False
            
        print("  SUCCESS: Session Validation passed.")
        return True
        
    except Exception as e:
        print(f"  Error connecting to backend with JWT: {e}")
        return False

if __name__ == "__main__":
    if test_402_response() and test_200_success():
        print("ALL TESTS PASSED")
        sys.exit(0)
    else:
        print("TESTS FAILED")
        sys.exit(1)
