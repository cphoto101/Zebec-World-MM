# ZEBEC WORLD MM — Setup Guide

## ပါဝင်သည့်အရာများ
- `public/index.html`: Website UI (Profile, reading history, Free/Premium tier, likes/comments, floating public chat, forgot password, email code login, maintenance UI)
- `server.js`: Resend OTP API နှင့် admin user ban/delete/premium/maintenance endpoints
- `firestore.rules`, `storage.rules`: Firebase Security Rules template
- `set-admin.js`: Firebase Custom Claim ဖြင့် admin သတ်မှတ်ရန်

## အရေးကြီး
HTML ကို double-click လုပ်ပြီး `file://` မှ မဖွင့်ပါနှင့်။ Website ကို HTTPS hosting နဲ့ API ကို same-origin မှာ run/deploy လုပ်ပါ။ Firebase config ကို browser ထဲတွင် မြင်နိုင်ခြင်းက ပုံမှန်ဖြစ်သော်လည်း service account, Resend API key, OTP_PEPPER ကို ဘယ်တော့မှ HTML ထဲ မထည့်ပါနှင့်။

## 1) Frontend
`public/index.html` ကို hosting ရဲ့ public folder ထဲထည့်ပါ။ ဤ project ထဲရှိ `index.html` ကို `public/index.html` အဖြစ် copy လုပ်ထားရပါမည်။

## 2) Firebase
1. Firebase Console > Authentication > Sign-in method မှ Email/Password ကို Enable လုပ်ပါ။
2. Authentication > Settings > Authorized domains ထဲသို့ production domain ထည့်ပါ။
3. Firestore Rules ကို `firestore.rules` ဖြင့် publish လုပ်ပါ။
4. Storage Rules ကို `storage.rules` ဖြင့် publish လုပ်ပါ။
5. Firebase Admin SDK service account ကို server environment မှာ secure အဖြစ် configure လုပ်ပါ။ Local dev အတွက် `GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/service-account.json` သတ်မှတ်ပါ။ Service-account JSON ကို public folder/Git ထဲ မတင်ပါနှင့်။

## 3) Resend Email Code Login
1. Resend account ဖွင့်ပြီး domain ကို verify လုပ်ပါ။
2. Resend API key ထုတ်ပါ။
3. `.env.example` ကို `.env` အဖြစ် copy လုပ်ပြီး `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `OTP_PEPPER` ကို ဖြည့်ပါ။
4. `RESEND_FROM_EMAIL` သည် Resend တွင် verify လုပ်ထားသော sender ဖြစ်ရပါမည်။
5. `npm install` ပြီး `npm start` ဖြင့် run လုပ်ပါ။
6. Frontend နှင့် `/api/*` ကို same origin မှာ serve လုပ်ပါ။ Frontend hosting နဲ့ API domain မတူပါက frontend `fetch('/api/...')` URLs ကို API URL သို့ပြောင်းပြီး CORS configure လုပ်ပါ။
7. Email Code login သည် email ထဲ code ပို့ပြီး Firebase custom token ဖြင့် login ဝင်စေသည်။ Existing user password reset က Firebase `sendPasswordResetEmail` ကိုသုံးသည်။

## 4) Admin
အရင် admin email (`zaroqt@gmail.com`) ကို Firebase Authentication ထဲမှာ account အဖြစ်ရှိစေပါ။ Server environment ကို configure ပြီးမှ:
`npm run set-admin -- zaroqt@gmail.com`
ထို့နောက် sign out/in ပြန်လုပ်ပါ။ Admin UI မှာ email စစ်ရုံနဲ့ secure မဖြစ်ပါ; Firestore/Storage Rules နှင့် server endpoint များက custom claim `admin:true` ကိုစစ်သည်။

## 5) Network error troubleshooting
- `auth/network-request-failed`: Internet/VPN/ad blocker/DNS/HTTPS နှင့် Firebase API reachability စစ်ပါ။
- `auth/unauthorized-domain`: Firebase Authentication Authorized domains မှာ domain ထည့်ပါ။
- `auth/operation-not-allowed`: Email/Password provider enable လုပ်ပါ။
- `Failed to fetch` on Email Code: API server မ run/deploy ရသေးခြင်း သို့မဟုတ် same-origin routing မမှန်ခြင်း ဖြစ်နိုင်သည်။
- Post မမြင်ရခြင်း/like/chat error: Firestore Rules publish လုပ်ပြီး Firebase Console > Firestore Database ထဲမှာ database ရှိမရှိ စစ်ပါ။
- Storage upload error: Firebase Storage initialize လုပ်ထားပြီး Storage Rules publish လုပ်ပါ။

## Limitations / production checks
Firebase project ထဲကို ကျွန်ုပ်က deploy လုပ်ခြင်း သို့မဟုတ် Resend secret/domain verify လုပ်ခြင်း မလုပ်နိုင်ပါ။ Credentials, hosting, email domain verification, Rules publication မရှိဘဲ “ready-to-use” live service ဟု အာမမခံနိုင်ပါ။ Email code flow အတွက် backend မဖြစ်မနေလိုအပ်သည်။ Security Rules ကို production အတွက် Firebase Emulator ဖြင့်စမ်းပြီးမှ publish လုပ်ပါ။

## ထပ်တိုး feature များ (Web Push / 18+ / HTML Viewer)
- Admin upload form မှ `18+` ကိုရွေးလျှင် Catalog နှင့် Detail မှာ `#18+` tag ပေါ်ပါမည်။
- `HTML Viewer URL` ထည့်ထားလျှင် Detail page ထဲ iframe ဖြင့်ပြပါမည်။ HTTPS URL သုံးပြီး target site က iframe embedding ကို ခွင့်ပြုရပါမည်။
- Login ဝင်ပြီး Profile ထဲက `Notification ဖွင့်ရန်` ကိုနှိပ်ပါ။ HTTPS domain, Firebase Cloud Messaging Web Push certificate (VAPID public key) လိုအပ်ပါသည်။ `.env` ထဲ `FCM_VAPID_KEY` ဖြည့်ပါ။ Admin က Push Notification panel မှ ပို့နိုင်သည်။ Browser permission မပေးသော device များသို့ push မရောက်ပါ။
- Server က project root မှ `index.html` ကို serve လုပ်နိုင်အောင်ပြင်ထားသည်။ တစ်ခုတည်းသော Node server ပေါ်တွင် frontend နှင့် `/api` endpoint များ run နိုင်သည်။ Firebase Admin service account ကို host environment မှာ configure လုပ်ရပါမည်။
- `.env` တွင် Resend API key ကို server-side ထည့်ထားသည်။ ဒီ key ကို chat ထဲပို့ထားပြီးဖြစ်သောကြောင့် လုံခြုံရေးအတွက် Resend Dashboard မှ key အသစ် rotate လုပ်ပြီး `.env` ထဲမှာ အစားထိုးရန် အကြံပြုပါသည်။ `RESEND_FROM_EMAIL` ကို Resend မှ verify လုပ်ထားသော sender/domain ဖြင့်ပြောင်းပါ။ `OTP_PEPPER` ကို random secret 32+ chars ဖြင့်ပြောင်းပါ။
