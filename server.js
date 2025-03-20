const express = require('express');
const path = require('path');
const fs = require('fs');
const { createCanvas, Image } = require('canvas');
const { JSDOM } = require('jsdom');
const util = require('util');
const streamifier = require('streamifier');
const multer = require('multer');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// tmp ディレクトリが存在しない場合は作成
const tmpDir = path.join(__dirname, 'tmp');
if (!fs.existsSync(tmpDir)) {
  fs.mkdirSync(tmpDir, { recursive: true });
}

// ミドルウェア設定
app.use(express.static('.'));
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

// multerの設定 - 一時ファイル保存用
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, tmpDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + '.png');
  }
});
const upload = multer({ storage: storage });

// ログミドルウェア
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// ルートアクセス時にindex.htmlを返す
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// SVGをPNGに変換するAPI
app.post('/api/convert-svg', async (req, res) => {
  try {
    const { svgData, title = '漫画', imageUrls = [] } = req.body;
    
    if (!svgData) {
      return res.status(400).json({ error: 'SVGデータが必要です' });
    }
    
    console.log('SVGデータを受信しました', svgData.substring(0, 100) + '...');
    console.log('画像URL一覧:', imageUrls);
    
    // ファイル名の生成
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    const fileName = `${title}-${timestamp}.png`;
    const filePath = path.join(tmpDir, fileName);
    
    // キャンバスサイズ設定
    const CANVAS_SIZE = 2000; // 高解像度で出力
    const canvas = createCanvas(CANVAS_SIZE, CANVAS_SIZE);
    const ctx = canvas.getContext('2d');
    
    // 白背景で塗りつぶし
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // 各パネルの情報を抽出
    const panelRegex = /<g>[\s\S]*?<\/g>/g;
    const panels = [];
    let match;
    
    while ((match = panelRegex.exec(svgData)) !== null) {
      panels.push(match[0]);
    }
    
    console.log(`抽出されたパネル数: ${panels.length}`);
    
    // 各パネルを描画
    for (let i = 0; i < panels.length; i++) {
      const panelData = panels[i];
      
      // パネルから長方形または多角形の情報を抽出
      let rectMatch = panelData.match(/<rect[^>]*x="([^"]*)"[^>]*y="([^"]*)"[^>]*width="([^"]*)"[^>]*height="([^"]*)"/);
      let polygonMatch = panelData.match(/<polygon[^>]*points="([^"]*)"/);
      
      // パネルから画像情報を抽出
      const imageMatch = panelData.match(/<image[^>]*x="([^"]*)"[^>]*y="([^"]*)"[^>]*width="([^"]*)"[^>]*height="([^"]*)"[^>]*href="([^"]*)"/);
      
      if (imageMatch) {
        // 画像の座標とサイズ
        const x = parseFloat(imageMatch[1]) * CANVAS_SIZE / 100;
        const y = parseFloat(imageMatch[2]) * CANVAS_SIZE / 100;
        const width = parseFloat(imageMatch[3]) * CANVAS_SIZE / 100;
        const height = parseFloat(imageMatch[4]) * CANVAS_SIZE / 100;
        let imageUrl = imageMatch[5];
        
        console.log(`パネル ${i+1} の画像情報:`, { x, y, width, height, imageUrl });
        
        try {
          // 画像URLをデコード
          if (imageUrl.startsWith('data:')) {
            // データURLの場合はそのまま使用
          } else if (imageUrl.startsWith('http')) {
            // 絶対URLの場合はそのまま使用
          } else {
            // 相対パスの場合は修正
            if (!imageUrl.startsWith('/')) {
              imageUrl = '/' + imageUrl;
            }
            imageUrl = `http://localhost:${PORT}${imageUrl}`;
          }
          
          // 画像の読み込み
          const img = new Image();
          const loadImagePromise = new Promise((resolve, reject) => {
            img.onload = () => resolve(img);
            img.onerror = (e) => {
              console.error(`画像読み込みエラー: ${imageUrl}`, e);
              reject(new Error(`画像の読み込みに失敗しました: ${imageUrl}`));
            };
          });
          
          img.src = imageUrl;
          await loadImagePromise;
          
          // 画像のクリッピングパスの処理
          if (polygonMatch) {
            // 多角形のクリッピングの場合
            const points = polygonMatch[1].split(' ').map(point => {
              const [x, y] = point.split(',');
              return [parseFloat(x) * CANVAS_SIZE / 100, parseFloat(y) * CANVAS_SIZE / 100];
            });
            
            ctx.save();
            ctx.beginPath();
            
            // 最初の点に移動
            if (points.length > 0) {
              ctx.moveTo(points[0][0], points[0][1]);
              
              // 残りの点を線で結ぶ
              for (let j = 1; j < points.length; j++) {
                ctx.lineTo(points[j][0], points[j][1]);
              }
              
              ctx.closePath();
              ctx.clip();
              
              // クリッピングパスの内側に画像を描画
              ctx.drawImage(img, x, y, width, height);
              
              // 多角形の境界線を描画（オプション）
              ctx.strokeStyle = 'black';
              ctx.lineWidth = 0.5;
              ctx.stroke();
              
              ctx.restore();
            }
          } else if (rectMatch) {
            // 長方形の場合
            const rectX = parseFloat(rectMatch[1]) * CANVAS_SIZE / 100;
            const rectY = parseFloat(rectMatch[2]) * CANVAS_SIZE / 100;
            const rectWidth = parseFloat(rectMatch[3]) * CANVAS_SIZE / 100;
            const rectHeight = parseFloat(rectMatch[4]) * CANVAS_SIZE / 100;
            
            ctx.save();
            ctx.beginPath();
            ctx.rect(rectX, rectY, rectWidth, rectHeight);
            ctx.clip();
            
            // クリッピングパスの内側に画像を描画
            ctx.drawImage(img, x, y, width, height);
            
            // 長方形の境界線を描画
            ctx.strokeStyle = 'black';
            ctx.lineWidth = 0.5;
            ctx.stroke();
            
            ctx.restore();
          } else {
            // クリッピングパスがない場合は単純に画像を描画
            ctx.drawImage(img, x, y, width, height);
          }
          
        } catch (imgError) {
          console.error(`パネル ${i+1} の画像描画中にエラー:`, imgError);
          // エラーが発生しても処理を続行
        }
      }
      
      // パネル番号テキストの描画（オプション）
      const textMatch = panelData.match(/<text[^>]*x="([^"]*)"[^>]*y="([^"]*)"[^>]*>(\d+)<\/text>/);
      if (textMatch) {
        const textX = parseFloat(textMatch[1]) * CANVAS_SIZE / 100;
        const textY = parseFloat(textMatch[2]) * CANVAS_SIZE / 100;
        const panelNumber = textMatch[3];
        
        ctx.fillStyle = 'red';
        ctx.font = '32px Arial';
        ctx.fillText(panelNumber, textX, textY);
      }
    }
    
    // パネルの枠線を描画
    for (let i = 0; i < panels.length; i++) {
      const panelData = panels[i];
      
      // 長方形の情報を抽出
      const rectMatch = panelData.match(/<rect[^>]*x="([^"]*)"[^>]*y="([^"]*)"[^>]*width="([^"]*)"[^>]*height="([^"]*)"/);
      
      // 多角形の情報を抽出
      const polygonMatch = panelData.match(/<polygon[^>]*points="([^"]*)"/);
      
      if (rectMatch) {
        // 長方形の場合
        const x = parseFloat(rectMatch[1]) * CANVAS_SIZE / 100;
        const y = parseFloat(rectMatch[2]) * CANVAS_SIZE / 100;
        const width = parseFloat(rectMatch[3]) * CANVAS_SIZE / 100;
        const height = parseFloat(rectMatch[4]) * CANVAS_SIZE / 100;
        
        // 長方形の境界線を描画
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, width, height);
      } else if (polygonMatch) {
        // 多角形の場合
        const points = polygonMatch[1].split(' ').map(point => {
          const [x, y] = point.split(',');
          return [parseFloat(x) * CANVAS_SIZE / 100, parseFloat(y) * CANVAS_SIZE / 100];
        });
        
        ctx.beginPath();
        
        // 最初の点に移動
        if (points.length > 0) {
          ctx.moveTo(points[0][0], points[0][1]);
          
          // 残りの点を線で結ぶ
          for (let j = 1; j < points.length; j++) {
            ctx.lineTo(points[j][0], points[j][1]);
          }
          
          ctx.closePath();
          ctx.strokeStyle = 'black';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }
    }
    
    // PNGとして保存
    const out = fs.createWriteStream(filePath);
    const stream = canvas.createPNGStream({
      quality: 0.95,
      compressionLevel: 6,
      filters: canvas.PNG_ALL_FILTERS
    });
    
    // ストリームの完了を待つ
    await new Promise((resolve, reject) => {
      stream.pipe(out);
      out.on('finish', resolve);
      out.on('error', reject);
    });
    
    console.log(`PNG画像を保存しました: ${filePath}`);
    
    // ファイルのダウンロードURLを返す
    const downloadUrl = `/tmp/${fileName}`;
    res.json({ 
      success: true, 
      message: 'SVGの変換に成功しました',
      downloadUrl,
      fileName
    });
    
  } catch (error) {
    console.error('SVG変換エラー:', error);
    res.status(500).json({ 
      error: '画像変換に失敗しました', 
      details: error.message 
    });
  }
});

// 一時ファイルのダウンロード
app.get('/tmp/:fileName', (req, res) => {
  const fileName = req.params.fileName;
  const filePath = path.join(tmpDir, fileName);
  
  if (fs.existsSync(filePath)) {
    res.download(filePath, fileName, (err) => {
      if (err) {
        console.error('ダウンロードエラー:', err);
        res.status(500).send('ファイルのダウンロード中にエラーが発生しました');
      }
      
      // ダウンロード後にファイルを削除（オプション）
      // fs.unlinkSync(filePath);
    });
  } else {
    res.status(404).send('ファイルが見つかりません');
  }
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