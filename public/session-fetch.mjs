let sessionToken='';
export function setSessionToken(value){sessionToken=value;}
export async function sessionFetch(url,options={}){
 const send=()=>fetch(url,{...options,headers:{...options.headers,'X-Session-Token':sessionToken}});
 let response=await send();
 // Only replay a rejected request. Accepted generation is never replayed.
 if(response.status===403){const session=await fetch('/api/session',{signal:options.signal});if(session.ok){sessionToken=(await session.json()).token;response=await send();}}
 return response;
}
