const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml'
};

const server = http.createServer((req, res) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  
  // リクエストURLのパスを取得
  let filePath = '.' + req.url;
  if (filePath === './') {
    filePath = './index.html';
  }
  
  // ファイルの拡張子を取得
  const extname = path.extname(filePath);
  
  // デフォルトのコンテンツタイプ
  let contentType = MIME_TYPES[extname] || 'application/octet-stream';
  
  // ファイルを読み込んでレスポンスを返す
  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        // ファイルが見つからない場合
        console.error(`ファイルが見つかりません: ${filePath}`);
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end('<h1>404 Not Found</h1><p>リクエストされたファイルが見つかりません。</p>');
      } else {
        // サーバーエラーの場合
        console.error(`サーバーエラー: ${err.code}`);
        res.writeHead(500, { 'Content-Type': 'text/html' });
        res.end('<h1>500 Internal Server Error</h1><p>サーバー内部でエラーが発生しました。</p>');
      }
    } else {
      // 成功した場合
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
});

server.listen(PORT, () => {
  console.log(`サーバーが起動しました: http://localhost:${PORT}`);
  console.log('終了するには Ctrl+C を押してください');
}); 