const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// tmp ディレクトリが存在しない場合は作成
const tmpDir = process.env.VERCEL ? '/tmp' : path.join(__dirname, 'tmp');
if (!fs.existsSync(tmpDir)) {
  fs.mkdirSync(tmpDir, { recursive: true });
}

// ミドルウェア設定
app.use(express.static('.'));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cors());

// multerの設定 - 一時ファイル保存用
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

// ログミドルウェア
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// 一時ファイルを定期的にクリーンアップするスケジューラ
// 24時間以上経過したファイルを削除
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
        console.log(`古いファイルを削除しました: ${filePath}`);
      }
    });
  } catch (error) {
    console.error('ファイルクリーンアップ中にエラーが発生しました:', error);
  }
}, 60 * 60 * 1000); // 1時間ごとに実行

// SVGファイル保存API
app.post('/api/save-svg', upload.single('svgFile'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'SVGファイルが必要です' });
    }
    
    return res.json({
      success: true,
      message: 'SVGファイルを保存しました',
      filePath: req.file.path,
      fileName: req.file.filename
    });
  } catch (error) {
    console.error('SVGファイル保存エラー:', error);
    return res.status(500).json({ 
      error: 'SVGファイルの保存に失敗しました', 
      details: error.message 
    });
  }
});

// Vercel用のサーバーレス関数対応
if (process.env.VERCEL) {
  // Vercel環境では、モジュールをエクスポート
  module.exports = app;
} else {
  // ローカル環境では、サーバーを起動
  app.listen(PORT, () => {
    console.log(`サーバーが起動しました: http://localhost:${PORT}`);
    console.log('終了するには Ctrl+C を押してください');
  });
} 