/* L'Imperial Showroom release metadata.
   Update this file with: node scripts/bump-app-version.cjs update|monthly
   Date is the date of the released app, not the date someone opens it. */
(function(){
 'use strict';
 const RELEASE = Object.freeze({
  major: 4,
  monthly: 11,
  update: 3,
  lastUpdated: '2026-11-09'
 });
 const version = 'V'+RELEASE.major+'.'+RELEASE.monthly+'.'+String(RELEASE.update).padStart(2,'0');
 const date = new Date(RELEASE.lastUpdated+'T12:00:00Z');
 const displayDate = new Intl.DateTimeFormat('en-GB',{
  day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'
 }).format(date);
 const metadata = Object.freeze({...RELEASE,version,displayDate});
 window.LImperialAppVersion = metadata;

 function renderAppVersion(){
  const number=document.getElementById('showroom-app-version');
  const updated=document.getElementById('showroom-last-updated');
  const container=document.getElementById('showroom-version-indicator');
  if(number)number.textContent=version;
  if(updated)updated.textContent='Last updated '+displayDate;
  if(container)container.title='L\'Imperial Showroom '+version+' · Last updated '+displayDate;
  document.title='L\'Imperial Showroom '+version;
 }
 if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',renderAppVersion,{once:true});
 }else renderAppVersion();
})();
