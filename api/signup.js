import { validateSignup,registerSignup } from '../lib/signup.mjs';
export function createSignupHandler({env=process.env,register=registerSignup}={}){
 return async function handler(req,res){
  const send=(status,body)=>{res.status(status).setHeader('content-type','application/json; charset=utf-8');res.setHeader('cache-control','no-store');res.end(JSON.stringify(body));};
  if(req.method!=='POST'){res.setHeader('allow','POST');return send(405,{message:'Method not allowed.'});}
  if(env.SIGNUPS_ENABLED!=='true')return send(503,{message:'Signup is being set up. Please check back shortly.'});
  if(!env.WAITLIST_SUPABASE_URL||!env.WAITLIST_SUPABASE_SERVICE_ROLE_KEY||!env.SIGNUP_RATE_SECRET||!['send','disabled'].includes(env.SIGNUP_EMAIL_MODE)||(env.SIGNUP_EMAIL_MODE==='send'&&(!env.RESEND_API_KEY||!env.WAITLIST_FROM_EMAIL)))return send(503,{message:'Signup is temporarily unavailable. Please try again later.'});
  if(req.headers['content-type']?.split(';')[0]!=='application/json')return send(415,{message:'Use JSON for signup.'});
  if(Number(req.headers['content-length']||0)>4096 || JSON.stringify(req.body??{}).length>4096)return send(413,{message:'Signup request is too large.'});
  const parsed=validateSignup(req.body);if(!parsed.ok)return send(parsed.status,{message:parsed.message});
  try {const out=await register({signup:parsed,env,ip:String(req.headers['x-vercel-forwarded-for']||req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0].trim()});return send(out.status,out.body);}catch{return send(503,{message:'We couldn’t save your signup. Please try again.'});}
 };
}
export default createSignupHandler();
