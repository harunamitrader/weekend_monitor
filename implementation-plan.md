# Weekend Monitor 実装計画

## プロジェクトの目的

IG 証券の weekend 11 銘柄を監視し、以下を表示するシンプルな公開 Web ページを構築する。

- 現在価格
- 適切な基準価格に対する変化量と変化率
- 最終更新時刻
- 各 IG weekend 銘柄ページへの直接リンク

デザインは Swiss Design をベースにし、白背景、強い整列感、広めの余白、不要な機能を持たないシンプルな構成にする。

## 公開・運用方針

このプロジェクトは、新規の public GitHub リポジトリとして作成し、公開する前提で構築する。

- フロントエンド: GitHub Pages で静的公開
- 定期更新処理: GitHub Actions のスケジュール実行
- 出力データ: GitHub Actions が生成する静的 JSON

この方針を採る理由は以下の通り。

- GitHub Pages は公開用の静的サイト配信に向いている
- ブラウザ側から直接 IG をスクレイピングすると、日本からのアクセス性、CORS、Bot 制限などの問題が出やすい
- GitHub Actions 側で 15 分ごとに取得・整形すれば、フロントは軽量で安定しやすい

## 監視対象

監視対象は、IG の `weekend` 検索結果にある以下の 11 銘柄。

1. Weekend Australia 200
2. Weekend EURUSD
3. Weekend Germany 40
4. Weekend Gold
5. Weekend Hong Kong HS50
6. Weekend Oil - US Crude
7. Weekend Spot Silver
8. Weekend UK 100
9. Weekend US Tech 100
10. Weekend USDJPY
11. Weekend Wall Street

## 機能要件

### 最小 UI

- 11 銘柄をシンプルな一覧またはカードグリッドで表示する
- 銘柄名を表示する
- 現在価格を表示する
- 基準価格を表示する
- 変化量を表示する
- 変化率を表示する
- 最終更新時刻を表示する
- IG の商品ページへのリンクボタンを表示する

### 更新頻度

- GitHub Actions により 15 分ごとにデータを更新する
- 取得に失敗した場合は、前回成功時のデータを保持する

### 基準価格ロジック

- 平日の通常セッション中は、前営業日の終値を基準にする
- 土曜日と日曜日の weekend セッション中は、金曜日の終値を基準にする

実装上の補足:

- まずは各商品ページ上の現在価格と変化率から基準価格を逆算できるかを優先して試す
- 銘柄によって不安定な場合は、終値スナップショットを保存して基準値を管理する

## 技術構成

## 1. リポジトリ構成

初期構成案は以下。

```text
weekend-monitor/
  docs/
    index.html
    styles.css
    app.js
    data/
      latest.json
  scripts/
    fetch-weekend-markets.mjs
    parse-market-page.mjs
    build-data.mjs
  data/
    markets.json
    snapshots/
  .github/
    workflows/
      update-data.yml
  README.md
  implementation-plan.md
```

### 各ディレクトリの役割

- `docs/`: GitHub Pages で公開する静的ファイル
- `docs/data/latest.json`: フロントエンドが読み込む最新データ
- `scripts/`: スクレイピングとデータ生成のスクリプト
- `data/markets.json`: 11 銘柄の定義と IG URL を持つ管理ファイル
- `data/snapshots/`: 必要に応じて前日終値や金曜終値を保存する場所

## 2. データ取得

### 取得元 A: IG 検索結果ページ

使用先:

- [IG search results for weekend](https://www.ig.com/en/ig-search?query=weekend)

用途:

- 監視対象 11 銘柄の URL 一覧を取得・検証する
- 銘柄名と商品 URL の対応を安定化する

### 取得元 B: 各 IG 商品ページ

例:

- [Weekend US Tech 100](https://www.ig.com/en/indices/markets-indices/weekend-us-tech-100-e1)

用途:

- 現在価格に関する表示値を抽出する
- 変化量または変化率を抽出する
- ページメタ情報や canonical URL を取得する

### スクレイピング方針

- Node.js のサーバーサイド fetch を利用し、ブラウザ相当の `User-Agent` を付与する
- 文字列の見た目一致よりも、埋め込みデータや安定した `data-field` を優先して読む
- 公開前にパース結果の妥当性を検証する
- 一部銘柄の取得に失敗した場合は、前回成功時の値を残しつつ stale 状態を付ける

## 3. 正規化後の出力形式

`latest.json` はおおむね以下の形を想定する。

```json
{
  "updatedAt": "2026-03-16T12:00:00.000Z",
  "source": "ig.com",
  "markets": [
    {
      "id": "weekend-us-tech-100",
      "name": "Weekend US Tech 100",
      "url": "https://www.ig.com/en/indices/markets-indices/weekend-us-tech-100-e1",
      "currentPrice": 0,
      "baselinePrice": 0,
      "change": 0,
      "changePercent": 0,
      "baselineMode": "previous_close",
      "updatedAt": "2026-03-16T12:00:00.000Z",
      "stale": false
    }
  ]
}
```

## 4. フロントエンドのデザイン方針

### ビジュアル原則

- 白背景
- 黒とチャコール系を中心にした文字色
- 厳密な整列と一貫した余白
- 上昇と下落だけ控えめに色分けする
- 文字サイズの強弱で情報階層を作る
- 装飾的な UI は置かない

### レイアウト方針

- 上部に強いタイトルエリアを置く
- その下に 11 銘柄の一覧を並べる
- デスクトップでは複数カラム
- モバイルでは 1 カラム

### 初期 UI コンポーネント

- ページヘッダー
- 更新時刻表示
- 銘柄カードまたは一覧行
- IG リンクボタン

初期版では、検索、フィルタ、チャート、ログイン、ウォッチリスト編集、通知機能などは付けない。

## 5. GitHub Actions 設計

### 定期実行ワークフロー

- 15 分ごとに実行する
- 依存パッケージをインストールする
- スクレイピングスクリプトを実行する
- `latest.json` を更新する
- データに変更があればコミットして push する

### 失敗時の扱い

- 一部銘柄のみ失敗した場合は、その銘柄だけ前回値を維持する
- 全体が失敗した場合は、正常な JSON を空データで上書きしない
- ワークフローログに、どこで壊れたか分かる程度の情報を残す

### 運用メモ

- GitHub Actions のスケジュール実行は 15 分ちょうどを保証しない
- public リポジトリでは、長期間活動がないと workflow が無効化される可能性がある
- cron は UTC 基準なので、表示時刻はフロント側でローカル時刻に整形する

## 6. 実装フェーズ

### Phase 1: プロジェクト雛形作成

- リポジトリ向けの基本構成を作る
- README を追加する
- 監視対象の定義ファイルを作る
- 静的フロントの土台を作る

### Phase 2: スクレイパー試作

- 監視対象一覧取得処理を作る
- 1 銘柄分のパーサを実装する
- Weekend US Tech 100 でパーサを検証する
- 11 銘柄すべてに対応させる

### Phase 3: 基準価格ロジック

- 平日用と週末用の基準値ルールをコード化する
- 必要なら終値スナップショット保存を入れる
- 土曜日と日曜日の表示を検証する

### Phase 4: 公開パイプライン

- GitHub Actions の workflow を追加する
- `docs/data/latest.json` を生成する
- GitHub Pages 上での公開動作を確認する

### Phase 5: 見た目の仕上げ

- Swiss Design ベースのレイアウトを整える
- タイポグラフィ、余白、レスポンシブ挙動を調整する
- シンプルさを維持する

## 7. 想定リスクと対策

### リスク: IG の HTML 構造変更

対策:

- 安定した埋め込みデータや属性を優先してパースする
- パース処理を専用モジュールに分ける
- 失敗時は前回成功データを残す

### リスク: 基準価格の解釈が銘柄ごとに曖昧

対策:

- 基準価格ロジックを明示的でテストしやすい形にする
- 必要に応じて終値スナップショットを保存する

### リスク: GitHub Actions の実行遅延

対策:

- 画面上に正確な最終更新時刻を表示する
- 数分の遅延を許容する UI 設計にする

### リスク: public リポジトリでのスクレイピング公開

対策:

- リクエスト数を最小限に抑える
- 15 分ごとに必要な 11 ページだけ取得する
- 公開前に IG の利用条件や robots の扱いを確認する

## 8. 初回実装のスコープ

最初の完成物には以下を含める。

- リポジトリの基本構成
- 静的なシングルページのフロントエンド
- 11 銘柄を更新するスクレイパー
- 生成された `latest.json`
- 15 分更新の GitHub Actions workflow
- GitHub Pages で公開できる構成

## 9. 次の実装ステップ

この計画書の次に着手する実装は以下。

1. `project/weekend-monitor` 配下にプロジェクト雛形を作る
2. 11 銘柄の定義を持つ `markets.json` を作る
3. Weekend US Tech 100 を対象に最初のスクレイパーを作って検証する
