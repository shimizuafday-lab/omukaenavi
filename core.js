// ===== 共通部品: Firebase初期化 / ログイン状態 / 写真アップロード =====
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import * as A from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import * as F from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig, cloudinary } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
export const auth = A.getAuth(app);
export const db = F.getFirestore(app);
export { A, F };

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function toast(m) {
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = m; document.body.append(t);
  setTimeout(() => t.remove(), 2200);
}

const MSG = {
  'auth/invalid-email': 'メールアドレスの形式が正しくありません',
  'auth/invalid-credential': 'メールアドレスかパスワードが違います',
  'auth/wrong-password': 'メールアドレスかパスワードが違います',
  'auth/user-not-found': 'メールアドレスかパスワードが違います',
  'auth/email-already-in-use': 'このメールアドレスは登録済みです',
  'auth/weak-password': 'パスワードは6文字以上にしてください',
  'auth/too-many-requests': '試行が多すぎます。しばらくしてからお試しください',
  'auth/network-request-failed': '通信できません。電波の良い場所でお試しください',
  'permission-denied': '権限がありません(承認待ちか、操作が許可されていません)'
};
export const errMsg = e => MSG[e?.code] || MSG[(e?.code || '').replace('firestore/', '')] || e?.message || 'エラーが発生しました';

// ---- 写真: 縮小してCloudinaryへ(URLだけをFirestoreに保存する) ----
function shrinkBlob(file, max = 1280, q = .78) {
  return new Promise((res, rej) => {
    const im = new Image(), u = URL.createObjectURL(file);
    im.onload = () => {
      const k = Math.min(1, max / Math.max(im.width, im.height)), c = document.createElement('canvas');
      c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
      URL.revokeObjectURL(u);
      c.toBlob(b => b ? res(b) : rej(new Error('画像を変換できませんでした')), 'image/jpeg', q);
    };
    im.onerror = () => rej(new Error('画像を読み込めませんでした'));
    im.src = u;
  });
}
// opt.raw: 編集画面で縮小・加工済みの画像は、そのままアップロードする(再圧縮しない)
export async function uploadImage(file, opt = {}) {
  const blob = opt.raw ? file : await shrinkBlob(file);
  const fd = new FormData();
  fd.append('file', blob);
  fd.append('upload_preset', cloudinary.uploadPreset);
  fd.append('folder', 'omukae');
  const r = await fetch(`https://api.cloudinary.com/v1_1/${cloudinary.cloudName}/image/upload`, { method: 'POST', body: fd });
  if (!r.ok) throw new Error('写真のアップロードに失敗しました(Cloudinaryの設定を確認してください)');
  return (await r.json()).secure_url;
}

// ---- 公式PDF: 元の複数ページPDFをrawファイルとして保存 ----
export async function uploadPdf(file) {
  if (!file || file.type !== 'application/pdf') throw new Error('PDFファイルを選択してください');
  if (file.size > 25 * 1024 * 1024) throw new Error('PDFは25MB以下にしてください');
  const fd = new FormData();
  fd.append('file', file);
  fd.append('upload_preset', cloudinary.uploadPreset);
  fd.append('folder', 'omukae/school-pdfs');
  const r = await fetch(`https://api.cloudinary.com/v1_1/${cloudinary.cloudName}/raw/upload`, { method: 'POST', body: fd });
  if (!r.ok) throw new Error('PDFのアップロードに失敗しました。CloudinaryのUnsigned presetでPDF/rawアップロードが許可されているか確認してください。');
  const data = await r.json();
  if (!data.secure_url) throw new Error('PDFの保存先URLを取得できませんでした');
  return data.secure_url;
}

// ---- ログイン状態 ----
// cb(user, profile, error): profile は users/{uid} の中身(承認状態・権限)
export const hold = { on: false };   // 新規登録の最中は一時停止
let cb = () => {};
async function load() {
  if (hold.on) return;
  const u = auth.currentUser;
  if (!u) return cb(null, null);
  try {
    const s = await F.getDoc(F.doc(db, 'users', u.uid));
    cb(u, s.exists() ? { ...s.data(), id: u.uid } : null);
  } catch (e) { cb(u, null, e); }
}
export function watchSession(fn) { cb = fn; A.onAuthStateChanged(auth, load); }
export const reloadSession = load;
