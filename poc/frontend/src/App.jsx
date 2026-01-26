import { useState } from 'react'
import { ethers } from 'ethers'
import { fetchProxyResource, verifyPayment, loginUser } from './utils/api'

function App() {
    const [account, setAccount] = useState(null)
    const [logs, setLogs] = useState([])
    const [resourceData, setResourceData] = useState(null)
    const [loading, setLoading] = useState(false)
    const [accessToken, setAccessToken] = useState(null)

    const addLog = (msg, type = 'info') => {
        setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg} (${type})`, ...prev])
    }

    const connectWallet = async () => {
        if (!window.ethereum) {
            addLog("Metamask not found!", "error")
            return
        }
        try {
            const provider = new ethers.BrowserProvider(window.ethereum)
            const accounts = await provider.send("eth_requestAccounts", [])
            setAccount(accounts[0])
            addLog(`Wallet Connected: ${accounts[0]}`, "success")

            // Call Backend Login
            addLog("Authenticating with Backend...", "info")
            const loginRes = await loginUser(accounts[0]) // Auto-import needed or manual fix
            const loginData = await loginRes.json()

            if (loginData.success) {
                addLog("Backend Session Established", "success")
                // Store token if needed, for now just log it
                console.log("Session Token:", loginData.data.accessToken)
            } else {
                addLog("Backend Authentication Failed", "error")
            }
        } catch (err) {
            addLog(`Connection Failed: ${err.message}`, "error")
        }
    }

    const handleRequest = async () => {
        setLoading(true)
        setResourceData(null)
        addLog("Requesting Restricted Resource...", "info")

        try {
            // 1. Trigger 402
            const response = await fetchProxyResource("listing_001", accessToken)
            const data = await response.json()

            if (response.status === 200) {
                setResourceData(data.data)
                addLog("Resource Access Granted!", "success")
            } else if (response.status === 402) {
                addLog("402 Payment Required received.", "error")
                await handlePayment(data.error.details)
            } else {
                addLog(`Unexpected Error: ${response.status}`, "error")
            }
        } catch (err) {
            addLog(`Request Failed: ${err.message}`, "error")
        } finally {
            setLoading(false)
        }
    }

    const handlePayment = async (details) => {
        if (!account) {
            addLog("Please connect wallet first!", "error")
            return
        }

        try {
            const { request_id, payment_info } = details
            addLog(`Initializing Payment for Request: ${request_id}`, "info")
            addLog(`Amount: ${ethers.formatEther(payment_info.amount)} AVAX`, "info")

            // 2. Send Transaction
            const provider = new ethers.BrowserProvider(window.ethereum)
            const signer = await provider.getSigner()

            const tx = {
                to: payment_info.recipient,
                value: payment_info.amount,
                // In real app, include memo in data if supported by contract or as input data
            }

            addLog("Sending Transaction... Check Wallet", "info")
            const txResponse = await signer.sendTransaction(tx)
            addLog(`TX Sent! Hash: ${txResponse.hash}`, "success")
            addLog("Waiting for confirmation...", "info")

            await txResponse.wait()
            addLog("Transaction Confirmed on-chain.", "success")

            // 3. Verify
            addLog("Verifying payment with Gateway...", "info")
            const verifyRes = await verifyPayment(request_id, txResponse.hash)
            const verifyData = await verifyRes.json()

            if (verifyData.success) {
                addLog("Verification Successful!", "success")
                setAccessToken(verifyData.data.access_token)
                addLog("Access Token Received. Retrying resource request...", "info")

                // 4. Retry Resource Access (Auto)
                const retryRes = await fetchProxyResource("listing_001", verifyData.data.access_token)
                const retryData = await retryRes.json()
                if (retryRes.status === 200) {
                    setResourceData(retryData.data)
                    addLog("Final Access Granted!", "success")
                }
            } else {
                addLog("Verification Failed on Server.", "error")
            }

        } catch (err) {
            // Checking for "user rejected" which is common
            if (err.code === "ACTION_REJECTED") {
                addLog("User rejected the transaction.", "error")
            } else {
                addLog(`Payment Logic Failed: ${err.message}`, "error")
            }
        }
    }

    return (
        <div className="App" style={{ maxWidth: '800px', margin: '0 auto', textAlign: 'center' }}>
            <h1>Apix x402 PoC</h1>

            <div className="card">
                {!account ? (
                    <button onClick={connectWallet}>Connect Wallet</button>
                ) : (
                    <div>
                        <p className="success">Connected: {account}</p>
                        <div style={{ marginTop: '20px' }}>
                            <button onClick={handleRequest} disabled={loading}>
                                {loading ? "Processing..." : "Get Secret Data (Trigger x402)"}
                            </button>
                        </div>
                    </div>
                )}

                {resourceData && (
                    <div style={{ marginTop: '20px', padding: '15px', border: '1px solid #646cff', borderRadius: '8px' }}>
                        <h2>🎉 Secret Data</h2>
                        <p>Value: {resourceData.value}</p>
                        <p>Message: {resourceData.message}</p>
                    </div>
                )}
            </div>

            <div className="logs">
                <h3>Transaction Logs</h3>
                {logs.length === 0 && <span className="info">Waiting for actions...</span>}
                {logs.map((log, i) => {
                    const className = log.includes('(error)') ? 'error' : log.includes('(success)') ? 'success' : 'info';
                    return <div key={i} className={`log-entry ${className}`}>{log}</div>
                })}
            </div>
        </div>
    )
}

export default App
