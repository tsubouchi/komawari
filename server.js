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
const https = require('https');
const http = require('http');

const app = express();
const PORT = process.env.PORT || 3000;

// tmp ディレクトリが存在しない場合は作成
const tmpDir = process.env.VERCEL ? '/tmp' : path.join(__dirname, 'tmp');
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

// サーバー側でURLから画像をダウンロードする関数（httpとhttpsモジュールを使用）
function downloadImage(url) {
  return new Promise((resolve, reject) => {
    console.log(`画像のダウンロード開始: ${url}`);
    
    // httpかhttpsかを判断
    const client = url.startsWith('https') ? https : http;
    
    const request = client.get(url, (response) => {
      // リダイレクトの処理
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location;
        console.log(`リダイレクト: ${url} -> ${redirectUrl}`);
        if (redirectUrl) {
          return downloadImage(redirectUrl).then(resolve).catch(reject);
        }
      }
      
      // エラーレスポンスの処理
      if (response.statusCode < 200 || response.statusCode >= 300) {
        return reject(new Error(`画像のダウンロードに失敗しました: HTTPステータス ${response.statusCode}`));
      }
      
      // 画像データのチャンクを集める
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      
      // データ受信完了時の処理
      response.on('end', () => {
        try {
          // すべてのチャンクを結合して1つのバッファにする
          const buffer = Buffer.concat(chunks);
          
          // 画像オブジェクトを作成
          const img = new Image();
          
          // 画像の読み込み完了時とエラー時のハンドラを設定
          img.onload = () => {
            console.log(`画像の読み込み成功: ${url} (${img.width}x${img.height})`);
            resolve(img);
          };
          
          img.onerror = (err) => {
            console.error(`画像の読み込みエラー: ${url}`, err);
            reject(new Error(`画像の読み込みに失敗しました: ${err.message || 'Unknown error'}`));
          };
          
          // バッファから直接読み込み
          img.src = buffer;
        } catch (error) {
          console.error(`画像の処理中にエラー発生: ${url}`, error);
          reject(error);
        }
      });
    });
    
    // リクエストエラーの処理
    request.on('error', (err) => {
      console.error(`画像リクエストエラー: ${url}`, err);
      reject(new Error(`画像のダウンロードリクエストに失敗しました: ${err.message}`));
    });
    
    // タイムアウトの設定
    request.setTimeout(10000, () => {
      request.destroy();
      reject(new Error(`画像のダウンロードがタイムアウトしました: ${url}`));
    });
  });
}

// SVGをPNGに変換するAPI
app.post('/api/convert-svg', async (req, res) => {
  try {
    const { svgData, title = '漫画', imageUrls = [] } = req.body;
    
    if (!svgData) {
      return res.status(400).json({ error: 'SVGデータが必要です' });
    }
    
    console.log('SVGデータを受信しました', svgData.substring(0, 100) + '...');
    console.log('画像URL一覧:', imageUrls);
    
    // デバッグモードの場合はSVGを直接保存
    const debugMode = req.query.debug === 'true';
    if (debugMode) {
      console.log('デバッグモード: SVGデータを直接保存します');
      
      // ファイル名の生成
      const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
      const svgFileName = `${title}-${timestamp}.svg`;
      const svgFilePath = path.join(tmpDir, svgFileName);
      
      // SVGファイルに保存
      fs.writeFileSync(svgFilePath, svgData, 'utf8');
      
      // SVGダウンロードURLを返す
      return res.json({
        success: true,
        message: 'SVGファイルを保存しました',
        downloadUrl: `/tmp/${svgFileName}`,
        fileName: svgFileName
      });
    }
    
    // 処理ステータス
    const processStatus = {
      step: 'init',
      message: '画像変換を開始します',
      timestamp: new Date().toISOString()
    };
    
    console.log(`処理ステータス: ${processStatus.step} - ${processStatus.message}`);
    
    // ファイル名の生成
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    const fileName = `${title}-${timestamp}.png`;
    const filePath = path.join(tmpDir, fileName);
    
    // 進捗ステータス更新
    processStatus.step = 'create_canvas';
    processStatus.message = 'キャンバス作成中';
    console.log(`処理ステータス: ${processStatus.step} - ${processStatus.message}`);
    
    // キャンバスサイズ設定
    const CANVAS_SIZE = 2000; // 高解像度で出力
    const canvas = createCanvas(CANVAS_SIZE, CANVAS_SIZE);
    const ctx = canvas.getContext('2d');
    
    // 白背景で塗りつぶし
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // 進捗ステータス更新
    processStatus.step = 'image_caching';
    processStatus.message = '画像のキャッシュ中';
    console.log(`処理ステータス: ${processStatus.step} - ${processStatus.message}`);
    
    // 画像URLをキャッシュ
    const imageCache = {};
    
    // 受信した画像URLを事前にダウンロードしてキャッシュ
    for (const url of imageUrls) {
      try {
        // 進捗ステータス更新
        processStatus.step = 'downloading_image';
        processStatus.message = `画像ダウンロード中: ${url}`;
        console.log(`処理ステータス: ${processStatus.step} - ${processStatus.message}`);
        
        const img = await downloadImage(url);
        imageCache[url] = img;
        console.log(`画像をキャッシュしました: ${url} (${img.width}x${img.height})`);
      } catch (error) {
        console.error(`画像のキャッシュに失敗: ${url}`, error);
      }
    }
    
    // 進捗ステータス更新
    processStatus.step = 'svg_parsing';
    processStatus.message = 'SVGパース中';
    console.log(`処理ステータス: ${processStatus.step} - ${processStatus.message}`);
    
    // 各パネルの情報を抽出
    const panelRegex = /<g>[\s\S]*?<\/g>/g;
    const panels = [];
    let match;
    
    while ((match = panelRegex.exec(svgData)) !== null) {
      panels.push(match[0]);
    }
    
    console.log(`抽出されたパネル数: ${panels.length}`);
    
    // 進捗ステータス更新
    processStatus.step = 'panel_drawing';
    processStatus.message = 'パネル描画中';
    console.log(`処理ステータス: ${processStatus.step} - ${processStatus.message}`);
    
    // 各パネルを描画
    for (let i = 0; i < panels.length; i++) {
      const panelData = panels[i];
      
      // 進捗ステータス更新
      processStatus.step = `drawing_panel_${i+1}`;
      processStatus.message = `パネル ${i+1} 描画中`;
      console.log(`処理ステータス: ${processStatus.step} - ${processStatus.message}`);
      
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
          // クライアントから受け取った画像URLリストから該当する画像を探す
          const decodedImageUrl = decodeURIComponent(imageUrl);
          const imageName = decodedImageUrl.split('/').pop(); // URLの最後の部分（ファイル名）を取得
          console.log(`画像名: ${imageName}`);
          
          // 受信したimageUrlsからマッチするURLを検索
          let matchedUrl = null;
          for (const url of imageUrls) {
            if (url.includes(imageName)) {
              matchedUrl = url;
              console.log(`画像URLがマッチしました: ${url}`);
              break;
            }
          }
          
          if (matchedUrl) {
            // 既にフルURLが見つかった場合はそれを使用
            imageUrl = matchedUrl;
          } else {
            // フルURLが見つからなかった場合はベースURLから構築
            // 進捗ステータス更新
            processStatus.step = `resolving_image_url`;
            processStatus.message = `画像URL解決中: ${imageUrl}`;
            console.log(`処理ステータス: ${processStatus.step} - ${processStatus.message}`);
            
            let baseUrl;
            if (process.env.VERCEL) {
              // Vercel環境ではリクエストヘッダーからホスト名を取得
              const host = req.headers.host || 'komawari.vercel.app';
              const protocol = req.headers['x-forwarded-proto'] || 'https';
              baseUrl = `${protocol}://${host}`;
              console.log(`Vercel環境でのベースURL: ${baseUrl}`);
            } else {
              // ローカル環境
              baseUrl = `http://localhost:${PORT}`;
            }
            
            if (imageUrl.startsWith('/')) {
              imageUrl = `${baseUrl}${imageUrl}`;
            } else if (!imageUrl.startsWith('http') && !imageUrl.startsWith('data:')) {
              imageUrl = `${baseUrl}/${imageName}`;
            }
          }
          
          console.log(`解決された画像URL: ${imageUrl}`);
          
          let img = null;
          
          // キャッシュから画像を取得
          if (imageCache[imageUrl]) {
            img = imageCache[imageUrl];
            console.log(`キャッシュから画像を使用: ${imageUrl}`);
          } else {
            // 画像をダウンロード
            try {
              // 進捗ステータス更新
              processStatus.step = `downloading_missing_image`;
              processStatus.message = `未キャッシュ画像ダウンロード中: ${imageUrl}`;
              console.log(`処理ステータス: ${processStatus.step} - ${processStatus.message}`);
              
              img = await downloadImage(imageUrl);
              imageCache[imageUrl] = img; // キャッシュに追加
              console.log(`追加画像ダウンロード完了: ${imageUrl} (${img.width}x${img.height})`);
            } catch (imgError) {
              console.error(`画像のダウンロードに失敗: ${imageUrl}`, imgError);
              continue; // このパネルの画像処理をスキップ
            }
          }
          
          if (!img) {
            console.error(`画像の取得に失敗: ${imageUrl}`);
            // 代わりにテストパターンを描画
            ctx.save();
            if (polygonMatch || rectMatch) {
              ctx.beginPath();
              
              if (polygonMatch) {
                const points = polygonMatch[1].split(' ').map(point => {
                  const [x, y] = point.split(',');
                  return [parseFloat(x) * CANVAS_SIZE / 100, parseFloat(y) * CANVAS_SIZE / 100];
                });
                
                if (points.length > 0) {
                  ctx.moveTo(points[0][0], points[0][1]);
                  for (let j = 1; j < points.length; j++) {
                    ctx.lineTo(points[j][0], points[j][1]);
                  }
                  ctx.closePath();
                }
              } else if (rectMatch) {
                const rectX = parseFloat(rectMatch[1]) * CANVAS_SIZE / 100;
                const rectY = parseFloat(rectMatch[2]) * CANVAS_SIZE / 100;
                const rectWidth = parseFloat(rectMatch[3]) * CANVAS_SIZE / 100;
                const rectHeight = parseFloat(rectMatch[4]) * CANVAS_SIZE / 100;
                ctx.rect(rectX, rectY, rectWidth, rectHeight);
              }
              
              ctx.clip();
              
              // テストパターン描画
              ctx.fillStyle = '#f0f0f0';
              ctx.fillRect(x, y, width, height);
              
              // 枠線とデバッグ情報
              ctx.strokeStyle = 'black';
              ctx.lineWidth = 2;
              ctx.stroke();
              
              // パネル番号を表示
              ctx.fillStyle = 'red';
              ctx.font = '32px Arial';
              ctx.fillText(`パネル ${i+1} (画像なし)`, x + 10, y + 40);
            }
            ctx.restore();
            continue;
          }
          
          console.log(`画像の元サイズ: ${img.width}x${img.height}`);
          console.log(`描画サイズと位置: x=${x}, y=${y}, width=${width}, height=${height}`);
          
          // 画像のアスペクト比計算
          const imgAspect = img.width / img.height;
          const panelAspect = width / height;
          
          // 進捗ステータス更新
          processStatus.step = `drawing_image_${i+1}`;
          processStatus.message = `パネル ${i+1} の画像描画中`;
          console.log(`処理ステータス: ${processStatus.step} - ${processStatus.message}`);
          
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
              
              // アスペクト比を保ちながら画像を描画
              let drawWidth, drawHeight, offsetX, offsetY;
              
              if (imgAspect > panelAspect) {
                // 画像が横長の場合は高さに合わせる
                drawHeight = height;
                drawWidth = height * imgAspect;
                offsetX = x + (width - drawWidth) / 2;
                offsetY = y;
              } else {
                // 画像が縦長の場合は幅に合わせる
                drawWidth = width;
                drawHeight = width / imgAspect;
                offsetX = x;
                offsetY = y + (height - drawHeight) / 2;
              }
              
              ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
              
              // 多角形の境界線を描画
              ctx.strokeStyle = 'black';
              ctx.lineWidth = 2;
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
            
            // アスペクト比を保ちながら画像を描画
            let drawWidth, drawHeight, offsetX, offsetY;
            
            if (imgAspect > panelAspect) {
              // 画像が横長の場合は高さに合わせる
              drawHeight = rectHeight;
              drawWidth = rectHeight * imgAspect;
              offsetX = rectX + (rectWidth - drawWidth) / 2;
              offsetY = rectY;
            } else {
              // 画像が縦長の場合は幅に合わせる
              drawWidth = rectWidth;
              drawHeight = rectWidth / imgAspect;
              offsetX = rectX;
              offsetY = rectY + (rectHeight - drawHeight) / 2;
            }
            
            ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
            
            // 長方形の境界線を描画
            ctx.strokeStyle = 'black';
            ctx.lineWidth = 2;
            ctx.stroke();
            
            ctx.restore();
          } else {
            // クリッピングパスがない場合も、アスペクト比を保ちながら描画
            let drawWidth, drawHeight, offsetX, offsetY;
            
            if (imgAspect > panelAspect) {
              // 画像が横長の場合は高さに合わせる
              drawHeight = height;
              drawWidth = height * imgAspect;
              offsetX = x + (width - drawWidth) / 2;
              offsetY = y;
            } else {
              // 画像が縦長の場合は幅に合わせる
              drawWidth = width;
              drawHeight = width / imgAspect;
              offsetX = x;
              offsetY = y + (height - drawHeight) / 2;
            }
            
            ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
          }
          
        } catch (imgError) {
          console.error(`パネル ${i+1} の画像描画中にエラー:`, imgError);
          processStatus.step = `panel_${i+1}_error`;
          processStatus.message = `パネル ${i+1} の画像描画エラー: ${imgError.message}`;
          console.log(`処理ステータス: ${processStatus.step} - ${processStatus.message}`);
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
    
    // 進捗ステータス更新
    processStatus.step = 'drawing_borders';
    processStatus.message = 'パネル枠線描画中';
    console.log(`処理ステータス: ${processStatus.step} - ${processStatus.message}`);
    
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
    
    // 進捗ステータス更新
    processStatus.step = 'saving_png';
    processStatus.message = 'PNG形式で保存中';
    console.log(`処理ステータス: ${processStatus.step} - ${processStatus.message}`);
    
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
    
    // 進捗ステータス更新
    processStatus.step = 'complete';
    processStatus.message = 'PNG画像の生成完了';
    console.log(`処理ステータス: ${processStatus.step} - ${processStatus.message}`);
    
    console.log(`PNG画像を保存しました: ${filePath}`);
    
    // 一時的なプレビューURLも含めて返す（オプション）
    const previewUrl = `/tmp/${fileName}?preview=true`;
    
    // ファイルのダウンロードURLを返す
    const downloadUrl = `/tmp/${fileName}`;
    res.json({ 
      success: true, 
      message: 'SVGの変換に成功しました',
      downloadUrl,
      previewUrl,
      fileName,
      processStatus
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