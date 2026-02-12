const http = require('http');

const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/apix-product',
    method: 'GET',
};

const req = http.request(options, (res) => {
    console.log(`STATUS: ${res.statusCode}`);
    console.log(`HEADERS: ${JSON.stringify(res.headers)}`);

    let data = '';
    res.on('data', (chunk) => {
        data += chunk;
    });

    res.on('end', () => {
        console.log(`BODY: ${data}`);
        const body = JSON.parse(data);
        if (res.statusCode === 402 && body.details && body.details.payment_info) {
            console.log("VERIFICATION SUCCESS: x402 response is valid.");
            process.exit(0);
        } else {
            console.error("VERIFICATION FAILED: Invalid response.");
            process.exit(1);
        }
    });
});

req.on('error', (e) => {
    console.error(`problem with request: ${e.message}`);
    process.exit(1);
});

req.end();
