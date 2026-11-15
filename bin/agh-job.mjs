import {runJob} from '../src/agh-runner.mjs';
runJob(process.argv[2],{recoverOnly:process.argv.includes('--recover')}).then(r=>console.log(JSON.stringify({status:r.status,sessionId:r.sessionId,businessStatus:r.businessStatus,usage:r.usage?.totals}))).catch(e=>{console.error(e.stack);process.exitCode=1;});
