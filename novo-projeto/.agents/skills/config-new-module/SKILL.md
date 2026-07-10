---
name: config-new-module
description: >-
  Cria, de forma deterministica, um novo modulo de negocio dentro de
  modules/<nome-do-modulo> em um monorepo Turborepo (gerado pela skill
  config-project-fullstack), com estrutura pre-definida (jest.config.ts,
  tsconfig.json, package.json, index.ts, index.test.ts), registra o modulo
  como dependencia em apps/frontend e apps/backend, garante ts-node no raiz e
  "modules/*" em workspaces, instala dependencias, builda o projeto e roda os
  testes do modulo. Alem disso, gera um modulo NestJS equivalente em
  apps/backend/src/modules/<nome-do-modulo> (Module + Controller com endpoint
  GET retornando uma mensagem padrao) e o registra em AppModule. Use quando o
  usuario pedir para criar/adicionar um novo modulo de negocio (ex.: auth,
  transaction) dentro da pasta modules.
---

# Config Novo Modulo

Automatiza, via script Node.js deterministico, a criacao de um novo modulo em
`modules/<nome-do-modulo>` dentro de um monorepo Turborepo + Next.js + NestJS,
e de um modulo NestJS correspondente em
`apps/backend/src/modules/<nome-do-modulo>`, ja registrado em `AppModule` e
exposto via endpoint HTTP.

Toda a logica vive em
[`scripts/create-module.js`](scripts/create-module.js) — nao reimplemente os
passos manualmente. Sempre invoque o script. Os arquivos do modulo de negocio
sao copiados literalmente da pasta [`assets/`](assets) (fonte unica de
verdade da estrutura pre-definida); o Module/Controller do NestJS sao gerados
a partir dos templates
[`assets/nest-module.ts.template`](assets/nest-module.ts.template) e
[`assets/nest-controller.ts.template`](assets/nest-controller.ts.template).

## Requisito obrigatorio: namespace

**Nunca execute esta skill sem o namespace informado.** Se o usuario nao
disser qual `--namespace` (escopo npm, ex.: `@meu-projeto`) usar, pergunte
antes de rodar o script — nao assuma um valor. O script tambem recusa rodar
sem `--namespace`.

## Quando usar

- Pedido para criar um novo modulo de negocio (ex.: "cria o modulo de auth",
  "adiciona um modulo de transaction") dentro da pasta `modules` de um
  projeto ja gerado pela skill `config-project-fullstack`.

## Como executar

Rode a partir da raiz do projeto (onde estao `package.json`, `apps/` e,
opcionalmente, `modules/`):

```bash
node .agents/skills/config-new-module/scripts/create-module.js --name=<nome-do-modulo> --namespace=@escopo [--dir=<caminho>]
```

- `--name=<nome-do-modulo>` (obrigatorio): nome do modulo em kebab-case
  minusculo, iniciando por letra (ex.: `auth`, `user-profile`). Vira a pasta
  `modules/<nome-do-modulo>` e o pacote `<namespace>/<nome-do-modulo>`.
- `--namespace=@escopo` (obrigatorio): escopo npm ja aplicado ao monorepo
  (ex.: `@meu-projeto`). Usado para nomear o pacote do modulo e a dependencia
  adicionada em frontend/backend.
- `--dir=<caminho>` (opcional): diretorio alvo (raiz do monorepo). Padrao:
  diretorio atual.

Nao passe flags alem dessas.

## Garantias do script

1. **Verificacao de pre-requisitos**: aborta se `node`/`npm` nao estiverem no
   PATH, se `--namespace` ou `--name` nao forem informados/validos, ou se
   `apps/frontend`/`apps/backend` nao existirem (a skill
   `config-project-fullstack` precisa ter rodado antes).
2. **Estrutura deterministica**: os 5 arquivos do modulo
   (`jest.config.ts`, `tsconfig.json`, `package.json`, `index.ts`,
   `index.test.ts`) sao copiados literalmente de `assets/`; apenas o campo
   `name` do `package.json` copiado e ajustado para
   `<namespace>/<nome-do-modulo>`.
3. **Integracao automatica**: adiciona
   `"<namespace>/<nome-do-modulo>": "*"` em `dependencies` de
   `apps/frontend/package.json` e `apps/backend/package.json`; garante
   `"ts-node": "^10.9.2"` em `devDependencies` do `package.json` raiz; garante
   `"modules/*"` em `workspaces` do `package.json` raiz.
4. **Modulo NestJS deterministico**: cria
   `apps/backend/src/modules/<nome-do-modulo>/<nome-do-modulo>.module.ts` e
   `apps/backend/src/modules/<nome-do-modulo>/<nome-do-modulo>.controller.ts`
   a partir dos templates de `assets/`, com um `@Controller('<nome-do-modulo>')`
   expondo um endpoint `GET` que retorna uma mensagem padrao
   (`"<NomeDoModulo> module up and running."`), e registra o novo `Module`
   (import + entrada em `imports: []`) em
   `apps/backend/src/app.module.ts`. Nenhum teste e criado para este modulo
   NestJS.
5. **Idempotente nos ajustes de config**: cada ajuste (ts-node, workspaces,
   dependencia nos apps, registro do modulo NestJS em `app.module.ts`)
   verifica se ja esta presente antes de escrever de novo; os 5 arquivos do
   modulo de negocio e os 2 arquivos do modulo NestJS sao sempre
   sobrescritos com a versao de `assets/` (garante consistencia se a skill
   rodar de novo).
6. **Instalacao, build e teste automaticos**: ao final, roda `npm install` na
   raiz, `npm run build` na raiz (via Turborepo, o que inclui o build do
   backend com o novo modulo) e `npm test` dentro do modulo de negocio
   criado.
7. **Verificacao final**: confere que todos os arquivos do modulo de negocio
   e do modulo NestJS existem, o `package.json` do modulo tem o `name`
   correto, `workspaces` e `devDependencies` do raiz estao corretos, as
   dependencias foram adicionadas em frontend/backend e o modulo NestJS foi
   importado e registrado em `AppModule`. Se algo falhar, o script termina
   com codigo de saida != 0 e lista o que falhou.

## Passo a passo reproduzido internamente

1. Garante que `modules/` existe (cria se necessario).
2. Cria `modules/<nome-do-modulo>/` e copia `jest.config.ts`, `tsconfig.json`,
   `package.json`, `index.ts`, `index.test.ts` de `assets/`; ajusta o `name`
   do `package.json` copiado para `<namespace>/<nome-do-modulo>`.
3. Adiciona `"<namespace>/<nome-do-modulo>": "*"` em `dependencies` de
   `apps/frontend/package.json` e `apps/backend/package.json`.
4. Garante `"ts-node": "^10.9.2"` em `devDependencies` do `package.json`
   raiz.
5. Garante `"modules/*"` em `workspaces` do `package.json` raiz (inserido
   apos `"apps/*"`, se existir).
6. Cria `apps/backend/src/modules/<nome-do-modulo>/<nome-do-modulo>.module.ts`
   e `apps/backend/src/modules/<nome-do-modulo>/<nome-do-modulo>.controller.ts`
   a partir dos templates `nest-module.ts.template` e
   `nest-controller.ts.template` de `assets/` (placeholders `@@PascalName@@` e
   `@@kebabName@@` substituidos pelo nome do modulo).
7. Registra o novo `Module` em `apps/backend/src/app.module.ts`: adiciona o
   `import` no topo do arquivo e a entrada correspondente em `imports: []` do
   `@Module({...})` do `AppModule` (pula se ja estiver registrado).
8. Roda `npm install` na raiz do projeto.
9. Roda `npm run build` na raiz do projeto.
10. Roda `npm test` dentro de `modules/<nome-do-modulo>`.
11. Roda a verificacao final descrita acima.
