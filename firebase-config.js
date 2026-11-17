// ===== 設定ファイル =====
// Firebaseコンソール → プロジェクトの設定 → マイアプリ(Web) に表示される値を貼り付けます。
export const firebaseConfig = {
  apiKey: "AIzaSyBKy_8LQtcx2g_Antt9mRveH-y6DfnKotY",
  authDomain: "omukaenavi.firebaseapp.com",
  projectId: "omukaenavi",
  appId: "1:291104250208:web:12681e9eed77d79be86605"
};

// Cloudinary(写真の保存先)
// cloudName: ダッシュボードに表示される Cloud name
// uploadPreset: Settings → Upload → Upload presets で「Unsigned」にして作った名前
export const cloudinary = {
  cloudName: "udb2h4xz",
  uploadPreset: "omukaenavi"
};
