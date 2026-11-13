課題トラッカー クラウド版 設定手順

【ファイル】
index.html：Pagesに公開する画面
worker.js：D1との通信API
schema.sql：D1テーブル作成SQL

1. Cloudflare Dashboard → Storage & databases → D1 SQL Database → Create database。
   例：study-tracker-db
   作成したDBのConsoleで schema.sql のSQLを実行。

2. Workers & Pages → Create → Workerを作成。
   Workerのコードを worker.js の内容に置き換えてDeploy。

3. Worker → Settings → Bindings → Add → D1 database。
   Variable nameを DB にし、作成したDBを選択して保存。

4. Worker → Settings → Variables and Secrets → Add。
   TypeをSecret、Nameを API_TOKEN、Valueを自分で決めた長いランダム文字列にする。

5. WorkerのVariablesに ALLOWED_ORIGIN を追加（推奨）。
   値は公開PagesのOriginのみ。例：https://あなたのサイト.pages.dev
   末尾のスラッシュやパスは付けない。
   設定しない場合は * となり、Origin制限は行わない。

6. index.htmlをCloudflare Pagesへ公開。ファイル名は必ず index.html。

7. 公開サイトの「☁ 接続設定」にWorker URL（https://....workers.dev）とAPI_TOKENを入力して保存。

【同期の使い方】
・残したいデータがある端末から最初に「クラウドへ保存」。
・別端末では同じWorker URLとAPI_TOKENを設定し、「クラウドから読込」。
・課題の変更は端末内に自動保存されるが、他端末へ反映するには「クラウドへ保存」が必要。
・「クラウドから読込」は現在の端末データをクラウドの内容で置き換えるため、確認画面を表示する。
・自動マージや同時編集の競合解決は未対応。最後にクラウドへ保存した内容がクラウド上の内容になる。
・API_TOKENは他人に共有しないこと。HTMLソースには埋め込まず、接続設定から入力する。
