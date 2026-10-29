import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { Resend } from 'resend';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

dotenv.config();
const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '32kb' }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 120, standardHeaders: true, legacyHeaders: false }));
initializeApp({ credential: applicationDefault(), projectId: process.env.FIREBASE_PROJECT_ID });
const auth = getAuth(), db = getFirestore();
const resend = new Resend(process.env.RESEND_API_KEY);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const cleanEmail = e => String(e || '').trim().toLowerCase();

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));
app.get('/', (_req,res)=>res.sendFile(path.join(__dirname,'index.html')));
app.get('/api/health', (_req,res)=>res.json({ok:true, service:'zebec-world-api'}));

app.post('/api/auth/send-code', rateLimit({windowMs: 10*60*1000, limit: 4}), async (req,res) => {
  const email = cleanEmail(req.body.email);
  if (!emailPattern.test(email)) return res.status(400).json({error:'မှန်ကန်သော Email ကိုထည့်ပါ။'});
  try {
    const userRef = db.collection('users').doc(sha(email));
    const now = Date.now();
    const rateRef = db.collection('_authRateLimits').doc(sha(email));
    const rateSnap = await rateRef.get();
    if (rateSnap.exists && rateSnap.data().nextAllowedAt?.toMillis() > now)
      return res.status(429).json({error:'Code အသစ်မတောင်းမီ ခဏစောင့်ပါ။'});
    const code = String(crypto.randomInt(0,1000000)).padStart(6,'0');
    const secret = process.env.OTP_PEPPER;
    if (!secret || secret.length < 24) return res.status(500).json({error:'Server setup မပြီးသေးပါ။ OTP_PEPPER ကို configure လုပ်ပါ။'});
    await db.collection('_emailLoginCodes').doc(sha(email)).set({
      codeHash: sha(`${email}:${code}:${secret}`),
      expiresAt: Timestamp.fromMillis(now + 10*60*1000),
      attempts: 0,
      createdAt: FieldValue.serverTimestamp()
    });
    await rateRef.set({nextAllowedAt:Timestamp.fromMillis(now+60*1000)});
    const sent = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL,
      to: [email],
      subject: 'ZEBEC WORLD MM — Login Code',
      html: `<div style="font-family:Arial,sans-serif;background:#10101a;color:#fff;padding:28px;border-radius:16px"><h2>ZEBEC WORLD MM</h2><p>Login verification code:</p><div style="font-size:32px;letter-spacing:10px;font-weight:bold;color:#c084fc">${code}</div><p>This code expires in 10 minutes. If you did not request it, ignore this email.</p></div>`
    });
    if (sent.error) throw new Error(sent.error.message || 'Resend email failed');
    return res.json({ok:true});
  } catch(e) {
    console.error('send-code failed',e);
    return res.status(500).json({error:'Email ပို့မရပါ။ Resend domain/API key နှင့် server config ကိုစစ်ပါ။'});
  }
});

app.post('/api/auth/verify-code', rateLimit({windowMs:10*60*1000,limit:10}), async (req,res) => {
  const email=cleanEmail(req.body.email), code=String(req.body.code||'').trim();
  if (!emailPattern.test(email) || !/^\d{6}$/.test(code)) return res.status(400).json({error:'Email နှင့် ၆ လုံး code ကိုစစ်ပါ။'});
  const ref=db.collection('_emailLoginCodes').doc(sha(email));
  try {
    const result=await db.runTransaction(async tx=>{
      const snap=await tx.get(ref);
      if(!snap.exists) throw new Error('Code မရှိပါ။ အသစ်ပြန်တောင်းပါ။');
      const d=snap.data();
      if(d.expiresAt.toMillis() < Date.now()) { tx.delete(ref); throw new Error('Code သက်တမ်းကုန်ပါပြီ။'); }
      if(d.attempts >= 5) { tx.delete(ref); throw new Error('Code မှားကြိုးစားမှုများလွန်းပါသည်။ အသစ်ပြန်တောင်းပါ။'); }
      if(d.codeHash !== sha(`${email}:${code}:${process.env.OTP_PEPPER}`)) {
        tx.update(ref,{attempts:FieldValue.increment(1)});
        throw new Error('Code မှားနေပါတယ်။');
      }
      tx.delete(ref);
      return true;
    });
    if(!result) return res.status(400).json({error:'Code မမှန်ပါ။'});
    let user;
    try { user=await auth.getUserByEmail(email); }
    catch(e) {
      if(e.code !== 'auth/user-not-found') throw e;
      user=await auth.createUser({email,emailVerified:true,disabled:false});
    }
    const userDoc=await db.collection('users').doc(user.uid).get();
    if(userDoc.exists && userDoc.data().banned) return res.status(403).json({error:'ဤ account ကို ban ထားပါသည်။ Admin ကိုဆက်သွယ်ပါ။'});
    const token=await auth.createCustomToken(user.uid,{emailLogin:true});
    return res.json({ok:true,customToken:token});
  } catch(e) {
    return res.status(400).json({error:e.message || 'Code verify မအောင်မြင်ပါ။'});
  }
});

async function requireAdmin(req,res,next) {
  try {
    const h=req.headers.authorization||'';
    if(!h.startsWith('Bearer ')) return res.status(401).json({error:'Login လုပ်ပါ။'});
    const decoded=await auth.verifyIdToken(h.slice(7));
    if(!decoded.admin) return res.status(403).json({error:'Admin permission လိုအပ်ပါသည်။'});
    req.actor=decoded; next();
  } catch { return res.status(401).json({error:'Session မမှန်ပါ။ ပြန်ဝင်ပါ။'}); }
}
app.get('/api/push/config',(_req,res)=>res.json({vapidKey:process.env.FCM_VAPID_KEY||''}));
app.post('/api/push/register',async(req,res)=>{
  try {
    const h=req.headers.authorization||'';
    if(!h.startsWith('Bearer ')) return res.status(401).json({error:'Login လုပ်ပါ။'});
    const decoded=await auth.verifyIdToken(h.slice(7));
    const token=String(req.body.token||'');
    if(token.length<20 || token.length>4096) return res.status(400).json({error:'Push token မမှန်ပါ။'});
    await db.collection('pushTokens').doc(sha(token)).set({uid:decoded.uid,token,updatedAt:FieldValue.serverTimestamp()},{merge:true});
    res.json({ok:true});
  } catch { res.status(401).json({error:'Push registration မအောင်မြင်ပါ။'}); }
});
app.post('/api/admin/notifications',requireAdmin,async(req,res)=>{
  const title=String(req.body.title||'ZEBEC WORLD MM').slice(0,100), body=String(req.body.body||'').slice(0,500);
  if(!title||!body) return res.status(400).json({error:'Title နှင့် message ဖြည့်ပါ။'});
  try {
    const snap=await db.collection('pushTokens').limit(500).get();
    const tokens=snap.docs.map(d=>d.data().token).filter(Boolean);
    if(!tokens.length) return res.json({ok:true,sent:0,failed:0,message:'မှတ်ပုံတင်ထားသော device မရှိသေးပါ။'});
    const result=await getMessaging().sendEachForMulticast({tokens,notification:{title,body},webpush:{notification:{icon:'/icon-192.png',badge:'/icon-192.png'},fcmOptions:{link:'/'}}});
    const batch=db.batch(); result.responses.forEach((r,i)=>{if(!r.success && ['messaging/registration-token-not-registered','messaging/invalid-registration-token'].includes(r.error?.code)) batch.delete(snap.docs[i].ref);}); await batch.commit();
    res.json({ok:true,sent:result.successCount,failed:result.failureCount});
  } catch(e) { console.error('push send failed',e); res.status(500).json({error:'FCM မပို့နိုင်ပါ။ Firebase Admin credential ကိုစစ်ပါ။'}); }
});

app.get('/api/admin/users',requireAdmin,async(_req,res)=>{
  try {
    const snap=await db.collection('users').orderBy('createdAt','desc').limit(200).get();
    res.json({users:snap.docs.map(d=>({uid:d.id,email:d.data().email||'',displayName:d.data().displayName||'',premium:!!d.data().premium,banned:!!d.data().banned,photoURL:d.data().photoURL||''}))});
  } catch(e) {res.status(500).json({error:'User list ဖတ်မရပါ။'});}
});
app.post('/api/admin/users/:uid/action',requireAdmin,async(req,res)=>{
  const {action,value}=req.body, uid=String(req.params.uid||'');
  if(!uid || uid===req.actor.uid) return res.status(400).json({error:'ဒီ account ကို action မလုပ်နိုင်ပါ။'});
  try {
    const userRef=db.collection('users').doc(uid);
    if(action==='ban') {
      await userRef.set({banned:!!value,updatedAt:FieldValue.serverTimestamp()},{merge:true});
      await auth.updateUser(uid,{disabled:!!value});
    } else if(action==='premium') {
      await userRef.set({premium:!!value,updatedAt:FieldValue.serverTimestamp()},{merge:true});
    } else if(action==='delete') {
      await auth.deleteUser(uid);
      await userRef.delete();
    } else return res.status(400).json({error:'Action မမှန်ပါ။'});
    res.json({ok:true});
  } catch(e) {res.status(500).json({error:e.message||'User action မအောင်မြင်ပါ။'});}
});
app.post('/api/admin/maintenance',requireAdmin,async(req,res)=>{
  try {
    await db.collection('siteSettings').doc('maintenance').set({
      enabled:!!req.body.enabled,
      message:String(req.body.message||'Website maintenance လုပ်နေပါသည်။').slice(0,500),
      updatedAt:FieldValue.serverTimestamp(),updatedBy:req.actor.uid
    },{merge:true});
    res.json({ok:true});
  } catch {res.status(500).json({error:'Maintenance setting မသိမ်းနိုင်ပါ။'});}
});

const port=Number(process.env.PORT||8080);
app.listen(port,()=>console.log(`ZEBEC WORLD API listening on ${port}`));
