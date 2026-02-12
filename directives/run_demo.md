# Run Apix Demo Environment

**Goal:** Start the full Apix demo stack (Cloud + Backend + Frontend) for local development and testing.

**Inputs:**
- None

**Tools:**
- `execution/run_demo.py`: Orchestrates the startup of all three services.

**Outputs:**
- Access to:
    - Apix Cloud Mock: http://localhost:8080
    - Demo Backend: http://localhost:3000
    - Demo Frontend: http://localhost:5173

**Instructions:**
1.  Run `python execution/run_demo.py`.
2.  Follow the console output to see service status.
3.  Press `Ctrl+C` to stop all services.
