(function(root){
  'use strict';

  const CORE_STATE_VERSION=1;
  const CORE_SYNC_TYPES=Object.freeze(['task','growth','goal','focus','mood']);
  const MAX_ITEMS=10000,MAX_TEXT=1000,MAX_NOTE_TEXT=2000,MAX_TIMESTAMP=8640000000000000;
  const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const DAY=/^\d{4}-\d{2}-\d{2}$/,TIME=/^([01]\d|2[0-3]):[0-5]\d$/;
  const STATE_KEYS=['version','tasks','growthItems','goals','focusSessions','moodEntries','syncOps'];
  const LEGACY_GROWTH_KEYS=['id','name','energy','createdAt','updatedAt','deletedAt'];

  function plain(value){return value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype;}
  function exact(value,keys){return plain(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));}
  function text(value,max=MAX_TEXT){return typeof value==='string'&&value.length>0&&value.length<=max&&value.trim()===value;}
  function nullableText(value,max=MAX_TEXT){return value===null||(typeof value==='string'&&value.length<=max&&value.trim()===value);}
  function integer(value,min,max){return Number.isInteger(value)&&value>=min&&value<=max;}
  function timestamp(value){return integer(value,0,MAX_TIMESTAMP);}
  function deletion(value){return value===null||timestamp(value);}
  function entityTimes(value){return timestamp(value.createdAt)&&timestamp(value.updatedAt)&&value.updatedAt>=value.createdAt&&deletion(value.deletedAt)&&(value.deletedAt===null||value.deletedAt>=value.updatedAt);}
  function uuid(value){return typeof value==='string'&&UUID.test(value);}
  function day(value){return typeof value==='string'&&DAY.test(value)&&Number.isFinite(Date.parse(`${value}T00:00:00Z`));}
  function collection(value){return Array.isArray(value)&&value.length<=MAX_ITEMS;}
  function helperRefs(value){return plain(value)&&Object.keys(value).length<=32&&Object.entries(value).every(([key,item])=>text(key,120)&&text(item,MAX_TEXT));}

  function task(value){
    return exact(value,['id','name','energy','done','dayKey','startTime','endTime','helper','helperRef','helperRefs','pomodoroCount','createdAt','updatedAt','deletedAt'])
      &&uuid(value.id)&&text(value.name)&&integer(value.energy,0,100)&&typeof value.done==='boolean'&&day(value.dayKey)
      &&(value.startTime===null||typeof value.startTime==='string'&&TIME.test(value.startTime))
      &&(value.endTime===null||typeof value.endTime==='string'&&TIME.test(value.endTime))
      &&(value.startTime===null||value.endTime===null||value.startTime<value.endTime)
      &&['none','pomodoro','flashcards','quiz','checklist'].includes(value.helper)&&nullableText(value.helperRef)
      &&helperRefs(value.helperRefs)&&integer(value.pomodoroCount,0,1000000)&&entityTimes(value);
  }
  function growth(value){return exact(value,['id','name','energy','rolloverSourceId','createdAt','updatedAt','deletedAt'])&&uuid(value.id)&&text(value.name)&&integer(value.energy,0,100)&&(value.rolloverSourceId===null||uuid(value.rolloverSourceId))&&entityTimes(value);}
  function goal(value){return exact(value,['id','name','target','cur','unit','createdAt','updatedAt','deletedAt'])&&uuid(value.id)&&text(value.name)&&integer(value.target,1,1000000000)&&integer(value.cur,0,value.target)&&typeof value.unit==='string'&&value.unit.length<=120&&value.unit.trim()===value.unit&&entityTimes(value);}
  function focus(value){
    const common=['id','kind','minutes','pomodoroCount','dayKey','createdAt','updatedAt','deletedAt'];
    if(!plain(value)||!uuid(value.id)||!['pomodoro','legacy-summary'].includes(value.kind)||!integer(value.minutes,0,1000000000)
      ||!integer(value.pomodoroCount,0,1000000000)||!day(value.dayKey)||!entityTimes(value))return false;
    if(value.kind==='pomodoro')return exact(value,common)&&value.minutes===25&&value.pomodoroCount===1;
    return exact(value,[...common,'weekMinutes'])&&Array.isArray(value.weekMinutes)&&value.weekMinutes.length===7&&value.weekMinutes.every(minutes=>integer(minutes,0,1000000000));
  }
  function mood(value){return exact(value,['id','date','mood','text','createdAt','updatedAt','deletedAt'])&&uuid(value.id)&&day(value.date)&&text(value.mood,40)&&typeof value.text==='string'&&value.text.length<=MAX_NOTE_TEXT&&value.text.trim()===value.text&&entityTimes(value);}
  function syncOp(value,entityIds){return exact(value,['id','type','entityId','op','createdAt'])&&uuid(value.id)&&CORE_SYNC_TYPES.includes(value.type)&&uuid(value.entityId)&&entityIds.has(value.entityId)&&['upsert','delete'].includes(value.op)&&timestamp(value.createdAt);}

  function normalizeCoreState(raw){
    if(!exact(raw,STATE_KEYS)||raw.version!==CORE_STATE_VERSION||!collection(raw.tasks)||!collection(raw.growthItems)||!collection(raw.goals)
      ||!collection(raw.focusSessions)||!collection(raw.moodEntries)||!collection(raw.syncOps))return null;
    const growthItems=raw.growthItems.map(item=>exact(item,LEGACY_GROWTH_KEYS)?{...item,rolloverSourceId:null}:item);
    const state=growthItems.some((item,index)=>item!==raw.growthItems[index])?{...raw,growthItems}:raw;
    const ids=new Set(),add=(items,validator)=>items.every(item=>validator(item)&&!ids.has(item.id)&&(ids.add(item.id),true));
    if(!add(state.tasks,task)||!add(state.growthItems,growth)||!add(state.goals,goal)||!add(state.focusSessions,focus)||!add(state.moodEntries,mood))return null;
    if(!add(state.syncOps,item=>syncOp(item,ids)))return null;
    return state;
  }

  function hash(text,seed){let hash=seed>>>0;for(let index=0;index<text.length;index++)hash=Math.imul(hash^text.charCodeAt(index),16777619)>>>0;return hash>>>0;}
  function hex(value){return value.toString(16).padStart(8,'0');}
  function legacyId(type,value,index,used){
    let attempt=0;
    while(true){
      const source=`${type}:${String(value)}:${index}:${attempt}`;
      const first=hex(hash(source,2166136261)),second=hex(hash(source,0x9e3779b9));
      const candidate=`${first}-${second.slice(0,4)}-4${second.slice(5,8)}-8${first.slice(1,4)}-${(second+first).slice(0,12)}`;
      if(!used.has(candidate)){used.add(candidate);return candidate;}
      attempt++;
    }
  }
  function legacyText(value,max=MAX_TEXT){return typeof value==='string'?value.trim().slice(0,max):'';}
  function legacyNumber(value,min,max,fallback){const number=Number(value);return Number.isFinite(number)?Math.min(max,Math.max(min,Math.trunc(number))):fallback;}
  function legacyDay(value,fallback){return day(value)?value:fallback;}

  function migrateLegacyCoreState(legacy,now,dayKey){
    const source=plain(legacy)?legacy:{},createdAt=timestamp(now)?now:Date.now(),fallbackDay=day(dayKey)?dayKey:'1970-01-01',used=new Set();
    const makeId=(type,item,index)=>legacyId(type,plain(item)&&Object.hasOwn(item,'id')?item.id:index,index,used);
    const tasks=[];
    for(const [index,item] of (collection(source.tasks)?source.tasks:[]).entries()){
      if(!plain(item)||!legacyText(item.name))continue;
      const startTime=typeof item.startTime==='string'&&TIME.test(item.startTime)?item.startTime:null;
      const endTime=typeof item.endTime==='string'&&TIME.test(item.endTime)&&(!startTime||startTime<item.endTime)?item.endTime:null;
      const refs=helperRefs(item.helperRefs)?item.helperRefs:{};
      const helper=['none','pomodoro','flashcards','quiz','checklist'].includes(item.helper)?item.helper:'none';
      tasks.push({id:makeId('task',item,index),name:legacyText(item.name),energy:legacyNumber(item.energy,0,100,25),done:Boolean(item.done),dayKey:legacyDay(item.dayKey,fallbackDay),startTime,endTime,helper,helperRef:typeof item.helperRef==='string'&&item.helperRef.trim()===item.helperRef&&item.helperRef.length<=MAX_TEXT?item.helperRef:null,helperRefs:refs,pomodoroCount:legacyNumber(item.pomodoroCount,0,1000000,0),createdAt,updatedAt:createdAt,deletedAt:null});
    }
    const growthItems=[];
    for(const [index,item] of (collection(source.ideas)?source.ideas:[]).entries())if(plain(item)&&legacyText(item.name))growthItems.push({id:makeId('growth',item,index),name:legacyText(item.name),energy:legacyNumber(item.energy,0,100,25),rolloverSourceId:null,createdAt,updatedAt:createdAt,deletedAt:null});
    const goals=[];
    for(const [index,item] of (collection(source.goals)?source.goals:[]).entries())if(plain(item)&&legacyText(item.name)){
      const target=legacyNumber(item.target,1,1000000000,1);goals.push({id:makeId('goal',item,index),name:legacyText(item.name),target,cur:legacyNumber(item.cur,0,target,0),unit:typeof item.unit==='string'?item.unit.trim().slice(0,120):'',createdAt,updatedAt:createdAt,deletedAt:null});
    }
    const moodEntries=[];
    for(const [index,item] of (collection(source.logs)?source.logs:[]).entries())if(plain(item)&&legacyDay(item.date,fallbackDay)&&legacyText(item.mood,40))moodEntries.push({id:makeId('mood',item,index),date:legacyDay(item.date,fallbackDay),mood:legacyText(item.mood,40),text:typeof item.text==='string'?item.text.trim().slice(0,MAX_NOTE_TEXT):'',createdAt,updatedAt:createdAt,deletedAt:null});
    const week=Array.isArray(source.week)&&source.week.length===7?source.week.map(minutes=>legacyNumber(minutes,0,1000000000,0)):[0,0,0,0,0,0,0];
    const minutes=legacyNumber(source.focusMin,0,1000000000,0),pomodoroCount=legacyNumber(source.pomo,0,1000000000,0);
    const focusSessions=minutes||pomodoroCount||week.some(Boolean)?[{id:makeId('focus',{id:'legacy-summary'},0),kind:'legacy-summary',minutes,pomodoroCount,dayKey:fallbackDay,weekMinutes:week,createdAt,updatedAt:createdAt,deletedAt:null}]:[];
    return {version:CORE_STATE_VERSION,tasks,growthItems,goals,focusSessions,moodEntries,syncOps:[]};
  }

  function coreStorageKey(scope){return `coreState_${scope==='local'?'local':String(scope).toLowerCase()}`;}
  function serializeCoreRecovery(state){const valid=normalizeCoreState(state);if(!valid)throw new Error('Invalid core recovery state');const {syncOps,...recovery}=valid;return JSON.stringify(recovery);}
  function parseCoreRecovery(text){
    if(typeof text!=='string'||text.length>10000000)throw new Error('Invalid core recovery data');
    let raw;try{raw=JSON.parse(text);}catch(error){throw new Error('Invalid core recovery data');}
    const normalized=normalizeCoreState({...raw,syncOps:[]});if(!normalized)throw new Error('Invalid core recovery data');return normalized;
  }

  const CORE_REMOTE_TABLES=Object.freeze({
    task:'liangli_tasks',growth:'liangli_growth_items',goal:'liangli_goals',focus:'liangli_focus_sessions',mood:'liangli_mood_entries'
  });
  const accountRuntime={url:'',anonKey:'',fetch:null,location:null,getStoredSession:()=>null,setStoredSession:()=>{},onSessionChange:null};
  function accountFetch(){const fetcher=accountRuntime.fetch||root.fetch;if(typeof fetcher!=='function')throw new Error('Account sync unavailable');return fetcher;}
  function configured(){return /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(accountRuntime.url)&&typeof accountRuntime.anonKey==='string'&&accountRuntime.anonKey.length>40;}
  function activeOwner(session,generation){return AccountClient.generation===generation&&AccountClient.session?.user?.id===session?.user?.id;}
  function discarded(){return {data:null,error:true,status:0,discarded:true};}
  function allowedTableNames(allowedTables){
    const values=Array.isArray(allowedTables)?allowedTables:allowedTables instanceof Set?[...allowedTables]:plain(allowedTables)?Object.values(allowedTables):[];
    if(!values.length||values.some(value=>typeof value!=='string'||!value))throw new Error('Invalid cloud table allowlist');
    return new Set(Object.freeze([...values]));
  }
  function safeEmail(email){const value=typeof email==='string'?email.trim():'';if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)||value.length>320)throw new Error('Invalid email');return value;}
  function safeRedirect(){
    const location=accountRuntime.location||root.location;
    if(!location||typeof location.origin!=='string'||typeof location.pathname!=='string'||!location.pathname.startsWith('/'))throw new Error('Invalid recovery redirect');
    return `${location.origin}${location.pathname}`;
  }

  const AccountClient={
    client:null,session:null,refreshPromise:null,refreshOwner:null,authInvalid:false,authorizationBlocked:false,generation:0,
    configure(options={}){
      for(const key of ['url','anonKey','fetch','location','getStoredSession','setStoredSession','onSessionChange'])if(Object.hasOwn(options,key))accountRuntime[key]=options[key];
      return this;
    },
    isConfigured(){return configured();},
    async authRequest(path,body,token=''){
      if(!this.isConfigured())throw new Error('Account sync unavailable');
      const response=await accountFetch()(`${accountRuntime.url}/auth/v1/${path}`,{method:'POST',headers:{apikey:accountRuntime.anonKey,'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:body==null?undefined:JSON.stringify(body)});
      if(!response.ok)throw new Error('Authentication failed');
      return response.status===204?{}:await response.json();
    },
    sessionFromPayload(data){
      if(!plain(data)||typeof data.access_token!=='string'||!data.access_token||!plain(data.user)||typeof data.user.id!=='string'||!data.user.id)return null;
      return {access_token:data.access_token,refresh_token:typeof data.refresh_token==='string'?data.refresh_token:null,expires_at:Math.floor(Date.now()/1000)+(Number.isFinite(data.expires_in)?data.expires_in:3600),user:data.user};
    },
    async activate(session,persist=true,preserveGeneration=false){
      if(session!==null&&(!plain(session)||!plain(session.user)||typeof session.user.id!=='string'||!session.user.id))throw new Error('Invalid session');
      if(!preserveGeneration)this.generation++;
      this.session=session;this.client=session?createOwnerRestClient(session,this.generation,Object.values(CORE_REMOTE_TABLES)):null;this.authInvalid=false;this.authorizationBlocked=false;
      if(persist)accountRuntime.setStoredSession(session);
      if(typeof accountRuntime.onSessionChange==='function')await accountRuntime.onSessionChange(session,persist);
      return session;
    },
    async refreshSession(expectedUserId=this.session?.user?.id){
      if(!expectedUserId||this.session?.user?.id!==expectedUserId)throw new Error('Session changed');
      const expectedGeneration=this.generation,expectedToken=this.session.access_token,expectedRefreshToken=this.session.refresh_token;
      if(this.refreshPromise&&this.refreshOwner?.generation===expectedGeneration&&this.refreshOwner.userId===expectedUserId&&this.refreshOwner.accessToken===expectedToken)return this.refreshPromise;
      const refresh=async()=>{
        const latest=accountRuntime.getStoredSession();
        if(this.generation!==expectedGeneration||this.session?.user?.id!==expectedUserId||this.session.access_token!==expectedToken)throw new Error('Session changed');
        if(latest&&latest.user?.id!==expectedUserId)throw new Error('Session changed');
        if(latest&&latest.access_token!==expectedToken&&(latest.expires_at||0)>Math.floor(Date.now()/1000)+60)return await this.activate(latest,false,true);
        if(!expectedRefreshToken)throw new Error('Session expired');
        const session=this.sessionFromPayload(await this.authRequest('token?grant_type=refresh_token',{refresh_token:expectedRefreshToken}));
        if(!session||this.generation!==expectedGeneration||this.session?.user?.id!==expectedUserId||this.session.access_token!==expectedToken)throw new Error('Session changed');
        return await this.activate(session,true,true);
      };
      const locks=root.navigator?.locks;
      const promise=(locks?locks.request('liangli-auth-refresh',refresh):refresh()).finally(()=>{
        if(this.refreshPromise===promise){this.refreshPromise=null;this.refreshOwner=null;}
      });
      this.refreshOwner={generation:expectedGeneration,userId:expectedUserId,accessToken:expectedToken};this.refreshPromise=promise;return promise;
    },
    async restoreSession(){
      if(!this.isConfigured())return await this.activate(null,false);
      const restoreGeneration=this.generation;let expectedUserId=null;
      try{
        const session=accountRuntime.getStoredSession();
        if(!session||!session.refresh_token||!session.user)return await this.activate(null);
        expectedUserId=session.user.id;
        if((session.expires_at||0)<=Math.floor(Date.now()/1000)+60){this.session=session;return await this.refreshSession(expectedUserId);}
        return await this.activate(session);
      }catch(error){
        if(this.generation!==restoreGeneration||this.session?.user?.id!==expectedUserId)return this.session;
        await this.activate(null);throw error;
      }
    },
    async signIn(email,password){
      const session=this.sessionFromPayload(await this.authRequest('token?grant_type=password',{email:safeEmail(email),password}));
      if(!session)throw new Error('Authentication failed');return await this.activate(session);
    },
    async signUp(email,password){
      const data=await this.authRequest('signup',{email:safeEmail(email),password}),session=this.sessionFromPayload(data);
      if(session)await this.activate(session);return {session,user:plain(data)&&data.user?data.user:null};
    },
    async recover(email,redirectTo){
      void redirectTo;
      return await this.authRequest('recover',{email:safeEmail(email),redirect_to:safeRedirect()});
    },
    async signOut(){try{if(this.session)await this.authRequest('logout',null,this.session.access_token);}finally{await this.activate(null);}}
  };

  function createOwnerRestClient(session,generation,allowedTables){
    const allowed=allowedTableNames(allowedTables);
    const request=async(table,method='GET',body=null,query='',prefer='',extraHeaders={})=>{
      if(!allowed.has(table))throw new Error('Cloud table not allowed');
      const perform=async()=>{
        if(!activeOwner(session,generation))return null;
        const token=AccountClient.session.access_token;
        return await accountFetch()(`${accountRuntime.url}/rest/v1/${table}${query}`,{method,headers:{apikey:accountRuntime.anonKey,Authorization:`Bearer ${token}`,'Content-Type':'application/json',...(prefer?{Prefer:prefer}:{}),...extraHeaders},body:body==null?undefined:JSON.stringify(body)});
      };
      let response=await perform();
      if(!response)return discarded();
      if(!activeOwner(session,generation))return discarded();
      if(response.status===401&&AccountClient.session?.refresh_token){
        try{await AccountClient.refreshSession(session.user.id);if(!activeOwner(session,generation))return discarded();response=await perform();if(!response)return discarded();}
        catch(error){if(activeOwner(session,generation))AccountClient.authInvalid=true;}
      }
      if(!activeOwner(session,generation))return discarded();
      if(response.status===401)AccountClient.authInvalid=true;
      if(response.status===403)AccountClient.authorizationBlocked=true;
      if(!response.ok)return {data:null,error:true,status:response.status};
      const data=method==='GET'?await response.json():null;
      return activeOwner(session,generation)?{data,error:null}:discarded();
    };
    const table=name=>{
      if(!allowed.has(name))throw new Error('Cloud table not allowed');
      return {
        async select(columns='*'){
          const rows=[];let offset=0;
          while(true){
            const result=await request(name,'GET',null,`?select=${encodeURIComponent(columns)}`,'',{'Range-Unit':'items',Range:`${offset}-${offset+999}`});
            if(result.error)return result;
            rows.push(...result.data);if(result.data.length<1000)return {data:rows,error:null};offset+=1000;
          }
        },
        upsert(rows,options={}){return request(name,'POST',rows,`?on_conflict=${encodeURIComponent(options.onConflict||'id')}`,options.ignoreDuplicates?'resolution=ignore-duplicates,return=minimal':'resolution=merge-duplicates,return=minimal');},
        update(values){let filters='';return {eq(column,value){filters+=`&${encodeURIComponent(column)}=eq.${encodeURIComponent(value)}`;return this;},lte(column,value){filters+=`&${encodeURIComponent(column)}=lte.${encodeURIComponent(value)}`;return request(name,'PATCH',values,`?${filters.slice(1)}`,'return=minimal');}};}
      };
    };
    return Object.freeze({table,from:table});
  }

  root.AccountClient=AccountClient;
  root.CommunityClient=AccountClient;
  root.LiangliAccountSync=Object.freeze({CORE_STATE_VERSION,CORE_SYNC_TYPES,CORE_REMOTE_TABLES,coreStorageKey,normalizeCoreState,migrateLegacyCoreState,serializeCoreRecovery,parseCoreRecovery,createOwnerRestClient,AccountClient});
  if(typeof module!=='undefined'&&module.exports)module.exports=root.LiangliAccountSync;
})(typeof window==='undefined'?globalThis:window);
