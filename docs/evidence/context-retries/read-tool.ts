import { join } from 'node:path'
const root=import.meta.dir
const summary=[]
for(const [side,port] of [['before',3741],['after',3742]] as const){
 const ids=await Bun.file(join(root,`ids-${side}.json`)).json()
 const auth=Bun.YAML.parse(await Bun.file(join(root,`profile-${side}/desktop.yaml`)).text()) as {token:string}
 const payload={jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'read_conversation',arguments:{label:'Reading the neutral example requirements',session_id:ids.sessionId.slice(0,-3)+'810',limit:10}}}
 const response=await fetch(`http://127.0.0.1:${port}/agent-sessions/${ids.sessionId}/teams/${ids.teamId}/mcp-tools`,{method:'POST',headers:{Authorization:`Bearer ${auth.token}`,'Content-Type':'application/json'},body:JSON.stringify(payload)})
 const data=await response.json() as any
 await Bun.write(join(root,`711-${side}-mcp.json`),JSON.stringify(data,null,2)+'\n')
 const text=(data.result?.content??[]).map((x:any)=>x.text??'').join('\n')
 summary.push({side,httpStatus:response.status,tool:'read_conversation',includesUserCorrection:text.includes('Use green instead of blue.'),toolError:data.error??data.result?.isError??false})
}
console.log(JSON.stringify(summary,null,2))
if(summary[0].includesUserCorrection||!summary[1].includesUserCorrection||summary.some(x=>x.httpStatus!==200||x.toolError))throw Error('The real HTTP MCP comparison failed')
await Bun.write(join(root,'711-mcp-summary.json'),JSON.stringify(summary,null,2)+'\n')
