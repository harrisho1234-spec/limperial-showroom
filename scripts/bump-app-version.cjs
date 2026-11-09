#!/usr/bin/env node
/* Release bump for L'Imperial Showroom.
 * node scripts/bump-app-version.cjs update [--date YYYY-MM-DD] [--dry-run]
 * node scripts/bump-app-version.cjs monthly [--date YYYY-MM-DD] [--dry-run]
 * V4 stays fixed; the middle number identifies the major/monthly release,
 * and the last update number is always shown with two digits (01, 02, 03...).
 */
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const [kind,...options]=process.argv.slice(2);
if(!['update','monthly'].includes(kind)){
 console.error('Usage: node scripts/bump-app-version.cjs update|monthly [--date YYYY-MM-DD] [--dry-run]');
 process.exit(1);
}
const dateArg=options.indexOf('--date');
if(dateArg>=0&&(dateArg+1>=options.length)){
 console.error('--date requires YYYY-MM-DD');process.exit(1);
}
function localDate(){
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Phnom_Penh',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const get=type=>parts.find(p=>p.type===type).value;
 return get('year')+'-'+get('month')+'-'+get('day');
}
const date=dateArg>=0?options[dateArg+1]:localDate();
if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date))||new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date){
 console.error('Invalid date: '+date);process.exit(1);
}
const dryRun=options.includes('--dry-run');
const getFile=name=>fs.readFileSync(path.join(root,name),'utf8');
const data=getFile('app-version.js');
function field(key,pattern){
 const found=data.match(pattern);
 if(!found)throw Error('Cannot read '+key+' from app-version.js');
 return found[1];
}
const major=Number(field('major',/\bmajor:\s*(\d+)/));
const monthly=Number(field('monthly',/\bmonthly:\s*(\d+)/));
const update=Number(field('update',/\bupdate:\s*(\d+)/));
const lastUpdated=field('lastUpdated',/\blastUpdated:\s*'(\d{4}-\d{2}-\d{2})'/);
if(major!==4)throw Error('The major version must stay V4');
if(date<lastUpdated)throw Error('Release date cannot precede the current version date');
const nextMonthly=kind==='monthly'?monthly+1:monthly;
const nextUpdate=kind==='monthly'?1:update+1;
const oldTag='V4.'+monthly+'.'+String(update).padStart(2,'0');
const newTag='V4.'+nextMonthly+'.'+String(nextUpdate).padStart(2,'0');
function replaceOnce(input,from,to,file){
 const count=input.split(from).length-1;
 if(count!==1)throw Error(file+': expected one '+from+', found '+count);
 return input.replace(from,to);
}
let nextData=replaceOnce(data,'monthly: '+monthly,'monthly: '+nextMonthly,'app-version.js');
nextData=replaceOnce(nextData,'update: '+update,'update: '+nextUpdate,'app-version.js');
nextData=replaceOnce(nextData,"lastUpdated: '"+lastUpdated+"'","lastUpdated: '"+date+"'",'app-version.js');
let index=getFile('index.html');
index=replaceOnce(index,'app-version.js?v='+oldTag,'app-version.js?v='+newTag,'index.html');
let serviceWorker=getFile('sw.js');
serviceWorker=replaceOnce(serviceWorker,'./app-version.js?v='+oldTag,'./app-version.js?v='+newTag,'sw.js');
serviceWorker=serviceWorker.replace(
 /const CACHE_NAME = '[^']+';/,
 "const CACHE_NAME = 'limperial-v4-app-4-"+nextMonthly+'-'+String(nextUpdate).padStart(2,'0')+"';"
);
if(!serviceWorker.includes("const CACHE_NAME = 'limperial-v4-app-4-"+nextMonthly+'-'+String(nextUpdate).padStart(2,'0')+"';")){
 throw Error('Missing cache version in sw.js');
}
if(!dryRun){
 fs.writeFileSync(path.join(root,'app-version.js'),nextData);
 fs.writeFileSync(path.join(root,'index.html'),index);
 fs.writeFileSync(path.join(root,'sw.js'),serviceWorker);
}
process.stdout.write(oldTag+' → '+newTag+' | Last updated '+date+(dryRun?' | dry run':' | files updated')+'\n');
