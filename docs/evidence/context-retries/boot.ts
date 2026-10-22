import { createRequire } from 'node:module'
import { createHmac,randomBytes } from 'node:crypto'
import { execFileSync,spawn } from 'node:child_process'
import { mkdirSync,writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve,join } from 'node:path'
const root=process.cwd(),repo=resolve(root,process.argv[2]==='before'?'nuphos-evidence-before':'nuphos-chat-target'),require=createRequire(join(repo,'apps/backend/package.json'))
const {MongoClient,ObjectId}=require('mongodb')
const dbName='nuphos_context_evidence_'+process.argv[2],userId='100000000000000000000001',teamId='100000000000000000000002',sessionId=process.argv[2]==='before'?'57ff0000-0000-4000-8000-000000000711':'58ff0000-0000-4000-8000-000000000711'
const secret=randomBytes(32).toString('hex'),now=new Date(),iat=Math.floor(Date.now()/1000)
const unsigned=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({aud:'nuphos',sub:userId,iat,exp:iat+14400,from:'nuphos',scope:'all'})).toString('base64url')
const token=unsigned+'.'+createHmac('sha256',secret).update(unsigned).digest('base64url')
const user={id:userId,email:'demo@example.test',name:'Demo',username:'demo',avatarURL:'',language:'en-US',createdAt:now.toISOString()}
const client=new MongoClient('mongodb://127.0.0.1:27117/?directConnection=true');await client.connect();const db=client.db(dbName)
await db.collection('users').updateOne({_id:new ObjectId(userId)},{$set:{...user,_id:new ObjectId(userId),createdAt:now,updatedAt:now,aiConsent:{accepted:true,version:'1',updatedAt:now}}},{upsert:true})
await db.collection('teams').updateOne({_id:new ObjectId(teamId)},{$set:{name:'Demo workspace',avatarUrl:'',ownerID:new ObjectId(userId),members:[{userId:new ObjectId(userId),role:'ADMINISTRATOR',joinedAt:now}],contactEmails:[],createdAt:now,updatedAt:now}},{upsert:true})
const {readFileSync}=await import('node:fs');const src=readFileSync(join(repo,'apps/backend/src/lib/agent/db/shared.ts'),'utf8');const names=[...src.matchAll(/(?:CONVERSATION|MESSAGE)_COLLECTION_NAME = '([^']+)'/g)].map(x=>x[1]);console.log('Local demo database prepared',names)
const conv='agent_conversations',msg='agent_messages'
await db.collection(conv).updateOne({sessionId},{$set:{sessionId,userId,teamId,title:'Preview review',firstMessage:'Check the example preview and tell me what remains.',messageCount:2,createdAt:now,lastActiveAt:now,agentRuntime:'claude-code',runtimeId:'development-claude-code',runtimeLabel:'Demo runtime'}},{upsert:true})
await db.collection(msg).deleteMany({sessionId});
const sourceId=sessionId.slice(0,-3)+'810';
await db.collection(conv).updateOne({sessionId:sourceId},{$set:{sessionId:sourceId,userId,teamId,title:'Example requirements',firstMessage:'Make the example button blue.',messageCount:2,createdAt:now,lastActiveAt:now}},{upsert:true});
await db.collection(msg).deleteMany({sessionId:sourceId});
await db.collection(msg).insertMany([
 {sessionId:sourceId,userId,messageId:'source-user',index:0,role:'user',parts:[{type:'text',text:'Make the example button blue.'}],createdAt:now},
 {sessionId:sourceId,userId,messageId:'source-answer',index:1,role:'assistant',parts:[
  {type:'text',text:'I will use blue.'},
  {type:'data-steering',data:{id:'correction',text:'Use green instead of blue.',metadata:{version:1,sender:{type:'user',id:userId,displayName:'Demo'},source:'nuphos',sentAt:now.toISOString()}}},
  {type:'text',text:'I will check the requested colour before finishing.'}
 ],createdAt:new Date(+now+1)}
]);
await db.collection(msg).insertMany([{sessionId,userId,messageId:'demo-user',index:0,role:'user',parts:[{type:'text',text:'We are checking the example requirements.'}],createdAt:now},{sessionId,userId,messageId:'demo-answer',index:1,role:'assistant',parts:[{type:'text',text:'Ready to read the example conversation.'}],createdAt:new Date(+now+1)}]);
await db.collection(conv).updateOne({sessionId},{$set:{title:'Read example requirements',messageCount:2}});
await client.close()
const cfg=join(root,'artifacts/nuphos-context-proof/profile-'+process.argv[2]);mkdirSync(cfg,{recursive:true});writeFileSync(join(cfg,'desktop.yaml'),JSON.stringify({token,user:userId,userInfo:user}),{mode:0o600})
writeFileSync(join(root,'artifacts/nuphos-context-proof/ids-'+process.argv[2]+'.json'),JSON.stringify({teamId,userId,sessionId,cliConfig:join(cfg,'cli.yaml')},null,2))
const d=JSON.parse(execFileSync('docker',['inspect','nuphos-dev-rustfs-1'],{encoding:'utf8'}))[0];const se=Object.fromEntries(d.Config.Env.map((s:string)=>{const i=s.indexOf('=');return[s.slice(0,i),s.slice(i+1)]}))
const runtimeKey=execFileSync('docker',['exec','nuphos-dev-runtime-1','cat','/home/node/.nuphos-runtime/auth-key'],{encoding:'utf8'}).trim();
const env={CLAUDE_CODE_RUNTIME_DEV_URL:'ws://127.0.0.1:18180/acp',CLAUDE_CODE_RUNTIME_DEV_AUTH_KEY:runtimeKey,NUPHOS_CLAUDE_CONTROL_KEY:createHmac('sha256',runtimeKey).update('nuphos-runtime-control-v1').digest('hex'),PATH:process.env.PATH,HOME:process.env.HOME,NODE_ENV:'development',PORT:process.argv[2]==='before'?'3741':'3742',MONGODB_URI:'mongodb://127.0.0.1:27117/?directConnection=true',MONGODB_DB:dbName,NUPHOS_JWT_SECRET:secret,NUPHOS_LOCAL_STACK:'true',NUPHOS_DEV_EMAIL_OTP_LOG:'true',ATLAS_REDIS_ENABLED:'false',CLAUDE_CODE_RUNTIME_PROVISIONER_ENABLED:'false',NUPHOS_FILE_TRANSFER_S3_BUCKET:'nuphos-file-transfers',NUPHOS_FILE_TRANSFER_S3_ENDPOINT:'http://127.0.0.1:9000',NUPHOS_FILE_TRANSFER_S3_REGION:'us-east-1',NUPHOS_FILE_TRANSFER_S3_ACCESS_KEY_ID:se.RUSTFS_ACCESS_KEY,NUPHOS_FILE_TRANSFER_S3_SECRET_ACCESS_KEY:se.RUSTFS_SECRET_KEY}
const {openSync}=await import('node:fs');const log=openSync(join(root,'artifacts/nuphos-context-proof/backend-'+process.argv[2]+'.log'),'a');const child=spawn('bun',['run','src/index.ts'],{cwd:join(repo,'apps/backend'),env,stdio:['ignore',log,log]});process.on('SIGINT',()=>child.kill('SIGINT'));await new Promise(r=>child.on('exit',r))
