require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const port = process.env.PORT || 3000;

// Initialize Gemini Client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.use(cors());
app.use(express.static(__dirname));
app.use(express.json()); 

let readings = [];

// Helper function para makuha ang summary ng readings
function calculateSummary() {
    if (readings.length === 0) {
        return { message: "No data yet", average: 0, min: 0, max: 0, statusCounts: { normal: 0, alert: 0, danger: 0 }, trend: "steady" };
    }

    let total = 0, min = readings[0].waterLevelCm, max = readings[0].waterLevelCm;
    let normal = 0, alert = 0, danger = 0;

    readings.forEach(r => {
        const level = r.waterLevelCm;
        total += level;
        if (level < min) min = level;
        if (level > max) max = level;

        if (level < 100) normal++;
        else if (level < 150) alert++;
        else danger++;
    });

    const average = (total / readings.length).toFixed(2);
    
    let trend = "steady";
    if (readings.length >= 10) {
        const last5 = readings.slice(-5);
        const prev5 = readings.slice(-10, -5);
        const avgLast5 = last5.reduce((sum, r) => sum + r.waterLevelCm, 0) / 5;
        const avgPrev5 = prev5.reduce((sum, r) => sum + r.waterLevelCm, 0) / 5;
        
        if (avgLast5 > avgPrev5) trend = "rising";
        else if (avgLast5 < avgPrev5) trend = "falling";
    }

    return { average: Number(average), min, max, statusCounts: { normal, alert, danger }, trend };
}

// ---------------- REST ENDPOINTS ---------------- //

// Save new reading
app.post('/api/readings', (req, res) => {
    const { sensorId, waterLevelCm, timestamp } = req.body;
    
    if (!sensorId) {
        return res.status(400).json({ error: "sensorId is required" });
    }
    if (typeof waterLevelCm !== 'number' || waterLevelCm < 0 || waterLevelCm > 500) {
        return res.status(400).json({ error: "waterLevelCm must be a number between 0 and 500" });
    }

    const newReading = {
        sensorId,
        waterLevelCm,
        timestamp: timestamp || new Date().toISOString()
    };

    readings.push(newReading);
    res.status(201).json({ message: "Reading saved", reading: newReading });
});

// Get recent readings
app.get('/api/readings', (req, res) => {
    const recentReadings = [...readings].reverse().slice(0, 50);
    res.json(recentReadings);
});

// Get readings summary
app.get('/api/summary', (req, res) => {
    res.json(calculateSummary());
});

// AI Analysis Endpoint (Pangmatagalang buod)
app.get('/api/ai-analysis', async (req, res) => {
    try {
        const summary = calculateSummary();
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const prompt = `
            Ikaw ay isang AI assistant para sa "Bantay Baha", isang flood monitoring system sa Pilipinas.
            Suriin ang sumusunod na data ng tubig sa cm at magbigay ng maikling babala o payo para sa mga residente (sa Tagalog):
            - Average Water Level: ${summary.average} cm
            - Min Water Level: ${summary.min} cm
            - Max Water Level: ${summary.max} cm
            - Trend: ${summary.trend}
            - Threshold Status: Normal (${summary.statusCounts.normal}), Alert (${summary.statusCounts.alert}), Danger (${summary.statusCounts.danger})
        `;

        const result = await model.generateContent(prompt);
        const responseText = result.response.text();

        res.json({ analysis: responseText });
    } catch (error) {
        console.error("Gemini Error:", error);
        res.status(500).json({ error: "Failed to generate AI analysis" });
    }
});

// AI Advisory Endpoint (Maikling abiso batay sa huling reading)
app.get('/api/advisory', async (req, res) => {
    // Kunin ang pinakabagong reading
    const currentLevel = readings.length > 0 ? readings[readings.length - 1].waterLevelCm : 0;
    
    // Ang prompt na naglalaman lang ng numbers na kailangan ng AI
    const prompt = `The current water level is ${currentLevel} cm. Based only on this number, write a short public advisory in Filipino and English telling residents what to do. Maximum of 3 sentences.`;

    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        
        res.json({ advisory: text, waterLevelCm: currentLevel });
    } catch (error) {
        console.error("AI API failed, using fallback:", error.message);
        
        // RULE-BASED FALLBACK kung mag-fail ang AI
        let fallback = "Water level is NORMAL. No immediate action required. / NORMAL ang lebel ng tubig. Walang dapat ipag-alala.";
        if (currentLevel >= 150) {
            fallback = "DANGER! Water level is high. Evacuate immediately! / PANGANIB! Mataas ang tubig. Lumikas na agad!";
        } else if (currentLevel >= 100) {
            fallback = "ALERT. Water is rising. Prepare to evacuate. / BABALA. Tumaas ang tubig. Maghanda sa paglikas.";
        }
        
        res.json({ advisory: fallback, waterLevelCm: currentLevel, isFallback: true });
    }
});


app.listen(port, () => {
    console.log(`Bantay Baha API running on http://localhost:${port}`);
});