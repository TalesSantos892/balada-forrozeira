// Execute localmente: node GERAR_HASH_SENHA.js
// Não envie a senha nem este resultado para o repositório.
const crypto=require('node:crypto');
const readline=require('node:readline');
const rl=readline.createInterface({input:process.stdin,output:process.stdout});
rl.question('Digite a senha administrativa (não aparecerá no GitHub): ',password=>{
 const salt=crypto.randomBytes(16);
 const hash=crypto.scryptSync(password,salt,64);
 console.log('\nADMIN_PASSWORD_HASH=scrypt:'+salt.toString('hex')+':'+hash.toString('hex'));
 rl.close();
});
