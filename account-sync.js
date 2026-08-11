(function(root){
  'use strict';

  const CORE_STATE_VERSION=1;
  const CORE_SYNC_TYPES=Object.freeze(['task','growth','goal','focus','mood']);
  const MAX_ITEMS=10000,MAX_TEXT=1000,MAX_NOTE_TEXT=2000,MAX_TIMESTAMP=253402300799999;
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
  function day(value){
    if(typeof value!=='string'||!DAY.test(value)||value.startsWith('0000-'))return false;
    const canonical=`${value}T00:00:00.000Z`,parsed=Date.parse(canonical);
    return Number.isFinite(parsed)&&new Date(parsed).toISOString()===canonical;
  }
  function canonicalTimestamp(value){
    if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value))return false;
    const parsed=Date.parse(value);return timestamp(parsed)&&new Date(parsed).toISOString()===value;
  }
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
  function createCoreRecoveryStore(storage){
    if(!storage||typeof storage.getItem!=='function'||typeof storage.setItem!=='function'||typeof storage.removeItem!=='function'||typeof storage.key!=='function')throw new Error('Invalid recovery storage');
    const prefix='coreRecovery_';
    const counts=state=>({tasks:state.tasks.length,growth:state.growthItems.length,goals:state.goals.length,focus:state.focusSessions.length,mood:state.moodEntries.length});
    const list=()=>{
      const entries=[];
      for(let index=0;index<Number(storage.length)||0;index++){
        const key=storage.key(index);if(typeof key!=='string'||!key.startsWith(prefix))continue;
        try{const record=JSON.parse(storage.getItem(key));if(!plain(record)||record.version!==1||!canonicalTimestamp(record.createdAt)||key!==`${prefix}${record.createdAt}`||typeof record.core!=='string')continue;const state=parseCoreRecovery(record.core);entries.push({key,createdAt:record.createdAt,counts:counts(state)});}catch(error){}
      }
      return entries.sort((left,right)=>right.createdAt.localeCompare(left.createdAt));
    };
    return Object.freeze({
      save(state,createdAt=new Date().toISOString()){
        if(!canonicalTimestamp(createdAt))throw new Error('Invalid recovery timestamp');
        let timestampValue=createdAt,key=`${prefix}${timestampValue}`;
        for(let attempt=0;storage.getItem(key)!==null&&attempt<1000;attempt++){timestampValue=new Date(Date.parse(timestampValue)+1).toISOString();key=`${prefix}${timestampValue}`;}
        if(storage.getItem(key)!==null)throw new Error('Recovery timestamp collision');
        const record={version:1,createdAt:timestampValue,core:serializeCoreRecovery(state)};
        storage.setItem(key,JSON.stringify(record));
        for(const entry of list().slice(3)){try{storage.removeItem(entry.key);}catch(error){throw new Error('Recovery retention failed');}if(storage.getItem(entry.key)!==null)throw new Error('Recovery retention failed');}
        if(list().length>3)throw new Error('Recovery retention failed');
        return key;
      },list,
      restore(key){
        if(typeof key!=='string'||!key.startsWith(prefix))throw new Error('Invalid recovery key');
        let record;try{record=JSON.parse(storage.getItem(key));}catch(error){throw new Error('Invalid core recovery data');}
        if(!plain(record)||record.version!==1||!canonicalTimestamp(record.createdAt)||key!==`${prefix}${record.createdAt}`||typeof record.core!=='string')throw new Error('Invalid core recovery data');
        return parseCoreRecovery(record.core);
      }
    });
  }
  function fallbackUuid(){return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,char=>{const value=Math.floor(Math.random()*16);return (char==='x'?value:(value&3)|8).toString(16);});}
  function prepareDeviceUploadState(state,createdAt=Date.now(),makeId){
    const normalized=normalizeCoreState(state);
    if(!normalized||!timestamp(createdAt))throw new Error('Invalid device upload state');
    const nextId=typeof makeId==='function'?makeId:()=>root.crypto?.randomUUID?.()||fallbackUuid();
    const used=new Set([...normalized.tasks,...normalized.growthItems,...normalized.goals,...normalized.focusSessions,...normalized.moodEntries].map(item=>item.id));
    const syncOps=[];
    for(const type of CORE_SYNC_TYPES){
      for(const entity of normalized[CORE_STATE_KEYS[type]]){
        let id=nextId();
        if(!uuid(id)||used.has(id))throw new Error('Invalid device upload operation id');
        used.add(id);syncOps.push({id,type,entityId:entity.id,op:entity.deletedAt===null?'upsert':'delete',createdAt});
      }
    }
    const prepared={...normalized,syncOps};
    if(!normalizeCoreState(prepared))throw new Error('Invalid device upload state');
    return prepared;
  }
  function readAnonymousCoreState(readScope){
    if(typeof readScope!=='function')throw new Error('Invalid local core reader');
    const scoped=readScope('local');
    if(!plain(scoped)||scoped.status!=='valid')return null;
    return normalizeCoreState(scoped.state);
  }
  function createAccountReconciliationGate(){
    let current=null;
    return Object.freeze({
      acquire(userId,generation){
        if(current||typeof userId!=='string'||!userId||!Number.isInteger(generation)||generation<0)return null;
        current=Object.freeze({userId,generation});return current;
      },
      owns:token=>current===token,
      release(token){if(current!==token)return false;current=null;return true;},
      cancel(){current=null;},
      active:()=>current
    });
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
  function allowedRpcNames(allowedRpcs){
    const values=Array.isArray(allowedRpcs)?allowedRpcs:[];
    if(values.some(value=>typeof value!=='string'||!/^initialize_liangli_core_sync$/.test(value)))throw new Error('Invalid cloud RPC allowlist');
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

  function createOwnerRestClient(session,generation,allowedTables,allowedRpcs=[]){
    const allowed=allowedTableNames(allowedTables),rpcs=allowedRpcNames(allowedRpcs);
    const request=async(path,method='GET',body=null,query='',prefer='',extraHeaders={})=>{
      const perform=async()=>{
        if(!activeOwner(session,generation))return null;
        const token=AccountClient.session.access_token;
        return await accountFetch()(`${accountRuntime.url}/rest/v1/${path}${query}`,{method,headers:{apikey:accountRuntime.anonKey,Authorization:`Bearer ${token}`,'Content-Type':'application/json',...(prefer?{Prefer:prefer}:{}),...extraHeaders},body:body==null?undefined:JSON.stringify(body)});
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
      if(!response.ok){
        let message='';try{const errorBody=await response.json();message=typeof errorBody?.message==='string'?errorBody.message:'';}catch(error){}
        return message?{data:null,error:true,status:response.status,message}:{data:null,error:true,status:response.status};
      }
      const data=method==='GET'||path.startsWith('rpc/')?await response.json():null;
      return activeOwner(session,generation)?{data,error:null}:discarded();
    };
    const table=name=>{
      if(!allowed.has(name))throw new Error('Cloud table not allowed');
      return {
        async select(columns='*',options={}){
          const after=timestamp(options.clientUpdatedAfter)?`&client_updated_at=gt.${encodeURIComponent(options.clientUpdatedAfter)}`
            :timestamp(options.clientUpdatedAtOrAfter)?`&client_updated_at=gte.${encodeURIComponent(options.clientUpdatedAtOrAfter)}`:'';
          const rows=[];let offset=0;
          while(true){
            const result=await request(name,'GET',null,`?select=${encodeURIComponent(columns)}${after}`,'',{'Range-Unit':'items',Range:`${offset}-${offset+999}`});
            if(result.error)return result;
            rows.push(...result.data);if(result.data.length<1000)return {data:rows,error:null};offset+=1000;
          }
        },
        upsert(rows,options={}){return request(name,'POST',rows,`?on_conflict=${encodeURIComponent(options.onConflict||'id')}`,options.ignoreDuplicates?'resolution=ignore-duplicates,return=minimal':'resolution=merge-duplicates,return=minimal');},
        delete(){let filters='';return {eq(column,value){filters+=`&${encodeURIComponent(column)}=eq.${encodeURIComponent(value)}`;return request(name,'DELETE',null,`?${filters.slice(1)}`,'return=minimal');}};},
        update(values){let filters='';return {eq(column,value){filters+=`&${encodeURIComponent(column)}=eq.${encodeURIComponent(value)}`;return this;},lte(column,value){filters+=`&${encodeURIComponent(column)}=lte.${encodeURIComponent(value)}`;return request(name,'PATCH',values,`?${filters.slice(1)}`,'return=minimal');}};}
      };
    };
    const rpc=(name,args)=>{
      if(!rpcs.has(name))throw new Error('Cloud RPC not allowed');
      return request(`rpc/${name}`,'POST',args,'','return=representation');
    };
    return Object.freeze({table,from:table,rpc});
  }

  const CORE_STATE_KEYS=Object.freeze({task:'tasks',growth:'growthItems',goal:'goals',focus:'focusSessions',mood:'moodEntries'});
  const CORE_MANIFEST_TABLE='liangli_sync_profiles';
  function emptyCoreState(){return {version:CORE_STATE_VERSION,tasks:[],growthItems:[],goals:[],focusSessions:[],moodEntries:[],syncOps:[]};}
  function entityForType(type,value){
    const key=CORE_STATE_KEYS[type];if(!key)return null;
    const normalized=normalizeCoreState({...emptyCoreState(),[key]:[value]});
    return normalized?normalized[key][0]:null;
  }
  function mergeCoreEntity(local,remote){
    if(!local)return remote;if(!remote)return local;
    if(local.id!==remote.id)throw new Error('Cannot merge distinct core entities');
    if(local.deletedAt!==null&&remote.deletedAt===null)return local;
    if(remote.deletedAt!==null&&local.deletedAt===null)return remote;
    if(remote.updatedAt>local.updatedAt)return remote;
    if(local.updatedAt>remote.updatedAt)return local;
    if(remote.deletedAt!==null&&local.deletedAt===null)return remote;
    if(local.deletedAt!==null&&remote.deletedAt===null)return local;
    return String(remote.id)>String(local.id)?remote:local;
  }
  function coalesceCoreOps(ops){
    if(!Array.isArray(ops))return [];
    const latest=new Map();
    for(const op of ops){
      if(!op||!CORE_SYNC_TYPES.includes(op.type)||!uuid(op.entityId)||!uuid(op.id)||!['upsert','delete'].includes(op.op)||!timestamp(op.createdAt))continue;
      const key=`${op.type}:${op.entityId}`,previous=latest.get(key);
      if(!previous||op.createdAt>previous.createdAt||(op.createdAt===previous.createdAt&&op.op==='delete'&&previous.op!=='delete')||(op.createdAt===previous.createdAt&&op.op===previous.op&&op.id>previous.id))latest.set(key,op);
    }
    return [...latest.values()].sort((left,right)=>left.createdAt-right.createdAt||left.id.localeCompare(right.id));
  }
  function coreRow(type,entity,userId){
    if(!CORE_REMOTE_TABLES[type])throw new Error('Invalid core type');
    return {id:entity.id,user_id:userId,payload:entity,client_updated_at:entity.updatedAt,deleted_at:entity.deletedAt===null?null:new Date(entity.deletedAt).toISOString()};
  }
  function coreInitializationRow(entity){return {id:entity.id,payload:entity,client_updated_at:entity.updatedAt,deleted_at:entity.deletedAt===null?null:new Date(entity.deletedAt).toISOString()};}
  function entityFromCloudRow(type,row,userId){
    if(!plain(row)||!plain(row.payload)||row.user_id!==userId)return null;
    const entity=row.payload;
    if(row.id!==entity.id||!timestamp(row.client_updated_at)||row.client_updated_at!==entity.updatedAt)return null;
    if(row.deleted_at===undefined)return null;
    if(row.deleted_at===null){if(entity.deletedAt!==null)return null;}
    else if(!canonicalTimestamp(row.deleted_at)||entity.deletedAt===null||Date.parse(row.deleted_at)!==entity.deletedAt)return null;
    return entityForType(type,entity);
  }
  function createCoreSyncController(deps={}){
    const readScope=deps.readScope,writeScope=deps.writeScope,createRecovery=deps.createRecovery,restFactory=deps.restClient,getGeneration=deps.getGeneration,now=typeof deps.now==='function'?deps.now:Date.now;
    if(typeof readScope!=='function'||typeof writeScope!=='function'||typeof restFactory!=='function'||typeof getGeneration!=='function')throw new Error('Invalid core sync dependencies');
    let inFlight=null,timer=null,attempt=0,cancelEpoch=0,lastSession=null,rerunRequested=false,runningUserId=null,runningGeneration=null,readyOwner=deps.initialCoreReady===true?'test-ready':null;
    const cursors=new Map();
    const clearTimer=typeof deps.clearTimeout==='function'?deps.clearTimeout:clearTimeout;
    const owner=(session,generation,epoch)=>Boolean(session?.user?.id)&&getGeneration()===generation&&epoch===cancelEpoch&&(!deps.getSession||deps.getSession()?.user?.id===session.user.id);
    const markNotReady=()=>{readyOwner=null;};
    const markReady=(session,generation,epoch)=>{if(owner(session,generation,epoch))readyOwner={userId:session.user.id,generation,epoch};};
    const coreReady=(session,generation,epoch)=>readyOwner==='test-ready'||Boolean(readyOwner&&readyOwner.userId===session?.user?.id&&readyOwner.generation===generation&&readyOwner.epoch===epoch&&owner(session,generation,epoch));
    const clientFor=(session,generation)=>restFactory(session,generation);
    const notify=(status,session,generation,epoch)=>{if(owner(session,generation,epoch)&&typeof deps.onStatus==='function')deps.onStatus(status);};
    const callSelect=async(client,table,session,generation,epoch,changedAfter)=>{
      if(!owner(session,generation,epoch))return {discarded:true};
      const result=await client.table(table).select('*',changedAfter===undefined?{}:{clientUpdatedAtOrAfter:changedAfter});
      if(!owner(session,generation,epoch)||result?.discarded)return {discarded:true};
      if(result?.error||!Array.isArray(result?.data))throw new Error('Cloud fetch failed');
      return result;
    };
    const callUpsert=async(client,table,rows,session,generation,epoch)=>{
      if(!owner(session,generation,epoch))return {discarded:true};
      const conflictKey=table===CORE_MANIFEST_TABLE?'user_id':'id';
      const result=await client.table(table).upsert(rows,{onConflict:conflictKey,returning:true});
      if(!owner(session,generation,epoch)||result?.discarded)return {discarded:true};
      return result;
    };
    const initializeCloud=async(client,state,session,generation,epoch)=>{
      if(!owner(session,generation,epoch))return {discarded:true};
      const result=await client.rpc('initialize_liangli_core_sync',{
        p_tasks:state.tasks.map(coreInitializationRow),p_growth_items:state.growthItems.map(coreInitializationRow),p_goals:state.goals.map(coreInitializationRow),
        p_focus_sessions:state.focusSessions.map(coreInitializationRow),p_mood_entries:state.moodEntries.map(coreInitializationRow)
      });
      if(!owner(session,generation,epoch)||result?.discarded)return {discarded:true};
      if(result?.error){if(result.message==='liangli_core_already_initialized')return {alreadyInitialized:true};throw new Error('Cloud initialization failed');}
      if(!plain(result?.data)||result.data.initialized!==true)throw new Error('Cloud initialization failed');
      return {initialized:true};
    };
    const readState=async(session)=>{
      const state=await readScope(session.user.id);return normalizeCoreState(state);
    };
    const writeState=async(session,generation,epoch,state)=>{
      const normalized=normalizeCoreState(state);if(!normalized)throw new Error('Invalid core state');
      if(!owner(session,generation,epoch))return false;
      const saved=await writeScope(session.user.id,normalized);
      return Boolean(saved)&&owner(session,generation,epoch);
    };
    const fetchManifest=async(session,generation,epoch)=>{
      const result=await callSelect(clientFor(session,generation),CORE_MANIFEST_TABLE,session,generation,epoch);
      if(result.discarded)return result;
      if(result.data.length===0)return {initialized:false};
      const profile=result.data[0];
      if(result.data.length!==1||!plain(profile)||profile.user_id!==session.user.id||profile.core_version!==CORE_STATE_VERSION
        ||typeof profile.initialized_at!=='string'||!Number.isFinite(Date.parse(profile.initialized_at))
        ||typeof profile.updated_at!=='string'||!Number.isFinite(Date.parse(profile.updated_at)))throw new Error('Invalid cloud manifest');
      return {initialized:true};
    };
    const fetchCloudState=async(session,generation,epoch,changedAfter)=>{
      const client=clientFor(session,generation),state=emptyCoreState();
      for(const type of CORE_SYNC_TYPES){
        const result=await callSelect(client,CORE_REMOTE_TABLES[type],session,generation,epoch,changedAfter);
        if(result.discarded)return result;
        const rows=result.data;
        const key=CORE_STATE_KEYS[type];
        for(const row of rows){const entity=entityFromCloudRow(type,row,session.user.id);if(!entity)throw new Error('Invalid cloud entity');state[key].push(entity);}
      }
      if(!normalizeCoreState(state))throw new Error('Invalid cloud entity');
      return state;
    };
    const inspectCloud=async session=>{
      const generation=getGeneration(),epoch=cancelEpoch;lastSession=session;
      if(!owner(session,generation,epoch))return {discarded:true};
      return await fetchManifest(session,generation,epoch);
    };
    const initializeEmpty=async session=>{
      const generation=getGeneration(),epoch=cancelEpoch;lastSession=session;const client=clientFor(session,generation);
      if(!owner(session,generation,epoch))return {discarded:true};
      markNotReady();
      const state=emptyCoreState(),committed=await initializeCloud(client,state,session,generation,epoch);
      if(committed.discarded)return committed;
      if(committed.alreadyInitialized)return await recoverCommittedWinner(session,state);
      if(!await writeState(session,generation,epoch,state)){if(!owner(session,generation,epoch))return {discarded:true};return await recoverCommittedWinner(session,state);}
      if(owner(session,generation,epoch)&&typeof deps.onActivate==='function')deps.onActivate(session.user.id,state);
      markReady(session,generation,epoch);
      return {initialized:true,state};
    };
    const initializeFromDevice=async(session,state)=>{
      const generation=getGeneration(),epoch=cancelEpoch;lastSession=session;const normalized=normalizeCoreState(state),client=clientFor(session,generation);
      if(!normalized)throw new Error('Invalid core state');
      markNotReady();
      const committed=await initializeCloud(client,normalized,session,generation,epoch);
      if(committed.discarded)return committed;
      if(committed.alreadyInitialized)return await recoverCommittedWinner(session,normalized);
      if(!await writeState(session,generation,epoch,normalized)){if(!owner(session,generation,epoch))return {discarded:true};return await recoverCommittedWinner(session,normalized);}
      if(owner(session,generation,epoch)&&typeof deps.onActivate==='function')deps.onActivate(session.user.id,normalized);
      markReady(session,generation,epoch);
      return {initialized:true,state:normalized};
    };
    const activateCloud=async(session,options={})=>{
      const generation=getGeneration(),epoch=cancelEpoch;lastSession=session;
      markNotReady();
      const manifest=await fetchManifest(session,generation,epoch);if(manifest.discarded||!manifest.initialized)return manifest;
      const cloud=await fetchCloudState(session,generation,epoch);if(cloud.discarded)return cloud;
      const suppliedRecovery=Object.hasOwn(options,'recoveryState')?normalizeCoreState(options.recoveryState):null;
      if(Object.hasOwn(options,'recoveryState')&&!suppliedRecovery)throw new Error('Invalid recovery state');
      const local=suppliedRecovery||await readState(session);
      if(local&&typeof createRecovery==='function'){
        if(!owner(session,generation,epoch))return {discarded:true};
        if(await createRecovery(local)===false)throw new Error('Recovery creation failed');
      }
      if(!await writeState(session,generation,epoch,cloud)){if(!owner(session,generation,epoch))return {discarded:true};throw new Error('Cloud winner activation failed');}
      if(owner(session,generation,epoch)&&typeof deps.onActivate==='function')deps.onActivate(session.user.id,cloud);
      markReady(session,generation,epoch);
      return {initialized:true,state:cloud};
    };
    const recoverCommittedWinner=async(session,recoveryState)=>await activateCloud(session,{recoveryState});
    const syncNow=async session=>{
      const generation=getGeneration(),epoch=cancelEpoch;lastSession=session;
      if(!owner(session,generation,epoch))return {discarded:true};
      if(!coreReady(session,generation,epoch))return {quarantined:true};
      if(typeof deps.isOnline==='function'&&!deps.isOnline()){const error=new Error('Offline');error.offline=true;throw error;}
      notify('syncing',session,generation,epoch);
      const manifest=await fetchManifest(session,generation,epoch);if(manifest.discarded||!manifest.initialized)return manifest;
      let state=await readState(session);if(!state)throw new Error('Invalid core state');
      const client=clientFor(session,generation),sent=coalesceCoreOps(state.syncOps),succeeded=new Set();
      let pushedHighWatermark=0;
      for(const op of sent){
        if(!owner(session,generation,epoch))return {discarded:true};
        const entity=state[CORE_STATE_KEYS[op.type]].find(item=>item.id===op.entityId);
        const group=`${op.type}:${op.entityId}`;
        if(!entity)continue;
        const result=await callUpsert(client,CORE_REMOTE_TABLES[op.type],[coreRow(op.type,entity,session.user.id)],session,generation,epoch);
        if(result.discarded)return result;
        if(result?.error)continue;
        succeeded.add(group);
        if(Array.isArray(result.data))for(const row of result.data)if(plain(row)&&row.user_id===session.user.id&&timestamp(row.client_updated_at))pushedHighWatermark=Math.max(pushedHighWatermark,row.client_updated_at);
      }
      const latest=await readState(session);if(!latest)return {discarded:true};
      const latestWinners=new Map(coalesceCoreOps(latest.syncOps).map(op=>[`${op.type}:${op.entityId}`,op]));
      const sentWinners=new Map(sent.map(op=>[`${op.type}:${op.entityId}`,op]));
      state={...latest,syncOps:latest.syncOps.filter(op=>{
        const group=`${op.type}:${op.entityId}`,sentWinner=sentWinners.get(group);
        if(!sentWinner)return true;
        const latestWinner=latestWinners.get(group);
        if(!latestWinner)return false;
        if(succeeded.has(group)&&latestWinner.id===sentWinner.id)return false;
        return op.id===latestWinner.id;
      })};
      if(!await writeState(session,generation,epoch,state))return {discarded:true};
      const cursor=cursors.get(session.user.id),changed=await fetchCloudState(session,generation,epoch,cursor);
      if(changed.discarded)return changed;
      for(const type of CORE_SYNC_TYPES){
        const key=CORE_STATE_KEYS[type],localById=new Map(state[key].map(item=>[item.id,item]));
        for(const remote of changed[key])localById.set(remote.id,mergeCoreEntity(localById.get(remote.id),remote));
        state[key]=[...localById.values()];
      }
      const remoteTimes=CORE_SYNC_TYPES.flatMap(type=>changed[CORE_STATE_KEYS[type]].map(entity=>entity.updatedAt));
      if(!await writeState(session,generation,epoch,state))return {discarded:true};
      cursors.set(session.user.id,Math.max(cursor||0,pushedHighWatermark,...remoteTimes));
      attempt=0;notify('done',session,generation,epoch);return {initialized:true,state};
    };
    const scheduleRetry=(session,generation,epoch)=>{
      if(attempt>=4||typeof deps.setTimeout!=='function'||!owner(session,generation,epoch))return;
      const delay=Math.min(300000,1000*(2**attempt++));clearTimer(timer);
      timer=deps.setTimeout(()=>{if(owner(session,generation,epoch))sync(session);},delay);
    };
    const sync=(session,reason='')=>{
      lastSession=session||lastSession||(typeof deps.getSession==='function'?deps.getSession():null);
      if(!lastSession)return Promise.resolve(null);
      if(!coreReady(lastSession,getGeneration(),cancelEpoch))return Promise.resolve({quarantined:true});
      if(inFlight){
        if(reason==='mutation'||runningUserId!==lastSession.user.id||runningGeneration!==getGeneration())rerunRequested=true;
        return inFlight;
      }
      inFlight=(async()=>{
        let result={error:true};
        do{
          rerunRequested=false;
          const runningSession=lastSession,generation=getGeneration(),epoch=cancelEpoch;
          runningUserId=runningSession.user.id;runningGeneration=generation;
          try{result=await syncNow(runningSession);}
          catch(error){notify(error?.offline?'waiting':'failed',runningSession,generation,epoch);scheduleRetry(runningSession,generation,epoch);return {error:true,offline:Boolean(error?.offline)};}
        }while(rerunRequested);
        return result;
      })().finally(()=>{inFlight=null;runningUserId=null;runningGeneration=null;});
      return inFlight;
    };
    return Object.freeze({inspectCloud,initializeFromDevice,initializeEmpty,activateCloud,sync,schedule:reason=>sync(lastSession||(typeof deps.getSession==='function'?deps.getSession():null),reason),cancel:()=>{cancelEpoch++;markNotReady();clearTimer(timer);timer=null;attempt=0;rerunRequested=false;}});
  }

  root.AccountClient=AccountClient;
  root.CommunityClient=AccountClient;
  root.LiangliAccountSync=Object.freeze({CORE_STATE_VERSION,CORE_SYNC_TYPES,CORE_REMOTE_TABLES,CORE_MANIFEST_TABLE,coreStorageKey,normalizeCoreState,migrateLegacyCoreState,serializeCoreRecovery,parseCoreRecovery,createCoreRecoveryStore,prepareDeviceUploadState,readAnonymousCoreState,createAccountReconciliationGate,mergeCoreEntity,coalesceCoreOps,createCoreSyncController,createOwnerRestClient,AccountClient});
  if(typeof module!=='undefined'&&module.exports)module.exports=root.LiangliAccountSync;
})(typeof window==='undefined'?globalThis:window);
