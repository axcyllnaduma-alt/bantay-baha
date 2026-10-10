
let currentWaterLevel = 80.0; 

function sendReading() {
    const change = (Math.random() * 10) - 5;
    currentWaterLevel += change;

    if (currentWaterLevel < 0) currentWaterLevel = 0;
    if (currentWaterLevel > 500) currentWaterLevel = 500;

    const payload = {
        sensorId: "CREEK-01",
        waterLevelCm: parseFloat(currentWaterLevel.toFixed(1)),
        timestamp: new Date().toISOString()
    };

    fetch('http://localhost:3000/api/readings', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    })
    .then(response => {
        if (response.ok) {
            console.log(`[Simulator] Sent reading: ${payload.waterLevelCm} cm`);
        } else {
            console.error('[Simulator] Error sending reading', response.status);
        }
    })
    .catch(error => console.error('[Simulator] Connection error:', error.message));
}

console.log("Starting Bantay Baha IoT Simulator...");
setInterval(sendReading, 5000);