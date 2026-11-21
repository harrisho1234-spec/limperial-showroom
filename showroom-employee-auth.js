/* Employee sign-in gate for L'Imperial Showroom.
   Uses the SAME Supabase Auth users and server-computed Showroom permission
   as Sales & Order Management. This does NOT secure publicly hosted assets. */
(function(){
'use strict';
const URL='https://msxvnaintafqdgheutfu.supabase.co';
const KEY='sb_publishable_RpLdBcXql9MpBZCU-GLqPQ_G3VKM8zd';
const PERMISSION='showroom.access';
let client=null,authorized=false,checking=false;
const el=id=>document.getElementById(id);
function overlay(){
 if(el('showroom-employee-gate'))return el('showroom-employee-gate');
 const host=document.createElement('section');host.id='showroom-employee-gate';
 host.setAttribute('aria-label','L Imperial Showroom employee login');
 host.innerHTML='<div class="showroom-auth-panel">'+
 '<div class="showroom-auth-heading"><span>L’IMPERIAL</span><small>EMPLOYEE SHOWROOM ACCESS</small></div>'+
 '<h2>Sign in to Showroom</h2><p>Use your existing L’Imperial Sales & Order Management account.</p>'+
 '<form id="showroom-auth-form">'+
 '<label>Email<input id="showroom-auth-email" type="email" autocomplete="username" required placeholder="name@company.com"></label>'+
 '<label>Password<input id="showroom-auth-password" type="password" autocomplete="current-password" required minlength="8"></label>'+
 '<button type="submit" id="showroom-auth-submit">Sign In</button></form>'+
 '<div id="showroom-auth-message" role="status" aria-live="polite"></div>'+
 '<button type="button" id="showroom-auth-logout" hidden>Sign out and use another account</button>'+
 '<small class="showroom-auth-note">Access is approved in Sales & Order Management → User & Access.</small></div>';
 document.body.appendChild(host);
 el('showroom-auth-form').addEventListener('submit',login);
 el('showroom-auth-logout').addEventListener('click',logout);
 return host;
}
function message(t){const node=el('showroom-auth-message');if(node)node.textContent=t||''}
function setAllowed(flag){
 authorized=!!flag;
 document.documentElement.classList.toggle('showroom-employee-authorized',authorized);
 const gate=overlay();
 gate.hidden=authorized;
 if(!authorized)document.querySelector('#showroom-auth-password')?.setAttribute('value','');
}
async function verify(){
 if(!client)return;
 if(checking)return;
 checking=true;setAllowed(false);message('Verifying employee access…');
 try{
  const {data:userData,error:userError}=await client.auth.getUser();
  if(userError||!userData?.user){message('Sign in using your employee account.');return}
  const {data:hasAccess,error}=await client.rpc('current_user_has_permission',{p_permission:PERMISSION});
  if(error)throw error;
  if(hasAccess!==true){
   message('Your account does not have Showroom access. Ask an Admin to enable Open Showroom in User & Access.');
   el('showroom-auth-logout').hidden=false;
   return;
  }
  el('showroom-auth-logout').hidden=true;
  message('');
  setAllowed(true);
 }catch(error){
  message('Could not verify Showroom permission. Internet and staff login service are required; retry signing in.');
  console.warn('Showroom access verification unavailable',error);
 }finally{checking=false}
}
async function login(event){
 event.preventDefault();if(!client)return;
 const button=el('showroom-auth-submit');button.disabled=true;
 const email=el('showroom-auth-email').value.trim(),password=el('showroom-auth-password').value;
 message('Signing in…');
 try{
  const result=await client.auth.signInWithPassword({email,password});
  if(result.error)throw result.error;
  el('showroom-auth-password').value='';
  await verify();
 }catch(error){message(error.message||'Unable to sign in.')}
 finally{button.disabled=false}
}
async function logout(){
 if(client){try{await client.auth.signOut()}catch(e){console.warn('Showroom sign out failed',e)}}
 setAllowed(false);message('Signed out. Please sign in to continue.');
 el('showroom-auth-logout').hidden=true;
}
function init(){
 overlay();setAllowed(false);
 if(!window.supabase?.createClient){message('Employee login service failed to load. Check your connection and refresh.');return}
 client=window.supabase.createClient(URL,KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey:'limperial-showroom-employee-auth'}});
 client.auth.onAuthStateChange((event)=>{
  if(event==='SIGNED_OUT')setAllowed(false);
  if(event==='TOKEN_REFRESHED'||event==='USER_UPDATED')setTimeout(verify,0);
 });
 verify();
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)verify()});
 window.addEventListener('online',verify);
 window.LImperialShowroomAuth=Object.freeze({verify,logout,get allowed(){return authorized}});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
