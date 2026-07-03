#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const APP_MODULE_TS = `import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
`;

const MAIN_TS = `import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  await app.listen(process.env.PORT ?? 4000);
}

bootstrap();
`;

const ALLOWED_ROOT_ENTRIES = new Set([
  'apps',
  'packages',
  'node_modules',
  'package.json',
  'package-lock.json',
  'turbo.json',
  'turbo.jsonc',
  'README.md',
  'tsconfig.json',
]);

function parseArgs(argv) {
  const args = {};
  for (const raw of argv) {
    const m = raw.match(/^--([^=]+)(?:=(.*))?$/);
    if (m) args[m[1]] = m[2] !== undefined ? m[2] : true;
  }
  return args;
}

function log(step, msg) {
  console.log(`\n[${step}] ${msg}`);
}
function ok(msg) {
  console.log(`  ✔ ${msg}`);
}
function fail(msg) {
  console.error(`\n✘ ${msg}`);
  process.exit(1);
}
function exists(p) {
  return fs.existsSync(p);
}
function run(cmd, cmdArgs, cwd) {
  execFileSync(cmd, cmdArgs, { cwd, stdio: 'inherit' });
}
function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}
function writeJson(p, obj) {
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n');
}

function checkPrerequisites() {
  for (const bin of ['node', 'npm', 'npx']) {
    try {
      execFileSync(bin, ['--version'], { stdio: 'ignore' });
    } catch {
      fail(`Ferramenta obrigatoria nao encontrada no PATH: ${bin}`);
    }
  }
}

function checkNamespace(ns) {
  if (!/^@[a-z0-9][a-z0-9._-]*$/.test(ns)) {
    fail(
      `Namespace invalido: "${ns}". Use um escopo npm valido em minusculas, ex.: @minha-org`
    );
  }
}

function checkTargetDir(dir) {
  if (!exists(dir)) fail(`Diretorio alvo nao existe: ${dir}`);
  if (!fs.statSync(dir).isDirectory()) fail(`Alvo nao e um diretorio: ${dir}`);

  const dangerous = new Set([path.resolve('/'), path.resolve(os.homedir())]);
  if (dangerous.has(dir)) {
    fail(
      `Recusando executar em um diretorio perigoso (${dir}). Rode dentro de uma pasta de projeto dedicada.`
    );
  }

  const unexpected = fs
    .readdirSync(dir)
    .filter((e) => !e.startsWith('.') && !ALLOWED_ROOT_ENTRIES.has(e));
  if (unexpected.length > 0) {
    fail(
      `O diretorio alvo (${dir}) contem itens nao esperados para uma configuracao do zero: ${unexpected.join(', ')}.\n` +
        `Remova-os ou rode esta skill em uma pasta vazia (arquivos ocultos como .git/.claude/.agents sao ignorados).`
    );
  }
}

// create-turbo se recusa a rodar em pastas nao vazias; escaneia em uma
// subpasta temporaria isolada e depois move o conteudo para o alvo, assim
// arquivos ocultos ja existentes (.git, .claude, .agents) nao atrapalham.
function stepScaffoldTurbo(targetDir) {
  if (exists(path.join(targetDir, 'turbo.json'))) {
    log('1/12', 'Turborepo ja inicializado, pulando.');
    return;
  }
  log('1/12', 'Criando monorepo com create-turbo...');
  const tempDir = path.join(targetDir, '.cpf-turbo-tmp');
  if (exists(tempDir)) {
    fail(`Diretorio temporario ja existe: ${tempDir}. Remova-o e rode novamente.`);
  }
  fs.mkdirSync(tempDir);
  try {
    const projectName = path.basename(targetDir) || 'projeto';
    run('npx', ['create-turbo@latest', projectName, '-m', 'npm'], tempDir);
    const scaffolded = path.join(tempDir, projectName);
    if (!exists(scaffolded)) fail(`create-turbo nao gerou a pasta esperada: ${scaffolded}`);
    for (const entry of fs.readdirSync(scaffolded)) {
      const dest = path.join(targetDir, entry);
      if (exists(dest)) fs.rmSync(dest, { recursive: true, force: true });
      fs.renameSync(path.join(scaffolded, entry), dest);
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  ok('Turborepo criado.');
}

function stepClearDefaultApps(targetDir) {
  const appsDir = path.join(targetDir, 'apps');
  const frontendDir = path.join(appsDir, 'frontend');
  const backendDir = path.join(appsDir, 'backend');
  if (exists(frontendDir) || exists(backendDir)) {
    log('2/12', 'apps/frontend ou apps/backend ja presentes, pulando limpeza dos apps padrao.');
    return;
  }
  if (!exists(appsDir)) fail(`Pasta apps/ nao encontrada apos create-turbo em ${appsDir}`);
  log('2/12', 'Removendo apps de exemplo do Turborepo (apps/*)...');
  for (const entry of fs.readdirSync(appsDir)) {
    fs.rmSync(path.join(appsDir, entry), { recursive: true, force: true });
  }
  ok('Apps de exemplo removidos.');
}

function stepCreateFrontend(appsDir) {
  const frontendDir = path.join(appsDir, 'frontend');
  if (exists(frontendDir)) {
    log('3/12', 'apps/frontend ja existe, pulando.');
    return;
  }
  log('3/12', 'Criando app Next.js (frontend)...');
  run('npx', ['create-next-app@latest', 'frontend', '--yes', '--src-dir'], appsDir);
  if (!exists(frontendDir)) fail('create-next-app nao gerou apps/frontend.');
  ok('Frontend criado.');
}

function stepEnsureNestCli() {
  try {
    execFileSync('nest', ['--version'], { stdio: 'ignore' });
    log('4/12', 'Nest CLI ja instalado globalmente, pulando.');
    return;
  } catch {
    // segue para instalar
  }
  log('4/12', 'Instalando @nestjs/cli globalmente...');
  run('npm', ['i', '-g', '@nestjs/cli'], undefined);
  ok('Nest CLI instalado.');
}

function stepCreateBackend(appsDir) {
  const backendDir = path.join(appsDir, 'backend');
  if (exists(backendDir)) {
    log('5/12', 'apps/backend ja existe, pulando.');
    return;
  }
  log('5/12', 'Criando app NestJS (backend)...');
  run('nest', ['new', 'backend', '-g', '-p', 'npm'], appsDir);
  if (!exists(backendDir)) fail('nest new nao gerou apps/backend.');
  ok('Backend criado.');
}

function stepInstallNestConfig(backendDir) {
  const pkgPath = path.join(backendDir, 'package.json');
  const pkg = readJson(pkgPath);
  if (pkg.dependencies && pkg.dependencies['@nestjs/config']) {
    log('6/12', '@nestjs/config ja instalado, pulando.');
    return;
  }
  log('6/12', 'Instalando @nestjs/config...');
  run('npm', ['install', '@nestjs/config'], backendDir);
  ok('@nestjs/config instalado.');
}

function stepWriteAppModule(backendDir) {
  log('7/12', 'Configurando ConfigModule global em app.module.ts...');
  fs.writeFileSync(path.join(backendDir, 'src', 'app.module.ts'), APP_MODULE_TS);
  ok('app.module.ts configurado.');
}

function stepWriteMain(backendDir) {
  log('8/12', 'Configurando main.ts (porta 4000 + CORS)...');
  fs.writeFileSync(path.join(backendDir, 'src', 'main.ts'), MAIN_TS);
  ok('main.ts configurado.');
}

function stepAddDevScript(backendDir) {
  log('9/12', 'Adicionando script "dev" ao package.json do backend...');
  const pkgPath = path.join(backendDir, 'package.json');
  const pkg = readJson(pkgPath);
  pkg.scripts = pkg.scripts || {};
  pkg.scripts.dev = 'nest start --watch';
  writeJson(pkgPath, pkg);
  ok('Script "dev" adicionado.');
}

function stepFrontendEnv(frontendDir) {
  log('10/12', 'Criando .env.example e .env do frontend...');
  const examplePath = path.join(frontendDir, '.env.example');
  const envPath = path.join(frontendDir, '.env');
  fs.writeFileSync(examplePath, 'NEXT_PUBLIC_API_URL=http://localhost:4000\n');
  if (!exists(envPath)) fs.copyFileSync(examplePath, envPath);
  ok('.env do frontend pronto.');
}

function stepBackendEnv(backendDir) {
  log('11/12', 'Criando .env.example e .env do backend...');
  const examplePath = path.join(backendDir, '.env.example');
  const envPath = path.join(backendDir, '.env');
  fs.writeFileSync(examplePath, 'PORT=4000\n');
  if (!exists(envPath)) fs.copyFileSync(examplePath, envPath);
  ok('.env do backend pronto.');
}

function findPackageJsonFiles(targetDir) {
  const results = [];
  const rootPkg = path.join(targetDir, 'package.json');
  if (exists(rootPkg)) results.push(rootPkg);
  for (const group of ['apps', 'packages']) {
    const groupDir = path.join(targetDir, group);
    if (!exists(groupDir)) continue;
    for (const entry of fs.readdirSync(groupDir)) {
      const pkgPath = path.join(groupDir, entry, 'package.json');
      if (exists(pkgPath)) results.push(pkgPath);
    }
  }
  return results;
}

// Renomeia todo package.json local para o namespace informado (raiz vira o
// proprio namespace, cada app/pacote vira "<namespace>/<pasta>") e depois
// reescreve as dependencias internas que apontavam para os nomes antigos,
// para nao quebrar a resolucao dos workspaces.
function stepApplyNamespace(targetDir, namespace) {
  log('12/12*', `Aplicando namespace ${namespace} aos pacotes do monorepo...`);
  const pkgPaths = findPackageJsonFiles(targetDir);
  const renameMap = new Map();

  for (const pkgPath of pkgPaths) {
    const pkg = readJson(pkgPath);
    const isRoot = path.dirname(pkgPath) === targetDir;
    const newName = isRoot
      ? namespace
      : `${namespace}/${path.basename(path.dirname(pkgPath))}`;
    if (pkg.name) renameMap.set(pkg.name, newName);
    pkg.name = newName;
    writeJson(pkgPath, pkg);
  }

  for (const pkgPath of pkgPaths) {
    const pkg = readJson(pkgPath);
    let changed = false;
    for (const field of ['dependencies', 'devDependencies', 'peerDependencies']) {
      const deps = pkg[field];
      if (!deps) continue;
      for (const [depName, version] of Object.entries(deps)) {
        const newDepName = renameMap.get(depName);
        if (newDepName && newDepName !== depName) {
          delete deps[depName];
          deps[newDepName] = version;
          changed = true;
        }
      }
    }
    if (changed) writeJson(pkgPath, pkg);
  }
  ok('Namespace aplicado a todos os pacotes locais.');
}

function stepVerify(targetDir, namespace) {
  log('13/13', 'Verificando resultado final...');
  const frontendDir = path.join(targetDir, 'apps', 'frontend');
  const backendDir = path.join(targetDir, 'apps', 'backend');
  const mainTs = exists(path.join(backendDir, 'src', 'main.ts'))
    ? fs.readFileSync(path.join(backendDir, 'src', 'main.ts'), 'utf8')
    : '';
  const appModuleTs = exists(path.join(backendDir, 'src', 'app.module.ts'))
    ? fs.readFileSync(path.join(backendDir, 'src', 'app.module.ts'), 'utf8')
    : '';
  const backendPkg = exists(path.join(backendDir, 'package.json'))
    ? readJson(path.join(backendDir, 'package.json'))
    : {};

  const checks = [
    ['apps/frontend existe', exists(frontendDir)],
    ['apps/backend existe', exists(backendDir)],
    [
      'frontend .env com NEXT_PUBLIC_API_URL=http://localhost:4000',
      exists(path.join(frontendDir, '.env')) &&
        fs.readFileSync(path.join(frontendDir, '.env'), 'utf8').includes('NEXT_PUBLIC_API_URL=http://localhost:4000'),
    ],
    [
      'backend .env com PORT=4000',
      exists(path.join(backendDir, '.env')) &&
        fs.readFileSync(path.join(backendDir, '.env'), 'utf8').includes('PORT=4000'),
    ],
    ['main.ts escuta process.env.PORT ?? 4000', mainTs.includes('process.env.PORT ?? 4000')],
    ['main.ts com CORS habilitado', mainTs.includes('app.enableCors()')],
    ['app.module.ts com ConfigModule global', appModuleTs.includes('ConfigModule.forRoot(') && appModuleTs.includes('isGlobal: true')],
    ['backend package.json com script "dev"', backendPkg.scripts?.dev === 'nest start --watch'],
    ['backend com @nestjs/config instalado', !!backendPkg.dependencies?.['@nestjs/config']],
  ];

  let allOk = true;
  for (const [labelText, passed] of checks) {
    console.log(`  ${passed ? '✔' : '✘'} ${labelText}`);
    if (!passed) allOk = false;
  }
  if (!allOk) fail('Verificacao final falhou. Revise os itens marcados com ✘ acima.');

  console.log('\nProjeto configurado com sucesso.');
  console.log('  Frontend: cd apps/frontend && npm run dev  -> http://localhost:3000');
  console.log('  Backend:  cd apps/backend  && npm run dev  -> http://localhost:4000');
  if (namespace) console.log(`  Namespace aplicado: ${namespace}`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const targetDir = path.resolve(args.dir || process.cwd());
  const namespace = typeof args.namespace === 'string' ? args.namespace : null;

  checkPrerequisites();
  if (namespace) checkNamespace(namespace);
  checkTargetDir(targetDir);

  const appsDir = path.join(targetDir, 'apps');
  const frontendDir = path.join(appsDir, 'frontend');
  const backendDir = path.join(appsDir, 'backend');

  stepScaffoldTurbo(targetDir);
  stepClearDefaultApps(targetDir);
  stepCreateFrontend(appsDir);
  stepEnsureNestCli();
  stepCreateBackend(appsDir);
  stepInstallNestConfig(backendDir);
  stepWriteAppModule(backendDir);
  stepWriteMain(backendDir);
  stepAddDevScript(backendDir);
  stepFrontendEnv(frontendDir);
  stepBackendEnv(backendDir);
  if (namespace) stepApplyNamespace(targetDir, namespace);
  stepVerify(targetDir, namespace);
}

main();
