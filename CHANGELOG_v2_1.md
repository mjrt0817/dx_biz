# CHANGELOG v2.1

## 変更内容

- `firebase-config.js` に Firebase プロジェクト `dx-biz` の設定値を反映。
- READMEを更新し、Firebase側で残っている設定作業を明記。
- v2.0の機能は維持。
  - Googleアカウントログイン
  - Firestore同期
  - 履歴閲覧
  - JSON書き出し／読み込み
  - 問題200問・用語80語
  - 選択肢ランダム表示

## 注意

Firebase設定値を入れたため、Googleログインを動かすにはFirebase Console側で以下が必要です。

1. AuthenticationでGoogleログインを有効化
2. 公開先ドメインをAuthorized domainsへ追加
3. Firestore Databaseを作成
4. `FIRESTORE_RULES.txt` のルールを設定
