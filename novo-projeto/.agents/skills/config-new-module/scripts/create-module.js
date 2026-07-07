#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ASSETS_DIR = path.join(__dirname, '..', 'assets');
const ASSET_FILES = [
  'jest.config.ts',
  'tsconfig.json',
  'package.json',
  'index.ts',
  'index.test.ts',
];

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
  for (const bin of ['node', 'npm']) {
    try {
      execFileSync(bin, ['--version'], { stdio: 'ignore' });
    } catch {
      fail(`Ferramenta obrigatoria nao encontrada no PATH: ${bin}`);
    }
  }
}

function checkNamespace(ns) {
  if (!ns) {
    fail(
      'Namespace nao informado. Rode novamente com --namespace=@escopo (ex.: @meu-projeto). ' +
        'Esta skill nao pode ser executada sem um namespace.'
    );
  }
  if (!/^@[a-z0-9][a-z0-9._-]*$/.test(ns)) {
    fail(
      `Namespace invalido: "${ns}". Use um escopo npm valido em minusculas, ex.: @meu-projeto`
    );
  }
}

function checkModuleName(name) {
  if (!name) {
    fail('Nome do modulo nao informado. Rode novamente com --name=<nome-do-modulo> (ex.: auth).');
  }
  if (!/^[a-z][a-z0-9-]*$/.test(name)) {
    fail(
      `Nome de modulo invalido: "${name}". Use kebab-case em minusculas, iniciando por letra (ex.: auth, user-profile).`
    );
  }
}

function checkTargetDir(dir) {
  if (!exists(dir)) fail(`Diretorio alvo nao existe: ${dir}`);
  const rootPkgPath = path.join(dir, 'package.json');
  if (!exists(rootPkgPath)) {
    fail(
      `package.json nao encontrado em ${dir}. Rode esta skill na raiz do monorepo (apos a skill config-project-fullstack).`
    );
  }
  const appsDir = path.join(dir, 'apps');
  const frontendDir = path.join(appsDir, 'frontend');
  const backendDir = path.join(appsDir, 'backend');
  if (!exists(frontendDir) || !exists(backendDir)) {
    fail(
      `apps/frontend e/ou apps/backend nao encontrados em ${dir}. ` +
        'Rode a skill config-project-fullstack antes de criar um modulo.'
    );
  }
}

function stepEnsureModulesDir(targetDir) {
  const modulesDir = path.join(targetDir, 'modules');
  if (exists(modulesDir)) {
    log('1/8', 'Pasta modules/ ja existe, pulando criacao.');
  } else {
    log('1/8', 'Criando pasta modules/...');
    fs.mkdirSync(modulesDir);
    ok('Pasta modules/ criada.');
  }
  return modulesDir;
}

function stepCopyAssets(moduleDir, namespace, moduleName) {
  log('2/8', `Copiando arquivos do modulo para modules/${moduleName}/...`);
  fs.mkdirSync(moduleDir, { recursive: true });
  for (const file of ASSET_FILES) {
    fs.copyFileSync(path.join(ASSETS_DIR, file), path.join(moduleDir, file));
  }
  const pkgPath = path.join(moduleDir, 'package.json');
  const pkg = readJson(pkgPath);
  pkg.name = `${namespace}/${moduleName}`;
  writeJson(pkgPath, pkg);
  ok(`Arquivos copiados e package.json com name "${pkg.name}".`);
}

function stepAddDependencyToApps(targetDir, namespace, moduleName) {
  log('3/8', 'Adicionando dependencia do modulo em apps/frontend e apps/backend...');
  const depName = `${namespace}/${moduleName}`;
  for (const app of ['frontend', 'backend']) {
    const pkgPath = path.join(targetDir, 'apps', app, 'package.json');
    const pkg = readJson(pkgPath);
    pkg.dependencies = pkg.dependencies || {};
    pkg.dependencies[depName] = '*';
    writeJson(pkgPath, pkg);
  }
  ok(`Dependencia "${depName}": "*" adicionada em frontend e backend.`);
}

function stepEnsureTsNodeInRoot(rootPkgPath) {
  log('4/8', 'Garantindo ts-node no devDependencies do package.json raiz...');
  const pkg = readJson(rootPkgPath);
  pkg.devDependencies = pkg.devDependencies || {};
  if (pkg.devDependencies['ts-node']) {
    ok('ts-node ja presente no raiz, pulando.');
    return;
  }
  pkg.devDependencies['ts-node'] = '^10.9.2';
  writeJson(rootPkgPath, pkg);
  ok('ts-node adicionado ao devDependencies do raiz.');
}

function stepEnsureModulesWorkspace(rootPkgPath) {
  log('5/8', 'Garantindo "modules/*" em workspaces do package.json raiz...');
  const pkg = readJson(rootPkgPath);
  pkg.workspaces = pkg.workspaces || [];
  if (pkg.workspaces.includes('modules/*')) {
    ok('"modules/*" ja presente em workspaces, pulando.');
    return;
  }
  const appsIdx = pkg.workspaces.indexOf('apps/*');
  if (appsIdx === -1) {
    pkg.workspaces.push('modules/*');
  } else {
    pkg.workspaces.splice(appsIdx + 1, 0, 'modules/*');
  }
  writeJson(rootPkgPath, pkg);
  ok('"modules/*" adicionado a workspaces.');
}

function stepInstall(targetDir) {
  log('6/8', 'Instalando dependencias do projeto (npm install)...');
  run('npm', ['install'], targetDir);
  ok('Dependencias instaladas.');
}

function stepBuild(targetDir) {
  log('7/8', 'Rodando build do projeto (npm run build)...');
  run('npm', ['run', 'build'], targetDir);
  ok('Build concluido.');
}

function stepTestModule(moduleDir, moduleName) {
  log('8/8', `Rodando testes do modulo ${moduleName}...`);
  run('npm', ['test'], moduleDir);
  ok('Testes do modulo passaram.');
}

function stepVerify(targetDir, namespace, moduleName) {
  log('verify', 'Verificando resultado final...');
  const moduleDir = path.join(targetDir, 'modules', moduleName);
  const rootPkg = readJson(path.join(targetDir, 'package.json'));
  const frontendPkg = readJson(path.join(targetDir, 'apps', 'frontend', 'package.json'));
  const backendPkg = readJson(path.join(targetDir, 'apps', 'backend', 'package.json'));
  const depName = `${namespace}/${moduleName}`;

  const checks = [
    [`modules/${moduleName} existe`, exists(moduleDir)],
    ...ASSET_FILES.map((file) => [
      `modules/${moduleName}/${file} existe`,
      exists(path.join(moduleDir, file)),
    ]),
    [
      `modules/${moduleName}/package.json com name "${depName}"`,
      readJson(path.join(moduleDir, 'package.json')).name === depName,
    ],
    ['workspaces raiz contem "modules/*"', (rootPkg.workspaces || []).includes('modules/*')],
    ['ts-node no devDependencies raiz', !!rootPkg.devDependencies?.['ts-node']],
    [`frontend depende de "${depName}"`, frontendPkg.dependencies?.[depName] === '*'],
    [`backend depende de "${depName}"`, backendPkg.dependencies?.[depName] === '*'],
  ];

  let allOk = true;
  for (const [labelText, passed] of checks) {
    console.log(`  ${passed ? '✔' : '✘'} ${labelText}`);
    if (!passed) allOk = false;
  }
  if (!allOk) fail('Verificacao final falhou. Revise os itens marcados com ✘ acima.');

  console.log(`\nModulo "${moduleName}" criado e configurado com sucesso em modules/${moduleName}.`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const targetDir = path.resolve(args.dir || process.cwd());
  const namespace = typeof args.namespace === 'string' ? args.namespace : null;
  const moduleName = typeof args.name === 'string' ? args.name : null;

  checkPrerequisites();
  checkNamespace(namespace);
  checkModuleName(moduleName);
  checkTargetDir(targetDir);

  const rootPkgPath = path.join(targetDir, 'package.json');
  const modulesDir = stepEnsureModulesDir(targetDir);
  const moduleDir = path.join(modulesDir, moduleName);

  stepCopyAssets(moduleDir, namespace, moduleName);
  stepAddDependencyToApps(targetDir, namespace, moduleName);
  stepEnsureTsNodeInRoot(rootPkgPath);
  stepEnsureModulesWorkspace(rootPkgPath);
  stepInstall(targetDir);
  stepBuild(targetDir);
  stepTestModule(moduleDir, moduleName);
  stepVerify(targetDir, namespace, moduleName);
}

main();
