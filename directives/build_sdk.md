# Build Apix SDK

**Goal:** Compile the TypeScript SDK into a usable Node.js package.

**Inputs:**
- Source code in `apix-sdk-node/`

**Tools:**
- `execution/build_sdk.py`: Runs the npm build process.

**Outputs:**
- Compiled JS files in `apix-sdk-node/`
- `.tgz` package file (optional, if packing)

**Instructions:**
1.  Run `python execution/build_sdk.py`.
2.  Verify "Build successful" message.
