# 漫画コマ枠エディター

シンプルな漫画コマ割りエディターで、テンプレートを選択して画像を配置し、SVG形式で出力できるウェブアプリケーションです。

## 特徴

- 10種類の定義済みコマ割りテンプレート
- ドラッグ＆ドロップなしでシンプルな操作
- 画像の縦横比を保持したSVG出力
- 各パネルごとに画像を個別に配置可能
- レスポンシブデザイン
- サーバーサイドの実装が最小限（Node.js）

## 使い方

1. テンプレート選択画面から好みのコマ割りレイアウトを選ぶ
2. 画像配置画面で各コマに画像を配置
   - コマをクリックして選択
   - 画像を選択してから「適用」ボタンを押す
   - もしくは下部のプレビュー画像を直接クリック
3. すべてのコマに画像を配置後、「SVG保存」ボタンを押す
4. 表示されたプレビュー画面で「このSVGをダウンロード」をクリック

## 実行方法

```bash
# サーバーを起動
node server.js

# ブラウザでアクセス
# http://localhost:3000/
```

## 技術仕様

- フロントエンド: HTML, CSS, JavaScript (バニラJS)
- サーバーサイド: Node.js
- 使用ライブラリ: なし（純粋なDOM APIとSVG APIを使用）

### SVG出力の仕組み

SVG出力機能は以下のステップで実装されています：

1. 選択したテンプレートのパネル情報を取得
2. 各パネルに配置された画像をBase64形式にエンコード
3. SVG要素を作成し、パネルごとにグループ要素を追加
4. クリッピングパスを適用して画像を正しい形状で表示
5. SVGをシリアライズしてBlobオブジェクトに変換
6. Object URLを作成してプレビュー表示
7. ダウンロード時にはFile APIを使用してSVGファイルを保存

## スクリーンショット

1. テンプレート選択画面
   ![テンプレート選択](screenshots/template_selection.png)

2. 画像配置画面
   ![画像配置](screenshots/image_placement.png)

3. SVG出力プレビュー
   ![SVGプレビュー](screenshots/svg_preview.png)

## SVG実装における注意点

- **画像のBase64エンコード**: 外部URLへの参照はセキュリティ制限によりSVG内で表示されない場合があるため、画像はBase64形式に変換してインライン化しています
- **クロスオリジン制約**: 画像の読み込み時に`crossOrigin="anonymous"`属性を設定し、CORS制約を回避しています
- **SVGのネームスペース**: SVG要素作成時には正しいネームスペース（`http://www.w3.org/2000/svg`）を指定する必要があります
- **クリッピングパス**: パネル形状に合わせて画像を表示するために、SVG内にクリッピングパスを定義しています
- **プレビュー表示**: SVGをURLエンコードせず、Blob URLを使用することで高品質なプレビューを実現しています

## アップデート履歴

### 2025年3月20日
- PNG出力機能をSVG保存機能に置き換え
- 画像処理をサーバーサイドからクライアントサイドに移行
- Base64エンコーディングによる画像の直接埋め込み対応
- プレビュー機能の強化
- ロード中の進捗表示を追加

## 注意事項

- ローカル環境で実行する場合、画像のCORSエラーを避けるため必ずサーバー経由でアクセスしてください
- SVG出力には大量のメモリを使用する場合があります（特に大きな画像を使用する場合）
- 一部のブラウザでは外部画像の参照に制限がある場合があります 