const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Create tmp directory if it doesn't exist
const tmpDir = process.env.VERCEL ? '/tmp' : path.join(__dirname, 'tmp');
if (!fs.existsSync(tmpDir)) {
  fs.mkdirSync(tmpDir, { recursive: true });
}

// Middleware configuration
app.use(express.static('.'));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cors());

// Multer configuration - for temporary file storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, tmpDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + '.svg');
  }
});
const upload = multer({ storage: storage });

// Logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Scheduled temporary file cleanup
// Delete files older than 24 hours
setInterval(() => {
  try {
    const files = fs.readdirSync(tmpDir);
    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;
    
    files.forEach(file => {
      const filePath = path.join(tmpDir, file);
      const stats = fs.statSync(filePath);
      const fileAge = now - stats.mtimeMs;
      
      if (fileAge > oneDayMs) {
        fs.unlinkSync(filePath);
        console.log(`Deleted old file: ${filePath}`);
      }
    });
  } catch (error) {
    console.error('Error during file cleanup:', error);
  }
}, 60 * 60 * 1000); // Run every hour

// SVG file save API
app.post('/api/save-svg', upload.single('svgFile'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'SVG file is required' });
    }
    
    return res.json({
      success: true,
      message: 'SVG file saved successfully',
      filePath: req.file.path,
      fileName: req.file.filename
    });
  } catch (error) {
    console.error('SVG file save error:', error);
    return res.status(500).json({ 
      error: 'Failed to save SVG file', 
      details: error.message 
    });
  }
});

// Vercel serverless function support
if (process.env.VERCEL) {
  // Export module for Vercel environment
  module.exports = app;
} else {
  // Start server in local environment
  app.listen(PORT, () => {
    console.log(`Server started: http://localhost:${PORT}`);
    console.log('Press Ctrl+C to exit');
  });
} 