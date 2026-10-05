const ORIGIN="https://sebastisnzoth.github.io";
const MODELS=["openrouter/free","nvidia/nemotron-3-ultra-550b-a55b:free","poolside/laguna-s-2.1:free","nvidia/nemotron-3.5-lightning:free","cohere/north-mini-code:free"];
const H={"Access-Control-Allow-Origin":ORIGIN,"Access-Control-Allow-Headers":"Content-Type","Access-Control-Allow-Methods":"GET,POST,OPTIONS","Access-Control-Allow-Credentials":"true","Vary":"Origin","Content-Type":"application/json"};
const out=(x,s=200)=>new Response(JSON.stringify(x),{status:s,headers:H});
const ck=(n,v,a)=>n+"="+encodeURIComponent(v)+"; Path=/; Max-Age="+a+"; HttpOnly; Secure; SameSite=Lax";
const gc=(r,n)=>{const m=r.headers.get("Cookie")?.match(new RegExp("(?:^|; )"+n+"=([^;]*)"));return m?decodeURIComponent(m[1]):null};
async function gh(p,t){return fetch("https://api.github.com"+p,{headers:{"Authorization":"Bearer "+t,"Accept":"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28"}})}
async function handle(req){
 const u=new URL(req.url);
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:H});
 if(u.pathname==="/auth/github"){if(!GITHUB_CLIENT_ID||!GITHUB_CLIENT_SECRET)return out({error:"GitHub OAuth is not configured in Cloudflare."},503);const s=crypto.randomUUID(),d=GITHUB_REDIRECT_URI||u.origin+"/auth/github/callback";return new Response(null,{status:302,headers:{Location:"https://github.com/login/oauth/authorize?"+new URLSearchParams({client_id:GITHUB_CLIENT_ID,redirect_uri:d,state:s,scope:"read:user repo"}),"Set-Cookie":ck("github_oauth_state",s,600)}})}
 if(u.pathname==="/auth/github/callback"){const c=u.searchParams.get("code"),s=u.searchParams.get("state");if(!c||s!==gc(req,"github_oauth_state"))return out({error:"Invalid GitHub OAuth state."},400);const d=GITHUB_REDIRECT_URI||u.origin+"/auth/github/callback",tr=await fetch("https://github.com/login/oauth/access_token",{method:"POST",headers:{"Accept":"application/json","Content-Type":"application/json"},body:JSON.stringify({client_id:GITHUB_CLIENT_ID,client_secret:GITHUB_CLIENT_SECRET,code:c,redirect_uri:d})}),td=await tr.json();if(!tr.ok||!td.access_token)return out({error:"GitHub authorization failed."},502);return new Response(null,{status:302,headers:{Location:ORIGIN+"/opencode/?github=connected","Set-Cookie":ck("github_token",td.access_token,2592000)+"; "+ck("github_oauth_state","",0)}})}
 if(u.pathname==="/auth/github/status"){const t=gc(req,"github_token");if(!t)return out({connected:false});const r=await gh("/user",t);if(!r.ok)return out({connected:false});const d=await r.json();return out({connected:true,login:d.login})}
 if(u.pathname==="/auth/github/logout")return new Response(null,{status:302,headers:{Location:ORIGIN+"/opencode/","Set-Cookie":ck("github_token","",0)}});
 if(u.pathname==="/api/github/repos"){const t=gc(req,"github_token");if(!t)return out({error:"GitHub is not connected."},401);const r=await gh("/user/repos?sort=updated&per_page=100",t),d=await r.json();if(!r.ok)return out({error:"Unable to read GitHub repositories."},r.status);return out(d.map(x=>({full_name:x.full_name,default_branch:x.default_branch,private:x.private,html_url:x.html_url})))}
 if(u.pathname!=="/api/chat")return out({error:"Not found"},404);
 if(req.method!=="POST")return out({error:"Method not allowed"},405);
 if(!OPENROUTER_API_KEY)return out({error:"Backend secret is not configured"},500);
 let p;try{p=await req.json()}catch{return out({error:"Invalid JSON"},400)}
 if(!Array.isArray(p?.messages)||!p.messages.length)return out({error:"messages is required"},400);
 const messages=p.messages.slice(-12).map(m=>({role:String(m.role),content:String(m.content).slice(0,12000)}));
 let last="No model produced a usable response.";
 for(const model of MODELS){
  let r,d;
  try{r=await fetch("https://openrouter.ai/api/v1/chat/completions",{method:"POST",headers:{"Authorization":"Bearer "+OPENROUTER_API_KEY,"Content-Type":"application/json","HTTP-Referer":ORIGIN+"/opencode/","X-Title":"OpenCode Chat"},body:JSON.stringify({model,messages,max_tokens:512,temperature:0.2,stream:false})});d=await r.json()}catch{last="OpenRouter backend did not respond.";continue}
  const content=d?.choices?.[0]?.message?.content;
  if(r.ok&&typeof content==="string"&&content.trim())return out(d);
  last=String(d?.error?.message||("Model "+model+" returned no usable text"));
 }
 const msg=last;const code=/free-models-per-day|rate.?limit|quota|too many requests/i.test(msg)?"RATE_LIMIT":/insufficient|credit|balance/i.test(msg)?"CREDITS":/not a valid model|invalid model/i.test(msg)?"INVALID_MODEL":"PROVIDER";const status=code==="RATE_LIMIT"?429:code==="CREDITS"?402:code==="INVALID_MODEL"?400:502;return out({error:{code,message:"Todos los modelos fallaron: "+msg},models_tried:MODELS},status);
}
addEventListener("fetch",e=>e.respondWith(handle(e.request)));
