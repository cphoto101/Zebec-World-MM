import 'dotenv/config';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
const email=(process.argv[2]||'').trim().toLowerCase();
if(!email){console.error('Usage: npm run set-admin -- admin@example.com');process.exit(1);}
initializeApp({credential:applicationDefault(),projectId:process.env.FIREBASE_PROJECT_ID});
const auth=getAuth();
const user=await auth.getUserByEmail(email);
await auth.setCustomUserClaims(user.uid,{admin:true});
console.log(`Admin claim enabled for ${email}. Sign out/in again to refresh token.`);
