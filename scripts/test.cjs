const {readdirSync}=require('node:fs');
const {spawnSync}=require('node:child_process');
let failed=false;
for(const file of readdirSync('tests').filter(file=>/^test_.*\.js$/.test(file))){
  const result=spawnSync(process.execPath,['tests/'+file],{stdio:'inherit'});if(result.status!==0)failed=true;
}
const py=spawnSync('python3',['-m','unittest','discover','-s','tests','-p','test_*.py'],{stdio:'inherit'});if(py.status!==0)failed=true;
process.exitCode=failed?1:0;
