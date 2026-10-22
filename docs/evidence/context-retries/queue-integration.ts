// Real MongoDB + production queue handoff, without mocked handlers.
// An accepted run is cancelled before prompting: admission proof, not completion.
import { randomUUID, randomBytes } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { resolve, join } from 'node:path'
const side=process.argv[2]
if(side!=='before'&&side!=='after')throw Error('Pass before or after')
const root=resolve(import.meta.dir,'../..')
const repo=join(root,side==='before'?'nuphos-evidence-before':'nuphos-chat-target')
Object.assign(process.env,{NODE_ENV:'development',MONGODB_URI:'mongodb://127.0.0.1:27117/?directConnection=true',MONGODB_DB:`nuphos_queue_proof_${side}`,ATLAS_REDIS_ENABLED:'false',NUPHOS_LOCAL_STACK:'true',NUPHOS_JWT_SECRET:randomBytes(32).toString('hex'),CLAUDE_CODE_RUNTIME_DEV_URL:'ws://127.0.0.1:18180/acp',CLAUDE_CODE_RUNTIME_DEV_AUTH_KEY:execFileSync('docker',['exec','nuphos-dev-runtime-1','cat','/home/node/.nuphos-runtime/auth-key'],{encoding:'utf8'}).trim()})
const {connectDb,closeDb}=await import(join(repo,'apps/backend/src/lib/db.ts'))
const {launchQueuedChatTurn}=await import(join(repo,'apps/backend/src/routes/agent/session-queue-turn.ts'))
const {agentRuns}=await import(join(repo,'apps/backend/src/routes/agent/run-registry.ts'))
const db=await connectDb()
const userId='100000000000000000000001',teamId='100000000000000000000002',sessionId=randomUUID(),inputId=randomUUID(),streamId=randomUUID(),now=new Date()
const message={id:inputId,role:'user',parts:[{type:'text',text:'Check the neutral example.'}]}
const conversation={sessionId,userId,teamId,title:'Queued example',firstMessage:'Check the neutral example.',messageCount:1,createdAt:now,lastActiveAt:now,agentRuntime:'claude-code',runtimeId:'development-claude-code',runtimeLabel:'Demo runtime'}
await db.collection('agent_conversations').insertOne(conversation)
await db.collection('agent_messages').insertOne({sessionId,userId,messageId:inputId,index:0,role:'user',parts:message.parts,createdAt:now})
const item={id:inputId,actorUserId:userId,source:'app',renderedText:'Check the neutral example.',receivedAt:now.toISOString(),attempts:1,chat:{streamId,message,locale:'en',localTools:true}}
const persistedUserInputs=await db.collection('agent_messages').countDocuments({sessionId,role:'user'})
let released=0
await launchQueuedChatTurn(conversation,item,()=>released++)
const run=agentRuns.get(`${userId}:${streamId}`)
run?.abortController.abort()
const events=run?.frames.flatMap((f:string)=>{try{return [JSON.parse(f.slice(6))]}catch{return []}})??[]
const result={side,realMongoDB:true,persistedUserInputs,retryAttempt:1,registeredRetryRun:Boolean(run),turnStartContainsInput:events.some((f:any)=>f.type==='atlas-turn-start'&&f.messages?.some((m:any)=>m.id===inputId)),claimReleasedBeforeHandoff:released>0,modelExecutionVerified:false}
if(run){run.abortController.abort();run.releaseOwnership();const deadline=Date.now()+5000;while(!run.done&&Date.now()<deadline)await Bun.sleep(50);if(!run.done)throw Error('Cancelled proof run did not settle')}
await closeDb()
await Bun.write(join(root,`artifacts/nuphos-context-proof/712-${side}-queue.json`),JSON.stringify(result,null,2)+'\n')
console.log(JSON.stringify(result,null,2))
if(result.registeredRetryRun!==(side==='after')||result.turnStartContainsInput!==(side==='after')||result.claimReleasedBeforeHandoff!==(side==='before'))throw Error('Queue handoff comparison failed')
process.exit(0)
