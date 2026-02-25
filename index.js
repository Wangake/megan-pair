const express = require('express');
const path = require('path');
const fs = require('fs');
const { makeid } = require('./id');
const pairRouter = require('./pair');

const app = express();
const PORT = process.env.PORT || 3000;

// Create temp directory if it doesn't exist
if (!fs.existsSync('./temp')) {
    fs.mkdirSync('./temp');
}

// Serve static files from public directory
app.use(express.static('public'));

// Use pairing router
app.use('/pair', pairRouter);

// Serve HTML page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`✅ Server running on http://localhost:${PORT}`);
    console.log(`📱 Open your browser to start pairing`);
});